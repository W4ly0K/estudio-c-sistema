import type { INestApplication } from '@nestjs/common';

/**
 * CORS con lista blanca (Fase 6.2 · Decisión DS2).
 *
 * Qué protege: CORS es una barrera del NAVEGADOR. Impide que una página de otro
 * origen use la API desde el navegador de un usuario y lea las respuestas. No
 * protege contra un cliente fuera del navegador (curl, scripts): de eso se encargan
 * el JWT y los guards. Como el token viaja en un encabezado y no en una cookie,
 * CSRF no aplica; CORS es defensa en profundidad.
 */

export const VARIABLE_ORIGENES_CORS = 'CORS_ORIGENES';

const EJEMPLO = 'http://localhost:5173';

type OpcionesCors = NonNullable<Parameters<INestApplication['enableCors']>[0]>;

/**
 * Lee y valida la lista de orígenes permitidos (separados por comas). Fail-fast,
 * como JWT_SECRET: si la configuración no es válida, la API no arranca.
 */
export function leerOrigenesCors(valor: string | undefined): string[] {
  const origenes = (valor ?? '')
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen !== '');

  if (origenes.length === 0) {
    throw new Error(
      `FATAL ERROR: ${VARIABLE_ORIGENES_CORS} no está configurado. Lista los orígenes del frontend separados por comas (por ejemplo, ${EJEMPLO}).`,
    );
  }

  for (const origen of origenes) {
    if (origen === '*') {
      throw new Error(`FATAL ERROR: ${VARIABLE_ORIGENES_CORS} no admite "*": lista los orígenes exactos.`);
    }
    let url: URL;
    try {
      url = new URL(origen);
    } catch {
      throw new Error(`FATAL ERROR: "${origen}" en ${VARIABLE_ORIGENES_CORS} no es una URL válida (por ejemplo, ${EJEMPLO}).`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`FATAL ERROR: "${origen}" en ${VARIABLE_ORIGENES_CORS} debe usar http o https.`);
    }
    // El navegador compara el origen EXACTO: sin ruta, sin barra final, en minúsculas
    // y sin el puerto por defecto. URL.origin es la forma canónica.
    if (url.origin !== origen) {
      throw new Error(
        `FATAL ERROR: "${origen}" en ${VARIABLE_ORIGENES_CORS} no es un origen exacto (esquema://host[:puerto]). Use "${url.origin}".`,
      );
    }
  }

  return Array.from(new Set(origenes));
}

/** Opciones explícitas: solo los métodos y encabezados que usa el frontend. */
export function opcionesCors(origenes: readonly string[]): OpcionesCors {
  return {
    origin: [...origenes],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    credentials: false, // Sin cookies: el JWT viaja en Authorization.
    maxAge: 600, // El navegador reutiliza el preflight 10 minutos.
  };
}

/**
 * Única forma de configurar CORS: la usan main.ts y la app de los e2e, así que las
 * pruebas ejercitan la configuración real (mismo criterio que crearValidationPipe()).
 */
export function aplicarCors(app: INestApplication, valor: string | undefined): void {
  app.enableCors(opcionesCors(leerOrigenesCors(valor)));
}
