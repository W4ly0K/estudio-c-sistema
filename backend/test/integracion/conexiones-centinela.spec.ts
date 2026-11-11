import { MENSAJE_SIN_CENTINELA, type ConsultasCentinela } from './centinela';
import {
  conexionesAVerificar,
  verificarCentinelasYMigrar,
  type ClienteCentinela,
  type DependenciasPreparacion,
} from './conexiones-centinela';

/**
 * Fase 9 · H3-B2 · La capa 3 se exige en la conexión de consultas y en la directa antes de migrar.
 * Sin base de datos: las conexiones son simuladas y cada paso queda en un registro de eventos.
 */
const URL_CONSULTAS = 'postgresql://postgres.refconsultas:secreto-consultas@host-consultas.ejemplo:6543/postgres';
const URL_DIRECTA = 'postgresql://postgres.refdirecta:secreto-directa@host-directo.ejemplo:5432/postgres';
const FRAGMENTOS_PROHIBIDOS = ['postgresql://', 'secreto', 'host-', 'refconsultas', 'refdirecta', '6543', '5432'];

type Comportamiento = 'con-centinela' | 'sin-centinela' | 'sin-marcas' | 'falla-conexion' | 'falla-creacion';

interface Escenario {
  readonly dependencias: DependenciasPreparacion;
  readonly eventos: string[];
  readonly mensajes: string[];
}

const nombreDe = (url: string): string => (url === URL_CONSULTAS ? 'consultas' : 'directa');

function escenario(
  comportamiento: Readonly<Record<string, Comportamiento>>,
  opciones: { readonly fallaMigracion?: boolean; readonly fallaDesconexion?: boolean } = {},
): Escenario {
  const eventos: string[] = [];
  const mensajes: string[] = [];
  const dependencias: DependenciasPreparacion = {
    crearCliente: (url: string): ClienteCentinela => {
      const nombre = nombreDe(url);
      const modo = comportamiento[url] ?? 'con-centinela';
      if (modo === 'falla-creacion') {
        eventos.push(`crear-fallido:${nombre}`);
        throw new Error(`URL inválida: ${url}`);
      }
      eventos.push(`crear:${nombre}`);
      const consultas: ConsultasCentinela = {
        existeTabla: async () => {
          eventos.push(`existe:${nombre}`);
          if (modo === 'falla-conexion') {
            throw Object.assign(new Error(`Can't reach database server at ${url}`), { errorCode: 'P1001' });
          }
          return modo !== 'sin-centinela';
        },
        contarMarcas: async () => {
          eventos.push(`contar:${nombre}`);
          return modo === 'sin-marcas' ? 0 : 1;
        },
      };
      return {
        consultas,
        desconectar: async () => {
          eventos.push(`desconectar:${nombre}`);
          if (opciones.fallaDesconexion === true) throw new Error(`cierre fallido en ${url}`);
        },
      };
    },
    migrar: () => {
      eventos.push('migrar');
      if (opciones.fallaMigracion === true) throw new Error('migrate deploy terminó con error');
    },
    registrar: (mensaje: string) => {
      mensajes.push(mensaje);
    },
  };
  return { dependencias, eventos, mensajes };
}

async function errorDe(promesa: Promise<void>): Promise<Error> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error('se rechazó con algo que no es un Error');
  }
  throw new Error('se esperaba un rechazo');
}

const sinDatosDeConexion = (texto: string): boolean => FRAGMENTOS_PROHIBIDOS.every((f) => !texto.includes(f));

describe('conexionesAVerificar', () => {
  it('dos URLs distintas → dos verificaciones, una por rol', () => {
    expect(conexionesAVerificar(URL_CONSULTAS, URL_DIRECTA)).toEqual([
      { roles: ['consultas'], url: URL_CONSULTAS },
      { roles: ['migraciones'], url: URL_DIRECTA },
    ]);
  });

  it('la misma URL → una sola verificación que cubre los dos roles', () => {
    expect(conexionesAVerificar(URL_CONSULTAS, URL_CONSULTAS)).toEqual([
      { roles: ['consultas', 'migraciones'], url: URL_CONSULTAS },
    ]);
  });
});

