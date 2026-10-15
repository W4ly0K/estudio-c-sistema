import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import DetalleSolicitud from './DetalleSolicitud'
import { ProveedorApi } from './api/ProveedorApi'
import { MENSAJE_CAMBIO_CONCURRENTE } from './api/mensajes'
import type { DetalleSolicitante } from './api/esquemas'
import type { Rol } from './api/maquina-estados'
import type { ApiSolicitudes } from './api/solicitudes'
import {
  TEXTO_AYUDA_ACEPTAR,
  TEXTO_PROCESANDO,
  TEXTO_SIN_CANCELACION,
  TEXTO_VOLVER_SIN_CAMBIOS,
} from './presentacion/acciones-solicitante'
import { RUTA_DETALLE } from './rutas'
import { DETALLE_SOLICITANTE, LOG, apiFalsa } from './test/fixtures-api'

const PENDIENTE: DetalleSolicitante = {
  ...DETALLE_SOLICITANTE,
  estado: 'Pendiente de Reprogramación',
  fecha_propuesta_inicio: '2026-10-21T19:00:00.000Z',
  fecha_propuesta_fin: '2026-10-21T21:00:00.000Z',
  logs: [
    LOG,
    {
      ...LOG,
      estado_anterior: 'Validado',
      estado_nuevo: 'Pendiente de Reprogramación',
      fecha_modificacion: '2026-10-11T15:00:00.000Z',
      motivo_reprogramacion: 'Mantenimiento de la cabina de sonido.',
    },
  ],
}

const CANCELADA: DetalleSolicitante = {
  ...DETALLE_SOLICITANTE,
  estado: 'Cancelado por el Usuario',
  logs: [
    LOG,
    { ...LOG, estado_anterior: 'Validado', estado_nuevo: 'Cancelado por el Usuario', fecha_modificacion: '2026-10-12T15:00:00.000Z' },
  ],
}

const conflicto = (mensaje: string) =>
  ({
    ok: false,
    error: { tipo: 'http', status: 409, mensajes: [mensaje], requiereRecarga: mensaje === MENSAJE_CAMBIO_CONCURRENTE },
  }) as const

