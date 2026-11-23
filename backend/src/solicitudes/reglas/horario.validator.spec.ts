import {
  calendarioLaboralColombia,
  type CalendarioLaboral,
} from './calendario-colombia';
import { aClaveIso } from './fecha-civil';
import {
  BLOQUES_DE_ATENCION,
  type ErrorHorario,
  evaluarHorario,
  MENSAJES_ERROR_HORARIO,
  validarFranjaHoraria,
} from './horario.validator';

/** Hora civil de Bogotá → instante. Ej.: bog('2026-10-13T08:00'). */
const bog = (local: string): Date => new Date(`${local}-05:00`);

/** "Hoy" fijo en las pruebas: jueves 1 de octubre de 2026, 9:00 a.m. */
const AHORA = bog('2026-10-01T09:00:00.000');
/** Martes 13 de octubre de 2026: día hábil. */
const DIA = '2026-10-13';

const TODO_HABIL: CalendarioLaboral = { esDiaHabil: () => true };
const NADA_HABIL: CalendarioLaboral = { esDiaHabil: () => false };

function errorDe(
  inicio: Date,
  fin: Date,
  calendario: CalendarioLaboral = calendarioLaboralColombia,
  ahora: Date = AHORA,
): ErrorHorario | 'VALIDO' {
  const r = validarFranjaHoraria({ inicio, fin }, ahora, calendario);
  return r.valido ? 'VALIDO' : r.error;
}

