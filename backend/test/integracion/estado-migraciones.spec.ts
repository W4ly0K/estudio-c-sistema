import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evaluarEstadoDeMigraciones,
  H1,
  leerMigracionesLocales,
  type FilaMigracion,
  type MigracionLocal,
  type MigracionObligatoria,
  type VeredictoMigraciones,
} from './estado-migraciones';

/*
 * Fase 9 · H8b-3 · El veredicto sobre el estado de las migraciones, SIN base de datos.
 * Qué demuestra: cada forma de estado incierto bloquea (fail-closed) y reúne sus motivos; el repositorio real, con un
 * historial al día, se acepta. Qué NO demuestra: lo que hay hoy en la base desechable (lo lee el arranque en H8b-3b).
 */
const A: MigracionLocal = { nombre: '20261001000000_inicial', checksum: 'a'.repeat(64) };
const B: MigracionLocal = { nombre: '20261002000000_segunda', checksum: 'b'.repeat(64) };
const LOCALES: readonly MigracionLocal[] = [A, B, H1];

const aplicada = (migracion: MigracionLocal, cambios: Partial<FilaMigracion> = {}): FilaMigracion => ({
  nombre: migracion.nombre,
  checksum: migracion.checksum,
  terminada: true,
  revertida: false,
  ...cambios,
});
const AL_DIA: readonly FilaMigracion[] = LOCALES.map((migracion) => aplicada(migracion));

const evaluar = (
  historial: readonly FilaMigracion[] | null,
  locales: readonly MigracionLocal[] = LOCALES,
  obligatorias: readonly MigracionObligatoria[] = [H1],
): VeredictoMigraciones => evaluarEstadoDeMigraciones({ locales, historial, obligatorias });

const motivosDe = (veredicto: VeredictoMigraciones): readonly string[] => (veredicto.permitido ? [] : veredicto.motivos);

