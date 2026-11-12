import { ADMITE_ANEXO } from '../api/categorias'
import type { Categoria } from '../api/esquemas'
import { enlaceParaEnviar, esEnlaceSeguro } from './enlace'

/**
 * Fase 9 · R9-1: el anexo opcional del solicitante (guion por enlace), del lado del formulario B2.
 * El servidor valida lo mismo (DTO EnlaceSeguro y CHECK del motor); aquí se evita enviar lo que
 * rechazaría y se explica cómo compartir el archivo.
 */

export const TEXTO_ETIQUETA_ANEXO = 'Guion o documento de apoyo (opcional)'

/**
 * Fase 9 · AN15 (pregunta 2, respondida el 2026-11-10; texto aprobado en K2 · DK2-1): el guion se
 * comparte con las cuentas de la universidad. Orienta, no promete: el sistema NO verifica los
 * permisos del archivo. Reemplaza el texto provisional D3 (estudioc@unicesmag.edu.co).
 */
export const TEXTO_AYUDA_ANEXO =
  'Opcional. Pega el enlace https:// de tu guion en Google Drive o Docs. Antes, inicia sesión en Drive con tu cuenta institucional (@unicesmag.edu.co) y, en Compartir, elige «Acceso general» → «Universidad Cesmag» → «Lector». Así podrán abrirlo, con el enlace, solo las personas de la universidad: no queda público. No uses «Cualquier persona con el enlace». Si no ves la opción de la universidad, consulta con el Estudio C.'

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

/**
 * Fase 9 · AN2b (K2): la regla de envío del anexo SEGÚN LA CATEGORÍA. En PODCAST, VIDEO y
 * STREAMING, exactamente anexoParaEnviar (recorte D4, vacío = sin clave, inseguro = error). En
 * ESPACIOS y ASESORIAS no hay anexo, sea cual sea el texto residual: ni se valida ni viaja (el
 * servidor respondería 400 MENSAJE_ANEXO_NO_APLICA).
 */
export function anexoSegunCategoria(categoria: Categoria, texto: string): AnexoParaEnviar {
  return ADMITE_ANEXO[categoria] ? anexoParaEnviar(texto) : { ok: true }
}