describe('validarFranjaHoraria', () => {
  describe('CA-04: bloques 08:00–12:00 y 14:00–18:00, intervalo [inicio, fin)', () => {
    it.each([
      // Límites exactos de los bloques (D-L)
      [
        'bloque de la mañana completo',
        '08:00:00.000',
        '12:00:00.000',
        'VALIDO',
      ],
      ['bloque de la tarde completo', '14:00:00.000', '18:00:00.000', 'VALIDO'],
      ['franja interna de la mañana', '09:30:00.000', '10:45:00.000', 'VALIDO'],
      [
        'inicia 1 ms antes de las 08:00',
        '07:59:59.999',
        '09:00:00.000',
        'FUERA_DE_BLOQUE',
      ],
      [
        'termina 1 ms después de las 12:00',
        '11:00:00.000',
        '12:00:00.001',
        'FUERA_DE_BLOQUE',
      ],
      // D-O: el hueco que tenía la comparación por minutos
      [
        'termina a las 12:00:30 (hueco de los minutos)',
        '11:00:00.000',
        '12:00:30.000',
        'FUERA_DE_BLOQUE',
      ],
      [
        'inicia 1 ms antes de las 14:00',
        '13:59:59.999',
        '15:00:00.000',
        'FUERA_DE_BLOQUE',
      ],
      [
        'termina 1 ms después de las 18:00',
        '17:00:00.000',
        '18:00:00.001',
        'FUERA_DE_BLOQUE',
      ],
      ['cruza el almuerzo', '10:00:00.000', '16:00:00.000', 'FUERA_DE_BLOQUE'],
      [
        'dentro del almuerzo',
        '12:30:00.000',
        '13:30:00.000',
        'FUERA_DE_BLOQUE',
      ],
      ['madrugada', '03:00:00.000', '04:00:00.000', 'FUERA_DE_BLOQUE'],
      ['noche', '19:00:00.000', '20:00:00.000', 'FUERA_DE_BLOQUE'],
    ])('%s (%s–%s) → %s', (_caso, desde, hasta, esperado) => {
      expect(errorDe(bog(`${DIA}T${desde}`), bog(`${DIA}T${hasta}`))).toBe(
        esperado,
      );
    });

    /** Regresión de la Fase 0: "08:00Z" son las 03:00 en Bogotá. */
    it('evalúa la hora de Bogotá, no la del instante UTC', () => {
      expect(
        errorDe(
          new Date(`${DIA}T13:00:00.000Z`),
          new Date(`${DIA}T15:00:00.000Z`),
        ),
      ).toBe('VALIDO'); // 08:00–10:00 en Bogotá
      expect(
        errorDe(
          new Date(`${DIA}T08:00:00.000Z`),
          new Date(`${DIA}T10:00:00.000Z`),
        ),
      ).toBe('FUERA_DE_BLOQUE'); // 03:00–05:00 en Bogotá
    });

    it('los bloques no se pueden modificar en tiempo de ejecución', () => {
      expect(Object.isFrozen(BLOQUES_DE_ATENCION)).toBe(true);
      expect(BLOQUES_DE_ATENCION.every((b) => Object.isFrozen(b))).toBe(true);
    });
  });

  describe('FIN_NO_POSTERIOR', () => {
    it.each([
      ['fin igual al inicio (duración cero)', '09:00', '09:00'],
      ['fin antes del inicio', '10:00', '09:00'],
    ])('%s', (_caso, desde, hasta) => {
      expect(errorDe(bog(`${DIA}T${desde}`), bog(`${DIA}T${hasta}`))).toBe(
        'FIN_NO_POSTERIOR',
      );
    });
  });

  describe('EN_EL_PASADO (reemplaza al @MinDate congelado)', () => {
    it.each([
      [
        'inicio exactamente en "ahora"',
        '2026-10-01T09:00:00.000',
        '2026-10-01T10:00:00.000',
        'EN_EL_PASADO',
      ],
      [
        'inicio 1 ms antes de "ahora"',
        '2026-10-01T08:59:59.999',
        '2026-10-01T10:00:00.000',
        'EN_EL_PASADO',
      ],
      [
        'un día pasado completo',
        '2026-09-30T09:00:00.000',
        '2026-09-30T10:00:00.000',
        'EN_EL_PASADO',
      ],
      [
        'más tarde el mismo día (será urgente en el 3.3)',
        '2026-10-01T09:00:00.001',
        '2026-10-01T10:00:00.000',
        'VALIDO',
      ],
    ])('%s → %s', (_caso, desde, hasta, esperado) => {
      expect(errorDe(bog(desde), bog(hasta))).toBe(esperado);
    });

    /** Prueba de diseño: "ahora" se recibe, así que avanza con cada petición. */
    it('depende del "ahora" recibido, no de cuándo se cargó el módulo', () => {
      const inicio = bog(`${DIA}T09:00`);
      const fin = bog(`${DIA}T10:00`);
      expect(errorDe(inicio, fin, TODO_HABIL, AHORA)).toBe('VALIDO');
      expect(errorDe(inicio, fin, TODO_HABIL, bog(`${DIA}T09:30`))).toBe(
        'EN_EL_PASADO',
      );
    });
  });

  describe('MULTIPLES_DIAS', () => {
    it('rechaza una reserva que termina al día siguiente (hora de Bogotá)', () => {
      expect(
        errorDe(bog(`${DIA}T17:00`), bog('2026-10-14T09:00'), TODO_HABIL),
      ).toBe('MULTIPLES_DIAS');
    });

    it('decide por la fecha de Bogotá, no por la fecha UTC', () => {
      // 17:00–19:30 en Bogotá termina a las 00:30Z del día 14: en UTC serían
      // dos días, pero en Bogotá es uno solo. El error correcto es el bloque.
      expect(errorDe(bog(`${DIA}T17:00`), bog(`${DIA}T19:30`))).toBe(
        'FUERA_DE_BLOQUE',
      );
    });
  });

  describe('DIA_NO_HABIL (puerto CalendarioLaboral)', () => {
    it.each([
      ['sábado', '2026-10-10'],
      ['domingo', '2026-10-11'],
      ['lunes festivo (Día de la Raza)', '2026-10-12'],
      ['Jueves Santo', '2027-03-25'],
    ])('con el calendario real rechaza %s (%s)', (_caso, dia) => {
      expect(errorDe(bog(`${dia}T09:00`), bog(`${dia}T10:00`))).toBe(
        'DIA_NO_HABIL',
      );
    });

    it('consulta el calendario inyectado, no uno fijo', () => {
      const inicio = bog('2026-10-10T09:00'); // sábado
      const fin = bog('2026-10-10T10:00');
      expect(errorDe(inicio, fin, TODO_HABIL)).toBe('VALIDO');
      expect(
        errorDe(bog(`${DIA}T09:00`), bog(`${DIA}T10:00`), NADA_HABIL),
      ).toBe('DIA_NO_HABIL');
    });
  });

  describe('precedencia de errores (Decisión D-P)', () => {
    it.each([
      // Cada fila viola su regla Y todas las siguientes: debe ganar la primera.
      [
        'fin ≤ inicio, pasado, domingo y fuera de bloque',
        '2026-09-27T20:00',
        '2026-09-27T19:00',
        'FIN_NO_POSTERIOR',
      ],
      [
        'pasado, varios días, domingo y fuera de bloque',
        '2026-09-27T20:00',
        '2026-09-28T19:00',
        'EN_EL_PASADO',
      ],
      [
        'varios días, empieza en domingo y fuera de bloque',
        '2026-10-11T20:00',
        '2026-10-12T19:00',
        'MULTIPLES_DIAS',
      ],
      [
        'domingo y fuera de bloque',
        '2026-10-11T20:00',
        '2026-10-11T21:00',
        'DIA_NO_HABIL',
      ],
    ])('%s → %s', (_caso, desde, hasta, esperado) => {
      expect(errorDe(bog(desde), bog(hasta))).toBe(esperado);
    });
  });

  describe('resultado válido', () => {
    it('devuelve los momentos locales para los pasos siguientes', () => {
      const r = validarFranjaHoraria(
        { inicio: bog(`${DIA}T08:00`), fin: bog(`${DIA}T09:00`) },
        AHORA,
        calendarioLaboralColombia,
      );
      expect(r).toEqual({
        valido: true,
        inicioLocal: {
          fecha: { anio: 2026, mes: 10, dia: 13 },
          msDelDia: 8 * 3_600_000,
        },
        finLocal: {
          fecha: { anio: 2026, mes: 10, dia: 13 },
          msDelDia: 9 * 3_600_000,
        },
      });
    });
  });

  describe('fail-closed', () => {
    const invalida = new Date('no-es-fecha');
    const valida = bog(`${DIA}T09:00`);
    it.each([
      ['inicio', invalida, valida, AHORA],
      ['fin', valida, invalida, AHORA],
      ['ahora', valida, bog(`${DIA}T10:00`), invalida],
    ])(
      'lanza RangeError si "%s" es un Date inválido',
      (_campo, inicio, fin, ahora) => {
        expect(() =>
          validarFranjaHoraria(
            { inicio, fin },
            ahora,
            calendarioLaboralColombia,
          ),
        ).toThrow(RangeError);
      },
    );
  });

  describe('mensajes (Decisión D-Q)', () => {
    it('cada código tiene un mensaje CA-04 que no está vacío', () => {
      for (const mensaje of Object.values(MENSAJES_ERROR_HORARIO)) {
        expect(mensaje.startsWith('Error CA-04: ')).toBe(true);
      }
      expect(Object.keys(MENSAJES_ERROR_HORARIO)).toHaveLength(5);
    });
  });
});

