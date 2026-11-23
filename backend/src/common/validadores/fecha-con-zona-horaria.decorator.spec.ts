import { parsearFechaConZonaHoraria } from './fecha-con-zona-horaria.decorator';

describe('parsearFechaConZonaHoraria (Decisión D-W)', () => {
  it.each([
    ['UTC con Z', '2026-10-13T13:00:00Z', '2026-10-13T13:00:00.000Z'],
    [
      'Bogotá con -05:00',
      '2026-10-13T08:00:00-05:00',
      '2026-10-13T13:00:00.000Z',
    ],
    [
      'lo que envía el frontend (toISOString)',
      '2026-10-13T13:00:00.000Z',
      '2026-10-13T13:00:00.000Z',
    ],
    ['sin segundos', '2026-10-13T08:00-05:00', '2026-10-13T13:00:00.000Z'],
    [
      'desfase positivo',
      '2026-10-14T03:00:00+09:00',
      '2026-10-13T18:00:00.000Z',
    ],
    [
      'desfase con minutos (India)',
      '2026-10-13T18:30:00+05:30',
      '2026-10-13T13:00:00.000Z',
    ],
    [
      'fracción de un dígito',
      '2026-10-13T13:00:00.5Z',
      '2026-10-13T13:00:00.500Z',
    ],
    [
      '29 de febrero en año bisiesto',
      '2028-02-29T13:00:00Z',
      '2028-02-29T13:00:00.000Z',
    ],
  ])('acepta %s: %s', (_caso, texto, esperado) => {
    expect(parsearFechaConZonaHoraria(texto)?.toISOString()).toBe(esperado);
  });

  it.each([
    ['sin zona horaria (ambigua)', '2026-10-13T08:00:00'],
    ['solo la fecha', '2026-10-13'],
    ['30 de febrero (V8 lo convertiría en 2 de marzo)', '2026-02-30T08:00:00Z'],
    ['29 de febrero en año no bisiesto', '2026-02-29T08:00:00Z'],
    ['hora 24 (V8 la convertiría en el día siguiente)', '2026-10-13T24:00:00Z'],
    ['minuto 60', '2026-10-13T08:60:00Z'],
    ['segundo 60', '2026-10-13T08:00:60Z'],
    ['mes 13', '2026-13-01T08:00:00Z'],
    ['día 0', '2026-10-00T08:00:00Z'],
    ['desfase imposible', '2026-10-13T08:00:00-15:00'],
    ['formato con espacio', '2026-10-13 08:00:00Z'],
    ['texto libre', 'mañana a las 8'],
    ['cadena vacía', ''],
    ['fecha UTC válida con basura al final', '2026-10-13T13:00:00Zx'],
  ])('rechaza %s: "%s"', (_caso, texto) => {
    expect(parsearFechaConZonaHoraria(texto)).toBeNull();
  });
});
