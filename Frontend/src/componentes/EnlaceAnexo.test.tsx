import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EnlaceAnexo, TEXTO_ANEXO_NO_DISPONIBLE } from './EnlaceAnexo'

describe('EnlaceAnexo (Fase 9 · R9-1)', () => {
  it('abre en una pestaña nueva, sin opener ni referer, y su nombre accesible lleva el radicado', () => {
    render(<EnlaceAnexo enlace="https://drive.google.com/file/d/xyz/view" radicado="EC-7" />)

    const enlace = screen.getByRole('link', { name: 'Abrir el anexo de EC-7 (se abre en una pestaña nueva)' })
    expect(enlace).toHaveAttribute('href', 'https://drive.google.com/file/d/xyz/view')
    expect(enlace).toHaveAttribute('target', '_blank')
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://drive.google.com/x', 'HTTPS://drive.google.com/x'])(
    'con %s no crea ningún enlace: lo dice en texto',
    (enlace) => {
      const { container } = render(<EnlaceAnexo enlace={enlace} radicado="EC-7" />)

      expect(container.querySelector('a')).toBeNull()
      expect(screen.getByText(TEXTO_ANEXO_NO_DISPONIBLE)).toBeInTheDocument()
    },
  )
})