describe('evaluarEstadoDeMigraciones (Fase 9 · H8b-3: estado del esquema antes de escribir)', () => {
  it('un esquema al día permite continuar', () => {
    expect(evaluar(AL_DIA)).toEqual({ permitido: true, aplicadas: 3 });
  });

  it('el orden de las filas no importa', () => {
    expect(evaluar([...AL_DIA].reverse())).toEqual({ permitido: true, aplicadas: 3 });
  });

  it('un intento revertido (migrate resolve) seguido de la aplicación correcta es historia y permite continuar', () => {
    expect(evaluar([aplicada(B, { terminada: false, revertida: true }), ...AL_DIA])).toEqual({ permitido: true, aplicadas: 3 });
  });

  it('una migración pendiente bloquea', () => {
    const veredicto = evaluar(AL_DIA.filter((fila) => fila.nombre !== B.nombre));

    expect(veredicto.permitido).toBe(false);
    expect(motivosDe(veredicto)).toEqual([`Migración pendiente de aplicar: ${B.nombre}.`]);
  });

  it('una migración solo revertida, sin aplicación posterior, sigue pendiente y bloquea', () => {
    const historial = [aplicada(A), aplicada(B, { terminada: false, revertida: true }), aplicada(H1)];

    expect(motivosDe(evaluar(historial))).toEqual([`Migración pendiente de aplicar: ${B.nombre}.`]);
  });

  it('una base sin ninguna migración aplicada bloquea por cada una, H1 incluida', () => {
    const motivos = motivosDe(evaluar([]));

    expect(motivos).toEqual(
      expect.arrayContaining([
        `Migración pendiente de aplicar: ${A.nombre}.`,
        `Migración pendiente de aplicar: ${B.nombre}.`,
        `Migración pendiente de aplicar: ${H1.nombre}.`,
        `${H1.nombre} debe estar aplicada una vez y lo está 0.`,
      ]),
    );
  });

  it('un checksum distinto del archivo local bloquea (cualquier migración, no solo H1)', () => {
    const historial = [aplicada(A), aplicada(B, { checksum: 'c'.repeat(64) }), aplicada(H1)];

    expect(motivosDe(evaluar(historial))).toEqual([`Checksum distinto entre la base y el archivo: ${B.nombre}.`]);
  });

  it('una migración incompleta o fallida (ni terminada ni revertida) bloquea', () => {
    const historial = [...AL_DIA, aplicada(A, { terminada: false, revertida: false })];

    expect(motivosDe(evaluar(historial))).toEqual([`Migración incompleta o fallida (ni terminada ni revertida): ${A.nombre}.`]);
  });

  it('un estado ambiguo (terminada y revertida a la vez) bloquea', () => {
    const historial = [...AL_DIA, aplicada(A, { revertida: true })];

    expect(motivosDe(evaluar(historial))).toEqual([`Estado ambiguo (terminada y revertida a la vez): ${A.nombre}.`]);
  });

  it('una migración aplicada dos veces bloquea', () => {
    expect(motivosDe(evaluar([...AL_DIA, aplicada(B)]))).toEqual([`Migración aplicada más de una vez (2): ${B.nombre}.`]);
  });

  it('una migración aplicada en la base que no está en el repositorio bloquea', () => {
    const ajena: MigracionLocal = { nombre: '20261201000000_ajena', checksum: 'd'.repeat(64) };

    expect(motivosDe(evaluar([...AL_DIA, aplicada(ajena)]))).toEqual([
      `Migración aplicada en la base que no está en el repositorio: ${ajena.nombre}.`,
    ]);
  });

  it('la ausencia de _prisma_migrations bloquea: el estado no se puede determinar', () => {
    expect(motivosDe(evaluar(null))).toEqual([
      'La base no tiene la tabla _prisma_migrations: no se puede determinar el estado del esquema.',
    ]);
  });

  it('un repositorio sin migraciones bloquea', () => {
    expect(motivosDe(evaluar([], []))).toEqual(
      expect.arrayContaining(['No se encontraron migraciones en el repositorio.']),
    );
  });

  describe('H1', () => {
    it('H1 ausente de la base bloquea', () => {
      const motivos = motivosDe(evaluar(AL_DIA.filter((fila) => fila.nombre !== H1.nombre)));

      expect(motivos).toEqual(
        expect.arrayContaining([`Migración pendiente de aplicar: ${H1.nombre}.`, `${H1.nombre} debe estar aplicada una vez y lo está 0.`]),
      );
    });

    it('H1 ausente del repositorio bloquea (aunque el resto coincida)', () => {
      const motivos = motivosDe(evaluar([aplicada(A), aplicada(B)], [A, B]));

      expect(motivos).toEqual(
        expect.arrayContaining([
          `${H1.nombre} debe estar una vez en el repositorio y está 0.`,
          `${H1.nombre} debe estar aplicada una vez y lo está 0.`,
        ]),
      );
    });

    it('H1 duplicada en la base bloquea', () => {
      const motivos = motivosDe(evaluar([...AL_DIA, aplicada(H1)]));

      expect(motivos).toEqual(
        expect.arrayContaining([`Migración aplicada más de una vez (2): ${H1.nombre}.`, `${H1.nombre} debe estar aplicada una vez y lo está 2.`]),
      );
    });

    it('un H1 alterado bloquea aunque el archivo y la base coincidan entre sí (el checksum está fijado)', () => {
      const alterada: MigracionLocal = { nombre: H1.nombre, checksum: 'e'.repeat(64) };
      const motivos = motivosDe(evaluar([aplicada(A), aplicada(B), aplicada(alterada)], [A, B, alterada]));

      expect(motivos).toEqual([
        `El archivo de ${H1.nombre} no tiene el checksum fijado.`,
        `${H1.nombre} está aplicada con un checksum distinto del fijado.`,
      ]);
    });

    it('sin migraciones obligatorias el veredicto bloquea (se espera al menos H1)', () => {
      expect(motivosDe(evaluar(AL_DIA, LOCALES, []))).toEqual(['No se indicó ninguna migración obligatoria (se espera al menos H1).']);
    });
  });

  describe('repositorio incierto', () => {
    it.each([
      ['un nombre de carpeta no reconocido', { nombre: 'borrador', checksum: 'f'.repeat(64) }, 'Carpeta de migración con un nombre no reconocido: borrador.'],
      ['un checksum local inválido', { nombre: '20261003000000_tercera', checksum: 'no-es-sha256' }, 'Checksum local inválido: 20261003000000_tercera.'],
    ] as const)('%s bloquea', (_caso, local, motivo) => {
      expect(motivosDe(evaluar([...AL_DIA, aplicada(local)], [...LOCALES, local]))).toEqual([motivo]);
    });

    it('una migración repetida en el repositorio bloquea', () => {
      expect(motivosDe(evaluar(AL_DIA, [...LOCALES, A]))).toEqual(
        expect.arrayContaining([`Migración repetida en el repositorio: ${A.nombre}.`]),
      );
    });
  });

  it('reúne todos los motivos y ninguno propone reparar el esquema', () => {
    const historial = [aplicada(A, { checksum: 'c'.repeat(64) }), aplicada(B, { terminada: false }), aplicada(H1), aplicada(H1)];
    const motivos = motivosDe(evaluar(historial));

    expect(motivos.length).toBeGreaterThanOrEqual(4);
    for (const motivo of motivos) {
      expect(motivo).not.toMatch(/npx|migrate|resolve|reset|db push|ejecuta|aplica la/i);
    }
  });
});

describe('leerMigracionesLocales (solo archivos del repositorio)', () => {
  const REPOSITORIO = join(__dirname, '..', '..', 'prisma', 'migrations');

  it('el repositorio real contiene H1 con su checksum fijado, y con un historial al día se permite continuar', () => {
    const locales = leerMigracionesLocales(REPOSITORIO);

    expect(locales).toContainEqual(H1);
    expect(locales.map((migracion) => migracion.nombre)).toContain('0_init');
    expect(evaluar(locales.map((migracion) => aplicada(migracion)), locales)).toEqual({ permitido: true, aplicadas: locales.length });
  });

  it('una carpeta sin migration.sql deja el estado ambiguo y lanza un error', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'h8b-migraciones-'));
    try {
      mkdirSync(join(carpeta, '20261001000000_con_sql'));
      writeFileSync(join(carpeta, '20261001000000_con_sql', 'migration.sql'), 'SELECT 1;\n');
      mkdirSync(join(carpeta, '20261002000000_sin_sql'));
      writeFileSync(join(carpeta, 'migration_lock.toml'), 'provider = "postgresql"\n');

      expect(() => leerMigracionesLocales(carpeta)).toThrow('20261002000000_sin_sql no tiene migration.sql');
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('ignora los archivos sueltos (migration_lock.toml) y calcula el SHA-256 de los bytes', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'h8b-migraciones-'));
    try {
      mkdirSync(join(carpeta, '20261001000000_con_sql'));
      writeFileSync(join(carpeta, '20261001000000_con_sql', 'migration.sql'), 'SELECT 1;\n');
      writeFileSync(join(carpeta, 'migration_lock.toml'), 'provider = "postgresql"\n');

      expect(leerMigracionesLocales(carpeta)).toEqual([
        { nombre: '20261001000000_con_sql', checksum: 'b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd' },
      ]);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
