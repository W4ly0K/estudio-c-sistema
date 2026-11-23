import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Rol } from '../api/maquina-estados'
import { RUTA_INICIO, RUTA_TABLERO } from '../rutas'
import { SoloRol } from './SoloRol'

const usuario = (rol: Rol) => ({ id: `uuid-${rol}`, nombre: 'Persona de prueba', rol })

/** Muestra la ruta en la que terminó la navegación (la URL es parte del contrato). */
function Ubicacion() {
  return <output aria-label="ubicación">{useLocation().pathname}</output>
}

/** `alMontar` delata si la pantalla protegida llegó a montarse. */
function Protegida({ alMontar }: { alMontar: () => void }) {
  alMontar()
  return <p>Pantalla del Staff</p>
}

/** "/tablero" protegida para el STAFF. */
function mostrar(rol: Rol, alMontar: () => void) {
  render(
    <MemoryRouter initialEntries={[RUTA_TABLERO]}>
      <Routes>
        <Route path={RUTA_INICIO} element={<p>Inicio</p>} />
        <Route
          path={RUTA_TABLERO}
          element={
            <SoloRol rol="STAFF" usuario={usuario(rol)}>
              <Protegida alMontar={alMontar} />
            </SoloRol>
          }
        />
      </Routes>
      <Ubicacion />
    </MemoryRouter>,
  )
}

describe('SoloRol (Fase 7 · C2)', () => {
  it('con el rol de la ruta muestra la pantalla y se queda en ella', () => {
    const alMontar = vi.fn()
    mostrar('STAFF', alMontar)

    expect(screen.getByText('Pantalla del Staff')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'ubicación' })).toHaveTextContent(RUTA_TABLERO)
    expect(alMontar).toHaveBeenCalled()
  })

  it('con otro rol vuelve a "/" en silencio y SIN montar la pantalla ajena', () => {
    const alMontar = vi.fn()
    mostrar('SOLICITANTE', alMontar)

    expect(screen.getByText('Inicio')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'ubicación' })).toHaveTextContent(RUTA_INICIO)
    expect(alMontar).not.toHaveBeenCalled()
    expect(screen.queryByText('Pantalla del Staff')).not.toBeInTheDocument()
    // Nada que confirme que la página existe: ni "no autorizado" ni "acceso denegado".
    expect(screen.queryByText(/autoriza|denegad|permiso|prohibid/i)).not.toBeInTheDocument()
  })
})
