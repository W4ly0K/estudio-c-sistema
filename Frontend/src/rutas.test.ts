import { matchPath } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RUTA_DETALLE, RUTA_INICIO, RUTA_MIS_SOLICITUDES, RUTA_TABLERO, rutaDetalle } from './rutas'

const PANTALLAS = [RUTA_INICIO, RUTA_TABLERO, RUTA_MIS_SOLICITUDES] as const

describe('rutas', () => {
  it('el detalle lleva el radicado en la ruta', () => {
    expect(rutaDetalle('EC-2026-0142')).toBe('/solicitudes/EC-2026-0142')
  })

  it('un radicado con "/" o "?" no puede cambiar la ruta', () => {
    expect(rutaDetalle('EC/../admin?x=1')).toBe('/solicitudes/EC%2F..%2Fadmin%3Fx%3D1')
  })

  it('Fase 7 · C1: cada pantalla tiene su propia ruta, absoluta y estática (sin parámetros)', () => {
    expect(new Set(PANTALLAS).size).toBe(PANTALLAS.length)
    for (const ruta of PANTALLAS) {
      expect(ruta.startsWith('/')).toBe(true)
      expect(ruta).not.toContain(':')
    }
  })

  it('Fase 7 · C1: ninguna ruta de pantalla la captura el detalle (ni el detalle captura una pantalla)', () => {
    for (const ruta of PANTALLAS) expect(matchPath(RUTA_DETALLE, ruta)).toBeNull()
    expect(matchPath(RUTA_DETALLE, rutaDetalle('EC-2026-0142'))?.params.radicado).toBe('EC-2026-0142')
  })
})
