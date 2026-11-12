import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import DetalleStaff, { TEXTO_RECARGA_FALLIDA } from './DetalleStaff'
import { ProveedorApi } from './api/ProveedorApi'
import type { Resultado } from './api/cliente'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type {
  Categoria,
  DetalleStaff as DatosDetalleStaff,
  EventoEnlace,
  HistorialEnlaces,
  RespuestaCorreccionEntrega,
} from './api/esquemas'
import type { Estado } from './api/maquina-estados'
import type { ApiSolicitudes } from './api/solicitudes'
import { TEXTO_PROCESANDO, TEXTO_VOLVER_SIN_CAMBIOS } from './presentacion/acciones-solicitante'
import {
  AUTOR_SOLICITANTE,
  AUTOR_STAFF,
  TEXTO_ADVERTENCIA_DATOS_PERSONALES,
  TEXTO_ENTREGA_SIN_ENLACE,
  TEXTO_ETIQUETA_ENLACE_CORREGIDO,
  TEXTO_ETIQUETA_MOTIVO_CORRECCION,
  TEXTO_HISTORIAL_ERROR,
  TEXTO_HISTORIAL_VACIO,
  TEXTO_RAZON_CORRECCION_IGUAL,
  TEXTO_RAZON_CORRECCION_VACIA,
  TEXTO_RAZON_RECARGAR_CORRECCION,
  TEXTO_RECARGA_FALLIDA_SIN_CAMBIOS,
  TEXTO_SIN_ENLACE,
  TEXTO_TITULO_HISTORIAL,
} from './presentacion/enlaces-staff'
import { RUTA_DETALLE } from './rutas'
import { DETALLE_STAFF, apiFalsa } from './test/fixtures-api'

/**
 * Fase 9 · K4 (J2b y J3 · ADR-008 EN6 a EN12 · ADR-012 EV7 y D10): historial de enlaces y
 * corrección del enlace de entrega en el detalle del Staff. La API es falsa: se prueba lo que
 * ofrece, muestra y envía el cliente; las reglas definitivas son del servidor.
 */
const STAFF = { id: 'uuid-staff', nombre: 'Staff Estudio C', rol: 'STAFF' } as const
const RADICADO = DETALLE_STAFF.radicado
const DUENO = DETALLE_STAFF.id_usuario
const VIEJO = 'https://youtu.be/AbC_1?t=10#inicio'
const NUEVO = 'https://drive.google.com/file/d/ZyX_2/view'

const BASE: DatosDetalleStaff = { ...DETALLE_STAFF, usuario: { ...DETALLE_STAFF.usuario, rol: 'SOLICITANTE' } }
const detalle = (estado: Estado, categoria: Categoria, enlace_entrega: string | null): DatosDetalleStaff => ({
  ...BASE,
  estado,
  categoria,
  enlace_entrega,
})
const ENTREGADO = detalle('Entregado', 'PODCAST', VIEJO)

const historial = (eventos: EventoEnlace[]): Resultado<HistorialEnlaces> => ({ ok: true, datos: { radicado: RADICADO, eventos } })
const EVENTO_ANEXO: EventoEnlace = {
  id_log: 'log-anexo',
  enlace_campo: 'ANEXO',
  enlace_anterior: null,
  enlace_nuevo: 'https://drive.google.com/file/d/guion/view',
  motivo_correccion: null,
  modificado_por: DUENO,
  fecha_modificacion: '2026-10-09T14:00:00.000Z',
}
const EVENTO_ENTREGA: EventoEnlace = {
  id_log: 'log-entrega',
  enlace_campo: 'ENTREGA',
  enlace_anterior: 'javascript:alert(1)',
  enlace_nuevo: VIEJO,
  motivo_correccion: 'Se registró el enlace de otra grabación.',
  modificado_por: 'uuid-staff',
  fecha_modificacion: '2026-10-20T15:00:00.000Z',
}

const corregida = (mensaje: string, sin_cambios = false, solicitud = ENTREGADO): Resultado<RespuestaCorreccionEntrega> => ({
  ok: true,
  datos: { mensaje, sin_cambios, solicitud },
})
const errorHttp = (status: number, mensaje: string) =>
  ({ ok: false, error: { tipo: 'http', status, mensajes: [mensaje], requiereRecarga: false } }) as const

