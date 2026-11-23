import { CategoriaSolicitud, Prisma, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { MOTIVO_RECHAZO_MAXIMO, MOTIVO_RECHAZO_MINIMO } from '../../src/solicitudes/dto/update-solicitude.dto';
import { SELECT_DETALLE_SOLICITANTE } from '../../src/solicitudes/proyecciones/detalle-solicitud.proyeccion';
import { ESTADOS, TRANSICIONES, type Estado, type IdTransicion } from '../../src/solicitudes/reglas/maquina-estados';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 6.5b · motivo del RECHAZO (T2, DE1) contra PostgreSQL REAL.
 * Migración 20261013120000_motivo_rechazo: dos CHECK con nombre propio sobre la columna
 * Log_Auditoria.motivo_rechazo (existente desde 0_init), para que el 23514 diga
 * exactamente qué regla se rompió.
 *  - R1 según estado: hay motivo si y solo si el log registra T2 (destino Rechazado).
 *    Es E5 llevado a la base.
 *  - R2 longitud:     entre 10 y 500 caracteres sin los espacios de los extremos.
 * Cada caso de violación está construido para romper UNA sola regla. I-29 recorre la
 * ruta real del servicio (PATCH · T2).
 */
const R = Object.freeze({
  longitud: 'Log_Auditoria_motivo_rechazo_longitud_check',
  segunEstado: 'Log_Auditoria_motivo_rechazo_segun_estado_check',
} as const);

/** Los literales se derivan de la máquina, nunca se repiten a mano. */
function destinoDe(id: IdTransicion): Estado {
  const transicion = TRANSICIONES.find((t) => t.id === id);
  if (!transicion) throw new Error(`La máquina de estados no define ${id}`);
  return transicion.destino;
}
const RECHAZADO = destinoDe('T2');
const PENDIENTE = destinoDe('T5');
const OTROS_ESTADOS = ESTADOS.filter((estado) => estado !== RECHAZADO);

const AHORA = new Date('2026-10-05T10:00:00-05:00'); // lunes, 10:00 en Bogotá
const STAFF = 'uuid-staff-mrz';
const SOLICITANTE = 'uuid-solicitante-mrz';
const RADICADO = 'EC-MRZ-1';
const MOTIVO_VALIDO = 'El set de grabación está en mantenimiento esa semana';

describe('Motivo del rechazo contra PostgreSQL real (integración · Fase 6.5b)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeIntegracion();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await vaciarTablas(prisma);
    await prisma.usuario.createMany({
      data: [
        { id_usuario: STAFF, nombre: 'Staff MRZ', correo: 'staff-mrz@prueba.local', rol: RolUsuario.STAFF },
        { id_usuario: SOLICITANTE, nombre: 'Solicitante MRZ', correo: 'solicitante-mrz@prueba.local', rol: RolUsuario.SOLICITANTE },
      ],
    });
    // En Recibido: origen de T2, para que I-29 recorra la ruta real. Las restricciones son
    // del log: en los casos de inserción directa el estado de la solicitud no interviene.
    await prisma.solicitud.create({
      data: {
        radicado: RADICADO,
        id_usuario: SOLICITANTE,
        categoria: CategoriaSolicitud.PODCAST,
        proposito: 'Inserción directa del motivo de rechazo',
        fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
        estado: 'Recibido',
        sub_espacio: SubEspacio.ESTUDIO_COMPLETO, // Fase 7 · contract (7A.8): sin DEFAULT
      },
    });
  });

  /** Inserta el log saltándose el servicio: solo el motor decide. */
  const registrarLog = (estadoNuevo: string, motivo: string | null) =>
    prisma.log_Auditoria.create({
      data: {
        radicado_solicitud: RADICADO,
        estado_anterior: 'Recibido',
        estado_nuevo: estadoNuevo,
        modificado_por: STAFF,
        motivo_rechazo: motivo,
        // Un log hacia Pendiente exige su propio motivo (Fase 6.1b): se le da uno válido
        // para que cada caso rompa UNA sola regla (la de este archivo).
        motivo_reprogramacion: estadoNuevo === PENDIENTE ? 'Motivo de reprogramación válido del ensayo' : null,
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

  /** Restricciones del motivo nombradas en el error. Se exige exactamente una por caso. */
  const violadas = (error: unknown): string[] => {
    const mensaje = error instanceof Error ? error.message : String(error);
    return Object.values(R).filter((nombre) => mensaje.includes(nombre));
  };

  const esperarViolacion = (error: unknown, restriccion: string): void => {
    expect(error).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    expect((error as Prisma.PrismaClientUnknownRequestError).message).toContain('23514');
    expect(violadas(error)).toEqual([restriccion]);
  };

  it('I-25 · ALINEACIÓN: las dos restricciones instaladas, validadas y con la definición exacta', async () => {
    const restricciones = await prisma.$queryRaw<{ conname: string; convalidated: boolean; definicion: string }[]>`
      SELECT conname, convalidated, pg_get_constraintdef(oid) AS definicion
      FROM pg_constraint
      WHERE conrelid = '"Log_Auditoria"'::regclass AND contype = 'c'
      ORDER BY conname`;
    const delMotivo = restricciones.filter((r) => r.conname.startsWith('Log_Auditoria_motivo_rechazo_'));

    // PostgreSQL normaliza la expresión (BETWEEN pasa a >= AND <=, el literal lleva
    // ::text); la comparación es exacta a propósito. Los límites salen del DTO y el
    // literal, del destino de T2: si el código y la migración divergen, esta prueba falla.
    const [MIN, MAX] = [MOTIVO_RECHAZO_MINIMO, MOTIVO_RECHAZO_MAXIMO];
    expect(ESTADOS).toContain(RECHAZADO);
    expect(delMotivo).toEqual([
      {
        conname: R.longitud,
        convalidated: true,
        definicion:
          `CHECK (((char_length(btrim(motivo_rechazo)) >= ${MIN}) AND ` +
          `(char_length(btrim(motivo_rechazo)) <= ${MAX})))`,
      },
      {
        conname: R.segunEstado,
        convalidated: true,
        definicion: `CHECK (((motivo_rechazo IS NOT NULL) = (estado_nuevo = '${RECHAZADO}'::text)))`,
      },
    ]);
  });

  it(`I-26 · R1: un log a ${RECHAZADO} sin motivo → 23514 y no se escribe`, async () => {
    const error = await capturar(registrarLog(RECHAZADO, null));

    esperarViolacion(error, R.segunEstado);
    expect(await prisma.log_Auditoria.count()).toBe(0);
  });

  it.each(OTROS_ESTADOS)('I-27 · R1: un motivo válido en un log hacia "%s" (no es T2) → 23514', async (estado) => {
    const error = await capturar(registrarLog(estado, MOTIVO_VALIDO));

    esperarViolacion(error, R.segunEstado);
    expect(await prisma.log_Auditoria.count()).toBe(0);
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', ' '.repeat(12)],
    ['9 caracteres entre espacios', `   ${'x'.repeat(9)}   `],
    ['5 emojis (5 caracteres reales, 10 unidades de JavaScript)', '🎬'.repeat(5)],
    ['501 caracteres', 'x'.repeat(501)],
  ])('I-28a · R2: motivo %s en un log de T2 → 23514', async (_caso, motivo) => {
    const error = await capturar(registrarLog(RECHAZADO, motivo));

    esperarViolacion(error, R.longitud);
    expect(await prisma.log_Auditoria.count()).toBe(0);
  });

  it('I-28b · R2: los límites exactos se aceptan (10 y 500 caracteres; 10 emojis; espacios en los extremos)', async () => {
    const motivos = ['x'.repeat(10), 'x'.repeat(500), '🎬'.repeat(10), `  ${'x'.repeat(10)}  `];

    for (const motivo of motivos) {
      await registrarLog(RECHAZADO, motivo);
    }

    expect(await prisma.log_Auditoria.count({ where: { motivo_rechazo: { not: null } } })).toBe(motivos.length);
  });

  it('I-29 · ruta real del servicio: T2 registra el motivo y la proyección del solicitante lo entrega', async () => {
    const service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));

    await service.update(RADICADO, { estado: RECHAZADO, motivo_rechazo: MOTIVO_VALIDO }, STAFF);

    expect(
      await prisma.log_Auditoria.findMany({
        where: { radicado_solicitud: RADICADO },
        select: { estado_anterior: true, estado_nuevo: true, modificado_por: true, motivo_rechazo: true },
      }),
    ).toEqual([{ estado_anterior: 'Recibido', estado_nuevo: RECHAZADO, modificado_por: STAFF, motivo_rechazo: MOTIVO_VALIDO }]);

    // B3: la línea de vida del solicitante muestra el motivo del rechazo.
    const detalle = await prisma.solicitud.findUniqueOrThrow({
      where: { radicado: RADICADO },
      select: SELECT_DETALLE_SOLICITANTE,
    });
    expect(detalle.estado).toBe(RECHAZADO);
    expect(detalle.logs.map((log) => log.motivo_rechazo)).toEqual([MOTIVO_VALIDO]);
  });
});
