import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Categoria } from '../api/esquemas'
import { ESTADOS, type Estado } from '../api/maquina-estados'
import type { DestinoDelTablero } from '../api/solicitudes'
import { MENSAJE_FIN_NO_POSTERIOR } from '../api/mensajes'
import { FRANJA_VACIA, type ValoresFranja } from './franja'
import {
  TEXTO_FRANJA_INICIADA,
  TEXTO_RAZON_AJUSTE_SIN_CAMBIOS,
  TEXTO_RAZON_FRANJA_AJUSTE_INCOMPLETA,
  TEXTO_RAZON_FRANJA_INCOMPLETA,
  accionesDelStaff,
  accionesVisiblesDelStaff,
  ajusteAlValidar,
  franjaYaInicio,
  opcionesDelStaff,
  porElTablero,
  razonBloqueoDelAjuste,
  razonBloqueoDelStaff,
  textoExito,
  textosDeLaOpcion,
  textosDelStaff,
  textosValidarConAjustes,
  type AccionDelStaff,
  type DestinoDelTableroStaff,
  type VigenteDelAjuste,
} from './acciones-staff'
import { MENSAJE_NO_ATENDIDA } from './linea-de-vida'

const ACCIONES_STAFF: readonly AccionDelStaff[] = [
  'APROBAR',
  'RECHAZAR',
  'INICIAR_PRODUCCION',
  'FINALIZAR',
  'PROPONER_REPROGRAMACION',
  'CERRAR_NO_ATENDIDA',
  'INICIAR_EDICION',
]

describe('accionesDelStaff (6.5.3 · DA1)', () => {
  it.each<[Estado, readonly AccionDelStaff[]]>([
    ['Recibido', ['APROBAR', 'RECHAZAR', 'CERRAR_NO_ATENDIDA']],
    ['Validado', ['INICIAR_PRODUCCION', 'PROPONER_REPROGRAMACION']],
    ['En Producción', ['FINALIZAR']],
    ['Pendiente de Reprogramación', []],
    ['Entregado', []],
    ['Rechazado', []],
    ['Cancelado por el Usuario', []],
    ['No atendida', []],
    ['Edición y postproducción', []],
  ])('(ESPACIOS) en "%s" ofrece %j', (estado, esperadas) => {
    expect(accionesDelStaff(estado, 'ESPACIOS').map((t) => t.accion)).toEqual(esperadas)
  })

  it('ofrece las seis del Staff y ninguna del solicitante; solo T5 sale del canal del PATCH (DR2)', () => {
    const todas = ESTADOS.flatMap((estado) => accionesDelStaff(estado, 'ESPACIOS'))
    expect(todas.every((t) => t.rol === 'STAFF')).toBe(true)
    expect(new Set(todas.map((t) => t.id))).toEqual(new Set(['T1', 'T2', 'T4', 'T5', 'T9', 'T10']))
    expect(todas.filter((t) => !porElTablero(t)).map((t) => t.id)).toEqual(['T5'])
  })

  it('los destinos del canal PATCH son exactamente los que acepta CambiosTablero', () => {
    expectTypeOf<DestinoDelTableroStaff>().toEqualTypeOf<DestinoDelTablero>()
  })
})

