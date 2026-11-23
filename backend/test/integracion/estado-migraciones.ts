import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fase 9 · H8b-3 · Estado de las migraciones de la base desechable frente al repositorio, ANTES de permitir escrituras.
 *
 * Contrasta TODO el historial del repositorio (cada carpeta de prisma/migrations con su migration.sql) con
 * _prisma_migrations, y además exige las migraciones obligatorias (H1) con su checksum fijado. Fail-closed: cualquier
 * duda sobre el estado del esquema bloquea, y el veredicto nunca propone ni intenta reparar nada.
 *
 * evaluarEstadoDeMigraciones es pura (sin red, base ni process.env); estado-migraciones.spec.ts la prueba sin base.
 * leerMigracionesLocales solo lee archivos del repositorio.
 */

/** Una migración del repositorio y el SHA-256 de su migration.sql (lo mismo que Prisma guarda como checksum). */
export interface MigracionLocal {
  readonly nombre: string;
  readonly checksum: string;
}

/** Una fila de _prisma_migrations, reducida a lo que decide el estado. */
export interface FilaMigracion {
  readonly nombre: string;
  readonly checksum: string;
  readonly terminada: boolean;
  readonly revertida: boolean;
}

export interface MigracionObligatoria {
  readonly nombre: string;
  readonly checksum: string;
}

export interface EntradaEstadoMigraciones {
  readonly locales: readonly MigracionLocal[];
  /** null: la base no tiene _prisma_migrations. */
  readonly historial: readonly FilaMigracion[] | null;
  readonly obligatorias: readonly MigracionObligatoria[];
}

export type VeredictoMigraciones =
  | { readonly permitido: true; readonly aplicadas: number }
  | { readonly permitido: false; readonly motivos: readonly string[] };

/** H1: la migración consolidada de la Fase 9. Su checksum no cambia (ADR-009 §2.6). */
export const H1: MigracionObligatoria = Object.freeze({
  nombre: '20261109110000_enlace_anexo',
  checksum: '886aeb80aee4a2f48c474b9b55013c7768aa06394eb06e3cc97465282549f059',
});

// Prefijo numérico de orden y nombre: «0_init» (la línea base) y «20261109110000_enlace_anexo» lo cumplen.
const NOMBRE_DE_MIGRACION = /^\d+_[a-z0-9_]+$/;
const CHECKSUM_SHA256 = /^[0-9a-f]{64}$/;

/**
 * Veredicto sobre el estado del esquema. Reúne TODOS los motivos (no se detiene en el primero) para que un bloqueo se
 * pueda analizar de una vez. Reglas:
 *  - Sin _prisma_migrations o sin migraciones en el repositorio, el estado no se puede determinar.
 *  - Cada carpeta local debe tener un nombre reconocible, un checksum válido y no repetirse.
 *  - Cada fila debe estar terminada o revertida, nunca las dos cosas ni ninguna (incompleta o fallida).
 *    Una fila revertida (migrate resolve --rolled-back) es historia: no cuenta como aplicada.
 *  - Cada migración local debe estar aplicada exactamente una vez y con el mismo checksum que su archivo.
 *  - Ninguna migración aplicada puede faltar en el repositorio.
 *  - Cada obligatoria debe existir una vez en el repositorio y estar aplicada una vez, ambas con su checksum fijado.
 */
export function evaluarEstadoDeMigraciones(entrada: EntradaEstadoMigraciones): VeredictoMigraciones {
  const { locales, historial, obligatorias } = entrada;
  if (historial === null) {
    return { permitido: false, motivos: ['La base no tiene la tabla _prisma_migrations: no se puede determinar el estado del esquema.'] };
  }

  const motivos: string[] = [];
  if (locales.length === 0) motivos.push('No se encontraron migraciones en el repositorio.');

  const nombresLocales = new Set<string>();
  for (const local of locales) {
    if (!NOMBRE_DE_MIGRACION.test(local.nombre)) motivos.push(`Carpeta de migración con un nombre no reconocido: ${local.nombre}.`);
    if (!CHECKSUM_SHA256.test(local.checksum)) motivos.push(`Checksum local inválido: ${local.nombre}.`);
    if (nombresLocales.has(local.nombre)) motivos.push(`Migración repetida en el repositorio: ${local.nombre}.`);
    nombresLocales.add(local.nombre);
  }

  const aplicadas = new Map<string, FilaMigracion[]>();
  for (const fila of historial) {
    if (fila.terminada && fila.revertida) {
      motivos.push(`Estado ambiguo (terminada y revertida a la vez): ${fila.nombre}.`);
    } else if (!fila.terminada && !fila.revertida) {
      motivos.push(`Migración incompleta o fallida (ni terminada ni revertida): ${fila.nombre}.`);
    } else if (fila.terminada) {
      aplicadas.set(fila.nombre, [...(aplicadas.get(fila.nombre) ?? []), fila]);
    }
  }

  for (const local of locales) {
    const filas = aplicadas.get(local.nombre) ?? [];
    if (filas.length === 0) motivos.push(`Migración pendiente de aplicar: ${local.nombre}.`);
    else if (filas.length > 1) motivos.push(`Migración aplicada más de una vez (${filas.length}): ${local.nombre}.`);
    else if (filas[0].checksum !== local.checksum) motivos.push(`Checksum distinto entre la base y el archivo: ${local.nombre}.`);
  }

  for (const nombre of aplicadas.keys()) {
    if (!nombresLocales.has(nombre)) motivos.push(`Migración aplicada en la base que no está en el repositorio: ${nombre}.`);
  }

  if (obligatorias.length === 0) motivos.push('No se indicó ninguna migración obligatoria (se espera al menos H1).');
  for (const obligatoria of obligatorias) {
    const enRepositorio = locales.filter((local) => local.nombre === obligatoria.nombre);
    if (enRepositorio.length !== 1) {
      motivos.push(`${obligatoria.nombre} debe estar una vez en el repositorio y está ${enRepositorio.length}.`);
    } else if (enRepositorio[0].checksum !== obligatoria.checksum) {
      motivos.push(`El archivo de ${obligatoria.nombre} no tiene el checksum fijado.`);
    }
    const enLaBase = aplicadas.get(obligatoria.nombre) ?? [];
    if (enLaBase.length !== 1) {
      motivos.push(`${obligatoria.nombre} debe estar aplicada una vez y lo está ${enLaBase.length}.`);
    } else if (enLaBase[0].checksum !== obligatoria.checksum) {
      motivos.push(`${obligatoria.nombre} está aplicada con un checksum distinto del fijado.`);
    }
  }

  return motivos.length > 0 ? { permitido: false, motivos } : { permitido: true, aplicadas: locales.length };
}

/**
 * Las migraciones del repositorio: cada CARPETA de `carpeta` con el SHA-256 de su migration.sql (los bytes tal cual,
 * en LF por .gitattributes). Una carpeta sin migration.sql deja el estado ambiguo y lanza un error.
 */
export function leerMigracionesLocales(carpeta: string): MigracionLocal[] {
  return readdirSync(carpeta, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort()
    .map((nombre) => {
      const archivo = join(carpeta, nombre, 'migration.sql');
      if (!existsSync(archivo)) {
        throw new Error(`La carpeta de migración ${nombre} no tiene migration.sql: el estado del repositorio es ambiguo.`);
      }
      return { nombre, checksum: createHash('sha256').update(readFileSync(archivo)).digest('hex') };
    });
}
