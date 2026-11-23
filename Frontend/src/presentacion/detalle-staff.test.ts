import { describe, expect, it } from 'vitest'
import { filasDeRecursos, type RecursoDelDetalle } from './detalle-staff'

const recurso = (id: string, solicitada: number, total: number): RecursoDelDetalle => ({
  id_detalle: id,
  cantidad_solicitada: solicitada,
  recurso: { nombre: `Recurso ${id}`, cantidad_total: total },
})

describe('filasDeRecursos (C3 · DD3)', () => {
  it('traduce cada recurso a una fila con lo solicitado y el inventario total', () => {
    expect(filasDeRecursos([recurso('a', 2, 6)])).toEqual([
      { id: 'a', nombre: 'Recurso a', solicitada: 2, inventarioTotal: 6, superaInventario: false },
    ])
  })

  it('límite exacto: pedir el total no alerta; pedir uno más, sí', () => {
    const filas = filasDeRecursos([recurso('igual', 6, 6), recurso('mas', 7, 6)])

    expect(filas.map((f) => [f.id, f.superaInventario])).toEqual([
      ['igual', false],
      ['mas', true],
    ])
  })

  it('sin recursos: ninguna fila', () => {
    expect(filasDeRecursos([])).toEqual([])
  })
})
