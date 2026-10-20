import { franjaYaInicio } from './acciones-staff'
import { TEXTO_BLOQUES_ATENCION } from './franja'
import { compararInstantes, compararRadicados, type Ordenable } from './tablero'

/**
 * Inicio por rol (Fase 7 · C3). Funciones puras: derivan los contadores y las listas del
 * menú de bienvenida a partir de lo que ya traen GET /solicitudes (Staff) y
 * GET /solicitudes/mis-solicitudes (solicitante). Sin endpoints nuevos: las vistas (C4 y
 * C5) solo pintan lo que devuelven estas funciones.
 *
 * "Ya inició" usa el MISMO criterio que DA4 y que D7 en el servidor (`franjaYaInicio`: un
 * inicio igual a "ahora" ya cuenta). Con el reloj del navegador ADVIERTE, no decide.
 */

/** Lo mínimo que necesita el resumen del Staff (genérico: se prueba sin el esquema completo). */
export type ParaResumenStaff = Pick<Ordenable, 'estado' | 'es_urgencia' | 'fecha_inicio'>

export interface ResumenInicioStaff {
  /** Urgentes que esperan revisión: el mismo número que el aviso del tablero (DT2). */
  readonly urgentesEnRecibido: number
  /**
   * En Recibido con la franja ya iniciada: no se pueden validar (D7) y su salida es
   * rechazarlas con motivo (Frente B). No son excluyentes con las urgentes.
   */
  readonly vencidasEnRecibido: number
  /** En Pendiente de Reprogramación: la decisión es del solicitante (T7 o T8). */
  readonly esperandoAlSolicitante: number
  readonly enProduccion: number
}

export function resumenInicioStaff(solicitudes: readonly ParaResumenStaff[], ahora: Date): ResumenInicioStaff {
  let urgentesEnRecibido = 0
  let vencidasEnRecibido = 0
  let esperandoAlSolicitante = 0
  let enProduccion = 0
  for (const solicitud of solicitudes) {
    switch (solicitud.estado) {
      case 'Recibido':
        if (solicitud.es_urgencia) urgentesEnRecibido += 1
        if (franjaYaInicio(solicitud.fecha_inicio, ahora)) vencidasEnRecibido += 1
        break
      case 'Pendiente de Reprogramación':
        esperandoAlSolicitante += 1
        break
      case 'En Producción':
        enProduccion += 1
        break
      default:
        // Validado y los estados finales no tienen atajo en el inicio del Staff.
        break
    }
  }
  return { urgentesEnRecibido, vencidasEnRecibido, esperandoAlSolicitante, enProduccion }
}

/** Fase 7 · C4: cada atajo del inicio del Staff. La vista solo los pinta, en este orden. */
export type ClaveAtajoStaff = 'urgentes' | 'vencidas' | 'esperando' | 'produccion'

export interface AtajoInicio {
  readonly clave: ClaveAtajoStaff
  readonly titulo: string
  /** Qué significa el número y, si aplica, qué hacer: va como descripción accesible del enlace. */
  readonly ayuda: string
  readonly cantidad: number
  /** El Staff tiene algo que hacer YA (se resalta). Las otras dos son informativas. */
  readonly requiereAtencion: boolean
}

/**
 * Orden de lectura: primero lo que pide acción del Staff (urgentes, vencidas), después lo que
 * espera a otros o está en curso. Textos honestos: dicen lo que el sistema hará y nada más.
 */
