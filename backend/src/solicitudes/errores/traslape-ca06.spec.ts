import { Prisma } from '@prisma/client';
import {
  esViolacionDeTraslapeCa06,
  RESTRICCIONES_CA06,
  RESTRICCIONES_CA06_POR_SUBESPACIO,
} from './traslape-ca06';
import {
  comoDebugDeRust,
  errorDesconocidoDePrisma,
  MENSAJE_23514_CHECK,
  MENSAJE_23P01_CREATE,
  MENSAJE_23P01_CREATE_GLOBAL,
  MENSAJE_23P01_TRANSACCION,
  MENSAJE_23P01_TX_INTERACTIVA,
  MENSAJE_23P01_UPDATE,
  reemplazarUnaVez,
  VERSION_PRISMA_DEL_SONDEO,
} from '../../../test/utils/errores-postgres.fixture';

// Fase 7 (ADR-007 · SE2): nombres escritos A MANO, no derivados de la constante, para
// que la prueba sea un oráculo independiente del código que verifica.
const CABINA = 'Solicitud_sin_traslape_ca06_cabina';
const ESTUDIO = 'Solicitud_sin_traslape_ca06_estudio';
// La restricción global de la Fase 4, retirada en el contract (7A.8): ya no es CA-06.
const GLOBAL = 'Solicitud_sin_traslape_ca06';

// Anclas del nombre dentro del campo message del 23P01 real (texto literal: \"nombre\"").
const NOMBRE_EN_MESSAGE = `\\"${CABINA}\\""`;
const GLOBAL_EN_MESSAGE = `\\"${GLOBAL}\\""`;
// Texto que un usuario podría escribir en "proposito" imitando la firma completa.
const FIRMA_FORJADA = `code: "23P01", message: "conflicting \\"${CABINA}\\""`;

/** Un 23P01 real (de la cabina) cuya restricción se llama `nombre` (la única diferencia). */
const conNombre = (mensaje: string, nombre: string): string =>
  reemplazarUnaVez(mensaje, NOMBRE_EN_MESSAGE, `\\"${nombre}\\""`);

/** Un 23P01 real del sondeo 4.2 (restricción global) con el nombre vigente `nombre`. */
const desdeGlobal = (mensaje: string, nombre: string): string =>
  reemplazarUnaVez(mensaje, GLOBAL_EN_MESSAGE, `\\"${nombre}\\""`);

