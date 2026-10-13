import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import App, { TEXTO_SIN_VERIFICAR, TEXTO_VERIFICANDO } from './App'
import { TEXTO_SESION_EXPIRADA } from './api/errores'
import { json } from './test/fixtures-api'

// El botón real de Google necesita su proveedor y la red. El sustituto entrega una
// credencial al hacer clic: se prueba la pantalla y el cableado del Estudio C.
vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess }: { onSuccess: (respuesta: { credential?: string }) => void }) => (
    <button type="button" onClick={() => onSuccess({ credential: 'credencial-de-google' })}>
      Iniciar sesión con Google
    </button>
  ),
}))

// VITE_API_URL de vitest.config.ts.
const API = 'http://api.prueba.local'
const LOGIN = { mensaje: 'Autenticación exitosa', token: 'jwt-de-la-app', usuario: { id: 'uuid', nombre: 'Ana Pérez', rol: 'SOLICITANTE' } }

/** La App dentro de un router en memoria (en producción, BrowserRouter en main.tsx). */
function mostrarApp(ruta = '/') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  )
}

/** fetch falso por ruta: la App crea su propio cliente con el fetch global (raíz de composición). */
function servidorFalso(rutas: Record<string, () => Response>) {
  const fetchFalso = vi.fn(async (url: string, _init?: RequestInit) => {
    const respuesta = rutas[url.replace(API, '')]
    if (respuesta === undefined) throw new Error(`Ruta no esperada en la prueba: ${url}`)
    return respuesta()
  })
  vi.stubGlobal('fetch', fetchFalso)
  return fetchFalso
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sin sesión muestra la pantalla de acceso institucional', () => {
    mostrarApp()

    expect(screen.getByRole('heading', { name: 'Acceso al Sistema' })).toBeInTheDocument()
    expect(screen.getByText(/exclusivamente con tu correo institucional CESMAG/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar sesión con Google' })).toBeInTheDocument()
    expect(screen.getByAltText('Logo Estudio C')).toBeInTheDocument()
    expect(screen.queryByText('Panel de Solicitudes')).not.toBeInTheDocument()
  })

  it('login correcto: guarda el token y el panel pide las solicitudes con ese token', async () => {
    const fetchFalso = servidorFalso({
      '/auth/google/login': () => json(201, LOGIN),
      '/solicitudes/mis-solicitudes': () => json(200, []),
    })
    mostrarApp()

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }))

    expect(await screen.findByText('No tienes solicitudes registradas aún.')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(localStorage.getItem('estudio_c_token')).toBe('jwt-de-la-app')
    const peticionLista = fetchFalso.mock.calls.find(([url]) => url.endsWith('/solicitudes/mis-solicitudes'))
    expect(peticionLista?.[1]?.headers).toMatchObject({ Authorization: 'Bearer jwt-de-la-app' })
  })

  it('correo fuera del dominio: muestra el mensaje del servidor y no crea sesión', async () => {
    const mensaje = 'Acceso restringido al dominio @unicesmag.edu.co'
    servidorFalso({ '/auth/google/login': () => json(401, { statusCode: 401, message: mensaje }) })
    mostrarApp()

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }))

    expect(await screen.findByText(`❌ ${mensaje}`)).toBeInTheDocument()
    expect(localStorage.getItem('estudio_c_token')).toBeNull()
  })

  it('token vencido (401 en una ruta privada): borra el token y vuelve al login con un aviso', async () => {
    servidorFalso({
      '/auth/google/login': () => json(201, LOGIN),
      '/solicitudes/mis-solicitudes': () => json(401, { statusCode: 401, message: 'Unauthorized' }),
    })
    mostrarApp()

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }))

    expect(await screen.findByText(`⚠️ ${TEXTO_SESION_EXPIRADA}`)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Acceso al Sistema' })).toBeInTheDocument()
    expect(localStorage.getItem('estudio_c_token')).toBeNull()
  })

  describe('restaurar la sesión al recargar (Fase 6.2 · DS3)', () => {
    it('con un token guardado entra directo al panel, sin pasar por el login', async () => {
      localStorage.setItem('estudio_c_token', 'jwt-guardado')
      servidorFalso({
        '/auth/perfil': () => json(200, LOGIN.usuario),
        '/solicitudes/mis-solicitudes': () => json(200, []),
      })
      mostrarApp()

      // Mientras verifica no aparece el login (sin parpadeo).
      expect(screen.getByRole('status')).toHaveTextContent(TEXTO_VERIFICANDO)
      expect(screen.queryByRole('heading', { name: 'Acceso al Sistema' })).not.toBeInTheDocument()

      expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    })

    it('servidor caído al recargar: ofrece reintentar, conserva el token y permite cerrar sesión', async () => {
      localStorage.setItem('estudio_c_token', 'jwt-guardado')
      servidorFalso({
        '/auth/perfil': () => {
          throw new TypeError('Failed to fetch')
        },
      })
      mostrarApp()

      expect(await screen.findByRole('alert')).toHaveTextContent(TEXTO_SIN_VERIFICAR)
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
      expect(localStorage.getItem('estudio_c_token')).toBe('jwt-guardado')

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

      expect(screen.getByRole('heading', { name: 'Acceso al Sistema' })).toBeInTheDocument()
      expect(localStorage.getItem('estudio_c_token')).toBeNull()
    })
  })

  it('con sesión, una ruta desconocida vuelve al panel (DV1)', async () => {
    localStorage.setItem('estudio_c_token', 'jwt-guardado')
    servidorFalso({
      '/auth/perfil': () => json(200, LOGIN.usuario),
      '/solicitudes/mis-solicitudes': () => json(200, []),
    })
    mostrarApp('/una/ruta/que/no/existe')

    expect(await screen.findByText('No tienes solicitudes registradas aún.')).toBeInTheDocument()
  })
})
