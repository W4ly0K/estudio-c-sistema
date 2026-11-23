import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MENSAJE_SIN_CENTINELA, type ConsultasCentinela } from './centinela';
import { H1, type FilaMigracion, type MigracionLocal } from './estado-migraciones';
import { verificarArranqueSinMigrar, type ClienteSoloLectura, type DependenciasArranqueSinMigrar } from './preparar-bd-sin-migrar';

/*
 * Fase 9 · H8b-3 · El arranque exclusivo de I-46, SIN base de datos: conexiones simuladas y un registro de eventos.
 * Qué demuestra: el orden (identidad → centinela en cada conexión → historial en solo lectura → veredicto), que
 * cualquier fallo detiene el arranque antes de las pruebas sin intentar reparar, que ningún mensaje lleva URLs ni
 * credenciales, y, sobre el código fuente, que el flujo completo no tiene rutas de migración.
 * Qué NO demuestra: el comportamiento contra la base desechable real (eso es H8b-3b).
 */
const REF_PRUEBA = 'abcdefghijklmnopqrst';
const REF_PRODUCCION = 'zyxwvutsrqponmlkjihg';
const URL_CONSULTAS = `postgresql://postgres.${REF_PRUEBA}:secreto-consultas@aws-0-ejemplo.pooler.supabase.com:6543/postgres`;
const URL_DIRECTA = `postgresql://postgres:secreto-directa@db.${REF_PRUEBA}.supabase.co:5432/postgres`;
const URL_PRODUCCION = `postgresql://postgres.${REF_PRODUCCION}:secreto-produccion@aws-0-ejemplo.pooler.supabase.com:6543/postgres`;
// Lo que nunca puede aparecer en un mensaje. La referencia de la base solo la nombran las capas 1 y 2 existentes
// (evaluarGuardia, para que la persona confirme); las etapas nuevas no la repiten.
const SECRETOS = ['postgresql://', 'secreto', 'pooler', 'supabase.co', '6543', '5432'];
const SECRETOS_Y_REFERENCIA = [...SECRETOS, REF_PRUEBA, REF_PRODUCCION];

const A: MigracionLocal = { nombre: '20261001000000_inicial', checksum: 'a'.repeat(64) };
const LOCALES: readonly MigracionLocal[] = [A, H1];
const AL_DIA: readonly FilaMigracion[] = LOCALES.map((migracion) => ({ ...migracion, terminada: true, revertida: false }));

type Centinela = 'ok' | 'sin-tabla' | 'sin-marcas' | 'falla-conexion';

interface Opciones {
  readonly urlsPrueba?: readonly string[];
  readonly urlsProduccion?: readonly string[];
  readonly confirmacion?: string;
  readonly centinela?: Partial<Record<'consultas' | 'directa', Centinela>>;
  readonly fallaCreacion?: 'consultas' | 'directa';
  readonly historial?: readonly FilaMigracion[] | null | 'falla';
  readonly locales?: readonly MigracionLocal[] | 'falla';
}

interface Escenario {
  readonly dependencias: DependenciasArranqueSinMigrar;
  readonly eventos: string[];
  readonly registros: string[];
}

/** Un error del driver que, como los reales, trae la URL en el mensaje y un código de Prisma. */
const errorDelDriver = (url: string): Error => Object.assign(new Error(`Can't reach database server at ${url}`), { errorCode: 'P1001' });