describe('accionesDelStaff por categoría (Fase 8 · requisito 3)', () => {
  it.each<Categoria>(['PODCAST', 'VIDEO'])('%s: en producción solo "Pasar a edición" (T11); en edición, la entrega (T12)', (categoria) => {
    expect(accionesDelStaff('En Producción', categoria).map((t) => t.id)).toEqual(['T11'])
    expect(accionesDelStaff('Edición y postproducción', categoria).map((t) => t.id)).toEqual(['T12'])
  })

  it.each<Categoria>(['ESPACIOS', 'STREAMING', 'ASESORIAS'])('%s: en producción, la entrega directa (T9); nunca la edición', (categoria) => {
    expect(accionesDelStaff('En Producción', categoria).map((t) => t.id)).toEqual(['T9'])
    expect(accionesDelStaff('Edición y postproducción', categoria)).toEqual([])
  })

  it('T11 y T12 viajan por el PATCH del tablero, como T4 y T9', () => {
    const conEdicion = [...accionesDelStaff('En Producción', 'PODCAST'), ...accionesDelStaff('Edición y postproducción', 'PODCAST')]
    expect(conEdicion.map((t) => t.id)).toEqual(['T11', 'T12'])
    expect(conEdicion.every((t) => porElTablero(t))).toBe(true)
  })

  it('"Pasar a edición": nombra el radicado y la franja, avisa que queda libre y no promete avisos', () => {
    const textos = textosDelStaff('INICIAR_EDICION', 'EC-7', 'FRANJA')
    expect(textos).toMatchObject({ boton: 'Pasar a edición', confirmar: 'Sí, pasar a edición', irreversible: false })
    expect(textos.descripcion).toContain('EC-7')
    expect(textos.descripcion).toContain('FRANJA')
    expect(textos.descripcion).toMatch(/queda libre/)
    expect(textos.descripcion).not.toMatch(/notific|correo|avisar|avisará/i)
  })
})

describe('accionesVisiblesDelStaff (Fase 7 · T10)', () => {
  const ahora = new Date('2026-10-20T14:00:00.000Z')
  const visibles = (estado: Estado, inicioIso: string) =>
    accionesVisiblesDelStaff(estado, 'ESPACIOS', inicioIso, ahora).map((t) => t.accion)

  it('con la franja por delante no ofrece "Cerrar como no atendida" (el servidor la rechazaría)', () => {
    expect(visibles('Recibido', '2026-10-20T14:00:01.000Z')).toEqual(['APROBAR', 'RECHAZAR'])
  })

  it('con la franja iniciada (o en el instante exacto, como el servidor) la ofrece, sin quitar las otras', () => {
    expect(visibles('Recibido', '2026-10-20T14:00:00.000Z')).toEqual(['APROBAR', 'RECHAZAR', 'CERRAR_NO_ATENDIDA'])
    expect(visibles('Recibido', '2026-10-01T09:00:00-05:00')).toEqual(['APROBAR', 'RECHAZAR', 'CERRAR_NO_ATENDIDA'])
  })

  it('con una fecha ilegible no la ofrece (no se inventa un vencimiento)', () => {
    expect(visibles('Recibido', 'no-es-una-fecha')).toEqual(['APROBAR', 'RECHAZAR'])
  })

  it('solo filtra T10: en los demás estados es idéntica a accionesDelStaff', () => {
    for (const estado of ESTADOS.filter((e) => e !== 'Recibido')) {
      expect(visibles(estado, '2026-10-01T09:00:00-05:00')).toEqual(accionesDelStaff(estado, 'ESPACIOS').map((t) => t.accion))
    }
  })

  it('el aviso DA4 nombra las salidas: el rescate con ajustes (Q-B2), "No atendida" y el rechazo', () => {
    expect(TEXTO_FRANJA_INICIADA).toMatch(/validarla con ajustes en una franja futura/)
    expect(TEXTO_FRANJA_INICIADA).toMatch(/"No atendida"/)
    expect(TEXTO_FRANJA_INICIADA).toMatch(/rechazarla con un motivo/)
  })
})

