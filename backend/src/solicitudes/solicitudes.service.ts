import { Prisma, CategoriaSolicitud, RolUsuario, Solicitud } from '@prisma/client';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { UsuarioAutenticado } from '../auth/interfaces/usuario-autenticado.interface';
import { filtroDeAcceso } from './politicas/filtro-de-acceso';
import { Reloj } from '../common/reloj/reloj';
import { calendarioLaboralColombia } from './reglas/calendario-colombia';
import {
  evaluarHorario,
  type FranjaSolicitada,
  MENSAJES_ERROR_HORARIO,
} from './reglas/horario.validator';
import { ESTADOS_QUE_LIBERAN_FRANJA, ocupaFranja } from './reglas/estados';
import {
  ESTADO_INICIAL,
  evaluarTransicion,
  type Accion,
  type MotivoTransicionInvalida,
} from './reglas/maquina-estados';
import { aMomentoLocal } from './reglas/zona-horaria';
import { esViolacionDeTraslapeCa06, MENSAJE_CA06 } from './errores/traslape-ca06';
import {
  DetalleSolicitud,
  SELECT_DETALLE_SOLICITANTE,
  SELECT_DETALLE_STAFF,
} from './proyecciones/detalle-solicitud.proyeccion';

/** Mensaje único para "no existe" y "no es tuyo" (Decisión H: anti-enumeración). */
export const MENSAJE_SOLICITUD_NO_ENCONTRADA = 'Solicitud no encontrada.';

/**
 * Fase 5 · E2: un mensaje por cada motivo de la máquina de estados. Record sobre la
 * unión: si la máquina gana un motivo nuevo sin mensaje aquí, tsc falla.
 */
export const MENSAJES_TRANSICION_INVALIDA: Record<MotivoTransicionInvalida, string> = {
  ESTADO_DESCONOCIDO: 'El estado registrado de la solicitud no es válido; no se aplican cambios.',
  MISMO_ESTADO: 'La solicitud ya se encuentra en ese estado.',
  ESTADO_FINAL: 'La solicitud está en un estado final y no admite cambios de estado.',
  TRANSICION_NO_DEFINIDA: 'Transición de estado no permitida desde el estado actual.',
  ROL_NO_AUTORIZADO: 'Esta transición le corresponde al solicitante.',
};

/** E1: proponer una nueva franja necesita su propio endpoint (CA-10), no el tablero. */
export const MENSAJE_USAR_REPROGRAMACION =
  'Para proponer una nueva fecha use la reprogramación: POST /solicitudes/:radicado/reprogramacion.';

/** D2: fuera de "Recibido", la franja solo cambia por mutuo acuerdo (CA-10). */
export const MENSAJE_FECHAS_SOLO_EN_RECIBIDO =
  'Las fechas solo se editan mientras la solicitud está en "Recibido". Para una solicitud validada, proponga una reprogramación.';

/** D7: fail-closed, no se aprueba una franja que ya comenzó. */
export const MENSAJE_FRANJA_VENCIDA =
  'No se puede aprobar una solicitud cuya franja ya inició o pasó. Reprográmela antes de aprobarla.';

/** E5: el log nunca guarda motivos de rechazo huérfanos. */
export const MENSAJE_MOTIVO_SOLO_EN_RECHAZO =
  'El motivo de rechazo solo se admite al cambiar el estado a "Rechazado".';

/** E1: las únicas acciones del STAFF que se ejecutan desde el tablero (PATCH). */
const ACCIONES_DEL_TABLERO: ReadonlySet<Accion> = new Set<Accion>([
  'APROBAR',
  'RECHAZAR',
  'INICIAR_PRODUCCION',
  'FINALIZAR',
]);

