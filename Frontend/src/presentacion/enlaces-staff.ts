import { REQUIERE_ENLACE } from '../api/categorias'
import type { Categoria, EventoEnlace } from '../api/esquemas'
import type { Estado } from '../api/maquina-estados'
import type { CuerpoCorregirEnlaceEntrega } from '../api/solicitudes'
import type { TextosAccion } from './acciones-solicitante'
import { enlaceParaEnviar, esEnlaceSeguro, TEXTO_RAZON_ENLACE_INVALIDO } from './enlace'
import {
  LIMITES_MOTIVO_CORRECCION,
  evaluarMotivo,
  motivoParaEnviar,
  razonMotivoInvalido,
  textoAyudaMotivo,
} from './motivo'

/**
 * Fase 9 · K4: el historial de enlaces y la corrección auditada del enlace del producto final,
 * del lado del Staff (ADR-008 §2.7 · ADR-009 AN15 · ADR-012 EV7). Lógica pura; la autorización,
 * el estado y la concurrencia los decide el servidor.
 */

// --- Historial ------------------------------------------------------------------------------

/**
 * DK4-1: el historial solo se pide donde PUEDE haber eventos: ANEXO solo existe en PODCAST, VIDEO
 * y STREAMING (A3) y ENTREGA solo en las categorías con enlace al entregar (las mismas tres).
 */
export function historialAplica(categoria: Categoria): boolean {
  return REQUIERE_ENLACE[categoria]
}

export const TEXTO_TITULO_HISTORIAL = 'Historial de enlaces'
export const TEXTO_NOTA_HISTORIAL =
  'Cambios del anexo y correcciones del enlace del producto final. No son cambios de estado: la línea de vida no los incluye.'
export const TEXTO_HISTORIAL_CARGANDO = 'Cargando el historial de enlaces…'
export const TEXTO_HISTORIAL_VACIO = 'Todavía no hay cambios de enlaces registrados.'
export const TEXTO_HISTORIAL_ERROR = 'No se pudo cargar el historial de enlaces:'
/** DK4-3: un valor ausente se dice con palabras; los presentes se muestran como texto, nunca como enlace. */
export const TEXTO_SIN_ENLACE = '(sin enlace)'

export const AUTOR_SOLICITANTE = 'Solicitante'
export const AUTOR_STAFF = 'Staff Estudio C'
export const AUTOR_NO_IDENTIFICADO = 'Autor no identificado'

/**
 * DK4-4 (ajustada): el autor se nombra solo con DOS evidencias que coinciden. El backend escribe
 * ANEXO únicamente con el dueño autenticado (PATCH …/anexo: @Roles(SOLICITANTE) y la propiedad en el
 * WHERE) y ENTREGA únicamente con un STAFF (PATCH …/enlace-entrega: guard y servicio). Esa es la
 * primera evidencia; la segunda es comparar `modificado_por` con el dueño de la solicitud.
 * LIMITACIÓN: la base no impide editar Log_Auditoria (D5) y un Staff podría ser también el dueño;
 * cuando las dos evidencias no coinciden, la etiqueta es neutral. `modificado_por` nunca se muestra.
 */
export function autorDelEvento(evento: EventoEnlace, idSolicitante: string): string {
  const esDelDueno = evento.modificado_por === idSolicitante
  if (evento.enlace_campo === 'ANEXO' && esDelDueno) return AUTOR_SOLICITANTE
  if (evento.enlace_campo === 'ENTREGA' && !esDelDueno) return AUTOR_STAFF
  return AUTOR_NO_IDENTIFICADO
}

export function descripcionDelEvento(evento: EventoEnlace): string {
  if (evento.enlace_campo === 'ENTREGA') return 'Enlace del producto final corregido'
  if (evento.enlace_anterior === null) return 'Anexo agregado'
  if (evento.enlace_nuevo === null) return 'Anexo retirado'
  return 'Anexo cambiado'
}

// --- Corrección del enlace de entrega ------------------------------------------------------------

/**
 * Cuándo se OFRECE «Corregir enlace» (EN6 y EN8): en «Entregado», en una categoría que exige el
 * enlace y con un enlace ya registrado. No autoriza nada: el servidor repite cada condición.
 */
export function correccionDisponible(estado: Estado, categoria: Categoria, enlaceEntrega: string | null): boolean {
  return estado === 'Entregado' && REQUIERE_ENLACE[categoria] && enlaceEntrega !== null
}

