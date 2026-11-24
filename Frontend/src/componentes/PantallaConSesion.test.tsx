import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { UsuarioSesion } from '../api/esquemas'
import { ID_CONTENIDO } from './Encabezado'
import { PantallaConSesion } from './PantallaConSesion'

const USUARIO: UsuarioSesion = { id: 'uuid', nombre: 'Ana Pérez', rol: 'SOLICITANTE' }

function mostrar() {
  render(
    <MemoryRouter>
      <PantallaConSesion usuario={USUARIO} onLogout={() => undefined} titulo="Inicio" claseContenido="flex-1 p-8">
        <p>Contenido de prueba</p>
      </PantallaConSesion>
    </MemoryRouter>,
  )
}

describe('PantallaConSesion (R9-3 · V1-A)', () => {
  it('compone las regiones en orden: encabezado, contenido principal y pie', () => {
    mostrar()
    const encabezado = screen.getByRole('banner')
    const principal = screen.getByRole('main')
    const pie = screen.getByRole('contentinfo')

    expect(encabezado.compareDocumentPosition(principal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(principal.compareDocumentPosition(pie) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(principal).getByText('Contenido de prueba')).toBeInTheDocument()
  })

  it('el contenido principal es el destino del salto: tiene su id y admite el foco por código', () => {
    mostrar()
    const principal = screen.getByRole('main')

    expect(principal).toHaveAttribute('id', ID_CONTENIDO)
    expect(principal).toHaveAttribute('tabindex', '-1')
    expect(principal).toHaveClass('flex-1', 'p-8')
  })

  it('«Saltar al contenido» lleva el foco al contenido principal', () => {
    mostrar()

    fireEvent.click(screen.getByRole('link', { name: 'Saltar al contenido' }))

    expect(screen.getByRole('main')).toHaveFocus()
  })
})
