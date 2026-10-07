import {
  ANIO_MAXIMO_SOPORTADO,
  ANIO_MINIMO_SOPORTADO,
  calcularDomingoDePascua,
  calendarioLaboralColombia,
  esFestivoEnColombia,
  type Festivo,
  festivosDeColombia,
  trasladarAlLunes,
} from './calendario-colombia';
import {
  aClaveIso,
  DiaSemana,
  diaDeLaSemana,
  type FechaCivil,
  sumarDias,
} from './fecha-civil';

/** 'AAAA-MM-DD' → FechaCivil (solo para que las tablas de prueba sean legibles). */
function f(iso: string): FechaCivil {
  return {
    anio: Number(iso.slice(0, 4)),
    mes: Number(iso.slice(5, 7)),
    dia: Number(iso.slice(8, 10)),
  };
}

const clavesDe = (anio: number): string[] =>
  festivosDeColombia(anio).map((festivo) => aClaveIso(festivo.fecha));

/**
 * ORÁCULOS: calendarios publicados, transcritos a mano. No se derivan del
 * algoritmo; si el código y el oráculo difieren, se revisa contra la fuente.
 */
const FESTIVOS_OFICIALES_2026 = [
  '2026-01-01',
  '2026-01-12',
  '2026-03-23',
  '2026-04-02',
  '2026-04-03',
  '2026-05-01',
  '2026-05-18',
  '2026-06-08',
  '2026-06-15',
  '2026-06-29',
  '2026-07-20',
  '2026-08-07',
  '2026-08-17',
  '2026-10-12',
  '2026-11-02',
  '2026-11-16',
  '2026-12-08',
  '2026-12-25',
];

const FESTIVOS_OFICIALES_2027 = [
  '2027-01-01',
  '2027-01-11',
  '2027-03-22',
  '2027-03-25',
  '2027-03-26',
  '2027-05-01',
  '2027-05-10',
  '2027-05-31',
  '2027-06-07',
  '2027-07-05',
  '2027-07-20',
  '2027-08-07',
  '2027-08-16',
  '2027-10-18',
  '2027-11-01',
  '2027-11-15',
  '2027-12-08',
  '2027-12-25',
];

describe('calcularDomingoDePascua (Meeus/Jones/Butcher)', () => {
  it.each([
    [1984, '1984-04-22'],
    [2000, '2000-04-23'],
    [2008, '2008-03-23'],
    [2011, '2011-04-24'],
    [2019, '2019-04-21'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'], // fecha más tardía posible
    [2285, '2285-03-22'], // fecha más temprana posible
  ])('la Pascua de %i es el %s', (anio, esperado) => {
    expect(aClaveIso(calcularDomingoDePascua(anio))).toBe(esperado);
  });

  it('siempre es domingo, entre el 22 de marzo y el 25 de abril (1984–2500)', () => {
    for (let anio = ANIO_MINIMO_SOPORTADO; anio <= 2500; anio++) {
      const pascua = calcularDomingoDePascua(anio);
      const clave = aClaveIso(pascua);
      expect(diaDeLaSemana(pascua)).toBe(DiaSemana.DOMINGO);
      expect(clave >= `${anio}-03-22` && clave <= `${anio}-04-25`).toBe(true);
    }
  });

  it.each([
    ['NaN (año de un Date inválido)', Number.NaN],
    ['un año con decimales', 2026.5],
    ['un año anterior a la Ley 51 de 1983', ANIO_MINIMO_SOPORTADO - 1],
    ['un año posterior al máximo soportado', ANIO_MAXIMO_SOPORTADO + 1],
  ])('falla cerrado (RangeError) con %s', (_caso, anio) => {
    expect(() => calcularDomingoDePascua(anio)).toThrow(RangeError);
    expect(() => festivosDeColombia(anio)).toThrow(RangeError);
  });
});

describe('trasladarAlLunes (regla de la Ley Emiliani)', () => {
  it.each([
    ['lunes: no se mueve', '2026-10-12', '2026-10-12'],
    ['martes: 6 días después', '2026-01-06', '2026-01-12'],
    ['jueves', '2026-03-19', '2026-03-23'],
    ['sábado', '2026-08-15', '2026-08-17'],
    ['domingo: al día siguiente', '2026-11-01', '2026-11-02'],
    ['cruce de mes', '2027-06-29', '2027-07-05'],
    ['cruce de año', '2027-12-29', '2028-01-03'],
  ])('%s (%s → %s)', (_caso, origen, esperado) => {
    expect(aClaveIso(trasladarAlLunes(f(origen)))).toBe(esperado);
  });
});

describe('festivosDeColombia', () => {
  it.each([
    [2026, FESTIVOS_OFICIALES_2026],
    [2027, FESTIVOS_OFICIALES_2027],
  ])('coincide con el calendario oficial de %i', (anio, oficiales) => {
    expect(clavesDe(anio)).toEqual(oficiales);
  });

  it('devuelve 18 festivos ordenados por fecha (1984–2500)', () => {
    for (let anio = ANIO_MINIMO_SOPORTADO; anio <= 2500; anio++) {
      const claves = clavesDe(anio);
      expect(claves).toHaveLength(18);
      expect([...claves].sort()).toEqual(claves);
    }
  });

  it('respeta el día de la semana de cada grupo de la ley (1984–2500)', () => {
    const soloLunes = new Set<string>([
      'Día de los Reyes Magos',
      'Día de San José',
      'San Pedro y San Pablo',
      'Asunción de la Virgen',
      'Día de la Raza',
      'Día de Todos los Santos',
      'Independencia de Cartagena',
      'Ascensión del Señor',
      'Corpus Christi',
      'Sagrado Corazón de Jesús',
    ]);
    for (let anio = ANIO_MINIMO_SOPORTADO; anio <= 2500; anio++) {
      for (const festivo of festivosDeColombia(anio)) {
        const dia = diaDeLaSemana(festivo.fecha);
        if (soloLunes.has(festivo.nombre)) {
          expect(dia).toBe(DiaSemana.LUNES);
        } else if (festivo.nombre === 'Jueves Santo') {
          expect(dia).toBe(DiaSemana.JUEVES);
        } else if (festivo.nombre === 'Viernes Santo') {
          expect(dia).toBe(DiaSemana.VIERNES);
        }
      }
    }
  });

  it('conserva ambos festivos cuando coinciden (2025: San Pedro y Sagrado Corazón el 30 de junio)', () => {
    const delDia = festivosDeColombia(2025)
      .filter((festivo) => aClaveIso(festivo.fecha) === '2025-06-30')
      .map((festivo) => festivo.nombre);

    expect(delDia).toEqual(
      expect.arrayContaining([
        'San Pedro y San Pablo',
        'Sagrado Corazón de Jesús',
      ]),
    );
    expect(new Set(clavesDe(2025)).size).toBe(17);
  });

  it('devuelve una lista inmutable', () => {
    const festivos = festivosDeColombia(2026);
    expect(Object.isFrozen(festivos)).toBe(true);
    // El cast simula a un consumidor que ignora el `readonly` del tipo.
    expect(() => (festivos as Festivo[]).pop()).toThrow(TypeError);
  });

  /**
   * La prueba que justifica D-K/D-M: el resultado no puede depender de la zona
   * horaria del proceso. Jest aísla `process.env` en una copia, así que la zona
   * NO se puede cambiar desde una prueba. `npm run test:tz`
   * (scripts/test-zonas-horarias.mjs) relanza esta suite completa con TZ =
   * UTC, America/Bogota, Pacific/Pago_Pago (UTC−11, el caso crítico: allí la
   * medianoche UTC todavía es "ayer") y Pacific/Kiritimati (UTC+14).
   */
  const zonaSolicitada = process.env.TZ;
  (zonaSolicitada ? it : it.skip)(
    `precondición: el proceso corre en la zona solicitada (TZ=${zonaSolicitada ?? 'no definida'})`,
    () => {
      // Intl consulta la zona real del proceso, no la copia de process.env:
      // si el lanzador no hubiera aplicado TZ, esto falla (sin falsos verdes).
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
        zonaSolicitada,
      );
    },
  );
});

