import { useId } from 'react'
import { Link } from 'react-router'
import type { SolicitudPropia } from '../api/esquemas'
import { formatearFranja } from '../fechas/bogota'
import { ETIQUETAS_CATEGORIA, ETIQUETAS_SUB_ESPACIO } from '../presentacion/etiquetas'
import { rutaDetalle } from '../rutas'
import { InsigniaEstado, InsigniaSubEspacio, InsigniaUrgencia } from './Insignias'

export const TEXTO_PROPUESTA_STAFF = 'El Staff del Estudio C propone una nueva franja para esta solicitud.'
export const TEXTO_PROPUESTA_EN_ESPERA =
  'Tu respuesta es necesaria: mientras no aceptes o rechaces la propuesta, la solicitud queda en espera.'

/**
 * Tarjeta de una solicitud en el panel B1. Es un `<article>` con nombre accesible (su
 * radicado): el lector de pantalla puede saltar de tarjeta en tarjeta.
 */
export function TarjetaSolicitud({ solicitud }: { solicitud: SolicitudPropia }) {
  const id = useId()
  const idRadicado = `${id}-radicado`
  const {
    radicado,
    categoria,
    estado,
    es_urgencia: esUrgencia,
    fecha_inicio: inicio,
    fecha_fin: fin,
    fecha_propuesta_inicio: propuestaInicio,
    fecha_propuesta_fin: propuestaFin,
    proposito,
    recursos,
    sub_espacio: subEspacio,
    sub_espacio_propuesto: subEspacioPropuesto,
  } = solicitud
  // Fase 7 · Q-A6: la misma regla que el tablero: el lugar propuesto solo se anuncia si cambia.
  const lugarPropuesto =
    estado === 'Pendiente de Reprogramación' && subEspacioPropuesto !== null && subEspacioPropuesto !== subEspacio
      ? subEspacioPropuesto
      : null

  return (
    <article
      aria-labelledby={idRadicado}
      className={`rounded-lg p-6 bg-surface shadow-xs ${esUrgencia ? 'border-2 border-primary' : 'border border-outline'}`}
    >
      <div className="flex flex-wrap justify-between items-start gap-3 border-b border-outline pb-4 mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs text-gray-500 font-bold tracking-wider">RADICADO</span>
            <h3 id={idRadicado} className="text-lg font-black text-primary">{radicado}</h3>
          </div>
          {/* Fase 7 · PRD v2.2 §5.1: el lugar va junto a la categoría (lo que se reservó). */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block px-2.5 py-1 rounded-sm text-xs font-medium bg-gray-100 text-primary border border-gray-200">
              {ETIQUETAS_CATEGORIA[categoria]}
            </span>
            <InsigniaSubEspacio subEspacio={subEspacio} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {esUrgencia && <InsigniaUrgencia />}
          <InsigniaEstado estado={estado} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500 mb-0.5">Fecha y horario (hora de Colombia)</p>
          {/* DH2 · F2b: siempre en Bogotá y en 24 horas, se mire desde donde se mire. */}
          <p className="font-medium text-primary">{formatearFranja(inicio, fin)}</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">Propósito</p>
          <p className="font-medium text-primary line-clamp-2">{proposito}</p>
        </div>
      </div>

      {recursos.length > 0 && (
        <p className="mt-4 pt-3 border-t border-outline text-xs text-gray-600">
          Recursos: {recursos.map((r) => `${r.cantidad_solicitada} × ${r.recurso.nombre}`).join(' · ')}
        </p>
      )}

      {/* Wireframe B1 · "intervención inmediata": la propuesta del Staff se ve sin abrir el
          detalle. El motivo no viaja en este listado; se mostrará en el detalle (B3/B4). */}
      {estado === 'Pendiente de Reprogramación' && (
        <div data-aviso="reprogramacion" className="mt-4 p-3 border border-dotted border-gray-500 rounded-sm bg-gray-50 text-sm">
          <p className="font-bold text-primary">
            <span aria-hidden="true">↻ </span>
            {TEXTO_PROPUESTA_STAFF}
          </p>
          {/* Si el contrato llegara sin la franja propuesta, se omite la línea: nunca "Invalid Date". */}
          {propuestaInicio !== null && propuestaFin !== null && (
            <p className="mt-1 text-primary">
              Franja propuesta (hora de Colombia): <strong>{formatearFranja(propuestaInicio, propuestaFin)}</strong>
            </p>
          )}
          {lugarPropuesto !== null && (
            <p className="mt-1 text-primary">
              Sub-espacio propuesto: <strong>{ETIQUETAS_SUB_ESPACIO[lugarPropuesto]}</strong>
            </p>
          )}
          <p className="mt-1 text-gray-600">{TEXTO_PROPUESTA_EN_ESPERA}</p>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        {/* Nombre accesible único por tarjeta: en la lista de enlaces del lector de pantalla
            no aparecen N "Ver seguimiento detallado" idénticos. */}
        <Link
          to={rutaDetalle(radicado)}
          className="px-3 py-1.5 border border-primary rounded-sm text-sm font-medium text-primary hover:bg-gray-50"
        >
          {/* El espacio va FUERA del span: el cálculo del nombre accesible recorta los
              espacios de los extremos de cada elemento hijo, pero no los de un texto suelto. */}
          Ver seguimiento detallado{' '}
          <span className="sr-only">de {radicado}</span>
        </Link>
      </div>
    </article>
  )
}
