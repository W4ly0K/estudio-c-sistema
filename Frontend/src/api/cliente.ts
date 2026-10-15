import type { z } from 'zod'
import { esquemaCuerpoError } from './esquemas'
import { MENSAJE_CAMBIO_CONCURRENTE } from './mensajes'

/**
 * Único punto de salida hacia la API (Decisiones DC2, DC3 y DC5).
 *
 * - Nunca lanza: toda petición termina en un Resultado. El compilador no deja usar
 *   `datos` sin preguntar antes por `ok` (mismo patrón que evaluarTransicion() en el
 *   backend: un resultado tipado con su motivo, no una excepción).
 * - Todo lo que entra se valida con su esquema: una respuesta que no cumple el
 *   contrato es un error `contrato`, nunca un `undefined` en pantalla.
 * - Las dependencias se inyectan (fetch, token, sesión): las pruebas usan un fetch
 *   falso, como el backend usa RelojFijo.
 */

export type ErrorApi =
  /** El servidor respondió con un error. `mensajes` siempre es una lista, lista para mostrar. */
  | { readonly tipo: 'http'; readonly status: number; readonly mensajes: readonly string[]; readonly requiereRecarga: boolean }
  /** 401 en una ruta privada, o no hay token: la sesión ya se cerró con alExpirarSesion. */
  | { readonly tipo: 'sesion-expirada' }
  /** El servidor no respondió (sin red, CORS, servidor caído). */
  | { readonly tipo: 'red' }
  /** Respondió 2xx con algo que no cumple el esquema: desalineación de contrato. */
  | { readonly tipo: 'contrato' }

export type Resultado<T> = { readonly ok: true; readonly datos: T } | { readonly ok: false; readonly error: ErrorApi }

export type FuncionFetch = (url: string, init: RequestInit) => Promise<Response>

export interface OpcionesCliente {
  /** URL base de la API, sin barra final (entorno.apiUrl). */
  readonly baseUrl: string
  /** Se consulta en CADA petición: si la sesión cambia, el cliente no guarda una copia vieja. */
  readonly obtenerToken: () => string | null
  /** Se llama ante un 401 en una ruta privada. Quien la provee borra el token y vuelve al login. */
  readonly alExpirarSesion: () => void
  readonly fetch: FuncionFetch
}

export interface PeticionApi<T> {
  readonly metodo: 'GET' | 'POST' | 'PATCH'
  /** Empieza con "/". Los segmentos variables ya deben venir codificados. */
  readonly ruta: string
  readonly cuerpo?: unknown
  readonly esquema: z.ZodType<T>
  /** Ruta pública (login): no envía token y un 401 es un error normal, no una sesión vencida. */
  readonly publica?: boolean
}

export interface ClienteApi {
  solicitar<T>(peticion: PeticionApi<T>): Promise<Resultado<T>>
}

/** 5xx: nunca se reenvía el texto del servidor (puede describir internos). */
export const MENSAJE_ERROR_SERVIDOR = 'Ocurrió un error en el servidor. Intenta de nuevo en unos minutos.'

export const mensajeSinDetalle = (status: number): string =>
  `La solicitud no pudo completarse (código ${status}).`

const error = (e: ErrorApi): Resultado<never> => ({ ok: false, error: e })

/** Lee el cuerpo como JSON sin lanzar: un cuerpo vacío o HTML (un 502 de un proxy) da `undefined`. */
async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    const cuerpo: unknown = await respuesta.json()
    return cuerpo
  } catch {
    return undefined
  }
}

function errorHttp(status: number, cuerpo: unknown): ErrorApi {
  if (status >= 500) {
    return { tipo: 'http', status, mensajes: [MENSAJE_ERROR_SERVIDOR], requiereRecarga: false }
  }
  const leido = esquemaCuerpoError.safeParse(cuerpo)
  const mensajes = !leido.success
    ? [mensajeSinDetalle(status)]
    : typeof leido.data.message === 'string'
      ? [leido.data.message]
      : leido.data.message
  // DC5: el único mensaje que cambia el comportamiento. No es un error del usuario.
  const requiereRecarga = status === 409 && mensajes.includes(MENSAJE_CAMBIO_CONCURRENTE)
  return { tipo: 'http', status, mensajes, requiereRecarga }
}

export function crearClienteApi(opciones: OpcionesCliente): ClienteApi {
  return {
    async solicitar<T>(peticion: PeticionApi<T>): Promise<Resultado<T>> {
      const encabezados: Record<string, string> = { Accept: 'application/json' }

      if (peticion.publica !== true) {
        const token = opciones.obtenerToken()
        if (token === null || token === '') {
          // Fail-closed: sin token no se envía nada; el resultado es el mismo que un 401.
          opciones.alExpirarSesion()
          return error({ tipo: 'sesion-expirada' })
        }
        encabezados.Authorization = `Bearer ${token}`
      }

      const init: RequestInit = { method: peticion.metodo, headers: encabezados }
      if (peticion.cuerpo !== undefined) {
        encabezados['Content-Type'] = 'application/json'
        init.body = JSON.stringify(peticion.cuerpo)
      }

      let respuesta: Response
      try {
        respuesta = await opciones.fetch(`${opciones.baseUrl}${peticion.ruta}`, init)
      } catch {
        return error({ tipo: 'red' })
      }

      if (respuesta.status === 401 && peticion.publica !== true) {
        opciones.alExpirarSesion()
        return error({ tipo: 'sesion-expirada' })
      }

      const cuerpo = await leerJson(respuesta)
      if (!respuesta.ok) {
        return error(errorHttp(respuesta.status, cuerpo))
      }

      const leido = peticion.esquema.safeParse(cuerpo)
      if (!leido.success) {
        // Para diagnosticar en la consola: solo la ruta y QUÉ campos fallaron, nunca los datos.
        console.error(
          `Contrato roto en ${peticion.metodo} ${peticion.ruta}:`,
          leido.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.code}`),
        )
        return error({ tipo: 'contrato' })
      }
      return { ok: true, datos: leido.data }
    },
  }
}