describe('esViolacionDeTraslapeCa06 (detector del 23P01 de CA-06)', () => {
  it('C3-a · contract (7A.8): la restricción global de la Fase 4 ya NO está en la lista', () => {
    expect(RESTRICCIONES_CA06).not.toContain(GLOBAL);
  });

  it('las restricciones por sub-espacio se llaman como en ADR-007 (SE2)', () => {
    expect(RESTRICCIONES_CA06_POR_SUBESPACIO).toEqual([CABINA, ESTUDIO]);
  });

  it('la lista es CERRADA: una por sub-espacio físico, sin más', () => {
    expect(RESTRICCIONES_CA06).toEqual([CABINA, ESTUDIO]);
  });

  describe('reconoce la violación de NUESTRA restricción', () => {
    it.each<[string, string]>([
      ['1 · mensaje real de create() en la cabina (integración I-30a)', MENSAJE_23P01_CREATE],
      ['2 · formato real de update() (sondeo 4.2) con la cabina', desdeGlobal(MENSAJE_23P01_UPDATE, CABINA)],
      ['2b · formato real de $transaction en update() (sondeo 4.2) con la cabina', desdeGlobal(MENSAJE_23P01_TRANSACCION, CABINA)],
      ['2c · mensaje real de updateMany en una $transaction interactiva (integración I-9)', MENSAJE_23P01_TX_INTERACTIVA],
      [
        '3 · PostgreSQL con mensajes en español (lc_messages)',
        reemplazarUnaVez(
          MENSAJE_23P01_CREATE,
          'conflicting key value violates exclusion constraint',
          'llave en conflicto viola la restricción de exclusión',
        ),
      ],
      ['1d · Fase 7: restricción de la cabina (create)', conNombre(MENSAJE_23P01_CREATE, CABINA)],
      ['1e · Fase 7: restricción del estudio (create)', conNombre(MENSAJE_23P01_CREATE, ESTUDIO)],
      ['2d · Fase 7: restricción del estudio (update)', desdeGlobal(MENSAJE_23P01_UPDATE, ESTUDIO)],
      [
        '2e · Fase 7: restricción del estudio en una $transaction interactiva',
        conNombre(MENSAJE_23P01_TX_INTERACTIVA, ESTUDIO),
      ],
      [
        '3b · Fase 7: restricción de la cabina con mensajes en español',
        reemplazarUnaVez(
          conNombre(MENSAJE_23P01_CREATE, CABINA),
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
        errorDesconocidoDePrisma(reemplazarUnaVez(MENSAJE_23P01_CREATE_GLOBAL, GLOBAL_EN_MESSAGE, `\\"${GLOBAL}_v2\\""`)),
      ],
      // Contract (7A.8): los 23P01 reales de la restricción global ya no son CA-06.
      ['4g · contract: create() real de la restricción global (sondeo 4.2)', errorDesconocidoDePrisma(MENSAJE_23P01_CREATE_GLOBAL)],
      ['4h · contract: update() real de la restricción global (sondeo 4.2)', errorDesconocidoDePrisma(MENSAJE_23P01_UPDATE)],
      ['4i · contract: $transaction real de la restricción global (sondeo 4.2)', errorDesconocidoDePrisma(MENSAJE_23P01_TRANSACCION)],
      // Fase 7 · SE3: la familia "Solicitud_sin_traslape_ca06_*" NO se reconoce por prefijo.
      [
        '4b · nombre de la familia que no está en la lista (_ca06_otra)',
        errorDesconocidoDePrisma(conNombre(MENSAJE_23P01_CREATE, 'Solicitud_sin_traslape_ca06_otra')),
      ],
      [
        '4c · sufijo sobre un nombre nuevo (_cabina_v2)',
        errorDesconocidoDePrisma(conNombre(MENSAJE_23P01_CREATE, `${CABINA}_v2`)),
      ],
      [
        '4d · nombre nuevo truncado (_cab)',
        errorDesconocidoDePrisma(conNombre(MENSAJE_23P01_CREATE, 'Solicitud_sin_traslape_ca06_cab')),
      ],
      [
        '4e · nombre nuevo con otra capitalización (_CABINA)',
        errorDesconocidoDePrisma(conNombre(MENSAJE_23P01_CREATE, 'Solicitud_sin_traslape_ca06_CABINA')),
      ],
      [
        '4f · los dos nombres nuevos pegados (sin separación de la alternancia)',
        errorDesconocidoDePrisma(conNombre(MENSAJE_23P01_CREATE, `${CABINA}${ESTUDIO}`)),
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
            `. ${comoDebugDeRust(`"${CABINA}"`)}"), column:`,
          ),
        ),
      ],
      [
        '7c · Fase 7: 23P01 de OTRA restricción cuyo DETAIL termina con un nombre nuevo entre comillas',
        errorDesconocidoDePrisma(
          reemplazarUnaVez(
            reemplazarUnaVez(MENSAJE_23P01_CREATE, NOMBRE_EN_MESSAGE, '\\"Reserva_equipo_sin_traslape\\""'),
            '."), column:',
            `. ${comoDebugDeRust(`"${ESTUDIO}"`)}"), column:`,
          ),
        ),
      ],
      [
        '7d · Fase 7: 23514 con un proposito que imita la firma con un nombre nuevo',
        errorDesconocidoDePrisma(
          reemplazarUnaVez(
            MENSAJE_23514_CHECK,
            'sondeo EC-E',
            comoDebugDeRust(`code: "23P01", message: "conflicting \\"${CABINA}\\""`),
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
