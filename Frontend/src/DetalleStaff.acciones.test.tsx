import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DetalleStaff, { TEXTO_RECARGA_FALLIDA } from './DetalleStaff'
import { ProveedorApi } from './api/ProveedorApi'
import type { Resultado } from './api/cliente'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type { DetalleStaff as DatosDetalleStaff } from './api/esquemas'
import type { Estado } from './api/maquina-estados'
import { MENSAJE_CAMBIO_CONCURRENTE } from './api/mensajes'
import type { ApiSolicitudes } from './api/solicitudes'
import { TEXTO_ACTUALIZANDO, TEXTO_AYUDA_CONFLICTO, TEXTO_ETIQUETA_MOTIVO_RECHAZO } from './componentes/AccionesStaff'
import { TEXTO_FRANJA_INICIADA } from './presentacion/acciones-staff'
import { TEXTO_PROCESANDO, TEXTO_VOLVER_SIN_CAMBIOS } from './presentacion/acciones-solicitante'
import { RUTA_DETALLE } from './rutas'
import { DETALLE_STAFF, SOLICITUD, apiFalsa } from './test/fixtures-api'

const STAFF = { id: 'uuid-staff', nombre: 'Staff Estudio C', rol: 'STAFF' } as const

/** Franja del fixture: 15 de octubre, 14:00 Z. El reloj de las pruebas va antes (salvo DA4). */
const BASE: DatosDetalleStaff = { ...DETALLE_STAFF, usuario: { ...DETALLE_STAFF.usuario, rol: 'SOLICITANTE' } }
const en = (estado: Estado): DatosDetalleStaff => ({ ...BASE, estado })
const RECIBIDO: DatosDetalleStaff = { ...BASE, estado: 'Recibido', logs: [] }

const ok = (datos: DatosDetalleStaff): Resultado<DatosDetalleStaff> => ({ ok: true, datos })
const PATCH_OK = { ok: true, datos: { mensaje: 'Estado actualizado y auditado correctamente en la bitácora', solicitud: SOLICITUD } } as const

function mostrar(cambios: Partial<ApiSolicitudes>) {
  const api = apiFalsa(cambios)
  render(
    <MemoryRouter initialEntries={['/solicitudes/EC-2026-0142']}>
      <ProveedorApi api={api}>
        <Routes>
          <Route path={RUTA_DETALLE} element={<DetalleStaff usuario={STAFF} onLogout={() => undefined} />} />
        </Routes>
      </ProveedorApi>
    </MemoryRouter>,
  )
  return api
}

const esperarDetalle = () => screen.findByRole('heading', { name: 'EC-2026-0142' })

/** Abre la acción y devuelve su diálogo. */
function abrir(boton: string, titulo: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: boton }))
  return screen.getByRole('dialog', { name: titulo })
}

