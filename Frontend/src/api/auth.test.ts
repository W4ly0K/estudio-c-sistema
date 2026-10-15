import { describe, expect, it } from 'vitest'
import { crearApiAuth } from './auth'
import { BASE, TOKEN, crearEntornoDePrueba, json } from '../test/fixtures-api'

const LOGIN = { mensaje: 'Autenticación exitosa', token: 'jwt-nuevo', usuario: { id: 'uuid', nombre: 'Ana', rol: 'SOLICITANTE' } }

describe('crearApiAuth', () => {
  it('loginConGoogle → POST /auth/google/login con { token } y sin Authorization', async () => {
    const { cliente, llamada, encabezados } = crearEntornoDePrueba(json(201, LOGIN))

    const resultado = await crearApiAuth(cliente).loginConGoogle('credencial-de-google')

    expect(resultado).toEqual({ ok: true, datos: { token: 'jwt-nuevo', usuario: LOGIN.usuario } })
    expect(llamada().url).toBe(`${BASE}/auth/google/login`)
    expect(JSON.parse(String(llamada().init.body))).toEqual({ token: 'credencial-de-google' })
    expect(encabezados()).not.toHaveProperty('Authorization')
  })

  it('funciona sin sesión previa: es la ruta que la crea', async () => {
    const { cliente, sesion, fetchFalso } = crearEntornoDePrueba(json(201, LOGIN))
    sesion.token = null

    const resultado = await crearApiAuth(cliente).loginConGoogle('credencial-de-google')

    expect(resultado.ok).toBe(true)
    expect(fetchFalso).toHaveBeenCalledOnce()
  })

  it('un correo fuera del dominio (401) es un error con su mensaje, no una sesión vencida', async () => {
    const mensaje = 'Acceso restringido al dominio @unicesmag.edu.co'
    const { cliente, alExpirarSesion } = crearEntornoDePrueba(json(401, { statusCode: 401, message: mensaje }))

    const resultado = await crearApiAuth(cliente).loginConGoogle('credencial-de-google')

    expect(!resultado.ok && resultado.error).toMatchObject({ tipo: 'http', status: 401, mensajes: [mensaje] })
    expect(alExpirarSesion).not.toHaveBeenCalled()
  })

  it('perfil → GET /auth/perfil con el token y el mismo esquema del usuario del login', async () => {
    const { cliente, llamada, encabezados } = crearEntornoDePrueba(json(200, LOGIN.usuario))

    const resultado = await crearApiAuth(cliente).perfil()

    expect(resultado).toEqual({ ok: true, datos: LOGIN.usuario })
    expect(llamada().url).toBe(`${BASE}/auth/perfil`)
    expect(llamada().init.method).toBe('GET')
    expect(encabezados().Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('perfil con un token vencido (401): sesión expirada, como cualquier ruta privada', async () => {
    const { cliente, alExpirarSesion } = crearEntornoDePrueba(json(401, { statusCode: 401, message: 'Unauthorized' }))

    expect(await crearApiAuth(cliente).perfil()).toEqual({ ok: false, error: { tipo: 'sesion-expirada' } })
    expect(alExpirarSesion).toHaveBeenCalledOnce()
  })
})
