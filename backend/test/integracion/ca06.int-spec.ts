import { ConflictException, Logger } from '@nestjs/common';
import { CategoriaSolicitud, Prisma, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { CreateSolicitudeDto } from '../../src/solicitudes/dto/create-solicitude.dto';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';
import type { FranjaSolicitada } from '../../src/solicitudes/reglas/horario.validator';
import {
  esViolacionDeTraslapeCa06,
  MENSAJE_CA06,
  RESTRICCIONES_CA06_POR_SUBESPACIO,
} from '../../src/solicitudes/errores/traslape-ca06';
import { ESTADOS_QUE_LIBERAN_FRANJA } from '../../src/solicitudes/reglas/estados';
import {
  OCUPA,
  RESTRICCION_DEL_SUBESPACIO,
  SUB_ESPACIOS,
  type SubEspacioFisico,
} from '../../src/solicitudes/reglas/sub-espacios';
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
        // Fase 7 · contract (7A.8): sin DEFAULT. El completo, que es lo que antes ponía la columna.
        sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
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

  it('I-3 · CANARIO T7 por el servicio: la propuesta se ocupa tras la consulta previa → 409 de CA-06 resuelto por el motor y sin logs', async () => {
    // Fase 5.6 (N1): reemplaza el canario de la reactivación (D1 la eliminó) y de las
    // escrituras update() y $transaction([...]), que el servicio ya no usa. Hoy toda
    // escritura de estado pasa por la transacción interactiva con compare-and-set.
    const solicitante: UsuarioAutenticado = {
      id: 'uuid-solicitante-i3',
      correo: 'solicitante-i3@prueba.local',
      rol: RolUsuario.SOLICITANTE,
    };
    await prisma.usuario.create({
      data: { id_usuario: solicitante.id, nombre: 'Solicitante I-3', correo: solicitante.correo, rol: RolUsuario.SOLICITANTE },
    });
    await prisma.solicitud.create({
      data: {
        radicado: 'EC-INT-P',
        id_usuario: solicitante.id,
        categoria: CategoriaSolicitud.VIDEO,
        proposito: 'Canario T7',
        fecha_inicio: bogota('27', '14:00'),
        fecha_fin: bogota('27', '15:00'),
        fecha_propuesta_inicio: bogota('28', '09:00'),
        fecha_propuesta_fin: bogota('28', '10:00'),
        estado: 'Pendiente de Reprogramación',
        // Fase 7 · contract (7A.8): sin DEFAULT, y M4 exige el lugar de la propuesta (el mismo).
        sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
        sub_espacio_propuesto: SubEspacio.ESTUDIO_COMPLETO,
      },
    });

    // Punto de prueba (tipado explícito, sin any): la consulta previa responde con la
    // verdad ("libre") y JUSTO DESPUÉS otra solicitud confirma esa franja. Es el instante
    // exacto entre la verificación y la escritura; solo el motor puede cerrarlo.
    const capaAmable = service as unknown as {
      hayTraslape: (franja: FranjaSolicitada, excluirRadicado?: string) => Promise<boolean>;
    };
    const consultaReal = capaAmable.hayTraslape.bind(service);
    const respuestasPrevias: boolean[] = [];
    jest.spyOn(capaAmable, 'hayTraslape').mockImplementationOnce(async (franja, excluirRadicado) => {
      const ocupada = await consultaReal(franja, excluirRadicado);
      respuestasPrevias.push(ocupada);
      await insertar('EC-INT-O', '28', '09:30', '10:30');
      return ocupada;
    });

    const error = await capturar(service.aceptarReprogramacion('EC-INT-P', solicitante));

    expect(respuestasPrevias).toEqual([false]);
    expect(esConflictoCa06(error)).toBe(true);
    expect(
      avisos.mock.calls.some(([mensaje]: unknown[]) => String(mensaje).includes('restricción del motor')),
    ).toBe(true);
    expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-INT-P' } })).toMatchObject({
      estado: 'Pendiente de Reprogramación',
      fecha_inicio: bogota('27', '14:00'),
      fecha_propuesta_inicio: bogota('28', '09:00'),
      fecha_propuesta_fin: bogota('28', '10:00'),
    });
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

  it('I-6 · las dos restricciones instaladas (Fase 7 · SE2) coinciden con sub-espacios.ts y con ESTADOS_QUE_LIBERAN_FRANJA', async () => {
    const restricciones = await prisma.$queryRaw<
      { conname: string; contype: string; convalidated: boolean; definicion: string }[]
    >`
      SELECT conname, contype::text AS contype, convalidated, pg_get_constraintdef(oid) AS definicion
      FROM pg_constraint
      WHERE conrelid = '"Solicitud"'::regclass AND contype IN ('c', 'x')
      ORDER BY conname`;
    const exclusiones = restricciones.filter((r) => r.contype === 'x');

    // La global de la Fase 4 ya no existe: solo una por sub-espacio físico.
    expect(exclusiones.map((r) => r.conname)).toEqual([...RESTRICCIONES_CA06_POR_SUBESPACIO].sort());
    for (const [fisico, nombre] of Object.entries(RESTRICCION_DEL_SUBESPACIO) as [SubEspacioFisico, string][]) {
      const instalada = exclusiones.find((r) => r.conname === nombre);
      expect(instalada?.convalidated).toBe(true);
      // PostgreSQL reescribe el NOT IN como "<> ALL (ARRAY[...])" y el IN como "= ANY (ARRAY[...])":
      // los literales se distinguen por su tipo (::text los estados, ::"SubEspacio" los sub-espacios).
      const clausulaWhere = instalada?.definicion.split('WHERE')[1] ?? '';
      const estados = [...clausulaWhere.matchAll(/'([^']*)'::text/g)].map((m) => m[1]);
      const subEspacios = [...clausulaWhere.matchAll(/'([^']*)'::"SubEspacio"/g)].map((m) => m[1]);

      expect(estados.sort()).toEqual([...ESTADOS_QUE_LIBERAN_FRANJA].sort());
      expect(subEspacios.sort()).toEqual(SUB_ESPACIOS.filter((opcion) => OCUPA[opcion].includes(fisico)).sort());
    }
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

  /**
   * Fase 7 · I-30 · CANARIO del detector contra las restricciones REALES por sub-espacio
   * (ADR-007 SE2 y SE3). En 7A.1 se probaba renombrando la global; desde 7A.3 las dos
   * existen y el 23P01 sale del motor tal cual. El caso del nombre ajeno (_v2) sí renombra,
   * dentro de una transacción que se revierte entera (el DDL de PostgreSQL es transaccional).
   */
  describe('I-30 · CANARIO Fase 7: el 23P01 de cada sub-espacio físico es CA-06; un nombre ajeno, no', () => {
    const datosDirectos = (
      radicado: string,
      desde: string,
      hasta: string,
      subEspacio: SubEspacio,
    ): Prisma.SolicitudUncheckedCreateInput => ({
      radicado,
      id_usuario: USUARIO,
      categoria: CategoriaSolicitud.VIDEO,
      proposito: 'Canario de los nombres de la Fase 7',
      fecha_inicio: bogota('27', desde),
      fecha_fin: bogota('27', hasta),
      estado: 'Recibido',
      sub_espacio: subEspacio,
    });

    const FISICOS = Object.keys(RESTRICCION_DEL_SUBESPACIO) as SubEspacioFisico[];

    it.each(FISICOS)('I-30a · dos reservas traslapadas en %s → 23P01 de SU restricción, reconocido como CA-06', async (fisico) => {
      await prisma.solicitud.create({ data: datosDirectos('EC-INT-A', '09:00', '10:00', fisico) });

      const error = await capturar(prisma.solicitud.create({ data: datosDirectos('EC-INT-B', '09:30', '10:30', fisico) }));

      expect(error).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
      expect((error as Prisma.PrismaClientUnknownRequestError).message).toContain('23P01');
      expect((error as Prisma.PrismaClientUnknownRequestError).message).toContain(`${RESTRICCION_DEL_SUBESPACIO[fisico]}\\"`);
      expect(esViolacionDeTraslapeCa06(error)).toBe(true);
    });

    const CABINA = RESTRICCION_DEL_SUBESPACIO.CABINA_AUDIO;

    it('I-30b · la misma violación con la restricción renombrada a _v2 → NO es CA-06 (sin prefijo abierto)', async () => {
      const error = await capturar(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`ALTER TABLE "Solicitud" RENAME CONSTRAINT "${CABINA}" TO "${CABINA}_v2"`);
          await tx.solicitud.create({ data: datosDirectos('EC-INT-A', '09:00', '10:00', SubEspacio.CABINA_AUDIO) });
          await tx.solicitud.create({ data: datosDirectos('EC-INT-B', '09:30', '10:30', SubEspacio.CABINA_AUDIO) });
        }),
      );

      expect(error).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
      expect((error as Prisma.PrismaClientUnknownRequestError).message).toContain(`${CABINA}_v2\\"`);
      expect(esViolacionDeTraslapeCa06(error)).toBe(false);
    });

    it('I-30c · tras I-30b la transacción revirtió el renombre y los datos: siguen las dos restricciones y la tabla vacía', async () => {
      await capturar(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`ALTER TABLE "Solicitud" RENAME CONSTRAINT "${CABINA}" TO "${CABINA}_v2"`);
          await tx.solicitud.create({ data: datosDirectos('EC-INT-A', '09:00', '10:00', SubEspacio.CABINA_AUDIO) });
          await tx.solicitud.create({ data: datosDirectos('EC-INT-B', '09:30', '10:30', SubEspacio.CABINA_AUDIO) });
        }),
      );

      const exclusiones = await prisma.$queryRaw<{ conname: string }[]>`
        SELECT conname FROM pg_constraint
        WHERE conrelid = '"Solicitud"'::regclass AND contype = 'x'
        ORDER BY conname`;

      expect(exclusiones.map((r) => r.conname)).toEqual([...RESTRICCIONES_CA06_POR_SUBESPACIO].sort());
      expect(await prisma.solicitud.count()).toBe(0);
    });
  });
});