function mostrar(
  datos: DatosDetalleStaff | ReturnType<typeof vi.fn<ApiSolicitudes['detalleStaff']>>,
  cambios: Partial<ApiSolicitudes> = {},
) {
  const detalleStaff =
    typeof datos === 'function' ? datos : vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue({ ok: true, datos })
  const api = apiFalsa({ detalleStaff, ...cambios })
  render(
    <MemoryRouter initialEntries={[`/solicitudes/${RADICADO}`]}>
      <ProveedorApi api={api}>
        <Routes>
          <Route path={RUTA_DETALLE} element={<DetalleStaff usuario={STAFF} onLogout={() => undefined} />} />
        </Routes>
      </ProveedorApi>
    </MemoryRouter>,
  )
  return api
}

const esperarDetalle = () => screen.findByRole('heading', { name: RADICADO })
const seccionHistorial = () => screen.findByRole('region', { name: TEXTO_TITULO_HISTORIAL })
const abrirCorreccion = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Corregir enlace' }))
  return screen.getByRole('dialog', { name: 'Corregir el enlace del producto final' })
}
const guardar = (dialogo: HTMLElement) => within(dialogo).getByRole('button', { name: 'Guardar la corrección' })
const escribirEnlace = (dialogo: HTMLElement, valor: string) =>
  fireEvent.change(within(dialogo).getByLabelText(TEXTO_ETIQUETA_ENLACE_CORREGIDO), { target: { value: valor } })

describe('DetalleStaff · historial de enlaces (Fase 9 · K4)', () => {
  it('se muestra aparte de la línea de vida, en orden, con valores como TEXTO y sin identificadores internos', async () => {
    const historialEnlaces = vi.fn<ApiSolicitudes['historialEnlaces']>().mockResolvedValue(historial([EVENTO_ANEXO, EVENTO_ENTREGA]))
    mostrar(detalle('Validado', 'PODCAST', null), { historialEnlaces })

    const seccion = await seccionHistorial()
    // La sección se pinta (en «Cargando…») antes de que su efecto pida el historial: se espera a la
    // condición observable (los eventos en pantalla) y entonces se exige UNA sola llamada.
    const eventos = await within(seccion).findAllByRole('listitem')
    expect(historialEnlaces).toHaveBeenCalledExactlyOnceWith(RADICADO)
    // El primer párrafo de cada evento es su descripción.
    expect(eventos.map((e) => e.querySelector('p')?.textContent)).toEqual([
      'Anexo agregado',
      'Enlace del producto final corregido',
    ])
    const [primero, segundo] = eventos
    if (primero === undefined || segundo === undefined) throw new Error('faltan eventos')
    expect(within(primero).getByText(TEXTO_SIN_ENLACE)).toBeInTheDocument()
    expect(within(primero).getByText(AUTOR_SOLICITANTE)).toBeInTheDocument()
    expect(within(segundo).getByText('javascript:alert(1)')).toBeInTheDocument()
    expect(within(segundo).getByText(EVENTO_ENTREGA.motivo_correccion ?? '')).toBeInTheDocument()
    expect(within(segundo).getByText(AUTOR_STAFF)).toBeInTheDocument()
    // DK4-3: ningún valor histórico es un enlace ejecutable, ni siquiera los seguros.
    expect(within(seccion).queryAllByRole('link')).toHaveLength(0)
    // DK4-4: ni modificado_por ni id_log se muestran.
    expect(seccion.textContent).not.toMatch(/uuid|log-anexo|log-entrega/)
  })

  it('vacío: lo dice', async () => {
    mostrar(detalle('Validado', 'VIDEO', null))
    const seccion = await seccionHistorial()
    expect(await within(seccion).findByText(TEXTO_HISTORIAL_VACIO)).toBeInTheDocument()
  })

  it('error propio con reintento; el detalle sigue disponible', async () => {
    const historialEnlaces = vi
      .fn<ApiSolicitudes['historialEnlaces']>()
      .mockResolvedValueOnce({ ok: false, error: { tipo: 'red' } })
      .mockResolvedValueOnce(historial([EVENTO_ANEXO]))
    mostrar(detalle('Validado', 'STREAMING', null), { historialEnlaces })

    const seccion = await seccionHistorial()
    const alerta = await within(seccion).findByRole('alert')
    expect(alerta).toHaveTextContent(TEXTO_HISTORIAL_ERROR)
    expect(alerta).toHaveTextContent(TEXTO_SIN_CONEXION)
    expect(screen.getByRole('heading', { name: RADICADO })).toBeInTheDocument()

    fireEvent.click(within(seccion).getByRole('button', { name: 'Reintentar' }))
    expect(await within(seccion).findByText('Anexo agregado')).toBeInTheDocument()
    expect(historialEnlaces).toHaveBeenCalledTimes(2)
  })

  it.each<Categoria>(['ESPACIOS', 'ASESORIAS'])('%s: ni se pide ni se muestra (no puede tener eventos de enlace)', async (categoria) => {
    const api = mostrar(detalle('Validado', categoria, null))
    await esperarDetalle()

    expect(screen.queryByRole('region', { name: TEXTO_TITULO_HISTORIAL })).not.toBeInTheDocument()
    expect(api.historialEnlaces).not.toHaveBeenCalled()
  })
})

