import { Prisma } from '@prisma/client';

/**
 * Lista CERRADA de las restricciones cuyo 23P01 es CA-06 (ADR-007 · SE2 y SE3): una de
 * exclusión por sub-espacio físico. "ESTUDIO_COMPLETO" entra en las dos, así que choca con
 * cualquier reserva.
 *
 * Contract (7A.8): la restricción global de la Fase 4 ("Solicitud_sin_traslape_ca06") ya no
 * existe en ninguna base y se retiró de la lista: un 23P01 con ese nombre ya no es CA-06.
 * Nunca se reconoce por prefijo: un nombre de la misma familia que no esté aquí
 * (p. ej. "..._ca06_v2") no es CA-06 (Decisión AC de ADR-004).
 */
export const RESTRICCIONES_CA06_POR_SUBESPACIO = [
  'Solicitud_sin_traslape_ca06_cabina',
  'Solicitud_sin_traslape_ca06_estudio',
] as const;

/** Fuente única de la firma de detección (hoy, exactamente las de los sub-espacios). */
export const RESTRICCIONES_CA06 = RESTRICCIONES_CA06_POR_SUBESPACIO;

/**
 * Único mensaje de CA-06 (409), lo detecte la consulta previa o el motor.
 * Minimización de datos: no revela el radicado, el horario ni ningún otro dato
 * de la reserva con la que se cruza.
 */
export const MENSAJE_CA06 =
  'Error CA-06: el horario seleccionado se cruza con otra reserva. Elige otra franja.';

/** Los nombres viajan dentro de una expresión regular: se escapan sus metacaracteres. */
function escaparParaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Firma del 23P01 de NUESTRAS restricciones dentro del mensaje de Prisma 5.22.
 * Prisma no expone un código tipado para este error (Bitácora 4.2 · H1): llega
 * como PrismaClientUnknownRequestError con un ConnectorError en formato Debug
 * de Rust:   code: "23P01", message: "... \"<restricción>\""
 *
 * - `(?:[^"\\]|\\.)*` recorre SOLO el campo message: no puede cruzar una
 *   comilla real. Los datos del usuario (que viajan en el DETAIL) siempre llegan
 *   escapados (\"), así que no pueden imitar la firma.
 * - No depende del texto en inglés de PostgreSQL (lc_messages).
 * - `(?:a|b)` es una alternancia de los nombres EXACTOS de la lista cerrada.
 * - El `\\""` final exige que el nombre termine ahí (descarta sufijos como _v2).
 */
const FIRMA_CA06 = new RegExp(
  `code: "23P01", message: "(?:[^"\\\\]|\\\\.)*\\\\"(?:${RESTRICCIONES_CA06.map(escaparParaRegex).join('|')})\\\\""`,
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
