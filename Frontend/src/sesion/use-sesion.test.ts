import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FuncionFetch } from '../api/cliente'
import { TEXTO_SESION_EXPIRADA } from '../api/errores'
import { json } from '../test/fixtures-api'
import { useSesion } from './use-sesion'

const API = 'http://api.prueba.local' // VITE_API_URL de vitest.config.ts
const CLAVE = 'estudio_c_token'
const USUARIO = { id: 'uuid', nombre: 'Ana Pérez', rol: 'SOLICITANTE' }
const LOGIN = { mensaje: 'Autenticación exitosa', token: 'jwt-nuevo', usuario: USUARIO }

/** fetch falso: cada ruta responde con la siguiente respuesta de su lista (o con la última). */
function servidor(rutas: Record<string, Array<() => Promise<Response>>>) {
  const llamadasPorRuta = new Map<string, number>()
  return vi.fn<FuncionFetch>(async (url) => {
    const ruta = url.replace(API, '')
    const respuestas = rutas[ruta]
    if (respuestas === undefined) throw new Error(`Ruta no esperada: ${ruta}`)
    const n = llamadasPorRuta.get(ruta) ?? 0
    llamadasPorRuta.set(ruta, n + 1)
    const respuesta = respuestas[Math.min(n, respuestas.length - 1)]
    if (respuesta === undefined) throw new Error(`Sin respuesta para ${ruta}`)
    return respuesta()
  })
}

const ok = (cuerpo: unknown) => () => Promise.resolve(json(200, cuerpo))
const caida = () => Promise.reject(new TypeError('Failed to fetch'))

describe('useSesion (DS3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sin token: anónima de inmediato, sin llamar al servidor', () => {
    const fetch = servidor({})

    const { result } = renderHook(() => useSesion({ fetch }))

    expect(result.current.sesion).toEqual({ estado: 'anonima', aviso: null })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('con token válido: verificando → autenticada, con el perfil del servidor y sin pedir login', async () => {
    localStorage.setItem(CLAVE, 'jwt-guardado')
    const fetch = servidor({ '/auth/perfil': [ok(USUARIO)] })

    const { result } = renderHook(() => useSesion({ fetch }))

    expect(result.current.sesion.estado).toBe('verificando')
    await waitFor(() => expect(result.current.sesion).toEqual({ estado: 'autenticada', usuario: USUARIO }))
    expect(fetch.mock.calls[0]?.[1].headers).toMatchObject({ Authorization: 'Bearer jwt-guardado' })
  })

  it('con token vencido (401): anónima con el aviso, y el token se borra', async () => {
    localStorage.setItem(CLAVE, 'jwt-vencido')
    const fetch = servidor({ '/auth/perfil': [() => Promise.resolve(json(401, { statusCode: 401, message: 'Unauthorized' }))] })

    const { result } = renderHook(() => useSesion({ fetch }))

    await waitFor(() => expect(result.current.sesion).toEqual({ estado: 'anonima', aviso: TEXTO_SESION_EXPIRADA }))
    expect(localStorage.getItem(CLAVE)).toBeNull()
  })

  it.each([
    ['sin red', caida],
    ['con un 500', () => Promise.resolve(json(500, { statusCode: 500, message: 'Internal server error' }))],
  ])('servidor %s: sin-conexion y el token se CONSERVA; reintentar lo verifica de nuevo', async (_caso, falla) => {
    localStorage.setItem(CLAVE, 'jwt-guardado')
    const fetch = servidor({ '/auth/perfil': [falla, ok(USUARIO)] })

    const { result } = renderHook(() => useSesion({ fetch }))

    await waitFor(() => expect(result.current.sesion.estado).toBe('sin-conexion'))
    expect(localStorage.getItem(CLAVE)).toBe('jwt-guardado')

    act(() => result.current.reintentar())

    await waitFor(() => expect(result.current.sesion).toEqual({ estado: 'autenticada', usuario: USUARIO }))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('iniciarSesion correcto: guarda el token y pasa a autenticada', async () => {
    const fetch = servidor({ '/auth/google/login': [() => Promise.resolve(json(201, LOGIN))] })
    const { result } = renderHook(() => useSesion({ fetch }))

    let error: unknown = 'sin ejecutar'
    await act(async () => {
      error = await result.current.iniciarSesion('credencial-de-google')
    })

    expect(error).toBeNull()
    expect(result.current.sesion).toEqual({ estado: 'autenticada', usuario: USUARIO })
    expect(localStorage.getItem(CLAVE)).toBe('jwt-nuevo')
  })

  it('iniciarSesion rechazado: devuelve el error para mostrarlo y sigue anónima', async () => {
    const mensaje = 'Acceso denegado: Solo se permiten correos institucionales de UNICESMAG.'
    const fetch = servidor({ '/auth/google/login': [() => Promise.resolve(json(401, { statusCode: 401, message: mensaje }))] })
    const { result } = renderHook(() => useSesion({ fetch }))

    let error: unknown = null
    await act(async () => {
      error = await result.current.iniciarSesion('credencial-de-google')
    })

    expect(error).toMatchObject({ tipo: 'http', status: 401, mensajes: [mensaje] })
    expect(result.current.sesion.estado).toBe('anonima')
    expect(localStorage.getItem(CLAVE)).toBeNull()
  })

  it('cerrarSesion: borra el token y queda anónima, sin aviso', async () => {
    localStorage.setItem(CLAVE, 'jwt-guardado')
    const fetch = servidor({ '/auth/perfil': [ok(USUARIO)] })
    const { result } = renderHook(() => useSesion({ fetch }))
    await waitFor(() => expect(result.current.sesion.estado).toBe('autenticada'))

    act(() => result.current.cerrarSesion())

    expect(result.current.sesion).toEqual({ estado: 'anonima', aviso: null })
    expect(localStorage.getItem(CLAVE)).toBeNull()
  })

  it('un 401 en cualquier ruta privada (no solo el perfil) cierra la sesión con el aviso', async () => {
    localStorage.setItem(CLAVE, 'jwt-guardado')
    const fetch = servidor({
      '/auth/perfil': [ok(USUARIO)],
      '/solicitudes/mis-solicitudes': [() => Promise.resolve(json(401, { statusCode: 401, message: 'Unauthorized' }))],
    })
    const { result } = renderHook(() => useSesion({ fetch }))
    await waitFor(() => expect(result.current.sesion.estado).toBe('autenticada'))

    await act(async () => {
      await result.current.api.solicitudes.misSolicitudes()
    })

    expect(result.current.sesion).toEqual({ estado: 'anonima', aviso: TEXTO_SESION_EXPIRADA })
    expect(localStorage.getItem(CLAVE)).toBeNull()
  })

  it('la api es la MISMA entre renders (si cambiara, los efectos que dependen de ella se repetirían)', async () => {
    localStorage.setItem(CLAVE, 'jwt-guardado')
    const fetch = servidor({ '/auth/perfil': [ok(USUARIO)] })
    const { result } = renderHook(() => useSesion({ fetch }))
    const apiInicial = result.current.api

    await waitFor(() => expect(result.current.sesion.estado).toBe('autenticada'))

    expect(result.current.api).toBe(apiInicial)
  })
})
