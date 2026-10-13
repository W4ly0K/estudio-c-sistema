import { describe, expect, it } from 'vitest'
import { rutaDetalle } from './rutas'

describe('rutas', () => {
  it('el detalle lleva el radicado en la ruta', () => {
    expect(rutaDetalle('EC-2026-0142')).toBe('/solicitudes/EC-2026-0142')
  })

  it('un radicado con "/" o "?" no puede cambiar la ruta', () => {
    expect(rutaDetalle('EC/../admin?x=1')).toBe('/solicitudes/EC%2F..%2Fadmin%3Fx%3D1')
  })
})
