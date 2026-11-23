import { z } from 'zod';
import { ESTADOS, ROLES } from './maquina-estados';

/**
 * Contrato de la API validado en TIEMPO DE EJECUCIÓN (Decisión DC1).
 *
 * Los tipos de TypeScript desaparecen al compilar: sin esta capa, res.json() es un
 * `any` que la UI usaría a ciegas. Cada tipo se DERIVA de su esquema (z.infer), así
 * que el validador y el tipo no pueden contradecirse.
 *
 * Lector tolerante: z.object descarta los campos que el frontend no declara (un
 * campo nuevo del backend no rompe nada), pero un campo declarado que falta o llega
 * con otro tipo es un error explícito. Los estados son estrictos (fail-closed): un
 * estado fuera del diagrama hace fallar la respuesta completa.
 *
 * Las fechas se validan como texto ISO 8601 y siguen siendo texto: convertirlas y
 * mostrarlas en la hora de Bogotá es del paso 6.3.
 */

/** Mismo orden que el enum CategoriaSolicitud de Prisma (contrato.test.ts lo vigila). */
export const CATEGORIAS = ['PODCAST', 'VIDEO', 'ESPACIOS', 'STREAMING', 'ASESORIAS'] as const;

/**
 * Fase 7 · PRD v2.2 §5.1: mismo orden que el enum SubEspacio de Prisma (contrato.test.ts lo
 * vigila). Los dos primeros son físicos; el completo ocupa los dos.
 */
export const SUB_ESPACIOS = ['CABINA_AUDIO', 'ESTUDIO_GRABACION', 'ESTUDIO_COMPLETO'] as const;

/**
 * Fase 7 · 7B.4 (ADR-007 SE10, directriz del 26/10/2026): la única categoría en la que el
 * solicitante elige el sub-espacio. Copia de la constante del backend (contrato.test.ts la vigila).
 */
export const CATEGORIA_QUE_ELIGE_SUB_ESPACIO = 'ESPACIOS' satisfies (typeof CATEGORIAS)[number];

export const esquemaEstado = z.enum(ESTADOS);
export const esquemaRol = z.enum(ROLES);
export const esquemaCategoria = z.enum(CATEGORIAS);
export type Categoria = z.infer<typeof esquemaCategoria>;
export const esquemaSubEspacio = z.enum(SUB_ESPACIOS);
export type SubEspacio = z.infer<typeof esquemaSubEspacio>;

const fechaIso = z.iso.datetime({ offset: true });
const textoNoVacio = z.string().min(1);

// --- Autenticación -------------------------------------------------------------

export const esquemaUsuarioSesion = z.object({
  id: textoNoVacio,
  nombre: z.string(),
  rol: esquemaRol,
});
export type UsuarioSesion = z.infer<typeof esquemaUsuarioSesion>;

/** POST /auth/google/login */
export const esquemaRespuestaLogin = z.object({
  token: textoNoVacio,
  usuario: esquemaUsuarioSesion,
});
export type RespuestaLogin = z.infer<typeof esquemaRespuestaLogin>;

// --- Solicitudes -----------------------------------------------------------------

