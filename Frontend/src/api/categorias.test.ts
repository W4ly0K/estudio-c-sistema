import { describe, expect, it } from 'vitest'
import { transicionAplicaALaCategoria } from './categorias'
import { CATEGORIAS } from './esquemas'
import { TRANSICIONES } from './maquina-estados'

/** ORÁCULO (directriz del tutor, requisito 3): PODCAST y VIDEO pasan por edición; las demás, no. */
const CON_EDICION: readonly string[] = ['PODCAST', 'VIDEO']
const CON_REGLA_PROPIA: readonly string[] = ['T9', 'T11', 'T12']

describe('transicionAplicaALaCategoria (copia de la vista · Fase 8)', () => {
  it.each(CATEGORIAS)('%s: T9 solo sin edición; T11 y T12 solo con edición; el resto, siempre', (categoria) => {
    const conEdicion = CON_EDICION.includes(categoria)
    expect(transicionAplicaALaCategoria('T9', categoria)).toBe(!conEdicion)
    expect(transicionAplicaALaCategoria('T11', categoria)).toBe(conEdicion)
    expect(transicionAplicaALaCategoria('T12', categoria)).toBe(conEdicion)
    for (const { id } of TRANSICIONES.filter((t) => !CON_REGLA_PROPIA.includes(t.id))) {
      expect(transicionAplicaALaCategoria(id, categoria)).toBe(true)
    }
  })

  it('cada categoría tiene exactamente una salida desde "En Producción"', () => {
    for (const categoria of CATEGORIAS) {
      const salidas = TRANSICIONES.filter((t) => t.origen === 'En Producción' && transicionAplicaALaCategoria(t.id, categoria))
      expect(salidas).toHaveLength(1)
    }
  })
})
