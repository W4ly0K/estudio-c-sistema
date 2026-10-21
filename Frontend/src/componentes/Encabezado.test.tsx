import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { UsuarioSesion } from '../api/esquemas'
import { RUTA_INICIO, RUTA_TABLERO } from '../rutas'
import { Encabezado } from './Encabezado'

/**
 * Fase 7 · C8. jsdom no calcula el diseño (no hay anchos ni desbordes): estas pruebas fijan el
 * CONTRATO ESTRUCTURAL que evita la regresión de la auditoría a 320 px. La prueba visual real
 * (DevTools a 320 y 375 px) sigue siendo manual.
 */

const NOMBRE_LARGO = 'Fredy Sebastian Eraso Portillo [Estudiante]'
const STAFF: UsuarioSesion = { id: 'uuid-staff', nombre: NOMBRE_LARGO, rol: 'STAFF' }

function mostrar(usuario: UsuarioSesion = STAFF, ruta = RUTA_INICIO) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Encabezado usuario={usuario} onLogout={() => undefined} titulo="Inicio del Staff" />
    </MemoryRouter>,
  )
  return screen.getByRole('banner')
}

/** ¿`a` aparece antes que `b` en el DOM (y por lo tanto en el recorrido con Tab)? */
const vaAntes = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('Encabezado · responsivo (Fase 7 · C8)', () => {
  it('el orden del DOM es marca → navegación → nombre → Salir (el mismo del Tab y de las filas en móvil)', () => {
    const encabezado = mostrar()
    const logo = within(encabezado).getByAltText('Logo Estudio C')
    const navegacion = within(encabezado).getByRole('navigation', { name: 'Navegación principal' })
    const nombre = within(encabezado).getByText(NOMBRE_LARGO)
    const salir = within(encabezado).getByRole('button', { name: 'Salir' })

    expect(vaAntes(logo, navegacion)).toBe(true)
    expect(vaAntes(navegacion, nombre)).toBe(true)
    expect(vaAntes(nombre, salir)).toBe(true)
  })

  it('ningún elemento reordena con CSS (order-*): lo que se ve es lo que recorre el teclado', () => {
    const encabezado = mostrar()

    const reordenados = [encabezado, ...encabezado.querySelectorAll('*')].filter((e) =>
      [...e.classList].some((clase) => /(^|:)order-/.test(clase)),
    )
    expect(reordenados).toHaveLength(0)
  })

  it('apila en móvil y forma una fila que puede partirse desde md', () => {
    const encabezado = mostrar()

    expect(encabezado).toHaveClass('flex-col', 'md:flex-row', 'md:flex-wrap')
  })

  it('el nombre largo se muestra COMPLETO: envuelve (min-w-0 + break-words) y nunca se trunca', () => {
    const encabezado = mostrar()
    const nombre = within(encabezado).getByText(NOMBRE_LARGO)

    expect(nombre).toHaveTextContent(NOMBRE_LARGO)
    expect(nombre).toHaveClass('break-words')
    expect(nombre).not.toHaveClass('truncate')
    expect(nombre.parentElement).toHaveClass('min-w-0')
    expect(encabezado.querySelector('[data-parte="usuario"]')).toHaveClass('min-w-0')
  })

  it('cada enlace de la navegación y "Salir" tienen área táctil de 44 px (min-h-11)', () => {
    const encabezado = mostrar()
    const navegacion = within(encabezado).getByRole('navigation', { name: 'Navegación principal' })
    const controles = [...within(navegacion).getAllByRole('link'), within(encabezado).getByRole('button', { name: 'Salir' })]

    expect(controles).toHaveLength(3)
    for (const control of controles) expect(control).toHaveClass('min-h-11')
  })

  it('es fijo (sticky) SOLO desde md: en móvil se desplaza con la página', () => {
    const encabezado = mostrar()

    expect(encabezado).toHaveClass('md:sticky', 'md:top-0')
    expect(encabezado).not.toHaveClass('sticky')
  })

  it('aria-current sigue a la pantalla con el nuevo diseño', () => {
    const encabezado = mostrar(STAFF, RUTA_TABLERO)
    const navegacion = within(encabezado).getByRole('navigation', { name: 'Navegación principal' })

    expect(within(navegacion).getByRole('link', { current: 'page' })).toHaveTextContent('Tablero')
    expect(within(navegacion).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
  })
})
