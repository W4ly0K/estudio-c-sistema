import { CategoriaSolicitud, Prisma, PrismaClient, RolUsuario } from '@prisma/client';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';
import type { PrismaService } from '../../src/prisma/prisma.service';
import {
  MOTIVO_REPROGRAMACION_MAXIMO,
  MOTIVO_REPROGRAMACION_MINIMO,
} from '../../src/solicitudes/dto/proponer-reprogramacion.dto';
import { SELECT_DETALLE_SOLICITANTE } from '../../src/solicitudes/proyecciones/detalle-solicitud.proyeccion';
import { ESTADOS, TRANSICIONES, type Estado } from '../../src/solicitudes/reglas/maquina-estados';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 6.1b · motivo de la reprogramación (CA-10, K7) contra PostgreSQL REAL.
 * Migración 20261009200000_motivo_reprogramacion: la columna
 * Log_Auditoria.motivo_reprogramacion y dos CHECK con nombre propio, para que el
 * 23514 diga exactamente qué regla se rompió.
 *  - R1 según estado: hay motivo si y solo si el log registra T5 (destino Pendiente).
 *  - R2 longitud:     entre 10 y 500 caracteres sin los espacios de los extremos.
 * Cada caso de violación está construido para romper UNA sola regla. I-24 recorre
 * las rutas reales del servicio (T5 → T7 y T5 → T8).
 */
const R = Object.freeze({
  longitud: 'Log_Auditoria_motivo_reprogramacion_longitud_check',
  segunEstado: 'Log_Auditoria_motivo_reprogramacion_segun_estado_check',
} as const);

/** Los literales se derivan de la máquina (destinos de T2 y T5), nunca se repiten a mano. */
function destinoDe(id: 'T2' | 'T5'): Estado {
  const transicion = TRANSICIONES.find((t) => t.id === id);
  if (!transicion) throw new Error(`La máquina de estados no define ${id}`);
  return transicion.destino;
}
const PENDIENTE = destinoDe('T5');
const RECHAZADO = destinoDe('T2');
const OTROS_ESTADOS = ESTADOS.filter((estado) => estado !== PENDIENTE);

const AHORA = new Date('2026-10-05T10:00:00-05:00'); // lunes, 10:00 en Bogotá
const STAFF = 'uuid-staff-mr';
const SOLICITANTE = 'uuid-solicitante-mr';
const USUARIO_SOLICITANTE: UsuarioAutenticado = Object.freeze({
  id: SOLICITANTE,
  correo: 'solicitante-mr@prueba.local',
  rol: RolUsuario.SOLICITANTE,
});
const RADICADO = 'EC-MR-1';
const MOTIVO_VALIDO = 'Mantenimiento preventivo del set de grabación';

