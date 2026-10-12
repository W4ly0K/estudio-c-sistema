import type { ClienteApi, Resultado } from './cliente'
import { esquemaRespuestaLogin, type RespuestaLogin } from './esquemas'

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
  }
}

export type ApiAuth = ReturnType<typeof crearApiAuth>
