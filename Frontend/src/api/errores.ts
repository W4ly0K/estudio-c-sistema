import type { ErrorApi } from './cliente'

export const TEXTO_SESION_EXPIRADA = 'Tu sesión expiró. Inicia sesión de nuevo.'
export const TEXTO_SIN_CONEXION = 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
export const TEXTO_CONTRATO =
  'El servidor respondió de una forma inesperada. Recarga la página y, si continúa, avisa al Estudio C.'

/**
 * Traduce un ErrorApi al texto que ve la persona. Los mensajes del servidor se
 * muestran tal cual (ya vienen en español y sin datos de terceros); React los escapa.
 * El `switch` es exhaustivo: un tipo de error nuevo no compila hasta tener su texto.
 */
export function textoDeError(error: ErrorApi): string {
  switch (error.tipo) {
    case 'http':
      return error.mensajes.join(' ')
    case 'sesion-expirada':
      return TEXTO_SESION_EXPIRADA
    case 'red':
      return TEXTO_SIN_CONEXION
    case 'contrato':
      return TEXTO_CONTRATO
    default: {
      const imposible: never = error
      return imposible
    }
  }
}
