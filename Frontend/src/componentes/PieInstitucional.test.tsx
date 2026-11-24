import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DESCRIPTOR_SISTEMA, LEMA, TEXTO_IDENTIDAD } from '../presentacion/identidad'
import { PieInstitucional } from './PieInstitucional'

describe('PieInstitucional (R9-3 · V1-A)', () => {
  it('es la región de información del sitio, con la pertenencia, el sistema y el lema', () => {
    render(<PieInstitucional />)
    const pie = screen.getByRole('contentinfo')

    expect(pie).toHaveTextContent(TEXTO_IDENTIDAD)
    expect(pie).toHaveTextContent(DESCRIPTOR_SISTEMA)
    expect(pie).toHaveTextContent(LEMA)
  })

  it('es discreto y no atribuye datos no verificados: sin enlaces ni imágenes', () => {
    render(<PieInstitucional />)
    const pie = screen.getByRole('contentinfo')

    expect(pie.querySelectorAll('a, img')).toHaveLength(0)
  })
})
