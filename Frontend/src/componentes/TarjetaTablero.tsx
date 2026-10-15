import { useId } from 'react'
import { Link } from 'react-router'
import type { SolicitudTablero } from '../api/esquemas'
import { formatearFranja } from '../fechas/bogota'
import { ETIQUETAS_CATEGORIA } from '../presentacion/etiquetas'
import { rutaDetalle } from '../rutas'
import { InsigniaEstado, InsigniaUrgencia } from './Insignias'

interface TarjetaTableroProps {
  solicitud: SolicitudTablero
  /** En las columnas activas el estado ya lo dice la columna; en las cerradas se muestra. */
  mostrarEstado: boolean
}

/**
 * Tarjeta compacta del tablero del Staff (6.5.1). Las acciones viven en el detalle (DE4),
 * no aquí: la tarjeta solo informa y lleva al detalle. Es un `<article>` con nombre
 * accesible (su radicado), como las del solicitante.
 */
export function TarjetaTablero({ solicitud, mostrarEstado }: TarjetaTableroProps) {
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
    usuario,
  } = solicitud

  return (
    <article
      aria-labelledby={idRadicado}
      className={`rounded-md p-4 bg-surface shadow-xs ${esUrgencia ? 'border-2 border-primary' : 'border border-outline'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 id={idRadicado} className="font-black text-primary">
          {radicado}
        </h4>
        <div className="flex flex-wrap gap-1">
          {esUrgencia && <InsigniaUrgencia />}
          {mostrarEstado && <InsigniaEstado estado={estado} />}
        </div>
      </div>

      <dl className="mt-2 space-y-1 text-sm">
        <div>
          <dt className="sr-only">Franja (hora de Colombia)</dt>
          {/* DH2: siempre en Bogotá y en 24 horas, se mire desde donde se mire. */}
          <dd className="font-medium text-primary">{formatearFranja(inicio, fin)}</dd>
        </div>
        {/* Si el contrato llegara sin la franja propuesta, se omite: nunca "Invalid Date". */}
        {estado === 'Pendiente de Reprogramación' && propuestaInicio !== null && propuestaFin !== null && (
          <div>
            <dt className="text-xs text-gray-500">Franja propuesta</dt>
            <dd className="text-primary">{formatearFranja(propuestaInicio, propuestaFin)}</dd>
          </div>
        )}
        <div>
          <dt className="sr-only">Categoría</dt>
          <dd className="text-gray-700">{ETIQUETAS_CATEGORIA[categoria]}</dd>
        </div>
        <div>
          <dt className="sr-only">Solicitante</dt>
          <dd className="text-gray-700">{usuario.nombre}</dd>
        </div>
      </dl>

      <div className="mt-3 flex justify-end">
        {/* Nombre accesible único por tarjeta; el espacio va FUERA del span (ver TarjetaSolicitud). */}
        <Link
          to={rutaDetalle(radicado)}
          className="px-3 py-1.5 border border-primary rounded-sm text-xs font-medium text-primary hover:bg-gray-50"
        >
          Abrir detalle{' '}
          <span className="sr-only">de {radicado}</span>
        </Link>
      </div>
    </article>
  )
}
