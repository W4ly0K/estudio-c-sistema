import { CampoEnlace, CategoriaSolicitud, Prisma, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import { ENLACE_MAXIMO } from '../../src/common/validadores/enlace-seguro.decorator';
import { enlaceDeLongitud } from '../utils/casos-enlace';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 9 · ADR-012 (propuesto) · eventos de enlace en Log_Auditoria contra PostgreSQL REAL.
 * Migración 20261109110000_enlace_anexo (H1): enum CampoEnlace, cuatro columnas que admiten NULL
 * y nueve CHECK con nombre propio (B1 a B9), para que el 23514 diga exactamente qué regla se rompió.
 *  - I-40a: ALINEACIÓN. Enum, columnas y las nueve restricciones por nombre exacto, validadas.
 *  - I-40b: el MOTOR rechaza cada regla por sí mismo. Cada caso rompe UNA sola regla y no deja fila.
 *  - I-40c: casos VÁLIDOS y la semántica de NULL (un CHECK solo rechaza FALSE, no UNKNOWN).
 *  - I-40d: B7 y la compatibilidad con las transiciones tradicionales.
 *  - I-40e: ATOMICIDAD. Un log inválido revierte también el cambio de la solicitud.
 * Datos sintéticos de integración: nunca se tocan registros de producción. Esta batería prueba el
 * motor; las garantías del servicio (D2, D9, ADR-005 E7) se prueban en los lotes I y J.
 */
const B = Object.freeze({
  completo: 'Log_Auditoria_enlace_completo_check',
  cambioReal: 'Log_Auditoria_enlace_cambio_real_check',
  sinTransicion: 'Log_Auditoria_enlace_sin_transicion_check',
  segunEstado: 'Log_Auditoria_enlace_segun_estado_check',
  anteriorFormato: 'Log_Auditoria_enlace_anterior_formato_check',
  nuevoFormato: 'Log_Auditoria_enlace_nuevo_formato_check',
  transicionOEnlace: 'Log_Auditoria_transicion_o_enlace_check',
  motivoSegunEvento: 'Log_Auditoria_motivo_correccion_segun_evento_check',
  motivoLongitud: 'Log_Auditoria_motivo_correccion_longitud_check',
} as const);
const NOMBRES_B = Object.values(B).sort();

/** Columnas clave de cada restricción: su definición instalada debe mencionarlas todas. */
const COLUMNAS_DE: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
  [B.completo, ['enlace_campo', 'enlace_anterior', 'enlace_nuevo']],
  [B.cambioReal, ['enlace_campo', 'enlace_anterior', 'enlace_nuevo']],
  [B.sinTransicion, ['enlace_campo', 'estado_anterior', 'estado_nuevo']],
  [B.segunEstado, ['enlace_campo', 'estado_nuevo', 'enlace_nuevo']],
  [B.anteriorFormato, ['enlace_anterior']],
  [B.nuevoFormato, ['enlace_nuevo']],
  [B.transicionOEnlace, ['estado_anterior', 'estado_nuevo', 'enlace_campo']],
  [B.motivoSegunEvento, ['motivo_correccion', 'enlace_campo']],
  [B.motivoLongitud, ['motivo_correccion']],
]);

const STAFF = 'uuid-staff-aue';
const SOLICITANTE = 'uuid-solicitante-aue';
const RADICADO_RECIBIDO = 'EC-AUE-RECIBIDO';
const RADICADO_ENTREGADO = 'EC-AUE-ENTREGADO';
const URL_A = 'https://drive.google.com/file/d/aaa/view';
const URL_B = 'https://drive.google.com/file/d/bbb/view';
const ENTREGA_A = 'https://youtu.be/entrega-a';
const ENTREGA_B = 'https://youtu.be/entrega-b';
const MOTIVO_VALIDO = 'El enlace registrado apuntaba a un borrador del video';

/** Lo que cada caso puede variar de un log; el resto lo pone `registrarLog`. */
interface DatosLog {
  readonly radicado?: string;
  readonly estado_anterior: string;
  readonly estado_nuevo: string;
  readonly enlace_campo?: CampoEnlace | null;
  readonly enlace_anterior?: string | null;
  readonly enlace_nuevo?: string | null;
  readonly motivo_correccion?: string | null;
}