function escenario(opciones: Opciones = {}): Escenario {
  const eventos: string[] = [];
  const registros: string[] = [];
  const nombreDe = (url: string): 'consultas' | 'directa' => (url === URL_CONSULTAS ? 'consultas' : 'directa');

  const crearCliente = (url: string): ClienteSoloLectura => {
    const nombre = nombreDe(url);
    eventos.push(`crear ${nombre}`);
    if (opciones.fallaCreacion === nombre) throw errorDelDriver(url);
    const comportamiento = opciones.centinela?.[nombre] ?? 'ok';
    const centinela: ConsultasCentinela = {
      existeTabla: async () => {
        eventos.push(`centinela ${nombre}`);
        if (comportamiento === 'falla-conexion') throw errorDelDriver(url);
        return comportamiento !== 'sin-tabla';
      },
      contarMarcas: async () => (comportamiento === 'sin-marcas' ? 0 : 1),
    };
    return {
      centinela,
      leerHistorial: async () => {
        eventos.push(`historial ${nombre}`);
        // null (sin _prisma_migrations) es un caso en sí: solo «ausente» usa el historial al día.
        const historial = opciones.historial === undefined ? AL_DIA : opciones.historial;
        if (historial === 'falla') throw errorDelDriver(url);
        return historial;
      },
      desconectar: async () => {
        eventos.push(`desconectar ${nombre}`);
      },
    };
  };

  return {
    eventos,
    registros,
    dependencias: {
      urlsPrueba: opciones.urlsPrueba ?? [URL_CONSULTAS, URL_DIRECTA],
      urlsProduccion: opciones.urlsProduccion ?? [URL_PRODUCCION],
      confirmacion: 'confirmacion' in opciones ? opciones.confirmacion : REF_PRUEBA,
      obligatorias: [H1],
      crearCliente,
      migracionesLocales: () => {
        if (opciones.locales === 'falla') throw new Error('No se pudo leer prisma/migrations.');
        return opciones.locales ?? LOCALES;
      },
      registrar: (mensaje) => registros.push(mensaje),
    },
  };
}

