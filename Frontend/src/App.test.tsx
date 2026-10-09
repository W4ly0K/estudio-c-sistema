import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

// El botón real de Google necesita su proveedor y la red. Para una prueba de humo
// basta un sustituto: se prueba la pantalla del Estudio C, no la librería de Google.
vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => <button type="button">Iniciar sesión con Google</button>,
}))

describe('App (prueba de humo)', () => {
  it('sin sesión muestra la pantalla de acceso institucional', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Acceso al Sistema' })).toBeInTheDocument()
    expect(screen.getByText(/exclusivamente con tu correo institucional CESMAG/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar sesión con Google' })).toBeInTheDocument()
    expect(screen.getByAltText('Logo Estudio C')).toBeInTheDocument()
  })

  it('sin sesión no muestra el panel de solicitudes', () => {
    render(<App />)

    expect(screen.queryByText('Panel de Solicitudes')).not.toBeInTheDocument()
  })
})
