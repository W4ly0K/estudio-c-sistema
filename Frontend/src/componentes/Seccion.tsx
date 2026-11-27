import { useId, type ReactNode } from 'react'

/**
 * Fase 9 · R9-3 · V1-C (ADR-010 §2.8 C-11): sección con nombre (región con `aria-labelledby` hacia
 * su `h2`). Tres variantes, que se distinguen por la FORMA y no solo por el color:
 * - `atencion`: borde grueso en Azul 2 sobre superficie suave (lo que espera una respuesta; la misma
 *   convención que los atajos del Staff).
 * - `normal`: sin marco; el contenido (las tarjetas) ya trae el suyo.
 * - `secundaria`: superficie suave con borde fino (información de apoyo, como las recomendaciones).
 */
export type VarianteSeccion = 'atencion' | 'normal' | 'secundaria'

/** Clases completas por variante: Tailwind solo genera las que lee enteras. */
const MARCO: Readonly<Record<VarianteSeccion, string>> = {
  atencion: 'rounded-lg border-2 border-primary bg-superficie-suave p-4 sm:p-6',
  normal: '',
  secundaria: 'rounded-lg border border-borde-suave bg-superficie-suave p-4 sm:p-6',
}

interface SeccionProps {
  titulo: ReactNode
  descripcion?: ReactNode
  variante?: VarianteSeccion
  children: ReactNode
}

export function Seccion({ titulo, descripcion, variante = 'normal', children }: SeccionProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} data-variante={variante} className={`space-y-3 ${MARCO[variante]}`}>
      <h2 id={id} className="text-lg font-bold text-primary">
        {titulo}
      </h2>
      {descripcion !== undefined && <p className="text-sm text-texto-principal">{descripcion}</p>}
      {children}
    </section>
  )
}
