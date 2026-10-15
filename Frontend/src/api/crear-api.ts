import { entorno } from '../config/entorno'
import { crearApiAuth } from './auth'
import { crearClienteApi, type FuncionFetch } from './cliente'
import { crearApiSolicitudes } from './solicitudes'

export interface DependenciasApi {
  readonly obtenerToken: () => string | null
  readonly alExpirarSesion: () => void
  /** Solo para pruebas; por defecto, el fetch del navegador. */
  readonly fetch?: FuncionFetch
}

/**
 * Raíz de composición (DC3): el ÚNICO lugar donde las piezas de src/api se conectan
 * con el mundo real (URL del entorno, fetch del navegador, sesión de la App).
 */
export function crearApi(dependencias: DependenciasApi) {
  const cliente = crearClienteApi({
    baseUrl: entorno.apiUrl,
    obtenerToken: dependencias.obtenerToken,
    alExpirarSesion: dependencias.alExpirarSesion,
    // Envoltura a propósito: llamar a window.fetch como método de otro objeto
    // (`opciones.fetch(...)`) lanza "Illegal invocation" en Chrome y Safari.
    fetch: dependencias.fetch ?? ((url, init) => fetch(url, init)),
  })
  return {
    auth: crearApiAuth(cliente),
    solicitudes: crearApiSolicitudes(cliente),
  }
}

export type Api = ReturnType<typeof crearApi>
