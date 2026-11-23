import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { consultasCentinelaPrisma, exigirCentinela, MENSAJE_SIN_CENTINELA, type ConsultasCentinela } from './centinela';
import { conexionesAVerificar, type RolDeConexion } from './conexiones-centinela';
import { evaluarEstadoDeMigraciones, H1, leerMigracionesLocales, type FilaMigracion, type MigracionLocal, type MigracionObligatoria } from './estado-migraciones';
import { evaluarGuardia, urlsDeConexionEnEnv } from './guardia-bd';

/**
 * Fase 9 · H8b-3 · globalSetup EXCLUSIVO de la suite I-46 (test/jest-integracion-h8b.json). A diferencia de
 * preparar-bd.ts, NO migra: comprueba y, si algo falla, lanza un error y Jest no ejecuta ninguna prueba.
 *
 * Orden:
 *   1. Capas 1 y 2 (evaluarGuardia, pura): la identidad de la base de pruebas es distinta de toda URL de backend/.env
 *      y coincide con INTEGRACION_CONFIRMO_DESECHABLE. Si falla, no se crea ninguna conexión.
 *   2. Capa 3 en CADA conexión (consultas y directa): el centinela guardia.bd_desechable con al menos una marca.
 *   3. Historial de migraciones, SOLO lectura: dentro de transacciones SET TRANSACTION READ ONLY (el motor rechaza
 *      cualquier escritura en ellas), por la conexión de consultas ya verificada.
 *   4. evaluarEstadoDeMigraciones (pura) contra el repositorio completo y H1.
 * No reutiliza verificarCentinelasYMigrar ni preparar-bd.ts: este módulo no tiene ningún paso de migración, ni
 * siquiera uno vacío. preparar-bd-sin-migrar.spec.ts lo comprueba también sobre el código fuente.
 * Ningún mensaje lleva URLs, credenciales ni la identidad de la base: del error del driver solo se conserva el código
 * de Prisma (P1001…), si lo hay.
 */
export interface ClienteSoloLectura {
  readonly centinela: ConsultasCentinela;
  /** Las filas de _prisma_migrations, o null si la tabla no existe. Solo lectura. */
  leerHistorial(): Promise<readonly FilaMigracion[] | null>;
  desconectar(): Promise<void>;
}

export interface DependenciasArranqueSinMigrar {
  /** INTEGRACION_DATABASE_URL e INTEGRACION_DIRECT_URL, sin vacías. */
  readonly urlsPrueba: readonly string[];
  /** Todas las URLs de conexión de backend/.env (vacía si no existe, p. ej. en CI). */
  readonly urlsProduccion: readonly string[];
  readonly confirmacion: string | undefined;
  readonly obligatorias: readonly MigracionObligatoria[];
  crearCliente(url: string): ClienteSoloLectura;
  migracionesLocales(): readonly MigracionLocal[];
  registrar(mensaje: string): void;
}

const PREFIJO = '⛔ Arranque sin migraciones (I-46):';
const CODIGO_PRISMA = /^P\d{4}$/;

function codigoSeguro(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'errorCode' in error) {
    const codigo = error.errorCode;
    if (typeof codigo === 'string' && CODIGO_PRISMA.test(codigo)) return codigo;
  }
  return null;
}

/** Error sin datos de conexión. El original no se encadena (cause) porque Node lo imprimiría. */
function errorSeguro(etapa: string, error: unknown): Error {
  if (error instanceof Error && error.message === MENSAJE_SIN_CENTINELA) {
    return new Error(`${MENSAJE_SIN_CENTINELA} Etapa: ${etapa}. No se ejecuta ninguna prueba.`);
  }
  const codigo = codigoSeguro(error);
  return new Error(`${PREFIJO} falló ${etapa}${codigo === null ? '' : ` (código ${codigo})`}. No se ejecuta ninguna prueba.`);
}

const etiqueta = (roles: readonly RolDeConexion[]): string => roles.join(' y ');

/** Crea el cliente, ejecuta `paso` y desconecta siempre. Cualquier fallo sale como errorSeguro(etapa). */
async function conCliente<T>(
  dependencias: DependenciasArranqueSinMigrar,
  url: string,
  etapa: string,
  paso: (cliente: ClienteSoloLectura) => Promise<T>,
): Promise<T> {
  let cliente: ClienteSoloLectura;
  try {
    cliente = dependencias.crearCliente(url);
  } catch (error: unknown) {
    throw errorSeguro(etapa, error);
  }
  try {
    return await paso(cliente);
  } catch (error: unknown) {
    throw errorSeguro(etapa, error);
  } finally {
    try {
      await cliente.desconectar();
    } catch {
      dependencias.registrar(`Aviso: no se pudo cerrar la conexión (${etapa}).`);
    }
  }
}