describe('DetalleStaff · acciones T1, T2, T4 y T9 (6.5.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T15:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each<[Estado, string[]]>([
    ['Recibido', ['Validar', 'Rechazar']],
    ['Validado', ['Iniciar producción']],
    ['En Producción', ['Marcar como entregada']],
  ])('en "%s" la resolución ofrece %j', async (estado, botones) => {
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(en(estado))) })

    const resolucion = await screen.findByRole('region', { name: 'Resolución' })
    expect(within(resolucion).getAllByRole('button').map((b) => b.textContent)).toEqual(botones)
  })

  it.each<Estado>(['Pendiente de Reprogramación', 'Entregado', 'Rechazado'])('en "%s" no hay resolución', async (estado) => {
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(en(estado))) })
    await esperarDetalle()

    expect(screen.queryByRole('region', { name: 'Resolución' })).not.toBeInTheDocument()
  })

  it('validar (T1): envía solo el destino, anuncia el éxito, recarga el detalle (DA2) y deja el foco en el radicado', async () => {
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
    const detalleStaff = vi
      .fn<ApiSolicitudes['detalleStaff']>()
      .mockResolvedValueOnce(ok(RECIBIDO))
      .mockResolvedValueOnce(ok(en('Validado')))
    mostrar({ detalleStaff, actualizarTablero })
    await esperarDetalle()

    const dialogo = abrir('Validar', 'Validar la solicitud')
    expect(dialogo).toHaveAccessibleDescription(/EC-2026-0142.*"Validado"/)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, validar' }))

    expect(await screen.findByRole('button', { name: 'Iniciar producción' })).toBeEnabled()
    expect(actualizarTablero).toHaveBeenCalledExactlyOnceWith('EC-2026-0142', { estado: 'Validado' })
    expect(detalleStaff).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('La solicitud pasó a "Validado".')
    // Cerrado con close(), no arrancado del DOM todavía abierto.
    expect(dialogo).toBeInTheDocument()
    expect(dialogo).not.toHaveAttribute('open')
    expect(screen.getByRole('heading', { name: 'EC-2026-0142' })).toHaveFocus()
  })

  it('DA2 · mientras recarga: se ve el detalle anterior (sin parpadeo) con las acciones bloqueadas', async () => {
    const detalleStaff = vi
      .fn<ApiSolicitudes['detalleStaff']>()
      .mockResolvedValueOnce(ok(RECIBIDO))
      .mockReturnValueOnce(new Promise(() => undefined))
    mostrar({ detalleStaff, actualizarTablero: vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK) })
    await esperarDetalle()

    fireEvent.click(within(abrir('Validar', 'Validar la solicitud')).getByRole('button', { name: 'Sí, validar' }))

    expect(await screen.findByText(TEXTO_ACTUALIZANDO)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'EC-2026-0142' })).toBeInTheDocument()
    expect(screen.queryByText('Cargando la solicitud...')).not.toBeInTheDocument()
  })

  it.each<[Estado, string, string, Estado]>([
    ['Validado', 'Iniciar producción', 'Sí, iniciar la producción', 'En Producción'],
    ['En Producción', 'Marcar como entregada', 'Sí, marcar como entregada', 'Entregado'],
  ])('desde "%s", "%s" envía su destino', async (estado, boton, confirmar, destino) => {
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(en(estado))), actualizarTablero })
    await esperarDetalle()

    fireEvent.click(screen.getByRole('button', { name: boton }))
    fireEvent.click(screen.getByRole('button', { name: confirmar }))

    expect(await screen.findByRole('status')).toHaveTextContent(`La solicitud pasó a "${destino}".`)
    expect(actualizarTablero).toHaveBeenCalledExactlyOnceWith('EC-2026-0142', { estado: destino })
  })

  it('rechazar (T2): bloqueado hasta un motivo válido medido como el backend, y envía el texto recortado', async () => {
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)), actualizarTablero })
    await esperarDetalle()

    const dialogo = abrir('Rechazar', 'Rechazar la solicitud')
    expect(dialogo).toHaveAccessibleDescription(/estado final: no se puede deshacer/)
    const campo = within(dialogo).getByLabelText(TEXTO_ETIQUETA_MOTIVO_RECHAZO)
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, rechazar' })
    expect(confirmar).toBeDisabled()
    expect(campo).toHaveAccessibleDescription(/Escribe entre 10 y 500 caracteres/)

    fireEvent.change(campo, { target: { value: '🎬'.repeat(5) } }) // 10 unidades de JavaScript
    expect(confirmar).toBeDisabled()
    expect(campo).toHaveAccessibleDescription(/Faltan 5 caracteres/)

    fireEvent.change(campo, { target: { value: 'x'.repeat(501) } })
    expect(confirmar).toBeDisabled()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveValue('x'.repeat(501)) // sin maxLength: no trunca, avisa

    fireEvent.change(campo, { target: { value: '   El set está en mantenimiento esa semana   ' } })
    expect(confirmar).toBeEnabled()
    fireEvent.click(confirmar)

    expect(await screen.findByRole('status')).toHaveTextContent('La solicitud pasó a "Rechazado".')
    expect(actualizarTablero).toHaveBeenCalledExactlyOnceWith('EC-2026-0142', {
      estado: 'Rechazado',
      motivo_rechazo: 'El set está en mantenimiento esa semana',
    })
  })

  it('el motivo empieza en blanco cada vez que se abre el diálogo', async () => {
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)) })
    await esperarDetalle()

    const dialogo = abrir('Rechazar', 'Rechazar la solicitud')
    fireEvent.change(within(dialogo).getByLabelText(TEXTO_ETIQUETA_MOTIVO_RECHAZO), { target: { value: 'Borrador a medias' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))

    const otraVez = abrir('Rechazar', 'Rechazar la solicitud')
    expect(within(otraVez).getByLabelText(TEXTO_ETIQUETA_MOTIVO_RECHAZO)).toHaveValue('')
  })

  it('doble clic: un solo PATCH; mientras viaja, el botón se bloquea y Escape no cierra', async () => {
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockReturnValue(new Promise(() => undefined))
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)), actualizarTablero })
    await esperarDetalle()

    const dialogo = abrir('Validar', 'Validar la solicitud')
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, validar' })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)

    expect(actualizarTablero).toHaveBeenCalledOnce()
    expect(within(dialogo).getByRole('button', { name: TEXTO_PROCESANDO })).toBeDisabled()
    const escape = new Event('cancel', { cancelable: true })
    dialogo.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(dialogo).toHaveAttribute('open')
  })

  it('409: muestra el mensaje del servidor y "Recargar la solicitud" vuelve a pedir el detalle', async () => {
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue({
      ok: false,
      error: { tipo: 'http', status: 409, mensajes: [MENSAJE_CAMBIO_CONCURRENTE], requiereRecarga: true },
    })
    const detalleStaff = vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO))
    mostrar({ detalleStaff, actualizarTablero })
    await esperarDetalle()

    const dialogo = abrir('Validar', 'Validar la solicitud')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, validar' }))

    const alerta = await within(dialogo).findByRole('alert')
    expect(alerta).toHaveTextContent(MENSAJE_CAMBIO_CONCURRENTE)
    expect(alerta).toHaveTextContent(TEXTO_AYUDA_CONFLICTO)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Recargar la solicitud' }))

    await waitFor(() => expect(detalleStaff).toHaveBeenCalledTimes(2))
    expect(dialogo).not.toHaveAttribute('open')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('409 de la máquina (otra pestaña ya validó): mensaje del servidor, ayuda y, al recargar, el estado real', async () => {
    // Escenario de la prueba manual: la pestaña 2 aún ve "Recibido", pero la solicitud ya está
    // "Validada". La lectura fresca del servidor frena Validado → Rechazado antes del compare-and-set.
    const mensaje = 'Transición de estado no permitida desde el estado actual.'
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue({
      ok: false,
      error: { tipo: 'http', status: 409, mensajes: [mensaje], requiereRecarga: false },
    })
    const detalleStaff = vi
      .fn<ApiSolicitudes['detalleStaff']>()
      .mockResolvedValueOnce(ok(RECIBIDO))
      .mockResolvedValueOnce(ok(en('Validado')))
    mostrar({ detalleStaff, actualizarTablero })
    await esperarDetalle()

    const dialogo = abrir('Rechazar', 'Rechazar la solicitud')
    fireEvent.change(within(dialogo).getByLabelText(TEXTO_ETIQUETA_MOTIVO_RECHAZO), {
      target: { value: 'El set está en mantenimiento esa semana' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, rechazar' }))

    const alerta = await within(dialogo).findByRole('alert')
    expect(alerta).toHaveTextContent(mensaje)
    expect(alerta).toHaveTextContent(TEXTO_AYUDA_CONFLICTO)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Recargar la solicitud' }))

    expect(await screen.findByRole('button', { name: 'Iniciar producción' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('DA2 · éxito con recarga fallida: dice que la acción quedó registrada y permite recargar sin repetirla', async () => {
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
    const detalleStaff = vi
      .fn<ApiSolicitudes['detalleStaff']>()
      .mockResolvedValueOnce(ok(RECIBIDO))
      .mockResolvedValueOnce({ ok: false, error: { tipo: 'red' } })
      .mockResolvedValueOnce(ok(en('Validado')))
    mostrar({ detalleStaff, actualizarTablero })
    await esperarDetalle()

    fireEvent.click(within(abrir('Validar', 'Validar la solicitud')).getByRole('button', { name: 'Sí, validar' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(TEXTO_RECARGA_FALLIDA)
    expect(alerta).toHaveTextContent(TEXTO_SIN_CONEXION)
    expect(screen.getByRole('status')).toHaveTextContent('La solicitud pasó a "Validado".')

    fireEvent.click(screen.getByRole('button', { name: 'Recargar la solicitud' }))

    expect(await screen.findByRole('button', { name: 'Iniciar producción' })).toBeInTheDocument()
    expect(actualizarTablero).toHaveBeenCalledOnce() // recargar NO repite la acción
    expect(screen.getByRole('status')).toHaveTextContent('La solicitud pasó a "Validado".')
  })

  it('DA4: con la franja ya iniciada lo advierte, sin deshabilitar "Validar" (decide el servidor)', async () => {
    vi.setSystemTime(new Date('2026-10-15T14:30:00.000Z'))
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)) })

    expect(await screen.findByText(TEXTO_FRANJA_INICIADA)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validar' })).toBeEnabled()
  })

  it('DA4: con la franja por delante no hay advertencia', async () => {
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)) })
    await screen.findByRole('region', { name: 'Resolución' })

    expect(screen.queryByText(TEXTO_FRANJA_INICIADA)).not.toBeInTheDocument()
  })
})
