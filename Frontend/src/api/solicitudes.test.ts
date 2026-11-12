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

  it('crear → POST /solicitudes con el cuerpo tal cual (espacio físico, con su lugar)', async () => {
    const { cliente, llamada } = crearEntornoDePrueba(json(201, { ...SOLICITUD, estado: 'Recibido' }))
    const cuerpo = {
      categoria: 'ESPACIOS',
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

  it.each([
    ['agregar (anterior null)', { enlace_anexo_anterior: null, enlace_anexo: 'https://drive.google.com/file/d/xyz/view' }],
    ['retirar (nuevo null)', { enlace_anexo_anterior: 'https://drive.google.com/file/d/xyz/view', enlace_anexo: null }],
  ] as const)('Fase 9 · K3 · editarAnexo → PATCH …/anexo, %s: las dos claves viajan, null incluido', async (_caso, cuerpo) => {
    const { cliente, llamada } = crearEntornoDePrueba(
      json(200, { mensaje: 'Anexo actualizado.', sin_cambios: false, solicitud: { ...DETALLE_SOLICITANTE, estado: 'Recibido' } }),
    )

    const resultado = await crearApiSolicitudes(cliente).editarAnexo('EC/1?x', cuerpo)

    expect(resultado.ok && resultado.datos.sin_cambios).toBe(false)
    expect(llamada().url).toBe(`${BASE}/solicitudes/EC%2F1%3Fx/anexo`)
    expect(llamada().init.method).toBe('PATCH')
    expect(llamada().init.body).toBe(JSON.stringify(cuerpo))
  })

  it('Fase 9 · K3 · editarAnexo: una respuesta sin sin_cambios es un error de contrato (fail-closed)', async () => {
    const { cliente } = crearEntornoDePrueba(json(200, { mensaje: 'Anexo actualizado.', solicitud: DETALLE_SOLICITANTE }))

    const resultado = await crearApiSolicitudes(cliente).editarAnexo('EC-1', { enlace_anexo_anterior: null, enlace_anexo: null })

    expect(resultado).toEqual({ ok: false, error: { tipo: 'contrato' } })
  })

  it.each([
    ['sin anexo, con null explícito', { estado: 'Validado', anexo_revisado: null }],
    ['con el anexo observado', { estado: 'Validado', anexo_revisado: 'https://drive.google.com/file/d/xyz/view' }],
  ] as const)('Fase 9 · E7 · actualizarTablero → PATCH de T1 %s', async (_caso, cambios) => {
    const { cliente, llamada } = crearEntornoDePrueba(
      json(200, { mensaje: 'Estado actualizado y auditado correctamente en la bitácora', solicitud: SOLICITUD }),
    )

    await crearApiSolicitudes(cliente).actualizarTablero('EC-1', cambios)

    // JSON.stringify conserva el null: la clave viaja (el servidor distingue null de ausente).
    expect(llamada().init.body).toBe(JSON.stringify(cambios))
    expect(JSON.parse(String(llamada().init.body))).toStrictEqual(cambios)
  })

  it('7B.3 · actualizarTablero → PATCH de "Validar con ajustes": destino, franja y sub-espacio en el mismo cuerpo', async () => {
    const { cliente, llamada } = crearEntornoDePrueba(
      json(200, { mensaje: 'Estado actualizado y auditado correctamente en la bitácora', solicitud: { ...SOLICITUD, sub_espacio: 'ESTUDIO_GRABACION' } }),
    )
    const cambios = {
      estado: 'Validado',
      fecha_inicio: '2026-10-28T09:00:00-05:00',
      fecha_fin: '2026-10-28T10:00:00-05:00',
      sub_espacio: 'ESTUDIO_GRABACION',
    } as const

    const resultado = await crearApiSolicitudes(cliente).actualizarTablero('EC-1', cambios)

    expect(resultado.ok && resultado.datos.solicitud.sub_espacio).toBe('ESTUDIO_GRABACION')
    expect(llamada().init.method).toBe('PATCH')
    expect(JSON.parse(String(llamada().init.body))).toEqual(cambios)
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
      // @ts-expect-error 7B.3: el tablero siempre envía un destino; no edita campos sueltos.
      void api.actualizarTablero('EC-1', { sub_espacio: 'CABINA_AUDIO' })
      // @ts-expect-error D-4: el sub-espacio solo acompaña a T1 ("Validado").
      void api.actualizarTablero('EC-1', { estado: 'En Producción', sub_espacio: 'CABINA_AUDIO' })
      // @ts-expect-error D-4 (deuda de ADR-007 cerrada en el cliente): rechazar no mueve la franja.
      void api.actualizarTablero('EC-1', { estado: 'Rechazado', motivo_rechazo: 'Motivo suficiente', fecha_inicio: 'x', fecha_fin: 'y' })
      // @ts-expect-error Q-B2: la franja del ajuste viaja completa (inicio y fin).
      void api.actualizarTablero('EC-1', { estado: 'Validado', fecha_inicio: 'x' })
      // @ts-expect-error Fase 7: un sub-espacio fuera del contrato.
      void api.actualizarTablero('EC-1', { estado: 'Validado', sub_espacio: 'SALA_3' })
      // @ts-expect-error Fase 8: el enlace del producto final solo acompaña la entrega.
      void api.actualizarTablero('EC-1', { estado: 'Edición y postproducción', enlace_entrega: 'https://youtu.be/abc123' })
      // @ts-expect-error Fase 9 · R9-1: el anexo no viaja en el PATCH (el backend lo omite: 400).
      void api.actualizarTablero('EC-1', { estado: 'Validado', enlace_anexo: 'https://drive.google.com/file/d/xyz/view' })
      // Fase 9 · E7: T1 con la revisión del anexo compila, directo y con ajustes.
      void api.actualizarTablero('EC-1', { estado: 'Validado', anexo_revisado: null })
      void api.actualizarTablero('EC-1', { estado: 'Validado', sub_espacio: 'CABINA_AUDIO', anexo_revisado: 'https://drive.google.com/file/d/xyz/view' })
      // @ts-expect-error Fase 9 · E7: anexo_revisado solo acompaña a T1 ("Validado").
      void api.actualizarTablero('EC-1', { estado: 'En Producción', anexo_revisado: null })
      // @ts-expect-error Fase 9 · E7: tampoco acompaña la entrega.
      void api.actualizarTablero('EC-1', { estado: 'Entregado', enlace_entrega: 'https://youtu.be/abc123', anexo_revisado: null })
      // @ts-expect-error Fase 9 · E7: tampoco acompaña el rechazo.
      void api.actualizarTablero('EC-1', { estado: 'Rechazado', motivo_rechazo: 'Motivo suficiente', anexo_revisado: null })
      // @ts-expect-error Fase 9 · E7: es el enlace observado o null, nunca otro tipo.
      void api.actualizarTablero('EC-1', { estado: 'Validado', anexo_revisado: 42 })
      // Fase 9 · AN2b (K2): el anexo compila en VIDEO y STREAMING (PODCAST, abajo) y con lugar no.
      void api.crear({ categoria: 'VIDEO', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y', enlace_anexo: 'https://drive.google.com/file/d/xyz/view' })
      void api.crear({ categoria: 'STREAMING', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y', enlace_anexo: 'https://drive.google.com/file/d/xyz/view' })
      // @ts-expect-error Fase 9 · AN2b: ESPACIOS no admite anexo (400 MENSAJE_ANEXO_NO_APLICA).
      void api.crear({ categoria: 'ESPACIOS', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y', sub_espacio: 'CABINA_AUDIO', enlace_anexo: 'https://drive.google.com/file/d/xyz/view' })
      // @ts-expect-error Fase 9 · AN2b: ASESORIAS no admite anexo.
      void api.crear({ categoria: 'ASESORIAS', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y', enlace_anexo: 'https://drive.google.com/file/d/xyz/view' })
      // @ts-expect-error Fase 9 · K3: las dos claves de editarAnexo son obligatorias (falta el anterior).
      void api.editarAnexo('EC-1', { enlace_anexo: null })
      // @ts-expect-error Fase 9 · K3: falta el nuevo (null para retirar, nunca ausente).
      void api.editarAnexo('EC-1', { enlace_anexo_anterior: null })
      // @ts-expect-error Fase 9 · K3: el anexo es texto o null.
      void api.editarAnexo('EC-1', { enlace_anexo_anterior: null, enlace_anexo: 42 })
      // Fase 9 · R9-1: en la radicación sí es válido (compila).
      void api.crear({ categoria: 'PODCAST', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y', enlace_anexo: 'https://drive.google.com/file/d/xyz/view' })
      // @ts-expect-error K7: proponer exige el motivo (Fase 6.1b).
      void api.proponerReprogramacion('EC-1', { fecha_inicio: 'x', fecha_fin: 'y', sub_espacio: 'CABINA_AUDIO' })
      // @ts-expect-error Fase 7 · SE6: proponer exige el sub-espacio (franja y lugar).
      void api.proponerReprogramacion('EC-1', { fecha_inicio: 'x', fecha_fin: 'y', motivo: 'Motivo suficiente' })
      // @ts-expect-error Fase 7 · SE10 (CA-12): una solicitud de espacio físico exige el sub-espacio.
      void api.crear({ categoria: 'ESPACIOS', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y' })
      // @ts-expect-error Fase 7 · SE10: un servicio no lleva sub-espacio (lo asigna el Estudio C).
      void api.crear({ categoria: 'PODCAST', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y', sub_espacio: 'CABINA_AUDIO' })
      // @ts-expect-error Fase 7: un sub-espacio fuera del contrato.
      void api.crear({ categoria: 'ESPACIOS', proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y', sub_espacio: 'SALA_3' })
    }
    expect(soloTipos).toBeTypeOf('function')
  })

  it('Fase 9 · AN2b (K2): una categoría sin estrechar no puede llevar anexo (verificado por tsc)', () => {
    const soloTipos = (api: ApiSolicitudes, categoria: 'PODCAST' | 'ASESORIAS'): void => {
      // @ts-expect-error Sin saber si la categoría lo admite, el anexo no compila: hay que estrechar con admiteAnexo().
      void api.crear({ categoria, proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y', enlace_anexo: 'https://drive.google.com/file/d/xyz/view' })
      // Sin anexo, la misma categoría sin estrechar sí compila.
      void api.crear({ categoria, proposito: 'p', fecha_inicio: 'x', fecha_fin: 'y' })
    }
    expect(soloTipos).toBeTypeOf('function')
  })
})
