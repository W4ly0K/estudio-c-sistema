import { afterEach, describe, expect, it, vi } from 'vitest'
import { borrarToken, guardarToken, leerToken } from './token'

describe('token de la sesión (DF2)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('guarda, lee y borra el token', () => {
    guardarToken('jwt')
    expect(leerToken()).toBe('jwt')
    borrarToken()
    expect(leerToken()).toBeNull()
  })

  it('si el almacenamiento falla, se comporta como "sin sesión" y no lanza', () => {
    const fallo = () => {
      throw new DOMException('Almacenamiento bloqueado', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fallo)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fallo)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(fallo)

    expect(() => guardarToken('jwt')).not.toThrow()
    expect(leerToken()).toBeNull()
    expect(() => borrarToken()).not.toThrow()
  })
})
