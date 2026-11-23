import { ESTADOS, ESTADOS_FINALES, type Estado } from '../api/maquina-estados'

/**
 * Tablero del Staff (paso 6.5.1 · DE3). Función pura: agrupa en el cliente lo que trae
 * UN solo GET /solicitudes; la vista solo pinta lo que devuelve.
 *
 * La PERTENENCIA de un estado a una columna es una regla y se deriva de la máquina: las
 * cerradas son ESTADOS_FINALES y la prueba exige que las activas sean exactamente los
 * estados no finales. El ORDEN de las columnas es una decisión de presentación (el flujo
 * de lectura del Staff) y por eso se declara aquí.
 */
export const COLUMNAS_ACTIVAS = [
  'Recibido',
  'Validado',
  'Pendiente de Reprogramación',
  'En Producción',
  // Fase 8: la edición sigue a la producción en el flujo de lectura del Staff.
  'Edición y postproducción',
] as const satisfies readonly Estado[]

/** Lo mínimo que se necesita para agrupar y ordenar (genérica: se prueba sin el esquema completo). */
export interface Ordenable {
  readonly radicado: string
  readonly estado: Estado
  readonly es_urgencia: boolean
  readonly fecha_inicio: string
}

export interface ColumnaTablero<T> {
  readonly estado: Estado
  readonly solicitudes: readonly T[]
}

export interface Tablero<T> {
  /** Siempre las 5 columnas, en orden, aunque estén vacías: el tablero no "salta". */
  readonly activas: readonly ColumnaTablero<T>[]
  /** Una columna por estado final, para la sección plegada. */
  readonly cerradas: readonly ColumnaTablero<T>[]
  /** Urgentes que esperan revisión (Recibido): el aviso de "atención requerida" (DT2). */
  readonly urgentesEnRecibido: number
}

/**
 * Compara INSTANTES, no textos: "09:00-05:00" (14:00 Z) es posterior a "13:00Z", aunque
 * como texto sea menor. Una fecha ilegible no rompe el orden (NaN haría inconsistente
 * al comparador): va al final, en cualquier sentido.
 * Exportada en la Fase 7 (C3): el inicio ordena con el MISMO criterio que el tablero.
 */
export function compararInstantes(a: string, b: string, sentido: 1 | -1): number {
  const instanteA = Date.parse(a)
  const instanteB = Date.parse(b)
  const aIlegible = Number.isNaN(instanteA)
  const bIlegible = Number.isNaN(instanteB)
  if (aIlegible || bIlegible) {
    if (aIlegible === bIlegible) return 0
    return aIlegible ? 1 : -1
  }
  return (instanteA - instanteB) * sentido
}

/** Desempate determinista por unidades de código (no depende del idioma del navegador). */
export function compararRadicados(a: { readonly radicado: string }, b: { readonly radicado: string }): number {
  if (a.radicado === b.radicado) return 0
  return a.radicado < b.radicado ? -1 : 1
}

/** Activas (DE3): urgentes primero, luego la franja más próxima, luego el radicado. */
function compararActivas(a: Ordenable, b: Ordenable): number {
  if (a.es_urgencia !== b.es_urgencia) return a.es_urgencia ? -1 : 1
  return compararInstantes(a.fecha_inicio, b.fecha_inicio, 1) || compararRadicados(a, b)
}

/** Cerradas (DT1): historial, la más reciente arriba; la urgencia ya no importa. */
function compararCerradas(a: Ordenable, b: Ordenable): number {
  return compararInstantes(a.fecha_inicio, b.fecha_inicio, -1) || compararRadicados(a, b)
}

export function agruparTablero<T extends Ordenable>(solicitudes: readonly T[]): Tablero<T> {
  // Un cajón por CADA estado de la máquina: ninguna solicitud puede quedarse sin lugar.
  const cajones = new Map<Estado, T[]>(ESTADOS.map((estado) => [estado, []]))
  for (const solicitud of solicitudes) cajones.get(solicitud.estado)?.push(solicitud)

  // Copia antes de ordenar: sort() muta y la entrada es del llamador (ES2022: sin toSorted).
  const columna = (estado: Estado, comparar: (a: T, b: T) => number): ColumnaTablero<T> => ({
    estado,
    solicitudes: [...(cajones.get(estado) ?? [])].sort(comparar),
  })

  return {
    activas: COLUMNAS_ACTIVAS.map((estado) => columna(estado, compararActivas)),
    cerradas: ESTADOS_FINALES.map((estado) => columna(estado, compararCerradas)),
    urgentesEnRecibido: (cajones.get('Recibido') ?? []).filter((s) => s.es_urgencia).length,
  }
}

/** `null` cuando no hay urgentes: la vista no pinta un aviso vacío (DT2). */
export function textoUrgentes(cantidad: number): string | null {
  if (cantidad <= 0) return null
  return cantidad === 1
    ? '1 solicitud urgente espera revisión.'
    : `${cantidad} solicitudes urgentes esperan revisión.`
}
