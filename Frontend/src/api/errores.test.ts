import { describe, expect, it } from 'vitest'
import { TEXTO_CONTRATO, TEXTO_SESION_EXPIRADA, TEXTO_SIN_CONEXION, textoDeError } from './errores'

describe('textoDeError', () => {
  it('http: los mensajes del servidor, tal cual y unidos', () => {
    expect(textoDeError({ tipo: 'http', status: 400, mensajes: ['Uno.', 'Dos.'], requiereRecarga: false })).toBe('Uno. Dos.')
  })

  it.each([
    ['sesion-expirada', TEXTO_SESION_EXPIRADA],
    ['red', TEXTO_SIN_CONEXION],
    ['contrato', TEXTO_CONTRATO],
  ] as const)('%s: su texto propio', (tipo, texto) => {
    expect(textoDeError({ tipo })).toBe(texto)
  })
})
