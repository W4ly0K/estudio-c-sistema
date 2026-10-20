import { describe, expect, expectTypeOf, it } from 'vitest'
import { ESTADOS, type Estado } from '../api/maquina-estados'
import type { DestinoDelTablero } from '../api/solicitudes'
import { FRANJA_VACIA, type ValoresFranja } from './franja'
import {
  TEXTO_RAZON_FRANJA_INCOMPLETA,
  accionesDelStaff,
  franjaYaInicio,
  porElTablero,
  razonBloqueoDelStaff,
  textoExito,
  textosDelStaff,
  type AccionDelStaff,
  type DestinoDelTableroStaff,
} from './acciones-staff'

const ACCIONES_STAFF: readonly AccionDelStaff[] = [
  'APROBAR',
  'RECHAZAR',
  'INICIAR_PRODUCCION',
  'FINALIZAR',
  'PROPONER_REPROGRAMACION',
]

describe('accionesDelStaff (6.5.3 · DA1)', () => {
  it.each<[Estado, readonly AccionDelStaff[]]>([
    ['Recibido', ['APROBAR', 'RECHAZAR']],
    ['Validado', ['INICIAR_PRODUCCION', 'PROPONER_REPROGRAMACION']],
    ['En Producción', ['FINALIZAR']],
    ['Pendiente de Reprogramación', []],
    ['Entregado', []],
    ['Rechazado', []],
    ['Cancelado por el Usuario', []],
  ])('en "%s" ofrece %j', (estado, esperadas) => {
    expect(accionesDelStaff(estado).map((t) => t.accion)).toEqual(esperadas)
  })

  it('ofrece las cinco del Staff y ninguna del solicitante; solo T5 sale del canal del PATCH (DR2)', () => {
    const todas = ESTADOS.flatMap((estado) => accionesDelStaff(estado))
    expect(todas.every((t) => t.rol === 'STAFF')).toBe(true)
    expect(new Set(todas.map((t) => t.id))).toEqual(new Set(['T1', 'T2', 'T4', 'T5', 'T9']))
    expect(todas.filter((t) => !porElTablero(t)).map((t) => t.id)).toEqual(['T5'])
  })

  it('los destinos del canal PATCH son exactamente los que acepta CambiosTablero', () => {
    expectTypeOf<DestinoDelTableroStaff>().toEqualTypeOf<DestinoDelTablero>()
  })
})

describe('textosDelStaff: textos honestos', () => {
  const textos = ACCIONES_STAFF.map((accion) => ({ accion, ...textosDelStaff(accion, 'EC-7', '27 oct · 09:00 – 10:00') }))

  it('rechazar, finalizar y proponer son irreversibles, y cada una dice por qué', () => {
    expect(textos.filter((t) => t.irreversible).map((t) => t.accion)).toEqual([
      'RECHAZAR',
      'FINALIZAR',
      'PROPONER_REPROGRAMACION',
    ])
    expect(textosDelStaff('RECHAZAR', 'EC-7', 'F').descripcion).toMatch(/estado final/)
    expect(textosDelStaff('FINALIZAR', 'EC-7', 'F').descripcion).toMatch(/estado final/)
  })

  it('proponer (T5) dice lo que el servidor hará y lo que NO hará (README §12.2 · ADR-005 §3)', () => {
    const { descripcion } = textosDelStaff('PROPONER_REPROGRAMACION', 'EC-7', 'FRANJA')
    expect(descripcion).toContain('"Pendiente de Reprogramación"')
    expect(descripcion).toMatch(/si la rechaza, la solicitud se cancela/)
    expect(descripcion).toContain('conserva su franja actual (FRANJA)')
    expect(descripcion).toMatch(/no reserva la nueva franja/)
    expect(descripcion).toMatch(/no se puede retirar/)
  })

  it('nombran el radicado, cada botón es distinto y ninguno promete avisos que el sistema no envía', () => {
    expect(new Set(textos.map((t) => t.boton)).size).toBe(ACCIONES_STAFF.length)
    for (const t of textos) {
      expect(t.descripcion).toContain('EC-7')
      expect(t.descripcion).not.toMatch(/notific|correo|avisar|avisará/i)
    }
  })

  it('validar y rechazar muestran la franja de la que hablan', () => {
    expect(textosDelStaff('APROBAR', 'EC-7', 'FRANJA').descripcion).toContain('FRANJA')
    expect(textosDelStaff('RECHAZAR', 'EC-7', 'FRANJA').descripcion).toContain('FRANJA')
  })

  it('el aviso de éxito nombra el destino aplicado, también el de T5', () => {
    expect(textoExito('Validado')).toBe('La solicitud pasó a "Validado".')
    expect(textoExito('Pendiente de Reprogramación')).toBe('La solicitud pasó a "Pendiente de Reprogramación".')
  })
})

