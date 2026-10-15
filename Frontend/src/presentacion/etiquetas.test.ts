import { describe, expect, it } from 'vitest'
import { CATEGORIAS } from '../api/esquemas'
import { ETIQUETAS_CATEGORIA } from './etiquetas'

describe('ETIQUETAS_CATEGORIA', () => {
  it('cada categoría del contrato tiene un nombre legible, y no se repiten', () => {
    const etiquetas = CATEGORIAS.map((c) => ETIQUETAS_CATEGORIA[c])
    expect(etiquetas.every((e) => e.trim() !== '')).toBe(true)
    expect(new Set(etiquetas).size).toBe(CATEGORIAS.length)
  })
})
