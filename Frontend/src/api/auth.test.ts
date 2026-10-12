import { describe, expect, it } from 'vitest'
import { crearApiAuth } from './auth'
import { BASE, crearEntornoDePrueba, json } from '../test/fixtures-api'

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
})
