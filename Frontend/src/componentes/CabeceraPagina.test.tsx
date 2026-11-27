import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CabeceraPagina } from './CabeceraPagina'

describe('CabeceraPagina (R9-3 · V1-B)', () => {
  it('lleva el único h1 de la pantalla, con su contexto y su descripción', () => {
    render(<CabeceraPagina contexto="Inicio" titulo="Hola, Ana" descripcion="Sigue tus solicitudes." />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Hola, Ana' })).toHaveClass('font-black', 'text-primary', 'break-words')
    expect(screen.getByText('Inicio')).toBeInTheDocument()
    expect(screen.getByText('Sigue tus solicitudes.')).toBeInTheDocument()
  })

  it('la acción es opcional y va después del texto en el DOM (orden de lectura y de Tab)', () => {
    render(<CabeceraPagina titulo="Tablero" accion={<button type="button">Actualizar</button>} />)
    const titulo = screen.getByRole('heading', { level: 1 })
    const accion = screen.getByRole('button', { name: 'Actualizar' })

    expect(titulo.compareDocumentPosition(accion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sin contexto, descripción ni acción no deja estructuras vacías', () => {
    const { container } = render(<CabeceraPagina titulo="Solo título" />)

    expect(container.querySelectorAll('p')).toHaveLength(0)
    expect(container.querySelector('[data-parte="cabecera-pagina"]')?.children).toHaveLength(1)
  })
})
