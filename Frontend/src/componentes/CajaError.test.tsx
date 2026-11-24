import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CajaError } from './CajaError'
import { InsigniaUrgencia } from './Insignias'

describe('CajaError (R9-3 · D-R3-3)', () => {
  it('se anuncia como alerta con el mensaje en texto', () => {
    render(<CajaError>No se pudo guardar.</CajaError>)

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar.')
    expect(screen.getByText('No se pudo guardar.')).toBeInTheDocument()
  })

  it('el ícono es decorativo: queda oculto para los lectores de pantalla', () => {
    const { container } = render(<CajaError>Mensaje</CajaError>)

    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('⚠')
  })

  it('es una caja blanca con borde continuo y barra lateral en borde-error, marcada como error', () => {
    render(<CajaError className="mt-4 font-bold">Mensaje</CajaError>)

    const caja = screen.getByRole('alert')
    expect(caja).toHaveAttribute('data-aviso', 'error')
    expect(caja).toHaveClass('bg-surface', 'text-accent', 'border', 'border-l-4', 'border-borde-error', 'mt-4', 'font-bold')
    expect(caja).not.toHaveClass('border-dashed')
  })

  it('VI3: error y urgencia se distinguen por sus marcas y su forma, no solo por el tono', () => {
    const { container } = render(
      <>
        <CajaError>Mensaje</CajaError>
        <InsigniaUrgencia />
      </>,
    )

    const urgencia = container.querySelector('[data-insignia="urgencia"]')
    expect(urgencia).toHaveClass('border-dashed')
    expect(urgencia).not.toHaveAttribute('role', 'alert')
    expect(container.querySelector('[data-aviso="error"]')).not.toBe(urgencia)
  })
})
