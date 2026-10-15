import { useEffect, useId, useRef, type ReactNode } from 'react'
import { TEXTO_PROCESANDO, TEXTO_VOLVER_SIN_CAMBIOS } from '../presentacion/acciones-solicitante'

interface DialogoConfirmacionProps {
  abierto: boolean
  titulo: string
  descripcion: string
  textoConfirmar: string
  irreversible: boolean
  /** Mientras la petición viaja: botones deshabilitados y Escape no cierra. */
  enCurso: boolean
  /** Falso mientras el contenido no es válido (p. ej., un motivo corto). Por defecto, verdadero. */
  puedeConfirmar?: boolean
  onConfirmar: () => void
  onCerrar: () => void
  /** Error de la última confirmación (con sus acciones de recuperación, si las hay). */
  children?: ReactNode
}

/**
 * Confirmación con el <dialog> NATIVO (mismo patrón que el formulario B2): foco atrapado,
 * Escape y fondo inerte los pone el navegador. "Volver sin cambios" va PRIMERO: es lo que
 * enfoca `showModal()`, así un Enter apresurado nunca ejecuta una acción irreversible.
 */
export function DialogoConfirmacion({
  abierto,
  titulo,
  descripcion,
  textoConfirmar,
  irreversible,
  enCurso,
  puedeConfirmar = true,
  onConfirmar,
  onCerrar,
  children,
}: DialogoConfirmacionProps) {
  const id = useId()
  const dialogoRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const elemento = dialogoRef.current
    if (elemento === null) return
    if (abierto && !elemento.open) elemento.showModal()
    if (!abierto && elemento.open) elemento.close()
  }, [abierto])

  return (
    <dialog
      ref={dialogoRef}
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-descripcion`}
      onClose={onCerrar}
      onCancel={(evento) => {
        // Escape con la petición en vuelo: cerrar haría creer que se canceló la acción.
        if (enCurso) evento.preventDefault()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-surface border border-outline rounded-xl p-6 shadow-xl backdrop:bg-black/50 text-sm"
    >
      {abierto && (
        <>
          <h3 id={`${id}-titulo`} className="text-lg font-bold text-primary mb-3">
            {titulo}
          </h3>
          <p id={`${id}-descripcion`} className="text-gray-700">
            {descripcion}
          </p>
          {children}
          <div className="flex flex-wrap justify-end gap-3 pt-5">
            <button
              type="button"
              onClick={onCerrar}
              disabled={enCurso}
              className="px-4 py-2 border border-outline rounded-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {TEXTO_VOLVER_SIN_CAMBIOS}
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={enCurso || !puedeConfirmar}
              aria-busy={enCurso}
              className={`px-4 py-2 rounded-sm font-bold disabled:opacity-60 ${
                irreversible ? 'bg-accent text-white' : 'bg-primary text-white'
              }`}
            >
              {enCurso ? TEXTO_PROCESANDO : textoConfirmar}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
