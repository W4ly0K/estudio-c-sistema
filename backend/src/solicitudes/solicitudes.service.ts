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
import { ProponerReprogramacionDto } from './dto/proponer-reprogramacion.dto';
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
  evaluarAccion,
  evaluarTransicion,
  type Accion,
  type MotivoTransicionInvalida,
} from './reglas/maquina-estados';
import { aMomentoLocal } from './reglas/zona-horaria';
import { esViolacionDeTraslapeCa06, MENSAJE_CA06 } from './errores/traslape-ca06';
import {
  DetalleSolicitud,
  type DetalleSolicitudSolicitante,
  type DetalleSolicitudStaff,
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

/**
 * D5 · F3: el compare-and-set no encontró la fila tal como se validó (otra petición la
 * cambió entre la lectura y la escritura). Distinto de CA-06: no es un cruce de franjas.
 */
export const MENSAJE_CAMBIO_CONCURRENTE =
  'La solicitud fue modificada por otra operación mientras se procesaba este cambio. Recargue y vuelva a intentarlo.';

/** Fase 5.3 · T3/T6: respuesta del comando /cancelar. */
export const MENSAJE_SOLICITUD_CANCELADA = 'Solicitud cancelada correctamente.';

/** G5: cancelar exige que la actividad no haya comenzado (PRD §4: "antes de En Producción"). */
export const MENSAJE_CANCELAR_EN_PRODUCCION =
  'La actividad ya comenzó ("En Producción") y la solicitud ya no puede cancelarse.';

/** G5: con una propuesta de reprogramación pendiente (CA-10), la salida es aceptarla o rechazarla. */
export const MENSAJE_CANCELAR_CON_PROPUESTA =
  'La solicitud tiene una propuesta de reprogramación pendiente: acéptela o recházela.';

/** Fase 5.4 · CA-10 · T5: respuesta del comando /reprogramacion. */
export const MENSAJE_REPROGRAMACION_PROPUESTA =
  'Propuesta de reprogramación registrada: queda pendiente de la respuesta del solicitante.';

/** K3: en "Recibido" la franja se edita directamente (D2); CA-10 aplica a solicitudes validadas. */
export const MENSAJE_REPROGRAMAR_EN_RECIBIDO =
  'La solicitud aún está en "Recibido": edite sus fechas directamente (PATCH /solicitudes/:radicado). La reprogramación por mutuo acuerdo aplica a solicitudes validadas.';

/** K3: "Pendiente de Reprogramación" queda congelada hasta que el solicitante responda. */
export const MENSAJE_PROPUESTA_YA_PENDIENTE =
  'La solicitud ya tiene una propuesta de reprogramación pendiente de respuesta del solicitante.';

/** K4: proponer la franja actual no es una reprogramación. */
export const MENSAJE_PROPUESTA_SIN_CAMBIOS =
  'La franja propuesta es igual a la actual: no hay nada que reprogramar.';

/** G7: lo que una escritura con compare-and-set necesita saber. */
interface OperacionCompareAndSet<T> {
  radicado: string;
  /** Condiciones del CAS además del radicado: la fila TAL COMO SE VALIDÓ. */
  esperado: Prisma.SolicitudWhereInput;
  data: Prisma.SolicitudUpdateManyMutationInput;
  /** R1: si viene, los recursos se reemplazan dentro de la misma transacción. */
  recursos?: ReadonlyArray<{ id_recurso: number; cantidad: number }>;
  /** CA-09: si viene, se registra el log en la misma transacción. */
  log?: Omit<Prisma.Log_AuditoriaUncheckedCreateInput, 'radicado_solicitud'>;
  /** Relectura dentro de la transacción (con la proyección que corresponda). */
  releer: (tx: Prisma.TransactionClient) => Promise<T>;
}

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
    let cambiosDeFranja: Prisma.SolicitudUpdateManyMutationInput = {};
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
    const data: Prisma.SolicitudUpdateManyMutationInput = {
      ...(updateSolicitudeDto.categoria !== undefined ? { categoria: updateSolicitudeDto.categoria } : {}),
      ...(updateSolicitudeDto.proposito !== undefined ? { proposito: updateSolicitudeDto.proposito } : {}),
      ...cambiosDeFranja,
      ...(cambiaEstado ? { estado: estadoFinal } : {}),
    };

    // Nada que escribir (por ejemplo, pedir el estado actual): sin transacción ni bloqueos.
    if (Object.keys(data).length === 0 && recursos === undefined) {
      return { mensaje: 'Solicitud actualizada correctamente (sin cambio de estado)', solicitud: existente };
    }

    // --- 8. Persistencia: compare-and-set sobre la fila TAL COMO SE VALIDÓ (D5 · F1, F2):
    // estado y franja guardados, porque sobre ellos se calcularon D2, horario, D7 y CA-06.
    const solicitud = await this.escribirConCompareAndSet({
      radicado,
      esperado: {
        estado: existente.estado,
        fecha_inicio: existente.fecha_inicio,
        fecha_fin: existente.fecha_fin,
      },
      data,
      recursos,
      // CA-09: hay log si y solo si cambió el estado.
      log: cambiaEstado
        ? {
            estado_anterior: existente.estado,
            estado_nuevo: estadoFinal,
            modificado_por: idStaff, // Zero Trust: autor tomado del JWT verificado, nunca del body
            motivo_rechazo: updateSolicitudeDto.motivo_rechazo,
          }
        : undefined,
      releer: (tx) => tx.solicitud.findUniqueOrThrow({ where: { radicado } }),
    });
    return {
      mensaje: cambiaEstado
        ? 'Estado actualizado y auditado correctamente en la bitácora'
        : 'Solicitud actualizada correctamente (sin cambio de estado)',
      solicitud,
    };
  }

  /**
   * Fase 5.3 · T3/T6: el SOLICITANTE cancela su PROPIA solicitud (PRD §4 y §5.5).
   * Orden G2: primero la propiedad (404 uniforme), después el estado (409). Así un
   * radicado ajeno nunca revela en qué estado está (ADR-002, anti-enumeración).
   * G4: regla de estado únicamente (Recibido o Validado), sin regla de tiempo.
   */
  async cancelar(
    radicado: string,
    usuario: UsuarioAutenticado,
  ): Promise<{ mensaje: string; solicitud: DetalleSolicitudSolicitante }> {
    // Decisión G (Fase 2): la propiedad va DENTRO del WHERE; nunca se leen filas ajenas.
    const propia: Prisma.SolicitudWhereInput = { radicado, ...filtroDeAcceso(usuario) };
    const existente = await this.prisma.solicitud.findFirst({ where: propia, select: { estado: true } });
    if (!existente) {
      // G2: ajeno o inexistente → el mismo 404 (ADR-002), antes de mirar el estado.
      throw new NotFoundException(MENSAJE_SOLICITUD_NO_ENCONTRADA);
    }

    // El rol también se verifica aquí (defensa en profundidad, además de @Roles).
    const resultado = evaluarAccion('CANCELAR', existente.estado, usuario.rol);
    if (!resultado.permitida) {
      throw this.errorDeCancelacion(resultado.motivo, existente.estado);
    }

    const solicitud = await this.escribirConCompareAndSet({
      radicado,
      // G3: la propiedad también va en la ESCRITURA; el estado esperado es el leído.
      esperado: { id_usuario: usuario.id, estado: existente.estado },
      data: { estado: resultado.transicion.destino },
      log: {
        estado_anterior: existente.estado,
        estado_nuevo: resultado.transicion.destino,
        modificado_por: usuario.id, // D6: el autor es quien cancela, tomado del JWT
      },
      // G8: proyección mínima del solicitante (sin la identidad del Staff en los logs).
      releer: (tx) => tx.solicitud.findFirstOrThrow({ where: propia, select: SELECT_DETALLE_SOLICITANTE }),
    });
    return { mensaje: MENSAJE_SOLICITUD_CANCELADA, solicitud };
  }

  /**
   * Fase 5.4 · CA-10 · T5: el STAFF propone una nueva franja para una solicitud Validada.
   * Orden K2: existencia (404) → estado (409) → forma (400) → CA-04 (400) → CA-06 (409).
   * La franja oficial NO cambia y sigue ocupada (D3); el EXCLUDE no protege la propuesta,
   * por eso la aceptación (T7, paso 5.5) la vuelve a validar.
   */
  async proponerReprogramacion(
    radicado: string,
    dto: ProponerReprogramacionDto,
    idStaff: string,
  ): Promise<{ mensaje: string; solicitud: DetalleSolicitudStaff }> {
    // Decisión D-U: un único "ahora" por petición.
    const ahora = this.reloj.ahora();

    const existente = await this.prisma.solicitud.findUnique({ where: { radicado } });
    if (!existente) {
      // H8 · ADR-002: el mismo 404 que findOne() y update().
      throw new NotFoundException(MENSAJE_SOLICITUD_NO_ENCONTRADA);
    }

    // K2/K3: el estado va ANTES que la forma de la propuesta (en Recibido, la respuesta
    // útil es "use el PATCH", aunque la propuesta también traiga un error de horario).
    const resultado = evaluarAccion('PROPONER_REPROGRAMACION', existente.estado, RolUsuario.STAFF);
    if (!resultado.permitida) {
      throw this.errorDeReprogramacion(resultado.motivo, existente.estado);
    }

    const propuesta: FranjaSolicitada = { inicio: dto.fecha_inicio, fin: dto.fecha_fin };

    // K4: proponer la misma franja no es una reprogramación.
    if (
      propuesta.inicio.getTime() === existente.fecha_inicio.getTime() &&
      propuesta.fin.getTime() === existente.fecha_fin.getTime()
    ) {
      throw new BadRequestException(MENSAJE_PROPUESTA_SIN_CAMBIOS);
    }

    // K4: la propuesta pasa por las MISMAS reglas que una solicitud nueva (CA-04 y Fase 3).
    const horario = evaluarHorario(propuesta, ahora, calendarioLaboralColombia);
    if (!horario.valido) {
      throw new BadRequestException(MENSAJES_ERROR_HORARIO[horario.error]);
    }

    // K5 · D3: CA-06 de la franja PROPUESTA (capa amable), sin auto-colisión: la franja
    // oficial de esta misma solicitud sigue ocupada mientras la propuesta esté pendiente.
    if (await this.hayTraslape(propuesta, radicado)) {
      throw new ConflictException(MENSAJE_CA06);
    }

    // K6: la franja oficial y es_urgencia NO cambian; solo el estado y la propuesta.
    const solicitud = await this.escribirConCompareAndSet({
      radicado,
      esperado: { estado: existente.estado, fecha_inicio: existente.fecha_inicio, fecha_fin: existente.fecha_fin },
      data: {
        estado: resultado.transicion.destino,
        fecha_propuesta_inicio: propuesta.inicio,
        fecha_propuesta_fin: propuesta.fin,
      },
      log: {
        estado_anterior: existente.estado,
        estado_nuevo: resultado.transicion.destino,
        modificado_por: idStaff, // D6 · K6: autor tomado del JWT verificado
      },
      // K8: proyección del Staff (franja oficial y propuesta), releída en la transacción.
      releer: (tx) => tx.solicitud.findUniqueOrThrow({ where: { radicado }, select: SELECT_DETALLE_STAFF }),
    });
    return { mensaje: MENSAJE_REPROGRAMACION_PROPUESTA, solicitud };
  }

  /** K3: el error de la propuesta según el motivo de la máquina y el estado actual. */
  private errorDeReprogramacion(motivo: MotivoTransicionInvalida, estado: string): ConflictException {
    if (motivo === 'TRANSICION_NO_DEFINIDA' && estado === ESTADO_INICIAL) {
      return new ConflictException(MENSAJE_REPROGRAMAR_EN_RECIBIDO);
    }
    if (motivo === 'TRANSICION_NO_DEFINIDA' && estado === 'Pendiente de Reprogramación') {
      return new ConflictException(MENSAJE_PROPUESTA_YA_PENDIENTE);
    }
    return new ConflictException(MENSAJES_TRANSICION_INVALIDA[motivo]);
  }

  /** G5: el error de cancelación según el motivo de la máquina y el estado actual. */
  private errorDeCancelacion(
    motivo: MotivoTransicionInvalida,
    estado: string,
  ): ConflictException | ForbiddenException {
    if (motivo === 'ROL_NO_AUTORIZADO') {
      return new ForbiddenException(MENSAJES_TRANSICION_INVALIDA.ROL_NO_AUTORIZADO);
    }
    if (motivo === 'TRANSICION_NO_DEFINIDA' && estado === 'En Producción') {
      return new ConflictException(MENSAJE_CANCELAR_EN_PRODUCCION);
    }
    if (motivo === 'TRANSICION_NO_DEFINIDA' && estado === 'Pendiente de Reprogramación') {
      return new ConflictException(MENSAJE_CANCELAR_CON_PROPUESTA);
    }
    return new ConflictException(MENSAJES_TRANSICION_INVALIDA[motivo]);
  }

  /**
   * G7 · D5: ÚNICO mecanismo de escritura sobre una solicitud existente, en UNA
   * transacción interactiva: compare-and-set (0 filas → 409), reemplazo de recursos
   * (R1), log de auditoría (CA-09) y relectura.
   * En READ COMMITTED, un UPDATE concurrente espera el bloqueo de fila y re-evalúa su
   * WHERE sobre la versión confirmada (integración I-10). El 23P01 de CA-06 lanzado
   * dentro de la transacción conserva clase y firma (I-9) y se traduce al mismo 409.
   */
  private async escribirConCompareAndSet<T>(op: OperacionCompareAndSet<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.solicitud.updateMany({
          where: { radicado: op.radicado, ...op.esperado },
          data: op.data,
        });
        if (count !== 1) {
          // Métrica de concurrencia real (como en CA-06): solo el radicado propio.
          this.logger.warn(`Compare-and-set perdido: ${op.radicado} cambió durante la petición.`);
          throw new ConflictException(MENSAJE_CAMBIO_CONCURRENTE);
        }

        // R1: updateMany no admite escrituras anidadas; los recursos se reemplazan aquí.
        if (op.recursos !== undefined) {
          await tx.solicitud_Recurso.deleteMany({ where: { radicado_solicitud: op.radicado } });
          await tx.solicitud_Recurso.createMany({
            data: op.recursos.map((r) => ({
              radicado_solicitud: op.radicado,
              id_recurso: r.id_recurso,
              cantidad_solicitada: r.cantidad,
            })),
          });
        }

        // CA-09: el log va en la MISMA transacción que el cambio de estado.
        if (op.log !== undefined) {
          await tx.log_Auditoria.create({ data: { radicado_solicitud: op.radicado, ...op.log } });
        }

        return op.releer(tx);
      });
    } catch (error: unknown) {
      return this.relanzarComoConflictoSiCa06(error, op.radicado);
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
      'El borrado físico de radicados está prohibido por política de auditoría. Para cancelar, el solicitante usa POST /solicitudes/:radicado/cancelar.'
    );
  }
}