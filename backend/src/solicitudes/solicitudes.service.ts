import { Prisma, CategoriaSolicitud, RolUsuario, Solicitud, SubEspacio } from '@prisma/client';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { CreateSolicitudeDto, MENSAJE_SUBESPACIO_DE_CREACION } from './dto/create-solicitude.dto';
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
import { FILTRO_OCUPA_FRANJA, ocupaFranja } from './reglas/estados';
import { POLITICA_POR_CATEGORIA, transicionAplicaALaCategoria } from './reglas/categorias';
import { type ErrorSubEspacioAlRadicar, subEspacioAlRadicar, subEspaciosEnConflicto } from './reglas/sub-espacios';
import {
  ESTADO_INICIAL,
  evaluarAccion,
  evaluarTransicion,
  type Accion,
  type Transicion,
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

/** Fase 8 · requisito 3: PODCAST y VIDEO no pueden saltar la edición (T9 prohibido). */
export const MENSAJE_EDICION_OBLIGATORIA =
  'Esta categoría pasa por "Edición y postproducción" antes de la entrega: mueva primero la solicitud a esa etapa.';

/** Fase 8 · requisito 3: las demás categorías no pasan por edición (T11 y T12 no les aplican). */
export const MENSAJE_EDICION_NO_APLICA =
  'Esta categoría no pasa por "Edición y postproducción": la entrega se registra directamente desde "En Producción".';

/** Fase 8 · requisito 4: el enlace del producto final solo acompaña una entrega (como E5). */
export const MENSAJE_ENLACE_SOLO_AL_ENTREGAR =
  'El enlace del producto final solo se envía al marcar la solicitud como "Entregado".';

/** Fase 8 · requisito 4: PODCAST, VIDEO y STREAMING se entregan con su enlace. */
export const MENSAJE_ENLACE_OBLIGATORIO =
  'Para entregar esta solicitud se requiere el enlace del producto final (https://).';

/** Fase 8 · requisito 4 (coherente con SE10): ESPACIOS y ASESORIAS no tienen producto en línea. */
export const MENSAJE_ENLACE_NO_APLICA =
  'Esta categoría no tiene un producto final en línea: la entrega se registra sin enlace.';

/** E1: proponer una nueva franja necesita su propio endpoint (CA-10), no el tablero. */
export const MENSAJE_USAR_REPROGRAMACION =
  'Para proponer una nueva fecha use la reprogramación: POST /solicitudes/:radicado/reprogramacion.';

/** D2: fuera de "Recibido", la franja solo cambia por mutuo acuerdo (CA-10). */
export const MENSAJE_FECHAS_SOLO_EN_RECIBIDO =
  'Las fechas solo se editan mientras la solicitud está en "Recibido". Para una solicitud validada, proponga una reprogramación.';

/** D7: fail-closed, no se aprueba una franja que ya comenzó. */
export const MENSAJE_FRANJA_VENCIDA =
  'No se puede aprobar una solicitud cuya franja ya inició o pasó. Reprográmela antes de aprobarla.';

/**
 * Fase 7 · ADR-007 NA2 · T10: D7 invertida. "No atendida" registra que la franja pasó sin
 * respuesta; con la franja por delante, la salida es validarla o rechazarla con un motivo.
 */
export const MENSAJE_NO_ATENDIDA_FRANJA_FUTURA =
  'Solo se puede cerrar como "No atendida" una solicitud cuya franja ya inició o pasó. Si no se va a atender, recházela con un motivo.';

/** Fase 7 · NA2 · T10: se cierra la franja REGISTRADA; moverla al mismo tiempo no tiene sentido. */
export const MENSAJE_NO_ATENDIDA_SIN_FECHAS =
  'Al cerrar una solicitud como "No atendida" no se envían fechas: se cierra con la franja registrada.';

/**
 * Fase 7 · ADR-007 SE5 · D-4: una vez validada, el sub-espacio solo cambia por mutuo
 * acuerdo (CA-10, Q-A5), igual que la franja (D2).
 */
export const MENSAJE_SUBESPACIO_SOLO_EN_RECIBIDO =
  'El sub-espacio solo se ajusta mientras la solicitud está en "Recibido", al validarla. Para una solicitud validada, proponga una reprogramación.';

/**
 * Fase 7 · ADR-007 SE5 · D-4: en "Recibido" el Staff ajusta el sub-espacio AL VALIDAR (Q-A4).
 * Un cambio suelto no tendría transición que lo registre (CA-09, Q-A12).
 */
export const MENSAJE_SUBESPACIO_SOLO_AL_APROBAR =
  'El sub-espacio solo se ajusta al validar la solicitud: envíelo junto con el estado "Validado".';

/**
 * Fase 7 · 7B.4 (ADR-007 SE10): en un servicio el lugar lo asigna el Estudio C (el completo al
 * radicar y, si hace falta, el ajuste del Staff al validar). Enviarlo no se ignora en silencio.
 */
export const MENSAJE_SUBESPACIO_SOLO_EN_ESPACIOS =
  'El sub-espacio solo se elige en una solicitud de espacio físico; para los demás servicios lo asigna el Estudio C.';

/**
 * SE10: un mensaje por cada error de subEspacioAlRadicar(). Record sobre la unión: un error
 * nuevo no compila hasta tener su mensaje (Decisión D-Q). El primero lo responde casi siempre
 * el pipe con el MISMO texto; este es la defensa en profundidad del servicio.
 */
const MENSAJES_SUBESPACIO_AL_RADICAR: Readonly<Record<ErrorSubEspacioAlRadicar, string>> = {
  REQUERIDO_EN_ESPACIOS: MENSAJE_SUBESPACIO_DE_CREACION,
  SOLO_EN_ESPACIOS: MENSAJE_SUBESPACIO_SOLO_EN_ESPACIOS,
};

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

/**
 * K4 (redefinida en la Fase 7 · D-2, Q-A6): proponer la MISMA franja en el MISMO
 * sub-espacio no es una reprogramación. Cambiar solo la hora, solo el lugar o ambos, sí.
 */
export const MENSAJE_PROPUESTA_SIN_CAMBIOS =
  'La propuesta es igual a la reserva vigente (misma franja y mismo sub-espacio): no hay nada que reprogramar.';

/** Fase 5.5a · CA-10 · T7: respuesta del comando /reprogramacion/aceptar. */
export const MENSAJE_REPROGRAMACION_ACEPTADA =
  'Reprogramación aceptada: la solicitud vuelve a "Validado" con la nueva franja.';

/** Fase 5.5a · CA-10 · T8: respuesta del comando /reprogramacion/rechazar (PRD §5.5). */
export const MENSAJE_REPROGRAMACION_RECHAZADA =
  'Reprogramación rechazada: la solicitud quedó cancelada y su franja liberada.';

/** L5: aceptar o rechazar solo tiene sentido con una propuesta pendiente. */
export const MENSAJE_SIN_PROPUESTA_PENDIENTE =
  'La solicitud no tiene una propuesta de reprogramación pendiente.';

/**
 * L5 · opción (a): la propuesta venció mientras esperaba respuesta. La máquina aprobada no
 * da salida al Staff desde "Pendiente" (ADR-005): se remite al Estudio C.
 */
export const MENSAJE_PROPUESTA_VENCIDA =
  'La propuesta ya no es válida: su franja ya inició o no cumple el horario de atención. Puede rechazarla o comunicarse con el Estudio C.';

/** L4 · fail-closed: "Pendiente" sin propuesta guardada (dato inconsistente; CHECK en 5.5b). */
export const MENSAJE_PROPUESTA_NO_DISPONIBLE =
  'La propuesta de reprogramación no está disponible. Comuníquese con el Estudio C.';

/** L3: lo mínimo que leen los comandos del solicitante (sin datos de terceros). */
export const SELECT_COMANDO_SOLICITANTE = {
  estado: true,
  fecha_inicio: true,
  fecha_fin: true,
  fecha_propuesta_inicio: true,
  fecha_propuesta_fin: true,
  // Fase 7 · SE6: T7 evalúa CA-06 en el sub-espacio PROPUESTO, lo traslada y audita el
  // cambio desde el vigente (L4, L7, L8).
  sub_espacio: true,
  sub_espacio_propuesto: true,
} satisfies Prisma.SolicitudSelect;

type LecturaComando = Prisma.SolicitudGetPayload<{ select: typeof SELECT_COMANDO_SOLICITANTE }>;

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
  // Fase 7 · T10: sin cuerpo propio (solo el destino), por eso viaja por el PATCH como T2 (NA2).
  'CERRAR_NO_ATENDIDA',
  // Fase 8 · T11: sin cuerpo propio (solo el destino), por el PATCH como T4.
  'INICIAR_EDICION',
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

    // --- 0. Fase 7 · SE10: el sub-espacio según la categoría. Es la forma de la petición, así
    // que va primero, como E5 en update(): no se evalúa nada con un cuerpo incoherente.
    const lugar = subEspacioAlRadicar(createSolicitudeDto.categoria, createSolicitudeDto.sub_espacio);
    if (!lugar.ok) {
      throw new BadRequestException(MENSAJES_SUBESPACIO_AL_RADICAR[lugar.error]);
    }
    const subEspacio = lugar.subEspacio;

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

    // --- 2. Mitigación M3: Anti-Traslape (CA-06), capa amable (409 único), por sub-espacio ---
    if (
      await this.hayTraslape(
        {
          inicio: createSolicitudeDto.fecha_inicio,
          fin: createSolicitudeDto.fecha_fin,
        },
        subEspacio,
      )
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
          // Siempre explícito: desde el contract (7A.8) la columna no tiene DEFAULT.
          sub_espacio: subEspacio,
        
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
   * Fase 7 · SE4: solo cuentan las reservas de los sub-espacios EN CONFLICTO con el pedido
   * (el mismo físico o el completo), espejo de los dos EXCLUDE parciales del motor.
   */
  private async hayTraslape(
    franja: FranjaSolicitada,
    subEspacio: SubEspacio,
    excluirRadicado?: string,
  ): Promise<boolean> {
    const conflicto = await this.prisma.solicitud.findFirst({
      where: {
        // Fase 8: la regla de ocupación por estado Y categoría (estados.ts), espejo del motor.
        ...FILTRO_OCUPA_FRANJA,
        sub_espacio: { in: [...subEspaciosEnConflicto(subEspacio)] },
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
    // Fase 7 · SE5: el sub-espacio EFECTIVO también es parte de lo que quedará guardado.
    const subEspacioFinal = updateSolicitudeDto.sub_espacio ?? existente.sub_espacio;
    const cambiaSubEspacio = subEspacioFinal !== existente.sub_espacio;
    // P-1: la franja se mueve DE VERDAD (enviar las mismas fechas no es un ajuste que auditar).
    const cambiaFranja =
      franja.inicio.getTime() !== existente.fecha_inicio.getTime() ||
      franja.fin.getTime() !== existente.fecha_fin.getTime();

    // --- 1. E5: el motivo de rechazo solo acompaña un rechazo real.
    if (
      updateSolicitudeDto.motivo_rechazo !== undefined &&
      !(cambiaEstado && estadoFinal === 'Rechazado')
    ) {
      throw new BadRequestException(MENSAJE_MOTIVO_SOLO_EN_RECHAZO);
    }

    // --- 1b. Fase 8 · requisito 4: el enlace solo acompaña una entrega real (como E5). `null`
    // cuenta como ausente: así nunca llega al motor un "Entregado" sin enlace por esa vía.
    const enlace = updateSolicitudeDto.enlace_entrega ?? undefined;
    const entrega = cambiaEstado && estadoFinal === 'Entregado';
    if (enlace !== undefined && !entrega) {
      throw new BadRequestException(MENSAJE_ENLACE_SOLO_AL_ENTREGAR);
    }

    // --- 2. Máquina de estados (Fase 5): solo transiciones legales del STAFF y solo
    // las del tablero. Pedir el estado actual no es una transición (MISMO_ESTADO = sin cambio).
    const accion = cambiaEstado ? this.autorizarTransicionDelStaff(existente.estado, estadoFinal, existente.categoria) : undefined;

    // --- 2c. Fase 8 · requisito 4: si la entrega exige o prohíbe el enlace lo decide la categoría
    // GUARDADA. Va después de la máquina: un PODCAST que intenta T9 recibe primero el 409 de la
    // edición obligatoria, que es lo que de verdad le falta.
    if (entrega) {
      const regla = POLITICA_POR_CATEGORIA[existente.categoria].enlaceAlEntregar;
      if (regla === 'OBLIGATORIO' && enlace === undefined) {
        throw new BadRequestException(MENSAJE_ENLACE_OBLIGATORIO);
      }
      if (regla === 'PROHIBIDO' && enlace !== undefined) {
        throw new BadRequestException(MENSAJE_ENLACE_NO_APLICA);
      }
    }

    // --- 2b. T10 (Fase 7 · NA2): se cierra la franja REGISTRADA. Fechas nuevas en la misma
    // petición cambiarían la base sobre la que se evalúa la regla de tiempo del paso 5b.
    if (accion === 'CERRAR_NO_ATENDIDA' && cambianFechas) {
      throw new BadRequestException(MENSAJE_NO_ATENDIDA_SIN_FECHAS);
    }

    // --- 3. D2: la franja se edita solo mientras la solicitud sigue en "Recibido" (estado
    // GUARDADO). Permite el rescate atómico: fechas nuevas + aprobación en un solo PATCH.
    if (cambianFechas && existente.estado !== ESTADO_INICIAL) {
      throw new ConflictException(MENSAJE_FECHAS_SOLO_EN_RECIBIDO);
    }

    // --- 3b. D-4 (Fase 7 · SE5): el sub-espacio, igual que la franja, solo se toca en
    // "Recibido" (409 fuera de él, como D2) y, además, SOLO al validar (400 en otro caso:
    // como E5, el campo no tiene sentido sin su transición). Se mira la PRESENCIA del campo:
    // repetir el sub-espacio actual sin validar tampoco es una petición válida.
    if (updateSolicitudeDto.sub_espacio !== undefined) {
      if (existente.estado !== ESTADO_INICIAL) {
        throw new ConflictException(MENSAJE_SUBESPACIO_SOLO_EN_RECIBIDO);
      }
      if (accion !== 'APROBAR') {
        throw new BadRequestException(MENSAJE_SUBESPACIO_SOLO_AL_APROBAR);
      }
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

    // --- 5b. T10 (Fase 7 · NA2): D7 invertida, con el MISMO criterio de frontera: un inicio
    // igual a "ahora" ya cuenta como iniciado. Solo se cierra como no atendida lo que ya venció.
    if (accion === 'CERRAR_NO_ATENDIDA' && franja.inicio.getTime() > ahora.getTime()) {
      throw new ConflictException(MENSAJE_NO_ATENDIDA_FRANJA_FUTURA);
    }

    // --- 6. CA-06, capa amable: solo si el resultado ocupa la franja y las fechas o el
    // sub-espacio se movieron (Fase 7: pasar de la cabina al completo puede chocar sin tocar
    // la hora). D1 eliminó la reactivación, y el único estado no final que libera (Fase 8:
    // "Edición y postproducción") solo conduce a otro que, para su categoría, tampoco ocupa: un
    // cambio de estado no puede volver a ocupar una franja. Sin auto-colisión.
    if (
      ocupaFranja(estadoFinal, existente.categoria) &&
      (cambianFechas || cambiaSubEspacio) &&
      (await this.hayTraslape(franja, subEspacioFinal, radicado))
    ) {
      throw new ConflictException(MENSAJE_CA06);
    }

    // --- 7. Un único conjunto de cambios: estado y fechas se aplican JUNTOS (U5).
    const { recursos } = updateSolicitudeDto;
    const data: Prisma.SolicitudUpdateManyMutationInput = {
      ...(updateSolicitudeDto.proposito !== undefined ? { proposito: updateSolicitudeDto.proposito } : {}),
      ...cambiosDeFranja,
      ...(cambiaSubEspacio ? { sub_espacio: subEspacioFinal } : {}),
      ...(cambiaEstado ? { estado: estadoFinal } : {}),
      // Fase 8 · requisito 4: el enlace se escribe con su entrega, en el mismo compare-and-set.
      ...(entrega && enlace !== undefined ? { enlace_entrega: enlace } : {}),
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
        // Fase 7 · SE5: sobre el sub-espacio guardado también se calculó CA-06.
        sub_espacio: existente.sub_espacio,
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
            // Fase 7 · SE7 y P-1 (Q-A12, Q-B2): el ajuste al validar queda en el MISMO log de T1.
            // Solo con APROBAR: el motor exige estado_nuevo = "Validado" (A3 y F3).
            ...(accion === 'APROBAR' && cambiaSubEspacio
              ? { sub_espacio_anterior: existente.sub_espacio, sub_espacio_nuevo: subEspacioFinal }
              : {}),
            ...(accion === 'APROBAR' && cambiaFranja
              ? { fecha_inicio_anterior: existente.fecha_inicio, fecha_fin_anterior: existente.fecha_fin }
              : {}),
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
    const { propia, existente, transicion } = await this.leerPropiaYAutorizar(
      radicado,
      usuario,
      'CANCELAR',
      (motivo, estado) => this.errorDeCancelacion(motivo, estado),
    );

    const solicitud = await this.escribirConCompareAndSet({
      radicado,
      // G3: la propiedad también va en la ESCRITURA; el estado esperado es el leído.
      esperado: { id_usuario: usuario.id, estado: existente.estado },
      data: { estado: transicion.destino },
      log: {
        estado_anterior: existente.estado,
        estado_nuevo: transicion.destino,
        modificado_por: usuario.id, // D6: el autor es quien cancela, tomado del JWT
      },
      // G8: proyección mínima del solicitante (sin la identidad del Staff en los logs).
      releer: (tx) => tx.solicitud.findFirstOrThrow({ where: propia, select: SELECT_DETALLE_SOLICITANTE }),
    });
    return { mensaje: MENSAJE_SOLICITUD_CANCELADA, solicitud };
  }

  /**
   * Fase 5.5a · CA-10 · T7: el SOLICITANTE acepta la propuesta GUARDADA (no envía fechas).
   * L4: la propuesta se revalida ahora (CA-04 con el Reloj de esta petición y CA-06), porque
   * pudo vencer u ocuparse mientras esperaba (D3). L6: es_urgencia queda en false, porque la
   * fecha la eligió el Staff. L7: el CAS exige EXACTAMENTE la propuesta que se validó.
   */
  async aceptarReprogramacion(
    radicado: string,
    usuario: UsuarioAutenticado,
  ): Promise<{ mensaje: string; solicitud: DetalleSolicitudSolicitante }> {
    // Decisión D-U: un único "ahora" por petición.
    const ahora = this.reloj.ahora();
    const { propia, existente, transicion } = await this.leerPropiaYAutorizar(
      radicado,
      usuario,
      'ACEPTAR_REPROGRAMACION',
      (motivo) => this.errorDeRespuestaAPropuesta(motivo),
    );

    // L4 · fail-closed: "Pendiente" sin propuesta COMPLETA (franja Y lugar) es un dato
    // inconsistente. Fase 7 · 7A.8: desde el contract, M4 lo impide en el motor; aquí no se
    // supone un lugar (antes, un lugar ausente se leía como "el mismo").
    if (
      existente.fecha_propuesta_inicio === null ||
      existente.fecha_propuesta_fin === null ||
      existente.sub_espacio_propuesto === null
    ) {
      this.logger.warn(`Solicitud pendiente sin propuesta guardada: ${radicado}.`);
      throw new ConflictException(MENSAJE_PROPUESTA_NO_DISPONIBLE);
    }
    const propuesta: FranjaSolicitada = {
      inicio: existente.fecha_propuesta_inicio,
      fin: existente.fecha_propuesta_fin,
    };
    // Fase 7 · SE6: el lugar de la propuesta (la guardia de arriba ya descartó el null).
    const subEspacioPropuesto = existente.sub_espacio_propuesto;
    const cambiaSubEspacio = subEspacioPropuesto !== existente.sub_espacio;
    // P-1: con K4 redefinida, una propuesta puede conservar la hora y cambiar solo el lugar.
    const cambiaFranja =
      propuesta.inicio.getTime() !== existente.fecha_inicio.getTime() ||
      propuesta.fin.getTime() !== existente.fecha_fin.getTime();

    // L4/L5: CA-04 otra vez, con el Reloj de ESTA petición (la propuesta pudo vencer).
    if (!evaluarHorario(propuesta, ahora, calendarioLaboralColombia).valido) {
      throw new ConflictException(MENSAJE_PROPUESTA_VENCIDA);
    }

    // L4: CA-06 de la propuesta (consulta previa) en el sub-espacio PROPUESTO; el motor la
    // confirma al escribir.
    if (await this.hayTraslape(propuesta, subEspacioPropuesto, radicado)) {
      throw new ConflictException(MENSAJE_CA06);
    }

    const solicitud = await this.escribirConCompareAndSet({
      radicado,
      // L7: CAS estricto: dueño, estado leído y EXACTAMENTE la propuesta validada (franja y
      // lugar) sobre el lugar vigente.
      esperado: {
        id_usuario: usuario.id,
        estado: existente.estado,
        fecha_propuesta_inicio: propuesta.inicio,
        fecha_propuesta_fin: propuesta.fin,
        sub_espacio: existente.sub_espacio,
        sub_espacio_propuesto: subEspacioPropuesto,
      },
      // L8 · L6: la propuesta pasa a ser la franja (y el lugar) oficial y se limpia.
      data: {
        estado: transicion.destino,
        fecha_inicio: propuesta.inicio,
        fecha_fin: propuesta.fin,
        ...(cambiaSubEspacio ? { sub_espacio: subEspacioPropuesto } : {}),
        fecha_propuesta_inicio: null,
        fecha_propuesta_fin: null,
        sub_espacio_propuesto: null,
        es_urgencia: false,
      },
      log: {
        estado_anterior: existente.estado,
        estado_nuevo: transicion.destino,
        modificado_por: usuario.id, // D6 · L9 (aceptar): autor tomado del JWT
        // Fase 7 · SE7 y P-1 (Q-A12): T7 termina en "Validado", como exigen A3 y F3.
        ...(cambiaSubEspacio ? { sub_espacio_anterior: existente.sub_espacio, sub_espacio_nuevo: subEspacioPropuesto } : {}),
        ...(cambiaFranja ? { fecha_inicio_anterior: existente.fecha_inicio, fecha_fin_anterior: existente.fecha_fin } : {}),
      },
      releer: (tx) => tx.solicitud.findFirstOrThrow({ where: propia, select: SELECT_DETALLE_SOLICITANTE }),
    });
    return { mensaje: MENSAJE_REPROGRAMACION_ACEPTADA, solicitud };
  }

  /**
   * Fase 5.5a · CA-10 · T8: el SOLICITANTE rechaza la propuesta; la solicitud se cancela y
   * la franja se libera (PRD §5.5). L9: la franja oficial se conserva como registro; la
   * propuesta se limpia. No hay revalidación: rechazar no ocupa ninguna franja.
   */
  async rechazarReprogramacion(
    radicado: string,
    usuario: UsuarioAutenticado,
  ): Promise<{ mensaje: string; solicitud: DetalleSolicitudSolicitante }> {
    const { propia, existente, transicion } = await this.leerPropiaYAutorizar(
      radicado,
      usuario,
      'RECHAZAR_REPROGRAMACION',
      (motivo) => this.errorDeRespuestaAPropuesta(motivo),
    );

    const solicitud = await this.escribirConCompareAndSet({
      radicado,
      esperado: { id_usuario: usuario.id, estado: existente.estado },
      // Fase 7 · SE6: la propuesta se limpia completa (franja y lugar).
      data: {
        estado: transicion.destino,
        fecha_propuesta_inicio: null,
        fecha_propuesta_fin: null,
        sub_espacio_propuesto: null,
      },
      log: {
        estado_anterior: existente.estado,
        estado_nuevo: transicion.destino,
        modificado_por: usuario.id, // D6 · L9 (rechazar): autor tomado del JWT
      },
      releer: (tx) => tx.solicitud.findFirstOrThrow({ where: propia, select: SELECT_DETALLE_SOLICITANTE }),
    });
    return { mensaje: MENSAJE_REPROGRAMACION_RECHAZADA, solicitud };
  }

  /**
   * L3 · G2: lectura común de los comandos del SOLICITANTE. Primero la propiedad (404
   * uniforme, ADR-002), después la máquina (403/409 según `traducirError`): un radicado
   * ajeno nunca revela en qué estado está.
   */
  private async leerPropiaYAutorizar(
    radicado: string,
    usuario: UsuarioAutenticado,
    accion: Accion,
    traducirError: (motivo: MotivoTransicionInvalida, estado: string) => ConflictException | ForbiddenException,
  ): Promise<{ propia: Prisma.SolicitudWhereInput; existente: LecturaComando; transicion: Transicion }> {
    // Decisión G (Fase 2): la propiedad va DENTRO del WHERE; nunca se leen filas ajenas.
    const propia: Prisma.SolicitudWhereInput = { radicado, ...filtroDeAcceso(usuario) };
    const existente = await this.prisma.solicitud.findFirst({ where: propia, select: SELECT_COMANDO_SOLICITANTE });
    if (!existente) {
      // G2: ajeno o inexistente → el mismo 404 (ADR-002), antes de mirar el estado.
      throw new NotFoundException(MENSAJE_SOLICITUD_NO_ENCONTRADA);
    }

    // El rol también se verifica aquí (defensa en profundidad, además de @Roles).
    const resultado = evaluarAccion(accion, existente.estado, usuario.rol);
    if (!resultado.permitida) {
      throw traducirError(resultado.motivo, existente.estado);
    }
    return { propia, existente, transicion: resultado.transicion };
  }

  /** L5: el error al responder una propuesta según el motivo de la máquina. */
  private errorDeRespuestaAPropuesta(motivo: MotivoTransicionInvalida): ConflictException | ForbiddenException {
    if (motivo === 'ROL_NO_AUTORIZADO') {
      return new ForbiddenException(MENSAJES_TRANSICION_INVALIDA[motivo]);
    }
    if (motivo === 'TRANSICION_NO_DEFINIDA') {
      return new ConflictException(MENSAJE_SIN_PROPUESTA_PENDIENTE);
    }
    return new ConflictException(MENSAJES_TRANSICION_INVALIDA[motivo]);
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
    // Fase 7 · SE6 (Q-A6): la propuesta es franja Y lugar. Para cambiar solo la hora se
    // envía el sub-espacio vigente; para cambiar solo el lugar, la franja vigente.
    const subEspacioPropuesto = dto.sub_espacio;

    // K4 (D-2): solo es "sin cambios" si coinciden la franja Y el sub-espacio.
    if (
      propuesta.inicio.getTime() === existente.fecha_inicio.getTime() &&
      propuesta.fin.getTime() === existente.fecha_fin.getTime() &&
      subEspacioPropuesto === existente.sub_espacio
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
    // Fase 7 · SE6: en el sub-espacio PROPUESTO. Cambiar solo de lugar en la misma franja no
    // choca consigo misma (se excluye la propia solicitud).
    if (await this.hayTraslape(propuesta, subEspacioPropuesto, radicado)) {
      throw new ConflictException(MENSAJE_CA06);
    }

    // K6: la franja oficial, el sub-espacio y es_urgencia NO cambian; solo el estado y la
    // propuesta (franja y lugar). La propuesta no se reserva en el motor (D3).
    const solicitud = await this.escribirConCompareAndSet({
      radicado,
      esperado: {
        estado: existente.estado,
        fecha_inicio: existente.fecha_inicio,
        fecha_fin: existente.fecha_fin,
        // Fase 7: K4 y CA-06 se calcularon también sobre el sub-espacio vigente.
        sub_espacio: existente.sub_espacio,
      },
      data: {
        estado: resultado.transicion.destino,
        fecha_propuesta_inicio: propuesta.inicio,
        fecha_propuesta_fin: propuesta.fin,
        sub_espacio_propuesto: subEspacioPropuesto,
      },
      log: {
        estado_anterior: existente.estado,
        estado_nuevo: resultado.transicion.destino,
        modificado_por: idStaff, // D6 · K6: autor tomado del JWT verificado
        // K7 · Fase 6.1b: la justificación vive en el log de T5 (inmutable, sobrevive a
        // T7 y T8). El motor exige que exista justo aquí (…_segun_estado_check).
        motivo_reprogramacion: dto.motivo,
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
  private autorizarTransicionDelStaff(origen: string, destino: string, categoria: CategoriaSolicitud): Accion {
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
    // Fase 8 · requisito 3: la máquina dijo que el paso existe; la categoría decide si le aplica.
    if (!transicionAplicaALaCategoria(resultado.transicion.id, categoria)) {
      throw new ConflictException(
        POLITICA_POR_CATEGORIA[categoria].pasaPorEdicion ? MENSAJE_EDICION_OBLIGATORIA : MENSAJE_EDICION_NO_APLICA,
      );
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