/** DK4-5 (EN8): una entrega de esas categorías sin enlace (p. ej., la histórica de DA-5). */
export function entregaSinEnlacePrevio(estado: Estado, categoria: Categoria, enlaceEntrega: string | null): boolean {
  return estado === 'Entregado' && REQUIERE_ENLACE[categoria] && enlaceEntrega === null
}

export const TEXTO_ENTREGA_SIN_ENLACE = 'Esta entrega no tiene enlace registrado; agregarlo no está disponible.'
export const TEXTO_ETIQUETA_ENLACE_CORREGIDO = 'Enlace corregido del producto final'
export const TEXTO_AYUDA_ENLACE_CORREGIDO =
  'Pega el enlace https:// correcto. Reemplaza al actual; la solicitud sigue en "Entregado".'
export const TEXTO_ENLACE_ACTUAL = 'Enlace actual'
export const TEXTO_ETIQUETA_MOTIVO_CORRECCION = 'Motivo de la corrección (opcional)'
/** DK4-7: el texto aprobado, antes de guardar. */
export const TEXTO_ADVERTENCIA_DATOS_PERSONALES =
  'El motivo queda en el registro de auditoría del Estudio C. No escribas datos personales, contraseñas, tokens ni otra información sensible. El solicitante verá el nuevo enlace en su solicitud.'
export const TEXTO_AYUDA_MOTIVO_CORRECCION = `${TEXTO_ADVERTENCIA_DATOS_PERSONALES} Si lo escribes: ${textoAyudaMotivo(LIMITES_MOTIVO_CORRECCION).toLowerCase()}`
export const TEXTO_RAZON_CORRECCION_VACIA = 'Para corregir, pega el enlace https:// correcto del producto final.'
export const TEXTO_RAZON_CORRECCION_IGUAL = 'Es el mismo enlace que ya tiene la solicitud. Escribe el correcto o vuelve sin cambios.'
export const TEXTO_RAZON_RECARGAR_CORRECCION =
  'Para volver a intentarlo, recarga la solicitud y revisa su enlace actual.'

export type ResultadoCorreccion =
  | { readonly ok: true; readonly cuerpo: CuerpoCorregirEnlaceEntrega }
  | { readonly ok: false; readonly error: string }

/**
 * El cuerpo de la corrección. El ANTERIOR es la foto del detalle y viaja EXACTO (EN9). El nuevo,
 * recortado y con la regla de la entrega (esEnlaceSeguro). Sin motivo, la clave no viaja; con
 * motivo, de 10 a 500 caracteres reales, recortado (EN10).
 */
export function cuerpoDeCorreccion(anteriorObservado: string, textoEnlace: string, textoMotivo: string): ResultadoCorreccion {
  const nuevo = enlaceParaEnviar(textoEnlace)
  if (nuevo === '') return { ok: false, error: TEXTO_RAZON_CORRECCION_VACIA }
  if (!esEnlaceSeguro(nuevo)) return { ok: false, error: TEXTO_RAZON_ENLACE_INVALIDO }
  if (nuevo === anteriorObservado) return { ok: false, error: TEXTO_RAZON_CORRECCION_IGUAL }
  const motivo = evaluarMotivo(textoMotivo, LIMITES_MOTIVO_CORRECCION)
  if (motivo.estado === 'vacio') {
    return { ok: true, cuerpo: { enlace_entrega_anterior: anteriorObservado, enlace_entrega: nuevo } }
  }
  const razon = razonMotivoInvalido(motivo, LIMITES_MOTIVO_CORRECCION)
  if (razon !== undefined) return { ok: false, error: razon }
  return {
    ok: true,
    cuerpo: { enlace_entrega_anterior: anteriorObservado, enlace_entrega: nuevo, motivo_correccion: motivoParaEnviar(textoMotivo) },
  }
}

export function textosCorreccion(radicado: string): TextosAccion {
  return {
    boton: 'Corregir enlace',
    titulo: 'Corregir el enlace del producto final',
    descripcion: `El enlace corregido reemplaza al actual en el radicado ${radicado}, que sigue en "Entregado". La corrección queda registrada en el historial de enlaces.`,
    confirmar: 'Guardar la corrección',
    irreversible: false,
  }
}

/** Si la recarga posterior falla, lo que se diga depende de si el servidor escribió o no. */
export const TEXTO_RECARGA_FALLIDA_SIN_CAMBIOS =
  'El servidor confirmó que el enlace ya tenía ese valor, pero no pudimos recargar la solicitud:'
