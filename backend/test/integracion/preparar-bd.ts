import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { etiquetaDe, evaluarGuardia, urlsDeConexionEnEnv } from './guardia-bd';
import { consultasCentinelaPrisma, exigirCentinela } from './centinela';

/**
 * globalSetup de npm run test:integracion. Orden deliberado:
 *   1. Capas 1 y 2 (puras): identidad del proyecto y confirmación explícita.
 *   2. Capa 3: el centinela dentro de la base, ANTES de cualquier escritura.
 *   3. prisma migrate deploy con las URLs de PRUEBA solo para ese proceso hijo.
 */
export default async function prepararBd(): Promise<void> {
  const raizBackend = join(__dirname, '..', '..');
  const envProduccion = join(raizBackend, '.env');

  const urlsPrueba = [process.env.INTEGRACION_DATABASE_URL, process.env.INTEGRACION_DIRECT_URL].filter(
    (url): url is string => url !== undefined && url.trim() !== '',
  );
  const veredicto = evaluarGuardia({
    urlsPrueba,
    urlsProduccion: existsSync(envProduccion) ? urlsDeConexionEnEnv(readFileSync(envProduccion, 'utf8')) : [],
    confirmacion: process.env.INTEGRACION_CONFIRMO_DESECHABLE,
  });
  if (!veredicto.permitido) {
    throw new Error(`⛔ Guardia de integración: ${veredicto.motivo}`);
  }

  const [urlConsultas, urlMigraciones = urlConsultas] = urlsPrueba;
  const prisma = new PrismaClient({ datasourceUrl: urlConsultas });
  try {
    await exigirCentinela(consultasCentinelaPrisma(prisma));
  } finally {
    await prisma.$disconnect();
  }

  // Las variables del proceso hijo tienen prioridad sobre backend/.env (Prisma
  // no sobrescribe las que ya existen): migrate deploy solo ve la base de pruebas.
  execFileSync(
    process.execPath,
    [join(raizBackend, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    {
      cwd: raizBackend,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: urlConsultas, DIRECT_URL: urlMigraciones },
    },
  );

  console.log(`\n✅ Base de integración verificada (3 capas) y migrada: ${etiquetaDe(veredicto.identidad)}\n`);
}
