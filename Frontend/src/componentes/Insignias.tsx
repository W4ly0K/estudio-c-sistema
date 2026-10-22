import type { Estado } from '../api/maquina-estados'

/**
 * Insignias de estado del wireframe (Sección D): se distinguen por la FORMA del borde
 * y un símbolo, no solo por el color (DV6 · accesibilidad). `Record<Estado, …>`: un
 * estado nuevo no compila hasta tener su insignia.
 */
const ESTILO: Readonly<Record<Estado, { readonly clases: string; readonly simbolo: string }>> = {
  Recibido: { clases: 'bg-gray-100 border border-gray-400 text-gray-700', simbolo: '' },
  Validado: { clases: 'bg-white border border-gray-900 text-gray-900', simbolo: '' },
  'En Producción': { clases: 'bg-gray-900 border border-gray-900 text-white', simbolo: '●' },
  Entregado: { clases: 'bg-gray-100 border border-gray-900 text-gray-900', simbolo: '✓' },
  Rechazado: { clases: 'bg-white border border-dashed border-gray-900 text-gray-900', simbolo: '✕' },
  'Cancelado por el Usuario': { clases: 'bg-gray-200 border border-gray-200 text-gray-500', simbolo: '' },
  'Pendiente de Reprogramación': { clases: 'bg-white border border-dotted border-gray-500 text-gray-700', simbolo: '↻' },
  // Fase 7: final como Rechazado, pero sin decisión del Estudio sobre el contenido. Borde
  // discontinuo GRUESO y gris (Rechazado: fino y negro) y un círculo vacío, no la ✕ del rechazo.
  'No atendida': { clases: 'bg-gray-100 border-2 border-dashed border-gray-400 text-gray-600', simbolo: '○' },
}

export function InsigniaEstado({ estado }: { estado: Estado }) {
  const { clases, simbolo } = ESTILO[estado]
  return (
    <span
      data-estado={estado}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold ${clases}`}
    >
      {/* El símbolo es decorativo: el lector de pantalla lee el nombre del estado. */}
      {simbolo !== '' && <span aria-hidden="true">{simbolo}</span>}
      {estado}
    </span>
  )
}

/** Urgencia (README del backend §9): reserva antes del 6.º día hábil. Borde discontinuo grueso. */
export function InsigniaUrgencia() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-xs font-bold uppercase tracking-wider border-2 border-dashed border-primary text-primary bg-surface">
      <span aria-hidden="true">⚠</span>
      Urgencia
    </span>
  )
}