/** Columnas de la solicitud (POST /solicitudes y la `solicitud` del PATCH). */
export const esquemaSolicitud = z.object({
  radicado: textoNoVacio,
  categoria: esquemaCategoria,
  proposito: z.string(),
  num_participantes: z.number().int().nullable(),
  fecha_inicio: fechaIso,
  fecha_fin: fechaIso,
  fecha_propuesta_inicio: fechaIso.nullable(),
  fecha_propuesta_fin: fechaIso.nullable(),
  estado: esquemaEstado,
  es_urgencia: z.boolean(),
  /** Fase 7: estricto como los estados (fail-closed): un lugar desconocido no se pinta a ciegas. */
  sub_espacio: esquemaSubEspacio,
  /** Solo con una propuesta de reprogramación (CA-10); puede faltar en una anterior a la Fase 7. */
  sub_espacio_propuesto: esquemaSubEspacio.nullable(),
  /**
   * Fase 8 · requisito 4: el enlace del producto final. Texto o null, sin validarlo aquí: un dato
   * malo no debe tumbar toda la respuesta. La seguridad se aplica al pintarlo (esEnlaceSeguro).
   */
  enlace_entrega: z.string().nullable(),
  /**
   * Fase 9 · R9-1: el anexo opcional del solicitante (guion). Obligatorio en el contrato (D1,
   * fail-closed): si una proyección del backend lo pierde, la respuesta no se acepta en silencio.
   * Texto o null, sin validarlo aquí: la seguridad se aplica al pintarlo (esEnlaceSeguro).
   */
  enlace_anexo: z.string().nullable(),
});
export type Solicitud = z.infer<typeof esquemaSolicitud>;

const esquemaRecursoResumen = z.object({
  cantidad_solicitada: z.number().int(),
  recurso: z.object({ nombre: z.string() }),
});

/** GET /solicitudes/mis-solicitudes (cada elemento). */
export const esquemaSolicitudPropia = esquemaSolicitud.extend({
  recursos: z.array(esquemaRecursoResumen),
});
export type SolicitudPropia = z.infer<typeof esquemaSolicitudPropia>;

/** GET /solicitudes, solo STAFF (cada elemento). */
export const esquemaSolicitudTablero = esquemaSolicitudPropia.extend({
  usuario: z.object({ nombre: z.string(), correo: z.string() }),
});
export type SolicitudTablero = z.infer<typeof esquemaSolicitudTablero>;

/** Un registro de la línea de vida (README §8). */
export const esquemaLogSolicitante = z.object({
  estado_anterior: esquemaEstado,
  estado_nuevo: esquemaEstado,
  fecha_modificacion: fechaIso,
  /** Solo en el registro de T2. */
  motivo_rechazo: z.string().nullable(),
  /** Solo en el registro de T5 (Fase 6.1b): "Motivo informado por el Staff". */
  motivo_reprogramacion: z.string().nullable(),
});
export type LogSolicitante = z.infer<typeof esquemaLogSolicitante>;

/** GET /solicitudes/:radicado para el SOLICITANTE dueño (proyección mínima, README §8). */
export const esquemaDetalleSolicitante = esquemaSolicitud.extend({
  recursos: z.array(esquemaRecursoResumen),
  logs: z.array(esquemaLogSolicitante),
});
export type DetalleSolicitante = z.infer<typeof esquemaDetalleSolicitante>;

export const esquemaLogStaff = esquemaLogSolicitante.extend({
  id_log: textoNoVacio,
  modificado_por: textoNoVacio,
});
export type LogStaff = z.infer<typeof esquemaLogStaff>;

/** GET /solicitudes/:radicado para el STAFF (proyección completa). */
export const esquemaDetalleStaff = esquemaSolicitud.extend({
  id_usuario: textoNoVacio,
  usuario: z.object({ id_usuario: textoNoVacio, nombre: z.string(), correo: z.string(), rol: esquemaRol }),
  recursos: z.array(
    z.object({
      id_detalle: textoNoVacio,
      cantidad_solicitada: z.number().int(),
      recurso: z.object({ id_recurso: z.number().int(), nombre: z.string(), cantidad_total: z.number().int() }),
    }),
  ),
  logs: z.array(esquemaLogStaff),
});
export type DetalleStaff = z.infer<typeof esquemaDetalleStaff>;

/** Respuesta de los comandos y del PATCH: `{ mensaje, solicitud }` (README §10 y §12). */
export function esquemaRespuestaComando<T extends z.ZodType>(esquemaDeLaSolicitud: T) {
  return z.object({ mensaje: z.string(), solicitud: esquemaDeLaSolicitud });
}

