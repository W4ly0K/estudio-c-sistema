import {
  comoDebugDeRust,
  errorDesconocidoDePrisma,
  MENSAJE_23514_CHECK,
  MENSAJE_23P01_CREATE,
  reemplazarUnaVez,
} from '../utils/errores-postgres.fixture';
import { errorDelMotor, exigirErrorDelMotor } from './error-del-motor';

/*
 * Fase 9 · H8b-3 · La lectura del error del motor que usa I-46, probada SIN base de datos contra los mensajes REALES
 * de Prisma 5.22 + PostgreSQL 17 capturados en errores-postgres.fixture.ts.
 * Qué demuestra: con ese formato se obtienen el SQLSTATE y la restricción, venga en la clase de Prisma o en un Error
 * cualquiera, y los datos de la fila no pueden imitar una restricción.
 * Qué NO demuestra: que una versión futura de Prisma conserve el formato (I-46c fallaría y habría que recapturar).
 */
describe('errorDelMotor (Fase 9 · H8b-3: SQLSTATE y restricción sin depender de la clase)', () => {
  it('lee el 23514 real capturado: el SQLSTATE y los identificadores citados (la tabla y la restricción)', () => {
    expect(errorDelMotor(errorDesconocidoDePrisma(MENSAJE_23514_CHECK))).toEqual({
      sqlstate: '23514',
      citados: ['Solicitud', 'Solicitud_fechas_validas_check'],
    });
  });

  it('no depende de la clase: el mismo mensaje en un Error cualquiera da el mismo resultado', () => {
    expect(errorDelMotor(new Error(MENSAJE_23514_CHECK))).toEqual(errorDelMotor(errorDesconocidoDePrisma(MENSAJE_23514_CHECK)));
  });

  it('con el nombre de una restricción de enlace (derivado del oráculo, ancla única)', () => {
    const mensaje = reemplazarUnaVez(MENSAJE_23514_CHECK, 'Solicitud_fechas_validas_check', 'Solicitud_enlace_anexo_formato_check');

    expect(errorDelMotor(errorDesconocidoDePrisma(mensaje))?.citados).toEqual(['Solicitud', 'Solicitud_enlace_anexo_formato_check']);
  });

  it('distingue el SQLSTATE: el 23P01 real de CA-06 no es un 23514', () => {
    expect(errorDelMotor(errorDesconocidoDePrisma(MENSAJE_23P01_CREATE))?.sqlstate).toBe('23P01');
  });

  it('los datos de la fila (detail) no pueden imitar una restricción', () => {
    const imitacion = comoDebugDeRust('https://x" violates check constraint "Log_Auditoria_enlace_nuevo_formato_check');
    const mensaje = reemplazarUnaVez(MENSAJE_23514_CHECK, 'EC-E, u-exp', imitacion);

    expect(errorDelMotor(errorDesconocidoDePrisma(mensaje))?.citados).toEqual(['Solicitud', 'Solicitud_fechas_validas_check']);
  });

  const NO_RECONOCIDOS: readonly (readonly [string, unknown])[] = [
    ['un texto que no es Error', 'code: "23514"'],
    ['un Error sin PostgresError', new Error('Can\'t reach database server')],
    ['null', null],
    ['dos PostgresError en el mismo mensaje (ambiguo)', new Error(`${MENSAJE_23514_CHECK}\n${MENSAJE_23P01_CREATE}`)],
  ];

  it.each(NO_RECONOCIDOS)('devuelve null con %s', (_caso, error) => {
    expect(errorDelMotor(error)).toBeNull();
  });

  it('exigirErrorDelMotor devuelve lo mismo que errorDelMotor cuando el formato se reconoce', () => {
    const error = errorDesconocidoDePrisma(MENSAJE_23514_CHECK);

    expect(exigirErrorDelMotor(error)).toEqual(errorDelMotor(error));
  });

  it.each(NO_RECONOCIDOS)('exigirErrorDelMotor falla de forma visible con %s', (_caso, error) => {
    expect(() => exigirErrorDelMotor(error)).toThrow('Formato de error del motor no reconocido');
  });

  it('el fallo no copia el mensaje original (podría traer el host o datos de la fila)', () => {
    const conDatos = new Error('Can\'t reach database server at `host-secreto.ejemplo:5432`');

    expect(() => exigirErrorDelMotor(conDatos)).toThrow('Formato de error del motor no reconocido (Error)');
    expect(() => exigirErrorDelMotor(conDatos)).not.toThrow(/host-secreto/);
  });
});
