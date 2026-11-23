import { describe, expect, it } from 'vitest'
import { TEXTO_SESION_EXPIRADA } from '../api/errores'
import { estadoInicial, reducirSesion, type EventoSesion, type Sesion } from './maquina-sesion'

const USUARIO = { id: 'uuid', nombre: 'Ana Pérez', rol: 'SOLICITANTE' } as const

const VERIFICANDO: Sesion = { estado: 'verificando' }
const ANONIMA: Sesion = { estado: 'anonima', aviso: null }
const AUTENTICADA: Sesion = { estado: 'autenticada', usuario: USUARIO }
const SIN_CONEXION: Sesion = { estado: 'sin-conexion' }

const PERFIL_OK: EventoSesion = { tipo: 'perfil-confirmado', usuario: USUARIO }
const LOGIN_OK: EventoSesion = { tipo: 'login-exitoso', usuario: USUARIO }

describe('Máquina de la sesión (DS3)', () => {
  it('estado inicial: con token se verifica; sin token, anónima', () => {
    expect(estadoInicial(true)).toEqual(VERIFICANDO)
    expect(estadoInicial(false)).toEqual(ANONIMA)
  })

  it.each<[string, Sesion, EventoSesion, Sesion]>([
    ['el perfil confirma el token guardado', VERIFICANDO, PERFIL_OK, AUTENTICADA],
    ['el servidor no pudo verificar', VERIFICANDO, { tipo: 'perfil-no-verificado' }, SIN_CONEXION],
    ['se reintenta tras la caída', SIN_CONEXION, { tipo: 'reintentar' }, VERIFICANDO],
    ['login correcto', ANONIMA, LOGIN_OK, AUTENTICADA],
    ['el token venció al verificar', VERIFICANDO, { tipo: 'sesion-expirada' }, { estado: 'anonima', aviso: TEXTO_SESION_EXPIRADA }],
    ['el token venció usando el panel', AUTENTICADA, { tipo: 'sesion-expirada' }, { estado: 'anonima', aviso: TEXTO_SESION_EXPIRADA }],
    ['cerrar sesión desde el panel', AUTENTICADA, { tipo: 'cierre-de-sesion' }, ANONIMA],
    ['cerrar sesión sin poder verificar', SIN_CONEXION, { tipo: 'cierre-de-sesion' }, ANONIMA],
  ])('transición: %s', (_caso, desde, evento, hasta) => {
    expect(reducirSesion(desde, evento)).toEqual(hasta)
  })

  it.each<[string, Sesion, EventoSesion]>([
    ['un perfil que llega después de cerrar sesión no la reabre', ANONIMA, PERFIL_OK],
    ['un perfil tardío no reemplaza la sesión iniciada', AUTENTICADA, PERFIL_OK],
    ['una falla de verificación tardía no saca del panel', AUTENTICADA, { tipo: 'perfil-no-verificado' }],
    ['un 401 tardío sin sesión no muestra "tu sesión expiró"', ANONIMA, { tipo: 'sesion-expirada' }],
    ['reintentar solo tiene sentido sin conexión', AUTENTICADA, { tipo: 'reintentar' }],
    ['no se inicia sesión mientras se verifica otra', VERIFICANDO, LOGIN_OK],
  ])('evento ignorado (mismo objeto, sin re-render): %s', (_caso, desde, evento) => {
    expect(reducirSesion(desde, evento)).toBe(desde)
  })
})
