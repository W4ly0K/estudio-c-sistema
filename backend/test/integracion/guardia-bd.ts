/**
 * Guardia de las pruebas de integración (Fase 4.6): capas 1 y 2.
 *
 * Lección del incidente 4.2: la guardia anterior comparaba el USUARIO de la URL.
 * Con la conexión directa de Supabase el usuario es "postgres" a secas, así que
 * la comparación pasaba aunque el proyecto fuera el mismo. Aquí se compara la
 * IDENTIDAD del recurso, venga del usuario o del host, y todo lo que no se
 * pueda identificar se rechaza (fail-closed).
 *
 * La capa 3 (tabla centinela dentro de la base) se verifica al conectar, en el
 * script de integración (4.6b). Este módulo es puro: sin red, BD ni process.env.
 */

/** Identidad de una base de datos, independiente de la sintaxis de la URL. */
export type IdentidadBd =
  | { readonly tipo: 'supabase'; readonly ref: string }
  | { readonly tipo: 'servidor'; readonly destino: string };

export type VeredictoGuardia =
  | { readonly permitido: true; readonly identidad: IdentidadBd }
  | { readonly permitido: false; readonly motivo: string };

export interface EntradaGuardia {
  /** INTEGRACION_DATABASE_URL e INTEGRACION_DIRECT_URL. */
  readonly urlsPrueba: readonly string[];
  /** Todas las URLs de conexión de backend/.env (puede estar vacía, p. ej. en CI). */
  readonly urlsProduccion: readonly string[];
  /** INTEGRACION_CONFIRMO_DESECHABLE: la identidad escrita a mano por la persona. */
  readonly confirmacion: string | undefined;
}

/** Las referencias de proyecto de Supabase tienen 20 caracteres [a-z0-9]. */
const REF_SUPABASE = /^[a-z0-9]{20}$/;
const HOST_DIRECTO_SUPABASE = /^db\.([a-z0-9]+)\.supabase\.co$/;
const DOMINIO_SUPABASE = /(^|\.)supabase\.(co|com)$/;
const CLAVES_DE_CONEXION = /^\s*#?\s*(?:export\s+)?(DATABASE_URL|DIRECT_URL)\s*=\s*(.*)$/;

/**
 * Identidad de la base a la que apunta una URL de PostgreSQL, o null si no se
 * puede determinar con certeza. Nunca incluye credenciales.
 */
export function identidadDe(url: string): IdentidadBd | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:') return null;

  const host = u.hostname.toLowerCase();
  if (host === '') return null;
  const usuario = decodeURIComponent(u.username).toLowerCase();
  const refUsuario = usuario.startsWith('postgres.') ? usuario.slice('postgres.'.length) : null;
  const refHost = HOST_DIRECTO_SUPABASE.exec(host)?.[1] ?? null;

  // Dos pistas que se contradicen: no se adivina cuál vale.
  if (refUsuario !== null && refHost !== null && refUsuario !== refHost) return null;

  const ref = refUsuario ?? refHost;
  if (ref !== null) {
    return REF_SUPABASE.test(ref) ? { tipo: 'supabase', ref } : null;
  }
  // Un host de Supabase sin referencia identificable (p. ej. pooler con usuario
  // "postgres") no se puede distinguir de producción.
  if (DOMINIO_SUPABASE.test(host)) return null;

  const base = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (base === '') return null;
  return { tipo: 'servidor', destino: `${host}:${u.port === '' ? '5432' : u.port}/${base}` };
}

/** Texto que identifica la base: la referencia de Supabase o host:puerto/base. */
export function etiquetaDe(identidad: IdentidadBd): string {
  return identidad.tipo === 'supabase' ? identidad.ref : identidad.destino;
}

export function mismaIdentidad(a: IdentidadBd, b: IdentidadBd): boolean {
  return a.tipo === b.tipo && etiquetaDe(a) === etiquetaDe(b);
}

/**
 * TODAS las URLs de conexión de un .env: incluye duplicados y líneas
 * comentadas. Una URL de producción comentada o repetida sigue siendo de
 * producción (el .env real llegó a tener DIRECT_URL duplicado).
 */
export function urlsDeConexionEnEnv(contenido: string): string[] {
  const urls: string[] = [];
  for (const linea of contenido.split(/\r?\n/)) {
    const m = CLAVES_DE_CONEXION.exec(linea);
    if (!m) continue;
    const valor = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    if (valor !== '') urls.push(valor);
  }
  return urls;
}

const rechazo = (motivo: string): VeredictoGuardia => ({ permitido: false, motivo });

/** Capas 1 (identidad del proyecto) y 2 (confirmación explícita). */
export function evaluarGuardia(entrada: EntradaGuardia): VeredictoGuardia {
  if (entrada.urlsPrueba.length === 0) {
    return rechazo('Faltan INTEGRACION_DATABASE_URL / INTEGRACION_DIRECT_URL.');
  }

  const identidadesPrueba = entrada.urlsPrueba.map(identidadDe);
  const primera = identidadesPrueba[0];
  if (primera === null || identidadesPrueba.some((i) => i === null)) {
    return rechazo('No se pudo identificar con certeza la base de pruebas (fail-closed).');
  }
  if (identidadesPrueba.some((i) => i !== null && !mismaIdentidad(i, primera))) {
    return rechazo('INTEGRACION_DATABASE_URL e INTEGRACION_DIRECT_URL apuntan a bases distintas.');
  }

  for (const url of entrada.urlsProduccion) {
    const prod = identidadDe(url);
    if (prod === null) {
      return rechazo('Una URL de backend/.env no se pudo identificar: no hay con qué comparar (fail-closed).');
    }
    if (mismaIdentidad(prod, primera)) {
      return rechazo(`La base de pruebas (${etiquetaDe(primera)}) es la MISMA que una de producción.`);
    }
  }

  const esperada = etiquetaDe(primera);
  if (entrada.confirmacion?.trim() !== esperada) {
    return rechazo(`Confirma la base desechable con INTEGRACION_CONFIRMO_DESECHABLE=${esperada}.`);
  }

  return { permitido: true, identidad: primera };
}
