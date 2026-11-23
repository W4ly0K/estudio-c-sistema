import { ConflictException } from '@nestjs/common';
import { CategoriaSolicitud, Prisma, PrismaClient, SubEspacio } from '@prisma/client';
import { esViolacionDeTraslapeCa06 } from '../../src/solicitudes/errores/traslape-ca06';
import { MENSAJE_EDICION_OBLIGATORIA, SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import { CATEGORIAS_CON_ENLACE } from '../../src/solicitudes/reglas/categorias';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 8 · 8.5 · migración 20261028120000_ca06_edicion_postproduccion contra PostgreSQL REAL
 * (requisito 3 del tutor; Opción A de H1).
 *  - I-36a y I-36b: el MOTOR. "Edición y postproducción" no ocupa; "Entregado" no ocupa en
 *    PODCAST y VIDEO y SÍ ocupa en las demás categorías.
 *  - I-36c: el escenario de H1 a través del SERVICIO: T11 libera, otra reserva toma el tiempo
 *    liberado y T12 entrega sin 23P01.
 *  - I-36d: T9 directo en VIDEO → 409 y la fila intacta.
 */
const USUARIO = 'uuid-integracion-edicion';
const AHORA = new Date('2026-10-26T08:00:00-05:00');
const bogota = (hhmm: string): Date => new Date(`2026-10-27T${hhmm}:00-05:00`);
const { CABINA_AUDIO, ESTUDIO_COMPLETO } = SubEspacio;
const { PODCAST, VIDEO, ESPACIOS, STREAMING, ASESORIAS } = CategoriaSolicitud;
/** Fase 8 · 8.6: desde la migración del enlace, una entrega de PODCAST, VIDEO o STREAMING lo exige. */
const ENLACE = 'https://youtu.be/abc123';
const enlaceDe = (categoria: CategoriaSolicitud): string | null => (CATEGORIAS_CON_ENLACE.includes(categoria) ? ENLACE : null);

describe('Edición y postproducción contra PostgreSQL real (integración · Fase 8 · 8.5)', () => {
  let prisma: PrismaClient;
  let service: SolicitudesService;

  beforeAll(() => {
    prisma = crearPrismaDeIntegracion();
    service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await vaciarTablas(prisma);
    await prisma.usuario.create({
      data: { id_usuario: USUARIO, nombre: 'Integración', correo: 'edicion@prueba.local', rol: 'STAFF' },
    });
  });

  /** Inserta saltándose el servicio: solo el motor decide. Martes 27, 9:00–11:00, Estudio completo. */
  const insertar = (radicado: string, cambios: Partial<Prisma.SolicitudUncheckedCreateInput> = {}) =>
    prisma.solicitud.create({
      data: {
        radicado,
        id_usuario: USUARIO,
        categoria: VIDEO,
        proposito: 'Inserción directa (edición)',
        fecha_inicio: bogota('09:00'),
        fecha_fin: bogota('11:00'),
        estado: 'En Producción',
        sub_espacio: ESTUDIO_COMPLETO,
        ...cambios,
      },
    });

  /** Otra reserva activa en la cabina, dentro de la misma franja. */
  const otraEnLaCabina = () =>
    insertar('EC-INT-OTRA', {
      categoria: ESPACIOS,
      estado: 'Validado',
      sub_espacio: CABINA_AUDIO,
      fecha_inicio: bogota('10:00'),
      fecha_fin: bogota('11:00'),
    });

  const capturar = async (operacion: Promise<unknown>): Promise<unknown> => {
    try {
      await operacion;
    } catch (error: unknown) {
      return error;
    }
    throw new Error('Se esperaba un rechazo');
  };

  it('I-36a · una solicitud en "Edición y postproducción" no ocupa la franja: otra reserva entra en ese tiempo', async () => {
    await insertar('EC-INT-ED', { estado: 'Edición y postproducción' });
    await otraEnLaCabina();

    expect(await prisma.solicitud.count()).toBe(2);
  });

  it.each([PODCAST, VIDEO])('I-36b · un "Entregado" de %s no ocupa la franja (ya la liberó en T11)', async (categoria) => {
    await insertar('EC-INT-ENT', { categoria, estado: 'Entregado', enlace_entrega: enlaceDe(categoria) });
    await otraEnLaCabina();

    expect(await prisma.solicitud.count()).toBe(2);
  });

  it.each([ESPACIOS, STREAMING, ASESORIAS])('I-36b · un "Entregado" de %s SIGUE ocupando la franja (23P01)', async (categoria) => {
    await insertar('EC-INT-ENT', { categoria, estado: 'Entregado', enlace_entrega: enlaceDe(categoria) });

    expect(esViolacionDeTraslapeCa06(await capturar(otraEnLaCabina()))).toBe(true);
    expect(await prisma.solicitud.count()).toBe(1);
  });

  it('I-36c · H1 a través del servicio: T11 libera, otra reserva toma el tiempo y T12 entrega sin 23P01', async () => {
    await insertar('EC-INT-VIDEO');

    await service.update('EC-INT-VIDEO', { estado: 'Edición y postproducción' }, USUARIO);
    await otraEnLaCabina();
    await service.update('EC-INT-VIDEO', { estado: 'Entregado', enlace_entrega: ENLACE }, USUARIO);

    expect(await prisma.solicitud.findUniqueOrThrow({ where: { radicado: 'EC-INT-VIDEO' } })).toMatchObject({
      estado: 'Entregado',
      enlace_entrega: ENLACE,
    });
    // Lección 4 de la Fase 7: dos logs en el mismo milisegundo no tienen un orden garantizado.
    const logs = await prisma.log_Auditoria.findMany({
      where: { radicado_solicitud: 'EC-INT-VIDEO' },
      select: { estado_anterior: true, estado_nuevo: true },
    });
    expect(logs).toHaveLength(2);
    expect(logs).toEqual(
      expect.arrayContaining([
        { estado_anterior: 'En Producción', estado_nuevo: 'Edición y postproducción' },
        { estado_anterior: 'Edición y postproducción', estado_nuevo: 'Entregado' },
      ]),
    );
  });

  it('I-36d · T9 directo en VIDEO → 409 de edición obligatoria y la fila queda intacta', async () => {
    await insertar('EC-INT-VIDEO');

    const error = await capturar(service.update('EC-INT-VIDEO', { estado: 'Entregado' }, USUARIO));

    expect(error instanceof ConflictException && error.message === MENSAJE_EDICION_OBLIGATORIA).toBe(true);
    expect(await prisma.solicitud.findUniqueOrThrow({ where: { radicado: 'EC-INT-VIDEO' } })).toMatchObject({
      estado: 'En Producción',
    });
    expect(await prisma.log_Auditoria.count()).toBe(0);
  });
});