describe('verificarCentinelasYMigrar (capa 3 en cada conexión antes de migrar)', () => {
  const ambas = conexionesAVerificar(URL_CONSULTAS, URL_DIRECTA);

  it('las dos conexiones tienen el centinela → migra solo después de verificar y cerrar ambas', async () => {
    const { dependencias, eventos, mensajes } = escenario({});
    await verificarCentinelasYMigrar(ambas, dependencias);
    expect(eventos).toEqual([
      'crear:consultas', 'existe:consultas', 'contar:consultas', 'desconectar:consultas',
      'crear:directa', 'existe:directa', 'contar:directa', 'desconectar:directa',
      'migrar',
    ]);
    expect(mensajes).toEqual([
      'Centinela verificado en la conexión de consultas.',
      'Centinela verificado en la conexión de migraciones.',
    ]);
  });

  it('falla la conexión de consultas (sin centinela) → no se crea la directa ni se migra', async () => {
    const { dependencias, eventos } = escenario({ [URL_CONSULTAS]: 'sin-centinela' });
    const error = await errorDe(verificarCentinelasYMigrar(ambas, dependencias));
    expect(error.message.startsWith(MENSAJE_SIN_CENTINELA)).toBe(true);
    expect(error.message.includes('Conexión: consultas.')).toBe(true);
    expect(eventos).toEqual(['crear:consultas', 'existe:consultas', 'desconectar:consultas']);
  });

  it('falla la conexión directa (centinela sin marcas) → no se migra y se cierran las dos', async () => {
    const { dependencias, eventos } = escenario({ [URL_DIRECTA]: 'sin-marcas' });
    const error = await errorDe(verificarCentinelasYMigrar(ambas, dependencias));
    expect(error.message.startsWith(MENSAJE_SIN_CENTINELA)).toBe(true);
    expect(error.message.includes('Conexión: migraciones.')).toBe(true);
    expect(eventos.includes('migrar')).toBe(false);
    expect(eventos.filter((e) => e.startsWith('desconectar:'))).toEqual(['desconectar:consultas', 'desconectar:directa']);
  });

  it('error de red en la directa → no se migra y el mensaje no lleva la URL, solo el código', async () => {
    const { dependencias, eventos } = escenario({ [URL_DIRECTA]: 'falla-conexion' });
    const error = await errorDe(verificarCentinelasYMigrar(ambas, dependencias));
    expect(error.message).toBe(
      '⛔ Guardia de integración (capa 3): no se pudo verificar el centinela en la conexión de migraciones (código P1001). No se migra.',
    );
    expect(sinDatosDeConexion(error.message)).toBe(true);
    expect(error.cause).toBe(undefined);
    expect(eventos.includes('migrar')).toBe(false);
    expect(eventos.includes('desconectar:directa')).toBe(true);
  });

  it('no se puede ni crear el cliente → no se migra y el mensaje no lleva la URL', async () => {
    const { dependencias, eventos } = escenario({ [URL_CONSULTAS]: 'falla-creacion' });
    const error = await errorDe(verificarCentinelasYMigrar(ambas, dependencias));
    expect(sinDatosDeConexion(error.message)).toBe(true);
    expect(eventos).toEqual(['crear-fallido:consultas']);
  });

  it('la migración falla → la excepción interrumpe el procedimiento', async () => {
    const { dependencias, eventos } = escenario({}, { fallaMigracion: true });
    const error = await errorDe(verificarCentinelasYMigrar(ambas, dependencias));
    expect(error.message).toBe('migrate deploy terminó con error');
    expect(eventos[eventos.length - 1]).toBe('migrar');
  });

  it('un cierre fallido se avisa sin la URL y no oculta el rechazo del centinela', async () => {
    const { dependencias, eventos, mensajes } = escenario({ [URL_CONSULTAS]: 'sin-centinela' }, { fallaDesconexion: true });
    const error = await errorDe(verificarCentinelasYMigrar(ambas, dependencias));
    expect(error.message.startsWith(MENSAJE_SIN_CENTINELA)).toBe(true);
    expect(mensajes).toEqual(['Aviso: no se pudo cerrar la conexión de consultas.']);
    expect(eventos.includes('migrar')).toBe(false);
  });

  it('la misma URL en los dos roles → una verificación y después migra', async () => {
    const { dependencias, eventos, mensajes } = escenario({});
    await verificarCentinelasYMigrar(conexionesAVerificar(URL_CONSULTAS, URL_CONSULTAS), dependencias);
    expect(eventos).toEqual(['crear:consultas', 'existe:consultas', 'contar:consultas', 'desconectar:consultas', 'migrar']);
    expect(mensajes).toEqual(['Centinela verificado en la conexión de consultas y migraciones.']);
  });

  it('sin conexiones → rechazo y no migra', async () => {
    const { dependencias, eventos } = escenario({});
    const error = await errorDe(verificarCentinelasYMigrar([], dependencias));
    expect(error.message.includes('no hay conexiones que verificar')).toBe(true);
    expect(eventos).toEqual([]);
  });

  it('ningún mensaje registrado ni de error lleva URLs o credenciales', async () => {
    const casos: Readonly<Record<string, Comportamiento>>[] = [
      {},
      { [URL_CONSULTAS]: 'sin-centinela' },
      { [URL_DIRECTA]: 'falla-conexion' },
      { [URL_CONSULTAS]: 'falla-creacion' },
    ];
    for (const comportamiento of casos) {
      const { dependencias, mensajes } = escenario(comportamiento, { fallaDesconexion: true });
      const textos = [...mensajes];
      try {
        await verificarCentinelasYMigrar(ambas, dependencias);
      } catch (error) {
        if (error instanceof Error) textos.push(error.message);
      }
      textos.push(...mensajes);
      expect(textos.every(sinDatosDeConexion)).toBe(true);
    }
  });
});
