import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ESTADOS } from '../api/maquina-estados'
import { InsigniaEstado, InsigniaUrgencia } from './Insignias'

describe('Insignias (DV6)', () => {
  it.each(ESTADOS)('"%s" muestra su nombre completo', (estado) => {
    const { container } = render(<InsigniaEstado estado={estado} />)

    expect(container.querySelector(`[data-estado="${estado}"]`)).toHaveTextContent(estado)
  })

  it('los 8 estados se ven distintos entre sí', () => {
    const clases = ESTADOS.map((estado) => {
      const { container, unmount } = render(<InsigniaEstado estado={estado} />)
      const clase = container.firstElementChild?.className ?? ''
      unmount()
      return clase
    })

    expect(new Set(clases).size).toBe(ESTADOS.length)
  })

  it.each([
    ['Rechazado', 'border-dashed'],
    ['Pendiente de Reprogramación', 'border-dotted'],
    ['En Producción', 'bg-gray-900'],
    ['No atendida', 'border-2'],
  ] as const)('"%s" se distingue por la forma o el contraste (%s), no solo por el color', (estado, clase) => {
    const { container } = render(<InsigniaEstado estado={estado} />)

    expect(container.firstElementChild).toHaveClass(clase)
  })

  it('el símbolo es decorativo: queda oculto para los lectores de pantalla', () => {
    const { container } = render(<InsigniaEstado estado="Rechazado" />)

    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('✕')
  })

  it('Fase 7: "No atendida" no se confunde con "Rechazado" (otro grosor de borde y otro símbolo)', () => {
    const { container } = render(<InsigniaEstado estado="No atendida" />)

    expect(container.firstElementChild).toHaveClass('border-dashed', 'border-2')
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('○')
  })

  it('la urgencia se anuncia con texto, no solo con el ícono', () => {
    render(<InsigniaUrgencia />)

    expect(screen.getByText('Urgencia')).toBeInTheDocument()
  })
})
