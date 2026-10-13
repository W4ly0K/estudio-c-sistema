import { describe, expect, it } from 'vitest'
import type { LogSolicitante } from '../api/esquemas'
import type { Estado } from '../api/maquina-estados'
import { ACTOR_SOLICITANTE, ACTOR_STAFF, actorDe, lineaDeVida, motivoDeLaPropuesta } from './linea-de-vida'

/** Un log del contrato; `dia` arma la fecha (octubre de 2026, 15:00 UTC = 10:00 Bogotá). */
function log(desde: Estado, hacia: Estado, dia: number, motivos: Partial<LogSolicitante> = {}): LogSolicitante {
  return {
    estado_anterior: desde,
    estado_nuevo: hacia,
    fecha_modificacion: `2026-10-${String(dia).padStart(2, '0')}T15:00:00.000Z`,
    motivo_rechazo: null,
    motivo_reprogramacion: null,
    ...motivos,
  }
}

const situaciones = (linea: ReturnType<typeof lineaDeVida>) => linea.pasos.map((p) => p.situacion)

describe('lineaDeVida (B3)', () => {
  it('recién radicada: Recibido es el paso actual, sin fecha (no hay log de la radicación)', () => {
    const linea = lineaDeVida({ estado: 'Recibido', logs: [] })

    expect(situaciones(linea)).toEqual(['actual', 'pendiente', 'pendiente', 'pendiente'])
    expect(linea.pasos.map((p) => p.fecha)).toEqual([null, null, null, null])
    expect(linea.desvio).toBeNull()
    expect(linea.eventos).toEqual([])
  })

  it('en producción: los pasos anteriores completados, con la fecha de su cambio', () => {
    const linea = lineaDeVida({
      estado: 'En Producción',
      logs: [log('Recibido', 'Validado', 12), log('Validado', 'En Producción', 14)],
    })

    expect(situaciones(linea)).toEqual(['completado', 'completado', 'actual', 'pendiente'])
    expect(linea.pasos[1]?.fecha).toBe('2026-10-12T15:00:00.000Z')
    expect(linea.eventos.map((e) => e.actor)).toEqual([ACTOR_STAFF, ACTOR_STAFF])
  })

  it('entregada: todo completado (el final del camino no queda "actual")', () => {
    const linea = lineaDeVida({
      estado: 'Entregado',
      logs: [log('Recibido', 'Validado', 12), log('Validado', 'En Producción', 14), log('En Producción', 'Entregado', 15)],
    })

    expect(situaciones(linea)).toEqual(['completado', 'completado', 'completado', 'completado'])
  })

  it('rechazada (T2): el resto del camino queda omitido y el motivo viaja en el evento', () => {
    const linea = lineaDeVida({
      estado: 'Rechazado',
      logs: [log('Recibido', 'Rechazado', 12, { motivo_rechazo: 'La cabina está en mantenimiento.' })],
    })

    expect(situaciones(linea)).toEqual(['completado', 'omitido', 'omitido', 'omitido'])
    expect(linea.desvio).toBe('Rechazado')
    expect(linea.eventos[0]?.motivo).toEqual({ etiqueta: 'Motivo del rechazo', texto: 'La cabina está en mantenimiento.' })
  })

  it('cancelada desde Validado (T6): llegó hasta Validado y el actor es el solicitante', () => {
    const linea = lineaDeVida({
      estado: 'Cancelado por el Usuario',
      logs: [log('Recibido', 'Validado', 12), log('Validado', 'Cancelado por el Usuario', 13)],
    })

    expect(situaciones(linea)).toEqual(['completado', 'completado', 'omitido', 'omitido'])
    expect(linea.eventos[1]?.actor).toBe(ACTOR_SOLICITANTE)
  })

  it('pendiente de reprogramación (T5): no es final, así que el camino sigue pendiente', () => {
    const linea = lineaDeVida({
      estado: 'Pendiente de Reprogramación',
      logs: [
        log('Recibido', 'Validado', 12),
        log('Validado', 'Pendiente de Reprogramación', 13, { motivo_reprogramacion: 'Mantenimiento de la cabina.' }),
      ],
    })

    expect(situaciones(linea)).toEqual(['completado', 'completado', 'pendiente', 'pendiente'])
    expect(linea.desvio).toBe('Pendiente de Reprogramación')
    expect(linea.eventos[1]?.motivo?.etiqueta).toBe('Motivo informado por el Staff')
  })

  it('aceptada la propuesta (T7): Validado muestra la fecha del cambio MÁS reciente', () => {
    const linea = lineaDeVida({
      estado: 'Validado',
      logs: [
        log('Recibido', 'Validado', 12),
        log('Validado', 'Pendiente de Reprogramación', 13),
        log('Pendiente de Reprogramación', 'Validado', 14),
      ],
    })

    expect(linea.pasos[1]).toEqual({ estado: 'Validado', situacion: 'actual', fecha: '2026-10-14T15:00:00.000Z' })
    expect(linea.eventos[2]?.actor).toBe(ACTOR_SOLICITANTE)
  })

  it('ordena por fecha aunque los logs lleguen desordenados', () => {
    const linea = lineaDeVida({
      estado: 'En Producción',
      logs: [log('Validado', 'En Producción', 14), log('Recibido', 'Validado', 12)],
    })

    expect(linea.eventos.map((e) => e.hacia)).toEqual(['Validado', 'En Producción'])
  })
})

describe('actorDe', () => {
  it('lo deriva de la máquina de estados', () => {
    expect(actorDe('Recibido', 'Validado')).toBe(ACTOR_STAFF)
    expect(actorDe('Recibido', 'Cancelado por el Usuario')).toBe(ACTOR_SOLICITANTE)
  })

  it('un par fuera de la tabla no inventa actor', () => {
    expect(actorDe('Recibido', 'Entregado')).toBeNull()
  })
})

describe('motivoDeLaPropuesta (B4)', () => {
  it('toma el motivo de la propuesta más reciente', () => {
    const logs = [
      log('Validado', 'Pendiente de Reprogramación', 13, { motivo_reprogramacion: 'Primera propuesta del Staff.' }),
      log('Pendiente de Reprogramación', 'Validado', 14),
      log('Validado', 'Pendiente de Reprogramación', 15, { motivo_reprogramacion: 'Segunda propuesta del Staff.' }),
    ]

    expect(motivoDeLaPropuesta(logs)).toBe('Segunda propuesta del Staff.')
  })

  it('sin propuestas: null', () => {
    expect(motivoDeLaPropuesta([log('Recibido', 'Validado', 12)])).toBeNull()
  })
})
