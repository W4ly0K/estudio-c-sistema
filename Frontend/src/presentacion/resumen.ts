import { esEstadoFinal, type Estado } from '../api/maquina-estados'

/**
 * Resumen del panel B1 ("Tienes 2 solicitudes activas y 1 cerrada"). Función pura:
 * se prueba sin React y la vista solo pinta lo que devuelve.
 */
export interface ResumenSolicitudes {
  readonly activas: number
  readonly cerradas: number
  /** En "Pendiente de Reprogramación": esperan una decisión del solicitante (B4). */
  readonly porDecidir: number
}

export function resumirSolicitudes(solicitudes: readonly { readonly estado: Estado }[]): ResumenSolicitudes {
  // "Cerrada" se DERIVA de la máquina de estados (sin transiciones de salida), no de una
  // lista escrita a mano: si el backend cambia la tabla, la prueba de deriva lo avisa.
  const cerradas = solicitudes.filter((s) => esEstadoFinal(s.estado)).length
  const porDecidir = solicitudes.filter((s) => s.estado === 'Pendiente de Reprogramación').length
  return { activas: solicitudes.length - cerradas, cerradas, porDecidir }
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`
}

export function textoResumen({ activas, cerradas }: ResumenSolicitudes): string {
  return `Tienes ${contar(activas, 'solicitud activa', 'solicitudes activas')} y ${contar(cerradas, 'cerrada', 'cerradas')}.`
}

/** `null` cuando no hay nada por decidir: la vista no pinta un aviso vacío. */
export function textoPorDecidir({ porDecidir }: ResumenSolicitudes): string | null {
  if (porDecidir === 0) return null
  return porDecidir === 1
    ? '1 solicitud espera tu respuesta a una propuesta de reprogramación.'
    : `${porDecidir} solicitudes esperan tu respuesta a una propuesta de reprogramación.`
}
