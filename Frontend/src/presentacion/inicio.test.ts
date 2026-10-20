import { describe, expect, it } from 'vitest'
import { ESTADOS, ESTADOS_FINALES, type Estado } from '../api/maquina-estados'
import { TEXTO_BLOQUES_ATENCION } from './franja'
import {
  REGLAS_ESTUDIO_C,
  atajosDelStaff,
  resumenInicioSolicitante,
  resumenInicioStaff,
  type ParaResumenSolicitante,
} from './inicio'
import { agruparTablero } from './tablero'

const AHORA = new Date('2026-10-20T15:00:00.000Z')
const PASADO = '2026-10-19T14:00:00.000Z'
const FUTURO = '2026-10-28T14:00:00.000Z'

const sol = (
  radicado: string,
  estado: Estado,
  fecha_inicio: string,
  extra: Partial<Pick<ParaResumenSolicitante, 'es_urgencia' | 'fecha_propuesta_inicio'>> = {},
): ParaResumenSolicitante => ({
  radicado,
  estado,
  fecha_inicio,
  es_urgencia: false,
  fecha_propuesta_inicio: null,
  ...extra,
})

const radicados = (lista: readonly ParaResumenSolicitante[]) => lista.map((s) => s.radicado)

describe('resumenInicioStaff (Fase 7 · C3)', () => {
  it('sin solicitudes, todo en cero', () => {
    expect(resumenInicioStaff([], AHORA)).toEqual({
      urgentesEnRecibido: 0,
      vencidasEnRecibido: 0,
      esperandoAlSolicitante: 0,
      enProduccion: 0,
    })
  })

  it('cuenta cada atajo; una urgente vencida cuenta en los dos (no son excluyentes)', () => {
    const resumen = resumenInicioStaff(
      [
        sol('A', 'Recibido', FUTURO, { es_urgencia: true }),
        sol('B', 'Recibido', PASADO, { es_urgencia: true }),
        sol('C', 'Recibido', PASADO),
        sol('D', 'Recibido', FUTURO),
        sol('E', 'Pendiente de Reprogramación', FUTURO),
        sol('F', 'En Producción', PASADO),
        sol('G', 'En Producción', PASADO),
      ],
      AHORA,
    )

    expect(resumen).toEqual({ urgentesEnRecibido: 2, vencidasEnRecibido: 2, esperandoAlSolicitante: 1, enProduccion: 2 })
  })

  it('frontera igual que D7 en el servidor: un inicio EXACTAMENTE ahora ya cuenta como vencida', () => {
    expect(resumenInicioStaff([sol('A', 'Recibido', AHORA.toISOString())], AHORA).vencidasEnRecibido).toBe(1)
    expect(resumenInicioStaff([sol('A', 'Recibido', '2026-10-20T15:00:01.000Z')], AHORA).vencidasEnRecibido).toBe(0)
  })

  it('"vencida" solo aplica a Recibido: una validada que ya pasó no es un atajo del inicio', () => {
    expect(resumenInicioStaff([sol('A', 'Validado', PASADO)], AHORA).vencidasEnRecibido).toBe(0)
  })

  it('una fecha ilegible no inventa una vencida (mismo criterio que DA4)', () => {
    expect(resumenInicioStaff([sol('A', 'Recibido', 'no-es-una-fecha')], AHORA).vencidasEnRecibido).toBe(0)
  })

  it.each(ESTADOS_FINALES)('"%s" (final) no suma en ningún atajo', (estado) => {
    expect(resumenInicioStaff([sol('A', estado, PASADO, { es_urgencia: true })], AHORA)).toEqual({
      urgentesEnRecibido: 0,
      vencidasEnRecibido: 0,
      esperandoAlSolicitante: 0,
      enProduccion: 0,
    })
  })

  it('las urgentes coinciden con el aviso del tablero (DT2): el inicio y el tablero no se contradicen', () => {
    const todas = ESTADOS.flatMap((estado, i) => [
      sol(`U${i}`, estado, FUTURO, { es_urgencia: true }),
      sol(`N${i}`, estado, PASADO),
    ])

    expect(resumenInicioStaff(todas, AHORA).urgentesEnRecibido).toBe(agruparTablero(todas).urgentesEnRecibido)
  })
})