describe('Motivo de la reprogramación contra PostgreSQL real (integración · Fase 6.1b)', () => {
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
        { id_usuario: STAFF, nombre: 'Staff MR', correo: 'staff-mr@prueba.local', rol: RolUsuario.STAFF },
        { id_usuario: SOLICITANTE, nombre: 'Solicitante MR', correo: USUARIO_SOLICITANTE.correo, rol: RolUsuario.SOLICITANTE },
      ],
    });
    // Las restricciones son del log: el estado de la solicitud no interviene.
    await prisma.solicitud.create({
      data: {
        radicado: RADICADO,
        id_usuario: SOLICITANTE,
        categoria: CategoriaSolicitud.PODCAST,
        proposito: 'Inserción directa del motivo de reprogramación',
        fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
        estado: 'Validado',
      },
    });
  });

  /** Inserta el log saltándose el servicio: solo el motor decide. */
  const registrarLog = (estadoNuevo: string, motivo: string | null) =>
    prisma.log_Auditoria.create({
      data: {
        radicado_solicitud: RADICADO,
        estado_anterior: 'Validado',
        estado_nuevo: estadoNuevo,
        modificado_por: STAFF,
        motivo_reprogramacion: motivo,
        // Fase 6.5b: un log hacia Rechazado exige su propio motivo de rechazo. Se le da uno
        // válido para que cada caso siga rompiendo UNA sola regla (la de este archivo).
        motivo_rechazo: estadoNuevo === RECHAZADO ? 'Motivo de rechazo válido del ensayo' : null,
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

  it('I-20 · ALINEACIÓN: las dos restricciones instaladas, validadas y con la definición exacta', async () => {
    const restricciones = await prisma.$queryRaw<{ conname: string; convalidated: boolean; definicion: string }[]>`
      SELECT conname, convalidated, pg_get_constraintdef(oid) AS definicion
      FROM pg_constraint
      WHERE conrelid = '"Log_Auditoria"'::regclass AND contype = 'c'
      ORDER BY conname`;
    const delMotivo = restricciones.filter((r) => r.conname.startsWith('Log_Auditoria_motivo_reprogramacion_'));

    // PostgreSQL normaliza la expresión (BETWEEN pasa a >= AND <=, el literal lleva
    // ::text); la comparación es exacta a propósito. Los límites salen del DTO: si el
    // código y la migración divergen, esta prueba falla.
    const [MIN, MAX] = [MOTIVO_REPROGRAMACION_MINIMO, MOTIVO_REPROGRAMACION_MAXIMO];
    expect(ESTADOS).toContain(PENDIENTE);
    expect(delMotivo).toEqual([
      {
        conname: R.longitud,
        convalidated: true,
        definicion:
          `CHECK (((char_length(btrim(motivo_reprogramacion)) >= ${MIN}) AND ` +
          `(char_length(btrim(motivo_reprogramacion)) <= ${MAX})))`,
      },
      {
        conname: R.segunEstado,
        convalidated: true,
        definicion: `CHECK (((motivo_reprogramacion IS NOT NULL) = (estado_nuevo = '${PENDIENTE}'::text)))`,
      },
    ]);
  });

  it(`I-21 · R1: un log a ${PENDIENTE} sin motivo → 23514 y no se escribe`, async () => {
    const error = await capturar(registrarLog(PENDIENTE, null));

    esperarViolacion(error, R.segunEstado);
    expect(await prisma.log_Auditoria.count()).toBe(0);
  });

  it.each(OTROS_ESTADOS)('I-22 · R1: un motivo válido en un log hacia "%s" (no es T5) → 23514', async (estado) => {
    const error = await capturar(registrarLog(estado, MOTIVO_VALIDO));

    esperarViolacion(error, R.segunEstado);
    expect(await prisma.log_Auditoria.count()).toBe(0);
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', ' '.repeat(12)],
    ['9 caracteres entre espacios', `   ${'x'.repeat(9)}   `],
    ['9 emojis (9 caracteres reales, 18 unidades de JavaScript)', '🎬'.repeat(9)],
    ['501 caracteres', 'x'.repeat(501)],
  ])('I-23a · R2: motivo %s en un log de T5 → 23514', async (_caso, motivo) => {
    const error = await capturar(registrarLog(PENDIENTE, motivo));

    esperarViolacion(error, R.longitud);
    expect(await prisma.log_Auditoria.count()).toBe(0);
  });

  it('I-23b · R2: los límites exactos se aceptan (10 y 500 caracteres; 10 emojis; espacios en los extremos)', async () => {
    const motivos = ['x'.repeat(10), 'x'.repeat(500), '🎬'.repeat(10), `  ${'x'.repeat(10)}  `];

    for (const motivo of motivos) {
      await registrarLog(PENDIENTE, motivo);
    }

    expect(await prisma.log_Auditoria.count({ where: { motivo_reprogramacion: { not: null } } })).toBe(motivos.length);
  });

  describe('I-24 · rutas reales del servicio: el motivo se registra en T5 y sobrevive a la respuesta', () => {
    let service: SolicitudesService;
    // Miércoles 28-oct, 14:00–15:00: hábil, dentro del bloque de la tarde y libre.
    const propuesta = {
      fecha_inicio: new Date('2026-10-28T14:00:00-05:00'),
      fecha_fin: new Date('2026-10-28T15:00:00-05:00'),
      motivo: MOTIVO_VALIDO,
    };

    beforeEach(async () => {
      service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
      await service.proponerReprogramacion(RADICADO, propuesta, STAFF);
    });

    /** Historial por destino (no por fecha: dos logs pueden compartir el mismo instante). */
    const logs = () =>
      prisma.log_Auditoria.findMany({
        where: { radicado_solicitud: RADICADO },
        select: { estado_nuevo: true, motivo_reprogramacion: true },
      });

    const esperarHistorial = async (destinoRespuesta: string): Promise<void> => {
      expect(await logs()).toEqual(
        expect.arrayContaining([
          { estado_nuevo: PENDIENTE, motivo_reprogramacion: MOTIVO_VALIDO },
          { estado_nuevo: destinoRespuesta, motivo_reprogramacion: null },
        ]),
      );
      expect(await prisma.log_Auditoria.count()).toBe(2);

      // B3/B4: la proyección del solicitante entrega el motivo en su línea de vida.
      const detalle = await prisma.solicitud.findUniqueOrThrow({
        where: { radicado: RADICADO },
        select: SELECT_DETALLE_SOLICITANTE,
      });
      expect(detalle.logs.find((log) => log.estado_nuevo === PENDIENTE)?.motivo_reprogramacion).toBe(MOTIVO_VALIDO);
    };

    it('I-24a · T5 → T7: aceptar conserva el motivo en el log de la propuesta', async () => {
      await service.aceptarReprogramacion(RADICADO, USUARIO_SOLICITANTE);

      await esperarHistorial('Validado');
    });

    it('I-24b · T5 → T8: rechazar conserva el motivo en el log de la propuesta', async () => {
      await service.rechazarReprogramacion(RADICADO, USUARIO_SOLICITANTE);

      await esperarHistorial('Cancelado por el Usuario');
    });
  });
});
