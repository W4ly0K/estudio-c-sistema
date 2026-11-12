import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import DetalleSolicitud from './DetalleSolicitud'
import { ProveedorApi } from './api/ProveedorApi'
import type { Resultado } from './api/cliente'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type { Categoria, DetalleSolicitante, RespuestaEdicionAnexo } from './api/esquemas'
import { ESTADOS, type Estado, type Rol } from './api/maquina-estados'
import type { ApiSolicitudes } from './api/solicitudes'
import { TEXTO_ANEXO } from './componentes/EnlaceAnexo'
import { TEXTO_PROCESANDO, TEXTO_VOLVER_SIN_CAMBIOS } from './presentacion/acciones-solicitante'
import {
  TEXTO_ANEXO_INVALIDO,
  TEXTO_COMO_COMPARTIR_ANEXO,
  TEXTO_ETIQUETA_ANEXO_NUEVO,
  TEXTO_FICHA_SIN_ANEXO,
  TEXTO_RAZON_ANEXO_IGUAL,
  TEXTO_RAZON_ANEXO_VACIO,
  TEXTO_RAZON_RECARGAR_ANEXO,
} from './presentacion/anexo'
import { RUTA_DETALLE } from './rutas'
import { DETALLE_SOLICITANTE, apiFalsa } from './test/fixtures-api'

/**
 * Fase 9 · K3 (ADR-009 AN10 a AN14 · ADR-012 D10): el dueño agrega, cambia o retira su anexo
 * en «Recibido». La API es falsa: aquí se prueba lo que ofrece y envía el cliente; la
 * autorización y las reglas definitivas son del servidor (probadas en el backend, J2).
 */

// Consulta, fragmento y mayúsculas: cualquier normalización del anterior lo cambiaría.
const VIEJO = 'https://drive.google.com/file/d/AbC_1/view?usp=sharing#Guion'
const NUEVO = 'https://docs.google.com/document/d/ZyX_2/edit'
const RADICADO = DETALLE_SOLICITANTE.radicado

const recibido = (categoria: Categoria, enlace_anexo: string | null): DetalleSolicitante => ({
  ...DETALLE_SOLICITANTE,
  categoria,
  estado: 'Recibido',
  enlace_anexo,
  logs: [],
})

const respuesta = (solicitud: DetalleSolicitante, mensaje: string, sin_cambios = false): Resultado<RespuestaEdicionAnexo> => ({
  ok: true,
  datos: { mensaje, sin_cambios, solicitud },
})

const errorHttp = (status: number, mensaje: string) =>
  ({ ok: false, error: { tipo: 'http', status, mensajes: [mensaje], requiereRecarga: false } }) as const

function mostrar(
  detalle: DetalleSolicitante | ReturnType<typeof vi.fn<ApiSolicitudes['detalleSolicitante']>>,
  cambios: Partial<ApiSolicitudes> = {},
  rol: Rol = 'SOLICITANTE',
) {
  const detalleSolicitante =
    typeof detalle === 'function'
      ? detalle
      : vi.fn<ApiSolicitudes['detalleSolicitante']>().mockResolvedValue({ ok: true, datos: detalle })
  const api = apiFalsa({ detalleSolicitante, ...cambios })
  render(
    <MemoryRouter initialEntries={[`/solicitudes/${RADICADO}`]}>
      <ProveedorApi api={api}>
        <Routes>
          <Route
            path={RUTA_DETALLE}
            element={<DetalleSolicitud usuario={{ id: 'uuid', nombre: 'Ana Pérez', rol }} onLogout={() => undefined} />}
          />
        </Routes>
      </ProveedorApi>
    </MemoryRouter>,
  )
  return api
}

const esperarDetalle = () => screen.findByRole('heading', { name: RADICADO })
const abrir = (boton: string, titulo: string) => {
  fireEvent.click(screen.getByRole('button', { name: boton }))
  return screen.getByRole('dialog', { name: titulo })
}
const campoNuevo = (dialogo: HTMLElement) => within(dialogo).getByLabelText(TEXTO_ETIQUETA_ANEXO_NUEVO)
const BOTONES_EDICION = ['Agregar anexo', 'Cambiar anexo', 'Retirar anexo'] as const
const botonesDeEdicion = () =>
  BOTONES_EDICION.filter((nombre) => screen.queryByRole('button', { name: nombre }) !== null)