describe('atajosDelStaff (Fase 7 · C4)', () => {
  const CEROS = { urgentesEnRecibido: 0, vencidasEnRecibido: 0, esperandoAlSolicitante: 0, enProduccion: 0 }

  it('cuatro atajos en orden de lectura: primero lo que pide acción del Staff', () => {
    expect(atajosDelStaff(CEROS).map((a) => a.clave)).toEqual(['urgentes', 'vencidas', 'esperando', 'produccion'])
  })

  it('cada atajo lleva su número del resumen', () => {
    const atajos = atajosDelStaff({ urgentesEnRecibido: 1, vencidasEnRecibido: 2, esperandoAlSolicitante: 3, enProduccion: 4 })
    expect(atajos.map((a) => a.cantidad)).toEqual([1, 2, 3, 4])
  })

  it('solo urgentes y vencidas piden atención, y solo si hay alguna', () => {
    expect(atajosDelStaff(CEROS).some((a) => a.requiereAtencion)).toBe(false)
    const conTodo = atajosDelStaff({ urgentesEnRecibido: 1, vencidasEnRecibido: 1, esperandoAlSolicitante: 9, enProduccion: 9 })
    expect(conTodo.filter((a) => a.requiereAtencion).map((a) => a.clave)).toEqual(['urgentes', 'vencidas'])
  })

  it('títulos distintos y ayudas no vacías; ninguna promete avisos que el sistema no envía', () => {
    const atajos = atajosDelStaff(CEROS)
    expect(new Set(atajos.map((a) => a.titulo)).size).toBe(atajos.length)
    for (const atajo of atajos) {
      expect(atajo.ayuda.length).toBeGreaterThan(0)
      expect(atajo.ayuda).not.toMatch(/notific|avisar|se le avisar/i)
    }
  })
})

describe('REGLAS_ESTUDIO_C (Fase 7 · C5)', () => {
  it('el horario es el MISMO texto del formulario B2 (una sola fuente) y ninguna regla promete avisos', () => {
    expect(REGLAS_ESTUDIO_C[0]).toBe(TEXTO_BLOQUES_ATENCION)
    expect(new Set(REGLAS_ESTUDIO_C).size).toBe(REGLAS_ESTUDIO_C.length)
    for (const regla of REGLAS_ESTUDIO_C) expect(regla).not.toMatch(/notific|te avisaremos|recibirás un correo/i)
  })
})

describe('resumenInicioSolicitante (Fase 7 · C3)', () => {
  it('pendientes de tu respuesta: solo "Pendiente de Reprogramación", la propuesta más próxima primero', () => {
    const { pendientesDeTuRespuesta } = resumenInicioSolicitante(
      [
        sol('P-tarde', 'Pendiente de Reprogramación', PASADO, { fecha_propuesta_inicio: '2026-11-05T14:00:00.000Z' }),
        sol('V', 'Validado', FUTURO),
        sol('P-pronto', 'Pendiente de Reprogramación', FUTURO, { fecha_propuesta_inicio: '2026-10-22T14:00:00.000Z' }),
        sol('P-sin-propuesta', 'Pendiente de Reprogramación', FUTURO),
        sol('R', 'Recibido', FUTURO),
      ],
      AHORA,
    )

    expect(radicados(pendientesDeTuRespuesta)).toEqual(['P-pronto', 'P-tarde', 'P-sin-propuesta'])
  })

  it('una propuesta ya vencida sigue pendiente: rechazarla (T8) es una salida válida', () => {
    const { pendientesDeTuRespuesta } = resumenInicioSolicitante(
      [sol('P', 'Pendiente de Reprogramación', PASADO, { fecha_propuesta_inicio: PASADO })],
      AHORA,
    )

    expect(radicados(pendientesDeTuRespuesta)).toEqual(['P'])
  })

  it('próximas validadas: solo Validado con la franja por delante, la más cercana primero (desempate por radicado)', () => {
    const { proximasValidadas } = resumenInicioSolicitante(
      [
        sol('V-lejos', 'Validado', '2026-11-10T14:00:00.000Z'),
        sol('V-ya-paso', 'Validado', PASADO),
        sol('V-ahora', 'Validado', AHORA.toISOString()),
        sol('V-ilegible', 'Validado', 'no-es-una-fecha'),
        sol('V-cerca-b', 'Validado', '2026-10-21T14:00:00.000Z'),
        sol('V-cerca-a', 'Validado', '2026-10-21T09:00:00-05:00'),
        sol('R-futuro', 'Recibido', FUTURO),
        sol('E', 'En Producción', FUTURO),
      ],
      AHORA,
    )

    expect(radicados(proximasValidadas)).toEqual(['V-cerca-a', 'V-cerca-b', 'V-lejos'])
  })

  it('devuelve los mismos objetos (la vista conserva todos sus campos) y no muta la entrada', () => {
    const v = { ...sol('V', 'Validado', FUTURO), proposito: 'Grabación del pódcast' }
    const p = sol('P', 'Pendiente de Reprogramación', FUTURO, { fecha_propuesta_inicio: FUTURO })
    const entrada = Object.freeze([v, p])

    const resumen = resumenInicioSolicitante(entrada, AHORA)

    expect(resumen.proximasValidadas[0]).toBe(v)
    expect(resumen.proximasValidadas[0]).toHaveProperty('proposito', 'Grabación del pódcast')
    expect(resumen.pendientesDeTuRespuesta[0]).toBe(p)
    expect(entrada).toEqual([v, p])
  })

  it('sin solicitudes, las dos listas vacías', () => {
    expect(resumenInicioSolicitante([], AHORA)).toEqual({ pendientesDeTuRespuesta: [], proximasValidadas: [] })
  })
})
