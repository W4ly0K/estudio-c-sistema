import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  esquemaCuerpoError,
  esquemaDetalleSolicitante,
  esquemaDetalleStaff,
  esquemaRespuestaComando,
  esquemaRespuestaLogin,
  esquemaSolicitudTablero,
} from './esquemas'

const acepta = (esquema: z.ZodType, dato: unknown): boolean => esquema.safeParse(dato).success

/** Ejemplo del README del backend, §8 (proyección del SOLICITANTE), con el campo de la Fase 6.1b. */
const LOG = {
  estado_anterior: 'Recibido',
  estado_nuevo: 'Validado',
  fecha_modificacion: '2026-10-10T15:20:00.000Z',
  motivo_rechazo: null,
  motivo_reprogramacion: null,
}
const DETALLE_SOLICITANTE = {
  radicado: 'EC-2026-0142',
  categoria: 'PODCAST',
  proposito: 'Grabación del episodio piloto',
  num_participantes: 3,
  fecha_inicio: '2026-10-15T14:00:00.000Z',
  fecha_fin: '2026-10-15T16:00:00.000Z',
  fecha_propuesta_inicio: null,
  fecha_propuesta_fin: null,
  estado: 'En Producción',
  es_urgencia: true,
  sub_espacio: 'ESTUDIO_COMPLETO',
  sub_espacio_propuesto: null,
  recursos: [{ cantidad_solicitada: 2, recurso: { nombre: 'Micrófono de solapa' } }],
  logs: [LOG],
}

/** Proyección del STAFF: la del solicitante más identidades e inventario (README §8). */
const DETALLE_STAFF = {
  ...DETALLE_SOLICITANTE,
  id_usuario: 'uuid-solicitante',
  usuario: { id_usuario: 'uuid-solicitante', nombre: 'Ana', correo: 'ana@unicesmag.edu.co', rol: 'SOLICITANTE' },
  recursos: [
    { id_detalle: 'uuid-detalle', cantidad_solicitada: 2, recurso: { id_recurso: 4, nombre: 'Micrófono de solapa', cantidad_total: 6 } },
  ],
  logs: [{ ...LOG, id_log: 'uuid-log', modificado_por: 'uuid-staff' }],
}

