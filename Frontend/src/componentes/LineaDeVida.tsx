import { useId } from 'react'
import { formatearMomento } from '../fechas/bogota'
import { etiquetaEstado } from '../presentacion/etiquetas'
import type { LineaDeVida as DatosLinea, SituacionPaso } from '../presentacion/linea-de-vida'
import { InsigniaEstado } from './Insignias'

/**
 * Cada situación se distingue por FORMA y símbolo, y además se dice en texto para el
 * lector de pantalla (DV6): el color nunca es la única señal.
 */
const NODO: Readonly<Record<SituacionPaso, { readonly clases: string; readonly simbolo: string; readonly texto: string }>> = {
  completado: { clases: 'bg-primary text-surface border-2 border-primary', simbolo: '✓', texto: 'completado' },
  actual: { clases: 'bg-surface text-primary border-4 border-primary', simbolo: '●', texto: 'en curso' },
  pendiente: { clases: 'bg-surface text-texto-secundario border border-borde-control', simbolo: '', texto: 'pendiente' },
  omitido: { clases: 'bg-surface text-texto-terciario border border-dashed border-borde-control', simbolo: '–', texto: 'no se realizará' },
}

export function LineaDeVida({ linea }: { linea: DatosLinea }) {
  const id = useId()
  return (
    <div className="space-y-6">
      <section aria-labelledby={`${id}-linea`} className="border border-borde-suave rounded-lg p-6 bg-surface">
        <h3 id={`${id}-linea`} className="text-sm font-bold text-primary mb-5">
          Línea de vida
        </h3>
        {/* Fase 8: 5 pasos con la edición (PODCAST y VIDEO), 4 sin ella. Clases literales para Tailwind. */}
        <ol className={`grid gap-4 ${linea.pasos.length === 5 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {linea.pasos.map((paso, indice) => {
            const nodo = NODO[paso.situacion]
            return (
              <li
                key={paso.estado}
                data-situacion={paso.situacion}
                aria-current={paso.situacion === 'actual' ? 'step' : undefined}
                className="flex flex-col items-center text-center"
              >
                <span aria-hidden="true" className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${nodo.clases}`}>
                  {nodo.simbolo === '' ? indice + 1 : nodo.simbolo}
                </span>
                <span className={`mt-2 text-xs font-bold ${paso.situacion === 'actual' ? 'text-primary underline' : 'text-texto-principal'}`}>
                  {etiquetaEstado(paso.estado, linea.perspectiva)}
                </span>
                <span className="sr-only">: {nodo.texto}</span>
                {/* "Recibido" no tiene registro con hora: el log solo guarda CAMBIOS de estado. */}
                {paso.fecha !== null && <span className="text-xs text-texto-secundario">{formatearMomento(paso.fecha)}</span>}
              </li>
            )
          })}
        </ol>
        {linea.desvio !== null && (
          <p className="mt-5 pt-4 border-t border-borde-suave text-sm text-texto-principal flex flex-wrap items-center gap-2">
            Estado actual, fuera del camino habitual: <InsigniaEstado estado={linea.desvio} perspectiva={linea.perspectiva} />
          </p>
        )}
      </section>

      <section aria-labelledby={`${id}-historial`} className="border border-borde-suave rounded-lg p-6 bg-surface">
        <h3 id={`${id}-historial`} className="text-sm font-bold text-primary mb-4">
          Historial de cambios
        </h3>
        <ol className="space-y-3">
          <li className="border-l-2 border-borde-suave pl-3 py-1 text-sm">
            <p className="font-bold text-primary">Solicitud radicada</p>
            <p className="text-texto-secundario text-xs">Estado inicial: Recibido</p>
          </li>
          {linea.eventos.map((evento) => (
            <li key={`${evento.fecha}-${evento.hacia}`} className="border-l-2 border-primary pl-3 py-1 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-bold text-primary">
                  {etiquetaEstado(evento.desde, linea.perspectiva)} → {etiquetaEstado(evento.hacia, linea.perspectiva)}
                </p>
                <p className="text-xs text-texto-secundario">{formatearMomento(evento.fecha)}</p>
              </div>
              {evento.actor !== null && <p className="text-xs text-texto-secundario">Por: {evento.actor}</p>}
              {evento.motivo !== null && (
                <p className="mt-1 text-texto-principal">
                  <span className="font-bold">{evento.motivo.etiqueta}:</span> {evento.motivo.texto}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
