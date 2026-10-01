import {
  calendarioLaboralColombia,
  type CalendarioLaboral,
} from './calendario-colombia';
import {
  aClaveIso,
  compararFechas,
  type FechaCivil,
  sumarDias,
} from './fecha-civil';
import {
  DIAS_HABILES_DE_ANTICIPACION,
  esUrgente,
  fechaMinimaSinUrgencia,
  MAXIMO_DIAS_DE_BUSQUEDA,
  sumarDiasHabiles,
} from './urgencia';

function f(iso: string): FechaCivil {
  return {
    anio: Number(iso.slice(0, 4)),
    mes: Number(iso.slice(5, 7)),
    dia: Number(iso.slice(8, 10)),
  };
}

const CAL = calendarioLaboralColombia;
const NADA_HABIL: CalendarioLaboral = { esDiaHabil: () => false };

describe('compararFechas (D-R)', () => {
  it.each([
    ['2026-10-13', '2026-10-14', -1],
    ['2026-10-14', '2026-10-14', 0],
    ['2026-10-15', '2026-10-14', 1],
    ['2026-12-31', '2027-01-01', -1], // cruce de año
    ['2026-09-30', '2026-10-01', -1], // cruce de mes
    ['2027-01-01', '2026-12-31', 1],
  ])('%s vs %s → %i', (a, b, esperado) => {
    expect(compararFechas(f(a), f(b))).toBe(esperado);
  });
});

describe('fechaMinimaSinUrgencia (Lectura B: 5 días hábiles completos)', () => {
  it('la anticipación acordada es de 5 días hábiles', () => {
    expect(DIAS_HABILES_DE_ANTICIPACION).toBe(5);
  });

  /** Oráculos acordados en el diseño del Paso 3.3. */
  it.each([
    ['lunes, con festivo en medio (caso acordado)', '2026-10-05', '2026-10-14'],
    ['viernes, el lunes siguiente es festivo', '2026-10-02', '2026-10-13'],
    [
      'radicación en festivo y Semana Santa en medio',
      '2027-03-22',
      '2027-04-01',
    ],
    ['Navidad y Año Nuevo, cruzando el año', '2026-12-24', '2027-01-05'],
    ['sábado, con el lunes festivo', '2026-10-10', '2026-10-20'],
  ])('%s: radicada el %s → mínima %s', (_caso, radicacion, esperada) => {
    expect(aClaveIso(fechaMinimaSinUrgencia(f(radicacion), CAL))).toBe(
      esperada,
    );
  });

  it('entre la radicación y la mínima hay EXACTAMENTE 5 días hábiles, y la mínima es hábil (2026–2030)', () => {
    for (
      let radicacion = f('2026-01-01');
      radicacion.anio <= 2030;
      radicacion = sumarDias(radicacion, 1)
    ) {
      const minima = fechaMinimaSinUrgencia(radicacion, CAL);
      expect(CAL.esDiaHabil(minima)).toBe(true);

      let habilesIntermedios = 0;
      for (
        let dia = sumarDias(radicacion, 1);
        compararFechas(dia, minima) < 0;
        dia = sumarDias(dia, 1)
      ) {
        if (CAL.esDiaHabil(dia)) habilesIntermedios++;
      }
      expect(habilesIntermedios).toBe(DIAS_HABILES_DE_ANTICIPACION);
    }
  });
});

describe('esUrgente', () => {
  const minima = f('2026-10-14'); // radicación del lunes 5 de octubre de 2026
  it.each([
    ['el mismo día de la radicación', '2026-10-05', true],
    ['el último día urgente', '2026-10-13', true],
    ['exactamente la fecha mínima', '2026-10-14', false],
    ['después de la fecha mínima', '2026-11-03', false],
  ])('reserva %s (%s) → urgente: %s', (_caso, reserva, esperado) => {
    expect(esUrgente(f(reserva), minima)).toBe(esperado);
  });
});

describe('sumarDiasHabiles', () => {
  it('cuenta desde el día SIGUIENTE (la radicación no cuenta)', () => {
    // Martes 6 de octubre de 2026 es hábil: el 1.er día hábil tras el lunes 5.
    expect(aClaveIso(sumarDiasHabiles(f('2026-10-05'), 1, CAL))).toBe(
      '2026-10-06',
    );
  });

  it.each([
    ['cero', 0],
    ['negativo', -1],
    ['con decimales', 1.5],
    ['NaN', Number.NaN],
  ])('falla cerrado (RangeError) con n %s', (_caso, n) => {
    expect(() => sumarDiasHabiles(f('2026-10-05'), n, CAL)).toThrow(RangeError);
  });

  it('falla cerrado con una fecha de partida inválida', () => {
    expect(() =>
      sumarDiasHabiles({ anio: 2026, mes: 2, dia: 30 }, 1, CAL),
    ).toThrow(RangeError);
  });

  /**
   * D-S. Un ciclo infinito síncrono NO lo interrumpe el timeout de Jest: el
   * proceso se colgaría. Por eso el calendario espía corta a las 10.000
   * consultas con un error propio: si alguien quita el tope, esta prueba
   * falla en milisegundos en lugar de bloquear la ejecución.
   */
  it('termina con RangeError si el calendario nunca tiene días hábiles', () => {
    let consultas = 0;
    const contador: CalendarioLaboral = {
      esDiaHabil: (fecha) => {
        consultas++;
        if (consultas > 10_000) {
          throw new Error('Sin tope: el ciclo no se detuvo (D-S).');
        }
        return NADA_HABIL.esDiaHabil(fecha);
      },
    };
    expect(() => sumarDiasHabiles(f('2026-10-05'), 6, contador)).toThrow(
      RangeError,
    );
    expect(consultas).toBe(MAXIMO_DIAS_DE_BUSQUEDA);
  });
});
