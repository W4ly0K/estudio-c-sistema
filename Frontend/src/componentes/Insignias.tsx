import type { SubEspacio } from '../api/esquemas'
import type { Estado, Rol } from '../api/maquina-estados'
import { ETIQUETAS_CORTAS_SUB_ESPACIO, etiquetaEstado } from '../presentacion/etiquetas'

/**
 * Insignias de estado del wireframe (Sección D): se distinguen por la FORMA del borde
 * y un símbolo, no solo por el color (DV6 · accesibilidad). `Record<Estado, …>`: un
 * estado nuevo no compila hasta tener su insignia.
 */
const ESTILO: Readonly<Record<Estado, { readonly clases: string; readonly simbolo: string }>> = {
  Recibido: { clases: 'bg-gray-100 border border-gray-400 text-gray-700', simbolo: '' },
  Validado: { clases: 'bg-white border border-gray-900 text-gray-900', simbolo: '' },
  'En Producción': { clases: 'bg-gray-900 border border-gray-900 text-white', simbolo: '●' },
  // Fase 8: en curso como "En Producción", pero en otra etapa: gris medio (no negro) y un lápiz.
  'Edición y postproducción': { clases: 'bg-gray-700 border border-gray-700 text-white', simbolo: '✎' },
  Entregado: { clases: 'bg-gray-100 border border-gray-900 text-gray-900', simbolo: '✓' },
  Rechazado: { clases: 'bg-white border border-dashed border-gray-900 text-gray-900', simbolo: '✕' },
  'Cancelado por el Usuario': { clases: 'bg-gray-200 border border-gray-200 text-gray-500', simbolo: '' },
  'Pendiente de Reprogramación': { clases: 'bg-white border border-dotted border-gray-500 text-gray-700', simbolo: '↻' },
  // Fase 7: final como Rechazado, pero sin decisión del Estudio sobre el contenido. Borde
  // discontinuo GRUESO y gris (Rechazado: fino y negro) y un círculo vacío, no la ✕ del rechazo.
  'No atendida': { clases: 'bg-gray-100 border-2 border-dashed border-gray-400 text-gray-600', simbolo: '○' },
}

/**
 * Fase 8 (requisitos 1 y 2): el TEXTO es el alias del estado según quién mira; `data-estado` y el
 * estilo siguen el valor guardado. La perspectiva es obligatoria a propósito.
 */
export function InsigniaEstado({ estado, perspectiva }: { estado: Estado; perspectiva: Rol }) {
  const { clases, simbolo } = ESTILO[estado]
  return (
    <span
      data-estado={estado}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold ${clases}`}
    >
      {/* El símbolo es decorativo: el lector de pantalla lee el nombre del estado. */}
      {simbolo !== '' && <span aria-hidden="true">{simbolo}</span>}
      {etiquetaEstado(estado, perspectiva)}
    </span>
  )
}

/**
 * Urgencia (README del backend §9): reserva antes del 6.º día hábil. Borde discontinuo grueso.
 * Fase 8 · requisito 6: en el rojo institucional (token `urgencia`, contraste AA medido en
 * tema.test.ts). La forma sigue distinguiéndola de un error, que tiene borde continuo (DV6).
 */
export function InsigniaUrgencia() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-xs font-bold uppercase tracking-wider border-2 border-dashed border-urgencia text-urgencia bg-surface">
      <span aria-hidden="true">⚠</span>
      Urgencia
    </span>
  )
}

/** Símbolo decorativo de cada lugar: media luna a cada lado y el círculo lleno para el completo. */
const SIMBOLO_SUB_ESPACIO: Readonly<Record<SubEspacio, string>> = {
  CABINA_AUDIO: '◐',
  ESTUDIO_GRABACION: '◑',
  ESTUDIO_COMPLETO: '●',
}

/**
 * Fase 7 · PRD v2.2 §5.1: el sub-espacio de la reserva. Se distingue de la insignia de
 * estado por la FORMA (píldora redondeada) y lleva el nombre del lugar en texto; el lector
 * de pantalla oye "Sub-espacio: …", no solo el nombre suelto (DV6).
 */
export function InsigniaSubEspacio({ subEspacio }: { subEspacio: SubEspacio }) {
  return (
    <span
      data-sub-espacio={subEspacio}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-400 bg-surface text-xs font-medium text-gray-700"
    >
      <span aria-hidden="true">{SIMBOLO_SUB_ESPACIO[subEspacio]}</span>
      <span className="sr-only">Sub-espacio: </span>
      {ETIQUETAS_CORTAS_SUB_ESPACIO[subEspacio]}
    </span>
  )
}
