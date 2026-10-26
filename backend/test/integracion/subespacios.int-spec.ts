import { ConflictException, Logger } from '@nestjs/common';
import { CategoriaSolicitud, Prisma, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import { esViolacionDeTraslapeCa06, MENSAJE_CA06 } from '../../src/solicitudes/errores/traslape-ca06';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 7 · 7A.3 · migración 20261023120000_ca06_subespacios contra PostgreSQL REAL
 * (PRD v2.2 §5.1; ADR-007 SE1, SE2, SE7, NA1 y P-1).
 *  - I-31: ALINEACIÓN. Columnas (sin DEFAULT desde el contract, 7A.8) y los seis CHECK del
 *    log, con la definición exacta que guarda el motor.
 *  - I-32: COMPORTAMIENTO del motor. La tabla del PRD §5.1 sin pasar por el servicio.
 *  - I-33 (7A.6): el SERVICIO crea por sub-espacio, también en carreras: la capa amable
 *    y el motor deciden lo mismo y el resultado no depende del orden.
 *  - I-34 (7A.6): T1, T5 y T7 con sub-espacio contra la base real (CHECK del log A1 a A3 y
 *    F1 a F3, compare-and-set y EXCLUDE), también en carreras.
 *  - I-35 (7A.8): el contract. Sin DEFAULT el motor rechaza una fila sin lugar, y M4 exige el
 *    lugar de la propuesta junto con su franja (y nunca sin ella).
 * Las carreras son LIBRES (PostgreSQL decide el orden): se verifican propiedades que valen
 * en cualquier orden. El código HTTP (201/409) lo fijan las pruebas e2e; aquí, el servicio.
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

  /**
   * Inserta saltándose el servicio: solo el motor decide. Contract (7A.8): la columna ya no
   * tiene DEFAULT, así que el lugar va SIEMPRE explícito; sin indicarlo, el completo.
   */
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
        sub_espacio: ESTUDIO_COMPLETO,
        ...cambios,
      },
    });

  describe('I-31 · ALINEACIÓN de la migración', () => {
    it('I-31a · columnas nuevas: sub_espacio NOT NULL y, desde el contract, SIN valor por defecto; el resto admite NULL', async () => {
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
          // Contract (7A.8): el DEFAULT temporal del expand ya no existe (cambio anunciado en 7A.3).
          por_defecto: null,
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

    it('I-32c · el completo bloquea los dos sub-espacios (como la restricción global de antes)', async () => {
      await insertar('EC-INT-A', '09:00', '10:00', { sub_espacio: ESTUDIO_COMPLETO });

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
  describe('I-35 · CONTRACT (7A.8 · ADR-007 SE1 y SE6)', () => {
    const M4 = 'Solicitud_propuesta_subespacio_check';

    it('I-35a · sin DEFAULT: una fila sin sub-espacio la rechaza el motor (23502), no la completa', async () => {
      // SQL directo y sin parámetros: el cliente de Prisma ya no permite omitir el campo (el tipo
      // lo exige). Las columnas son timestamp en UTC: 14:00 Z son las 09:00 en Bogotá.
      const error = await capturar(prisma.$executeRaw`
        INSERT INTO "Solicitud" (radicado, id_usuario, categoria, proposito, fecha_inicio, fecha_fin, estado)
        VALUES ('EC-INT-A', 'uuid-integracion-subespacios', 'VIDEO', 'Sin lugar',
                '2026-10-27 14:00:00', '2026-10-27 15:00:00', 'Recibido')`);

      // El INSERT da valor a TODAS las demás columnas NOT NULL que no tienen DEFAULT, así que un
      // 23502 solo puede venir de sub_espacio. Prisma 5.22 no reenvía el nombre de la columna en
      // $executeRaw (solo "Failing row contains (…)"): se midió, no se supuso.
      expect((error as Error).message).toContain('Code: `23502`');
      expect(await prisma.solicitud.count()).toBe(0);
    });

    it('I-35b · M4: una propuesta con franja y SIN lugar → 23514 de M4 (ya no existe la propuesta sin lugar)', async () => {
      const error = await capturar(
        insertar('EC-INT-A', '09:00', '10:00', {
          estado: 'Pendiente de Reprogramación',
          fecha_propuesta_inicio: bogota('28', '09:00'),
          fecha_propuesta_fin: bogota('28', '10:00'),
          sub_espacio_propuesto: null,
        }),
      );

      expect((error as Error).message).toContain('23514');
      expect((error as Error).message).toContain(M4);
      expect(esViolacionDeTraslapeCa06(error)).toBe(false);
    });

    it('I-35c · M4: un lugar propuesto SIN franja propuesta → 23514 de M4 (T7 y T8 limpian los dos juntos)', async () => {
      const error = await capturar(insertar('EC-INT-A', '09:00', '10:00', { estado: 'Validado', sub_espacio_propuesto: CABINA_AUDIO }));

      expect((error as Error).message).toContain(M4);
    });

    it('I-35d · M4: la propuesta completa (franja y lugar) en Pendiente es legal', async () => {
      await insertar('EC-INT-A', '09:00', '10:00', {
        estado: 'Pendiente de Reprogramación',
        fecha_propuesta_inicio: bogota('28', '09:00'),
        fecha_propuesta_fin: bogota('28', '10:00'),
        sub_espacio_propuesto: CABINA_AUDIO,
      });

      expect(await prisma.solicitud.count()).toBe(1);
    });
  });

  describe('Servicio contra la base real (7A.6)', () => {
    /** Lunes 5-oct-2026, 10:00 en Bogotá: las franjas de octubre y noviembre están por delante. */
    const AHORA = new Date('2026-10-05T10:00:00-05:00');
    const STAFF = USUARIO;
    const STAFF_B = 'uuid-integracion-subespacios-b';
    const SOLICITANTE: UsuarioAutenticado = Object.freeze({
      id: 'uuid-solicitante-subespacios',
      correo: 'solicitante-subespacios@prueba.local',
      rol: RolUsuario.SOLICITANTE,
    });
    const MOTIVO = 'El Estudio C necesita reorganizar los espacios esa semana';
    let service: SolicitudesService;
    let avisos: jest.SpyInstance;
    let azar: jest.SpyInstance;

    beforeEach(async () => {
      await prisma.usuario.createMany({
        data: [
          { id_usuario: STAFF_B, nombre: 'Staff B', correo: 'staff-b-subespacios@prueba.local', rol: RolUsuario.STAFF },
          { id_usuario: SOLICITANTE.id, nombre: 'Solicitante', correo: SOLICITANTE.correo, rol: RolUsuario.SOLICITANTE },
        ],
      });
      service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
      // El aviso de "carrera resuelta por el motor" (Decisión AF) se cuenta, no se imprime.
      avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      // Radicados distintos y deterministas (como I-1): una colisión del radicado (backlog)
      // no debe confundirse con un resultado de CA-06.
      let secuencia = 0;
      azar = jest.spyOn(Math, 'random').mockImplementation(() => (secuencia++ % 9000) / 9000);
    });

    afterEach(() => {
      avisos.mockRestore();
      azar.mockRestore();
    });

    /**
     * Martes 27-oct (hábil) por defecto, dentro del bloque de la mañana. Fase 7 · SE10: solo una
     * solicitud de espacio físico elige el lugar.
     */
    const crear = (subEspacio: SubEspacio, dia = '27', desde = '09:00', hasta = '10:00') =>
      service.create(
        {
          categoria: CategoriaSolicitud.ESPACIOS,
          proposito: 'Batería de integración de sub-espacios',
          fecha_inicio: bogota(dia, desde),
          fecha_fin: bogota(dia, hasta),
          sub_espacio: subEspacio,
        },
        SOLICITANTE.id,
      );

    const separar = (resultados: PromiseSettledResult<unknown>[]) => ({
      exitos: resultados.filter((r) => r.status === 'fulfilled').length,
      rechazos: resultados.flatMap((r): unknown[] => (r.status === 'rejected' ? [r.reason] : [])),
    });

    const esConflictoCa06 = (error: unknown): boolean =>
      error instanceof ConflictException && error.message === MENSAJE_CA06;

    /** Solicitudes que ocupan la franja (estado activo) en cada sub-espacio. */
    const ocupacion = async (): Promise<Record<SubEspacio, number>> => {
      const filas = await prisma.solicitud.groupBy({
        by: ['sub_espacio'],
        where: { estado: { notIn: ['Rechazado', 'Cancelado por el Usuario', 'No atendida'] } },
        _count: { _all: true },
      });
      const conteo: Record<SubEspacio, number> = { CABINA_AUDIO: 0, ESTUDIO_GRABACION: 0, ESTUDIO_COMPLETO: 0 };
      for (const fila of filas) conteo[fila.sub_espacio] = fila._count._all;
      return conteo;
    };

    describe('I-33 · create() por sub-espacio (PRD v2.2 §5.1 · CA-06.1 a CA-06.3)', () => {
      it('I-33a · CA-06.2: cabina y estudio en la MISMA franja → las dos se crean, cada una en su lugar', async () => {
        const cabina = await crear(CABINA_AUDIO);
        const estudio = await crear(ESTUDIO_GRABACION);

        expect([cabina.sub_espacio, estudio.sub_espacio]).toEqual([CABINA_AUDIO, ESTUDIO_GRABACION]);
        expect(await ocupacion()).toEqual({ CABINA_AUDIO: 1, ESTUDIO_GRABACION: 1, ESTUDIO_COMPLETO: 0 });
      });

      it.each([
        ['el completo contra la cabina', CABINA_AUDIO, ESTUDIO_COMPLETO],
        ['el completo contra el estudio', ESTUDIO_GRABACION, ESTUDIO_COMPLETO],
        ['la cabina contra el completo', ESTUDIO_COMPLETO, CABINA_AUDIO],
        ['el estudio contra el completo', ESTUDIO_COMPLETO, ESTUDIO_GRABACION],
      ] as const)('I-33b · CA-06.3: %s → 409 de CA-06 (capa amable), sin escribir', async (_caso, primero, segundo) => {
        await crear(primero);

        const error = await capturar(crear(segundo, '27', '09:30', '10:30'));

        expect(esConflictoCa06(error)).toBe(true);
        expect(await prisma.solicitud.count()).toBe(1);
      });

      it('I-33e · SE10: un servicio sin lugar se guarda en el completo y choca con una cabina en la misma franja', async () => {
        await crear(CABINA_AUDIO);

        const servicio = (desde: string, hasta: string) =>
          service.create(
            { categoria: CategoriaSolicitud.PODCAST, proposito: 'Servicio de la batería', fecha_inicio: bogota('27', desde), fecha_fin: bogota('27', hasta) },
            SOLICITANTE.id,
          );

        expect(esConflictoCa06(await capturar(servicio('09:30', '10:30')))).toBe(true);
        const libre = await servicio('10:00', '11:00');
        expect(libre.sub_espacio).toBe(ESTUDIO_COMPLETO);
      });

      it('I-33c · CARRERA: 5 en la cabina y 5 en el estudio a la vez en la misma franja → exactamente 1 por sub-espacio', async () => {
        const pedidos = [
          ...Array.from({ length: 5 }, () => crear(CABINA_AUDIO)),
          ...Array.from({ length: 5 }, () => crear(ESTUDIO_GRABACION)),
        ];

        const { exitos, rechazos } = separar(await Promise.allSettled(pedidos));

        expect(exitos).toBe(2);
        expect(rechazos).toHaveLength(8);
        expect(rechazos.every(esConflictoCa06)).toBe(true);
        expect(await ocupacion()).toEqual({ CABINA_AUDIO: 1, ESTUDIO_GRABACION: 1, ESTUDIO_COMPLETO: 0 });
        console.info(`I-33c · carreras resueltas por el motor (23P01): ${avisos.mock.calls.length} de 8`);
      });

      it('I-33d · CARRERA: el completo contra la cabina a la vez, en 5 franjas → en cada franja gana exactamente uno', async () => {
        const franjas = ['08:00', '09:00', '10:00', '14:00', '15:00'] as const;
        const finDe = (desde: string) => `${String(Number(desde.slice(0, 2)) + 1).padStart(2, '0')}:00`;

        const resultados = await Promise.all(
          franjas.map(async (desde) =>
            separar(await Promise.allSettled([crear(ESTUDIO_COMPLETO, '28', desde, finDe(desde)), crear(CABINA_AUDIO, '28', desde, finDe(desde))])),
          ),
        );

        for (const { exitos, rechazos } of resultados) {
          expect(exitos).toBe(1);
          expect(rechazos.every(esConflictoCa06)).toBe(true);
        }
        expect(await prisma.solicitud.count()).toBe(franjas.length);
        console.info(`I-33d · carreras resueltas por el motor (23P01): ${avisos.mock.calls.length} de ${franjas.length}`);
      });
    });

    describe('I-34 · T1, T5 y T7 con sub-espacio (ADR-007 SE5 a SE7, P-1)', () => {
      /** Inserta directo una solicitud del solicitante (sin CA-04), en el estado y lugar pedidos. */
      const sembrar = (radicado: string, estado: string, subEspacio: SubEspacio, dia = '27', desde = '09:00', hasta = '10:00') =>
        prisma.solicitud.create({
          data: {
            radicado,
            id_usuario: SOLICITANTE.id,
            categoria: CategoriaSolicitud.PODCAST,
            proposito: 'Sembrada para la batería de sub-espacios',
            fecha_inicio: bogota(dia, desde),
            fecha_fin: bogota(dia, hasta),
            estado,
            sub_espacio: subEspacio,
          },
        });

      const proponer = (radicado: string, subEspacio: SubEspacio, staff = STAFF, dia = '27', desde = '09:00', hasta = '10:00') =>
        service.proponerReprogramacion(
          radicado,
          { fecha_inicio: bogota(dia, desde), fecha_fin: bogota(dia, hasta), sub_espacio: subEspacio, motivo: MOTIVO },
          staff,
        );

      const logsDe = (radicado: string) =>
        prisma.log_Auditoria.findMany({
          where: { radicado_solicitud: radicado },
          select: {
            estado_nuevo: true,
            sub_espacio_anterior: true,
            sub_espacio_nuevo: true,
            fecha_inicio_anterior: true,
            fecha_fin_anterior: true,
          },
        });

      it('I-34a · T1 con rescate (Q-B2) y ajuste de lugar (Q-A4): fila y log pasan los CHECK reales', async () => {
        // Vencida: 1-oct, antes de AHORA (5-oct). Se rescata al 28-oct, en el estudio.
        await sembrar('EC-INT-T1', 'Recibido', ESTUDIO_COMPLETO, '01');

        await service.update(
          'EC-INT-T1',
          { estado: 'Validado', sub_espacio: ESTUDIO_GRABACION, fecha_inicio: bogota('28', '09:00'), fecha_fin: bogota('28', '10:00') },
          STAFF,
        );

        expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-INT-T1' } })).toMatchObject({
          estado: 'Validado',
          sub_espacio: ESTUDIO_GRABACION,
          fecha_inicio: bogota('28', '09:00'),
        });
        expect(await logsDe('EC-INT-T1')).toEqual([
          {
            estado_nuevo: 'Validado',
            sub_espacio_anterior: ESTUDIO_COMPLETO,
            sub_espacio_nuevo: ESTUDIO_GRABACION,
            fecha_inicio_anterior: bogota('01', '09:00'),
            fecha_fin_anterior: bogota('01', '10:00'),
          },
        ]);
      });

      it('I-34b · T5 → T7 cambiando SOLO el lugar: la fila se muda, la propuesta se limpia y el log de T7 no lleva franja anterior', async () => {
        await sembrar('EC-INT-T7', 'Validado', CABINA_AUDIO);

        await proponer('EC-INT-T7', ESTUDIO_GRABACION);
        expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-INT-T7' } })).toMatchObject({
          estado: 'Pendiente de Reprogramación',
          sub_espacio: CABINA_AUDIO, // K6: el lugar oficial no se mueve hasta aceptar
          sub_espacio_propuesto: ESTUDIO_GRABACION,
        });

        await service.aceptarReprogramacion('EC-INT-T7', SOLICITANTE);

        expect(await prisma.solicitud.findUnique({ where: { radicado: 'EC-INT-T7' } })).toMatchObject({
          estado: 'Validado',
          sub_espacio: ESTUDIO_GRABACION,
          sub_espacio_propuesto: null,
          fecha_propuesta_inicio: null,
          fecha_inicio: bogota('27', '09:00'),
        });
        // Por destino, no por fecha: dos logs seguidos pueden compartir el mismo instante.
        const logs = await logsDe('EC-INT-T7');
        expect(logs).toHaveLength(2);
        expect(logs).toEqual(
          expect.arrayContaining([
            { estado_nuevo: 'Pendiente de Reprogramación', sub_espacio_anterior: null, sub_espacio_nuevo: null, fecha_inicio_anterior: null, fecha_fin_anterior: null },
            { estado_nuevo: 'Validado', sub_espacio_anterior: CABINA_AUDIO, sub_espacio_nuevo: ESTUDIO_GRABACION, fecha_inicio_anterior: null, fecha_fin_anterior: null },
          ]),
        );
      });

      it('I-34c · CARRERA T7 contra una reserva nueva en el lugar PROPUESTO (D3: la propuesta no se reserva) → gana exactamente una', async () => {
        await sembrar('EC-INT-T7', 'Validado', CABINA_AUDIO);
        await proponer('EC-INT-T7', ESTUDIO_GRABACION);

        const { exitos, rechazos } = separar(
          await Promise.allSettled([service.aceptarReprogramacion('EC-INT-T7', SOLICITANTE), crear(ESTUDIO_GRABACION)]),
        );

        expect(exitos).toBe(1);
        expect(rechazos).toHaveLength(1);
        expect(esConflictoCa06(rechazos[0])).toBe(true);
        // Nunca dos reservas activas en el estudio a la misma hora, gane quien gane.
        expect((await ocupacion()).ESTUDIO_GRABACION).toBe(1);
        const fila = await prisma.solicitud.findUniqueOrThrow({ where: { radicado: 'EC-INT-T7' } });
        if (fila.estado === 'Validado') {
          // Ganó T7: se mudó al estudio y su log registra el cambio.
          expect(fila).toMatchObject({ sub_espacio: ESTUDIO_GRABACION, sub_espacio_propuesto: null });
          expect(await prisma.log_Auditoria.count({ where: { radicado_solicitud: 'EC-INT-T7' } })).toBe(2);
        } else {
          // Ganó la reserva nueva: la propuesta sigue intacta y T7 no dejó log (rollback).
          expect(fila).toMatchObject({ estado: 'Pendiente de Reprogramación', sub_espacio: CABINA_AUDIO, sub_espacio_propuesto: ESTUDIO_GRABACION });
          expect(await prisma.log_Auditoria.count({ where: { radicado_solicitud: 'EC-INT-T7' } })).toBe(1);
        }
      });

      it('I-34d · CARRERA T5: dos Staff proponen lugares distintos a la vez → una sola propuesta y un solo log, coherentes', async () => {
        await sembrar('EC-INT-T5', 'Validado', ESTUDIO_COMPLETO);

        const { exitos, rechazos } = separar(
          await Promise.allSettled([proponer('EC-INT-T5', CABINA_AUDIO, STAFF), proponer('EC-INT-T5', ESTUDIO_GRABACION, STAFF_B)]),
        );

        expect(exitos).toBe(1);
        expect(rechazos).toHaveLength(1);
        expect(rechazos[0]).toBeInstanceOf(ConflictException); // compare-and-set o "ya hay una propuesta"
        const fila = await prisma.solicitud.findUniqueOrThrow({ where: { radicado: 'EC-INT-T5' } });
        const logs = await prisma.log_Auditoria.findMany({ where: { radicado_solicitud: 'EC-INT-T5' } });
        expect(fila.estado).toBe('Pendiente de Reprogramación');
        expect(logs).toHaveLength(1);
        // La propuesta guardada es la del Staff que dejó el log: ninguna escritura se pisó.
        const ganador = logs[0]?.modificado_por === STAFF ? CABINA_AUDIO : ESTUDIO_GRABACION;
        expect(fila.sub_espacio_propuesto).toBe(ganador);
      });

      it('I-34e · CARRERA T1: dos Staff validan a la vez con lugares distintos → gana uno y el log describe exactamente su ajuste', async () => {
        await sembrar('EC-INT-T1', 'Recibido', ESTUDIO_COMPLETO);

        const { exitos, rechazos } = separar(
          await Promise.allSettled([
            service.update('EC-INT-T1', { estado: 'Validado', sub_espacio: CABINA_AUDIO }, STAFF),
            service.update('EC-INT-T1', { estado: 'Validado', sub_espacio: ESTUDIO_GRABACION }, STAFF_B),
          ]),
        );

        expect(exitos).toBe(1);
        expect(rechazos[0]).toBeInstanceOf(ConflictException);
        const fila = await prisma.solicitud.findUniqueOrThrow({ where: { radicado: 'EC-INT-T1' } });
        expect(await logsDe('EC-INT-T1')).toEqual([
          {
            estado_nuevo: 'Validado',
            sub_espacio_anterior: ESTUDIO_COMPLETO,
            sub_espacio_nuevo: fila.sub_espacio,
            fecha_inicio_anterior: null,
            fecha_fin_anterior: null,
          },
        ]);
      });
    });
  });
});
