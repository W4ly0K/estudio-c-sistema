import { z } from 'zod'
import type { ClienteApi, Resultado } from './cliente'
import {
  esquemaDetalleSolicitante,
  esquemaDetalleStaff,
  esquemaRespuestaComando,
  esquemaSolicitud,
  esquemaSolicitudPropia,
  esquemaSolicitudTablero,
  type Categoria,
  type DetalleSolicitante,
  type DetalleStaff,
  type Solicitud,
  type SolicitudPropia,
  type SolicitudTablero,
} from './esquemas'
import type { Estado, TRANSICIONES } from './maquina-estados'

/**
 * Una función tipada por ruta del contrato (README del backend §8 a §12).
 *
 * Los cuerpos son MÁS ESTRECHOS que lo que acepta el backend, a propósito: lo que el
 * servidor rechazaría con 400 o 409 por su forma, aquí no compila.
 */

/** POST /solicitudes. Las fechas, ISO 8601 con zona horaria explícita (README §9). */
export interface CuerpoCrearSolicitud {
  readonly categoria: Categoria
  readonly proposito: string
  readonly fecha_inicio: string
  readonly fecha_fin: string
  readonly recursos?: readonly { readonly id_recurso: number; readonly cantidad: number }[]
}

/**
 * Destinos que el tablero ejecuta con el PATCH (E1: T1, T2, T4, T9 y, desde la Fase 7, T10). Se DERIVAN de la
 * tabla de la máquina: "Pendiente de Reprogramación" (T5) no está y no compila.
 */
type TransicionDelTablero = Extract<
  (typeof TRANSICIONES)[number],
  { accion: 'APROBAR' | 'RECHAZAR' | 'INICIAR_PRODUCCION' | 'FINALIZAR' | 'CERRAR_NO_ATENDIDA' }
>
export type DestinoDelTablero = TransicionDelTablero['destino']

/**
 * PATCH /solicitudes/:radicado (solo STAFF). E5: `motivo_rechazo` solo existe junto
 * con un cambio a "Rechazado", y ahí es obligatorio.
 */
export type CambiosTablero = Partial<CuerpoCrearSolicitud> &
  (
    | { readonly estado?: Exclude<DestinoDelTablero, 'Rechazado'>; readonly motivo_rechazo?: never }
    | { readonly estado: 'Rechazado'; readonly motivo_rechazo: string }
  )

/** POST /solicitudes/:radicado/reprogramacion (T5 · README §12.2). */
export interface CuerpoProponerReprogramacion {
  readonly fecha_inicio: string
  readonly fecha_fin: string
  /** 10 a 500 caracteres sin los espacios de los extremos (Fase 6.1b). */
  readonly motivo: string
}

export interface FiltrosTablero {
  readonly estado?: Estado
  readonly categoria?: Categoria
}

export interface RespuestaComando<T> {
  readonly mensaje: string
  readonly solicitud: T
}

/** El radicado va codificado: un "/" o un "?" no pueden cambiar la ruta. */
const rutaDe = (radicado: string, sufijo = ''): string => `/solicitudes/${encodeURIComponent(radicado)}${sufijo}`

const respuestaSolicitante = esquemaRespuestaComando(esquemaDetalleSolicitante)

export function crearApiSolicitudes(cliente: ClienteApi) {
  return {
    /** GET /solicitudes/mis-solicitudes */
    misSolicitudes: (): Promise<Resultado<SolicitudPropia[]>> =>
      cliente.solicitar({ metodo: 'GET', ruta: '/solicitudes/mis-solicitudes', esquema: z.array(esquemaSolicitudPropia) }),

    /** GET /solicitudes (STAFF), con filtros opcionales. */
    tablero: (filtros: FiltrosTablero = {}): Promise<Resultado<SolicitudTablero[]>> => {
      const parametros = new URLSearchParams()
      if (filtros.estado !== undefined) parametros.set('estado', filtros.estado)
      if (filtros.categoria !== undefined) parametros.set('categoria', filtros.categoria)
      const consulta = parametros.toString()
      return cliente.solicitar({
        metodo: 'GET',
        ruta: consulta === '' ? '/solicitudes' : `/solicitudes?${consulta}`,
        esquema: z.array(esquemaSolicitudTablero),
      })
    },

    /** GET /solicitudes/:radicado con la proyección del SOLICITANTE (B3). */
    detalleSolicitante: (radicado: string): Promise<Resultado<DetalleSolicitante>> =>
      cliente.solicitar({ metodo: 'GET', ruta: rutaDe(radicado), esquema: esquemaDetalleSolicitante }),

    /** GET /solicitudes/:radicado con la proyección del STAFF. */
    detalleStaff: (radicado: string): Promise<Resultado<DetalleStaff>> =>
      cliente.solicitar({ metodo: 'GET', ruta: rutaDe(radicado), esquema: esquemaDetalleStaff }),

    /** POST /solicitudes (B2). Responde las columnas de la solicitud creada. */
    crear: (cuerpo: CuerpoCrearSolicitud): Promise<Resultado<Solicitud>> =>
      cliente.solicitar({ metodo: 'POST', ruta: '/solicitudes', cuerpo, esquema: esquemaSolicitud }),

    /** PATCH /solicitudes/:radicado (tablero del STAFF · T1, T2, T4 y T9). */
    actualizarTablero: (radicado: string, cambios: CambiosTablero): Promise<Resultado<RespuestaComando<Solicitud>>> =>
      cliente.solicitar({
        metodo: 'PATCH',
        ruta: rutaDe(radicado),
        cuerpo: cambios,
        esquema: esquemaRespuestaComando(esquemaSolicitud),
      }),

    /** POST /solicitudes/:radicado/reprogramacion (STAFF · T5). */
    proponerReprogramacion: (
      radicado: string,
      cuerpo: CuerpoProponerReprogramacion,
    ): Promise<Resultado<RespuestaComando<DetalleStaff>>> =>
      cliente.solicitar({
        metodo: 'POST',
        ruta: rutaDe(radicado, '/reprogramacion'),
        cuerpo,
        esquema: esquemaRespuestaComando(esquemaDetalleStaff),
      }),

    /** POST /solicitudes/:radicado/cancelar (SOLICITANTE dueño · T3 y T6). Sin cuerpo. */
    cancelar: (radicado: string): Promise<Resultado<RespuestaComando<DetalleSolicitante>>> =>
      cliente.solicitar({ metodo: 'POST', ruta: rutaDe(radicado, '/cancelar'), esquema: respuestaSolicitante }),

    /** POST /solicitudes/:radicado/reprogramacion/aceptar (SOLICITANTE dueño · T7). Sin cuerpo. */
    aceptarReprogramacion: (radicado: string): Promise<Resultado<RespuestaComando<DetalleSolicitante>>> =>
      cliente.solicitar({
        metodo: 'POST',
        ruta: rutaDe(radicado, '/reprogramacion/aceptar'),
        esquema: respuestaSolicitante,
      }),

    /** POST /solicitudes/:radicado/reprogramacion/rechazar (SOLICITANTE dueño · T8). Sin cuerpo. */
    rechazarReprogramacion: (radicado: string): Promise<Resultado<RespuestaComando<DetalleSolicitante>>> =>
      cliente.solicitar({
        metodo: 'POST',
        ruta: rutaDe(radicado, '/reprogramacion/rechazar'),
        esquema: respuestaSolicitante,
      }),
  }
}

export type ApiSolicitudes = ReturnType<typeof crearApiSolicitudes>
