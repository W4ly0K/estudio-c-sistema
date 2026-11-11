import { exigirCentinela, MENSAJE_SIN_CENTINELA, type ConsultasCentinela } from './centinela';

/**
 * Guardia de integración, capa 3 en CADA conexión (Fase 9 · H3-B2).
 *
 * El centinela se exige por la URL de consultas (INTEGRACION_DATABASE_URL) y por la directa
 * (INTEGRACION_DIRECT_URL), que es con la que prisma migrate deploy escribe. Solo si las dos lo
 * superan se migra. Antes, la capa 3 solo se comprobaba en la de consultas y la directa dependía de
 * que la capa 1 deducía la misma referencia del texto de ambas URLs.
 *
 * Módulo puro: las conexiones, la migración y el registro se inyectan, así que se prueba sin base de
 * datos. Ningún mensaje lleva la URL: el error del driver puede incluir el host o la cadena completa,
 * así que nunca se copia; solo se conserva el código de error de Prisma (P1001…), si lo hay.
 */
export type RolDeConexion = 'consultas' | 'migraciones';

export interface ConexionAVerificar {
  /** Los roles que cubre esta URL: los dos cuando la directa falta o es idéntica a la de consultas. */
  readonly roles: readonly RolDeConexion[];
  readonly url: string;
}

export interface ClienteCentinela {
  readonly consultas: ConsultasCentinela;
  desconectar(): Promise<void>;
}

export interface DependenciasPreparacion {
  crearCliente(url: string): ClienteCentinela;
  migrar(): void;
  registrar(mensaje: string): void;
}

const PREFIJO = '⛔ Guardia de integración (capa 3):';
const CODIGO_PRISMA = /^P\d{4}$/;

/**
 * Una entrada por URL distinta. Si las dos cadenas son idénticas, el destino es el mismo y basta una
 * comprobación que cubre ambos roles: verificarlo dos veces no añade ninguna garantía. Si difieren en
 * cualquier carácter (otro puerto, otro usuario, otro parámetro), se verifican las dos.
 */
export function conexionesAVerificar(urlConsultas: string, urlMigraciones: string): ConexionAVerificar[] {
  if (urlMigraciones === urlConsultas) {
    return [{ roles: ['consultas', 'migraciones'], url: urlConsultas }];
  }
  return [
    { roles: ['consultas'], url: urlConsultas },
    { roles: ['migraciones'], url: urlMigraciones },
  ];
}

const etiqueta = (roles: readonly RolDeConexion[]): string => roles.join(' y ');

/** Código de error de Prisma, si lo hay. Nunca el mensaje: puede contener el host o la URL. */
function codigoSeguro(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'errorCode' in error) {
    const codigo = error.errorCode;
    if (typeof codigo === 'string' && CODIGO_PRISMA.test(codigo)) return codigo;
  }
  return null;
}

/** Error sin datos de conexión. El original no se encadena (cause) porque Node lo imprimiría. */
function errorSeguro(roles: readonly RolDeConexion[], error: unknown): Error {
  if (error instanceof Error && error.message === MENSAJE_SIN_CENTINELA) {
    return new Error(`${MENSAJE_SIN_CENTINELA} Conexión: ${etiqueta(roles)}. No se migra.`);
  }
  const codigo = codigoSeguro(error);
  const detalle = codigo === null ? '' : ` (código ${codigo})`;
  return new Error(`${PREFIJO} no se pudo verificar el centinela en la conexión de ${etiqueta(roles)}${detalle}. No se migra.`);
}

/**
 * Verifica el centinela en cada conexión, en orden, y solo después migra. Cualquier fallo interrumpe
 * el procedimiento antes de migrar. Cada cliente se desconecta aunque la verificación falle.
 */
export async function verificarCentinelasYMigrar(
  conexiones: readonly ConexionAVerificar[],
  dependencias: DependenciasPreparacion,
): Promise<void> {
  if (conexiones.length === 0) {
    throw new Error(`${PREFIJO} no hay conexiones que verificar. No se migra.`);
  }

  for (const { roles, url } of conexiones) {
    let cliente: ClienteCentinela;
    try {
      cliente = dependencias.crearCliente(url);
    } catch (error) {
      throw errorSeguro(roles, error);
    }

    try {
      await exigirCentinela(cliente.consultas);
    } catch (error) {
      throw errorSeguro(roles, error);
    } finally {
      try {
        await cliente.desconectar();
      } catch {
        // La desconexión no decide la seguridad: se avisa, pero no oculta el resultado de la verificación.
        dependencias.registrar(`Aviso: no se pudo cerrar la conexión de ${etiqueta(roles)}.`);
      }
    }

    dependencias.registrar(`Centinela verificado en la conexión de ${etiqueta(roles)}.`);
  }

  dependencias.migrar();
}
