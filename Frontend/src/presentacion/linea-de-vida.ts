import type { LogSolicitante } from '../api/esquemas'
import { TRANSICIONES, esEstadoFinal, type Estado, type Rol } from '../api/maquina-estados'

/**
 * Línea de vida de B3 (solicitante) y C3 (Staff), derivada SOLO de lo que manda el servidor:
 * el estado actual y los logs (README del backend §8). Función pura: se prueba sin React ni red.
 */

/** El camino feliz que dibuja el stepper del wireframe (4 nodos). */
export const CAMINO_PRINCIPAL = ['Recibido', 'Validado', 'En Producción', 'Entregado'] as const satisfies readonly Estado[]
export type EstadoDelCamino = (typeof CAMINO_PRINCIPAL)[number]

/** `omitido`: el flujo terminó fuera del camino (Rechazado, Cancelado) y ese paso ya no llegará. */
export type SituacionPaso = 'completado' | 'actual' | 'pendiente' | 'omitido'

export interface PasoLinea {
  readonly estado: EstadoDelCamino
  readonly situacion: SituacionPaso
  /** Último cambio que llevó a este estado. "Recibido" no tiene log: es `null`. */
  readonly fecha: string | null
}

/**
 * Quién MIRA la línea de vida (6.5.2 · DD2). Cambia cómo se NOMBRA a cada actor, nunca
 * quién fue: eso lo dice la máquina. Es obligatoria en lineaDeVida() a propósito: con un
 * valor por defecto, una pantalla nueva podría olvidarla y mostrar "Tú" a quien no es.
 */
export type Perspectiva = Rol

/** Nombre de cada rol según la perspectiva. `Record` doble: un rol nuevo no compila sin su nombre. */
export const ACTORES = {
  SOLICITANTE: { SOLICITANTE: 'Tú', STAFF: 'Staff Estudio C' },
  STAFF: { SOLICITANTE: 'Solicitante', STAFF: 'Staff' },
} as const satisfies Readonly<Record<Perspectiva, Readonly<Record<Rol, string>>>>
export type Actor = (typeof ACTORES)[Perspectiva][Rol]

export const ETIQUETA_MOTIVO_RECHAZO = 'Motivo del rechazo'
/** El motivo de T5: el solicitante lo recibe "del Staff"; para el Staff es su propia justificación. */
export const ETIQUETAS_MOTIVO_PROPUESTA: Readonly<Record<Perspectiva, string>> = {
  SOLICITANTE: 'Motivo informado por el Staff',
  STAFF: 'Motivo de la reprogramación',
}

export interface MotivoEvento {
  readonly etiqueta: string
  readonly texto: string
}

export interface EventoLinea {
  readonly desde: Estado
  readonly hacia: Estado
  readonly fecha: string
  /** `null` si el par no está en la tabla (deriva del contrato): mejor callar que inventar. */
  readonly actor: Actor | null
  readonly motivo: MotivoEvento | null
}

export interface LineaDeVida {
  readonly pasos: readonly PasoLinea[]
  /** Estado actual cuando NO está en el camino principal (Pendiente, Rechazado, Cancelado). */
  readonly desvio: Estado | null
  /** Del más antiguo al más reciente. */
  readonly eventos: readonly EventoLinea[]
}

function enElCamino(estado: Estado): estado is EstadoDelCamino {
  return CAMINO_PRINCIPAL.some((paso) => paso === estado)
}

/**
 * El backend no envía quién hizo cada cambio al solicitante (minimización, README §8). Se
 * DERIVA de la máquina: cada transición tiene un único rol (PRD §5.5). La perspectiva
 * solo elige el nombre con que se muestra ese rol.
 */
export function actorDe(desde: Estado, hacia: Estado, perspectiva: Perspectiva): Actor | null {
  const transicion = TRANSICIONES.find((t) => t.origen === desde && t.destino === hacia)
  if (transicion === undefined) return null
  return ACTORES[perspectiva][transicion.rol]
}

function motivoDe(log: LogSolicitante, perspectiva: Perspectiva): MotivoEvento | null {
  if (log.motivo_rechazo !== null) return { etiqueta: ETIQUETA_MOTIVO_RECHAZO, texto: log.motivo_rechazo }
  if (log.motivo_reprogramacion !== null) {
    return { etiqueta: ETIQUETAS_MOTIVO_PROPUESTA[perspectiva], texto: log.motivo_reprogramacion }
  }
  return null
}

/** Copia ordenada por fecha: el contrato promete orden ascendente, pero la vista no depende de ello. */
function ordenarPorFecha(logs: readonly LogSolicitante[]): LogSolicitante[] {
  return [...logs].sort((a, b) => Date.parse(a.fecha_modificacion) - Date.parse(b.fecha_modificacion))
}

/** El último log que cumple la condición (`findLast` es ES2023 y el proyecto compila con ES2022). */
function ultimoLog(ordenados: readonly LogSolicitante[], condicion: (log: LogSolicitante) => boolean): LogSolicitante | null {
  for (let i = ordenados.length - 1; i >= 0; i -= 1) {
    const log = ordenados[i]
    if (log !== undefined && condicion(log)) return log
  }
  return null
}

export function lineaDeVida(
  { estado, logs }: { estado: Estado; logs: readonly LogSolicitante[] },
  perspectiva: Perspectiva,
): LineaDeVida {
  const ordenados = ordenarPorFecha(logs)

  const fechaDe = (paso: EstadoDelCamino): string | null =>
    ultimoLog(ordenados, (log) => log.estado_nuevo === paso)?.fecha_modificacion ?? null

  // Hasta dónde llegó por el camino principal (para un estado fuera de él).
  const alcanzado = CAMINO_PRINCIPAL.reduce(
    (maximo, paso, indice) => (ordenados.some((log) => log.estado_nuevo === paso) ? indice : maximo),
    0,
  )

  const situacionDe = (indice: number): SituacionPaso => {
    if (enElCamino(estado)) {
      const actual = CAMINO_PRINCIPAL.indexOf(estado)
      if (indice < actual) return 'completado'
      if (indice === actual) return esEstadoFinal(estado) ? 'completado' : 'actual'
      return 'pendiente'
    }
    if (indice <= alcanzado) return 'completado'
    return esEstadoFinal(estado) ? 'omitido' : 'pendiente'
  }

  return {
    pasos: CAMINO_PRINCIPAL.map((paso, indice) => ({ estado: paso, situacion: situacionDe(indice), fecha: fechaDe(paso) })),
    desvio: enElCamino(estado) ? null : estado,
    eventos: ordenados.map((log) => ({
      desde: log.estado_anterior,
      hacia: log.estado_nuevo,
      fecha: log.fecha_modificacion,
      actor: actorDe(log.estado_anterior, log.estado_nuevo, perspectiva),
      motivo: motivoDe(log, perspectiva),
    })),
  }
}

/** Motivo de la propuesta vigente (B4): el del último cambio a "Pendiente de Reprogramación". */
export function motivoDeLaPropuesta(logs: readonly LogSolicitante[]): string | null {
  const propuesta = ultimoLog(ordenarPorFecha(logs), (log) => log.estado_nuevo === 'Pendiente de Reprogramación')
  return propuesta?.motivo_reprogramacion ?? null
}