describe('razonBloqueoDelStaff (Fase 7 · B3)', () => {
  const FRANJA: ValoresFranja = { fecha: '2026-10-28', horaInicio: '09:00', horaFin: '10:30' }
  const MOTIVO = 'Mantenimiento del set de grabación'
  const PIDE_MOTIVO = 'Para confirmar, escribe un motivo de al menos 10 caracteres.'

  it.each<AccionDelStaff>(['APROBAR', 'INICIAR_PRODUCCION', 'FINALIZAR'])('%s no tiene formulario: nada la bloquea', (accion) => {
    expect(razonBloqueoDelStaff(accion, '', FRANJA_VACIA)).toBeUndefined()
  })

  it('RECHAZAR (T2): explica el motivo que falta o sobra; con un motivo válido no bloquea', () => {
    expect(razonBloqueoDelStaff('RECHAZAR', '', FRANJA_VACIA)).toBe(PIDE_MOTIVO)
    expect(razonBloqueoDelStaff('RECHAZAR', 'x'.repeat(501), FRANJA_VACIA)).toBe(
      'Para confirmar, acorta el motivo a 500 caracteres como máximo.',
    )
    // T2 no usa franja: una franja vacía no lo bloquea.
    expect(razonBloqueoDelStaff('RECHAZAR', MOTIVO, FRANJA_VACIA)).toBeUndefined()
  })

  it('PROPONER_REPROGRAMACION (T5): primero la franja (orden del formulario), después el motivo', () => {
    expect(razonBloqueoDelStaff('PROPONER_REPROGRAMACION', '', FRANJA_VACIA)).toBe(TEXTO_RAZON_FRANJA_INCOMPLETA)
    expect(razonBloqueoDelStaff('PROPONER_REPROGRAMACION', MOTIVO, { ...FRANJA, horaFin: '' })).toBe(
      TEXTO_RAZON_FRANJA_INCOMPLETA,
    )
    expect(razonBloqueoDelStaff('PROPONER_REPROGRAMACION', 'corto', FRANJA)).toBe(PIDE_MOTIVO)
    expect(razonBloqueoDelStaff('PROPONER_REPROGRAMACION', MOTIVO, FRANJA)).toBeUndefined()
  })
})

describe('franjaYaInicio (DA4)', () => {
  const ahora = new Date('2026-10-20T14:00:00.000Z')

  it('antes de empezar no advierte; en el instante exacto o después, sí (como el servidor)', () => {
    expect(franjaYaInicio('2026-10-20T14:00:01.000Z', ahora)).toBe(false)
    expect(franjaYaInicio('2026-10-20T09:00:00-05:00', ahora)).toBe(true)
    expect(franjaYaInicio('2026-10-20T13:59:59.000Z', ahora)).toBe(true)
  })

  it('una fecha ilegible no advierte (no se inventa una alerta)', () => {
    expect(franjaYaInicio('no-es-una-fecha', ahora)).toBe(false)
  })
})
