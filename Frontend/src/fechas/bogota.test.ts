import { describe, expect, it } from 'vitest'
import {
  DESFASE_BOGOTA,
  FECHA_NO_DISPONIBLE,
  ZONA_ESTUDIO,
  aCamposBogota,
  aIsoBogota,
  formatearFecha,
  formatearFranja,
  formatearHora,
  formatearMomento,
  hoyEnBogota,
} from './bogota'

/**
 * Estas pruebas deben pasar en CUALQUIER zona horaria: `npm run test:tz` las repite en
 * UTC, America/Bogota, Pacific/Pago_Pago (UTC−11) y Pacific/Kiritimati (UTC+14). En un
 * equipo en Bogotá, un error de zona horaria no se ve.
 */
describe('Fechas en la hora de Bogotá (Fase 6.3)', () => {
  describe('canario del desfase (DH1)', () => {
    /** El desfase que Intl reporta para Bogotá en un instante dado, como "-05:00". */
    const desfaseSegunIntl = (instante: Date): string => {
      const nombre = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_ESTUDIO, timeZoneName: 'longOffset' })
        .formatToParts(instante)
        .find((parte) => parte.type === 'timeZoneName')?.value
      return (nombre ?? '').replace('GMT', '')
    }

    // Un instante por mes, en dos años: si Colombia adoptara horario de verano, falla aquí.
    const instantes = [2026, 2030].flatMap((anio) =>
      Array.from({ length: 12 }, (_, mes) => new Date(Date.UTC(anio, mes, 15, 17))),
    )

    it.each(instantes)('Bogotá está en -05:00 el %s', (instante) => {
      expect(desfaseSegunIntl(instante)).toBe(DESFASE_BOGOTA)
    })
  })

  describe('aIsoBogota (DH1)', () => {
    it('une fecha y hora con el desfase explícito, sin interpretar la zona del navegador', () => {
      expect(aIsoBogota('2026-10-20', '08:00')).toBe('2026-10-20T08:00:00-05:00')
    })

    it('el instante resultante es el correcto en UTC, en cualquier zona', () => {
      const iso = aIsoBogota('2026-10-20', '08:00') ?? ''
      expect(new Date(iso).toISOString()).toBe('2026-10-20T13:00:00.000Z')
    })

    it('acepta el 29 de febrero de un año bisiesto y los extremos del día', () => {
      expect(aIsoBogota('2028-02-29', '00:00')).toBe('2028-02-29T00:00:00-05:00')
      expect(aIsoBogota('2026-12-31', '23:59')).toBe('2026-12-31T23:59:00-05:00')
    })

    it.each([
      ['un día que no existe', '2026-02-30', '08:00'],
      ['el 29 de febrero de un año no bisiesto', '2026-02-29', '08:00'],
      ['un mes 13', '2026-13-01', '08:00'],
      ['la fecha en otro orden', '20-10-2026', '08:00'],
      ['la hora 24:00', '2026-10-20', '24:00'],
      ['la hora sin cero inicial', '2026-10-20', '8:00'],
      ['minutos 60', '2026-10-20', '08:60'],
      ['campos vacíos', '', ''],
    ])('rechaza %s', (_caso, fecha, hora) => {
      expect(aIsoBogota(fecha, hora)).toBeNull()
    })
  })

  describe('aCamposBogota (Fase 7 · 7B.3): el inverso de aIsoBogota', () => {
    it('un instante en UTC se lee en Bogotá: las 02:30 Z del 21 son las 21:30 del 20', () => {
      expect(aCamposBogota('2026-10-21T02:30:00.000Z')).toEqual({ fecha: '2026-10-20', hora: '21:30' })
    })

    it('la medianoche de Bogotá es "00:00" (no "24:00") y ya es el día siguiente', () => {
      expect(aCamposBogota('2026-10-21T05:00:00.000Z')).toEqual({ fecha: '2026-10-21', hora: '00:00' })
    })

    it('ida y vuelta: lo que escribe aIsoBogota se lee igual, en cualquier zona del navegador', () => {
      const iso = aIsoBogota('2026-02-28', '08:30')
      expect(iso).not.toBeNull()
      expect(aCamposBogota(iso ?? '')).toEqual({ fecha: '2026-02-28', hora: '08:30' })
    })

    it('una fecha ilegible no inventa campos', () => {
      expect(aCamposBogota('no-es-una-fecha')).toBeNull()
    })
  })

  describe('hoyEnBogota (DH3 · F2c)', () => {
    it('a las 19:30 de Bogotá sigue siendo HOY, aunque en UTC ya sea mañana', () => {
      const ahora = new Date('2026-10-20T19:30:00-05:00') // 2026-10-21T00:30Z
      expect(hoyEnBogota(ahora)).toBe('2026-10-20')
    })

    it('a las 00:30 de Bogotá ya es el día siguiente', () => {
      expect(hoyEnBogota(new Date('2026-10-21T00:30:00-05:00'))).toBe('2026-10-21')
    })

    it('al filo de la medianoche de fin de año', () => {
      expect(hoyEnBogota(new Date('2026-12-31T23:59:59-05:00'))).toBe('2026-12-31')
      expect(hoyEnBogota(new Date('2027-01-01T00:00:00-05:00'))).toBe('2027-01-01')
    })
  })

  describe('formatear* (DH2)', () => {
    it('la hora se muestra en Bogotá y en 24 horas', () => {
      expect(formatearHora('2026-10-20T13:00:00.000Z')).toBe('08:00')
      expect(formatearHora('2026-10-20T23:30:00.000Z')).toBe('18:30')
    })

    it('la fecha se muestra en Bogotá: las 22:00 del 20 siguen siendo el 20 (en UTC ya es el 21)', () => {
      const texto = formatearFecha('2026-10-21T03:00:00.000Z')
      expect(texto).toMatch(/martes/)
      expect(texto).toMatch(/20 de octubre de 2026/)
    })

    it('acepta el ISO con desfase que envía el propio frontend', () => {
      expect(formatearHora('2026-10-20T08:00:00-05:00')).toBe('08:00')
    })

    it('la franja junta el día y las dos horas', () => {
      expect(formatearFranja('2026-10-20T13:00:00.000Z', '2026-10-20T15:00:00.000Z')).toMatch(
        /^martes, 20 de octubre de 2026 · 08:00 – 10:00$/,
      )
    })

    it('el momento junta el día y la hora, en Bogotá', () => {
      expect(formatearMomento('2026-10-21T03:00:00.000Z')).toMatch(/^martes, 20 de octubre de 2026 · 22:00$/)
    })

    it.each(['no es una fecha', ''])('una fecha ilegible ("%s") nunca muestra "Invalid Date"', (iso) => {
      expect(formatearFecha(iso)).toBe(FECHA_NO_DISPONIBLE)
      expect(formatearMomento(iso)).toBe(FECHA_NO_DISPONIBLE)
      expect(formatearHora(iso)).toBe(FECHA_NO_DISPONIBLE)
      expect(formatearFranja(iso, '2026-10-20T15:00:00.000Z')).toBe(FECHA_NO_DISPONIBLE)
    })
  })
})
