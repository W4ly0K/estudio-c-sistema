import { DESCRIPTOR_SISTEMA, LEMA, TEXTO_IDENTIDAD } from '../presentacion/identidad'

/**
 * Fase 9 · R9-3 · V1-A (ADR-010 §2.8): pie institucional discreto. Solo pertenencia, nombre del
 * sistema y lema: sin datos de contacto ni enlaces, porque ninguno está verificado.
 */
export function PieInstitucional() {
  return (
    <footer className="w-full border-t border-borde-suave bg-surface px-4 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="font-bold text-primary">{TEXTO_IDENTIDAD}</p>
        <p className="text-texto-secundario">
          {DESCRIPTOR_SISTEMA} · <span className="italic">{LEMA}</span>
        </p>
      </div>
    </footer>
  )
}
