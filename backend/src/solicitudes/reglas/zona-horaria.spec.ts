import { aClaveIso } from './fecha-civil';
import { aMomentoLocal, MS_POR_HORA, MS_POR_MINUTO } from './zona-horaria';

/** 'AAAA-MM-DD HH:MM:SS.mmm' a partir de un MomentoLocal, para leer las tablas. */
function aTexto(instanteIso: string): string {
  const { fecha, msDelDia } = aMomentoLocal(new Date(instanteIso));
  const h = Math.floor(msDelDia / MS_POR_HORA);
  const m = Math.floor((msDelDia % MS_POR_HORA) / MS_POR_MINUTO);
  const s = Math.floor((msDelDia % MS_POR_MINUTO) / 1000);
  const ms = msDelDia % 1000;
  const dos = (n: number): string => String(n).padStart(2, '0');
  return `${aClaveIso(fecha)} ${dos(h)}:${dos(m)}:${dos(s)}.${String(ms).padStart(3, '0')}`;
}

describe('aMomentoLocal (America/Bogota, UTC−5)', () => {
  it.each([
    [
      'apertura del bloque de la mañana',
      '2026-10-13T13:00:00.000Z',
      '2026-10-13 08:00:00.000',
    ],
    [
      'mismo instante expresado con desfase',
      '2026-10-13T08:00:00-05:00',
      '2026-10-13 08:00:00.000',
    ],
    [
      'último milisegundo del día local',
      '2026-10-14T04:59:59.999Z',
      '2026-10-13 23:59:59.999',
    ],
    [
      'medianoche: "00", nunca "24"',
      '2026-10-14T05:00:00.000Z',
      '2026-10-14 00:00:00.000',
    ],
    ['cruce de año', '2027-01-01T04:30:00.000Z', '2026-12-31 23:30:00.000'],
    [
      'conserva segundos y milisegundos (D-O)',
      '2026-10-13T17:00:30.250Z',
      '2026-10-13 12:00:30.250',
    ],
  ])('%s: %s → %s', (_caso, instante, esperado) => {
    expect(aTexto(instante)).toBe(esperado);
  });

  /**
   * Regresión del error de la Fase 0: "08:00Z" no son las 8 de la mañana en
   * el Estudio C, sino las 3 de la madrugada.
   */
  it('interpreta un instante UTC en la hora de Bogotá, no en la del servidor', () => {
    expect(aTexto('2026-10-13T08:00:00.000Z')).toBe('2026-10-13 03:00:00.000');
  });

  it('msDelDia siempre está en [0, 86_400_000) durante todo un día', () => {
    const inicio = Date.parse('2026-10-13T05:00:00.000Z'); // 00:00 local
    for (let minuto = 0; minuto < 24 * 60; minuto++) {
      const { fecha, msDelDia } = aMomentoLocal(
        new Date(inicio + minuto * MS_POR_MINUTO),
      );
      expect(aClaveIso(fecha)).toBe('2026-10-13');
      expect(msDelDia).toBe(minuto * MS_POR_MINUTO);
    }
  });

  it('falla cerrado (RangeError) con un Date inválido', () => {
    expect(() => aMomentoLocal(new Date('no-es-fecha'))).toThrow(RangeError);
  });
});
