import { CategoriaSolicitud, PrismaClient, SubEspacio } from '@prisma/client';
import { ENLACE_MAXIMO } from '../../src/common/validadores/enlace-seguro.decorator';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import {
  ENLACES_ACEPTADOS,
  ENLACES_RECHAZADOS_POR_EL_MOTOR,
  ENLACES_RECHAZADOS_SOLO_POR_EL_DTO,
  enlaceDeLongitud,
} from '../utils/casos-enlace';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 9 · R9-1 · migración 20261109110000_enlace_anexo contra PostgreSQL REAL.
 *  - I-38a: ALINEACIÓN. La columna y su CHECK de formato, validado desde su creación.
 *  - I-38b: el MOTOR por sí mismo, y la dirección DTO ⊆ CHECK medida.
 *  - I-38c: el SERVICIO radica con y sin anexo.
 */
const USUARIO = 'uuid-integracion-anexo';
const RESTRICCION = 'Solicitud_enlace_anexo_formato_check';
const AHORA = new Date('2026-10-05T10:00:00-05:00');
const ANEXO = 'https://drive.google.com/file/d/xyz/view?usp=sharing';

describe('Anexo del solicitante contra PostgreSQL real (integración · Fase 9 · R9-1)', () => {
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
      data: { id_usuario: USUARIO, nombre: 'Integración', correo: 'anexo@prueba.local', rol: 'SOLICITANTE' },
    });
  });

  /** Inserta saltándose el servicio y el pipe: solo el motor decide. */
  const insertar = (enlaceAnexo: string | null) =>
    prisma.solicitud.create({
      data: {
        radicado: 'EC-INT-ANEXO',
        id_usuario: USUARIO,
        categoria: CategoriaSolicitud.PODCAST,
        proposito: 'Inserción directa (anexo)',
        fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
        estado: 'Recibido',
        sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
        enlace_anexo: enlaceAnexo,
      },
    });

  /** El mensaje del error del motor nombra la restricción violada (23514). */
  const violaLaRestriccion = async (operacion: Promise<unknown>): Promise<boolean> => {
    try {
      await operacion;
    } catch (error: unknown) {
      return error instanceof Error && error.message.includes(RESTRICCION);
    }
    throw new Error('Se esperaba un rechazo del motor');
  };

  it('I-38a · la columna es text y admite NULL; su CHECK de formato existe y nace VALIDADO', async () => {
    const columna = await prisma.$queryRaw<{ tipo: string; admite_nulo: string }[]>`
      SELECT data_type AS tipo, is_nullable AS admite_nulo
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Solicitud' AND column_name = 'enlace_anexo'`;
    expect(columna).toEqual([{ tipo: 'text', admite_nulo: 'YES' }]);

    const restricciones = await prisma.$queryRaw<{ conname: string; convalidated: boolean }[]>`
      SELECT conname, convalidated FROM pg_constraint
      WHERE conrelid = '"Solicitud"'::regclass AND contype = 'c' AND conname LIKE '%anexo%'
      ORDER BY conname`;
    expect(restricciones).toEqual([{ conname: RESTRICCION, convalidated: true }]);
  });

  it('I-38b · acepta NULL: el anexo es opcional', async () => {
    await insertar(null);
    expect(await prisma.solicitud.count()).toBe(1);
  });

  it.each(ENLACES_ACEPTADOS)('I-38b · acepta %s', async (enlace) => {
    await insertar(enlace);
    expect(await prisma.solicitud.count()).toBe(1);
  });

  it(`I-38b · acepta exactamente ${ENLACE_MAXIMO} caracteres`, async () => {
    await insertar(enlaceDeLongitud(ENLACE_MAXIMO));
    expect(await prisma.solicitud.count()).toBe(1);
  });

  it.each(ENLACES_RECHAZADOS_POR_EL_MOTOR)('I-38b · el motor rechaza por sí mismo: %s', async (_caso, enlace) => {
    expect(await violaLaRestriccion(insertar(enlace))).toBe(true);
  });

  it(`I-38b · el motor rechaza ${ENLACE_MAXIMO + 1} caracteres`, async () => {
    expect(await violaLaRestriccion(insertar(enlaceDeLongitud(ENLACE_MAXIMO + 1)))).toBe(true);
  });

  it.each(ENLACES_RECHAZADOS_SOLO_POR_EL_DTO)(
    'I-38b · DTO ⊆ CHECK: el motor ACEPTA %s (solo el pipe lo detiene)',
    async (_caso, enlace) => {
      await insertar(enlace);
      expect(await prisma.solicitud.count()).toBe(1);
    },
  );

  it('I-38c · el servicio radica con anexo y lo guarda tal cual; sin anexo, NULL', async () => {
    const service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
    const pedido = {
      categoria: CategoriaSolicitud.PODCAST,
      proposito: 'Pódcast con guion adjunto',
      fecha_inicio: new Date('2099-01-15T09:00:00-05:00'),
      fecha_fin: new Date('2099-01-15T10:00:00-05:00'),
    };

    const conAnexo = await service.create({ ...pedido, enlace_anexo: ANEXO }, USUARIO);
    expect(conAnexo.enlace_anexo).toBe(ANEXO);

    // Otra franja: las dos ocupan el estudio completo y CA-06 rechazaría el cruce.
    const sinAnexo = await service.create(
      {
        ...pedido,
        fecha_inicio: new Date('2099-01-15T10:00:00-05:00'),
        fecha_fin: new Date('2099-01-15T11:00:00-05:00'),
      },
      USUARIO,
    );
    expect(sinAnexo.enlace_anexo).toBeNull();
  });
});
