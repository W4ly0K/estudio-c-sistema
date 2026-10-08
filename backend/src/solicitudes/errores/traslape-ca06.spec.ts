import { Prisma } from '@prisma/client';
import { esViolacionDeTraslapeCa06, RESTRICCION_CA06 } from './traslape-ca06';
import {
  comoDebugDeRust,
  errorDesconocidoDePrisma,
  MENSAJE_23514_CHECK,
  MENSAJE_23P01_CREATE,
  MENSAJE_23P01_TRANSACCION,
  MENSAJE_23P01_TX_INTERACTIVA,
  MENSAJE_23P01_UPDATE,
  reemplazarUnaVez,
  VERSION_PRISMA_DEL_SONDEO,
} from '../../../test/utils/errores-postgres.fixture';

// Ancla del nombre dentro del campo message del 23P01 real (texto literal: \"nombre\"").
const NOMBRE_EN_MESSAGE = `\\"${RESTRICCION_CA06}\\""`;
// Texto que un usuario podría escribir en "proposito" imitando la firma completa.
const FIRMA_FORJADA = `code: "23P01", message: "conflicting \\"${RESTRICCION_CA06}\\""`;

describe('esViolacionDeTraslapeCa06 (detector del 23P01 de CA-06)', () => {
  it('la restricción se llama como en la migración', () => {
    expect(RESTRICCION_CA06).toBe('Solicitud_sin_traslape_ca06');
  });

  describe('reconoce la violación de NUESTRA restricción', () => {
    it.each<[string, string]>([
      ['1 · mensaje real de create() (sondeo 4.2)', MENSAJE_23P01_CREATE],
      ['2 · mensaje real de update() (sondeo 4.2)', MENSAJE_23P01_UPDATE],
      ['2b · mensaje real de $transaction en update() (sondeo 4.2)', MENSAJE_23P01_TRANSACCION],
      ['2c · mensaje real de updateMany en una $transaction interactiva (integración I-9)', MENSAJE_23P01_TX_INTERACTIVA],
      [
        '3 · PostgreSQL con mensajes en español (lc_messages)',
        reemplazarUnaVez(
          MENSAJE_23P01_CREATE,
          'conflicting key value violates exclusion constraint',
          'llave en conflicto viola la restricción de exclusión',
        ),
      ],
    ])('%s → true', (_caso, mensaje) => {
      expect(esViolacionDeTraslapeCa06(errorDesconocidoDePrisma(mensaje))).toBe(true);
    });
  });

  describe('rechaza todo lo demás (fail-closed)', () => {
    it.each<[string, unknown]>([
      [
        '4 · nombre con sufijo (_v2)',
        errorDesconocidoDePrisma(
          reemplazarUnaVez(MENSAJE_23P01_CREATE, NOMBRE_EN_MESSAGE, `\\"${RESTRICCION_CA06}_v2\\""`),
        ),
      ],
      ['5 · 23514 real del CHECK de fechas', errorDesconocidoDePrisma(MENSAJE_23514_CHECK)],
      [
        '5b · mismo mensaje de nuestra restricción con otro SQLSTATE (23505)',
        errorDesconocidoDePrisma(reemplazarUnaVez(MENSAJE_23P01_CREATE, 'code: "23P01"', 'code: "23505"')),
      ],
      [
        '6 · 23514 con un proposito que imita la firma',
        errorDesconocidoDePrisma(
          reemplazarUnaVez(MENSAJE_23514_CHECK, 'sondeo EC-E', comoDebugDeRust(FIRMA_FORJADA)),
        ),
      ],
      [
        '6b · 23514 con un proposito que intenta romper el escape (\\")',
        errorDesconocidoDePrisma(
          reemplazarUnaVez(MENSAJE_23514_CHECK, 'sondeo EC-E', comoDebugDeRust(`\\", ${FIRMA_FORJADA}`)),
        ),
      ],
      [
        '7 · 23P01 de OTRA restricción con nuestro nombre dentro del DETAIL',
        errorDesconocidoDePrisma(
          reemplazarUnaVez(
            reemplazarUnaVez(MENSAJE_23P01_CREATE, NOMBRE_EN_MESSAGE, '\\"Reserva_equipo_sin_traslape\\""'),
            'detail: Some("',
            `detail: Some("${comoDebugDeRust(FIRMA_FORJADA)} `,
          ),
        ),
      ],
      [
        '7b · 23P01 de OTRA restricción cuyo DETAIL termina con nuestro nombre entre comillas',
        errorDesconocidoDePrisma(
          reemplazarUnaVez(
            reemplazarUnaVez(MENSAJE_23P01_CREATE, NOMBRE_EN_MESSAGE, '\\"Reserva_equipo_sin_traslape\\""'),
            '."), column:',
            `. ${comoDebugDeRust(`"${RESTRICCION_CA06}"`)}"), column:`,
          ),
        ),
      ],
      ['8 · Error común con el texto real (no lo lanzó Prisma)', new Error(MENSAJE_23P01_CREATE)],
      [
        '9 · PrismaClientKnownRequestError (P2002)',
        new Prisma.PrismaClientKnownRequestError(MENSAJE_23P01_CREATE, {
          code: 'P2002',
          clientVersion: VERSION_PRISMA_DEL_SONDEO,
        }),
      ],
      ['10a · null', null],
      ['10b · undefined', undefined],
      ['10c · cadena con el texto real', MENSAJE_23P01_CREATE],
      ['10d · objeto plano con message', { message: MENSAJE_23P01_CREATE }],
    ])('%s → false', (_caso, error) => {
      expect(esViolacionDeTraslapeCa06(error)).toBe(false);
    });
  });
});
