import { describe, expect, it } from 'vitest'
import { CATEGORIAS, SUB_ESPACIOS } from '../api/esquemas'
import { ESTADOS, ROLES } from '../api/maquina-estados'
import {
  ALIAS_DE_ESTADO,
  AYUDAS_SUB_ESPACIO,
  ETIQUETAS_CATEGORIA,
  ETIQUETAS_CORTAS_SUB_ESPACIO,
  ETIQUETAS_SUB_ESPACIO,
  etiquetaEstado,
} from './etiquetas'

describe('ETIQUETAS_CATEGORIA', () => {
  it('cada categoría del contrato tiene un nombre legible, y no se repiten', () => {
    const etiquetas = CATEGORIAS.map((c) => ETIQUETAS_CATEGORIA[c])
    expect(etiquetas.every((e) => e.trim() !== '')).toBe(true)
    expect(new Set(etiquetas).size).toBe(CATEGORIAS.length)
  })

  it('Fase 8 · requisito 5: VIDEO se presenta como "Dirección audiovisual y producción"', () => {
    expect(ETIQUETAS_CATEGORIA.VIDEO).toBe('Dirección audiovisual y producción')
  })
})

describe('etiquetaEstado (Fase 8 · requisitos 1 y 2)', () => {
  it('"Validado" se lee "Confirmado" para el solicitante y "Revisado y aprobado" para el Staff', () => {
    expect(etiquetaEstado('Validado', 'SOLICITANTE')).toBe('Confirmado')
    expect(etiquetaEstado('Validado', 'STAFF')).toBe('Revisado y aprobado')
  })

  it('solo "Validado" tiene alias: los demás estados se muestran con su nombre en las dos perspectivas', () => {
    for (const rol of ROLES) {
      for (const estado of ESTADOS.filter((e) => e !== 'Validado')) {
        expect(etiquetaEstado(estado, rol)).toBe(estado)
      }
    }
  })

  it('en cada perspectiva los nombres visibles no se repiten, y ningún alias es el nombre de otro estado', () => {
    for (const rol of ROLES) {
      expect(new Set(ESTADOS.map((estado) => etiquetaEstado(estado, rol))).size).toBe(ESTADOS.length)
    }
    for (const alias of ROLES.flatMap((rol) => Object.values(ALIAS_DE_ESTADO[rol]))) {
      expect(ESTADOS).not.toContain(alias)
    }
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
