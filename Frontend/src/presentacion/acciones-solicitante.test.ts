import { describe, expect, it } from 'vitest'
import type { Estado } from '../api/maquina-estados'
import { accionesDelSolicitante, textosDe } from './acciones-solicitante'

const acciones = (estado: Estado) => accionesDelSolicitante(estado).map((t) => `${t.id} ${t.accion}`)

describe('accionesDelSolicitante (derivadas de la máquina)', () => {
  it('Recibido y Validado: cancelar (T3 y T6)', () => {
    expect(acciones('Recibido')).toEqual(['T3 CANCELAR'])
    expect(acciones('Validado')).toEqual(['T6 CANCELAR'])
  })

  it('Pendiente de Reprogramación: aceptar o rechazar (T7 y T8), y NO cancelar', () => {
    expect(acciones('Pendiente de Reprogramación')).toEqual(['T7 ACEPTAR_REPROGRAMACION', 'T8 RECHAZAR_REPROGRAMACION'])
  })

  it.each<Estado>(['En Producción', 'Entregado', 'Rechazado', 'Cancelado por el Usuario'])('%s: ninguna', (estado) => {
    expect(acciones(estado)).toEqual([])
  })
})

describe('textosDe (DV2 · honestos)', () => {
  it('cancelar nombra el radicado y avisa que no se puede deshacer', () => {
    const textos = textosDe('CANCELAR', 'EC-2026-0142', null)

    expect(textos.descripcion).toContain('EC-2026-0142')
    expect(textos.descripcion).toMatch(/No se puede deshacer/)
    expect(textos.irreversible).toBe(true)
  })

  it('rechazar la propuesta dice que CANCELA la solicitud (T8), sin prometer contrapropuesta', () => {
    const textos = textosDe('RECHAZAR_REPROGRAMACION', 'EC-2026-0098', null)

    expect(textos.descripcion).toMatch(/CANCELA el radicado EC-2026-0098/)
    expect(textos.descripcion).not.toMatch(/contrapropuesta/i)
    expect(textos.irreversible).toBe(true)
  })

  it('aceptar muestra la franja propuesta cuando la hay', () => {
    expect(textosDe('ACEPTAR_REPROGRAMACION', 'EC-2026-0098', 'miércoles · 14:00 – 16:00').descripcion).toContain(
      '(miércoles · 14:00 – 16:00)',
    )
    expect(textosDe('ACEPTAR_REPROGRAMACION', 'EC-2026-0098', null).descripcion).not.toContain('(')
  })
})
