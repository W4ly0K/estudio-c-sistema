import { ADMITE_ANEXO } from '../api/categorias'
import type { Categoria } from '../api/esquemas'
import type { Estado, Rol } from '../api/maquina-estados'
import type { CuerpoEditarAnexo } from '../api/solicitudes'
import type { TextosAccion } from './acciones-solicitante'
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
export const TEXTO_COMO_COMPARTIR_ANEXO =
  'Pega el enlace https:// de tu guion en Google Drive o Docs. Antes, inicia sesión en Drive con tu cuenta institucional (@unicesmag.edu.co) y, en Compartir, elige «Acceso general» → «Universidad Cesmag» → «Lector». Así podrán abrirlo, con el enlace, solo las personas de la universidad: no queda público. No uses «Cualquier persona con el enlace». Si no ves la opción de la universidad, consulta con el Estudio C.'
/** Al radicar el anexo es opcional; en la edición (K3) se pide un enlace, sin el «Opcional.». */
export const TEXTO_AYUDA_ANEXO = `Opcional. ${TEXTO_COMO_COMPARTIR_ANEXO}`

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

// --- Fase 9 · K3: edición del anexo por el dueño (ADR-009 AN10 a AN14) ------------------------

/**
 * Cuándo se OFRECE la edición: al SOLICITANTE, en «Recibido» y en PODCAST, VIDEO o STREAMING.
 * Ofrecerla no autoriza nada: el servidor decide propiedad (404 uniforme), estado y categoría.
 */
export function edicionDelAnexoDisponible(rol: Rol, estado: Estado, categoria: Categoria): boolean {
  return rol === 'SOLICITANTE' && estado === 'Recibido' && ADMITE_ANEXO[categoria]
}

export type ModoEdicionAnexo = 'AGREGAR' | 'CAMBIAR' | 'RETIRAR'

/** En la ficha, cuando la edición está disponible y todavía no hay anexo. */
export const TEXTO_FICHA_SIN_ANEXO = 'Sin anexo'
export const TEXTO_ETIQUETA_ANEXO_NUEVO = 'Enlace del nuevo anexo'
export const TEXTO_ANEXO_ACTUAL = 'Anexo actual'
/** DK3-2: el campo vacío no retira; el retiro tiene su propio botón y su confirmación. */
export const TEXTO_RAZON_ANEXO_VACIO = 'Escribe el enlace https:// del anexo. Para quitarlo, usa «Retirar anexo».'
/** DK3-3: el mismo enlace no se envía (no habría nada que registrar). */
export const TEXTO_RAZON_ANEXO_IGUAL = 'Es el mismo enlace que ya tiene la solicitud. Escribe otro o vuelve sin cambios.'
/** DK3-4: tras un 409 la foto ya no vale; se opera de nuevo después de recargar. */
export const TEXTO_RAZON_RECARGAR_ANEXO =
  'Para volver a intentarlo, recarga la solicitud y revisa su estado y su anexo actuales.'

export type ResultadoEdicionAnexo =
  | { readonly ok: true; readonly cuerpo: CuerpoEditarAnexo }
  | { readonly ok: false; readonly error: string }

/**
 * Agregar o cambiar. El nuevo pasa por anexoParaEnviar (recorte D4 y esEnlaceSeguro); el ANTERIOR
 * es la foto del detalle y viaja EXACTO, null incluido (el servidor lo compara carácter por carácter).
 */
export function cuerpoDeEdicion(anteriorObservado: string | null, texto: string): ResultadoEdicionAnexo {
  const nuevo = anexoParaEnviar(texto)
  if (!nuevo.ok) return { ok: false, error: nuevo.error }
  if (nuevo.enlace === undefined) return { ok: false, error: TEXTO_RAZON_ANEXO_VACIO }
  if (nuevo.enlace === anteriorObservado) return { ok: false, error: TEXTO_RAZON_ANEXO_IGUAL }
  return { ok: true, cuerpo: { enlace_anexo_anterior: anteriorObservado, enlace_anexo: nuevo.enlace } }
}

/** Retirar (AN12): null EXPLÍCITO como nuevo; el anterior, la foto exacta. */
export function cuerpoDeRetiro(anteriorObservado: string): CuerpoEditarAnexo {
  return { enlace_anexo_anterior: anteriorObservado, enlace_anexo: null }
}

const SOLO_EN_RECIBIDO = 'Solo se puede cambiar mientras la solicitud está en "Recibido".'

/** DK3-5: textos honestos; el retiro no es irreversible y el cambio queda registrado para el Estudio C. */
export function textosEdicionAnexo(modo: ModoEdicionAnexo, radicado: string): TextosAccion {
  switch (modo) {
    case 'AGREGAR':
      return {
        boton: 'Agregar anexo',
        titulo: 'Agregar un anexo',
        descripcion: `El enlace queda en el radicado ${radicado} para que el Estudio C revise tu guion. El cambio queda registrado para el Estudio C. ${SOLO_EN_RECIBIDO}`,
        confirmar: 'Guardar el anexo',
        irreversible: false,
      }
    case 'CAMBIAR':
      return {
        boton: 'Cambiar anexo',
        titulo: 'Cambiar el anexo',
        descripcion: `El nuevo enlace reemplaza al actual en el radicado ${radicado}. El cambio queda registrado para el Estudio C. ${SOLO_EN_RECIBIDO}`,
        confirmar: 'Guardar el cambio',
        irreversible: false,
      }
    case 'RETIRAR':
      return {
        boton: 'Retirar anexo',
        titulo: 'Retirar el anexo',
        descripcion: `El radicado ${radicado} queda sin anexo. El retiro queda registrado para el Estudio C. Mientras la solicitud siga en "Recibido", puedes volver a agregar uno.`,
        confirmar: 'Sí, retirar el anexo',
        irreversible: false,
      }
    default: {
      const imposible: never = modo
      return imposible
    }
  }
}
