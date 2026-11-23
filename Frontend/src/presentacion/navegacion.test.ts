import { describe, expect, it } from 'vitest'
import { ROLES } from '../api/maquina-estados'
import { RUTA_INICIO, RUTA_MIS_SOLICITUDES, RUTA_TABLERO } from '../rutas'
import { navegacionDelRol } from './navegacion'

describe('navegacionDelRol (Fase 7 · C6)', () => {
  it('STAFF: Inicio y Tablero', () => {
    expect(navegacionDelRol('STAFF')).toEqual([
      { ruta: RUTA_INICIO, texto: 'Inicio' },
      { ruta: RUTA_TABLERO, texto: 'Tablero' },
    ])
  })

  it('SOLICITANTE: Inicio y Mis solicitudes', () => {
    expect(navegacionDelRol('SOLICITANTE')).toEqual([
      { ruta: RUTA_INICIO, texto: 'Inicio' },
      { ruta: RUTA_MIS_SOLICITUDES, texto: 'Mis solicitudes' },
    ])
  })

  it('ningún rol ve un enlace a la pantalla propia del otro (la que SoloRol le devolvería a "/")', () => {
    expect(navegacionDelRol('SOLICITANTE').map((e) => e.ruta)).not.toContain(RUTA_TABLERO)
    expect(navegacionDelRol('STAFF').map((e) => e.ruta)).not.toContain(RUTA_MIS_SOLICITUDES)
  })

  it.each(ROLES)('%s: Inicio va primero, sin rutas ni textos repetidos', (rol) => {
    const enlaces = navegacionDelRol(rol)
    expect(enlaces[0]?.ruta).toBe(RUTA_INICIO)
    expect(new Set(enlaces.map((e) => e.ruta)).size).toBe(enlaces.length)
    expect(new Set(enlaces.map((e) => e.texto)).size).toBe(enlaces.length)
  })
})
