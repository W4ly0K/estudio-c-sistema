import { franjaYaInicio } from './acciones-staff'
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