function mostrar(detalle: DetalleSolicitante, cambios: Partial<ApiSolicitudes> = {}, rol: Rol = 'SOLICITANTE') {
  const api = apiFalsa({
    detalleSolicitante: vi.fn<ApiSolicitudes['detalleSolicitante']>().mockResolvedValue({ ok: true, datos: detalle }),
    ...cambios,
  })
  render(
    <MemoryRouter initialEntries={[`/solicitudes/${detalle.radicado}`]}>
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

const esperarDetalle = () => screen.findByRole('heading', { name: DETALLE_SOLICITANTE.radicado })

describe('acciones del solicitante (6.4.4 · B3 y B4)', () => {
  it('Validado: ofrece cancelar (T6) y nada más', async () => {
    mostrar(DETALLE_SOLICITANTE)
    await esperarDetalle()

    const acciones = screen.getByRole('region', { name: 'Acciones sobre la solicitud' })
    expect(within(acciones).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancelar solicitud'])
  })

  it('Pendiente: aceptar o rechazar, y NO cancelar', async () => {
    mostrar(PENDIENTE)
    await esperarDetalle()

    const acciones = screen.getByRole('region', { name: 'Acciones sobre la solicitud' })
    expect(within(acciones).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Aceptar la nueva franja',
      'Rechazar la propuesta',
    ])
  })

  it('En Producción: sin botones, y explica por qué ya no se puede cancelar', async () => {
    mostrar({ ...DETALLE_SOLICITANTE, estado: 'En Producción' })
    await esperarDetalle()

    expect(screen.queryByRole('region', { name: 'Acciones sobre la solicitud' })).not.toBeInTheDocument()
    expect(screen.getByText(TEXTO_SIN_CANCELACION)).toBeInTheDocument()
  })

  it('un usuario STAFF no ve las acciones del solicitante', async () => {
    mostrar(DETALLE_SOLICITANTE, {}, 'STAFF')
    await esperarDetalle()

    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).not.toBeInTheDocument()
  })

  it('cancelar: confirma, llama al servidor, pinta lo que devolvió y anuncia su mensaje', async () => {
    const cancelar = vi
      .fn<ApiSolicitudes['cancelar']>()
      .mockResolvedValue({ ok: true, datos: { mensaje: 'Solicitud cancelada correctamente.', solicitud: CANCELADA } })
    mostrar(DETALLE_SOLICITANTE, { cancelar })
    await esperarDetalle()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar solicitud' }))
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar la solicitud' })
    expect(dialogo).toHaveAccessibleDescription(/EC-2026-0142.*No se puede deshacer/)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, cancelar la solicitud' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Solicitud cancelada correctamente.')
    expect(cancelar).toHaveBeenCalledExactlyOnceWith('EC-2026-0142')
    // Cerrado con close(), no arrancado del DOM todavía abierto.
    expect(dialogo).toBeInTheDocument()
    expect(dialogo).not.toHaveAttribute('open')
    expect(document.querySelector('h2 + div [data-estado="Cancelado por el Usuario"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'EC-2026-0142' })).toHaveFocus()
  })

  it('"Volver sin cambios" cierra sin llamar al servidor', async () => {
    const api = mostrar(DETALLE_SOLICITANTE)
    await esperarDetalle()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar solicitud' }))
    fireEvent.click(screen.getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))

    expect(api.cancelar).not.toHaveBeenCalled()
    expect(screen.queryByText('Sí, cancelar la solicitud')).not.toBeInTheDocument()
  })

  it('doble clic: una sola petición; mientras viaja, los botones se bloquean y Escape no cierra', async () => {
    const cancelar = vi.fn<ApiSolicitudes['cancelar']>().mockReturnValue(new Promise(() => undefined))
    mostrar(DETALLE_SOLICITANTE, { cancelar })
    await esperarDetalle()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar solicitud' }))
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar la solicitud' })
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, cancelar la solicitud' })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)

    expect(cancelar).toHaveBeenCalledOnce()
    expect(await within(dialogo).findByRole('button', { name: TEXTO_PROCESANDO })).toBeDisabled()
    expect(within(dialogo).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS })).toBeDisabled()
    const escape = new Event('cancel', { cancelable: true })
    fireEvent(dialogo, escape)
    expect(escape.defaultPrevented).toBe(true)
  })

  it('409: muestra el mensaje del servidor tal cual y ofrece recargar la solicitud', async () => {
    const mensaje = 'La actividad ya comenzó ("En Producción") y la solicitud ya no puede cancelarse.'
    const cancelar = vi.fn<ApiSolicitudes['cancelar']>().mockResolvedValue(conflicto(mensaje))
    const api = mostrar(DETALLE_SOLICITANTE, { cancelar })
    await esperarDetalle()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar solicitud' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cancelar la solicitud' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(mensaje)
    fireEvent.click(within(alerta).getByRole('button', { name: 'Recargar la solicitud' }))

    await esperarDetalle()
    expect(api.detalleSolicitante).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('aceptar que falla (franja ya ocupada): explica las salidas sin culpar al solicitante', async () => {
    const aceptarReprogramacion = vi
      .fn<ApiSolicitudes['aceptarReprogramacion']>()
      .mockResolvedValue(conflicto('Error CA-06: el horario seleccionado se cruza con otra reserva. Elige otra franja.'))
    mostrar(PENDIENTE, { aceptarReprogramacion })
    await esperarDetalle()

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar la nueva franja' }))
    expect(screen.getByRole('dialog', { name: 'Aceptar la propuesta' })).toHaveAccessibleDescription(
      /miércoles, 21 de octubre de 2026 · 14:00 – 16:00/,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sí, aceptar la propuesta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTO_AYUDA_ACEPTAR)
  })

  it('rechazar la propuesta: advierte que CANCELA la solicitud y llama a T8', async () => {
    const rechazarReprogramacion = vi.fn<ApiSolicitudes['rechazarReprogramacion']>().mockResolvedValue({
      ok: true,
      datos: { mensaje: 'Reprogramación rechazada: la solicitud quedó cancelada y su franja liberada.', solicitud: CANCELADA },
    })
    mostrar(PENDIENTE, { rechazarReprogramacion })
    await esperarDetalle()

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar la propuesta' }))
    expect(screen.getByRole('dialog', { name: 'Rechazar la propuesta' })).toHaveAccessibleDescription(/CANCELA el radicado/)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar y cancelar la solicitud' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Reprogramación rechazada')
    expect(rechazarReprogramacion).toHaveBeenCalledExactlyOnceWith('EC-2026-0142')
  })
})
