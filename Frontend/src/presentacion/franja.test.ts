import { describe, expect, it } from 'vitest'
import { MENSAJE_FIN_NO_POSTERIOR } from '../api/mensajes'
import { FRANJA_VACIA, TEXTO_FRANJA_INVALIDA, franjaCompleta, franjaDesdeCampos, type ValoresFranja } from './franja'

const franja = (fecha: string, horaInicio: string, horaFin: string): ValoresFranja => ({ fecha, horaInicio, horaFin })

describe('franjaDesdeCampos (6.5.4a · las reglas de B2, sin cambios)', () => {
  it('una franja válida sale en ISO 8601 con el desfase de Bogotá explícito (DH1)', () => {
    expect(franjaDesdeCampos(franja('2026-10-20', '08:00', '09:30'))).toEqual({
      ok: true,
      inicio: '2026-10-20T08:00:00-05:00',
      fin: '2026-10-20T09:30:00-05:00',
    })
  })

  it.each([
    ['igual al inicio', '10:00', '10:00'],
    ['anterior al inicio', '10:00', '09:00'],
  ])('fin %s → el mismo texto que la primera regla de CA-04 del backend (DH4)', (_caso, inicio, fin) => {
    expect(franjaDesdeCampos(franja('2026-10-20', inicio, fin))).toEqual({ ok: false, error: MENSAJE_FIN_NO_POSTERIOR })
  })

  it.each([
    ['un día que no existe', franja('2026-02-30', '08:00', '09:00')],
    ['una hora imposible', franja('2026-10-20', '25:00', '26:00')],
    ['campos vacíos', FRANJA_VACIA],
  ])('%s → valores inválidos', (_caso, valores) => {
    expect(franjaDesdeCampos(valores)).toEqual({ ok: false, error: TEXTO_FRANJA_INVALIDA })
  })

  it('el orden de las reglas se conserva: con valores inválidos, ese error va primero', () => {
    expect(franjaDesdeCampos(franja('2026-02-30', '10:00', '09:00'))).toEqual({ ok: false, error: TEXTO_FRANJA_INVALIDA })
  })
})

describe('franjaCompleta', () => {
  it('solo con los tres campos escritos', () => {
    expect(franjaCompleta(franja('2026-10-20', '08:00', '09:00'))).toBe(true)
    expect(franjaCompleta(franja('', '08:00', '09:00'))).toBe(false)
    expect(franjaCompleta(franja('2026-10-20', '', '09:00'))).toBe(false)
    expect(franjaCompleta(franja('2026-10-20', '08:00', ''))).toBe(false)
  })
})