/** Base válida de un evento ANEXO (Recibido → Recibido). */
const ANEXO_VALIDO: DatosLog = {
  estado_anterior: 'Recibido',
  estado_nuevo: 'Recibido',
  enlace_campo: CampoEnlace.ANEXO,
  enlace_anterior: URL_A,
  enlace_nuevo: URL_B,
};

/** Base válida de un evento ENTREGA (Entregado → Entregado). */
const ENTREGA_VALIDA: DatosLog = {
  radicado: RADICADO_ENTREGADO,
  estado_anterior: 'Entregado',
  estado_nuevo: 'Entregado',
  enlace_campo: CampoEnlace.ENTREGA,
  enlace_anterior: ENTREGA_A,
  enlace_nuevo: ENTREGA_B,
};

/** Base válida de una transición tradicional (T1): los cuatro campos nuevos en NULL. */
const TRANSICION_VALIDA: DatosLog = { estado_anterior: 'Recibido', estado_nuevo: 'Validado' };

describe('Auditoría de enlaces contra PostgreSQL real (integración · Fase 9 · ADR-012)', () => {
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
        { id_usuario: STAFF, nombre: 'Staff AUE', correo: 'staff-aue@prueba.local', rol: RolUsuario.STAFF },
        { id_usuario: SOLICITANTE, nombre: 'Solicitante AUE', correo: 'solicitante-aue@prueba.local', rol: RolUsuario.SOLICITANTE },
      ],
    });
    // Las restricciones B1 a B9 son del log: el estado de la solicitud no interviene. Aun así, las
    // dos solicitudes son coherentes con sus eventos y respetan CA-06 (franjas distintas; la entrega
    // de PODCAST ya liberó la suya) y la entrega con enlace (PODCAST en Entregado lo exige).
    await prisma.solicitud.createMany({
      data: [
        {
          radicado: RADICADO_RECIBIDO,
          id_usuario: SOLICITANTE,
          categoria: CategoriaSolicitud.PODCAST,
          proposito: 'Solicitud en Recibido con anexo (I-40)',
          fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
          fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
          estado: 'Recibido',
          sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
          enlace_anexo: URL_A,
        },
        {
          radicado: RADICADO_ENTREGADO,
          id_usuario: SOLICITANTE,
          categoria: CategoriaSolicitud.PODCAST,
          proposito: 'Solicitud entregada con enlace (I-40)',
          fecha_inicio: new Date('2026-10-28T09:00:00-05:00'),
          fecha_fin: new Date('2026-10-28T10:00:00-05:00'),
          estado: 'Entregado',
          sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
          enlace_entrega: ENTREGA_A,
        },
      ],
    });
  });

  /** Inserta el log saltándose el servicio: solo el motor decide. */
  const registrarLog = (datos: DatosLog, cliente: Prisma.TransactionClient | PrismaClient = prisma) =>
    cliente.log_Auditoria.create({
      data: {
        radicado_solicitud: datos.radicado ?? RADICADO_RECIBIDO,
        estado_anterior: datos.estado_anterior,
        estado_nuevo: datos.estado_nuevo,
        modificado_por: STAFF,
        enlace_campo: datos.enlace_campo ?? null,
        enlace_anterior: datos.enlace_anterior ?? null,
        enlace_nuevo: datos.enlace_nuevo ?? null,
        motivo_correccion: datos.motivo_correccion ?? null,
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

  /** Restricciones B nombradas en el error. Se exige exactamente una, la esperada. */
  const violadas = (error: unknown): string[] => {
    const mensaje = error instanceof Error ? error.message : String(error);
    return NOMBRES_B.filter((nombre) => mensaje.includes(nombre));
  };

  const esperarViolacion = (error: unknown, restriccion: string): void => {
    expect(error).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    expect((error as Prisma.PrismaClientUnknownRequestError).message).toContain('23514');
    expect(violadas(error)).toEqual([restriccion]);
  };

  /** Intenta registrar el log, exige la violación de `restriccion` y que no quede ninguna fila. */
  const rechazaPor = async (datos: DatosLog, restriccion: string): Promise<void> => {
    const antes = await prisma.log_Auditoria.count();
    esperarViolacion(await capturar(registrarLog(datos)), restriccion);
    expect(await prisma.log_Auditoria.count()).toBe(antes);
  };

  /** Registra el log y comprueba que quedó tal cual se escribió. */
  const acepta = async (datos: DatosLog): Promise<void> => {
    const creado = await registrarLog(datos);
    expect(await prisma.log_Auditoria.findUnique({ where: { id_log: creado.id_log } })).toMatchObject({
      estado_anterior: datos.estado_anterior,
      estado_nuevo: datos.estado_nuevo,
      enlace_campo: datos.enlace_campo ?? null,
      enlace_anterior: datos.enlace_anterior ?? null,
      enlace_nuevo: datos.enlace_nuevo ?? null,
      motivo_correccion: datos.motivo_correccion ?? null,
    });
  };

  describe('I-40a · alineación', () => {
    it('el enum CampoEnlace existe con ANEXO y ENTREGA, en ese orden', async () => {
      const valores = await prisma.$queryRaw<{ valor: string }[]>`
        SELECT e.enumlabel AS valor
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'CampoEnlace'
        ORDER BY e.enumsortorder`;
      expect(valores.map((v) => v.valor)).toEqual(['ANEXO', 'ENTREGA']);
    });

    it('las cuatro columnas nuevas existen, admiten NULL, no tienen DEFAULT y tienen su tipo', async () => {
      const columnas = await prisma.$queryRaw<
        { nombre: string; tipo: string; udt: string; admite_nulo: string; por_defecto: string | null }[]
      >`
        SELECT column_name AS nombre, data_type AS tipo, udt_name AS udt,
               is_nullable AS admite_nulo, column_default AS por_defecto
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Log_Auditoria'
          AND column_name IN ('enlace_campo', 'enlace_anterior', 'enlace_nuevo', 'motivo_correccion')
        ORDER BY column_name`;
      expect(columnas).toEqual([
        { nombre: 'enlace_anterior', tipo: 'text', udt: 'text', admite_nulo: 'YES', por_defecto: null },
        { nombre: 'enlace_campo', tipo: 'USER-DEFINED', udt: 'CampoEnlace', admite_nulo: 'YES', por_defecto: null },
        { nombre: 'enlace_nuevo', tipo: 'text', udt: 'text', admite_nulo: 'YES', por_defecto: null },
        { nombre: 'motivo_correccion', tipo: 'text', udt: 'text', admite_nulo: 'YES', por_defecto: null },
      ]);
    });

    it('las nueve restricciones B1 a B9 existen por nombre exacto, son CHECK y nacen VALIDADAS', async () => {
      const restricciones = await prisma.$queryRaw<
        { conname: string; contype: string; convalidated: boolean; definicion: string }[]
      >`
        SELECT conname, contype::text AS contype, convalidated, pg_get_constraintdef(oid) AS definicion
        FROM pg_constraint
        WHERE conrelid = '"Log_Auditoria"'::regclass AND conname::text = ANY(${NOMBRES_B})
        ORDER BY conname`;
      expect(restricciones.map((r) => r.conname)).toEqual(NOMBRES_B);
      for (const r of restricciones) {
        expect({ conname: r.conname, contype: r.contype, convalidated: r.convalidated }).toEqual({
          conname: r.conname,
          contype: 'c',
          convalidated: true,
        });
        // Sin depender del texto exacto que PostgreSQL reescribe: solo que cada regla habla de sus columnas.
        const columnas = COLUMNAS_DE.get(r.conname);
        expect(columnas).toBeDefined();
        for (const columna of columnas ?? []) {
          expect(r.definicion).toContain(columna);
        }
      }
    });
  });

  describe('I-40b · el motor rechaza cada regla por sí mismo (un caso, una regla)', () => {
    it('B1 · una transición sin enlace_campo no puede llevar valores de enlace', async () => {
      await rechazaPor({ ...TRANSICION_VALIDA, enlace_anterior: URL_A }, B.completo);
      await rechazaPor({ ...TRANSICION_VALIDA, enlace_nuevo: URL_B }, B.completo);
    });

    it('B2 · un evento de enlace con el mismo valor antes y después no es un cambio real', async () => {
      await rechazaPor({ ...ANEXO_VALIDO, enlace_nuevo: URL_A }, B.cambioReal);
    });

    it('B3 · un evento de enlace no cambia de estado', async () => {
      await rechazaPor({ ...ANEXO_VALIDO, estado_anterior: 'Validado' }, B.sinTransicion);
    });

    it('B4 · ANEXO solo en Recibido', async () => {
      await rechazaPor({ ...ANEXO_VALIDO, estado_anterior: 'Validado', estado_nuevo: 'Validado' }, B.segunEstado);
    });

    it('B4 · ENTREGA solo en Entregado', async () => {
      await rechazaPor({ ...ENTREGA_VALIDA, estado_anterior: 'En Producción', estado_nuevo: 'En Producción' }, B.segunEstado);
    });

    it('B4 · ENTREGA exige enlace nuevo (el enlace de entrega no se retira)', async () => {
      await rechazaPor({ ...ENTREGA_VALIDA, enlace_nuevo: null }, B.segunEstado);
    });

    it('B5 · forma del enlace anterior: http, con espacios, con un control (P0, fila 28) y largo', async () => {
      await rechazaPor({ ...ANEXO_VALIDO, enlace_anterior: 'http://drive.google.com/file/d/aaa' }, B.anteriorFormato);
      await rechazaPor({ ...ANEXO_VALIDO, enlace_anterior: 'https://drive.google.com/a b' }, B.anteriorFormato);
      await rechazaPor({ ...ANEXO_VALIDO, enlace_anterior: 'https://drive.google.com/a\u0085b' }, B.anteriorFormato);
      await rechazaPor({ ...ANEXO_VALIDO, enlace_anterior: enlaceDeLongitud(ENLACE_MAXIMO + 1) }, B.anteriorFormato);
    });

    it('B6 · forma del enlace nuevo: HTTPS en mayúsculas, con espacios, con un control (P0, fila 28) y largo', async () => {
      await rechazaPor({ ...ANEXO_VALIDO, enlace_nuevo: 'HTTPS://drive.google.com/file/d/bbb' }, B.nuevoFormato);
      await rechazaPor({ ...ANEXO_VALIDO, enlace_nuevo: 'https://drive.google.com/b b' }, B.nuevoFormato);
      await rechazaPor({ ...ANEXO_VALIDO, enlace_nuevo: 'https://drive.google.com/b\u001Cc' }, B.nuevoFormato);
      await rechazaPor({ ...ANEXO_VALIDO, enlace_nuevo: enlaceDeLongitud(ENLACE_MAXIMO + 1) }, B.nuevoFormato);
    });

    it('B7 · un log con el mismo estado y sin enlace_campo no es ni transición ni evento', async () => {
      await rechazaPor({ estado_anterior: 'Validado', estado_nuevo: 'Validado' }, B.transicionOEnlace);
    });

    it('B8 · el motivo de corrección no cabe en una transición (enlace_campo NULL) ni en un evento ANEXO', async () => {
      await rechazaPor({ ...TRANSICION_VALIDA, motivo_correccion: MOTIVO_VALIDO }, B.motivoSegunEvento);
      await rechazaPor({ ...ANEXO_VALIDO, motivo_correccion: MOTIVO_VALIDO }, B.motivoSegunEvento);
    });

    it('B9 · longitud del motivo: menos de 10, solo espacios y más de 500 caracteres reales', async () => {
      await rechazaPor({ ...ENTREGA_VALIDA, motivo_correccion: 'Muy corto' }, B.motivoLongitud);
      await rechazaPor({ ...ENTREGA_VALIDA, motivo_correccion: '            ' }, B.motivoLongitud);
      await rechazaPor({ ...ENTREGA_VALIDA, motivo_correccion: `  ${'a'.repeat(9)}  ` }, B.motivoLongitud);
      await rechazaPor({ ...ENTREGA_VALIDA, motivo_correccion: 'a'.repeat(501) }, B.motivoLongitud);
      // '🎬' es un solo punto de código (U+1F3AC): char_length lo cuenta como 1 carácter real, aunque
      // en JavaScript mida 2 unidades UTF-16. 9 emojis = 9 caracteres reales (18 unidades UTF-16).
      await rechazaPor({ ...ENTREGA_VALIDA, motivo_correccion: '🎬'.repeat(9) }, B.motivoLongitud);
    });
  });

  describe('I-40c · casos válidos y semántica de NULL', () => {
    it('ANEXO · NULL → URL (se agrega un anexo)', async () => {
      await acepta({ ...ANEXO_VALIDO, enlace_anterior: null, enlace_nuevo: URL_A });
    });

    it('ANEXO · URL → otra URL (se cambia)', async () => {
      await acepta(ANEXO_VALIDO);
    });

    it('ANEXO · URL → NULL (se retira, D1): B6 recibe UNKNOWN y no rechaza', async () => {
      await acepta({ ...ANEXO_VALIDO, enlace_nuevo: null });
    });

    it('ENTREGA · URL → otra URL con motivo válido (10 y 500 caracteres, los extremos se aceptan)', async () => {
      await acepta({ ...ENTREGA_VALIDA, motivo_correccion: MOTIVO_VALIDO });
      await acepta({ ...ENTREGA_VALIDA, motivo_correccion: 'a'.repeat(10) });
      await acepta({ ...ENTREGA_VALIDA, motivo_correccion: 'a'.repeat(500) });
      // 10 emojis son 10 caracteres reales para char_length, aunque en JavaScript midan 20 unidades UTF-16.
      await acepta({ ...ENTREGA_VALIDA, motivo_correccion: '🎬'.repeat(10) });
    });

    it('ENTREGA · URL → otra URL sin motivo (D8): B9 recibe UNKNOWN y no rechaza', async () => {
      await acepta(ENTREGA_VALIDA);
    });

    it('enlaces de exactamente ENLACE_MAXIMO caracteres se aceptan antes y después', async () => {
      await acepta({ ...ANEXO_VALIDO, enlace_anterior: enlaceDeLongitud(ENLACE_MAXIMO), enlace_nuevo: URL_B });
      await acepta({ ...ANEXO_VALIDO, enlace_anterior: URL_A, enlace_nuevo: enlaceDeLongitud(ENLACE_MAXIMO) });
    });

    it('NULL → NULL no es un cambio real: B2 lo rechaza (IS DISTINCT FROM nunca da UNKNOWN)', async () => {
      await rechazaPor({ ...ANEXO_VALIDO, enlace_anterior: null, enlace_nuevo: null }, B.cambioReal);
    });
  });

  describe('I-40d · B7 y compatibilidad con las transiciones', () => {
    it('una transición tradicional con los cuatro campos nuevos en NULL sigue siendo válida', async () => {
      await acepta(TRANSICION_VALIDA);
    });

    it('un evento de enlace sin cambio de estado se acepta cuando cumple las demás reglas', async () => {
      await acepta(ANEXO_VALIDO);
      await acepta(ENTREGA_VALIDA);
    });

    it('el mismo estado sin enlace_campo se rechaza por B7, aunque todo lo demás sea NULL', async () => {
      await rechazaPor({ estado_anterior: 'Recibido', estado_nuevo: 'Recibido' }, B.transicionOEnlace);
    });
  });

  describe('I-40e · atomicidad', () => {
    it('un log inválido dentro de la transacción revierte también el cambio de la solicitud', async () => {
      const error = await capturar(
        prisma.$transaction(async (tx) => {
          const { count } = await tx.solicitud.updateMany({
            where: { radicado: RADICADO_RECIBIDO, estado: 'Recibido', enlace_anexo: URL_A },
            data: { enlace_anexo: URL_B },
          });
          expect(count).toBe(1);
          // B2: el log dice que no cambió nada. El motor lo rechaza y la transacción completa se revierte.
          await registrarLog({ ...ANEXO_VALIDO, enlace_anterior: URL_A, enlace_nuevo: URL_A }, tx);
        }),
      );

      esperarViolacion(error, B.cambioReal);
      expect(await prisma.log_Auditoria.count()).toBe(0);
      expect(await prisma.solicitud.findUnique({ where: { radicado: RADICADO_RECIBIDO } })).toMatchObject({
        estado: 'Recibido',
        enlace_anexo: URL_A,
      });
    });
  });
});
