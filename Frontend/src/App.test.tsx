import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
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
    render(<App />)

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
    render(<App />)

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
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }))

    expect(await screen.findByText(`❌ ${mensaje}`)).toBeInTheDocument()
    expect(localStorage.getItem('estudio_c_token')).toBeNull()
  })

  it('token vencido (401 en una ruta privada): borra el token y vuelve al login con un aviso', async () => {
    servidorFalso({
      '/auth/google/login': () => json(201, LOGIN),
      '/solicitudes/mis-solicitudes': () => json(401, { statusCode: 401, message: 'Unauthorized' }),
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }))

    expect(await screen.findByText(`⚠️ ${TEXTO_SESION_EXPIRADA}`)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Acceso al Sistema' })).toBeInTheDocument()
    expect(localStorage.getItem('estudio_c_token')).toBeNull()
  })
})