/** Las comprobaciones del arranque, en orden. Lanza ante el primer bloqueo; nunca repara ni migra. */
export async function verificarArranqueSinMigrar(dependencias: DependenciasArranqueSinMigrar): Promise<void> {
  // 1. Capas 1 y 2.
  const veredicto = evaluarGuardia({
    urlsPrueba: dependencias.urlsPrueba,
    urlsProduccion: dependencias.urlsProduccion,
    confirmacion: dependencias.confirmacion,
  });
  if (!veredicto.permitido) throw new Error(`${PREFIJO} ${veredicto.motivo}`);
  dependencias.registrar('Capas 1 y 2: base desechable identificada y confirmada.');

  // 2. Capa 3 en cada conexión, antes de cualquier otra consulta.
  const [urlConsultas, urlMigraciones = urlConsultas] = dependencias.urlsPrueba;
  for (const { roles, url } of conexionesAVerificar(urlConsultas, urlMigraciones)) {
    await conCliente(dependencias, url, `el centinela de la conexión de ${etiqueta(roles)}`, (cliente) =>
      exigirCentinela(cliente.centinela),
    );
    dependencias.registrar(`Capa 3: centinela verificado en la conexión de ${etiqueta(roles)}.`);
  }

  // 3 y 4. Historial en solo lectura y veredicto contra el repositorio completo.
  const historial = await conCliente(dependencias, urlConsultas, 'la lectura del historial de migraciones', (cliente) =>
    cliente.leerHistorial(),
  );
  let locales: readonly MigracionLocal[];
  try {
    locales = dependencias.migracionesLocales();
  } catch (error: unknown) {
    throw new Error(`${PREFIJO} ${error instanceof Error ? error.message : 'no se pudieron leer las migraciones del repositorio.'}`);
  }
  const estado = evaluarEstadoDeMigraciones({ locales, historial, obligatorias: dependencias.obligatorias });
  if (!estado.permitido) {
    throw new Error(`${PREFIJO} el esquema no está en el estado esperado. No se migra ni se repara:\n - ${estado.motivos.join('\n - ')}`);
  }
  dependencias.registrar(
    `Migraciones: las ${estado.aplicadas} del repositorio están aplicadas con su checksum, sin pendientes; H1 confirmada. No se migra.`,
  );
}

/** Cliente real: el centinela y el historial, este último dentro de transacciones de solo lectura. */
function crearClienteSoloLectura(url: string): ClienteSoloLectura {
  const prisma = new PrismaClient({ datasourceUrl: url });
  return {
    centinela: consultasCentinelaPrisma(prisma),
    leerHistorial: async () => {
      const [, tabla] = await prisma.$transaction([
        prisma.$executeRaw`SET TRANSACTION READ ONLY`,
        prisma.$queryRaw<{ existe: boolean }[]>`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS existe`,
      ]);
      if (tabla[0]?.existe !== true) return null;
      const [, filas] = await prisma.$transaction([
        prisma.$executeRaw`SET TRANSACTION READ ONLY`,
        prisma.$queryRaw<FilaMigracion[]>`SELECT migration_name AS nombre, checksum, finished_at IS NOT NULL AS terminada, rolled_back_at IS NOT NULL AS revertida FROM public._prisma_migrations`,
      ]);
      return filas;
    },
    desconectar: () => prisma.$disconnect(),
  };
}

export default async function prepararBdSinMigrar(): Promise<void> {
  const raizBackend = join(__dirname, '..', '..');
  const envProduccion = join(raizBackend, '.env');

  await verificarArranqueSinMigrar({
    urlsPrueba: [process.env.INTEGRACION_DATABASE_URL, process.env.INTEGRACION_DIRECT_URL].filter(
      (url): url is string => url !== undefined && url.trim() !== '',
    ),
    urlsProduccion: existsSync(envProduccion) ? urlsDeConexionEnEnv(readFileSync(envProduccion, 'utf8')) : [],
    confirmacion: process.env.INTEGRACION_CONFIRMO_DESECHABLE,
    obligatorias: [H1],
    crearCliente: crearClienteSoloLectura,
    migracionesLocales: () => leerMigracionesLocales(join(raizBackend, 'prisma', 'migrations')),
    registrar: (mensaje) => console.log(mensaje),
  });

  console.log('\n✅ Arranque sin migraciones superado: se ejecuta solo la suite I-46.\n');
}
