import type { PrismaClient } from '@prisma/client';

/**
 * Guardia de integración, capa 3: el centinela vive DENTRO de la base.
 * Solo la base desechable tiene la tabla guardia.bd_desechable (se crea a mano
 * una vez, ver README §4). Producción nunca la tendrá, así que ningún error de
 * configuración puede llevar un TRUNCATE hasta allá. Está en el esquema
 * "guardia" (no en "public") para que migrate diff no la vea como drift.
 */
export interface ConsultasCentinela {
  existeTabla(): Promise<boolean>;
  contarMarcas(): Promise<number>;
}

export const MENSAJE_SIN_CENTINELA =
  '⛔ Guardia de integración (capa 3): la base no tiene el centinela guardia.bd_desechable con al menos una fila. No es una base desechable.';

/** Lanza un error salvo que el centinela exista y tenga al menos una marca (fail-closed). */
export async function exigirCentinela(consultas: ConsultasCentinela): Promise<void> {
  if (!(await consultas.existeTabla())) throw new Error(MENSAJE_SIN_CENTINELA);
  if ((await consultas.contarMarcas()) < 1) throw new Error(MENSAJE_SIN_CENTINELA);
}

export function consultasCentinelaPrisma(prisma: PrismaClient): ConsultasCentinela {
  return {
    existeTabla: async () => {
      const filas = await prisma.$queryRaw<{ existe: boolean }[]>`
        SELECT to_regclass('guardia.bd_desechable') IS NOT NULL AS existe`;
      return filas[0]?.existe === true;
    },
    contarMarcas: async () => {
      const filas = await prisma.$queryRaw<{ marcas: bigint }[]>`
        SELECT count(*) AS marcas FROM guardia.bd_desechable`;
      return Number(filas[0]?.marcas ?? 0);
    },
  };
}
