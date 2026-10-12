import { vi } from 'vitest'
import { crearClienteApi, type ClienteApi, type FuncionFetch } from '../api/cliente'

/** Cargas válidas del contrato (README del backend §8 y §12), para las pruebas de src/api. */
export const BASE = 'http://api.prueba.local'
export const TOKEN = 'jwt-de-prueba'

export const SOLICITUD = {
  radicado: 'EC-2026-0142',
  categoria: 'PODCAST',
  proposito: 'Grabación del episodio piloto',
  num_participantes: 3,
  fecha_inicio: '2026-10-15T14:00:00.000Z',
  fecha_fin: '2026-10-15T16:00:00.000Z',
  fecha_propuesta_inicio: null,
  fecha_propuesta_fin: null,
  estado: 'Validado',
  es_urgencia: false,
} as const

export const RECURSOS_RESUMEN = [{ cantidad_solicitada: 2, recurso: { nombre: 'Micrófono de solapa' } }]

export const LOG = {
  estado_anterior: 'Recibido',
  estado_nuevo: 'Validado',
  fecha_modificacion: '2026-10-10T15:20:00.000Z',
  motivo_rechazo: null,
  motivo_reprogramacion: null,
} as const

export const DETALLE_SOLICITANTE = { ...SOLICITUD, recursos: RECURSOS_RESUMEN, logs: [LOG] }

export const DETALLE_STAFF = {
  ...SOLICITUD,
  id_usuario: 'uuid-solicitante',
  usuario: { id_usuario: 'uuid-solicitante', nombre: 'Ana', correo: 'ana@unicesmag.edu.co', rol: 'SOLICITANTE' },
  recursos: [
    { id_detalle: 'uuid-detalle', cantidad_solicitada: 2, recurso: { id_recurso: 4, nombre: 'Micrófono de solapa', cantidad_total: 6 } },
  ],
  logs: [{ ...LOG, id_log: 'uuid-log', modificado_por: 'uuid-staff' }],
}

/** Respuesta HTTP con cuerpo JSON. */
export const json = (status: number, cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Cliente con dependencias falsas (DC3). `token` es mutable a propósito: así se prueba
 * que el cliente lo consulta en cada petición.
 */
export function crearEntornoDePrueba(respuesta: Response | (() => Promise<Response>)) {
  const fetchFalso = vi.fn<FuncionFetch>(() => (typeof respuesta === 'function' ? respuesta() : Promise.resolve(respuesta)))
  const alExpirarSesion = vi.fn<() => void>()
  const sesion: { token: string | null } = { token: TOKEN }
  const cliente: ClienteApi = crearClienteApi({
    baseUrl: BASE,
    obtenerToken: () => sesion.token,
    alExpirarSesion,
    fetch: fetchFalso,
  })
  /** URL e init de la llamada número `n` (0 = la primera). */
  const llamada = (n = 0): { url: string; init: RequestInit } => {
    const argumentos = fetchFalso.mock.calls[n]
    if (argumentos === undefined) throw new Error(`fetch no recibió la llamada ${n}`)
    return { url: argumentos[0], init: argumentos[1] }
  }
  const encabezados = (n = 0): Record<string, string> => llamada(n).init.headers as Record<string, string>
  return { cliente, fetchFalso, alExpirarSesion, sesion, llamada, encabezados }
}
