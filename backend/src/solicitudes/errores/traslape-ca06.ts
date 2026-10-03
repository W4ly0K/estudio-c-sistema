import { Prisma } from '@prisma/client';

/**
 * Nombre de la restricción de exclusión que garantiza CA-06 en PostgreSQL
 * (migración "ca06_sin_traslape", Fase 4). Fuente única: la firma de detección
 * se construye a partir de esta constante.
 */
export const RESTRICCION_CA06 = 'Solicitud_sin_traslape_ca06';

/**
 * Firma del 23P01 de NUESTRA restricción dentro del mensaje de Prisma 5.22.
 * Prisma no expone un código tipado para este error (Bitácora 4.2 · H1): llega
 * como PrismaClientUnknownRequestError con un ConnectorError en formato Debug
 * de Rust:   code: "23P01", message: "... \"Solicitud_sin_traslape_ca06\""
 *
 * - `(?:[^"\\]|\\.)*` recorre SOLO el campo message: no puede cruzar una
 *   comilla real. Los datos del usuario (que viajan en el DETAIL) siempre llegan
 *   escapados (\"), así que no pueden imitar la firma.
 * - No depende del texto en inglés de PostgreSQL (lc_messages).
 * - El `\\""` final exige que el nombre termine ahí (descarta sufijos como _v2).
 */
const FIRMA_CA06 = new RegExp(
  `code: "23P01", message: "(?:[^"\\\\]|\\\\.)*\\\\"${RESTRICCION_CA06}\\\\""`,
);

/**
 * ¿El error es la violación de CA-06 detectada por el motor (condición de carrera)?
 * Fail-closed: cualquier otro error devuelve false y sigue su camino normal.
 */
export function esViolacionDeTraslapeCa06(error: unknown): boolean {
  // La confianza viene de la CLASE del error (lo lanzó Prisma), no del texto.
  if (!(error instanceof Prisma.PrismaClientUnknownRequestError)) {
    return false;
  }
  return FIRMA_CA06.test(error.message);
}
