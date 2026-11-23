import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { MENSAJE_ERROR_SERVIDOR, mensajeSinDetalle, type PeticionApi } from './cliente'
import { esquemaSolicitud } from './esquemas'
import { MENSAJE_CAMBIO_CONCURRENTE } from './mensajes'
import { BASE, SOLICITUD, TOKEN, crearEntornoDePrueba, json } from '../test/fixtures-api'

const GET: PeticionApi<z.infer<typeof esquemaSolicitud>> = { metodo: 'GET', ruta: '/solicitudes/EC-1', esquema: esquemaSolicitud }

describe('crearClienteApi (DC2, DC3 y DC5)', () => {
  let consolaDeError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Los contratos rotos se registran en consola: se silencia y se verifica cuando importa.
    consolaDeError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consolaDeError.mockRestore()
  })

  describe('la petición', () => {
    it('GET privado: URL completa, token del portador y sin cuerpo', async () => {
      const { cliente, llamada, encabezados } = crearEntornoDePrueba(json(200, SOLICITUD))

      const resultado = await cliente.solicitar(GET)

      expect(resultado).toEqual({ ok: true, datos: SOLICITUD })
      expect(llamada().url).toBe(`${BASE}/solicitudes/EC-1`)
      expect(llamada().init.method).toBe('GET')
      expect(llamada().init.body).toBeUndefined()
      expect(encabezados()).toEqual({ Accept: 'application/json', Authorization: `Bearer ${TOKEN}` })
    })

    it('con cuerpo: lo serializa como JSON y declara el Content-Type', async () => {
      const { cliente, llamada, encabezados } = crearEntornoDePrueba(json(201, SOLICITUD))

      await cliente.solicitar({ ...GET, metodo: 'POST', ruta: '/solicitudes', cuerpo: { proposito: 'Podcast' } })

      expect(llamada().init.body).toBe('{"proposito":"Podcast"}')
      expect(encabezados()['Content-Type']).toBe('application/json')
    })

    it('consulta el token en CADA petición: no guarda una copia vieja', async () => {
      const { cliente, sesion, encabezados } = crearEntornoDePrueba(() => Promise.resolve(json(200, SOLICITUD)))

      await cliente.solicitar(GET)
      sesion.token = 'jwt-renovado'
      await cliente.solicitar(GET)

      expect(encabezados(0).Authorization).toBe(`Bearer ${TOKEN}`)
      expect(encabezados(1).Authorization).toBe('Bearer jwt-renovado')
    })

    it('ruta privada sin token: no envía nada y cierra la sesión (fail-closed)', async () => {
      const { cliente, fetchFalso, sesion, alExpirarSesion } = crearEntornoDePrueba(json(200, SOLICITUD))
      sesion.token = null

      const resultado = await cliente.solicitar(GET)

      expect(resultado).toEqual({ ok: false, error: { tipo: 'sesion-expirada' } })
      expect(fetchFalso).not.toHaveBeenCalled()
      expect(alExpirarSesion).toHaveBeenCalledOnce()
    })

    it('ruta pública: nunca envía el token, aunque exista', async () => {
      const { cliente, encabezados } = crearEntornoDePrueba(json(200, SOLICITUD))

      await cliente.solicitar({ ...GET, publica: true })

      expect(encabezados()).not.toHaveProperty('Authorization')
    })
  })

  describe('la respuesta 2xx', () => {
    it('descarta los campos no declarados (lector tolerante)', async () => {
      const { cliente } = crearEntornoDePrueba(json(200, { ...SOLICITUD, id_usuario: 'uuid' }))

      const resultado = await cliente.solicitar(GET)

      expect(resultado.ok && resultado.datos).not.toHaveProperty('id_usuario')
    })

    it.each([
      ['un estado fuera del diagrama', json(200, { ...SOLICITUD, estado: 'Aprobado' })],
      ['un cuerpo que no es JSON', new Response('<html>ok</html>', { status: 200 })],
      ['un cuerpo vacío', new Response(null, { status: 200 })],
    ])('con %s → error de contrato, registrado en consola sin los datos', async (_caso, respuesta) => {
      const { cliente } = crearEntornoDePrueba(respuesta)

      const resultado = await cliente.solicitar(GET)

      expect(resultado).toEqual({ ok: false, error: { tipo: 'contrato' } })
      expect(consolaDeError).toHaveBeenCalledOnce()
      expect(JSON.stringify(consolaDeError.mock.calls)).not.toContain('Grabación del episodio piloto')
    })
  })

  describe('los errores', () => {
    it('400 del ValidationPipe: conserva la lista de mensajes', async () => {
      const { cliente } = crearEntornoDePrueba(json(400, { statusCode: 400, message: ['uno', 'dos'], error: 'Bad Request' }))

      expect(await cliente.solicitar(GET)).toEqual({
        ok: false,
        error: { tipo: 'http', status: 400, mensajes: ['uno', 'dos'], requiereRecarga: false },
      })
    })

    it('409 del servicio: el texto pasa a ser una lista de un elemento', async () => {
      const mensaje = 'La solicitud está en un estado final y no admite cambios de estado.'
      const { cliente } = crearEntornoDePrueba(json(409, { statusCode: 409, message: mensaje, error: 'Conflict' }))

      expect(await cliente.solicitar(GET)).toEqual({
        ok: false,
        error: { tipo: 'http', status: 409, mensajes: [mensaje], requiereRecarga: false },
      })
    })

    it('409 de cambio concurrente: requiereRecarga (DC5)', async () => {
      const { cliente } = crearEntornoDePrueba(json(409, { statusCode: 409, message: MENSAJE_CAMBIO_CONCURRENTE }))

      const resultado = await cliente.solicitar(GET)

      expect(!resultado.ok && resultado.error).toMatchObject({ tipo: 'http', status: 409, requiereRecarga: true })
    })

    it('401 en ruta privada: cierra la sesión una sola vez y no expone el mensaje', async () => {
      const { cliente, alExpirarSesion } = crearEntornoDePrueba(json(401, { statusCode: 401, message: 'Unauthorized' }))

      expect(await cliente.solicitar(GET)).toEqual({ ok: false, error: { tipo: 'sesion-expirada' } })
      expect(alExpirarSesion).toHaveBeenCalledOnce()
    })

    it('401 en ruta pública: es un error normal con su mensaje y NO cierra la sesión', async () => {
      const mensaje = 'Acceso restringido al dominio institucional'
      const { cliente, alExpirarSesion } = crearEntornoDePrueba(json(401, { statusCode: 401, message: mensaje }))

      const resultado = await cliente.solicitar({ ...GET, publica: true })

      expect(!resultado.ok && resultado.error).toMatchObject({ tipo: 'http', status: 401, mensajes: [mensaje] })
      expect(alExpirarSesion).not.toHaveBeenCalled()
    })

    it.each([
      ['un 500 de NestJS', json(500, { statusCode: 500, message: 'Internal server error' })],
      ['un 502 con HTML de un proxy', new Response('<html>Bad Gateway</html>', { status: 502 })],
    ])('5xx (%s): mensaje genérico, nunca el texto del servidor', async (_caso, respuesta) => {
      const { cliente } = crearEntornoDePrueba(respuesta)

      const resultado = await cliente.solicitar(GET)

      expect(!resultado.ok && resultado.error).toMatchObject({ tipo: 'http', mensajes: [MENSAJE_ERROR_SERVIDOR] })
    })

    it('4xx sin un cuerpo de NestJS: mensaje con el código', async () => {
      const { cliente } = crearEntornoDePrueba(new Response('Not Found', { status: 404 }))

      const resultado = await cliente.solicitar(GET)

      expect(!resultado.ok && resultado.error).toMatchObject({ tipo: 'http', status: 404, mensajes: [mensajeSinDetalle(404)] })
    })

    it('el servidor no responde: error de red, sin cerrar la sesión', async () => {
      const { cliente, alExpirarSesion } = crearEntornoDePrueba(() => Promise.reject(new TypeError('Failed to fetch')))

      expect(await cliente.solicitar(GET)).toEqual({ ok: false, error: { tipo: 'red' } })
      expect(alExpirarSesion).not.toHaveBeenCalled()
    })
  })
})