describe('textosDelStaff: textos honestos', () => {
  const textos = ACCIONES_STAFF.map((accion) => ({ accion, ...textosDelStaff(accion, 'EC-7', '27 oct · 09:00 – 10:00') }))

  it('rechazar, finalizar, proponer y cerrar como no atendida son irreversibles, y cada una dice por qué', () => {
    expect(textos.filter((t) => t.irreversible).map((t) => t.accion)).toEqual([
      'RECHAZAR',
      'FINALIZAR',
      'PROPONER_REPROGRAMACION',
      'CERRAR_NO_ATENDIDA',
    ])
    expect(textosDelStaff('RECHAZAR', 'EC-7', 'F').descripcion).toMatch(/estado final/)
    expect(textosDelStaff('FINALIZAR', 'EC-7', 'F').descripcion).toMatch(/estado final/)
    expect(textosDelStaff('CERRAR_NO_ATENDIDA', 'EC-7', 'F').descripcion).toMatch(/estado final/)
  })

  it('cerrar como no atendida (T10) muestra la franja y el mensaje exacto que verá el solicitante', () => {
    const { boton, descripcion } = textosDelStaff('CERRAR_NO_ATENDIDA', 'EC-7', 'FRANJA')
    expect(boton).toBe('Cerrar como no atendida')
    expect(descripcion).toContain('"No atendida"')
    expect(descripcion).toContain('FRANJA')
    expect(descripcion).toContain(MENSAJE_NO_ATENDIDA)
    // 7A.2: la franja aún no se libera en el motor (llega con 7A.3): el texto no lo promete.
    expect(descripcion).not.toMatch(/queda libre/)
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
    expect(textoExito('Validado')).toBe('La solicitud pasó a "Revisado y aprobado".')
    expect(textoExito('Pendiente de Reprogramación')).toBe('La solicitud pasó a "Pendiente de Reprogramación".')
  })
})

