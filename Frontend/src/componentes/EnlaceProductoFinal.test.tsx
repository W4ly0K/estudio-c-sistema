import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EnlaceProductoFinal, TEXTO_ENLACE_NO_DISPONIBLE } from './EnlaceProductoFinal'

describe('EnlaceProductoFinal (Fase 8 · requisito 4)', () => {
  it('abre en una pestaña nueva, sin opener ni referer, y su nombre accesible lleva el radicado', () => {
    render(<EnlaceProductoFinal enlace="https://youtu.be/abc123" radicado="EC-7" />)

    const enlace = screen.getByRole('link', { name: 'Abrir el producto final de EC-7 (se abre en una pestaña nueva)' })
    expect(enlace).toHaveAttribute('href', 'https://youtu.be/abc123')
    expect(enlace).toHaveAttribute('target', '_blank')
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://youtu.be/abc123', 'HTTPS://youtu.be/abc123'])(
    'con %s no crea ningún enlace: lo dice en texto',
    (enlace) => {
      const { container } = render(<EnlaceProductoFinal enlace={enlace} radicado="EC-7" />)

      expect(container.querySelector('a')).toBeNull()
      expect(screen.getByText(TEXTO_ENLACE_NO_DISPONIBLE)).toBeInTheDocument()
    },
  )
})