describe('Esquemas del contrato (DC1)', () => {
  describe('detalle del solicitante (README §8)', () => {
    it('acepta el ejemplo del contrato', () => {
      expect(acepta(esquemaDetalleSolicitante, DETALLE_SOLICITANTE)).toBe(true)
    })

    it('acepta una propuesta pendiente con fechas en hora de Bogotá y el motivo del Staff', () => {
      const pendiente = {
        ...DETALLE_SOLICITANTE,
        estado: 'Pendiente de Reprogramación',
        fecha_propuesta_inicio: '2026-10-28T09:00:00-05:00',
        fecha_propuesta_fin: '2026-10-28T10:00:00-05:00',
        logs: [
          LOG,
          {
            ...LOG,
            estado_anterior: 'Validado',
            estado_nuevo: 'Pendiente de Reprogramación',
            motivo_reprogramacion: 'Mantenimiento preventivo del set de grabación',
          },
        ],
      }
      expect(acepta(esquemaDetalleSolicitante, pendiente)).toBe(true)
    })

    it('lector tolerante: descarta los campos no declarados en lugar de fallar', () => {
      const resultado = esquemaDetalleSolicitante.safeParse({ ...DETALLE_SOLICITANTE, campo_nuevo_del_backend: 1 })
      expect(resultado.success).toBe(true)
      expect(resultado.data).not.toHaveProperty('campo_nuevo_del_backend')
    })

    it.each<[string, Record<string, unknown>]>([
      ['un estado fuera del diagrama (fail-closed)', { estado: 'Aprobado' }],
      ['un estado del log escrito distinto', { logs: [{ ...LOG, estado_nuevo: 'Pendiente de reprogramacion' }] }],
      ['un log sin motivo_reprogramacion (contrato de la Fase 6.1b)', { logs: [{ ...LOG, motivo_reprogramacion: undefined }] }],
      ['una fecha sin zona horaria', { fecha_inicio: '2026-10-15T14:00:00' }],
      ['es_urgencia como texto', { es_urgencia: 'true' }],
      ['una categoría desconocida', { categoria: 'MUSICA' }],
      ['num_participantes decimal', { num_participantes: 2.5 }],
      ['sin logs', { logs: undefined }],
      // Fase 7 · PRD v2.2 §5.1: el sub-espacio es estricto como el estado (fail-closed).
      ['sin sub_espacio', { sub_espacio: undefined }],
      ['un sub-espacio desconocido', { sub_espacio: 'SALA_3' }],
      ['un sub-espacio propuesto desconocido', { sub_espacio_propuesto: 'cabina_audio' }],
    ])('rechaza %s', (_caso, cambios) => {
      expect(acepta(esquemaDetalleSolicitante, { ...DETALLE_SOLICITANTE, ...cambios })).toBe(false)
    })
  })

  describe('detalle del Staff', () => {
    it('acepta la proyección completa', () => {
      expect(acepta(esquemaDetalleStaff, DETALLE_STAFF)).toBe(true)
    })

    it('rechaza la proyección del solicitante: le faltan la identidad y el inventario', () => {
      expect(acepta(esquemaDetalleStaff, DETALLE_SOLICITANTE)).toBe(false)
    })
  })

  describe('tablero del Staff (GET /solicitudes)', () => {
    // El tablero no trae la línea de vida: el campo `logs` no se declara y se descarta.
    const solicitud = { ...DETALLE_SOLICITANTE, logs: undefined }
    const ELEMENTO = { ...solicitud, usuario: { nombre: 'Ana', correo: 'ana@unicesmag.edu.co' } }

    it('acepta un elemento con el solicitante y sus recursos', () => {
      expect(acepta(esquemaSolicitudTablero, ELEMENTO)).toBe(true)
    })

    it('rechaza un elemento sin el solicitante', () => {
      expect(acepta(esquemaSolicitudTablero, solicitud)).toBe(false)
    })
  })

  describe('login (POST /auth/google/login)', () => {
    const LOGIN = { mensaje: 'Autenticación exitosa', token: 'jwt', usuario: { id: 'uuid', nombre: 'Ana', rol: 'STAFF' } }

    it('acepta la respuesta del backend', () => {
      expect(acepta(esquemaRespuestaLogin, LOGIN)).toBe(true)
    })

    it.each<[string, unknown]>([
      ['un rol desconocido', { ...LOGIN, usuario: { ...LOGIN.usuario, rol: 'ADMIN' } }],
      ['un token vacío', { ...LOGIN, token: '' }],
      ['sin usuario', { mensaje: LOGIN.mensaje, token: LOGIN.token }],
    ])('rechaza %s', (_caso, dato) => {
      expect(acepta(esquemaRespuestaLogin, dato)).toBe(false)
    })
  })

  describe('respuesta de los comandos ({ mensaje, solicitud })', () => {
    const esquema = esquemaRespuestaComando(esquemaDetalleSolicitante)

    it('acepta el mensaje con la solicitud en la proyección indicada', () => {
      expect(acepta(esquema, { mensaje: 'Solicitud cancelada correctamente.', solicitud: DETALLE_SOLICITANTE })).toBe(true)
    })

    it('rechaza una respuesta sin mensaje', () => {
      expect(acepta(esquema, { solicitud: DETALLE_SOLICITANTE })).toBe(false)
    })
  })

  describe('cuerpo de error de NestJS', () => {
    it.each([
      ['message como texto (servicio)', { statusCode: 409, message: 'Solicitud no encontrada.', error: 'Conflict' }],
      ['message como lista (ValidationPipe)', { statusCode: 400, message: ['a', 'b'], error: 'Bad Request' }],
      ['sin el campo error', { statusCode: 404, message: 'Solicitud no encontrada.' }],
    ])('acepta %s', (_caso, cuerpo) => {
      expect(acepta(esquemaCuerpoError, cuerpo)).toBe(true)
    })

    it('rechaza un message numérico', () => {
      expect(acepta(esquemaCuerpoError, { statusCode: 500, message: 500 })).toBe(false)
    })
  })
})