@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  async create(createSolicitudeDto: CreateSolicitudeDto, idUsuario: string) {
    // Decisión D-U: un único "ahora" por petición. Validación, urgencia y año
    // del radicado corresponden al MISMO instante (sin carrera a medianoche).
    const ahora = this.reloj.ahora();

    // --- 1. Reglas de horario puras (Fase 3): CA-04, pasado, mismo día, día
    // hábil y urgencia por 5 días hábiles. Van ANTES de CA-06: una entrada
    // inválida se rechaza sin consultar la base de datos.
    const horario = evaluarHorario(
      {
        inicio: createSolicitudeDto.fecha_inicio,
        fin: createSolicitudeDto.fecha_fin,
      },
      ahora,
      calendarioLaboralColombia,
    );
    if (!horario.valido) {
      throw new BadRequestException(MENSAJES_ERROR_HORARIO[horario.error]);
    }

    // --- 2. Mitigación M3: Anti-Traslape (CA-06), capa amable (409 único) ---
    if (
      await this.hayTraslape({
        inicio: createSolicitudeDto.fecha_inicio,
        fin: createSolicitudeDto.fecha_fin,
      })
    ) {
      throw new ConflictException(MENSAJE_CA06);
    }

    // --- 3. Generar Radicado (año de Bogotá, no el del servidor) ---
    const anioRadicacion = aMomentoLocal(ahora).fecha.anio;
    const radicadoGenerado = `EC-${anioRadicacion}-${Math.floor(1000 + Math.random() * 9000)}`;

    // --- 4. Persistencia con Relaciones Anidadas ---
    // La garantía real de CA-06 es la restricción de exclusión del motor (Fase 4):
    // si otra petición ganó la carrera entre el findFirst y este INSERT, PostgreSQL
    // rechaza con 23P01 y se responde el MISMO 409. El "return await" es necesario:
    // sin await, el rechazo escaparía del try/catch.
    try {
      return await this.prisma.solicitud.create({
        data: {
          radicado: radicadoGenerado,
          id_usuario: idUsuario,
          categoria: createSolicitudeDto.categoria as CategoriaSolicitud,
          proposito: createSolicitudeDto.proposito,
          fecha_inicio: createSolicitudeDto.fecha_inicio,
          fecha_fin: createSolicitudeDto.fecha_fin,
          estado: ESTADO_INICIAL,
          es_urgencia: horario.urgente,
        
          recursos: { 
            create: createSolicitudeDto.recursos?.map(recurso => ({
              id_recurso: recurso.id_recurso,
              cantidad_solicitada: recurso.cantidad
            })) || []
          }
        },
      });
    } catch (error: unknown) {
      return this.relanzarComoConflictoSiCa06(error, radicadoGenerado);
    }
  }

  /**
   * CA-06, capa amable: ¿hay otra solicitud ACTIVA que se cruce con la franja?
   * Intervalo semiabierto [inicio, fin), igual que la restricción del motor.
   * Minimización: solo se pide el radicado y nunca sale de este método.
   * excluirRadicado evita que una reprogramación choque consigo misma.
   */
  private async hayTraslape(franja: FranjaSolicitada, excluirRadicado?: string): Promise<boolean> {
    const conflicto = await this.prisma.solicitud.findFirst({
      where: {
        estado: { notIn: [...ESTADOS_QUE_LIBERAN_FRANJA] },
        AND: [{ fecha_inicio: { lt: franja.fin } }, { fecha_fin: { gt: franja.inicio } }],
        ...(excluirRadicado !== undefined ? { NOT: { radicado: excluirRadicado } } : {}),
      },
      select: { radicado: true },
    });
    return conflicto !== null;
  }

  /**
   * CA-06, red de seguridad: si el motor rechazó la escritura con NUESTRA
   * restricción (carrera concurrente), responde el MISMO 409 que la capa amable.
   * Cualquier otro error se relanza intacto (fail-closed → 500).
   */
  private relanzarComoConflictoSiCa06(error: unknown, radicado: string): never {
    if (esViolacionDeTraslapeCa06(error)) {
      // Métrica de concurrencia real. Solo el radicado PROPIO; nunca error.message
      // (su DETAIL contiene la franja de la otra reserva).
      this.logger.warn(
        `CA-06 resuelto por la restricción del motor (carrera concurrente): ${radicado} no se guardó.`,
      );
      throw new ConflictException(MENSAJE_CA06);
    }
    throw error;
  }

  async findMisSolicitudes(idUsuario: string) {
    return await this.prisma.solicitud.findMany({
      where: {
        id_usuario: idUsuario,
      },
      include: {
        recursos: {
          include: {
            recurso: {
              select: { nombre: true },
            },
          },
        },
      },
      orderBy: {
        fecha_inicio: 'desc', 
      },
    });
  }

  async findAll(estado?: string, categoria?: CategoriaSolicitud) {
    return await this.prisma.solicitud.findMany({
      where: {
        ...(estado ? { estado } : {}),
        ...(categoria ? { categoria } : {}),
      },
      include: {
        usuario: {
          select: { nombre: true, correo: true },
        },
        recursos: {
          include: {
            recurso: {
              select: { nombre: true },
            },
          },
        },
      },
      orderBy: {
        fecha_inicio: 'asc',
      },
    });
  }

  async findOne(radicado: string, usuario: UsuarioAutenticado): Promise<DetalleSolicitud> {
    // Decisión G: la propiedad se aplica DENTRO del WHERE (nunca se traen filas ajenas).
    const where: Prisma.SolicitudWhereInput = { radicado, ...filtroDeAcceso(usuario) };

    // Decisión I · fail-safe: cualquier rol distinto de STAFF recibe la proyección MÍNIMA.
    const solicitud =
      usuario.rol === RolUsuario.STAFF
        ? await this.prisma.solicitud.findFirst({ where, select: SELECT_DETALLE_STAFF })
        : await this.prisma.solicitud.findFirst({ where, select: SELECT_DETALLE_SOLICITANTE });

    // Decisión H: "no existe" y "no es tuyo" son indistinguibles (mismo código y mensaje).
    if (!solicitud) {
      throw new NotFoundException(MENSAJE_SOLICITUD_NO_ENCONTRADA);
    }

    return solicitud;
  }

  async update(
    radicado: string,
    updateSolicitudeDto: UpdateSolicitudeDto,
    idStaff: string,
  ): Promise<{ mensaje: string; solicitud: Solicitud }> {
    // Decisión D-U: un único "ahora" por petición.
    const ahora = this.reloj.ahora();

    const existente = await this.prisma.solicitud.findUnique({ where: { radicado } });
    if (!existente) {
      // H8 · ADR-002: el mismo 404 que findOne(), sin eco del radicado consultado.
      throw new NotFoundException(MENSAJE_SOLICITUD_NO_ENCONTRADA);
    }

    // Franja y estado EFECTIVOS: lo que quedará guardado. Una edición parcial se
    // combina con lo guardado ANTES de validar, nunca a ciegas (Fase 4.5 · U2).
    const franja: FranjaSolicitada = {
      inicio: updateSolicitudeDto.fecha_inicio ?? existente.fecha_inicio,
      fin: updateSolicitudeDto.fecha_fin ?? existente.fecha_fin,
    };
    const estadoFinal = updateSolicitudeDto.estado ?? existente.estado;
    const cambiaEstado = estadoFinal !== existente.estado;
    const cambianFechas =
      updateSolicitudeDto.fecha_inicio !== undefined || updateSolicitudeDto.fecha_fin !== undefined;

    // --- 1. E5: el motivo de rechazo solo acompaña un rechazo real.
    if (
      updateSolicitudeDto.motivo_rechazo !== undefined &&
      !(cambiaEstado && estadoFinal === 'Rechazado')
    ) {
      throw new BadRequestException(MENSAJE_MOTIVO_SOLO_EN_RECHAZO);
    }

    // --- 2. Máquina de estados (Fase 5): solo transiciones legales del STAFF y solo
    // las del tablero. Pedir el estado actual no es una transición (MISMO_ESTADO = sin cambio).
    const accion = cambiaEstado ? this.autorizarTransicionDelStaff(existente.estado, estadoFinal) : undefined;

    // --- 3. D2: la franja se edita solo mientras la solicitud sigue en "Recibido" (estado
    // GUARDADO). Permite el rescate atómico: fechas nuevas + aprobación en un solo PATCH.
    if (cambianFechas && existente.estado !== ESTADO_INICIAL) {
      throw new ConflictException(MENSAJE_FECHAS_SOLO_EN_RECIBIDO);
    }

    // --- 4. Reglas de horario SOLO si cambian las fechas: marcar "Entregado" una
    // reserva que ya ocurrió no debe fallar con EN_EL_PASADO (U1).
    let cambiosDeFranja: Prisma.SolicitudUpdateInput = {};
    if (cambianFechas) {
      const horario = evaluarHorario(franja, ahora, calendarioLaboralColombia);
      if (!horario.valido) {
        throw new BadRequestException(MENSAJES_ERROR_HORARIO[horario.error]);
      }
      // Opción A: la urgencia refleja la anticipación real al momento del cambio (U6).
      cambiosDeFranja = { fecha_inicio: franja.inicio, fecha_fin: franja.fin, es_urgencia: horario.urgente };
    }

    // --- 5. D7: fail-closed, no se aprueba una franja EFECTIVA que ya comenzó. Con fechas
    // nuevas, evaluarHorario ya exigió el futuro; sin ellas, esta es la única defensa.
    if (accion === 'APROBAR' && franja.inicio.getTime() <= ahora.getTime()) {
      throw new ConflictException(MENSAJE_FRANJA_VENCIDA);
    }

    // --- 6. CA-06, capa amable: solo si el resultado ocupa la franja y las fechas se
    // movieron. D1 eliminó la reactivación: los estados que liberan la franja son finales,
    // así que un cambio de estado ya no puede volver a ocuparla. Sin auto-colisión.
    if (ocupaFranja(estadoFinal) && cambianFechas && (await this.hayTraslape(franja, radicado))) {
      throw new ConflictException(MENSAJE_CA06);
    }

    // --- 7. Un único conjunto de cambios: estado y fechas se aplican JUNTOS (U5).
    const { recursos } = updateSolicitudeDto;
    const data: Prisma.SolicitudUpdateInput = {
      ...(updateSolicitudeDto.categoria !== undefined ? { categoria: updateSolicitudeDto.categoria } : {}),
      ...(updateSolicitudeDto.proposito !== undefined ? { proposito: updateSolicitudeDto.proposito } : {}),
      ...cambiosDeFranja,
      ...(cambiaEstado ? { estado: estadoFinal } : {}),
      ...(recursos !== undefined
        ? {
            recursos: {
              deleteMany: {},
              create: recursos.map((r) => ({
                id_recurso: r.id_recurso,
                cantidad_solicitada: r.cantidad,
              })),
            },
          }
        : {}),
    };

    // --- 8. Persistencia. Con cambio de estado: actualización + log en UNA
    // transacción (CA-09: hay log si y solo si cambió el estado). Sin cambio de
    // estado: una sola sentencia, ya atómica (también con los recursos anidados).
    try {
      if (!cambiaEstado) {
        const solicitud = await this.prisma.solicitud.update({ where: { radicado }, data });
        return { mensaje: 'Solicitud actualizada correctamente (sin cambio de estado)', solicitud };
      }

      const [solicitud] = await this.prisma.$transaction([
        this.prisma.solicitud.update({ where: { radicado }, data }),
        this.prisma.log_Auditoria.create({
          data: {
            radicado_solicitud: radicado,
            estado_anterior: existente.estado,
            estado_nuevo: estadoFinal,
            modificado_por: idStaff, // Zero Trust: autor tomado del JWT verificado, nunca del body
            motivo_rechazo: updateSolicitudeDto.motivo_rechazo,
          },
        }),
      ]);
      return { mensaje: 'Estado actualizado y auditado correctamente en la bitácora', solicitud };
    } catch (error: unknown) {
      return this.relanzarComoConflictoSiCa06(error, radicado);
    }
  }

  /**
   * Fase 5 · E1/E2: valida un cambio de estado pedido por el STAFF desde el tablero.
   * Devuelve la acción autorizada o lanza: 403 si la transición es del solicitante;
   * 409 si el estado no la permite o si debe ir por su endpoint de comando (CA-10).
   */
  private autorizarTransicionDelStaff(origen: string, destino: string): Accion {
    const resultado = evaluarTransicion(origen, destino, RolUsuario.STAFF);
    if (!resultado.permitida) {
      if (resultado.motivo === 'ROL_NO_AUTORIZADO') {
        throw new ForbiddenException(MENSAJES_TRANSICION_INVALIDA.ROL_NO_AUTORIZADO);
      }
      throw new ConflictException(MENSAJES_TRANSICION_INVALIDA[resultado.motivo]);
    }
    if (!ACCIONES_DEL_TABLERO.has(resultado.transicion.accion)) {
      throw new ConflictException(MENSAJE_USAR_REPROGRAMACION);
    }
    return resultado.transicion.accion;
  }

  async remove(radicado: string) {
    const existe = await this.prisma.solicitud.findUnique({ where: { radicado } });
    if (!existe) {
      throw new BadRequestException(`El radicado ${radicado} no existe.`);
    }

    throw new NotImplementedException(
      'El borrado físico de radicados está prohibido por política de auditoría. Use PATCH para cambiar estado a cancelación.'
    );
  }
}