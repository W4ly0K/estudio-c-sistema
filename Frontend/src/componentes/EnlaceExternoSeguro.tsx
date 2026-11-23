import { esEnlaceSeguro } from '../presentacion/enlace'

interface EnlaceExternoSeguroProps {
  readonly enlace: string
  readonly radicado: string
  /** Texto visible del enlace (p. ej. "Abrir el producto final"). */
  readonly texto: string
  /** Lo que se dice, SIN crear ningún `<a>`, si el enlace guardado no es seguro. */
  readonly textoNoDisponible: string
  /** Marca para estilos y diagnóstico (`data-enlace`). */
  readonly marca: string
}

/**
 * Fase 9 · R9-1 (D2): un solo lugar decide cómo se abre un enlace externo guardado (el producto
 * final de la Fase 8 y el anexo del solicitante). Si el texto no es un https:// válido, NO se crea
 * ningún `<a>` (ni javascript: ni data: llegan a un href). Pestaña nueva con
 * rel="noopener noreferrer": la página abierta no recibe `window.opener` ni la URL de origen. El
 * nombre accesible lleva el radicado (único en el panel) y avisa de la pestaña nueva; la flecha
 * es decorativa.
 */
export function EnlaceExternoSeguro({ enlace, radicado, texto, textoNoDisponible, marca }: EnlaceExternoSeguroProps) {
  if (!esEnlaceSeguro(enlace)) {
    return (
      <p data-enlace="no-disponible" className="text-sm text-gray-600">
        {textoNoDisponible}
      </p>
    )
  }
  return (
    <a
      href={enlace}
      target="_blank"
      rel="noopener noreferrer"
      data-enlace={marca}
      className="inline-flex items-center gap-1 font-bold text-primary underline hover:text-primary-hover"
    >
      {/* El espacio va fuera del sr-only: dentro se recorta al calcular el nombre accesible. */}
      {texto}{' '}
      <span className="sr-only">de {radicado} (se abre en una pestaña nueva)</span>
      <span aria-hidden="true">↗</span>
    </a>
  )
}
