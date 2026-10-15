import { describe, expect, it } from 'vitest'
import {
  LIMITES_MOTIVO_RECHAZO,
  evaluarMotivo,
  longitudReal,
  motivoParaEnviar,
  textoContador,
} from './motivo'

const LIMITES = LIMITES_MOTIVO_RECHAZO

describe('motivo: se mide como el backend (6.5.3 · DA3)', () => {
  it('cuenta caracteres reales sobre el texto recortado (un emoji vale 1)', () => {
    expect(longitudReal('  hola  ')).toBe(4)
    expect('🎬'.repeat(5)).toHaveLength(10) // lo que contaría String.length
    expect(longitudReal('🎬'.repeat(5))).toBe(5)
    expect(longitudReal('Ñandú')).toBe(5)
  })

  it('lo que se envía es el mismo texto que mide el contador', () => {
    expect(motivoParaEnviar('\n  El set está en mantenimiento  \t')).toBe('El set está en mantenimiento')
  })

  it.each([
    ['vacío', '', 'vacio'],
    ['solo espacios', ' '.repeat(12), 'vacio'],
    ['9 caracteres entre espacios', `   ${'x'.repeat(9)}   `, 'corto'],
    ['5 emojis (10 unidades de JavaScript)', '🎬'.repeat(5), 'corto'],
    ['501 caracteres', 'x'.repeat(501), 'largo'],
  ])('inválido: %s', (_caso, texto, estado) => {
    expect(evaluarMotivo(texto, LIMITES)).toMatchObject({ estado, valido: false })
  })

  it.each([
    ['10 caracteres', 'x'.repeat(10)],
    ['500 caracteres', 'x'.repeat(500)],
    ['10 emojis', '🎬'.repeat(10)],
    ['10 caracteres con espacios en los extremos', `  ${'x'.repeat(10)}  `],
  ])('válido (límites exactos, contados como el motor): %s', (_caso, texto) => {
    expect(evaluarMotivo(texto, LIMITES)).toMatchObject({ estado: 'valido', valido: true })
  })
})

describe('textoContador', () => {
  const contador = (texto: string) => textoContador(evaluarMotivo(texto, LIMITES), LIMITES)

  it('dice qué falta, cuánto lleva o qué sobra (singular y plural)', () => {
    expect(contador('')).toBe('Escribe entre 10 y 500 caracteres.')
    expect(contador('x'.repeat(9))).toBe('Falta 1 carácter para el mínimo de 10.')
    expect(contador('x'.repeat(7))).toBe('Faltan 3 caracteres para el mínimo de 10.')
    expect(contador('x'.repeat(12))).toBe('12 / 500 caracteres.')
    expect(contador('x'.repeat(501))).toBe('Sobra 1 carácter: el máximo es 500.')
    expect(contador('x'.repeat(504))).toBe('Sobran 4 caracteres: el máximo es 500.')
  })
})
