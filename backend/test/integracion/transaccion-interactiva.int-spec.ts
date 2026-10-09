import { CategoriaSolicitud, Prisma, PrismaClient } from '@prisma/client';
import { esViolacionDeTraslapeCa06 } from '../../src/solicitudes/errores/traslape-ca06';
import { MENSAJE_23P01_TX_INTERACTIVA } from '../utils/errores-postgres.fixture';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 5.2b · experimento previo contra PostgreSQL REAL (riesgo R2 y Decisión D5).
 * update() pasará a una transacción INTERACTIVA ($transaction(async (tx) => …)) con
 * compare-and-set. Antes de tocar el servicio se mide:
 *  - I-9: un 23P01 lanzado DENTRO de una transacción interactiva sigue siendo
 *    reconocible por el detector (clase + firma) y revierte lo ya escrito.
 *  - I-10: la semántica real del compare-and-set en READ COMMITTED: dos updateMany
 *    concurrentes con el mismo estado esperado → exactamente uno actualiza.
 */
const USUARIO = 'uuid-integracion';
const bogota = (dia: string, hhmm: string): Date => new Date(`2026-10-${dia}T${hhmm}:00-05:00`);

describe('Transacción interactiva y compare-and-set contra PostgreSQL real (integración · Fase 5.2b)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeIntegracion();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await vaciarTablas(prisma);
    await prisma.usuario.create({
      data: { id_usuario: USUARIO, nombre: 'Integración', correo: 'integracion@prueba.local', rol: 'STAFF' },
    });
  });

  /** Inserta saltándose el servicio: solo el motor decide. */
  const insertar = (radicado: string, dia: string, desde: string, hasta: string) =>
    prisma.solicitud.create({
      data: {
        radicado,
        id_usuario: USUARIO,
        categoria: CategoriaSolicitud.VIDEO,
        proposito: 'Inserción directa',
        fecha_inicio: bogota(dia, desde),
        fecha_fin: bogota(dia, hasta),
        estado: 'Recibido',
      },
    });

  const capturar = async (operacion: Promise<unknown>): Promise<unknown> => {
    try {
      await operacion;
    } catch (error: unknown) {
      return error;
    }
    throw new Error('Se esperaba un rechazo del motor');
  };

  it('I-9 · CANARIO transacción interactiva: el 23P01 de updateMany es reconocible y revierte el log ya escrito', async () => {
    await insertar('EC-INT-A', '27', '09:00', '10:00');
    await insertar('EC-INT-B', '27', '11:00', '12:00');

    const error = await capturar(
      prisma.$transaction(async (tx) => {
        // El log se escribe ANTES a propósito: la prueba exige que el 23P01 lo revierta.
        await tx.log_Auditoria.create({
          data: {
            radicado_solicitud: 'EC-INT-B',
            estado_anterior: 'Recibido',
            estado_nuevo: 'Validado',
            modificado_por: USUARIO,
          },
        });
        await tx.solicitud.updateMany({
          where: { radicado: 'EC-INT-B', estado: 'Recibido' },
          data: { estado: 'Validado', fecha_inicio: bogota('27', '09:30'), fecha_fin: bogota('27', '10:30') },
        });
      }),
    );

    // Oráculo para errores-postgres.fixture.ts: se imprime ANTES de las aserciones
    // para capturarlo aunque alguna falle.
    console.info(
      `I-9 · clase: ${error instanceof Error ? error.constructor.name : typeof error}\n` +
        (error instanceof Error ? error.message : String(error)),
    );
    expect(error).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    expect(esViolacionDeTraslapeCa06(error)).toBe(true);
    // El oráculo del fixture ES este mensaje: si Prisma o PostgreSQL cambian el formato, falla aquí.
    expect((error as Prisma.PrismaClientUnknownRequestError).message).toBe(MENSAJE_23P01_TX_INTERACTIVA);
    expect(await prisma.log_Auditoria.count()).toBe(0);
    expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-INT-B' } })).toMatchObject({
      estado: 'Recibido',
      fecha_inicio: bogota('27', '11:00'),
    });
  });

  it('I-10 · compare-and-set: dos updateMany concurrentes con el mismo estado esperado → exactamente uno gana', async () => {
    await insertar('EC-INT-C', '27', '09:00', '10:00');

    /** CAS dentro de una transacción interactiva; retiene el bloqueo de fila `retenerSeg` segundos. */
    const cas = (destino: string, retenerSeg: number) =>
      prisma.$transaction(async (tx) => {
        const inicio = Date.now();
        const { count } = await tx.solicitud.updateMany({
          where: { radicado: 'EC-INT-C', estado: 'Recibido' },
          data: { estado: destino },
        });
        const esperaMs = Date.now() - inicio;
        await tx.$queryRawUnsafe(`SELECT pg_sleep(${retenerSeg})::text AS espera`);
        return { destino, count, esperaMs };
      });

    const primera = cas('Validado', 2);
    await new Promise<void>((resolver) => setTimeout(resolver, 700));
    const segunda = cas('Rechazado', 0);
    const resultados = await Promise.all([primera, segunda]);

    // Si la segunda esperó ~1 s o más, chocó contra el bloqueo y re-evaluó su WHERE (EvalPlanQual).
    console.info(`I-10 · ${resultados.map((r) => `${r.destino}: count=${r.count}, espera=${r.esperaMs} ms`).join(' · ')}`);
    expect(resultados.map((r) => r.count).sort((a, b) => a - b)).toEqual([0, 1]);
    const ganador = resultados.find((r) => r.count === 1);
    expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-INT-C' } })).toMatchObject({
      estado: ganador?.destino,
    });
  });
});