describe('evaluarHorario (franja + urgencia, Decisión D-N)', () => {
  /** Radicación: lunes 5 de octubre de 2026, 10:00 → mínima: miércoles 14. */
  const RADICACION = bog('2026-10-05T10:00');

  it.each([
    ['el mismo día de la radicación, más tarde', '2026-10-05', true],
    ['martes 13: el último día urgente', '2026-10-13', true],
    ['miércoles 14: la fecha mínima', '2026-10-14', false],
    ['tres semanas después', '2026-10-27', false],
  ])('reserva %s (%s) → urgente: %s', (_caso, dia, urgente) => {
    const r = evaluarHorario(
      { inicio: bog(`${dia}T14:00`), fin: bog(`${dia}T15:00`) },
      RADICACION,
      calendarioLaboralColombia,
    );
    expect(r.valido).toBe(true);
    if (r.valido) {
      expect(r.urgente).toBe(urgente);
      expect(aClaveIso(r.fechaMinimaSinUrgencia)).toBe('2026-10-14');
    }
  });

  /**
   * La radicación se fecha en Bogotá: a las 23:59:59.999 del lunes 5 un
   * servidor en UTC ya está en el martes 6 (04:59:59.999Z).
   */
  it.each([
    ['último milisegundo del lunes 5', '2026-10-05T23:59:59.999', '2026-10-14'],
    ['primer instante del martes 6', '2026-10-06T00:00:00.000', '2026-10-15'],
  ])('radicación en el %s → mínima %s', (_caso, ahora, minima) => {
    const r = evaluarHorario(
      { inicio: bog('2026-10-27T09:00'), fin: bog('2026-10-27T10:00') },
      bog(ahora),
      calendarioLaboralColombia,
    );
    expect(r.valido && aClaveIso(r.fechaMinimaSinUrgencia)).toBe(minima);
  });

  it('propaga el error de la franja sin calcular la urgencia', () => {
    // Con NADA_HABIL, calcular la urgencia lanzaría RangeError (D-S). Que
    // devuelva DIA_NO_HABIL prueba que la urgencia va DESPUÉS de la franja.
    const r = evaluarHorario(
      { inicio: bog(`${DIA}T09:00`), fin: bog(`${DIA}T10:00`) },
      AHORA,
      NADA_HABIL,
    );
    expect(r).toEqual({ valido: false, error: 'DIA_NO_HABIL' });
  });
});
