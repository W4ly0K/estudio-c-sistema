import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, type Type } from '@nestjs/common';
import { CampoEnlace, CategoriaSolicitud, Prisma, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import { crearValidationPipe } from '../../src/common/pipes/crear-validation-pipe';
import { ENLACE_MAXIMO } from '../../src/common/validadores/enlace-seguro.decorator';
import { longitudReal } from '../../src/common/validadores/texto-con-longitud-real.decorator';
import { CorregirEnlaceEntregaDto } from '../../src/solicitudes/dto/corregir-enlace-entrega.dto';
import { CreateSolicitudeDto, MENSAJE_ENLACE_ANEXO } from '../../src/solicitudes/dto/create-solicitude.dto';
import { EditarAnexoDto } from '../../src/solicitudes/dto/editar-anexo.dto';
import { MENSAJE_ENLACE_ENTREGA, UpdateSolicitudeDto } from '../../src/solicitudes/dto/update-solicitude.dto';
import { ENLACES_DENTRO_DEL_LIMITE_DE_LONGITUD, ENLACES_FUERA_DEL_LIMITE_DE_LONGITUD } from '../utils/casos-enlace';
import { crearPrismaDeIntegracion } from './bd-integracion';
import { consultasCentinelaPrisma, exigirCentinela } from './centinela';
import { exigirErrorDelMotor } from './error-del-motor';
import { H1 } from './estado-migraciones';

/**
 * Fase 9 · H8b-3 · Longitud de los enlaces: EnlaceSeguro frente a los CHECK de PostgreSQL (base desechable).
 *  - I-46a: H1 (estado-migraciones.ts: 20261109110000_enlace_anexo) aplicada una sola vez, terminada, sin revertir y con su checksum; ninguna
 *           migración del repositorio pendiente; los cuatro CHECK de formato existen, validados, con ENLACE_MAXIMO.
 *  - I-46b: char_length() del motor coincide con longitudReal() en los casos ASCII, de selectores y de emojis.
 *  - I-46c: cada CHECK de formato rechaza (23514) los valores de más de ENLACE_MAXIMO puntos de código.
 *  - I-46d: cada columna acepta los valores dentro del límite; se relee el valor y la transacción se revierte.
 *  - I-46e: los cuatro DTO rechazan con el pipe real lo que el motor rechazaría (sin servicios ni Prisma).
 *  - I-46f: la suite no deja filas.
 *
 * Sin TRUNCATE ni limpieza destructiva: cada caso escribe dentro de su propia transacción interactiva y la revierte
 * (con una excepción intencional, o porque el motor la aborta). Cada caso crea todo lo que necesita: no hay estado
 * compartido entre casos.
 * Cada fila de prueba cumple TODAS las demás restricciones de su tabla; entre un caso aceptado (I-46d) y uno
 * rechazado (I-46c) de la misma columna solo cambia el enlace, y el error debe nombrar UNA sola restricción.
 *
 * Qué NO demuestra: nada de la base principal, la respuesta HTTP (las e2e la cubren con Prisma simulado) ni la
 * compatibilidad de todo Unicode (U+0000 y los sustitutos sueltos quedan fuera de H8b).
 */
const CARPETA_MIGRACIONES = join(__dirname, '..', '..', 'prisma', 'migrations');
const PATRON_DEL_CHECK = '^https://[^[:space:]]+$';

const PREFIJO = 'EC-INT-H8B';
const RADICADO = `${PREFIJO}-1`;
const USUARIO = 'uuid-integracion-h8b';
const CORREO = 'h8b@prueba.local';
const URL_A = 'https://drive.google.com/file/d/h8b-a/view';
const URL_B = 'https://drive.google.com/file/d/h8b-b/view';
// Franja lejana que ninguna otra suite usa: CA-06 (exclusión) no interviene aunque otra suite haya dejado filas.
const INICIO = new Date('2035-01-15T09:00:00-05:00');
const FIN = new Date('2035-01-15T10:00:00-05:00');
const TIEMPOS_DE_TRANSACCION = { maxWait: 20_000, timeout: 20_000 };

type Columna = 'enlace_anexo' | 'enlace_entrega' | 'enlace_nuevo' | 'enlace_anterior';
type Tabla = 'Solicitud' | 'Log_Auditoria';

interface Destino {
  readonly columna: Columna;
  readonly tabla: Tabla;
  readonly restriccion: string;
}

const DESTINOS: readonly Destino[] = [
  { columna: 'enlace_anexo', tabla: 'Solicitud', restriccion: 'Solicitud_enlace_anexo_formato_check' },
  { columna: 'enlace_entrega', tabla: 'Solicitud', restriccion: 'Solicitud_enlace_entrega_formato_check' },
  { columna: 'enlace_nuevo', tabla: 'Log_Auditoria', restriccion: 'Log_Auditoria_enlace_nuevo_formato_check' },
  { columna: 'enlace_anterior', tabla: 'Log_Auditoria', restriccion: 'Log_Auditoria_enlace_anterior_formato_check' },
];

/** Cada destino con cada caso: [restricción, caso, destino, enlace]. */
const porDestino = (casos: readonly (readonly [string, string])[]) =>
  DESTINOS.flatMap((destino) => casos.map(([caso, enlace]) => [destino.restriccion, caso, destino, enlace] as const));

/** Lanzada a propósito para revertir una transacción cuyo resultado ya se leyó. */
class ReversionIntencional extends Error {
  constructor() {
    super('Reversión intencional de I-46: ninguna escritura se confirma.');
    this.name = 'ReversionIntencional';
  }
}

interface Lectura {
  readonly valor: string | null;
  readonly largo: number | null;
}

const leida = (filas: readonly Lectura[]): Lectura => {
  if (filas.length !== 1) throw new Error(`Se esperaba exactamente una fila releída y hubo ${filas.length}.`);
  return filas[0];
};

const crearUsuario = (tx: Prisma.TransactionClient) =>
  tx.usuario.create({ data: { id_usuario: USUARIO, nombre: 'Integración H8b', correo: CORREO, rol: RolUsuario.SOLICITANTE } });

/**
 * Una solicitud válida para todas las restricciones de Solicitud: PODCAST en Recibido (admite anexo; sin entrega;
 * sin propuesta), fin posterior al inicio y la franja lejana de CA-06.
 */
const solicitud = (cambios: Partial<Prisma.SolicitudUncheckedCreateInput>): Prisma.SolicitudUncheckedCreateInput => ({
  radicado: RADICADO,
  id_usuario: USUARIO,
  categoria: CategoriaSolicitud.PODCAST,
  proposito: 'Integración H8b (longitud de enlaces)',
  fecha_inicio: INICIO,
  fecha_fin: FIN,
  estado: 'Recibido',
  sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
  ...cambios,
});

/**
 * Un evento ANEXO válido para B1 a B4 y B7 a B9 (Recibido → Recibido, cambio real, sin motivo). B5 y B6 dependen
 * solo del enlace que se prueba.
 */
const eventoAnexo = (enlaceAnterior: string, enlaceNuevo: string): Prisma.Log_AuditoriaUncheckedCreateInput => ({
  radicado_solicitud: RADICADO,
  estado_anterior: 'Recibido',
  estado_nuevo: 'Recibido',
  modificado_por: USUARIO,
  enlace_campo: CampoEnlace.ANEXO,
  enlace_anterior: enlaceAnterior,
  enlace_nuevo: enlaceNuevo,
  motivo_correccion: null,
});

/**
 * Escribe `enlace` en la columna indicada, con filas que cumplen todas las demás restricciones, y lo relee con
 * char_length() del motor. Siempre dentro de una transacción que se revierte.
 */
async function escribirYReleer(tx: Prisma.TransactionClient, columna: Columna, enlace: string): Promise<Lectura> {
  await crearUsuario(tx);
  switch (columna) {
    case 'enlace_anexo': {
      await tx.solicitud.create({ data: solicitud({ enlace_anexo: enlace }) });
      return leida(
        await tx.$queryRaw<Lectura[]>`
          SELECT enlace_anexo AS valor, char_length(enlace_anexo) AS largo FROM "Solicitud" WHERE radicado = ${RADICADO}`,
      );
    }
    case 'enlace_entrega': {
      // VIDEO entregado: admite y exige el enlace (entrega_con_enlace) y ya no ocupa la franja.
      await tx.solicitud.create({
        data: solicitud({ categoria: CategoriaSolicitud.VIDEO, estado: 'Entregado', enlace_entrega: enlace }),
      });
      return leida(
        await tx.$queryRaw<Lectura[]>`
          SELECT enlace_entrega AS valor, char_length(enlace_entrega) AS largo FROM "Solicitud" WHERE radicado = ${RADICADO}`,
      );
    }
    case 'enlace_nuevo': {
      await tx.solicitud.create({ data: solicitud({ enlace_anexo: URL_A }) });
      await tx.log_Auditoria.create({ data: eventoAnexo(URL_A, enlace) });
      return leida(
        await tx.$queryRaw<Lectura[]>`
          SELECT enlace_nuevo AS valor, char_length(enlace_nuevo) AS largo
          FROM "Log_Auditoria" WHERE radicado_solicitud = ${RADICADO}`,
      );
    }
    case 'enlace_anterior': {
      await tx.solicitud.create({ data: solicitud({ enlace_anexo: URL_B }) });
      await tx.log_Auditoria.create({ data: eventoAnexo(enlace, URL_B) });
      return leida(
        await tx.$queryRaw<Lectura[]>`
          SELECT enlace_anterior AS valor, char_length(enlace_anterior) AS largo
          FROM "Log_Auditoria" WHERE radicado_solicitud = ${RADICADO}`,
      );
    }
  }
}

interface Residuos {
  readonly solicitudes: number;
  readonly logs: number;
  readonly usuarios: number;
}

const contarResiduos = async (prisma: PrismaClient): Promise<Residuos> => ({
  solicitudes: await prisma.solicitud.count({ where: { radicado: { startsWith: PREFIJO } } }),
  logs: await prisma.log_Auditoria.count({ where: { radicado_solicitud: { startsWith: PREFIJO } } }),
  usuarios: await prisma.usuario.count({ where: { OR: [{ id_usuario: USUARIO }, { correo: CORREO }] } }),
});

const SIN_RESIDUOS: Residuos = { solicitudes: 0, logs: 0, usuarios: 0 };

describe('Longitud de enlaces: EnlaceSeguro frente a los CHECK de PostgreSQL (integración · Fase 9 · H8b-3)', () => {
  let prisma: PrismaClient;
  const checksPorTabla = new Map<Tabla, readonly string[]>();

  beforeAll(async () => {
    prisma = crearPrismaDeIntegracion();
    // Capa 3 también aquí, antes de cualquier otra consulta: solo la base desechable tiene el centinela.
    await exigirCentinela(consultasCentinelaPrisma(prisma));

    // Sin filas previas con los identificadores de la suite: si las hubiera, I-46f no podría atribuirlas.
    const previos = await contarResiduos(prisma);
    if (previos.solicitudes + previos.logs + previos.usuarios > 0) {
      throw new Error(`I-46: ya hay filas con los identificadores de la suite (${JSON.stringify(previos)}). No se ejecuta.`);
    }

    const checks = await prisma.$queryRaw<{ tabla: Tabla; conname: string }[]>`
      SELECT cl.relname AS tabla, co.conname
      FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid
      WHERE co.contype = 'c' AND cl.relnamespace = 'public'::regnamespace AND cl.relname IN ('Solicitud', 'Log_Auditoria')
      ORDER BY co.conname`;
    for (const tabla of ['Solicitud', 'Log_Auditoria'] as const) {
      checksPorTabla.set(tabla, checks.filter((fila) => fila.tabla === tabla).map((fila) => fila.conname));
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Ejecuta `operacion` en una transacción, devuelve su resultado y la revierte siempre. */
  async function enTransaccionRevertida<T>(operacion: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const caja: { resultado?: { valor: T } } = {};
    try {
      await prisma.$transaction(async (tx) => {
        caja.resultado = { valor: await operacion(tx) };
        throw new ReversionIntencional();
      }, TIEMPOS_DE_TRANSACCION);
    } catch (error: unknown) {
      if (!(error instanceof ReversionIntencional)) throw error;
    }
    if (caja.resultado === undefined) throw new Error('La operación no terminó dentro de la transacción.');
    return caja.resultado.valor;
  }

  /** El error con que el motor aborta la transacción; si la escritura se aceptó, la revierte igual y falla. */
  async function rechazoDelMotor(operacion: (tx: Prisma.TransactionClient) => Promise<unknown>): Promise<unknown> {
    try {
      await prisma.$transaction(async (tx) => {
        await operacion(tx);
        throw new ReversionIntencional();
      }, TIEMPOS_DE_TRANSACCION);
    } catch (error: unknown) {
      if (error instanceof ReversionIntencional) {
        throw new Error('Se esperaba un rechazo del motor, pero la escritura se aceptó (y se revirtió).');
      }
      return error;
    }
    throw new Error('La transacción terminó sin resultado.');
  }

  describe('I-46a · H1 y restricciones instaladas', () => {
    it('I-46a · el archivo de H1 del repositorio conserva su checksum', () => {
      const archivo = readFileSync(join(CARPETA_MIGRACIONES, H1.nombre, 'migration.sql'));

      expect(createHash('sha256').update(archivo).digest('hex')).toBe(H1.checksum);
    });

    it('I-46a · H1 está aplicada UNA vez, terminada, sin revertir, con ese checksum y sin intentos a medias', async () => {
      const filas = await prisma.$queryRaw<{ checksum: string; terminada: boolean; revertida: boolean }[]>`
        SELECT checksum, finished_at IS NOT NULL AS terminada, rolled_back_at IS NOT NULL AS revertida
        FROM "_prisma_migrations" WHERE migration_name = ${H1.nombre}`;

      expect(filas.filter((fila) => fila.terminada && !fila.revertida)).toEqual([
        { checksum: H1.checksum, terminada: true, revertida: false },
      ]);
      expect(filas.filter((fila) => !fila.terminada && !fila.revertida)).toEqual([]);
    });

    it('I-46a · ninguna migración del repositorio está pendiente en la base', async () => {
      const locales = readdirSync(CARPETA_MIGRACIONES, { withFileTypes: true })
        .filter((entrada) => entrada.isDirectory())
        .map((entrada) => entrada.name);
      const aplicadas = await prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT DISTINCT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      const nombresAplicados = new Set(aplicadas.map((fila) => fila.migration_name));

      expect(locales).toContain(H1.nombre);
      expect(locales.filter((nombre) => !nombresAplicados.has(nombre))).toEqual([]);
    });

    it.each(DESTINOS.map((destino) => [destino.restriccion, destino] as const))(
      'I-46a · %s existe, está validada y limita la columna a ENLACE_MAXIMO puntos de código',
      async (restriccion, destino) => {
        const filas = await prisma.$queryRaw<{ validada: boolean; definicion: string }[]>`
          SELECT co.convalidated AS validada, pg_get_constraintdef(co.oid) AS definicion
          FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid
          WHERE co.conname = ${restriccion} AND co.contype = 'c' AND cl.relname = ${destino.tabla}`;

        expect(filas).toHaveLength(1);
        expect(filas[0].validada).toBe(true);
        expect(filas[0].definicion).toContain(`char_length(${destino.columna}) <= ${ENLACE_MAXIMO}`);
        expect(filas[0].definicion).toContain(PATRON_DEL_CHECK);
      },
    );
  });

  describe('I-46b · char_length() del motor frente a longitudReal()', () => {
    const medir = async (enlace: string) =>
      prisma.$queryRaw<{ largo: number; cumple_patron: boolean }[]>`
        SELECT char_length(${enlace}::text) AS largo, ${enlace}::text ~ ${PATRON_DEL_CHECK} AS cumple_patron`;

    it.each(ENLACES_DENTRO_DEL_LIMITE_DE_LONGITUD)('I-46b · %s: misma medida, cumple el patrón y cabe', async (_caso, enlace) => {
      expect(await medir(enlace)).toEqual([{ largo: longitudReal(enlace), cumple_patron: true }]);
      expect(longitudReal(enlace)).toBeLessThanOrEqual(ENLACE_MAXIMO);
    });

    it.each(ENLACES_FUERA_DEL_LIMITE_DE_LONGITUD)('I-46b · %s: misma medida, cumple el patrón y excede', async (_caso, enlace) => {
      expect(await medir(enlace)).toEqual([{ largo: longitudReal(enlace), cumple_patron: true }]);
      expect(longitudReal(enlace)).toBeGreaterThan(ENLACE_MAXIMO);
    });
  });

  describe('I-46c · los CHECK de formato rechazan más de ENLACE_MAXIMO puntos de código', () => {
    it.each(porDestino(ENLACES_FUERA_DEL_LIMITE_DE_LONGITUD))(
      'I-46c · %s rechaza %s',
      async (_restriccion, _caso, destino, enlace) => {
        // Estricto: un formato de error no reconocido hace fallar el caso, nunca se adivina el SQLSTATE.
        const motor = exigirErrorDelMotor(await rechazoDelMotor((tx) => escribirYReleer(tx, destino.columna, enlace)));
        const checksDeLaTabla = checksPorTabla.get(destino.tabla) ?? [];

        expect(checksDeLaTabla).toContain(destino.restriccion);
        expect(motor.sqlstate).toBe('23514');
        expect(motor.citados.filter((nombre) => checksDeLaTabla.includes(nombre))).toEqual([destino.restriccion]);
      },
    );
  });

  describe('I-46d · las columnas aceptan los valores dentro del límite (con reversión intencional)', () => {
    it.each(porDestino(ENLACES_DENTRO_DEL_LIMITE_DE_LONGITUD))(
      'I-46d · %s acepta %s',
      async (_restriccion, _caso, destino, enlace) => {
        const lectura = await enTransaccionRevertida((tx) => escribirYReleer(tx, destino.columna, enlace));

        expect(lectura).toEqual({ valor: enlace, largo: longitudReal(enlace) });
      },
    );
  });

  // Solo el pipe real con cada DTO: esta comprobación NO ejecuta servicios ni Prisma, ni consulta la base. Que el
  // rechazo ocurra antes de cualquier escritura lo demuestran las e2e (HTTP real, servicio espiado, Prisma simulado).
  describe('I-46e · los DTO rechazan con el pipe real lo que el motor rechazaría', () => {
    const pipe = crearValidationPipe();
    const errores = async (cuerpo: object, metatype: Type<unknown>): Promise<string[]> => {
      try {
        await pipe.transform(cuerpo, { type: 'body', metatype });
        return [];
      } catch (error: unknown) {
        if (!(error instanceof BadRequestException)) throw error;
        return (error.getResponse() as { message: string[] }).message;
      }
    };
    const FLUJOS: readonly (readonly [string, Type<unknown>, (enlace: string) => object, string])[] = [
      [
        'Radicación (CreateSolicitudeDto)',
        CreateSolicitudeDto,
        (enlace) => ({
          categoria: CategoriaSolicitud.PODCAST,
          proposito: 'Radicación con anexo (I-46e)',
          fecha_inicio: INICIO.toISOString(),
          fecha_fin: FIN.toISOString(),
          enlace_anexo: enlace,
        }),
        MENSAJE_ENLACE_ANEXO,
      ],
      ['PATCH del tablero (UpdateSolicitudeDto)', UpdateSolicitudeDto, (enlace) => ({ estado: 'Entregado', enlace_entrega: enlace }), MENSAJE_ENLACE_ENTREGA],
      ['Edición del anexo (EditarAnexoDto)', EditarAnexoDto, (enlace) => ({ enlace_anexo_anterior: null, enlace_anexo: enlace }), MENSAJE_ENLACE_ANEXO],
      [
        'Corrección del enlace de entrega (CorregirEnlaceEntregaDto)',
        CorregirEnlaceEntregaDto,
        (enlace) => ({ enlace_entrega_anterior: URL_A, enlace_entrega: enlace }),
        MENSAJE_ENLACE_ENTREGA,
      ],
    ];
    const porFlujo = (casos: readonly (readonly [string, string])[]) =>
      FLUJOS.flatMap(([flujo, metatype, cuerpo, mensaje]) =>
        casos.map(([caso, enlace]) => [flujo, caso, metatype, cuerpo(enlace), mensaje] as const),
      );

    it.each(porFlujo(ENLACES_FUERA_DEL_LIMITE_DE_LONGITUD))('I-46e · %s rechaza %s', async (_flujo, _caso, metatype, cuerpo, mensaje) => {
      expect(await errores(cuerpo, metatype)).toEqual([mensaje]);
    });

    it.each(porFlujo(ENLACES_DENTRO_DEL_LIMITE_DE_LONGITUD))('I-46e · %s acepta %s', async (_flujo, _caso, metatype, cuerpo) => {
      expect(await errores(cuerpo, metatype)).toEqual([]);
    });
  });

  describe('I-46f · sin residuos', () => {
    it('I-46f · no quedan solicitudes, logs ni usuarios con los identificadores de la suite', async () => {
      expect(await contarResiduos(prisma)).toEqual(SIN_RESIDUOS);
    });
  });
});
