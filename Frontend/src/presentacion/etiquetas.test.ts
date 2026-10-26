import { describe, expect, it } from 'vitest'
import { CATEGORIAS, SUB_ESPACIOS } from '../api/esquemas'
import { AYUDAS_SUB_ESPACIO, ETIQUETAS_CATEGORIA, ETIQUETAS_CORTAS_SUB_ESPACIO, ETIQUETAS_SUB_ESPACIO } from './etiquetas'

describe('ETIQUETAS_CATEGORIA', () => {
  it('cada categoría del contrato tiene un nombre legible, y no se repiten', () => {
    const etiquetas = CATEGORIAS.map((c) => ETIQUETAS_CATEGORIA[c])
    expect(etiquetas.every((e) => e.trim() !== '')).toBe(true)
    expect(new Set(etiquetas).size).toBe(CATEGORIAS.length)
  })
})

describe('Sub-espacios (Fase 7 · PRD v2.2 §5.1)', () => {
  it('usan los nombres oficiales confirmados por el Responsable del Estudio C (Q-A1)', () => {
    expect(ETIQUETAS_SUB_ESPACIO).toEqual({
      CABINA_AUDIO: 'Espacio de grabación de audio, cabina insonorizada',
      ESTUDIO_GRABACION: 'Estudio de grabación, video y fotografía',
      ESTUDIO_COMPLETO: 'Estudio C completo',
    })
  })

  it.each([ETIQUETAS_SUB_ESPACIO, ETIQUETAS_CORTAS_SUB_ESPACIO, AYUDAS_SUB_ESPACIO])(
    'cada sub-espacio tiene su texto, sin repetirse (%#)',
    (textos) => {
      const valores = SUB_ESPACIOS.map((s) => textos[s])
      expect(valores.every((v) => v.trim() !== '')).toBe(true)
      expect(new Set(valores).size).toBe(SUB_ESPACIOS.length)
    },
  )
})
