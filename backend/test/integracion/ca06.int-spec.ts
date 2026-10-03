import { ConflictException, Logger } from '@nestjs/common';
import { CategoriaSolicitud, Prisma, PrismaClient } from '@prisma/client';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { CreateSolicitudeDto } from '../../src/solicitudes/dto/create-solicitude.dto';
import {
  esViolacionDeTraslapeCa06,
  MENSAJE_CA06,
  RESTRICCION_CA06,
} from '../../src/solicitudes/errores/traslape-ca06';
import { ESTADOS_QUE_LIBERAN_FRANJA } from '../../src/solicitudes/reglas/estados';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * CA-06 contra PostgreSQL REAL (Fase 4.6). Lo que ningún mock puede probar:
 * la carrera cerrada a través del servicio, el canario del formato del error
 * de Prisma y la alineación entre el código y la restricción instalada.
 */
const AHORA = new Date('2026-10-05T10:00:00-05:00'); // lunes, 10:00 en Bogotá
const USUARIO = 'uuid-integracion';
const bogota = (dia: string, hhmm: string): Date => new Date(`2026-10-${dia}T${hhmm}:00-05:00`);

describe('CA-06 contra PostgreSQL real (integración · Fase 4.6)', () => {
  let prisma: PrismaClient;
  let service: SolicitudesService;
  let idRecurso: number;
  let avisos: jest.SpyInstance;
  let azar: jest.SpyInstance;

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
    ({ id_recurso: idRecurso } = await prisma.recurso.create({ data: { nombre: 'Cámara', cantidad_total: 3 } }));
    service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    // Radicados distintos y deterministas: la colisión aleatoria del radicado
    // (backlog) no debe confundirse con un resultado de CA-06.
    let secuencia = 0;
    azar = jest.spyOn(Math, 'random').mockImplementation(() => (secuencia++ % 9000) / 9000);
  });

  afterEach(() => {
    avisos.mockRestore();
    azar.mockRestore();
  });

  const solicitud = (dia: string, desde: string, hasta: string, conRecurso = false): CreateSolicitudeDto => ({
    categoria: CategoriaSolicitud.VIDEO,
    proposito: 'Integración CA-06',
    fecha_inicio: bogota(dia, desde),
    fecha_fin: bogota(dia, hasta),
    ...(conRecurso ? { recursos: [{ id_recurso: idRecurso, cantidad: 1 }] } : {}),
  });

  /** Inserta saltándose el servicio: solo el motor decide. */
  const insertar = (radicado: string, dia: string, desde: string, hasta: string, estado = 'Recibido') =>
    prisma.solicitud.create({
      data: {
        radicado,
        id_usuario: USUARIO,
        categoria: CategoriaSolicitud.VIDEO,
        proposito: 'Inserción directa',
        fecha_inicio: bogota(dia, desde),
        fecha_fin: bogota(dia, hasta),
        estado,
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

  const separar = (resultados: PromiseSettledResult<unknown>[]) => ({
    exitos: resultados.filter((r) => r.status === 'fulfilled').length,
    rechazos: resultados.flatMap((r): unknown[] => (r.status === 'rejected' ? [r.reason] : [])),
  });

  const esConflictoCa06 = (error: unknown): boolean =>
    error instanceof ConflictException && error.message === MENSAJE_CA06;

  it('I-1 · 10 create() simultáneos sobre la misma franja → 1 creada y 9 con el 409 de CA-06', async () => {
    const { exitos, rechazos } = separar(
      await Promise.allSettled(Array.from({ length: 10 }, () => service.create(solicitud('27', '09:00', '10:00'), USUARIO))),
    );

    expect(exitos).toBe(1);
    expect(rechazos).toHaveLength(9);
    expect(rechazos.every(esConflictoCa06)).toBe(true);
    expect(await prisma.solicitud.count()).toBe(1);
    console.info(`I-1 · carreras resueltas por el motor (23P01): ${avisos.mock.calls.length} de 9`);
  });

  it('I-2 · CANARIO create: el 23P01 real de Prisma sigue siendo reconocible', async () => {
    await insertar('EC-INT-A', '27', '09:00', '10:00');

    const error = await capturar(insertar('EC-INT-B', '27', '09:30', '10:30'));

    expect(error).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    expect(esViolacionDeTraslapeCa06(error)).toBe(true);
  });

  it('I-3 · CANARIO update y $transaction: reactivar una Rechazado traslapada es reconocible y no deja logs', async () => {
    await insertar('EC-INT-A', '27', '09:00', '10:00');
    await insertar('EC-INT-R', '27', '09:30', '10:30', 'Rechazado');
    const reactivar = () =>
      prisma.solicitud.update({ where: { radicado: 'EC-INT-R' }, data: { estado: 'Recibido' } });

    const viaUpdate = await capturar(reactivar());
    const viaTransaccion = await capturar(
      prisma.$transaction([
        reactivar(),
        prisma.log_Auditoria.create({
          data: {
            radicado_solicitud: 'EC-INT-R',
            estado_anterior: 'Rechazado',
            estado_nuevo: 'Recibido',
            modificado_por: USUARIO,
          },
        }),
      ]),
    );

    expect(esViolacionDeTraslapeCa06(viaUpdate)).toBe(true);
    expect(esViolacionDeTraslapeCa06(viaTransaccion)).toBe(true);
    expect(await prisma.log_Auditoria.count()).toBe(0);
  });

  it('I-4 · un 23514 real (CHECK de fechas) NO se reconoce como CA-06', async () => {
    const error = await capturar(insertar('EC-INT-E', '27', '10:00', '09:00'));

    expect(error).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    expect((error as Prisma.PrismaClientUnknownRequestError).message).toContain('23514');
    expect(esViolacionDeTraslapeCa06(error)).toBe(false);
  });

  it('I-5 · 2 update() simultáneos que mueven solicitudes distintas a la misma franja → 1 y 1 con 409', async () => {
    await insertar('EC-INT-A', '27', '09:00', '10:00');
    await insertar('EC-INT-B', '27', '14:00', '15:00');

    const { exitos, rechazos } = separar(
      await Promise.allSettled(
        ['EC-INT-A', 'EC-INT-B'].map((radicado) =>
          service.update(radicado, { fecha_inicio: bogota('28', '09:00'), fecha_fin: bogota('28', '10:00') }, USUARIO),
        ),
      ),
    );

    expect(exitos).toBe(1);
    expect(rechazos).toHaveLength(1);
    expect(esConflictoCa06(rechazos[0])).toBe(true);
    expect(await prisma.solicitud.count({ where: { fecha_inicio: bogota('28', '09:00') } })).toBe(1);
  });

  it('I-6 · la restricción instalada coincide con RESTRICCION_CA06 y con ESTADOS_QUE_LIBERAN_FRANJA', async () => {
    const restricciones = await prisma.$queryRaw<{ conname: string; contype: string; definicion: string }[]>`
      SELECT conname, contype::text AS contype, pg_get_constraintdef(oid) AS definicion
      FROM pg_constraint
      WHERE conrelid = '"Solicitud"'::regclass AND contype IN ('c', 'x')
      ORDER BY conname`;
    const exclusiones = restricciones.filter((r) => r.contype === 'x');
    // PostgreSQL reescribe el NOT IN como "<> ALL (ARRAY[...])": se leen los literales del WHERE.
    const clausulaWhere = exclusiones[0]?.definicion.split('WHERE')[1] ?? '';
    const enLaBase = [...clausulaWhere.matchAll(/'([^']*)'/g)].map((m) => m[1]);

    expect(exclusiones.map((r) => r.conname)).toEqual([RESTRICCION_CA06]);
    expect(enLaBase.sort()).toEqual([...ESTADOS_QUE_LIBERAN_FRANJA].sort());
    expect(restricciones.some((r) => r.contype === 'c' && r.conname === 'Solicitud_fechas_validas_check')).toBe(true);
  });

  it('I-7 · frontera [inicio, fin) real: 9:00–10:00 y 10:00–11:00 conviven', async () => {
    await insertar('EC-INT-A', '27', '09:00', '10:00');
    await insertar('EC-INT-B', '27', '10:00', '11:00');

    expect(await prisma.solicitud.count()).toBe(2);
  });

  it('I-8 · tras una carrera con recursos anidados no quedan huérfanos en Solicitud_Recurso', async () => {
    await Promise.allSettled(
      Array.from({ length: 10 }, () => service.create(solicitud('27', '14:00', '15:00', true), USUARIO)),
    );

    const guardadas = await prisma.solicitud.findMany({ select: { radicado: true } });
    const detalles = await prisma.solicitud_Recurso.findMany({ select: { radicado_solicitud: true } });

    expect(guardadas).toHaveLength(1);
    expect(detalles).toEqual([{ radicado_solicitud: guardadas[0].radicado }]);
  });
});
