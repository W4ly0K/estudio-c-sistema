import { CategoriaSolicitud, Prisma, PrismaClient, SubEspacio } from '@prisma/client';
import { esViolacionDeTraslapeCa06 } from '../../src/solicitudes/errores/traslape-ca06';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 7 · 7A.3 · migración 20261023120000_ca06_subespacios contra PostgreSQL REAL
 * (PRD v2.2 §5.1; ADR-007 SE1, SE2, SE7, NA1 y P-1).
 *  - I-31: ALINEACIÓN. Columnas, DEFAULT temporal y los seis CHECK del log, con la
 *    definición exacta que guarda el motor.
 *  - I-32: COMPORTAMIENTO del motor. La tabla del PRD §5.1 sin pasar por el servicio
 *    (el servicio usará el sub-espacio desde 7A.4).
 * El comportamiento completo de la API llega con la batería de 7A.6.
 */
const USUARIO = 'uuid-integracion-subespacios';
const bogota = (dia: string, hhmm: string): Date => new Date(`2026-10-${dia}T${hhmm}:00-05:00`);
const { CABINA_AUDIO, ESTUDIO_GRABACION, ESTUDIO_COMPLETO } = SubEspacio;

describe('Sub-espacios contra PostgreSQL real (integración · Fase 7 · 7A.3)', () => {
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
      data: { id_usuario: USUARIO, nombre: 'Integración', correo: 'subespacios@prueba.local', rol: 'STAFF' },
    });
  });

  const capturar = async (operacion: Promise<unknown>): Promise<unknown> => {
    try {
      await operacion;
    } catch (error: unknown) {
      return error;
    }
    throw new Error('Se esperaba un rechazo del motor');
  };

  /** Inserta saltándose el servicio: solo el motor decide. Sin sub-espacio usa el DEFAULT. */
  const insertar = (radicado: string, desde: string, hasta: string, cambios: Partial<Prisma.SolicitudUncheckedCreateInput> = {}) =>
    prisma.solicitud.create({
      data: {
        radicado,
        id_usuario: USUARIO,
        categoria: CategoriaSolicitud.VIDEO,
        proposito: 'Inserción directa (sub-espacios)',
        fecha_inicio: bogota('27', desde),
        fecha_fin: bogota('27', hasta),
        estado: 'Recibido',
        ...cambios,
      },
    });

  describe('I-31 · ALINEACIÓN de la migración', () => {
    it('I-31a · columnas nuevas: sub_espacio NOT NULL con el DEFAULT temporal; el resto admite NULL', async () => {
      const columnas = await prisma.$queryRaw<
        { tabla: string; columna: string; tipo: string; admite_nulo: string; por_defecto: string | null }[]
      >`
        SELECT table_name AS tabla, column_name AS columna, udt_name AS tipo,
               is_nullable AS admite_nulo, column_default AS por_defecto
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('sub_espacio', 'sub_espacio_propuesto', 'sub_espacio_anterior',
                              'sub_espacio_nuevo', 'fecha_inicio_anterior', 'fecha_fin_anterior')
        ORDER BY table_name, column_name`;

      expect(columnas).toEqual([
        { tabla: 'Log_Auditoria', columna: 'fecha_fin_anterior', tipo: 'timestamp', admite_nulo: 'YES', por_defecto: null },
        { tabla: 'Log_Auditoria', columna: 'fecha_inicio_anterior', tipo: 'timestamp', admite_nulo: 'YES', por_defecto: null },
        { tabla: 'Log_Auditoria', columna: 'sub_espacio_anterior', tipo: 'SubEspacio', admite_nulo: 'YES', por_defecto: null },
        { tabla: 'Log_Auditoria', columna: 'sub_espacio_nuevo', tipo: 'SubEspacio', admite_nulo: 'YES', por_defecto: null },
        {
          tabla: 'Solicitud',
          columna: 'sub_espacio',
          tipo: 'SubEspacio',
          admite_nulo: 'NO',
          // Expand (7A.3): se retira en el contract (7A.8) y esta línea cambiará a null a propósito.
          por_defecto: `'${ESTUDIO_COMPLETO}'::"SubEspacio"`,
        },
        { tabla: 'Solicitud', columna: 'sub_espacio_propuesto', tipo: 'SubEspacio', admite_nulo: 'YES', por_defecto: null },
      ]);
    });

    it('I-31b · los seis CHECK del log, instalados, validados y con la definición exacta', async () => {
      const restricciones = await prisma.$queryRaw<{ conname: string; convalidated: boolean; definicion: string }[]>`
        SELECT conname, convalidated, pg_get_constraintdef(oid) AS definicion
        FROM pg_constraint
        WHERE conrelid = '"Log_Auditoria"'::regclass AND contype = 'c'
          AND (conname LIKE 'Log\\_Auditoria\\_sub\\_espacio\\_%' OR conname LIKE 'Log\\_Auditoria\\_franja\\_anterior\\_%')
        ORDER BY conname`;

      // PostgreSQL normaliza la expresión (paréntesis y ::text); la comparación es exacta a propósito.
      expect(restricciones).toEqual([
        {
          conname: 'Log_Auditoria_franja_anterior_completa_check',
          convalidated: true,
          definicion: 'CHECK (((fecha_inicio_anterior IS NULL) = (fecha_fin_anterior IS NULL)))',
        },
        {
          conname: 'Log_Auditoria_franja_anterior_segun_estado_check',
          convalidated: true,
          definicion: "CHECK (((fecha_inicio_anterior IS NULL) OR (estado_nuevo = 'Validado'::text)))",
        },
        {
          conname: 'Log_Auditoria_franja_anterior_valida_check',
          convalidated: true,
          definicion: 'CHECK ((fecha_fin_anterior > fecha_inicio_anterior))',
        },
        {
          conname: 'Log_Auditoria_sub_espacio_cambio_real_check',
          convalidated: true,
          definicion: 'CHECK ((sub_espacio_anterior <> sub_espacio_nuevo))',
        },
        {
          conname: 'Log_Auditoria_sub_espacio_completo_check',
          convalidated: true,
          definicion: 'CHECK (((sub_espacio_anterior IS NULL) = (sub_espacio_nuevo IS NULL)))',
        },
        {
          conname: 'Log_Auditoria_sub_espacio_segun_estado_check',
          convalidated: true,
          definicion: "CHECK (((sub_espacio_nuevo IS NULL) OR (estado_nuevo = 'Validado'::text)))",
        },
      ]);
    });
  });

  describe('I-32 · COMPORTAMIENTO del motor (PRD v2.2 §5.1)', () => {
    it('I-32a · CA-06.2: cabina y estudio conviven en la misma franja', async () => {
      await insertar('EC-INT-A', '09:00', '10:00', { sub_espacio: CABINA_AUDIO });
      await insertar('EC-INT-B', '09:00', '10:00', { sub_espacio: ESTUDIO_GRABACION });

      expect(await prisma.solicitud.count()).toBe(2);
    });

    it.each([
      ['el completo contra la cabina', CABINA_AUDIO, ESTUDIO_COMPLETO],
      ['la cabina contra el completo', ESTUDIO_COMPLETO, CABINA_AUDIO],
      ['el estudio contra el completo', ESTUDIO_COMPLETO, ESTUDIO_GRABACION],
      ['el completo contra el completo', ESTUDIO_COMPLETO, ESTUDIO_COMPLETO],
    ] as const)('I-32b · CA-06.3: %s → 23P01 reconocido como CA-06', async (_caso, primero, segundo) => {
      await insertar('EC-INT-A', '09:00', '10:00', { sub_espacio: primero });

      const error = await capturar(insertar('EC-INT-B', '09:30', '10:30', { sub_espacio: segundo }));

      expect(esViolacionDeTraslapeCa06(error)).toBe(true);
    });

    it('I-32c · expand: sin sub-espacio, la fila nueva es ESTUDIO_COMPLETO y bloquea los dos (como la global)', async () => {
      const guardada = await insertar('EC-INT-A', '09:00', '10:00');

      expect(guardada.sub_espacio).toBe(ESTUDIO_COMPLETO);
      expect(esViolacionDeTraslapeCa06(await capturar(insertar('EC-INT-B', '09:30', '10:30', { sub_espacio: CABINA_AUDIO })))).toBe(true);
      expect(esViolacionDeTraslapeCa06(await capturar(insertar('EC-INT-C', '09:30', '10:30', { sub_espacio: ESTUDIO_GRABACION })))).toBe(true);
    });

    it('I-32d · NA1: "No atendida" libera la franja en los dos sub-espacios', async () => {
      await insertar('EC-INT-A', '09:00', '10:00', { estado: 'No atendida' });
      await insertar('EC-INT-B', '09:00', '10:00');

      expect(await prisma.solicitud.count()).toBe(2);
    });

    it('I-32e · A3 y F3: un cambio de sub-espacio o de franja solo se registra en un log que termina en "Validado"', async () => {
      await insertar('EC-INT-A', '09:00', '10:00');
      const base = {
        radicado_solicitud: 'EC-INT-A',
        estado_anterior: 'Validado',
        estado_nuevo: 'En Producción',
        modificado_por: USUARIO,
      };

      const sinValidar = await capturar(
        prisma.log_Auditoria.create({ data: { ...base, sub_espacio_anterior: ESTUDIO_COMPLETO, sub_espacio_nuevo: CABINA_AUDIO } }),
      );
      const franjaSinValidar = await capturar(
        prisma.log_Auditoria.create({
          data: { ...base, fecha_inicio_anterior: bogota('20', '09:00'), fecha_fin_anterior: bogota('20', '10:00') },
        }),
      );

      expect((sinValidar as Error).message).toContain('Log_Auditoria_sub_espacio_segun_estado_check');
      expect((franjaSinValidar as Error).message).toContain('Log_Auditoria_franja_anterior_segun_estado_check');
      // El mismo registro en un T1 con ajuste (rescate Q-B2 + sub-espacio Q-A4) es legal.
      await prisma.log_Auditoria.create({
        data: {
          ...base,
          estado_anterior: 'Recibido',
          estado_nuevo: 'Validado',
          sub_espacio_anterior: ESTUDIO_COMPLETO,
          sub_espacio_nuevo: CABINA_AUDIO,
          fecha_inicio_anterior: bogota('20', '09:00'),
          fecha_fin_anterior: bogota('20', '10:00'),
        },
      });
      expect(await prisma.log_Auditoria.count()).toBe(1);
    });
  });
});