describe('razonBloqueoDelStaff (Fase 7 · B3)', () => {
  const FRANJA: ValoresFranja = { fecha: '2026-10-28', horaInicio: '09:00', horaFin: '10:30' }
  const MOTIVO = 'Mantenimiento del set de grabación'
  const PIDE_MOTIVO = 'Para confirmar, escribe un motivo de al menos 10 caracteres.'

  it.each<AccionDelStaff>(['APROBAR', 'INICIAR_PRODUCCION', 'FINALIZAR', 'CERRAR_NO_ATENDIDA'])('%s no tiene formulario: nada la bloquea', (accion) => {
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

describe('Validar con ajustes (Fase 7 · 7B.3 · PRD v2.2 §5.6)', () => {
  const opciones = (estado: Estado) =>
    opcionesDelStaff(accionesDelStaff(estado, 'ESPACIOS')).map((o) => `${o.transicion.id}${o.ajustar ? '+ajustes' : ''}`)

  it('es una variante de T1, justo después de "Validar"; no es una transición nueva', () => {
    expect(opciones('Recibido')).toEqual(['T1', 'T1+ajustes', 'T2', 'T10'])
    const conAjustes = opcionesDelStaff(accionesDelStaff('Recibido', 'ESPACIOS')).filter((o) => o.ajustar)
    expect(conAjustes.map((o) => [o.transicion.accion, o.transicion.destino])).toEqual([['APROBAR', 'Validado']])
  })

  it('fuera de "Recibido" no aparece: las opciones son las transiciones, sin más', () => {
    for (const estado of ESTADOS.filter((e) => e !== 'Recibido')) {
      expect(opciones(estado)).toEqual(accionesDelStaff(estado, 'ESPACIOS').map((t) => t.id))
    }
  })

  it('sus textos: botón propio, no irreversible, nombran el radicado y lo pedido, sin prometer avisos', () => {
    const textos = textosValidarConAjustes('EC-7', 'FRANJA')
    expect(textos).toMatchObject({ boton: 'Validar con ajustes', confirmar: 'Sí, validar con ajustes', irreversible: false })
    expect(textos.descripcion).toContain('EC-7')
    expect(textos.descripcion).toContain('"Revisado y aprobado"')
    expect(textos.descripcion).toContain('FRANJA')
    expect(textos.descripcion).not.toMatch(/notific|correo|avisar|avisará/i)
  })

  it('textosDeLaOpcion elige entre los de la transición y los del ajuste', () => {
    const [directa, ajuste] = opcionesDelStaff(accionesDelStaff('Recibido', 'ESPACIOS'))
    expect(directa && textosDeLaOpcion(directa, 'EC-7', 'F').boton).toBe('Validar')
    expect(ajuste && textosDeLaOpcion(ajuste, 'EC-7', 'F').boton).toBe('Validar con ajustes')
  })

  const VIGENTE: VigenteDelAjuste = {
    franja: { fecha: '2026-10-27', horaInicio: '09:00', horaFin: '10:00' },
    subEspacio: 'ESTUDIO_COMPLETO',
  }
  const OTRA_FRANJA: ValoresFranja = { fecha: '2026-10-28', horaInicio: '14:00', horaFin: '15:30' }

  describe('razonBloqueoDelAjuste', () => {
    it('primero la franja completa (orden del formulario)', () => {
      expect(razonBloqueoDelAjuste(FRANJA_VACIA, 'CABINA_AUDIO', VIGENTE)).toBe(TEXTO_RAZON_FRANJA_AJUSTE_INCOMPLETA)
      expect(razonBloqueoDelAjuste({ ...OTRA_FRANJA, horaFin: '' }, 'CABINA_AUDIO', VIGENTE)).toBe(
        TEXTO_RAZON_FRANJA_AJUSTE_INCOMPLETA,
      )
    })

    it('sin ningún cambio lo bloquea y remite a "Validar"', () => {
      expect(razonBloqueoDelAjuste(VIGENTE.franja, VIGENTE.subEspacio, VIGENTE)).toBe(TEXTO_RAZON_AJUSTE_SIN_CAMBIOS)
      expect(TEXTO_RAZON_AJUSTE_SIN_CAMBIOS).toMatch(/usa "Validar"/)
    })

    it('con la franja, el lugar o ambos cambiados, nada lo bloquea', () => {
      expect(razonBloqueoDelAjuste(OTRA_FRANJA, VIGENTE.subEspacio, VIGENTE)).toBeUndefined()
      expect(razonBloqueoDelAjuste(VIGENTE.franja, 'CABINA_AUDIO', VIGENTE)).toBeUndefined()
      expect(razonBloqueoDelAjuste(OTRA_FRANJA, 'ESTUDIO_GRABACION', VIGENTE)).toBeUndefined()
    })

    it('si lo pedido era ilegible (campos vacíos), cualquier franja completa es un cambio', () => {
      const ilegible: VigenteDelAjuste = { ...VIGENTE, franja: FRANJA_VACIA }
      expect(razonBloqueoDelAjuste(OTRA_FRANJA, VIGENTE.subEspacio, ilegible)).toBeUndefined()
    })
  })

  describe('ajusteAlValidar: solo viaja lo que cambió', () => {
    it('solo el lugar: sin fechas (reenviarlas volvería a pasar CA-04 sobre la franja guardada)', () => {
      expect(ajusteAlValidar(VIGENTE.franja, 'CABINA_AUDIO', VIGENTE)).toEqual({ ok: true, ajuste: { sub_espacio: 'CABINA_AUDIO' } })
    })

    it('solo la franja: completa, en hora de Bogotá, sin sub-espacio', () => {
      expect(ajusteAlValidar(OTRA_FRANJA, VIGENTE.subEspacio, VIGENTE)).toEqual({
        ok: true,
        ajuste: { fecha_inicio: '2026-10-28T14:00:00-05:00', fecha_fin: '2026-10-28T15:30:00-05:00' },
      })
    })

    it('las dos cosas, en el mismo cuerpo', () => {
      expect(ajusteAlValidar(OTRA_FRANJA, 'ESTUDIO_GRABACION', VIGENTE)).toEqual({
        ok: true,
        ajuste: {
          fecha_inicio: '2026-10-28T14:00:00-05:00',
          fecha_fin: '2026-10-28T15:30:00-05:00',
          sub_espacio: 'ESTUDIO_GRABACION',
        },
      })
    })

    it('una franja nueva con el fin antes del inicio: el error local de B2 (DH4), sin cuerpo', () => {
      expect(ajusteAlValidar({ ...OTRA_FRANJA, horaFin: '13:00' }, 'CABINA_AUDIO', VIGENTE)).toEqual({
        ok: false,
        error: MENSAJE_FIN_NO_POSTERIOR,
      })
    })
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
