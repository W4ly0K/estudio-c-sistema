import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { ErrorApi, FuncionFetch } from '../api/cliente'
import { crearApi, type Api } from '../api/crear-api'
import { estadoInicial, reducirSesion, type Sesion } from './maquina-sesion'
import { borrarToken, guardarToken, leerToken } from './token'

export interface ControlSesion {
  readonly sesion: Sesion
  /** El cliente de la API, estable durante toda la vida del componente (DC3). */
  readonly api: Api
  /** Canjea la credencial de Google. Devuelve el error para mostrarlo, o null si entró. */
  readonly iniciarSesion: (credencialGoogle: string) => Promise<ErrorApi | null>
  readonly cerrarSesion: () => void
  /** Desde `sin-conexion`: vuelve a verificar el token guardado. */
  readonly reintentar: () => void
}

export interface DependenciasSesion {
  /** Solo para pruebas; por defecto, el fetch del navegador. */
  readonly fetch?: FuncionFetch
}

/**
 * Dueño ÚNICO de la sesión (DS3). Conecta la máquina pura (maquina-sesion.ts) con
 * el mundo: el token guardado, GET /auth/perfil y el 401 de cualquier ruta privada.
 */
export function useSesion(dependencias: DependenciasSesion = {}): ControlSesion {
  // El estado inicial se calcula UNA vez: con token, hay que verificarlo; sin token, anónima.
  const [sesion, despachar] = useReducer(reducirSesion, undefined, () => estadoInicial(leerToken() !== null))

  // La dependencia inyectada se congela en el primer render: si cambiara, se recrearía la api.
  const [fetchInyectado] = useState(() => dependencias.fetch)

  // `despachar` es estable por garantía de React: la api se crea una sola vez.
  const api = useMemo(
    () =>
      crearApi({
        obtenerToken: leerToken,
        alExpirarSesion: () => {
          borrarToken()
          despachar({ tipo: 'sesion-expirada' })
        },
        fetch: fetchInyectado,
      }),
    [fetchInyectado],
  )

  // Cada vez que se ENTRA a `verificando` (al cargar o al reintentar), se consulta el perfil.
  const verificando = sesion.estado === 'verificando'
  useEffect(() => {
    if (!verificando) return
    let vigente = true
    void api.auth.perfil().then((resultado) => {
      if (!vigente) return
      if (resultado.ok) {
        despachar({ tipo: 'perfil-confirmado', usuario: resultado.datos })
      } else if (resultado.error.tipo !== 'sesion-expirada') {
        // Red, 5xx o contrato: el servidor no pudo confirmar, pero el token puede ser
        // válido. No se borra: una caída del servidor no debe cerrar la sesión.
        despachar({ tipo: 'perfil-no-verificado' })
      }
      // `sesion-expirada`: el cliente ya llamó a alExpirarSesion (token borrado + aviso).
    })
    return () => {
      vigente = false
    }
  }, [verificando, api])

  const iniciarSesion = useCallback(
    async (credencialGoogle: string): Promise<ErrorApi | null> => {
      const resultado = await api.auth.loginConGoogle(credencialGoogle)
      if (!resultado.ok) return resultado.error
      guardarToken(resultado.datos.token)
      despachar({ tipo: 'login-exitoso', usuario: resultado.datos.usuario })
      return null
    },
    [api],
  )

  const cerrarSesion = useCallback(() => {
    borrarToken()
    despachar({ tipo: 'cierre-de-sesion' })
  }, [])

  const reintentar = useCallback(() => {
    despachar({ tipo: 'reintentar' })
  }, [])

  return { sesion, api, iniciarSesion, cerrarSesion, reintentar }
}
