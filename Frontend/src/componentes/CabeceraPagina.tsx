import type { ReactNode } from 'react'

interface CabeceraPaginaProps {
  /** Rótulo opcional de contexto sobre el título (por ejemplo, el área de la pantalla). */
  contexto?: string
  /** El único `h1` de la pantalla. */
  titulo: string
  descripcion?: ReactNode
  /** Acción principal opcional, alineada a la derecha en pantallas anchas. */
  accion?: ReactNode
}

/**
 * Fase 9 · R9-3 · V1-B (ADR-010 §2.8 C-7): cabecera de cada pantalla con sesión. Lleva el único
 * `h1` (el encabezado ya no repite el título de la página) y separa la cabecera del contenido con
 * un borde, sin adornos. En móvil la acción baja debajo del texto (`flex-wrap`); el título envuelve
 * y nunca se trunca.
 */
export function CabeceraPagina({ contexto, titulo, descripcion, accion }: CabeceraPaginaProps) {
  return (
    <div data-parte="cabecera-pagina" className="flex flex-wrap items-end justify-between gap-4 border-b border-borde-suave pb-6">
      <div className="min-w-0 space-y-1">
        {contexto !== undefined && (
          <p className="text-xs font-bold uppercase tracking-wider text-texto-secundario">{contexto}</p>
        )}
        <h1 className="text-2xl sm:text-3xl font-black text-primary break-words">{titulo}</h1>
        {descripcion !== undefined && <p className="text-sm text-texto-secundario">{descripcion}</p>}
      </div>
      {accion !== undefined && <div className="shrink-0">{accion}</div>}
    </div>
  )
}
