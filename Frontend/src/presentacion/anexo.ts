import { enlaceParaEnviar, esEnlaceSeguro } from './enlace'

/**
 * Fase 9 · R9-1: el anexo opcional del solicitante (guion por enlace), del lado del formulario B2.
 * El servidor valida lo mismo (DTO EnlaceSeguro y CHECK del motor); aquí se evita enviar lo que
 * rechazaría y se explica cómo compartir el archivo.
 */

export const TEXTO_ETIQUETA_ANEXO = 'Guion o documento de apoyo (opcional)'

/**
 * Provisional (D3): depende de la pregunta 2 del cuestionario de la Fase 9 (¿con quién se comparte
 * el archivo?). Si el Responsable decide otra cosa, se cambia solo esta constante.
 */
export const TEXTO_AYUDA_ANEXO =
  'Opcional. Pega el enlace https:// de tu guion en Google Drive o Docs. Antes, compártelo como lector con estudioc@unicesmag.edu.co (Compartir → agrega el correo → Lector) y evita «Cualquier persona con el enlace», para que tu guion no quede público.'

export const TEXTO_ANEXO_INVALIDO =
  'El enlace del anexo debe empezar por https:// (en minúsculas) y no llevar espacios ni usuario y contraseña. Si no tienes anexo, deja el campo vacío.'

/** Sin `enlace` = no hay anexo y la clave no viaja (el servidor rechaza la cadena vacía). */
export type AnexoParaEnviar =
  | { readonly ok: true; readonly enlace?: string }
  | { readonly ok: false; readonly error: string }

/**
 * D4: se recortan los espacios de los extremos que deja el copiar y pegar (como en la entrega);
 * el servidor sigue siendo estricto. Vacío o solo espacios = sin anexo.
 */
export function anexoParaEnviar(texto: string): AnexoParaEnviar {
  const limpio = enlaceParaEnviar(texto)
  if (limpio === '') return { ok: true }
  return esEnlaceSeguro(limpio) ? { ok: true, enlace: limpio } : { ok: false, error: TEXTO_ANEXO_INVALIDO }
}