/** El error con que se detiene el arranque (falla si el arranque continúa). */
async function bloqueo(e: Escenario): Promise<string> {
  try {
    await verificarArranqueSinMigrar(e.dependencias);
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Se esperaba que el arranque se detuviera.');
}

const sinFragmentos = (texto: string, fragmentos: readonly string[]): void => {
  for (const fragmento of fragmentos) expect(texto).not.toContain(fragmento);
};

const ORDEN_COMPLETO = [
  'crear consultas',
  'centinela consultas',
  'desconectar consultas',
  'crear directa',
  'centinela directa',
  'desconectar directa',
  'crear consultas',
  'historial consultas',
  'desconectar consultas',
];

describe('verificarArranqueSinMigrar (Fase 9 · H8b-3: arranque exclusivo de I-46)', () => {
  it('un esquema al día permite continuar, en el orden previsto y sin datos sensibles en el registro', async () => {
    const e = escenario();

    await expect(verificarArranqueSinMigrar(e.dependencias)).resolves.toBeUndefined();
    expect(e.eventos).toEqual(ORDEN_COMPLETO);
    expect(e.registros.at(-1)).toContain('H1 confirmada. No se migra.');
    sinFragmentos(e.registros.join('\n'), SECRETOS_Y_REFERENCIA);
  });

  it('con una sola URL de prueba, la misma conexión cubre ambos roles y el historial se lee después', async () => {
    const e = escenario({ urlsPrueba: [URL_CONSULTAS] });

    await verificarArranqueSinMigrar(e.dependencias);
    expect(e.eventos).toEqual(['crear consultas', 'centinela consultas', 'desconectar consultas', 'crear consultas', 'historial consultas', 'desconectar consultas']);
  });

  describe('identidad (capas 1 y 2): bloquea sin crear ninguna conexión', () => {
    it.each([
      ['sin confirmación', { confirmacion: undefined }, 'INTEGRACION_CONFIRMO_DESECHABLE'],
      ['con una confirmación distinta de la base', { confirmacion: REF_PRODUCCION }, 'INTEGRACION_CONFIRMO_DESECHABLE'],
      ['si la base de pruebas es la de producción', { urlsPrueba: [URL_PRODUCCION], confirmacion: REF_PRODUCCION }, 'MISMA'],
      ['sin URLs de prueba', { urlsPrueba: [] }, 'Faltan INTEGRACION_DATABASE_URL'],
      ['si las dos URLs de prueba apuntan a bases distintas', { urlsPrueba: [URL_CONSULTAS, URL_PRODUCCION] }, 'bases distintas'],
      ['si una URL de producción no se puede identificar', { urlsProduccion: ['no-es-una-url'] }, 'fail-closed'],
    ] as const)('%s', async (_caso, opciones, motivo) => {
      const e = escenario(opciones);

      expect(await bloqueo(e)).toContain(motivo);
      expect(e.eventos).toEqual([]);
      sinFragmentos(await bloqueo(escenario(opciones)), SECRETOS);
    });
  });

  describe('centinela (capa 3): bloquea antes de leer el historial', () => {
    it.each([
      ['sin la tabla en la conexión directa', { centinela: { directa: 'sin-tabla' } }, ['crear consultas', 'centinela consultas', 'desconectar consultas', 'crear directa', 'centinela directa', 'desconectar directa']],
      ['sin marcas en la conexión de consultas', { centinela: { consultas: 'sin-marcas' } }, ['crear consultas', 'centinela consultas', 'desconectar consultas']],
    ] as const)('%s', async (_caso, opciones, eventos) => {
      const e = escenario(opciones);

      expect(await bloqueo(e)).toContain(MENSAJE_SIN_CENTINELA);
      expect(e.eventos).toEqual(eventos);
    });

    it('un fallo de conexión bloquea con el código de Prisma y sin la URL, y la conexión se cierra', async () => {
      const e = escenario({ centinela: { directa: 'falla-conexion' } });
      const mensaje = await bloqueo(e);

      expect(mensaje).toContain('código P1001');
      expect(e.eventos).toContain('desconectar directa');
      expect(e.eventos).not.toContain('historial consultas');
      sinFragmentos(mensaje, SECRETOS_Y_REFERENCIA);
    });

    it('si el cliente no se puede crear, bloquea sin la URL', async () => {
      const mensaje = await bloqueo(escenario({ fallaCreacion: 'consultas' }));

      expect(mensaje).toContain('código P1001');
      sinFragmentos(mensaje, SECRETOS_Y_REFERENCIA);
    });
  });

  describe('historial de migraciones: bloquea y no repara', () => {
    it.each([
      ['una migración pendiente', AL_DIA.filter((fila) => fila.nombre !== A.nombre), `Migración pendiente de aplicar: ${A.nombre}.`],
      ['un checksum distinto', [{ ...AL_DIA[0], checksum: 'c'.repeat(64) }, AL_DIA[1]], `Checksum distinto entre la base y el archivo: ${A.nombre}.`],
      ['una migración incompleta', [...AL_DIA, { ...AL_DIA[0], terminada: false }], `Migración incompleta o fallida (ni terminada ni revertida): ${A.nombre}.`],
      ['una migración duplicada', [...AL_DIA, AL_DIA[0]], `Migración aplicada más de una vez (2): ${A.nombre}.`],
      ['la ausencia de H1', [AL_DIA[0]], `${H1.nombre} debe estar aplicada una vez y lo está 0.`],
      ['la ausencia de _prisma_migrations', null, 'La base no tiene la tabla _prisma_migrations'],
    ] as const)('%s', async (_caso, historial, motivo) => {
      const e = escenario({ historial });
      const mensaje = await bloqueo(e);

      expect(mensaje).toContain(motivo);
      expect(mensaje).toContain('No se migra ni se repara');
      expect(e.eventos).toEqual(ORDEN_COMPLETO);
      sinFragmentos(mensaje, SECRETOS_Y_REFERENCIA);
    });

    it('un fallo al leer el historial bloquea sin la URL', async () => {
      const mensaje = await bloqueo(escenario({ historial: 'falla' }));

      expect(mensaje).toContain('la lectura del historial de migraciones (código P1001)');
      sinFragmentos(mensaje, SECRETOS_Y_REFERENCIA);
    });

    it('un fallo al leer las migraciones del repositorio bloquea', async () => {
      expect(await bloqueo(escenario({ locales: 'falla' }))).toContain('No se pudo leer prisma/migrations.');
    });
  });
});

/*
 * Sobre el CÓDIGO FUENTE: el flujo completo del arranque (el módulo y todo lo que importa del proyecto) no tiene
 * ninguna ruta capaz de migrar. En este proyecto la única forma de migrar es lanzar el CLI de Prisma en un proceso hijo
 * (preparar-bd.ts) o escribir SQL; aquí se comprueba que no hay procesos hijos, ni CLI, ni SQL que no sea SELECT o
 * SET TRANSACTION READ ONLY. Los comentarios se excluyen: documentan, no ejecutan.
 */
describe('el arranque sin migraciones no contiene rutas de migración (código fuente)', () => {
  const sinComentarios = (texto: string): string => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fuente = (archivo: string): string => sinComentarios(readFileSync(join(__dirname, archivo), 'utf8'));
  const importacionesLocales = (archivo: string): string[] =>
    Array.from(fuente(archivo).matchAll(/from '\.\/([^']+)'/g), (m) => `${m[1]}.ts`);

  const flujo = (() => {
    const visitados = new Set<string>();
    const pendientes = ['preparar-bd-sin-migrar.ts'];
    for (let archivo = pendientes.pop(); archivo !== undefined; archivo = pendientes.pop()) {
      if (visitados.has(archivo)) continue;
      visitados.add(archivo);
      pendientes.push(...importacionesLocales(archivo));
    }
    return [...visitados].sort();
  })();

  it('el flujo es exactamente este conjunto de módulos (preparar-bd.ts no está)', () => {
    expect(flujo).toEqual(['centinela.ts', 'conexiones-centinela.ts', 'estado-migraciones.ts', 'guardia-bd.ts', 'preparar-bd-sin-migrar.ts']);
  });

  it.each([
    ['procesos hijos', /child_process|execFile|execSync|spawn\(|fork\(/],
    ['el CLI de Prisma o sus comandos de migración', /prisma[\\/]build|\bmigrate\b|db push|db execute/i],
    ['SQL sin parametrizar', /\$executeRawUnsafe|\$queryRawUnsafe/],
  ])('ningún módulo del flujo usa %s', (_caso, patron) => {
    for (const archivo of flujo) expect({ archivo, coincide: patron.test(fuente(archivo)) }).toEqual({ archivo, coincide: false });
  });

  it('el arranque no reutiliza el paso de migración de conexiones-centinela.ts (ni siquiera vacío)', () => {
    expect(fuente('preparar-bd-sin-migrar.ts')).not.toMatch(/verificarCentinelasYMigrar|migrar\s*[:(]/);
  });

  it('todo el SQL del flujo es de lectura: SELECT, o SET TRANSACTION READ ONLY al abrir cada transacción', () => {
    for (const archivo of flujo) {
      const texto = fuente(archivo);
      for (const [, sql] of texto.matchAll(/\$queryRaw(?:<[^`]*?>)?`([^`]*)`/g)) expect(sql.trim()).toMatch(/^SELECT\s/);
      for (const [, sql] of texto.matchAll(/\$executeRaw`([^`]*)`/g)) expect(sql.trim()).toBe('SET TRANSACTION READ ONLY');
    }
    const arranque = fuente('preparar-bd-sin-migrar.ts');
    const transacciones = arranque.split('$transaction(').length - 1;
    const enSoloLectura = arranque.match(/\$transaction\(\[\s*prisma\.\$executeRaw`SET TRANSACTION READ ONLY`/g) ?? [];
    expect(transacciones).toBeGreaterThan(0);
    expect(enSoloLectura).toHaveLength(transacciones);
  });
});

describe('runner exclusivo de I-46 (test/jest-integracion-h8b.json y npm run test:integracion:h8b)', () => {
  const CARPETA_TEST = join(__dirname, '..');
  const leerConfiguracion = (archivo: string) => JSON.parse(readFileSync(join(CARPETA_TEST, archivo), 'utf8')) as Record<string, unknown>;
  const configuracion = leerConfiguracion('jest-integracion-h8b.json');
  const general = leerConfiguracion('jest-integracion.json');
  const paquete = JSON.parse(readFileSync(join(CARPETA_TEST, '..', 'package.json'), 'utf8')) as Record<string, unknown> & {
    scripts: Record<string, string>;
  };
  const scripts = paquete.scripts;

  const archivosDe = (carpeta: string): string[] =>
    readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) =>
      entrada.isDirectory() ? archivosDe(join(carpeta, entrada.name)) : [join(carpeta, entrada.name)],
    );

  /**
   * La selección que hace Jest con una configuración, sin ejecutar Jest ni su globalSetup: los archivos de test/
   * (rootDir) que cumplen testRegex y no cumplen ningún testPathIgnorePatterns (por omisión, /node_modules/).
   * Devuelve rutas relativas con «/». Las rutas reales de cada plataforma (con «/» o «\\») se prueban aparte.
   */
  const seleccion = (config: Record<string, unknown>): string[] => {
    const patron = new RegExp(String(config.testRegex));
    const ignorados = ((config.testPathIgnorePatterns as string[] | undefined) ?? ['/node_modules/']).map((texto) => new RegExp(texto));
    return archivosDe(CARPETA_TEST)
      .filter((archivo) => patron.test(archivo) && !ignorados.some((ignorado) => ignorado.test(archivo)))
      .map((archivo) => archivo.slice(CARPETA_TEST.length + 1).replace(/\\/g, '/'))
      .sort();
  };

  /** Las 16 suites de integración anteriores a H8b-3, por nombre: ninguna puede salir del runner general. */
  const SUITES_GENERALES = [
    'anexo',
    'aprobacion-anexo',
    'auditoria-enlaces',
    'ca06',
    'correccion-entrega',
    'edicion-anexo',
    'edicion',
    'enlace',
    'historial-enlaces',
    'k9-propuesta',
    'maquina-concurrencia',
    'motivo-rechazo',
    'motivo-reprogramacion',
    'proyecciones-enlaces',
    'subespacios',
    'transaccion-interactiva',
  ].map((nombre) => `integracion/${nombre}.int-spec.ts`);
  const I46 = 'integracion/longitud-enlaces.int-spec.ts';

  it('usa siempre el arranque sin migraciones, una sola instancia y nada más que pueda ejecutar código antes', () => {
    expect(Object.keys(configuracion).sort()).toEqual(
      ['globalSetup', 'maxWorkers', 'moduleFileExtensions', 'rootDir', 'testEnvironment', 'testRegex', 'testTimeout', 'transform'].sort(),
    );
    expect(configuracion.globalSetup).toBe('<rootDir>/integracion/preparar-bd-sin-migrar.ts');
    expect(configuracion.maxWorkers).toBe(1);
  });

  it('solo admite longitud-enlaces.int-spec.ts entre todos los archivos de test/ (también con rutas de Windows)', () => {
    const patron = new RegExp(String(configuracion.testRegex));
    const admitidos = archivosDe(CARPETA_TEST).filter((archivo) => patron.test(archivo));

    expect(admitidos.map((archivo) => archivo.slice(CARPETA_TEST.length + 1).replace(/\\/g, '/'))).toEqual(['integracion/longitud-enlaces.int-spec.ts']);
    expect(patron.test('C:\\proyecto\\backend\\test\\integracion\\longitud-enlaces.int-spec.ts')).toBe(true);
    expect(patron.test('C:\\proyecto\\backend\\test\\integracion\\anexo.int-spec.ts')).toBe(false);
  });

  it('el runner exclusivo selecciona solo I-46, también aplicando testPathIgnorePatterns', () => {
    expect(seleccion(configuracion)).toEqual([I46]);
  });

  it('el runner general excluye I-46 y sigue seleccionando exactamente las 16 suites anteriores', () => {
    expect(seleccion(general)).toEqual([...SUITES_GENERALES].sort());
    expect(seleccion(general)).not.toContain(I46);
  });

  it('la exclusión del runner general es específica y vale con rutas Windows y Unix', () => {
    const ignorados = (general.testPathIgnorePatterns as string[]).map((texto) => new RegExp(texto));
    const ignorado = (ruta: string): boolean => ignorados.some((patron) => patron.test(ruta));

    expect(general.testPathIgnorePatterns).toEqual(['/node_modules/', '[/\\\\]integracion[/\\\\]longitud-enlaces\\.int-spec\\.ts$']);
    expect(ignorado('/proyecto/backend/test/integracion/longitud-enlaces.int-spec.ts')).toBe(true);
    expect(ignorado('C:\\proyecto\\backend\\test\\integracion\\longitud-enlaces.int-spec.ts')).toBe(true);
    for (const parecido of ['otra-longitud-enlaces.int-spec.ts', 'longitud-enlaces.int-spec.ts.bak', 'longitud-enlacesXint-spec.ts']) {
      expect(ignorado(`/proyecto/backend/test/integracion/${parecido}`)).toBe(false);
    }
  });

  it('entre los dos runners cubren todas las suites de integración, sin solaparse', () => {
    const todas = archivosDe(CARPETA_TEST)
      .map((archivo) => archivo.slice(CARPETA_TEST.length + 1).replace(/\\/g, '/'))
      .filter((archivo) => archivo.endsWith('.int-spec.ts'))
      .sort();

    expect([...seleccion(general), ...seleccion(configuracion)].sort()).toEqual(todas);
    expect(seleccion(general).filter((archivo) => seleccion(configuracion).includes(archivo))).toEqual([]);
  });

  it('ninguna opción compartida anula la separación', () => {
    // Cada runner con su propio arranque: el general migra (preparar-bd.ts); el exclusivo no (preparar-bd-sin-migrar.ts).
    expect(general.globalSetup).toBe('<rootDir>/integracion/preparar-bd.ts');
    expect(configuracion.globalSetup).toBe('<rootDir>/integracion/preparar-bd-sin-migrar.ts');
    // Ninguna configuración se combina con otra: sin projects, preset, testMatch ni roots, y la misma raíz (test/).
    for (const config of [general, configuracion]) {
      for (const clave of ['projects', 'preset', 'testMatch', 'roots', 'setupFiles', 'setupFilesAfterEnv', 'globalTeardown']) {
        expect({ clave, presente: clave in config }).toEqual({ clave, presente: false });
      }
      expect(config.rootDir).toBe('.');
    }
    expect(Object.keys(general).sort()).toEqual(
      ['globalSetup', 'maxWorkers', 'moduleFileExtensions', 'rootDir', 'testEnvironment', 'testPathIgnorePatterns', 'testRegex', 'testTimeout', 'transform'].sort(),
    );
    // package.json no tiene configuración de Jest que pudiera mezclarse con --config.
    expect('jest' in paquete).toBe(false);
    // El runner unitario (jest.config.ts) tampoco selecciona suites de integración.
    const unitario = /testRegex:\s*'([^']+)'/.exec(readFileSync(join(CARPETA_TEST, '..', 'jest.config.ts'), 'utf8'));
    expect(unitario).not.toBeNull();
    expect(new RegExp((unitario as RegExpExecArray)[1].replace(/\\\\/g, '\\')).test(`/x/test/${I46}`)).toBe(false);
  });

  it('el script exclusivo usa esa configuración, y el runner general no cambió', () => {
    expect(scripts['test:integracion:h8b']).toBe(
      'node --env-file=.env.integracion --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-integracion-h8b.json',
    );
    expect(scripts['test:integracion']).toBe(
      'node --env-file=.env.integracion --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-integracion.json',
    );
  });
});
