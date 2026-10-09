import { CategoriaSolicitud, Prisma, PrismaClient, RolUsuario } from '@prisma/client';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';
import { esViolacionDeTraslapeCa06 } from '../../src/solicitudes/errores/traslape-ca06';
import { ESTADOS, TRANSICIONES, type Estado } from '../../src/solicitudes/reglas/maquina-estados';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 5.5b · invariante K9 de la reprogramación (CA-10) contra PostgreSQL REAL.
 * Migración 20261008120000_k9_propuesta_coherente: tres CHECK con nombre propio para
 * que el 23514 diga exactamente qué regla se rompió.
 *  - M1 completa:      las dos fechas de la propuesta existen juntas o ninguna.
 *  - M2 según estado:  hay propuesta si y solo si el estado es Pendiente de Reprogramación.
 *  - M3 fechas:        fecha_propuesta_fin > fecha_propuesta_inicio.
 * Cada caso de violación está construido para romper UNA sola regla.
 */
const K9 = Object.freeze({
  completa: 'Solicitud_propuesta_completa_check',
  segunEstado: 'Solicitud_propuesta_segun_estado_check',
  fechas: 'Solicitud_propuesta_fechas_validas_check',
} as const);

/** El literal de M2 se deriva de la máquina (destino de T5), nunca se repite a mano. */
function destinoDe(id: 'T5'): Estado {
  const transicion = TRANSICIONES.find((t) => t.id === id);
  if (!transicion) throw new Error(`La máquina de estados no define ${id}`);
  return transicion.destino;
}
const PENDIENTE = destinoDe('T5');

const AHORA = new Date('2026-10-05T10:00:00-05:00'); // lunes, 10:00 en Bogotá
const STAFF = 'uuid-staff-k9';
const SOLICITANTE: UsuarioAutenticado = Object.freeze({
  id: 'uuid-solicitante-k9',
  correo: 'solicitante-k9@prueba.local',
  rol: RolUsuario.SOLICITANTE,
});
const bogota = (dia: string, hhmm: string): Date => new Date(`2026-10-${dia}T${hhmm}:00-05:00`);

