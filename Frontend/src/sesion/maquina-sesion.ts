import { TEXTO_SESION_EXPIRADA } from '../api/errores'
import type { UsuarioSesion } from '../api/esquemas'

/**
 * La sesión del frontend como MÁQUINA DE ESTADOS (Fase 6.2 · Decisión DS3).
 *
 * Es la lección de la Fase 5 aplicada a la UI: estados con nombre en lugar de
 * banderas booleanas (`cargando`, `logueado`, `error`…) que pueden combinarse en
 * situaciones imposibles. Cada estado lleva SOLO los datos que tienen sentido en él:
 * no existe un "usuario" mientras la sesión se verifica.
 */
export type Sesion =
  /** Hay un token guardado y se está confirmando con GET /auth/perfil. */
  | { readonly estado: 'verificando' }
  | { readonly estado: 'anonima'; readonly aviso: string | null }
  | { readonly estado: 'autenticada'; readonly usuario: UsuarioSesion }
  /** No se pudo verificar (red, 5xx, contrato): el token se CONSERVA para reintentar. */
  | { readonly estado: 'sin-conexion' }

export type EventoSesion =
  | { readonly tipo: 'perfil-confirmado'; readonly usuario: UsuarioSesion }
  | { readonly tipo: 'perfil-no-verificado' }
  | { readonly tipo: 'reintentar' }
  | { readonly tipo: 'login-exitoso'; readonly usuario: UsuarioSesion }
  | { readonly tipo: 'sesion-expirada' }
  | { readonly tipo: 'cierre-de-sesion' }

export function estadoInicial(hayToken: boolean): Sesion {
  return hayToken ? { estado: 'verificando' } : { estado: 'anonima', aviso: null }
}

/**
 * Función pura: dado un estado y un evento, el estado siguiente.
 *
 * Un evento que no corresponde al estado actual se IGNORA (se devuelve el mismo
 * objeto, y React no vuelve a renderizar). Esa es la defensa contra las respuestas
 * tardías: si la persona cerró la sesión mientras GET /auth/perfil seguía en camino,
 * su respuesta llega a un estado `anonima` y no la vuelve a abrir.
 */
export function reducirSesion(sesion: Sesion, evento: EventoSesion): Sesion {
  switch (evento.tipo) {
    case 'perfil-confirmado':
      return sesion.estado === 'verificando' ? { estado: 'autenticada', usuario: evento.usuario } : sesion
    case 'perfil-no-verificado':
      return sesion.estado === 'verificando' ? { estado: 'sin-conexion' } : sesion
    case 'reintentar':
      return sesion.estado === 'sin-conexion' ? { estado: 'verificando' } : sesion
    case 'login-exitoso':
      return sesion.estado === 'anonima' ? { estado: 'autenticada', usuario: evento.usuario } : sesion
    case 'sesion-expirada':
      // Un 401 que llega cuando ya no hay sesión no debe mostrar "tu sesión expiró".
      return sesion.estado === 'anonima' ? sesion : { estado: 'anonima', aviso: TEXTO_SESION_EXPIRADA }
    case 'cierre-de-sesion':
      return { estado: 'anonima', aviso: null }
  }
}
