import { CategoriaSolicitud, PrismaClient, SubEspacio } from '@prisma/client';
import { ENLACE_MAXIMO } from '../../src/common/validadores/enlace-seguro.decorator';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import {
  ENLACES_ACEPTADOS,
  ENLACES_CODIFICADOS,
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
 *  - I-38d: la CATEGORÍA (pregunta 5, AN2b · H1): el motor solo admite anexo en PODCAST, VIDEO y
 *    STREAMING, NULL en todas, y el motor conserva el anexo ante una actualización directa del estado.
 */
const USUARIO = 'uuid-integracion-anexo';
const RESTRICCION = 'Solicitud_enlace_anexo_formato_check';
const RESTRICCION_CATEGORIA = 'Solicitud_enlace_anexo_segun_categoria_check';
const RESTRICCIONES_DEL_ANEXO = [RESTRICCION, RESTRICCION_CATEGORIA].sort();
const CATEGORIAS_CON_ANEXO: readonly CategoriaSolicitud[] = [
  CategoriaSolicitud.PODCAST,
  CategoriaSolicitud.VIDEO,
  CategoriaSolicitud.STREAMING,
];
const CATEGORIAS_SIN_ANEXO: readonly CategoriaSolicitud[] = [CategoriaSolicitud.ESPACIOS, CategoriaSolicitud.ASESORIAS];
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

  /** Inserta saltándose el servicio y el pipe: solo el motor decide. Una sola fila por caso (CA-06). */
  const insertar = (enlaceAnexo: string | null, categoria: CategoriaSolicitud = CategoriaSolicitud.PODCAST) =>
    prisma.solicitud.create({
      data: {
        radicado: 'EC-INT-ANEXO',
        id_usuario: USUARIO,
        categoria,
        proposito: 'Inserción directa (anexo)',
        fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
        estado: 'Recibido',
        sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
        enlace_anexo: enlaceAnexo,
      },
    });

  /**
   * El mensaje del error del motor nombra la restricción violada (23514). Exige además que NO nombre
   * la otra restricción del anexo: cada caso rompe una sola regla.
   */
  const violaLaRestriccion = async (operacion: Promise<unknown>, restriccion: string = RESTRICCION): Promise<boolean> => {
    try {
      await operacion;
    } catch (error: unknown) {
      if (!(error instanceof Error)) return false;
      const nombradas = RESTRICCIONES_DEL_ANEXO.filter((nombre) => error.message.includes(nombre));
      return nombradas.length === 1 && nombradas[0] === restriccion;
    }
    throw new Error('Se esperaba un rechazo del motor');
  };

  it('I-38a · la columna es text y admite NULL; sus dos CHECK (formato y categoría) existen y nacen VALIDADOS', async () => {
    const columna = await prisma.$queryRaw<{ tipo: string; admite_nulo: string }[]>`
      SELECT data_type AS tipo, is_nullable AS admite_nulo
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Solicitud' AND column_name = 'enlace_anexo'`;
    expect(columna).toEqual([{ tipo: 'text', admite_nulo: 'YES' }]);

    // Por nombre exacto: las dos de H1, de tipo CHECK y validadas desde su creación.
    const porNombre = await prisma.$queryRaw<{ conname: string; contype: string; convalidated: boolean }[]>`
      SELECT conname, contype::text AS contype, convalidated FROM pg_constraint
      WHERE conrelid = '"Solicitud"'::regclass AND conname::text = ANY(${RESTRICCIONES_DEL_ANEXO})
      ORDER BY conname`;
    expect(porNombre).toEqual(
      RESTRICCIONES_DEL_ANEXO.map((conname) => ({ conname, contype: 'c', convalidated: true })),
    );

    // Y ninguna otra restricción de Solicitud menciona el anexo en su nombre.
    const delAnexo = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = '"Solicitud"'::regclass AND conname LIKE '%anexo%'
      ORDER BY conname`;
    expect(delAnexo.map((r) => r.conname)).toEqual(RESTRICCIONES_DEL_ANEXO);
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

  // Fase 9 · H0: los controles codificados con % son texto ASCII. casos-enlace.ts los deja para que la
  // integración verifique que el motor también los acepta (el pipe ya los acepta).
  it.each(ENLACES_CODIFICADOS)('I-38b · el motor acepta el control codificado: %s', async (enlace) => {
    await insertar(enlace);
    expect(await prisma.solicitud.count()).toBe(1);
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

  it.each(CATEGORIAS_CON_ANEXO)('I-38d · %s acepta un anexo válido', async (categoria) => {
    await insertar(ANEXO, categoria);
    expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-INT-ANEXO' } })).toMatchObject({
      categoria,
      enlace_anexo: ANEXO,
    });
  });

  it.each(CATEGORIAS_SIN_ANEXO)('I-38d · %s: el motor rechaza un anexo no nulo por la regla de categoría', async (categoria) => {
    expect(await violaLaRestriccion(insertar(ANEXO, categoria), RESTRICCION_CATEGORIA)).toBe(true);
    expect(await prisma.solicitud.count()).toBe(0);
  });

  it.each([...CATEGORIAS_CON_ANEXO, ...CATEGORIAS_SIN_ANEXO])('I-38d · %s acepta enlace_anexo NULL', async (categoria) => {
    await insertar(null, categoria);
    expect(await prisma.solicitud.count()).toBe(1);
  });

  // Actualización directa del estado en PostgreSQL (Recibido → Validado), sin pasar por el servicio:
  // solo prueba que las restricciones del motor no obligan a borrar el anexo cuando cambia el estado.
  // No verifica la autorización, el flujo de negocio ni la auditoría de T1.
  it('I-38d · el motor conserva el anexo cuando el estado se actualiza directamente de Recibido a Validado', async () => {
    await insertar(ANEXO);
    await prisma.solicitud.update({ where: { radicado: 'EC-INT-ANEXO' }, data: { estado: 'Validado' } });
    expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-INT-ANEXO' } })).toMatchObject({
      estado: 'Validado',
      enlace_anexo: ANEXO,
    });
  });
});
