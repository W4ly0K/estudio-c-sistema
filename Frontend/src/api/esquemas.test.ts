import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  esquemaCuerpoError,
  esquemaDetalleSolicitante,
  esquemaDetalleStaff,
  esquemaEventoEnlace,
  esquemaHistorialEnlaces,
  esquemaRespuestaComando,
  esquemaRespuestaCorreccionEntrega,
  esquemaRespuestaEdicionAnexo,
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
  enlace_entrega: null,
  enlace_anexo: null,
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

    it('Fase 8 · acepta una entrega con el enlace del producto final', () => {
      const entregada = { ...DETALLE_SOLICITANTE, estado: 'Entregado', enlace_entrega: 'https://youtu.be/abc123' }
      expect(acepta(esquemaDetalleSolicitante, entregada)).toBe(true)
    })

    it('Fase 9 · R9-1: acepta el anexo del solicitante', () => {
      const conAnexo = { ...DETALLE_SOLICITANTE, enlace_anexo: 'https://drive.google.com/file/d/xyz/view' }
      expect(acepta(esquemaDetalleSolicitante, conAnexo)).toBe(true)
    })

    it('Fase 9 · R9-1 (D1, fail-closed): una respuesta sin enlace_anexo no se acepta', () => {
      const sinAnexo: Record<string, unknown> = { ...DETALLE_SOLICITANTE }
      delete sinAnexo.enlace_anexo
      expect(acepta(esquemaDetalleSolicitante, sinAnexo)).toBe(false)
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

describe('esquemaRespuestaEdicionAnexo (Fase 9 · K3 · AN14 y D10)', () => {
  const ok = { mensaje: 'Anexo actualizado.', sin_cambios: false, solicitud: { ...DETALLE_SOLICITANTE, estado: 'Recibido' } }

  it.each([false, true])('acepta sin_cambios = %s con la proyección del dueño', (sin_cambios) => {
    expect(acepta(esquemaRespuestaEdicionAnexo, { ...ok, sin_cambios })).toBe(true)
  })

  it('fail-closed: sin `sin_cambios` la respuesta no se acepta', () => {
    expect(acepta(esquemaRespuestaEdicionAnexo, { mensaje: ok.mensaje, solicitud: ok.solicitud })).toBe(false)
  })

  it.each([null, 'false', 0])('rechaza sin_cambios = %j (debe ser booleano)', (valor) => {
    expect(acepta(esquemaRespuestaEdicionAnexo, { ...ok, sin_cambios: valor })).toBe(false)
  })

  it('los demás comandos no cambian: su esquema no exige sin_cambios', () => {
    expect(acepta(esquemaRespuestaComando(esquemaDetalleSolicitante), { mensaje: 'ok', solicitud: DETALLE_SOLICITANTE })).toBe(true)
  })
})

describe('historial de enlaces (Fase 9 · K4 · J2b, DJ2b-2 y migración 20261109110000)', () => {
  const ANEXO = {
    id_log: 'log-1',
    enlace_campo: 'ANEXO',
    enlace_anterior: null,
    enlace_nuevo: 'https://drive.google.com/file/d/xyz/view',
    motivo_correccion: null,
    modificado_por: 'uuid-solicitante',
    fecha_modificacion: '2026-10-09T14:00:00.000Z',
  }
  const ENTREGA = {
    ...ANEXO,
    id_log: 'log-2',
    enlace_campo: 'ENTREGA',
    enlace_anterior: 'https://youtu.be/viejo',
    enlace_nuevo: 'https://youtu.be/nuevo',
    motivo_correccion: 'Se registró otra grabación.',
    modificado_por: 'uuid-staff',
  }

  it.each([
    ['ANEXO agregado', ANEXO],
    ['ANEXO retirado', { ...ANEXO, enlace_anterior: 'https://drive.google.com/file/d/xyz/view', enlace_nuevo: null }],
    ['ENTREGA con motivo', ENTREGA],
    ['ENTREGA sin motivo', { ...ENTREGA, motivo_correccion: null }],
    // EN8 lo garantiza solo el servicio: el motor admite ENTREGA con anterior NULL, y aquí también.
    ['ENTREGA con anterior null', { ...ENTREGA, enlace_anterior: null }],
  ])('acepta %s', (_caso, evento) => {
    expect(acepta(esquemaEventoEnlace, evento)).toBe(true)
  })

  it.each<[string, Record<string, unknown>]>([
    ['un campo adicional (DK4-2)', { ...ANEXO, correo: 'ana@unicesmag.edu.co' }],
    ['sin id_log', { ...ANEXO, id_log: undefined }],
    ['sin modificado_por', { ...ANEXO, modificado_por: undefined }],
    ['sin fecha_modificacion', { ...ANEXO, fecha_modificacion: undefined }],
    ['un enlace_campo desconocido', { ...ANEXO, enlace_campo: 'OTRO' }],
    ['motivo en ANEXO (B8)', { ...ANEXO, motivo_correccion: 'Un motivo cualquiera.' }],
    ['ENTREGA sin enlace nuevo (B4)', { ...ENTREGA, enlace_nuevo: null }],
    ['sin cambio real (B2)', { ...ENTREGA, enlace_anterior: ENTREGA.enlace_nuevo }],
    ['ANEXO de null a null (B2)', { ...ANEXO, enlace_nuevo: null }],
    ['fecha sin zona', { ...ANEXO, fecha_modificacion: '2026-10-09T14:00:00' }],
  ])('rechaza %s', (_caso, evento) => {
    const sinIndefinidos = Object.fromEntries(Object.entries(evento).filter(([, valor]) => valor !== undefined))
    expect(acepta(esquemaEventoEnlace, sinIndefinidos)).toBe(false)
  })

  it('la respuesta tiene exactamente { radicado, eventos }', () => {
    expect(acepta(esquemaHistorialEnlaces, { radicado: 'EC-1', eventos: [ANEXO, ENTREGA] })).toBe(true)
    expect(acepta(esquemaHistorialEnlaces, { radicado: 'EC-1', eventos: [] })).toBe(true)
    expect(acepta(esquemaHistorialEnlaces, { radicado: 'EC-1', eventos: [], logs: [] })).toBe(false)
  })

  it('respuesta de la corrección: sin_cambios booleano obligatorio con la proyección del Staff', () => {
    const respuesta = { mensaje: 'Enlace del producto final corregido.', solicitud: { ...DETALLE_STAFF, estado: 'Entregado' } }
    expect(acepta(esquemaRespuestaCorreccionEntrega, { ...respuesta, sin_cambios: false })).toBe(true)
    expect(acepta(esquemaRespuestaCorreccionEntrega, { ...respuesta, sin_cambios: true })).toBe(true)
    expect(acepta(esquemaRespuestaCorreccionEntrega, respuesta)).toBe(false)
    expect(acepta(esquemaRespuestaCorreccionEntrega, { ...respuesta, sin_cambios: 'true' })).toBe(false)
    // La proyección es la del Staff: la del solicitante no basta.
    expect(acepta(esquemaRespuestaCorreccionEntrega, { ...respuesta, sin_cambios: false, solicitud: DETALLE_SOLICITANTE })).toBe(false)
  })
})