describe('calendarioLaboralColombia.esDiaHabil', () => {
  // Se invoca siempre como método: desestructurarlo perdería `this` (unbound-method).
  const calendario = calendarioLaboralColombia;

  it.each([
    ['martes ordinario', '2026-10-13', true],
    ['viernes ordinario', '2026-10-09', true],
    ['sábado', '2026-10-10', false],
    ['domingo', '2026-10-11', false],
    ['lunes festivo trasladado (Día de la Raza)', '2026-10-12', false],
    ['festivo fijo entre semana (Inmaculada, martes)', '2026-12-08', false],
    ['Jueves Santo', '2026-04-02', false],
    ['Viernes Santo', '2026-04-03', false],
    [
      'fecha original de un festivo trasladado (martes 6 de enero)',
      '2026-01-06',
      true,
    ],
    [
      'festivo que coincide con otro (30 de junio de 2025)',
      '2025-06-30',
      false,
    ],
  ])('%s (%s) → %s', (_caso, iso, esperado) => {
    expect(calendario.esDiaHabil(f(iso))).toBe(esperado);
  });

  it('hábil ⇔ lunes a viernes y no festivo, día por día (2026–2030)', () => {
    for (
      let fecha = f('2026-01-01');
      fecha.anio <= 2030;
      fecha = sumarDias(fecha, 1)
    ) {
      const dia = diaDeLaSemana(fecha);
      const finDeSemana = dia === DiaSemana.SABADO || dia === DiaSemana.DOMINGO;
      expect(calendario.esDiaHabil(fecha)).toBe(
        !finDeSemana && !esFestivoEnColombia(fecha),
      );
    }
  });

  it('2026 tiene 243 días hábiles (261 de lunes a viernes − 18 festivos entre semana)', () => {
    let habiles = 0;
    for (
      let fecha = f('2026-01-01');
      fecha.anio === 2026;
      fecha = sumarDias(fecha, 1)
    ) {
      if (calendario.esDiaHabil(fecha)) habiles++;
    }
    expect(habiles).toBe(243);
  });

  it.each([
    ['31 de febrero', { anio: 2026, mes: 2, dia: 31 }],
    ['mes 13', { anio: 2026, mes: 13, dia: 1 }],
    ['día 0', { anio: 2026, mes: 1, dia: 0 }],
    ['valores NaN', { anio: Number.NaN, mes: 1, dia: 1 }],
    ['año fuera de rango', { anio: 1983, mes: 6, dia: 1 }],
  ])(
    'falla cerrado (RangeError) con una fecha inválida: %s',
    (_caso, fecha) => {
      expect(() => calendario.esDiaHabil(fecha)).toThrow(RangeError);
    },
  );
});
