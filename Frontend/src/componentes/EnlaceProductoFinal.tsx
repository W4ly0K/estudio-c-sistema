import { esEnlaceSeguro } from '../presentacion/enlace'

export const TEXTO_PRODUCTO_FINAL = 'Producto final'
export const TEXTO_ENLACE_NO_DISPONIBLE = 'El enlace registrado no es válido. Comunícate con el Estudio C.'

/**
 * Fase 8 · requisito 4: el enlace del producto final, abierto de forma segura. Si el texto no
 * es un https:// válido, NO se crea ningún `<a>` (ni javascript: ni data: llegan a un href).
 * Pestaña nueva con rel="noopener noreferrer": la página abierta no recibe `window.opener` ni
 * la URL de origen. El nombre accesible lleva el radicado (único en el panel) y avisa de la
 * pestaña nueva; la flecha es decorativa.
 */
export function EnlaceProductoFinal({ enlace, radicado }: { enlace: string; radicado: string }) {
  if (!esEnlaceSeguro(enlace)) {
    return (
      <p data-enlace="no-disponible" className="text-sm text-gray-600">
        {TEXTO_ENLACE_NO_DISPONIBLE}
      </p>
    )
  }
  return (
    <a
      href={enlace}
      target="_blank"
      rel="noopener noreferrer"
      data-enlace="producto-final"
      className="inline-flex items-center gap-1 font-bold text-primary underline hover:text-primary-hover"
    >
      {/* El espacio va fuera del sr-only: dentro se recorta al calcular el nombre accesible. */}
      Abrir el producto final{' '}
      <span className="sr-only">de {radicado} (se abre en una pestaña nueva)</span>
      <span aria-hidden="true">↗</span>
    </a>
  )
}
