import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SUB_ESPACIOS } from '../api/esquemas'
import { ESTADOS } from '../api/maquina-estados'
import { InsigniaEstado, InsigniaSubEspacio, InsigniaUrgencia } from './Insignias'

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

  describe('InsigniaSubEspacio (Fase 7 · PRD v2.2 §5.1)', () => {
    it.each(SUB_ESPACIOS)('"%s" se anuncia como sub-espacio, con su nombre en texto', (subEspacio) => {
      const { container } = render(<InsigniaSubEspacio subEspacio={subEspacio} />)

      const insignia = container.querySelector(`[data-sub-espacio="${subEspacio}"]`)
      // El símbolo va primero, oculto para el lector de pantalla; el texto dice qué es.
      expect(insignia).toHaveTextContent(/Sub-espacio: \S/)
      expect(insignia?.querySelector('[aria-hidden="true"]')).not.toBeNull()
    })

    it('los tres lugares se leen distintos y no se confunden con un estado (forma de píldora)', () => {
      const textos = SUB_ESPACIOS.map((subEspacio) => {
        const { container, unmount } = render(<InsigniaSubEspacio subEspacio={subEspacio} />)
        const texto = container.textContent
        expect(container.firstElementChild).toHaveClass('rounded-full')
        unmount()
        return texto
      })

      expect(new Set(textos).size).toBe(SUB_ESPACIOS.length)
    })
  })
})
