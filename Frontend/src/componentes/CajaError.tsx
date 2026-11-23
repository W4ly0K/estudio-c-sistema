import type { ReactNode } from 'react'

/**
 * Fase 9 · R9-3 (ADR-010, D-R3-3): caja de error única. Fondo blanco (surface), texto en accent
 * (4,89:1) y borde continuo con barra lateral de 4 px en borde-error (alias de accent, ≥ 3:1).
 * Se distingue de la urgencia por la FORMA, no por el tono (VI3: Rojo 1 y Rojo 2 difieren solo
 * 1,32:1): la urgencia es una píldora en línea con borde discontinuo; el error, un bloque con borde
 * continuo y barra. El ícono es decorativo: el mensaje ya está en texto. `data-aviso="error"` es la
 * marca que usan las pruebas.
 */
export function CajaError({ children, className = '' }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div
      role="alert"
      data-aviso="error"
      className={`flex items-start gap-2 p-3 bg-surface border border-l-4 border-borde-error rounded-sm text-accent ${className}`}
    >
      <span aria-hidden="true">⚠</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
