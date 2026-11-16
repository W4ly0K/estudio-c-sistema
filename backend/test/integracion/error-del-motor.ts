/**
 * Fase 9 · H8b-3 · SQLSTATE e identificadores citados de un error del motor, tal como lo entrega Prisma 5.22.
 *
 * No depende de la CLASE de la excepción: Prisma no expone un código tipado para el 23514 (Bitácora 4.2 · H1) y la
 * clase puede cambiar entre versiones. Lee el `message` de cualquier Error, que en Prisma 5.22 lleva el
 * ConnectorError en formato Debug de Rust (oráculo: MENSAJE_23514_CHECK de errores-postgres.fixture.ts):
 *   PostgresError { code: "23514", message: "new row for relation \"Solicitud\" violates check constraint \"X\"", …
 *
 * - Solo recorre el campo message del PostgresError: `(?:[^"\\]|\\.)*` no cruza una comilla real, y los datos de la
 *   fila viajan en `detail`, siempre escapados (\"), así que no pueden imitar un nombre.
 * - No depende del idioma de PostgreSQL (lc_messages): devuelve TODOS los identificadores citados (la tabla y la
 *   restricción) y quien llama decide cuáles son restricciones comparándolos con pg_constraint.
 * - Es ESTRICTO: si el mensaje no trae exactamente un PostgresError reconocible, errorDelMotor devuelve null y
 *   exigirErrorDelMotor falla de forma visible. Nunca se adivina un SQLSTATE.
 * Módulo puro, sin base de datos: error-del-motor.spec.ts lo prueba contra los mensajes reales capturados.
 */
export interface ErrorDelMotor {
  readonly sqlstate: string;
  readonly citados: readonly string[];
}

const CAMPOS_DEL_MOTOR = /PostgresError \{ code: "([0-9A-Z]{5})", message: "((?:[^"\\]|\\.)*)"/;
const IDENTIFICADOR_CITADO = /\\"((?:[^"\\]|\\[^"])*)\\"/g;
const APERTURA_DEL_MOTOR = 'PostgresError {';

/** El SQLSTATE y los identificadores citados, o null si el error no trae exactamente un PostgresError reconocible. */
export function errorDelMotor(error: unknown): ErrorDelMotor | null {
  if (!(error instanceof Error)) return null;
  // Más de uno sería ambiguo (no se sabe cuál decide): se trata como formato no reconocido.
  if (error.message.split(APERTURA_DEL_MOTOR).length - 1 !== 1) return null;
  const campos = CAMPOS_DEL_MOTOR.exec(error.message);
  if (campos === null) return null;
  const [, sqlstate, mensaje] = campos;
  return { sqlstate, citados: Array.from(mensaje.matchAll(IDENTIFICADOR_CITADO), (citado) => citado[1]) };
}

/**
 * Como errorDelMotor, pero un formato no reconocido FALLA de forma visible. El mensaje no copia el del error
 * original (podría traer el host o datos de la fila): solo su nombre de clase o su tipo.
 */
export function exigirErrorDelMotor(error: unknown): ErrorDelMotor {
  const leido = errorDelMotor(error);
  if (leido === null) {
    const origen = error instanceof Error ? error.name : typeof error;
    throw new Error(
      `Formato de error del motor no reconocido (${origen}): no se puede leer el SQLSTATE. Si cambió Prisma, recaptura el oráculo.`,
    );
  }
  return leido;
}
