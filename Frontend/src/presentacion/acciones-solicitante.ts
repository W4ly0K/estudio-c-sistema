import { TRANSICIONES, type Estado } from '../api/maquina-estados'

/**
 * Acciones del solicitante en B3/B4 (T3, T6, T7 y T8). Se DERIVAN de la tabla de la
 * máquina: si el backend agrega o quita una transición, la prueba de deriva lo avisa y
 * los botones cambian solos. Mostrar un botón no autoriza nada: el servidor decide.
 */
type TransicionSolicitante = Extract<(typeof TRANSICIONES)[number], { rol: 'SOLICITANTE' }>
export type AccionSolicitante = TransicionSolicitante['accion']

export function accionesDelSolicitante(estado: Estado): readonly TransicionSolicitante[] {
  return TRANSICIONES.filter((t): t is TransicionSolicitante => t.rol === 'SOLICITANTE' && t.origen === estado)
}

export interface TextosAccion {
  readonly boton: string
  readonly titulo: string
  readonly descripcion: string
  readonly confirmar: string
  /** Irreversible: el botón de confirmar se pinta como peligroso. */
  readonly irreversible: boolean
}

/** Botón para cerrar sin hacer nada. NO dice "Cancelar": se confundiría con cancelar la solicitud. */
export const TEXTO_VOLVER_SIN_CAMBIOS = 'Volver sin cambios'
export const TEXTO_PROCESANDO = 'Procesando…'

/** README §12.1: desde "En Producción" ya no hay cancelación en línea. */
export const TEXTO_SIN_CANCELACION =
  'La actividad ya comenzó ("En Producción"): la cancelación ya no está disponible en línea. Si necesitas cambiar algo, comunícate con el Estudio C.'

/**
 * README §12.3: aceptar puede fallar sin culpa del solicitante (otra solicitud confirmó
 * esa franja antes, o la franja ya inició). Se explica sin comparar el texto del servidor.
 */
export const TEXTO_AYUDA_ACEPTAR =
  'Si la propuesta ya no puede aceptarse, puedes rechazarla (eso cancela la solicitud) o comunicarte con el Estudio C.'

/**
 * Textos honestos (DV2): dicen exactamente lo que hará el servidor, incluido lo que NO
 * se puede deshacer. Rechazar la propuesta CANCELA la solicitud (T8): no existe una
 * contrapropuesta, y la UI no la promete.
 */
export function textosDe(accion: AccionSolicitante, radicado: string, franjaPropuesta: string | null): TextosAccion {
  switch (accion) {
    case 'CANCELAR':
      return {
        boton: 'Cancelar solicitud',
        titulo: 'Cancelar la solicitud',
        descripcion: `Se cancelará el radicado ${radicado} y su franja quedará libre para otras personas. No se puede deshacer: si luego necesitas el servicio, tendrás que radicar una nueva solicitud.`,
        confirmar: 'Sí, cancelar la solicitud',
        irreversible: true,
      }
    case 'ACEPTAR_REPROGRAMACION':
      return {
        boton: 'Aceptar la nueva franja',
        titulo: 'Aceptar la propuesta',
        descripcion: `El radicado ${radicado} vuelve a "Validado" con la franja propuesta${franjaPropuesta === null ? '' : ` (${franjaPropuesta})`} y la franja original se libera. El Estudio C confirma que la nueva franja siga disponible en el momento de aceptar.`,
        confirmar: 'Sí, aceptar la propuesta',
        irreversible: false,
      }
    case 'RECHAZAR_REPROGRAMACION':
      return {
        boton: 'Rechazar la propuesta',
        titulo: 'Rechazar la propuesta',
        descripcion: `Rechazar la propuesta CANCELA el radicado ${radicado} y libera su franja original. No se puede deshacer: si aún necesitas el servicio, tendrás que radicar una nueva solicitud.`,
        confirmar: 'Sí, rechazar y cancelar la solicitud',
        irreversible: true,
      }
    default: {
      const imposible: never = accion
      return imposible
    }
  }
}