export function atajosDelStaff(resumen: ResumenInicioStaff): readonly AtajoInicio[] {
  return [
    {
      clave: 'urgentes',
      titulo: 'Urgentes por revisar',
      ayuda: 'En Recibido, con menos de 5 días hábiles de anticipación.',
      cantidad: resumen.urgentesEnRecibido,
      requiereAtencion: resumen.urgentesEnRecibido > 0,
    },
    {
      clave: 'vencidas',
      titulo: 'Recibidas con la franja vencida',
      ayuda: 'Ya no se pueden validar: si no se van a atender, recházalas con un motivo.',
      cantidad: resumen.vencidasEnRecibido,
      requiereAtencion: resumen.vencidasEnRecibido > 0,
    },
    {
      clave: 'esperando',
      titulo: 'Esperan al solicitante',
      ayuda: 'Propuestas de reprogramación pendientes de su respuesta.',
      cantidad: resumen.esperandoAlSolicitante,
      requiereAtencion: false,
    },
    {
      clave: 'produccion',
      titulo: 'En producción',
      ayuda: 'Actividades en curso, por marcar como entregadas.',
      cantidad: resumen.enProduccion,
      requiereAtencion: false,
    },
  ]
}

/** Fase 7 · C5: cuántas próximas reservas muestra el inicio; el resto, en "Mis solicitudes". */
export const MAXIMO_PROXIMAS_INICIO = 3

/**
 * Fase 7 · C5: el recordatorio de reglas del inicio del solicitante. El horario REUTILIZA el
 * texto del formulario B2 (una sola fuente): si el horario cambia, no puede quedar uno viejo.
 * Solo informa: los días hábiles, los bloques y CA-06 los decide el servidor (DH4).
 */
export const REGLAS_ESTUDIO_C: readonly string[] = [
  TEXTO_BLOQUES_ATENCION,
  'Reserva con al menos 5 días hábiles de anticipación: con menos, la solicitud queda marcada como urgente y conviene avisar al Staff.',
  'Un mismo horario no se puede reservar dos veces: si ya está ocupado, el sistema te lo dirá al enviar.',
  'Si el Staff te propone otra franja, acéptala o recházala desde tu solicitud: mientras tanto queda en espera.',
]

/** Lo mínimo que necesita el resumen del solicitante. */
export interface ParaResumenSolicitante extends Ordenable {
  readonly fecha_propuesta_inicio: string | null
}

export interface ResumenInicioSolicitante<T> {
  /**
   * Propuestas de reprogramación que esperan SU respuesta (T7 o T8), la más próxima primero.
   * Van arriba en el inicio porque bloquean al Estudio C. Una propuesta ya vencida también
   * está aquí: rechazarla (T8) sigue siendo una salida válida (ADR-005 §3).
   */
  readonly pendientesDeTuRespuesta: readonly T[]
  /** Reservas validadas cuya franja todavía no empieza, la más cercana primero. */
  readonly proximasValidadas: readonly T[]
}

/** ¿La franja aún no empieza? Una fecha ilegible no es "próxima": no se pinta lo que no se lee. */
function esFutura(inicioIso: string, ahora: Date): boolean {
  return !Number.isNaN(Date.parse(inicioIso)) && !franjaYaInicio(inicioIso, ahora)
}

/**
 * Genérica: devuelve los MISMOS objetos que recibe, así la vista conserva todos los campos.
 * No muta la entrada: `filter` crea la lista nueva que luego se ordena.
 */
export function resumenInicioSolicitante<T extends ParaResumenSolicitante>(
  solicitudes: readonly T[],
  ahora: Date,
): ResumenInicioSolicitante<T> {
  const pendientesDeTuRespuesta = solicitudes
    .filter((s) => s.estado === 'Pendiente de Reprogramación')
    // Sin propuesta (dato inconsistente; K9 lo impide en la base) → "" es ilegible y va al final.
    .sort(
      (a, b) =>
        compararInstantes(a.fecha_propuesta_inicio ?? '', b.fecha_propuesta_inicio ?? '', 1) || compararRadicados(a, b),
    )
  const proximasValidadas = solicitudes
    .filter((s) => s.estado === 'Validado' && esFutura(s.fecha_inicio, ahora))
    .sort((a, b) => compararInstantes(a.fecha_inicio, b.fecha_inicio, 1) || compararRadicados(a, b))
  return { pendientesDeTuRespuesta, proximasValidadas }
}
