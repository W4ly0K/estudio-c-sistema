import { PrismaClient } from '@prisma/client';
import { consultasCentinelaPrisma, exigirCentinela } from './centinela';

/**
 * Cliente de Prisma SOLO para la base de integración. La URL es explícita
 * (datasourceUrl) y además se fija DATABASE_URL en este proceso: Prisma carga
 * backend/.env al instanciarse, pero nunca sobrescribe una variable que ya
 * existe, así que producción no puede colarse por ese camino.
 */
export function crearPrismaDeIntegracion(): PrismaClient {
  const url = process.env.INTEGRACION_DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('Falta INTEGRACION_DATABASE_URL (usa npm run test:integracion).');
  }
  process.env.DATABASE_URL = url;
  return new PrismaClient({ datasourceUrl: url });
}

/** Vacía las tablas de la aplicación, SIEMPRE después de verificar el centinela. */
export async function vaciarTablas(prisma: PrismaClient): Promise<void> {
  await exigirCentinela(consultasCentinelaPrisma(prisma));
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Log_Auditoria", "Solicitud_Recurso", "Solicitud", "Recurso", "Usuario" RESTART IDENTITY CASCADE',
  );
}
