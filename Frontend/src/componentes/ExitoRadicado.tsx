import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import type { Solicitud } from '../api/esquemas'
import { formatearFranja } from '../fechas/bogota'
import { ETIQUETAS_CATEGORIA } from '../presentacion/etiquetas'
import { rutaDetalle } from '../rutas'
import { InsigniaEstado } from './Insignias'

export const TEXTO_EXITO_TITULO = '¡Solicitud registrada!'
/**
 * README del backend §9: la urgencia NO bloquea el envío, pero el solicitante debe avisar
 * al Staff. El aviso aparece solo si el SERVIDOR la marcó (`es_urgencia`): el cliente no
 * calcula días hábiles ni festivos (DH4).
 */
export const TEXTO_AVISO_URGENCIA =
  'Tu reserva es para dentro de menos de 5 días hábiles y quedó marcada como urgencia. Avisa al Staff del Estudio C por correo o por WhatsApp institucional para que pueda priorizarla.'

interface ExitoRadicadoProps {
  solicitud: Solicitud
  responsable: string
  /** Id del título: el `<dialog>` lo usa en `aria-labelledby` y así cambia de nombre. */
  idTitulo: string
  onVolver: () => void
}

/** Pantalla B1b: confirmación con el radicado, dentro del mismo diálogo del formulario. */
export function ExitoRadicado({ solicitud, responsable, idTitulo, onVolver }: ExitoRadicadoProps) {
  const tituloRef = useRef<HTMLHeadingElement>(null)

  // El botón "Enviar Radicado" (que tenía el foco) desapareció al cambiar de pantalla. Sin
  // esto, el foco caería al <body> y el teclado y el lector de pantalla quedarían perdidos.
  useEffect(() => {
    tituloRef.current?.focus()
  }, [])

  return (
    <div className="text-center text-sm">
      <div aria-hidden="true" className="w-14 h-14 rounded-full border-2 border-primary flex items-center justify-center mx-auto mb-3 text-2xl text-primary">
        ✓
      </div>
      <h3 id={idTitulo} ref={tituloRef} tabIndex={-1} className="text-xl font-bold text-primary outline-none">
        {TEXTO_EXITO_TITULO}
      </h3>
      <p className="text-gray-600 mt-1">Tu solicitud entró a la validación técnica del equipo del Estudio C.</p>

      <div className="my-5 p-4 border-2 border-dashed border-primary rounded-lg bg-gray-50">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Número oficial de radicado</p>
        <p className="text-2xl font-black text-primary tracking-tight">{solicitud.radicado}</p>
        <p className="text-xs text-gray-500 mt-1">Guárdalo: es la referencia para cualquier consulta con el Staff.</p>
      </div>

      {solicitud.es_urgencia && (
        <div data-aviso="urgencia" className="mb-5 p-3 border-2 border-dashed border-primary rounded-sm text-left text-primary">
          <strong>
            <span aria-hidden="true">⚠ </span>Urgencia:
          </strong>{' '}
          {TEXTO_AVISO_URGENCIA}
        </div>
      )}

      <dl className="border border-outline rounded-sm p-3 text-left space-y-2 mb-5">
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Categoría</dt>
          <dd className="font-semibold text-primary text-right">{ETIQUETAS_CATEGORIA[solicitud.categoria]}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Fecha y franja (hora de Colombia)</dt>
          <dd className="font-semibold text-primary text-right">{formatearFranja(solicitud.fecha_inicio, solicitud.fecha_fin)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Responsable</dt>
          <dd className="font-semibold text-primary text-right">{responsable}</dd>
        </div>
        <div className="flex justify-between items-center gap-3">
          <dt className="text-gray-500">Estado inicial</dt>
          <dd>
            <InsigniaEstado estado={solicitud.estado} />
          </dd>
        </div>
      </dl>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {/* Navegar desmonta el panel y con él el <dialog>: el navegador lo saca de la capa superior. */}
        <Link to={rutaDetalle(solicitud.radicado)} className="px-5 py-2.5 bg-primary text-white rounded-sm font-bold hover:opacity-90">
          Ver seguimiento detallado
        </Link>
        <button type="button" onClick={onVolver} className="px-5 py-2.5 border border-outline rounded-sm text-primary hover:bg-gray-50">
          Volver al panel
        </button>
      </div>
    </div>
  )
}