describe('Invariante K9 de la reprogramación contra PostgreSQL real (integración · Fase 5.5b)', () => {
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
        { id_usuario: STAFF, nombre: 'Staff K9', correo: 'staff-k9@prueba.local', rol: RolUsuario.STAFF },
        { id_usuario: SOLICITANTE.id, nombre: 'Solicitante K9', correo: SOLICITANTE.correo, rol: RolUsuario.SOLICITANTE },
      ],
    });
  });

  interface Fila {
    estado: string;
    propuestaInicio?: Date;
    propuestaFin?: Date;
  }

  /** Inserta saltándose el servicio: solo el motor decide. Franja oficial fija: 27-oct 09:00–10:00. */
  const insertar = (radicado: string, fila: Fila) =>
    prisma.solicitud.create({
      data: {
        radicado,
        id_usuario: SOLICITANTE.id,
        categoria: CategoriaSolicitud.VIDEO,
        proposito: 'Inserción directa K9',
        fecha_inicio: bogota('27', '09:00'),
        fecha_fin: bogota('27', '10:00'),
        fecha_propuesta_inicio: fila.propuestaInicio ?? null,
        fecha_propuesta_fin: fila.propuestaFin ?? null,
        estado: fila.estado,
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

  /** Restricciones K9 nombradas en el error. Se exige exactamente una por caso. */
  const violadas = (error: unknown): string[] => {
    const mensaje = error instanceof Error ? error.message : String(error);
    return Object.values(K9).filter((nombre) => mensaje.includes(nombre));
  };

  const esperarViolacion = (error: unknown, restriccion: string): void => {
    expect(error).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    expect((error as Prisma.PrismaClientUnknownRequestError).message).toContain('23514');
    expect(violadas(error)).toEqual([restriccion]);
  };

  it('I-12 · ALINEACIÓN: las tres restricciones instaladas, validadas y con la definición exacta', async () => {
    const restricciones = await prisma.$queryRaw<{ conname: string; convalidated: boolean; definicion: string }[]>`
      SELECT conname, convalidated, pg_get_constraintdef(oid) AS definicion
      FROM pg_constraint
      WHERE conrelid = '"Solicitud"'::regclass AND contype = 'c'
      ORDER BY conname`;
    const deK9 = restricciones.filter((r) => r.conname.startsWith('Solicitud_propuesta_'));

    // PostgreSQL normaliza la expresión (paréntesis y ::text); la comparación es exacta a propósito.
    expect(ESTADOS).toContain(PENDIENTE);
    expect(deK9).toEqual([
      {
        conname: K9.completa,
        convalidated: true,
        definicion: 'CHECK (((fecha_propuesta_inicio IS NULL) = (fecha_propuesta_fin IS NULL)))',
      },
      {
        conname: K9.fechas,
        convalidated: true,
        definicion: 'CHECK ((fecha_propuesta_fin > fecha_propuesta_inicio))',
      },
      {
        conname: K9.segunEstado,
        convalidated: true,
        definicion: `CHECK (((estado = '${PENDIENTE}'::text) = (fecha_propuesta_inicio IS NOT NULL)))`,
      },
    ]);
  });

  it(`I-13 · M2: ${PENDIENTE} sin propuesta → 23514 (al insertar y al actualizar)`, async () => {
    const alInsertar = await capturar(insertar('EC-K9-A', { estado: PENDIENTE }));
    esperarViolacion(alInsertar, K9.segunEstado);

    await insertar('EC-K9-B', { estado: 'Validado' });
    const alActualizar = await capturar(
      prisma.solicitud.updateMany({ where: { radicado: 'EC-K9-B' }, data: { estado: PENDIENTE } }),
    );
    esperarViolacion(alActualizar, K9.segunEstado);
    expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-K9-B' } })).toMatchObject({ estado: 'Validado' });
  });

  it('I-14 · M2: propuesta completa fuera de Pendiente (Validado) → 23514', async () => {
    const error = await capturar(
      insertar('EC-K9-C', { estado: 'Validado', propuestaInicio: bogota('28', '14:00'), propuestaFin: bogota('28', '15:00') }),
    );

    esperarViolacion(error, K9.segunEstado);
  });

  it('I-15 · M1: media propuesta → 23514 (solo inicio en Pendiente; solo fin en Validado)', async () => {
    const soloInicio = await capturar(insertar('EC-K9-D', { estado: PENDIENTE, propuestaInicio: bogota('28', '14:00') }));
    const soloFin = await capturar(insertar('EC-K9-E', { estado: 'Validado', propuestaFin: bogota('28', '15:00') }));

    esperarViolacion(soloInicio, K9.completa);
    esperarViolacion(soloFin, K9.completa);
  });

  it('I-16 · M3: propuesta con fin = inicio o fin < inicio → 23514', async () => {
    const vacia = await capturar(
      insertar('EC-K9-F', { estado: PENDIENTE, propuestaInicio: bogota('28', '14:00'), propuestaFin: bogota('28', '14:00') }),
    );
    const invertida = await capturar(
      insertar('EC-K9-G', { estado: PENDIENTE, propuestaInicio: bogota('28', '15:00'), propuestaFin: bogota('28', '14:00') }),
    );

    esperarViolacion(vacia, K9.fechas);
    esperarViolacion(invertida, K9.fechas);
    expect(await prisma.solicitud.count()).toBe(0);
  });

  it('I-17 · CLASIFICACIÓN: el 23514 de K9 en una transacción interactiva NO es CA-06 y revierte el log', async () => {
    await insertar('EC-K9-H', { estado: 'Validado' });

    const error = await capturar(
      prisma.$transaction(async (tx) => {
        // El log se escribe ANTES a propósito: la prueba exige que el 23514 lo revierta.
        await tx.log_Auditoria.create({
          data: { radicado_solicitud: 'EC-K9-H', estado_anterior: 'Validado', estado_nuevo: PENDIENTE, modificado_por: STAFF },
        });
        await tx.solicitud.updateMany({
          where: { radicado: 'EC-K9-H', estado: 'Validado' },
          data: { estado: PENDIENTE }, // T5 a medias: sin propuesta
        });
      }),
    );

    esperarViolacion(error, K9.segunEstado);
    expect(esViolacionDeTraslapeCa06(error)).toBe(false);
    expect(await prisma.log_Auditoria.count()).toBe(0);
    expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-K9-H' } })).toMatchObject({
      estado: 'Validado',
      fecha_propuesta_inicio: null,
      fecha_propuesta_fin: null,
    });
  });

  describe('I-18 · las rutas legales del servicio respetan K9 sobre la base real', () => {
    let service: SolicitudesService;
    const propuesta = { fecha_inicio: bogota('28', '14:00'), fecha_fin: bogota('28', '15:00') };

    beforeEach(async () => {
      // Mismo patrón que I-1 (ca06.int-spec.ts): el cliente de integración en lugar de PrismaService.
      service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
      await insertar('EC-K9-S', { estado: 'Validado' });
      await service.proponerReprogramacion('EC-K9-S', propuesta, STAFF);
      expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-K9-S' } })).toMatchObject({
        estado: PENDIENTE,
        fecha_propuesta_inicio: propuesta.fecha_inicio,
        fecha_propuesta_fin: propuesta.fecha_fin,
      });
    });

    it('I-18a · T5 → T7: aceptar mueve la franja oficial y limpia la propuesta', async () => {
      await service.aceptarReprogramacion('EC-K9-S', SOLICITANTE);

      expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-K9-S' } })).toMatchObject({
        estado: 'Validado',
        fecha_inicio: propuesta.fecha_inicio,
        fecha_fin: propuesta.fecha_fin,
        fecha_propuesta_inicio: null,
        fecha_propuesta_fin: null,
      });
      expect(await prisma.log_Auditoria.count({ where: { radicado_solicitud: 'EC-K9-S' } })).toBe(2);
    });

    it('I-18b · T5 → T8: rechazar cancela y limpia la propuesta', async () => {
      await service.rechazarReprogramacion('EC-K9-S', SOLICITANTE);

      expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-K9-S' } })).toMatchObject({
        estado: 'Cancelado por el Usuario',
        fecha_inicio: bogota('27', '09:00'),
        fecha_propuesta_inicio: null,
        fecha_propuesta_fin: null,
      });
      expect(await prisma.log_Auditoria.count({ where: { radicado_solicitud: 'EC-K9-S' } })).toBe(2);
    });
  });
});
