import { describe, expect, it, vi } from 'vitest'
import { crearApiSolicitudes, type ApiSolicitudes } from './solicitudes'
import {
  BASE,
  DETALLE_SOLICITANTE,
  DETALLE_STAFF,
  RECURSOS_RESUMEN,
  SOLICITUD,
  crearEntornoDePrueba,
  json,
} from '../test/fixtures-api'

const MOTIVO = 'Mantenimiento preventivo del set de grabación'

describe('crearApiSolicitudes: una función por ruta del contrato', () => {
  it('misSolicitudes → GET /solicitudes/mis-solicitudes y valida la lista', async () => {
    const { cliente, llamada } = crearEntornoDePrueba(json(200, [{ ...SOLICITUD, recursos: RECURSOS_RESUMEN }]))

    const resultado = await crearApiSolicitudes(cliente).misSolicitudes()

    expect(resultado.ok).toBe(true)
    expect(llamada().url).toBe(`${BASE}/solicitudes/mis-solicitudes`)
    expect(llamada().init.method).toBe('GET')
  })

  it('tablero sin filtros → GET /solicitudes, sin "?"', async () => {
    const { cliente, llamada } = crearEntornoDePrueba(json(200, []))

    await crearApiSolicitudes(cliente).tablero()

    expect(llamada().url).toBe(`${BASE}/solicitudes`)
  })

  it('tablero con filtros → parámetros codificados (tildes y espacios incluidos)', async () => {
    const { cliente, llamada } = crearEntornoDePrueba(json(200, []))

    await crearApiSolicitudes(cliente).tablero({ estado: 'Pendiente de Reprogramación', categoria: 'VIDEO' })

    const url = new URL(llamada().url)
    expect(url.pathname).toBe('/solicitudes')
    expect(url.searchParams.get('estado')).toBe('Pendiente de Reprogramación')
    expect(url.searchParams.get('categoria')).toBe('VIDEO')
  })

  it('el radicado se codifica: un "/" o un "?" no pueden cambiar la ruta', async () => {
    const { cliente, llamada } = crearEntornoDePrueba(json(200, DETALLE_SOLICITANTE))

    await crearApiSolicitudes(cliente).detalleSolicitante('EC-1/../cancelar?x=1')

    expect(llamada().url).toBe(`${BASE}/solicitudes/EC-1%2F..%2Fcancelar%3Fx%3D1`)
  })

  it('detalleStaff exige la proyección del Staff: la del solicitante es un error de contrato', async () => {
    const { cliente } = crearEntornoDePrueba(json(200, DETALLE_SOLICITANTE))
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const resultado = await crearApiSolicitudes(cliente).detalleStaff('EC-1')

    consola.mockRestore()
    expect(resultado).toEqual({ ok: false, error: { tipo: 'contrato' } })
  })

  it('crear → POST /solicitudes con el cuerpo tal cual', async () => {
    const { cliente, llamada } = crearEntornoDePrueba(json(201, { ...SOLICITUD, estado: 'Recibido' }))
    const cuerpo = {
      categoria: 'PODCAST',
      proposito: 'Grabación del episodio piloto',
      fecha_inicio: '2026-10-15T09:00:00-05:00',
      fecha_fin: '2026-10-15T11:00:00-05:00',
      sub_espacio: 'CABINA_AUDIO',
    } as const

    const resultado = await crearApiSolicitudes(cliente).crear(cuerpo)

    expect(resultado.ok).toBe(true)
    expect(llamada().url).toBe(`${BASE}/solicitudes`)
    expect(llamada().init.method).toBe('POST')
    expect(JSON.parse(String(llamada().init.body))).toEqual(cuerpo)
  })

  it('actualizarTablero → PATCH con el rechazo y su motivo', async () => {
    const { cliente, llamada } = crearEntornoDePrueba(
      json(200, { mensaje: 'Estado actualizado y auditado correctamente en la bitácora', solicitud: { ...SOLICITUD, estado: 'Rechazado' } }),
    )

    const resultado = await crearApiSolicitudes(cliente).actualizarTablero('EC-1', {
      estado: 'Rechazado',
      motivo_rechazo: 'El espacio está en mantenimiento esa semana',
    })

    expect(resultado.ok && resultado.datos.solicitud.estado).toBe('Rechazado')
    expect(llamada().url).toBe(`${BASE}/solicitudes/EC-1`)
    expect(llamada().init.method).toBe('PATCH')
  })

  it('proponerReprogramacion → POST …/reprogramacion con fechas y motivo; responde la proyección del Staff', async () => {
    const { cliente, llamada } = crearEntornoDePrueba(json(200, { mensaje: 'Propuesta registrada', solicitud: DETALLE_STAFF }))
    const cuerpo = {
      fecha_inicio: '2026-10-28T09:00:00-05:00',
      fecha_fin: '2026-10-28T10:00:00-05:00',
      sub_espacio: 'ESTUDIO_GRABACION',
      motivo: MOTIVO,
    } as const

    const resultado = await crearApiSolicitudes(cliente).proponerReprogramacion('EC-1', cuerpo)

    expect(resultado.ok).toBe(true)
    expect(llamada().url).toBe(`${BASE}/solicitudes/EC-1/reprogramacion`)
    expect(JSON.parse(String(llamada().init.body))).toEqual(cuerpo)
  })

  it.each<[keyof ApiSolicitudes, string]>([
    ['cancelar', '/cancelar'],
    ['aceptarReprogramacion', '/reprogramacion/aceptar'],
    ['rechazarReprogramacion', '/reprogramacion/rechazar'],
  ])('%s → POST …%s sin cuerpo (la identidad sale del token)', async (metodo, sufijo) => {
    const { cliente, llamada } = crearEntornoDePrueba(json(200, { mensaje: 'ok', solicitud: DETALLE_SOLICITANTE }))
    const api = crearApiSolicitudes(cliente)
    const comando = api[metodo] as (radicado: string) => Promise<unknown>

    await comando('EC-1')

    expect(llamada().url).toBe(`${BASE}/solicitudes/EC-1${sufijo}`)
    expect(llamada().init.method).toBe('POST')
    expect(llamada().init.body).toBeUndefined()
  })

  it('los cuerpos imposibles no compilan (verificado por tsc en npm run typecheck)', () => {
    const soloTipos = (api: ApiSolicitudes): void => {
      // @ts-expect-error E1: "Pendiente de Reprogramación" no es un destino del PATCH (es T5).
      void api.actualizarTablero('EC-1', { estado: 'Pendiente de Reprogramación' })
      // @ts-expect-error E5: un motivo de rechazo sin cambiar a "Rechazado".
      void api.actualizarTablero('EC-1', { estado: 'Validado', motivo_rechazo: 'No aplica aquí' })
      // @ts-expect-error E5: rechazar exige el motivo.
      void api.actualizarTablero('EC-1', { estado: 'Rechazado' })
      // @ts-expect-error K7: proponer exige el motivo (Fase 6.1b).
      void api.proponerReprogramacion('EC-1', { fecha_inicio: 'x', fecha_fin: 'y', sub_espacio: 'CABINA_AUDIO' })
      // @ts-expect-error Fase 7 · SE6: proponer exige el sub-espacio (franja y lugar).
      void api.proponerReprogramacion('EC-1', { fecha_inicio: 'x', fecha_fin: 'y', motivo: 'Motivo suficiente' })
      // @ts-expect-error Fase 7 · Q-A4: crear exige que el solicitante elija el sub-espacio.
      void api.crear({ categoria: 'VIDEO', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y' })
      // @ts-expect-error Fase 7: un sub-espacio fuera del contrato.
      void api.crear({ categoria: 'VIDEO', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y', sub_espacio: 'SALA_3' })
    }
    expect(soloTipos).toBeTypeOf('function')
  })
})
