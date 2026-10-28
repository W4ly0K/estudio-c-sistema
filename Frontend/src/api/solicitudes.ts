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
  type SubEspacio,
  type CATEGORIA_QUE_ELIGE_SUB_ESPACIO,
} from './esquemas'
import type { Estado, TRANSICIONES } from './maquina-estados'

/**
 * Una función tipada por ruta del contrato (README del backend §8 a §12).
 *
 * Los cuerpos son MÁS ESTRECHOS que lo que acepta el backend, a propósito: lo que el
 * servidor rechazaría con 400 o 409 por su forma, aquí no compila.
 */

/** Lo común a toda radicación. Las fechas, ISO 8601 con zona horaria explícita (README §9). */
interface RadicacionComun {
  readonly proposito: string
  readonly fecha_inicio: string
  readonly fecha_fin: string
  readonly recursos?: readonly { readonly id_recurso: number; readonly cantidad: number }[]
}

/** La categoría en la que el solicitante elige el lugar (SE10). */
type CategoriaQueElige = typeof CATEGORIA_QUE_ELIGE_SUB_ESPACIO

/**
 * POST /solicitudes. Fase 7 · 7B.4 (ADR-007 SE10): unión discriminada por la categoría, igual
 * que la regla del backend. Una solicitud de espacio físico SIN lugar (CA-12) o un servicio
 * CON lugar (400 del servidor) no compilan: el servidor nunca elige por el solicitante, y el
 * cliente nunca envía una elección que el servidor rechazaría.
 */
export type CuerpoCrearSolicitud =
  | (RadicacionComun & { readonly categoria: CategoriaQueElige; readonly sub_espacio: SubEspacio })
  | (RadicacionComun & { readonly categoria: Exclude<Categoria, CategoriaQueElige>; readonly sub_espacio?: never })

/**
 * Destinos que el tablero ejecuta con el PATCH (E1: T1, T2, T4, T9, desde la Fase 7 T10 y, desde la Fase 8, T11 y T12). Se DERIVAN de la
 * tabla de la máquina: "Pendiente de Reprogramación" (T5) no está y no compila.
 */
type TransicionDelTablero = Extract<
  (typeof TRANSICIONES)[number],
  { accion: 'APROBAR' | 'RECHAZAR' | 'INICIAR_PRODUCCION' | 'FINALIZAR' | 'CERRAR_NO_ATENDIDA' | 'INICIAR_EDICION' }
>
export type DestinoDelTablero = TransicionDelTablero['destino']

/**
 * Fase 7 · 7B.3 "Validar con ajustes" (PRD v2.2 §5.6; Q-B2 y D-4): lo que puede acompañar a
 * T1 en el MISMO PATCH. La franja viaja completa o no viaja (con una sola fecha, el servidor
 * mezclaría la otra con la guardada); el sub-espacio, solo si cambia.
 */
export type AjusteAlValidar =
  | { readonly fecha_inicio: string; readonly fecha_fin: string; readonly sub_espacio?: SubEspacio }
  | { readonly fecha_inicio?: never; readonly fecha_fin?: never; readonly sub_espacio?: SubEspacio }

/** T1: el destino y, si los hay, sus ajustes. */
type ValidarConAjuste = { readonly estado: 'Validado'; readonly motivo_rechazo?: never; readonly enlace_entrega?: never } & AjusteAlValidar

/**
 * PATCH /solicitudes/:radicado (solo STAFF). Siempre con un destino: el tablero no edita
 * campos sueltos (categoría, propósito o recursos no tienen pantalla, y los recursos están
 * fuera de la Fase 7). E5: `motivo_rechazo` solo junto con "Rechazado", y ahí es obligatorio.
 * D-4: la franja y el sub-espacio solo junto con "Validado" (el servidor responde 400 en
 * otro caso); así tampoco compila la deuda aceptada de RECHAZAR con fechas (ADR-007).
 */
export type CambiosTablero =
  | ValidarConAjuste
  | {
      readonly estado: Exclude<DestinoDelTablero, 'Rechazado' | 'Validado' | 'Entregado'>
      readonly motivo_rechazo?: never
      readonly fecha_inicio?: never
      readonly fecha_fin?: never
      readonly sub_espacio?: never
      readonly enlace_entrega?: never
    }
  | {
      // Fase 8 · requisito 4: el enlace del producto final solo acompaña la entrega (T9 y T12).
      // Si la categoría lo exige o lo prohíbe lo decide el servidor (400).
      readonly estado: 'Entregado'
      readonly enlace_entrega?: string
      readonly motivo_rechazo?: never
      readonly fecha_inicio?: never
      readonly fecha_fin?: never
      readonly sub_espacio?: never
    }
  | {
      readonly estado: 'Rechazado'
      readonly motivo_rechazo: string
      readonly fecha_inicio?: never
      readonly fecha_fin?: never
      readonly sub_espacio?: never
      readonly enlace_entrega?: never
    }

/** POST /solicitudes/:radicado/reprogramacion (T5 · README §12.2). */
export interface CuerpoProponerReprogramacion {
  readonly fecha_inicio: string
  readonly fecha_fin: string
  /**
   * Fase 7 · PRD v2.2 §5.5 (Q-A6): el lugar de la propuesta, obligatorio. Para cambiar solo
   * la fecha se envía el sub-espacio vigente; para cambiar solo el lugar, la franja vigente.
   */
  readonly sub_espacio: SubEspacio
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

    /** PATCH /solicitudes/:radicado (tablero del STAFF · T1, con o sin ajustes, T2, T4, T9 y T10). */
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
