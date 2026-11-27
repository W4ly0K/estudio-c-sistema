import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TEXTO_PROCESANDO } from '../presentacion/acciones-solicitante'
import { DialogoConfirmacion } from './DialogoConfirmacion'

const RAZON = 'Para rechazar, escribe un motivo de al menos 10 caracteres.'

interface Opciones {
  puedeConfirmar?: boolean
  razonBloqueo?: string
  enCurso?: boolean
  irreversible?: boolean
}

function mostrar({ puedeConfirmar, razonBloqueo, enCurso = false, irreversible = true }: Opciones = {}) {
  const props = {
    abierto: true,
    titulo: 'Rechazar la solicitud',
    descripcion: 'El radicado pasa a "Rechazado".',
    textoConfirmar: 'Sí, rechazar',
    irreversible,
    enCurso,
    puedeConfirmar,
    razonBloqueo,
    onConfirmar: () => undefined,
    onCerrar: () => undefined,
  }
  const vista = render(<DialogoConfirmacion {...props} />)
  const dialogo = screen.getByRole('dialog', { name: 'Rechazar la solicitud' })
  return { ...vista, props, dialogo }
}

describe('DialogoConfirmacion · razón del bloqueo (Fase 7 · B2)', () => {
  it('bloqueado con razón: el botón se deshabilita y su descripción accesible explica por qué', () => {
    const { dialogo } = mostrar({ puedeConfirmar: false, razonBloqueo: RAZON })
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, rechazar' })

    expect(confirmar).toBeDisabled()
    expect(confirmar).toHaveAccessibleDescription(RAZON)
    expect(within(dialogo).getByText(RAZON)).toBeVisible()
  })

  it('bloqueado se distingue por la forma (gris y borde punteado), no solo por la opacidad del rojo', () => {
    const { dialogo } = mostrar({ puedeConfirmar: false, razonBloqueo: RAZON })
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, rechazar' })

    expect(confirmar).toHaveClass('bg-gray-200', 'border-dashed', 'cursor-not-allowed')
    expect(confirmar).not.toHaveClass('bg-accent')
  })

  it('al volverse válido, la razón desaparece y el botón recupera su color y queda sin descripción', () => {
    const { dialogo, props, rerender } = mostrar({ puedeConfirmar: false, razonBloqueo: RAZON })

    rerender(<DialogoConfirmacion {...props} puedeConfirmar />)

    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, rechazar' })
    expect(confirmar).toBeEnabled()
    expect(confirmar).toHaveClass('bg-accent')
    expect(confirmar).not.toHaveAttribute('aria-describedby')
    expect(within(dialogo).queryByText(RAZON)).not.toBeInTheDocument()
  })

  it('una acción reversible habilitada conserva su color primario', () => {
    const { dialogo } = mostrar({ irreversible: false })

    expect(within(dialogo).getByRole('button', { name: 'Sí, rechazar' })).toHaveClass('bg-primary')
  })

  it('con la petición en vuelo no se muestra la razón: el botón dice que está procesando', () => {
    const { dialogo } = mostrar({ puedeConfirmar: false, razonBloqueo: RAZON, enCurso: true })
    const confirmar = within(dialogo).getByRole('button', { name: TEXTO_PROCESANDO })

    expect(confirmar).toBeDisabled()
    expect(confirmar).not.toHaveAttribute('aria-describedby')
    expect(confirmar).not.toHaveClass('bg-gray-200')
    expect(within(dialogo).queryByText(RAZON)).not.toBeInTheDocument()
  })

  it('sin razonBloqueo, el comportamiento previo no cambia (los diálogos del solicitante no la pasan)', () => {
    const { dialogo } = mostrar()
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, rechazar' })

    expect(confirmar).toBeEnabled()
    expect(confirmar).not.toHaveAttribute('aria-describedby')
  })

  it('una razón vacía no deja un párrafo ni una referencia accesible vacíos', () => {
    const { dialogo } = mostrar({ puedeConfirmar: false, razonBloqueo: '' })
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, rechazar' })

    expect(confirmar).toBeDisabled()
    expect(confirmar).not.toHaveAttribute('aria-describedby')
  })
})
