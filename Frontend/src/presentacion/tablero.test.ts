import { describe, expect, it } from 'vitest'
import { ESTADOS, ESTADOS_FINALES, esEstadoFinal, type Estado } from '../api/maquina-estados'
import { COLUMNAS_ACTIVAS, agruparTablero, textoUrgentes, type ColumnaTablero, type Ordenable } from './tablero'

const sol = (radicado: string, estado: Estado, fecha_inicio: string, es_urgencia = false): Ordenable => ({
  radicado,
  estado,
  fecha_inicio,
  es_urgencia,
})

/** La columna de un estado (falla con un mensaje claro si no existe). */
function columnaDe(columnas: readonly ColumnaTablero<Ordenable>[], estado: Estado): ColumnaTablero<Ordenable> {
  const encontrada = columnas.find((c) => c.estado === estado)
  if (encontrada === undefined) throw new Error(`Falta la columna "${estado}"`)
  return encontrada
}

const radicados = (columna: ColumnaTablero<Ordenable>) => columna.solicitudes.map((s) => s.radicado)

describe('agruparTablero (6.5.1 · DE3)', () => {
  it('las 4 columnas activas en el orden del flujo y las cerradas, aunque no haya solicitudes', () => {
    const tablero = agruparTablero([])

    expect(tablero.activas.map((c) => c.estado)).toEqual([
      'Recibido',
      'Validado',
      'Pendiente de Reprogramación',
      'En Producción',
    ])
    expect(tablero.cerradas.map((c) => c.estado)).toEqual(['Entregado', 'Rechazado', 'Cancelado por el Usuario', 'No atendida'])
    expect([...tablero.activas, ...tablero.cerradas].every((c) => c.solicitudes.length === 0)).toBe(true)
    expect(tablero.urgentesEnRecibido).toBe(0)
  })

  it('pertenencia derivada de la máquina: activas = no finales, cerradas = ESTADOS_FINALES, sin solaparse', () => {
    const noFinales = ESTADOS.filter((estado) => !esEstadoFinal(estado))
    const cerradas = agruparTablero([]).cerradas.map((c) => c.estado)

    expect([...COLUMNAS_ACTIVAS].sort()).toEqual([...noFinales].sort())
    expect(cerradas).toEqual([...ESTADOS_FINALES])
    expect(new Set([...COLUMNAS_ACTIVAS, ...cerradas]).size).toBe(ESTADOS.length)
  })

  it('ninguna solicitud se pierde ni se duplica: una por estado, cada una en su columna', () => {
    const entrada = ESTADOS.map((estado, i) => sol(`EC-${i}`, estado, '2026-10-20T09:00:00-05:00'))
    const tablero = agruparTablero(entrada)
    const todas = [...tablero.activas, ...tablero.cerradas]

    expect(todas.reduce((total, c) => total + c.solicitudes.length, 0)).toBe(entrada.length)
    for (const columna of todas) {
      expect(columna.solicitudes.map((s) => s.estado)).toEqual([columna.estado])
    }
  })

  it('activas: urgentes primero, luego la franja más próxima y, a igual fecha, el radicado (entrada desordenada)', () => {
    const tablero = agruparTablero([
      sol('EC-5', 'Recibido', '2026-10-20T09:00:00-05:00'),
      sol('EC-4', 'Recibido', '2026-10-22T09:00:00-05:00', true),
      sol('EC-3', 'Recibido', '2026-10-19T09:00:00-05:00'),
      sol('EC-2', 'Recibido', '2026-10-21T09:00:00-05:00', true),
      sol('EC-1', 'Recibido', '2026-10-19T09:00:00-05:00'),
    ])

    expect(radicados(columnaDe(tablero.activas, 'Recibido'))).toEqual(['EC-2', 'EC-4', 'EC-1', 'EC-3', 'EC-5'])
  })

  it('compara instantes, no textos: 09:00 -05:00 (14:00 Z) va después de 13:00 Z', () => {
    const tablero = agruparTablero([
      sol('EC-A', 'Validado', '2026-10-20T09:00:00-05:00'),
      sol('EC-B', 'Validado', '2026-10-20T13:00:00.000Z'),
    ])

    expect(radicados(columnaDe(tablero.activas, 'Validado'))).toEqual(['EC-B', 'EC-A'])
  })

  it('cerradas (DT1): de la más reciente a la más antigua, sin prioridad de urgencia', () => {
    const tablero = agruparTablero([
      sol('EC-X', 'Entregado', '2026-10-01T09:00:00-05:00', true),
      sol('EC-Y', 'Entregado', '2026-10-05T09:00:00-05:00'),
      sol('EC-Z', 'Entregado', '2026-10-03T09:00:00-05:00'),
    ])

    expect(radicados(columnaDe(tablero.cerradas, 'Entregado'))).toEqual(['EC-Y', 'EC-Z', 'EC-X'])
  })

  it('una fecha ilegible no rompe el orden: va al final de su columna, activa o cerrada', () => {
    const tablero = agruparTablero([
      sol('EC-9', 'Validado', 'no-es-una-fecha'),
      sol('EC-8', 'Validado', '2026-10-25T09:00:00-05:00'),
      sol('EC-7', 'Validado', '2026-10-24T09:00:00-05:00'),
      sol('EC-6', 'Rechazado', 'no-es-una-fecha'),
      sol('EC-5', 'Rechazado', '2026-10-02T09:00:00-05:00'),
    ])

    expect(radicados(columnaDe(tablero.activas, 'Validado'))).toEqual(['EC-7', 'EC-8', 'EC-9'])
    expect(radicados(columnaDe(tablero.cerradas, 'Rechazado'))).toEqual(['EC-5', 'EC-6'])
  })

  it('no muta la entrada: un arreglo congelado sale intacto (sort() sobre él lanzaría)', () => {
    const entrada = Object.freeze([
      sol('EC-2', 'Recibido', '2026-10-21T09:00:00-05:00'),
      sol('EC-1', 'Recibido', '2026-10-20T09:00:00-05:00'),
    ])

    const tablero = agruparTablero(entrada)

    expect(entrada.map((s) => s.radicado)).toEqual(['EC-2', 'EC-1'])
    expect(radicados(columnaDe(tablero.activas, 'Recibido'))).toEqual(['EC-1', 'EC-2'])
  })

  it('urgentesEnRecibido cuenta solo las urgentes que esperan revisión', () => {
    const tablero = agruparTablero([
      sol('EC-1', 'Recibido', '2026-10-20T09:00:00-05:00', true),
      sol('EC-2', 'Recibido', '2026-10-21T09:00:00-05:00', true),
      sol('EC-3', 'Recibido', '2026-10-22T09:00:00-05:00'),
      sol('EC-4', 'Validado', '2026-10-23T09:00:00-05:00', true),
      sol('EC-5', 'Entregado', '2026-10-01T09:00:00-05:00', true),
    ])

    expect(tablero.urgentesEnRecibido).toBe(2)
  })
})

describe('textoUrgentes (DT2)', () => {
  it('sin urgentes no hay aviso; con urgentes, singular y plural', () => {
    expect(textoUrgentes(0)).toBeNull()
    expect(textoUrgentes(1)).toBe('1 solicitud urgente espera revisión.')
    expect(textoUrgentes(3)).toBe('3 solicitudes urgentes esperan revisión.')
  })
})