describe('DetalleStaff · corrección del enlace de entrega (Fase 9 · K4)', () => {
  describe('cuándo se ofrece', () => {
    it.each<[string, DatosDetalleStaff, boolean]>([
      ['Entregado · PODCAST con enlace', detalle('Entregado', 'PODCAST', VIEJO), true],
      ['Entregado · VIDEO con enlace', detalle('Entregado', 'VIDEO', VIEJO), true],
      ['Entregado · STREAMING con enlace', detalle('Entregado', 'STREAMING', VIEJO), true],
      ['Entregado · ESPACIOS sin enlace', detalle('Entregado', 'ESPACIOS', null), false],
      ['Entregado · ASESORIAS sin enlace', detalle('Entregado', 'ASESORIAS', null), false],
      ['Edición y postproducción · VIDEO', detalle('Edición y postproducción', 'VIDEO', null), false],
      ['En Producción · STREAMING', detalle('En Producción', 'STREAMING', null), false],
    ])('%s → %s', async (_caso, datos, ofrece) => {
      mostrar(datos)
      await esperarDetalle()

      if (ofrece) expect(screen.getByRole('button', { name: 'Corregir enlace' })).toBeEnabled()
      else expect(screen.queryByRole('button', { name: 'Corregir enlace' })).not.toBeInTheDocument()
    })

    it.each<Categoria>(['PODCAST', 'VIDEO', 'STREAMING'])('EN8 · %s entregado sin enlace: la nota, sin «Corregir enlace»', async (categoria) => {
      mostrar(detalle('Entregado', categoria, null))
      await esperarDetalle()

      expect(screen.getByText(TEXTO_ENTREGA_SIN_ENLACE)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Corregir enlace' })).not.toBeInTheDocument()
    })
  })

  it('sin motivo: anterior EXACTO, nuevo recortado, sin la clave del motivo; anuncia el mensaje y recarga detalle e historial', async () => {
    const corregirEnlaceEntrega = vi
      .fn<ApiSolicitudes['corregirEnlaceEntrega']>()
      .mockResolvedValue(corregida('Enlace del producto final corregido.'))
    const api = mostrar(ENTREGADO, { corregirEnlaceEntrega })
    await esperarDetalle()
    await seccionHistorial()

    const dialogo = abrirCorreccion()
    expect(dialogo).toHaveAccessibleDescription(/EC-2026-0142.*sigue en "Entregado"/)
    expect(within(dialogo).getByRole('link', { name: /producto final/i })).toHaveAttribute('href', VIEJO)
    // DK4-7: la advertencia, antes de guardar, como descripción del motivo.
    expect(within(dialogo).getByLabelText(TEXTO_ETIQUETA_MOTIVO_CORRECCION)).toHaveAccessibleDescription(
      new RegExp(TEXTO_ADVERTENCIA_DATOS_PERSONALES.slice(0, 40)),
    )
    expect(within(dialogo).getByText(new RegExp(TEXTO_ADVERTENCIA_DATOS_PERSONALES.slice(0, 40)))).toBeVisible()
    expect(guardar(dialogo)).toHaveAccessibleDescription(TEXTO_RAZON_CORRECCION_VACIA)
    escribirEnlace(dialogo, ` ${VIEJO} `)
    expect(guardar(dialogo)).toHaveAccessibleDescription(TEXTO_RAZON_CORRECCION_IGUAL)
    escribirEnlace(dialogo, `  ${NUEVO}  `)
    fireEvent.click(guardar(dialogo))

    expect(await screen.findByRole('status')).toHaveTextContent('Enlace del producto final corregido.')
    const cuerpo = corregirEnlaceEntrega.mock.calls[0]?.[1]
    expect(cuerpo).toStrictEqual({ enlace_entrega_anterior: VIEJO, enlace_entrega: NUEVO })
    expect(cuerpo).not.toHaveProperty('motivo_correccion')
    expect(cuerpo).not.toHaveProperty('estado')
    await waitFor(() => expect(api.detalleStaff).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(api.historialEnlaces).toHaveBeenCalledTimes(2))
    expect(api.actualizarTablero).not.toHaveBeenCalled()
  })

  it('con motivo: corto bloquea; válido viaja recortado', async () => {
    const corregirEnlaceEntrega = vi
      .fn<ApiSolicitudes['corregirEnlaceEntrega']>()
      .mockResolvedValue(corregida('Enlace del producto final corregido.'))
    mostrar(ENTREGADO, { corregirEnlaceEntrega })
    await esperarDetalle()

    const dialogo = abrirCorreccion()
    escribirEnlace(dialogo, NUEVO)
    const motivo = within(dialogo).getByLabelText(TEXTO_ETIQUETA_MOTIVO_CORRECCION)
    fireEvent.change(motivo, { target: { value: 'Corto' } })
    expect(guardar(dialogo)).toBeDisabled()
    fireEvent.change(motivo, { target: { value: '  Se registró el enlace de otra grabación.  ' } })
    fireEvent.click(guardar(dialogo))

    await screen.findByRole('status')
    expect(corregirEnlaceEntrega.mock.calls[0]?.[1]).toStrictEqual({
      enlace_entrega_anterior: VIEJO,
      enlace_entrega: NUEVO,
      motivo_correccion: 'Se registró el enlace de otra grabación.',
    })
  })

  it('sin_cambios: true es un éxito; se anuncia el mensaje del servidor sin inventar eventos', async () => {
    const corregirEnlaceEntrega = vi
      .fn<ApiSolicitudes['corregirEnlaceEntrega']>()
      .mockResolvedValue(corregida('El enlace ya tenía ese valor.', true))
    const api = mostrar(ENTREGADO, { corregirEnlaceEntrega })
    await esperarDetalle()

    const dialogo = abrirCorreccion()
    escribirEnlace(dialogo, NUEVO)
    fireEvent.click(guardar(dialogo))

    expect(await screen.findByRole('status')).toHaveTextContent('El enlace ya tenía ese valor.')
    const seccion = await seccionHistorial()
    expect(await within(seccion).findByText(TEXTO_HISTORIAL_VACIO)).toBeInTheDocument()
    await waitFor(() => expect(api.historialEnlaces).toHaveBeenCalledTimes(2))
  })

  it.each<[boolean, string]>([
    [false, TEXTO_RECARGA_FALLIDA],
    [true, TEXTO_RECARGA_FALLIDA_SIN_CAMBIOS],
  ])('éxito (sin_cambios = %s) con recarga fallida: se dice que el servidor respondió y que falló SOLO la recarga', async (sinCambios, texto) => {
    const corregirEnlaceEntrega = vi
      .fn<ApiSolicitudes['corregirEnlaceEntrega']>()
      .mockResolvedValue(corregida(sinCambios ? 'El enlace ya tenía ese valor.' : 'Enlace del producto final corregido.', sinCambios))
    const detalleStaff = vi
      .fn<ApiSolicitudes['detalleStaff']>()
      .mockResolvedValueOnce({ ok: true, datos: ENTREGADO })
      .mockResolvedValue({ ok: false, error: { tipo: 'red' } })
    mostrar(detalleStaff, { corregirEnlaceEntrega })
    await esperarDetalle()

    const dialogo = abrirCorreccion()
    escribirEnlace(dialogo, NUEVO)
    fireEvent.click(guardar(dialogo))

    const alerta = await screen.findByText(new RegExp(texto.slice(0, 30)))
    expect(alerta).toHaveTextContent(TEXTO_SIN_CONEXION)
    expect(screen.queryByRole('button', { name: 'Corregir enlace' })).not.toBeInTheDocument()
    expect(corregirEnlaceEntrega).toHaveBeenCalledOnce()
  })

  it('409: mensaje del servidor, sin nueva confirmación ni reintento; cerrar recarga UNA vez y la siguiente usa la foto nueva', async () => {
    const mensaje = 'El enlace cambió desde que abrió el detalle. Recargue y vuelva a intentarlo.'
    const corregirEnlaceEntrega = vi
      .fn<ApiSolicitudes['corregirEnlaceEntrega']>()
      .mockResolvedValueOnce(errorHttp(409, mensaje))
      .mockResolvedValueOnce(corregida('Enlace del producto final corregido.'))
    const detalleStaff = vi
      .fn<ApiSolicitudes['detalleStaff']>()
      .mockResolvedValueOnce({ ok: true, datos: ENTREGADO })
      .mockResolvedValue({ ok: true, datos: detalle('Entregado', 'PODCAST', NUEVO) })
    mostrar(detalleStaff, { corregirEnlaceEntrega })
    await esperarDetalle()

    const dialogo = abrirCorreccion()
    escribirEnlace(dialogo, NUEVO)
    fireEvent.click(guardar(dialogo))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(mensaje)
    expect(guardar(dialogo)).toBeDisabled()
    expect(guardar(dialogo)).toHaveAccessibleDescription(TEXTO_RAZON_RECARGAR_CORRECCION)
    fireEvent.click(guardar(dialogo))
    expect(corregirEnlaceEntrega).toHaveBeenCalledOnce()

    fireEvent.click(within(dialogo).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))
    await waitFor(() => expect(detalleStaff).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Corregir enlace' })).toBeEnabled())
    expect(detalleStaff).toHaveBeenCalledTimes(2)

    const otraVez = abrirCorreccion()
    escribirEnlace(otraVez, VIEJO)
    fireEvent.click(guardar(otraVez))
    await waitFor(() => expect(corregirEnlaceEntrega).toHaveBeenCalledTimes(2))
    expect(corregirEnlaceEntrega.mock.calls[1]?.[1]).toStrictEqual({ enlace_entrega_anterior: NUEVO, enlace_entrega: VIEJO })
  })

  it.each([
    [400, 'Esta categoría no tiene un enlace de producto final que corregir.'],
    [403, 'La corrección del enlace del producto final solo la hace el Staff.'],
    [404, 'Solicitud no encontrada.'],
  ])('%i: el mensaje del servidor tal cual; no es un conflicto (cerrar no recarga)', async (status, mensaje) => {
    const corregirEnlaceEntrega = vi.fn<ApiSolicitudes['corregirEnlaceEntrega']>().mockResolvedValue(errorHttp(status, mensaje))
    const api = mostrar(ENTREGADO, { corregirEnlaceEntrega })
    await esperarDetalle()

    const dialogo = abrirCorreccion()
    escribirEnlace(dialogo, NUEVO)
    fireEvent.click(guardar(dialogo))

    const alerta = await within(dialogo).findByRole('alert')
    expect(alerta).toHaveTextContent(mensaje)
    expect(within(alerta).queryByRole('button', { name: 'Recargar la solicitud' })).not.toBeInTheDocument()
    expect(guardar(dialogo)).toBeEnabled()
    fireEvent.click(within(dialogo).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))
    expect(dialogo).not.toHaveAttribute('open')
    expect(api.detalleStaff).toHaveBeenCalledOnce()
  })

  it('doble clic: una sola petición; mientras viaja, «Procesando…» y bloqueado', async () => {
    let responder: (valor: Resultado<RespuestaCorreccionEntrega>) => void = () => undefined
    const corregirEnlaceEntrega = vi.fn<ApiSolicitudes['corregirEnlaceEntrega']>().mockReturnValue(
      new Promise((resolver) => {
        responder = resolver
      }),
    )
    mostrar(ENTREGADO, { corregirEnlaceEntrega })
    await esperarDetalle()

    const dialogo = abrirCorreccion()
    escribirEnlace(dialogo, NUEVO)
    fireEvent.click(guardar(dialogo))
    fireEvent.click(within(dialogo).getByRole('button', { name: TEXTO_PROCESANDO }))

    expect(corregirEnlaceEntrega).toHaveBeenCalledOnce()
    expect(within(dialogo).getByRole('button', { name: TEXTO_PROCESANDO })).toBeDisabled()
    responder(corregida('Enlace del producto final corregido.'))
    expect(await screen.findByRole('status')).toHaveTextContent('Enlace del producto final corregido.')
    expect(corregirEnlaceEntrega).toHaveBeenCalledOnce()
  })
})