describe('DetalleSolicitud · edición del anexo por el dueño (Fase 9 · K3)', () => {
  describe('cuándo se ofrece', () => {
    it.each<[Categoria, string | null, readonly string[]]>([
      ['PODCAST', null, ['Agregar anexo']],
      ['VIDEO', null, ['Agregar anexo']],
      ['STREAMING', null, ['Agregar anexo']],
      ['PODCAST', VIEJO, ['Cambiar anexo', 'Retirar anexo']],
      ['VIDEO', VIEJO, ['Cambiar anexo', 'Retirar anexo']],
      ['STREAMING', VIEJO, ['Cambiar anexo', 'Retirar anexo']],
      ['ESPACIOS', null, []],
      ['ASESORIAS', null, []],
    ])('Recibido · %s · anexo %s → %j', async (categoria, anexo, esperados) => {
      mostrar(recibido(categoria, anexo))
      await esperarDetalle()

      expect(botonesDeEdicion()).toEqual(esperados)
    })

    it('DK3-1: sin anexo y con edición disponible, la fila «Anexo (guion)» dice «Sin anexo» junto a «Agregar anexo»', async () => {
      mostrar(recibido('VIDEO', null))
      await esperarDetalle()

      expect(screen.getByText(TEXTO_ANEXO)).toBeInTheDocument()
      expect(screen.getByText(TEXTO_FICHA_SIN_ANEXO)).toBeInTheDocument()
    })

    it.each<Categoria>(['ESPACIOS', 'ASESORIAS'])('%s sin anexo: no aparece la fila del anexo', async (categoria) => {
      mostrar(recibido(categoria, null))
      await esperarDetalle()

      expect(screen.queryByText(TEXTO_ANEXO)).not.toBeInTheDocument()
    })

    it.each(ESTADOS.filter((estado): estado is Exclude<Estado, 'Recibido'> => estado !== 'Recibido'))(
      'PODCAST en «%s»: el anexo se ve, pero no se edita',
      async (estado) => {
        mostrar({ ...recibido('PODCAST', VIEJO), estado })
        await esperarDetalle()

        expect(screen.getByRole('link', { name: /Abrir el anexo/ })).toHaveAttribute('href', VIEJO)
        expect(botonesDeEdicion()).toEqual([])
      },
    )

    it('un usuario STAFF en esta pantalla no recibe la edición (el servidor también lo rechazaría)', async () => {
      mostrar(recibido('PODCAST', VIEJO), {}, 'STAFF')
      await esperarDetalle()

      expect(botonesDeEdicion()).toEqual([])
    })
  })

  describe('agregar, cambiar y retirar', () => {
    it('agregar: valida con anexoParaEnviar, envía el anterior null EXPLÍCITO y el nuevo recortado; pinta lo devuelto y anuncia', async () => {
      const editarAnexo = vi
        .fn<ApiSolicitudes['editarAnexo']>()
        .mockResolvedValue(respuesta(recibido('PODCAST', NUEVO), 'Anexo actualizado.'))
      mostrar(recibido('PODCAST', null), { editarAnexo })
      await esperarDetalle()

      const dialogo = abrir('Agregar anexo', 'Agregar un anexo')
      expect(dialogo).toHaveAccessibleDescription(/EC-2026-0142.*queda registrado para el Estudio C/)
      expect(campoNuevo(dialogo)).toHaveAccessibleDescription(TEXTO_COMO_COMPARTIR_ANEXO)
      const guardar = within(dialogo).getByRole('button', { name: 'Guardar el anexo' })
      expect(guardar).toBeDisabled()
      expect(guardar).toHaveAccessibleDescription(TEXTO_RAZON_ANEXO_VACIO)

      fireEvent.change(campoNuevo(dialogo), { target: { value: 'http://drive.google.com/file/d/xyz/view' } })
      expect(campoNuevo(dialogo)).toHaveAttribute('aria-invalid', 'true')
      expect(guardar).toHaveAccessibleDescription(TEXTO_ANEXO_INVALIDO)

      fireEvent.change(campoNuevo(dialogo), { target: { value: `  ${NUEVO}  ` } })
      expect(guardar).toBeEnabled()
      fireEvent.click(guardar)

      expect(await screen.findByRole('status')).toHaveTextContent('Anexo actualizado.')
      expect(editarAnexo).toHaveBeenCalledOnce()
      expect(editarAnexo.mock.calls[0]?.[0]).toBe(RADICADO)
      expect(editarAnexo.mock.calls[0]?.[1]).toStrictEqual({ enlace_anexo_anterior: null, enlace_anexo: NUEVO })
      expect(screen.getByRole('link', { name: /Abrir el anexo/ })).toHaveAttribute('href', NUEVO)
      expect(dialogo).not.toHaveAttribute('open')
      expect(screen.getByRole('heading', { name: RADICADO })).toHaveFocus()
    })

    it('cambiar: el anterior viaja EXACTO; vacío y mismo enlace se bloquean con su explicación (DK3-2 y DK3-3)', async () => {
      const editarAnexo = vi
        .fn<ApiSolicitudes['editarAnexo']>()
        .mockResolvedValue(respuesta(recibido('STREAMING', NUEVO), 'Anexo actualizado.'))
      mostrar(recibido('STREAMING', VIEJO), { editarAnexo })
      await esperarDetalle()

      const dialogo = abrir('Cambiar anexo', 'Cambiar el anexo')
      expect(within(dialogo).getByRole('link', { name: /Abrir el anexo/ })).toHaveAttribute('href', VIEJO)
      const guardar = within(dialogo).getByRole('button', { name: 'Guardar el cambio' })
      expect(guardar).toHaveAccessibleDescription(TEXTO_RAZON_ANEXO_VACIO)

      fireEvent.change(campoNuevo(dialogo), { target: { value: ` ${VIEJO} ` } })
      expect(guardar).toBeDisabled()
      expect(guardar).toHaveAccessibleDescription(TEXTO_RAZON_ANEXO_IGUAL)

      fireEvent.change(campoNuevo(dialogo), { target: { value: NUEVO } })
      fireEvent.click(guardar)

      await screen.findByRole('status')
      expect(editarAnexo.mock.calls[0]?.[1]).toStrictEqual({ enlace_anexo_anterior: VIEJO, enlace_anexo: NUEVO })
    })

    it('retirar: acción propia, no irreversible, con null EXPLÍCITO; luego ofrece agregar', async () => {
      const editarAnexo = vi
        .fn<ApiSolicitudes['editarAnexo']>()
        .mockResolvedValue(respuesta(recibido('VIDEO', null), 'Anexo retirado.'))
      mostrar(recibido('VIDEO', VIEJO), { editarAnexo })
      await esperarDetalle()

      const dialogo = abrir('Retirar anexo', 'Retirar el anexo')
      expect(dialogo).toHaveAccessibleDescription(/queda sin anexo.*registrado para el Estudio C.*puedes volver a agregar/)
      expect(within(dialogo).queryByLabelText(TEXTO_ETIQUETA_ANEXO_NUEVO)).not.toBeInTheDocument()
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, retirar el anexo' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Anexo retirado.')
      const cuerpo = editarAnexo.mock.calls[0]?.[1]
      expect(cuerpo).toStrictEqual({ enlace_anexo_anterior: VIEJO, enlace_anexo: null })
      expect(cuerpo).toHaveProperty('enlace_anexo', null)
      expect(screen.getByText(TEXTO_FICHA_SIN_ANEXO)).toBeInTheDocument()
      expect(botonesDeEdicion()).toEqual(['Agregar anexo'])
    })

    it('sin_cambios: true es un éxito; se pinta SOLO la solicitud devuelta y su mensaje, sin otra petición', async () => {
      // El servidor manda: aquí devuelve otro anexo vigente (p. ej., cambiado en otra pestaña).
      const editarAnexo = vi
        .fn<ApiSolicitudes['editarAnexo']>()
        .mockResolvedValue(respuesta(recibido('PODCAST', NUEVO), 'El anexo ya tenía ese valor.', true))
      const api = mostrar(recibido('PODCAST', VIEJO), { editarAnexo })
      await esperarDetalle()

      const dialogo = abrir('Cambiar anexo', 'Cambiar el anexo')
      fireEvent.change(campoNuevo(dialogo), { target: { value: NUEVO } })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar el cambio' }))

      expect(await screen.findByRole('status')).toHaveTextContent('El anexo ya tenía ese valor.')
      expect(screen.getByRole('link', { name: /Abrir el anexo/ })).toHaveAttribute('href', NUEVO)
      expect(api.detalleSolicitante).toHaveBeenCalledOnce()
    })
  })

  describe('errores, recarga y doble envío', () => {
    it('409: mensaje del servidor, sin reintento ni nueva confirmación; cerrar recarga UNA vez y la nueva edición usa la foto nueva', async () => {
      const mensaje = 'El anexo cambió desde que abrió el detalle. Recargue y vuelva a intentarlo.'
      const editarAnexo = vi
        .fn<ApiSolicitudes['editarAnexo']>()
        .mockResolvedValueOnce(errorHttp(409, mensaje))
        .mockResolvedValueOnce(respuesta(recibido('VIDEO', VIEJO), 'Anexo actualizado.'))
      const detalleSolicitante = vi
        .fn<ApiSolicitudes['detalleSolicitante']>()
        .mockResolvedValueOnce({ ok: true, datos: recibido('VIDEO', VIEJO) })
        .mockResolvedValue({ ok: true, datos: recibido('VIDEO', NUEVO) })
      mostrar(detalleSolicitante, { editarAnexo })
      await esperarDetalle()

      const dialogo = abrir('Retirar anexo', 'Retirar el anexo')
      const confirmar = within(dialogo).getByRole('button', { name: 'Sí, retirar el anexo' })
      fireEvent.click(confirmar)

      expect(await within(dialogo).findByRole('alert')).toHaveTextContent(mensaje)
      expect(confirmar).toBeDisabled()
      expect(confirmar).toHaveAccessibleDescription(TEXTO_RAZON_RECARGAR_ANEXO)
      fireEvent.click(confirmar)
      expect(editarAnexo).toHaveBeenCalledOnce()

      fireEvent.click(within(dialogo).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))
      await waitFor(() => expect(detalleSolicitante).toHaveBeenCalledTimes(2))
      await esperarDetalle()
      expect(detalleSolicitante).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('link', { name: /Abrir el anexo/ })).toHaveAttribute('href', NUEVO)

      const otraVez = abrir('Cambiar anexo', 'Cambiar el anexo')
      fireEvent.change(campoNuevo(otraVez), { target: { value: VIEJO } })
      fireEvent.click(within(otraVez).getByRole('button', { name: 'Guardar el cambio' }))
      await waitFor(() => expect(editarAnexo).toHaveBeenCalledTimes(2))
      expect(editarAnexo.mock.calls[1]?.[1]).toStrictEqual({ enlace_anexo_anterior: NUEVO, enlace_anexo: VIEJO })
    })

    it('409 con «Recargar la solicitud»: recarga una sola vez (el cierre no la repite)', async () => {
      const editarAnexo = vi.fn<ApiSolicitudes['editarAnexo']>().mockResolvedValue(errorHttp(409, 'El anexo solo se puede cambiar mientras la solicitud está en Recibido.'))
      const detalleSolicitante = vi
        .fn<ApiSolicitudes['detalleSolicitante']>()
        .mockResolvedValueOnce({ ok: true, datos: recibido('PODCAST', null) })
        .mockResolvedValue({ ok: true, datos: { ...recibido('PODCAST', null), estado: 'Validado' } })
      mostrar(detalleSolicitante, { editarAnexo })
      await esperarDetalle()

      const dialogo = abrir('Agregar anexo', 'Agregar un anexo')
      fireEvent.change(campoNuevo(dialogo), { target: { value: NUEVO } })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar el anexo' }))
      fireEvent.click(await within(dialogo).findByRole('button', { name: 'Recargar la solicitud' }))

      await waitFor(() => expect(detalleSolicitante).toHaveBeenCalledTimes(2))
      await esperarDetalle()
      expect(detalleSolicitante).toHaveBeenCalledTimes(2)
      // Ya no está en «Recibido»: la edición dejó de ofrecerse.
      expect(botonesDeEdicion()).toEqual([])
    })

    it('si la recarga tras el 409 falla, no queda nada con qué operar sobre la foto vieja', async () => {
      const editarAnexo = vi.fn<ApiSolicitudes['editarAnexo']>().mockResolvedValue(errorHttp(409, 'Conflicto'))
      const detalleSolicitante = vi
        .fn<ApiSolicitudes['detalleSolicitante']>()
        .mockResolvedValueOnce({ ok: true, datos: recibido('VIDEO', VIEJO) })
        .mockResolvedValue({ ok: false, error: { tipo: 'red' } })
      mostrar(detalleSolicitante, { editarAnexo })
      await esperarDetalle()

      const dialogo = abrir('Retirar anexo', 'Retirar el anexo')
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, retirar el anexo' }))
      await within(dialogo).findByRole('alert')
      fireEvent.click(within(dialogo).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))

      expect(await screen.findByText(TEXTO_SIN_CONEXION)).toBeInTheDocument()
      expect(botonesDeEdicion()).toEqual([])
      expect(screen.queryByRole('link', { name: /Abrir el anexo/ })).not.toBeInTheDocument()
      expect(editarAnexo).toHaveBeenCalledOnce()
    })

    it.each([
      [400, 'Esta categoría no admite anexo: el guion solo se adjunta en solicitudes de pódcast, video o streaming.'],
      [404, 'Solicitud no encontrada.'],
    ])('%i: muestra el mensaje del servidor tal cual; no es un conflicto (cerrar no recarga)', async (status, mensaje) => {
      const editarAnexo = vi.fn<ApiSolicitudes['editarAnexo']>().mockResolvedValue(errorHttp(status, mensaje))
      const api = mostrar(recibido('PODCAST', null), { editarAnexo })
      await esperarDetalle()

      const dialogo = abrir('Agregar anexo', 'Agregar un anexo')
      fireEvent.change(campoNuevo(dialogo), { target: { value: NUEVO } })
      const guardar = within(dialogo).getByRole('button', { name: 'Guardar el anexo' })
      fireEvent.click(guardar)

      const alerta = await within(dialogo).findByRole('alert')
      expect(alerta).toHaveTextContent(mensaje)
      expect(within(alerta).queryByRole('button', { name: 'Recargar la solicitud' })).not.toBeInTheDocument()
      expect(guardar).toBeEnabled()
      fireEvent.click(within(dialogo).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))
      expect(dialogo).not.toHaveAttribute('open')
      expect(api.detalleSolicitante).toHaveBeenCalledOnce()
    })

    it('doble clic: una sola petición; mientras viaja, el botón dice «Procesando…» y se bloquea', async () => {
      let responder: (valor: Resultado<RespuestaEdicionAnexo>) => void = () => undefined
      const editarAnexo = vi.fn<ApiSolicitudes['editarAnexo']>().mockReturnValue(
        new Promise((resolver) => {
          responder = resolver
        }),
      )
      mostrar(recibido('VIDEO', VIEJO), { editarAnexo })
      await esperarDetalle()

      const dialogo = abrir('Retirar anexo', 'Retirar el anexo')
      const confirmar = within(dialogo).getByRole('button', { name: 'Sí, retirar el anexo' })
      fireEvent.click(confirmar)
      fireEvent.click(confirmar)

      expect(editarAnexo).toHaveBeenCalledOnce()
      expect(await within(dialogo).findByRole('button', { name: TEXTO_PROCESANDO })).toBeDisabled()
      responder(respuesta(recibido('VIDEO', null), 'Anexo retirado.'))
      expect(await screen.findByRole('status')).toHaveTextContent('Anexo retirado.')
      expect(editarAnexo).toHaveBeenCalledOnce()
    })
  })

  describe('convivencia con la cancelación (T3)', () => {
    it('en «Recibido» se ofrecen las dos; cancelar sigue igual y la edición deja de ofrecerse', async () => {
      const cancelada: DetalleSolicitante = { ...recibido('PODCAST', VIEJO), estado: 'Cancelado por el Usuario' }
      const cancelar = vi
        .fn<ApiSolicitudes['cancelar']>()
        .mockResolvedValue({ ok: true, datos: { mensaje: 'Solicitud cancelada correctamente.', solicitud: cancelada } })
      const editarAnexo = vi.fn<ApiSolicitudes['editarAnexo']>()
      mostrar(recibido('PODCAST', VIEJO), { cancelar, editarAnexo })
      await esperarDetalle()

      expect(screen.getByRole('button', { name: 'Cancelar solicitud' })).toBeInTheDocument()
      expect(botonesDeEdicion()).toEqual(['Cambiar anexo', 'Retirar anexo'])

      const dialogo = abrir('Cancelar solicitud', 'Cancelar la solicitud')
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, cancelar la solicitud' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Solicitud cancelada correctamente.')
      expect(cancelar).toHaveBeenCalledExactlyOnceWith(RADICADO)
      expect(editarAnexo).not.toHaveBeenCalled()
      expect(botonesDeEdicion()).toEqual([])
      expect(screen.getByRole('link', { name: /Abrir el anexo/ })).toHaveAttribute('href', VIEJO)
    })
  })
})
