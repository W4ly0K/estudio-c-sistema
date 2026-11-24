import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { UsuarioSesion } from '../api/esquemas'
import { RUTA_INICIO, RUTA_TABLERO } from '../rutas'
import { ETIQUETAS_ROL } from '../presentacion/etiquetas'
import { TEXTO_IDENTIDAD } from '../presentacion/identidad'
import { Encabezado, ID_CONTENIDO } from './Encabezado'

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

describe('Encabezado · identidad institucional (R9-3 · V1-A)', () => {
  it('nivel 1: franja en Azul 2 con texto blanco y la jerarquía Universidad CESMAG · CIDU · Estudio C', () => {
    const encabezado = mostrar()
    const franja = encabezado.querySelector('[data-parte="identidad"]')

    expect(franja).toHaveClass('bg-primary', 'text-surface')
    expect(franja).toHaveTextContent(TEXTO_IDENTIDAD)
  })

  it('la franja va antes que la marca y no reordena lo que sigue (C8)', () => {
    const encabezado = mostrar()
    const franja = encabezado.querySelector('[data-parte="identidad"]')
    const logo = within(encabezado).getByAltText('Logo Estudio C')

    expect(franja).not.toBeNull()
    if (franja !== null) expect(vaAntes(franja, logo)).toBe(true)
  })

  it('sin escudo simulado: el logo de Estudio C es la única imagen del encabezado', () => {
    const encabezado = mostrar()

    expect(within(encabezado).getAllByRole('img')).toHaveLength(1)
    expect(within(encabezado).queryByAltText(/escudo/i)).not.toBeInTheDocument()
  })

  it('«Saltar al contenido» es el primer elemento enfocable y apunta al contenido principal', () => {
    const encabezado = mostrar()
    const enfocables = encabezado.querySelectorAll('a[href], button')
    const salto = within(encabezado).getByRole('link', { name: 'Saltar al contenido' })

    expect(enfocables[0]).toBe(salto)
    expect(salto).toHaveAttribute('href', `#${ID_CONTENIDO}`)
    expect(salto).toHaveClass('sr-only', 'focus:not-sr-only')
  })

  it.each([
    ['STAFF', 'Staff'],
    ['SOLICITANTE', 'Solicitante'],
  ] as const)('el rol %s se muestra en palabras («%s») y sin el rojo de error', (rol, palabra) => {
    const encabezado = mostrar({ id: 'uuid', nombre: 'Ana Pérez', rol })
    const etiqueta = within(encabezado).getByText(palabra)

    expect(ETIQUETAS_ROL[rol]).toBe(palabra)
    expect(etiqueta).not.toHaveClass('text-accent')
    expect(within(encabezado).queryByText(rol)).not.toBeInTheDocument()
  })
})
