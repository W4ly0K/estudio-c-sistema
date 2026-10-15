/**
 * Detalle del Staff (C3 · 6.5.2). Funciones puras de la vista: se prueban sin React.
 */

/** Lo mínimo de un recurso de la proyección del Staff (README del backend §8). */
export interface RecursoDelDetalle {
  readonly id_detalle: string
  readonly cantidad_solicitada: number
  readonly recurso: { readonly nombre: string; readonly cantidad_total: number }
}

export interface FilaRecurso {
  readonly id: string
  readonly nombre: string
  readonly solicitada: number
  readonly inventarioTotal: number
  /** Pedir más de lo que existe es imposible en cualquier franja: es lo único que se alerta. */
  readonly superaInventario: boolean
}

/**
 * DD3 · UI honesta: la proyección trae el inventario TOTAL, no la disponibilidad en la
 * franja (que depende de otras reservas). Por eso solo se alerta lo que el dato sostiene:
 * una cantidad mayor que el total. Pedir exactamente el total no es una alerta.
 */
export function filasDeRecursos(recursos: readonly RecursoDelDetalle[]): readonly FilaRecurso[] {
  return recursos.map((r) => ({
    id: r.id_detalle,
    nombre: r.recurso.nombre,
    solicitada: r.cantidad_solicitada,
    inventarioTotal: r.recurso.cantidad_total,
    superaInventario: r.cantidad_solicitada > r.recurso.cantidad_total,
  }))
}