/**
 * Fase 9 · ADR-009 AN14 (DJ2-2) y ADR-012 D10 (K3): respuesta de PATCH /solicitudes/:radicado/anexo.
 * `sin_cambios` es OBLIGATORIO (fail-closed): sin él no se distingue un cambio efectivo de uno
 * que no escribió. `solicitud` es la proyección del dueño, también cuando no hubo escritura.
 */
export const esquemaRespuestaEdicionAnexo = esquemaRespuestaComando(esquemaDetalleSolicitante).extend({
  sin_cambios: z.boolean(),
});
export type RespuestaEdicionAnexo = z.infer<typeof esquemaRespuestaEdicionAnexo>;

// --- Fase 9 · K4: historial de enlaces y corrección de la entrega (solo STAFF) ------------------

/** Copia del enum CampoEnlace de schema.prisma (contrato.test.ts la compara). */
export const CAMPOS_ENLACE = ['ANEXO', 'ENTREGA'] as const;

/**
 * Un evento de GET /solicitudes/:radicado/historial-enlaces (J2b · DJ2b-2): EXACTAMENTE los siete
 * campos de SELECT_HISTORIAL_ENLACES, con `strictObject` (un campo de más se rechaza: K4 · DK4-2).
 * La nulabilidad es la del MOTOR (migración 20261109110000), no la del camino habitual:
 *  - B8: motivo_correccion solo en ENTREGA.
 *  - B4: ENTREGA siempre con enlace_nuevo; enlace_anterior admite NULL en la base (EN8 lo
 *    garantiza solo el servicio), así que aquí también.
 *  - B2: un cambio real (el anterior y el nuevo distintos), en la refinación de abajo.
 */
const camposComunesDelEvento = {
  id_log: textoNoVacio,
  modificado_por: textoNoVacio,
  fecha_modificacion: fechaIso,
};
const esquemaEventoAnexo = z.strictObject({
  ...camposComunesDelEvento,
  enlace_campo: z.literal('ANEXO'),
  enlace_anterior: z.string().nullable(),
  enlace_nuevo: z.string().nullable(),
  motivo_correccion: z.null(),
});
const esquemaEventoEntrega = z.strictObject({
  ...camposComunesDelEvento,
  enlace_campo: z.literal('ENTREGA'),
  enlace_anterior: z.string().nullable(),
  enlace_nuevo: z.string(),
  motivo_correccion: z.string().nullable(),
});
export const esquemaEventoEnlace = z
  .discriminatedUnion('enlace_campo', [esquemaEventoAnexo, esquemaEventoEntrega])
  .refine((evento) => evento.enlace_anterior !== evento.enlace_nuevo, { message: 'Un evento de enlace es un cambio real (B2).' });
export type EventoEnlace = z.infer<typeof esquemaEventoEnlace>;

export const esquemaHistorialEnlaces = z.strictObject({
  radicado: textoNoVacio,
  eventos: z.array(esquemaEventoEnlace),
});
export type HistorialEnlaces = z.infer<typeof esquemaHistorialEnlaces>;

/** PATCH /solicitudes/:radicado/enlace-entrega (DJ3-4): proyección del Staff y `sin_cambios` obligatorio. */
export const esquemaRespuestaCorreccionEntrega = esquemaRespuestaComando(esquemaDetalleStaff).extend({
  sin_cambios: z.boolean(),
});
export type RespuestaCorreccionEntrega = z.infer<typeof esquemaRespuestaCorreccionEntrega>;

// --- Errores -----------------------------------------------------------------------

/**
 * Cuerpo de error de NestJS. `message` llega como texto o, desde el ValidationPipe,
 * como lista: el cliente (6.1.2) lo normaliza siempre a lista.
 */
export const esquemaCuerpoError = z.object({
  statusCode: z.number().int(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
});
export type CuerpoError = z.infer<typeof esquemaCuerpoError>;
