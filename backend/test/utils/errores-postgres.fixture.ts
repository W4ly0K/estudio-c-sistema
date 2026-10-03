import { Prisma } from '@prisma/client';

/**
 * Mensajes REALES capturados en el sondeo de la Fase 4.2 (Prisma 5.22.0 +
 * PostgreSQL 17, base desechable). Son oráculos: no se editan a mano.
 * Si se actualiza Prisma, la prueba de integración (4.6) debe recapturarlos.
 */
export const VERSION_PRISMA_DEL_SONDEO = '5.22.0';

/** (b) create traslapado → 23P01 de Solicitud_sin_traslape_ca06. */
export const MENSAJE_23P01_CREATE = [
  '',
  'Invalid `prisma.solicitud.create()` invocation:',
  '',
  '',
  'Error occurred during query execution:',
  'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"Solicitud_sin_traslape_ca06\\"", severity: "ERROR", detail: Some("Key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:30:00\\",\\"2026-10-14 16:30:00\\")) conflicts with existing key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:00:00\\",\\"2026-10-14 16:00:00\\"))."), column: None, hint: None }), transient: false })',
].join('\n');

/** (d) update que reactiva una solicitud Rechazado → 23P01 de Solicitud_sin_traslape_ca06. */
export const MENSAJE_23P01_UPDATE = [
  '',
  'Invalid `prisma.solicitud.update()` invocation:',
  '',
  '',
  'Error occurred during query execution:',
  'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", message: "conflicting key value violates exclusion constraint \\"Solicitud_sin_traslape_ca06\\"", severity: "ERROR", detail: Some("Key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:15:00\\",\\"2026-10-14 15:45:00\\")) conflicts with existing key (tsrange(fecha_inicio, fecha_fin, \'[)\'::text))=([\\"2026-10-14 15:00:00\\",\\"2026-10-14 16:00:00\\"))."), column: None, hint: None }), transient: false })',
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
