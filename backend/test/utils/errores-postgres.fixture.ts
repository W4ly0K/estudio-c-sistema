import { Prisma } from '@prisma/client';

/**
 * Mensajes REALES de Prisma 5.22.0 + PostgreSQL 17 (base desechable). Son oráculos: no se
 * editan a mano. Si se actualiza Prisma, las pruebas de integración deben recapturarlos.
 *
 * Fase 7 · 7A.8 (contract): la restricción GLOBAL de la Fase 4 ya no existe. Los mensajes con
 * los nombres vigentes los verifica la integración en cada ejecución (MENSAJE_23P01_CREATE en
 * I-30a, MENSAJE_23P01_TX_INTERACTIVA en I-9). Los del sondeo 4.2 con el nombre global
 * (CREATE_GLOBAL, UPDATE y TRANSACCION) se conservan sin tocar: son los casos NEGATIVOS del
 * detector (un 23P01 de esa restricción ya no es CA-06) y la base para derivar positivos.
 */
export const VERSION_PRISMA_DEL_SONDEO = '5.22.0';

/**
 * Fase 7 · 7A.8 · create traslapado en la CABINA → 23P01 de Solicitud_sin_traslape_ca06_cabina,
 * con los datos de I-30a (ca06.int-spec.ts): 27-oct 09:00–10:00 y 09:30–10:30 en Bogotá. I-30a
 * lo compara carácter por carácter contra el create() real en cada ejecución: no se edita a mano.
 */
export const MENSAJE_23P01_CREATE = [
  '',
  'Invalid `prisma.solicitud.create()` invocation:',
  '',
  '',
  'Error occurred during query execution:',
  'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"Solicitud_sin_traslape_ca06_cabina\\"", severity: "ERROR", detail: Some("Key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-27 14:30:00\\",\\"2026-10-27 15:30:00\\")) conflicts with existing key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-27 14:00:00\\",\\"2026-10-27 15:00:00\\"))."), column: None, hint: None }), transient: false })',
].join('\n');

/**
 * (b) create traslapado → 23P01 de la restricción GLOBAL de la Fase 4 (sondeo 4.2, original).
 * Contract 7A.8: esa restricción ya no existe; se conserva como caso NEGATIVO del detector.
 */
export const MENSAJE_23P01_CREATE_GLOBAL = [
  '',
  'Invalid `prisma.solicitud.create()` invocation:',
  '',
  '',
  'Error occurred during query execution:',
  'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"Solicitud_sin_traslape_ca06\\"", severity: "ERROR", detail: Some("Key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:30:00\\",\\"2026-10-14 16:30:00\\")) conflicts with existing key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:00:00\\",\\"2026-10-14 16:00:00\\"))."), column: None, hint: None }), transient: false })',
].join('\n');

/** (d) update que reactiva una solicitud Rechazado → 23P01 de la restricción GLOBAL (Fase 4; escenario retirado por D1). */
export const MENSAJE_23P01_UPDATE = [
  '',
  'Invalid `prisma.solicitud.update()` invocation:',
  '',
  '',
  'Error occurred during query execution:',
  'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"Solicitud_sin_traslape_ca06\\"", severity: "ERROR", detail: Some("Key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:15:00\\",\\"2026-10-14 15:45:00\\")) conflicts with existing key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:00:00\\",\\"2026-10-14 16:00:00\\"))."), column: None, hint: None }), transient: false })',
].join('\n');

/** (d3) $transaction([update estado, create log]) reactivando una Rechazado → 23P01 de la restricción GLOBAL (Fase 4). */
export const MENSAJE_23P01_TRANSACCION = [
  '',
  'Invalid `prisma.solicitud.update()` invocation:',
  '',
  '',
  'Error in batch request 0: Error occurred during query execution:',
  'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"Solicitud_sin_traslape_ca06\\"", severity: "ERROR", detail: Some("Key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:15:00\\",\\"2026-10-14 15:45:00\\")) conflicts with existing key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:00:00\\",\\"2026-10-14 16:00:00\\"))."), column: None, hint: None }), transient: false })',
].join('\n');

/**
 * (5.2b) updateMany traslapado dentro de una $transaction INTERACTIVA → 23P01.
 * Capturado por la integración I-9 (transaccion-interactiva.int-spec.ts), que lo
 * compara carácter por carácter en cada ejecución: no se edita a mano. Fase 7 · 7A.8: con la
 * restricción de la cabina (la corrida del 2026-10-26 ya lo confirmó: solo cambiaba el nombre).
 */
export const MENSAJE_23P01_TX_INTERACTIVA = [
  '',
  'Invalid `prisma.solicitud.updateMany()` invocation:',
  '',
  '',
  'Error occurred during query execution:',
  'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"Solicitud_sin_traslape_ca06_cabina\\"", severity: "ERROR", detail: Some("Key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-27 14:30:00\\",\\"2026-10-27 15:30:00\\")) conflicts with existing key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-27 14:00:00\\",\\"2026-10-27 15:00:00\\"))."), column: None, hint: None }), transient: false })',
].join('\n');

/** (e) create con fin < inicio → 23514 de Solicitud_fechas_validas_check. */
export const MENSAJE_23514_CHECK = [
  '',
  'Invalid `prisma.solicitud.create()` invocation:',
  '',
  '',
  'Error occurred during query execution:',
  'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23514", message: "new row for relation \\"Solicitud\\" violates check constraint \\"Solicitud_fechas_validas_check\\"", severity: "ERROR", detail: Some("Failing row contains (EC-E, u-exp, VIDEO, sondeo EC-E, null, 2026-10-15 16:00:00, 2026-10-15 15:00:00, null, null, Recibido, f)."), column: None, hint: None }), transient: false })',
].join('\n');

/** Error real de Prisma con el mensaje dado (la misma clase que lanza el cliente). */
export function errorDesconocidoDePrisma(mensaje: string): Prisma.PrismaClientUnknownRequestError {
  return new Prisma.PrismaClientUnknownRequestError(mensaje, {
    clientVersion: VERSION_PRISMA_DEL_SONDEO,
  });
}

/** Escapa un texto como lo hace el formato Debug de Rust dentro de un string. */
export function comoDebugDeRust(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Reemplaza un ancla que debe aparecer EXACTAMENTE una vez (lección 6 de la
 * Fase 3): si el ancla no está o se repite, el caso derivado sería falso.
 */
export function reemplazarUnaVez(texto: string, ancla: string, nuevo: string): string {
  const apariciones = texto.split(ancla).length - 1;
  if (apariciones !== 1) {
    throw new Error(`El ancla aparece ${apariciones} veces (se esperaba 1): ${ancla}`);
  }
  return texto.replace(ancla, () => nuevo);
}
