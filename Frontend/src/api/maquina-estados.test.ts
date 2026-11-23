import { describe, expect, it } from 'vitest'
import {
  ESTADOS,
  ESTADOS_FINALES,
  ROLES,
  TRANSICIONES,
  accionesDisponibles,
  esEstadoFinal,
  type Estado,
  type IdTransicion,
  type Rol,
} from './maquina-estados'

/**
 * Oráculo escrito a mano a partir del diagrama (ADR-005 §2.1): qué botones ve cada
 * rol en cada estado. Cubre las 18 combinaciones de estado y rol. Es la tabla de la máquina, sin
 * categoría: qué transición aplica a cada una lo decide api/categorias.ts (Fase 8).
 */
const ESPERADO: Record<Estado, Record<Rol, readonly IdTransicion[]>> = {
  Recibido: { STAFF: ['T1', 'T2', 'T10'], SOLICITANTE: ['T3'] },
  Validado: { STAFF: ['T4', 'T5'], SOLICITANTE: ['T6'] },
  'Pendiente de Reprogramación': { STAFF: [], SOLICITANTE: ['T7', 'T8'] },
  'En Producción': { STAFF: ['T9', 'T11'], SOLICITANTE: [] },
  'Edición y postproducción': { STAFF: ['T12'], SOLICITANTE: [] },
  Entregado: { STAFF: [], SOLICITANTE: [] },
  Rechazado: { STAFF: [], SOLICITANTE: [] },
  'Cancelado por el Usuario': { STAFF: [], SOLICITANTE: [] },
  'No atendida': { STAFF: [], SOLICITANTE: [] },
}

const combinaciones = ESTADOS.flatMap((estado) => ROLES.map((rol) => [estado, rol] as const))

describe('Máquina de estados de la vista (copia de ADR-005)', () => {
  it.each(combinaciones)('en "%s", %s ve exactamente sus transiciones', (estado, rol) => {
    expect(accionesDisponibles(estado, rol).map((t) => t.id)).toEqual(ESPERADO[estado][rol])
  })

  it('los estados finales se derivan de la tabla: Entregado, Rechazado, Cancelado por el Usuario y No atendida', () => {
    expect([...ESTADOS_FINALES].sort()).toEqual(['Cancelado por el Usuario', 'Entregado', 'No atendida', 'Rechazado'])
    expect(esEstadoFinal('Entregado')).toBe(true)
    expect(esEstadoFinal('Validado')).toBe(false)
  })

  it('ninguna transición es compartida entre roles (PRD §5.5)', () => {
    const pares = TRANSICIONES.map((t) => `${t.origen} → ${t.destino}`)
    expect(new Set(pares).size).toBe(TRANSICIONES.length)
  })

  it('el tablero del Staff nunca ofrece "Pendiente de Reprogramación" como destino del PATCH: es T5, un comando propio', () => {
    const t5 = TRANSICIONES.find((t) => t.destino === 'Pendiente de Reprogramación')
    expect(t5).toMatchObject({ id: 'T5', accion: 'PROPONER_REPROGRAMACION', rol: 'STAFF' })
  })
})
