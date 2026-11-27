import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Seccion } from './Seccion'

describe('Seccion (R9-3 · V1-C)', () => {
  it('es una región nombrada por su h2, con su descripción y su contenido', () => {
    render(
      <Seccion titulo="Tus próximas reservas" descripcion="Las validadas por delante.">
        <p>Contenido</p>
      </Seccion>,
    )
    const region = screen.getByRole('region', { name: 'Tus próximas reservas' })

    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Tus próximas reservas')
    expect(within(region).getByText('Las validadas por delante.')).toBeInTheDocument()
    expect(within(region).getByText('Contenido')).toBeInTheDocument()
  })

  it.each([
    ['atencion', ['border-2', 'border-primary', 'bg-superficie-suave']],
    ['secundaria', ['border', 'border-borde-suave', 'bg-superficie-suave']],
  ] as const)('la variante %s se distingue por su marco', (variante, clases) => {
    render(
      <Seccion titulo="Sección" variante={variante}>
        <p>Contenido</p>
      </Seccion>,
    )

    expect(screen.getByRole('region', { name: 'Sección' })).toHaveClass(...clases)
  })

  it('la variante normal no dibuja marco y sin descripción no deja párrafos vacíos', () => {
    render(
      <Seccion titulo="Sección">
        <span>Contenido</span>
      </Seccion>,
    )
    const region = screen.getByRole('region', { name: 'Sección' })

    expect(region).not.toHaveClass('border', 'border-2', 'rounded-lg')
    expect(region.querySelectorAll('p')).toHaveLength(0)
  })
})
