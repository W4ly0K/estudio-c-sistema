import { BadRequestException } from '@nestjs/common';
import { CategoriaSolicitud, Prisma, PrismaClient, SubEspacio } from '@prisma/client';
import { MENSAJE_ENLACE_OBLIGATORIO, SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 8 · 8.6 · migración 20261028130000_enlace_entrega contra PostgreSQL REAL (requisito 4).
 *  - I-37a: ALINEACIÓN. La columna y los cuatro CHECK: tres validados y uno NOT VALID (DT-3).
 *  - I-37b: el MOTOR. Cada fila viola exactamente UNA regla, para que el nombre de la
 *    restricción en el error sea inequívoco.
 *  - I-37c: el SERVICIO. T12 con enlace lo guarda; sin enlace, 400 y la fila intacta.
 */
const USUARIO = 'uuid-integracion-enlace';
const AHORA = new Date('2026-10-26T08:00:00-05:00');
const ENLACE = 'https://youtu.be/abc123';
const { VIDEO, ESPACIOS } = CategoriaSolicitud;

describe('Enlace del producto final contra PostgreSQL real (integración · Fase 8 · 8.6)', () => {
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
      data: { id_usuario: USUARIO, nombre: 'Integración', correo: 'enlace@prueba.local', rol: 'STAFF' },
    });
  });

  /** Inserta saltándose el servicio: solo el motor decide. */
  const insertar = (cambios: Partial<Prisma.SolicitudUncheckedCreateInput> = {}) =>
    prisma.solicitud.create({
      data: {
        radicado: 'EC-INT-ENLACE',
        id_usuario: USUARIO,
        categoria: VIDEO,
        proposito: 'Inserción directa (enlace)',
        fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
        estado: 'Edición y postproducción',
        sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
        ...cambios,
      },
    });

  /** El mensaje del error del motor nombra la restricción violada (23514). */
  const violaLaRestriccion = async (operacion: Promise<unknown>, nombre: string): Promise<boolean> => {
    try {
      await operacion;
    } catch (error: unknown) {
      return error instanceof Error && error.message.includes(nombre);
    }
    throw new Error('Se esperaba un rechazo del motor');
  };

  it('I-37a · la columna admite NULL y los cuatro CHECK existen: tres validados y "Entregado exige enlace" NOT VALID', async () => {
    const columna = await prisma.$queryRaw<{ tipo: string; admite_nulo: string }[]>`
      SELECT data_type AS tipo, is_nullable AS admite_nulo
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Solicitud' AND column_name = 'enlace_entrega'`;
    expect(columna).toEqual([{ tipo: 'text', admite_nulo: 'YES' }]);

    const restricciones = await prisma.$queryRaw<{ conname: string; convalidated: boolean }[]>`
      SELECT conname, convalidated FROM pg_constraint
      WHERE conrelid = '"Solicitud"'::regclass AND contype = 'c'
        AND (conname LIKE '%enlace%' OR conname LIKE '%entrega%')
      ORDER BY conname`;
    expect(restricciones).toEqual([
      { conname: 'Solicitud_enlace_entrega_formato_check', convalidated: true },
      { conname: 'Solicitud_enlace_entrega_segun_categoria_check', convalidated: true },
      { conname: 'Solicitud_enlace_entrega_segun_estado_check', convalidated: true },
      { conname: 'Solicitud_entrega_con_enlace_check', convalidated: false },
    ]);
  });

  it('I-37b · el motor rechaza un enlace fuera de "Entregado"', async () => {
    expect(await violaLaRestriccion(insertar({ enlace_entrega: ENLACE }), 'Solicitud_enlace_entrega_segun_estado_check')).toBe(true);
  });

  it('I-37b · el motor rechaza un enlace en una categoría sin producto en línea (ESPACIOS)', async () => {
    const fila = insertar({ categoria: ESPACIOS, estado: 'Entregado', enlace_entrega: ENLACE });
    expect(await violaLaRestriccion(fila, 'Solicitud_enlace_entrega_segun_categoria_check')).toBe(true);
  });

  it('I-37b · el motor rechaza un enlace que no es https://', async () => {
    const fila = insertar({ estado: 'Entregado', enlace_entrega: 'http://youtu.be/abc123' });
    expect(await violaLaRestriccion(fila, 'Solicitud_enlace_entrega_formato_check')).toBe(true);
  });

  it('I-37b · NOT VALID no exime a las filas NUEVAS: un VIDEO entregado sin enlace se rechaza', async () => {
    const fila = insertar({ estado: 'Entregado' });
    expect(await violaLaRestriccion(fila, 'Solicitud_entrega_con_enlace_check')).toBe(true);
  });

  it('I-37b · un ESPACIOS entregado sin enlace sigue siendo válido', async () => {
    await insertar({ categoria: ESPACIOS, estado: 'Entregado' });
    expect(await prisma.solicitud.count()).toBe(1);
  });

  it('I-37c · T12 con enlace lo guarda; sin enlace responde 400 y la fila queda intacta', async () => {
    await insertar();

    const sinEnlace = service.update('EC-INT-ENLACE', { estado: 'Entregado' }, USUARIO);
    await expect(sinEnlace).rejects.toBeInstanceOf(BadRequestException);
    await expect(sinEnlace).rejects.toThrow(MENSAJE_ENLACE_OBLIGATORIO);
    expect(await prisma.solicitud.findUniqueOrThrow({ where: { radicado: 'EC-INT-ENLACE' } })).toMatchObject({
      estado: 'Edición y postproducción',
      enlace_entrega: null,
    });

    await service.update('EC-INT-ENLACE', { estado: 'Entregado', enlace_entrega: ENLACE }, USUARIO);
    expect(await prisma.solicitud.findUniqueOrThrow({ where: { radicado: 'EC-INT-ENLACE' } })).toMatchObject({
      estado: 'Entregado',
      enlace_entrega: ENLACE,
    });
  });
});
