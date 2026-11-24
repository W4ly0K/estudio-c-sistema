import { useEffect, useId, useState } from 'react'
import type { Resultado } from '../api/cliente'
import { useApi } from '../api/contexto-api'
import { textoDeError } from '../api/errores'
import type { HistorialEnlaces as DatosHistorial } from '../api/esquemas'
import { formatearMomento } from '../fechas/bogota'
import {
  TEXTO_HISTORIAL_CARGANDO,
  TEXTO_HISTORIAL_ERROR,
  TEXTO_HISTORIAL_VACIO,
  TEXTO_NOTA_HISTORIAL,
  TEXTO_SIN_ENLACE,
  TEXTO_TITULO_HISTORIAL,
  autorDelEvento,
  descripcionDelEvento,
} from '../presentacion/enlaces-staff'
import { CajaError } from './CajaError'

interface HistorialEnlacesProps {
  radicado: string
  /** El dueño de la solicitud: solo para atribuir el autor (DK4-4); no se muestra. */
  idSolicitante: string
  /** Sube con cada recarga del detalle: el historial se vuelve a pedir con él. */
  version: number
}

type Estado =
  | { readonly tipo: 'lista'; readonly datos: DatosHistorial }
  | { readonly tipo: 'error'; readonly texto: string }

/** Un valor histórico como TEXTO (DK4-3): nunca un enlace ejecutable, aunque fuera seguro. */
function Valor({ valor }: { valor: string | null }) {
  return valor === null ? (
    <span className="text-texto-secundario">{TEXTO_SIN_ENLACE}</span>
  ) : (
    <code className="break-all text-xs text-primary">{valor}</code>
  )
}

/**
 * Fase 9 · K4 (ADR-012 EV7 · ADR-009 AN15): el historial de enlaces, SOLO en el detalle del Staff
 * y aparte de la línea de vida (que sigue con `logs`, solo transiciones). Su carga, vacío y error
 * son propios: si falla, el detalle sigue usable. Mismo patrón de carga que las pantallas: la
 * respuesta se guarda con la clave que la pidió y "cargando" se DERIVA.
 */
export function HistorialEnlaces({ radicado, idSolicitante, version }: HistorialEnlacesProps) {
  const api = useApi()
  const id = useId()
  const [intento, setIntento] = useState(0)
  const clave = `${radicado}#${version}#${intento}`
  const [respuesta, setRespuesta] = useState<{ readonly clave: string; readonly estado: Estado } | null>(null)
  const estado = respuesta !== null && respuesta.clave === clave ? respuesta.estado : null

  useEffect(() => {
    let vigente = true
    void api.historialEnlaces(radicado).then((resultado: Resultado<DatosHistorial>) => {
      if (!vigente) return
      setRespuesta({
        clave,
        estado: resultado.ok ? { tipo: 'lista', datos: resultado.datos } : { tipo: 'error', texto: textoDeError(resultado.error) },
      })
    })
    return () => {
      vigente = false
    }
  }, [api, radicado, clave])

  return (
    <section aria-labelledby={`${id}-titulo`} className="border border-borde-suave rounded-lg p-4 sm:p-6 bg-surface text-sm">
      <h3 id={`${id}-titulo`} className="text-base font-bold text-primary">
        {TEXTO_TITULO_HISTORIAL}
      </h3>
      <p className="mt-1 text-xs text-texto-secundario">{TEXTO_NOTA_HISTORIAL}</p>
      {estado === null && <p className="mt-3 text-texto-secundario">{TEXTO_HISTORIAL_CARGANDO}</p>}
      {estado?.tipo === 'error' && (
        <div className="mt-3">
          <CajaError className="font-bold">
            {TEXTO_HISTORIAL_ERROR} {estado.texto}
          </CajaError>
          <button type="button" onClick={() => setIntento((n) => n + 1)} className="mt-2 underline font-bold text-primary">
            Reintentar
          </button>
        </div>
      )}
      {estado?.tipo === 'lista' && estado.datos.eventos.length === 0 && (
        <p className="mt-3 text-texto-secundario">{TEXTO_HISTORIAL_VACIO}</p>
      )}
      {estado?.tipo === 'lista' && estado.datos.eventos.length > 0 && (
        <ol className="mt-3 space-y-3">
          {estado.datos.eventos.map((evento) => (
            <li key={evento.id_log} className="border border-borde-suave rounded-sm p-3">
              <p className="font-bold text-primary">{descripcionDelEvento(evento)}</p>
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-texto-secundario">Fecha (hora de Colombia)</dt>
                <dd>{formatearMomento(evento.fecha_modificacion)}</dd>
                <dt className="text-texto-secundario">Antes</dt>
                <dd>
                  <Valor valor={evento.enlace_anterior} />
                </dd>
                <dt className="text-texto-secundario">Después</dt>
                <dd>
                  <Valor valor={evento.enlace_nuevo} />
                </dd>
                {evento.motivo_correccion !== null && (
                  <>
                    <dt className="text-texto-secundario">Motivo</dt>
                    <dd className="whitespace-pre-line">{evento.motivo_correccion}</dd>
                  </>
                )}
                <dt className="text-texto-secundario">Registrado por</dt>
                <dd>{autorDelEvento(evento, idSolicitante)}</dd>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
