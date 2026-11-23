import type { ClienteApi, Resultado } from './cliente'
import { esquemaRespuestaLogin, esquemaUsuarioSesion, type RespuestaLogin, type UsuarioSesion } from './esquemas'

export function crearApiAuth(cliente: ClienteApi) {
  return {
    /**
     * POST /auth/google/login: canjea la credencial de Google por el JWT del backend.
     * Ruta pública: no envía token, y su 401 (correo fuera de @unicesmag.edu.co) es un
     * error normal con su mensaje, no una sesión vencida.
     */
    loginConGoogle: (credencialGoogle: string): Promise<Resultado<RespuestaLogin>> =>
      cliente.solicitar({
        metodo: 'POST',
        ruta: '/auth/google/login',
        cuerpo: { token: credencialGoogle },
        esquema: esquemaRespuestaLogin,
        publica: true,
      }),

    /**
     * GET /auth/perfil (Fase 6.2): "¿quién soy?" con el token guardado, para restaurar
     * la sesión al recargar. Misma forma que el `usuario` del login (README del backend §13).
     */
    perfil: (): Promise<Resultado<UsuarioSesion>> =>
      cliente.solicitar({ metodo: 'GET', ruta: '/auth/perfil', esquema: esquemaUsuarioSesion }),
  }
}

export type ApiAuth = ReturnType<typeof crearApiAuth>
