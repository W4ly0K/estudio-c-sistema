import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type { ApiSolicitudes } from './api/solicitudes'
import { RECURSOS_RESUMEN, SOLICITUD } from './test/fixtures-api'

const USUARIO = { id: 'uuid', nombre: 'Ana Pérez', rol: 'SOLICITANTE' } as const
const PROPIA = { ...SOLICITUD, recursos: RECURSOS_RESUMEN }

/** API falsa inyectada (DC3): cada prueba define solo lo que usa. */
function apiFalsa(cambios: Partial<ApiSolicitudes> = {}): ApiSolicitudes {
  return {
    misSolicitudes: vi.fn<ApiSolicitudes['misSolicitudes']>().mockResolvedValue({ ok: true, datos: [] }),
    tablero: vi.fn<ApiSolicitudes['tablero']>(),
    detalleSolicitante: vi.fn<ApiSolicitudes['detalleSolicitante']>(),
    detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>(),
    crear: vi.fn<ApiSolicitudes['crear']>(),
    actualizarTablero: vi.fn<ApiSolicitudes['actualizarTablero']>(),
    proponerReprogramacion: vi.fn<ApiSolicitudes['proponerReprogramacion']>(),
    cancelar: vi.fn<ApiSolicitudes['cancelar']>(),
    aceptarReprogramacion: vi.fn<ApiSolicitudes['aceptarReprogramacion']>(),
    rechazarReprogramacion: vi.fn<ApiSolicitudes['rechazarReprogramacion']>(),
    ...cambios,
  }
}

const mostrar = (api: ApiSolicitudes) => render(<Dashboard usuario={USUARIO} onLogout={() => undefined} api={api} />)

/** Llena el formulario B2 con una franja que pasa la validación local actual. */
function llenarFormulario(contenedor: HTMLElement): void {
  const campo = <T extends Element>(selector: string, indice = 0): T => {
    const elemento = contenedor.querySelectorAll<T>(selector)[indice]
    if (elemento === undefined) throw new Error(`No se encontró ${selector}`)
    return elemento
  }
  fireEvent.change(campo('select'), { target: { value: 'VIDEO' } })
  fireEvent.change(campo('textarea'), { target: { value: 'Grabación de clase' } })
  fireEvent.change(campo('input[type="date"]'), { target: { value: '2026-10-20' } })
  fireEvent.change(campo('input[type="time"]', 0), { target: { value: '08:00' } })
  fireEvent.change(campo('input[type="time"]', 1), { target: { value: '10:00' } })
}

describe('Dashboard con la api inyectada', () => {
  it('muestra las solicitudes que entrega la api', async () => {
    const api = apiFalsa({
      misSolicitudes: vi.fn<ApiSolicitudes['misSolicitudes']>().mockResolvedValue({ ok: true, datos: [PROPIA] }),
    })
    mostrar(api)

    expect(await screen.findByText(SOLICITUD.radicado)).toBeInTheDocument()
    expect(api.misSolicitudes).toHaveBeenCalledOnce()
  })

  it('lista vacía: lo dice', async () => {
    mostrar(apiFalsa())

    expect(await screen.findByText('No tienes solicitudes registradas aún.')).toBeInTheDocument()
  })

  it('error al cargar: lo dice, en lugar de fingir una lista vacía', async () => {
    mostrar(
      apiFalsa({
        misSolicitudes: vi.fn<ApiSolicitudes['misSolicitudes']>().mockResolvedValue({ ok: false, error: { tipo: 'red' } }),
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTO_SIN_CONEXION)
    expect(screen.queryByText('No tienes solicitudes registradas aún.')).not.toBeInTheDocument()
  })

  it('crear: envía el cuerpo tipado y agrega la solicitud nueva al inicio', async () => {
    const crear = vi.fn<ApiSolicitudes['crear']>().mockResolvedValue({
      ok: true,
      datos: { ...SOLICITUD, radicado: 'EC-2026-0999', estado: 'Recibido' },
    })
    const { container } = mostrar(apiFalsa({ crear }))
    await screen.findByText('No tienes solicitudes registradas aún.')

    fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
    llenarFormulario(container)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Radicado' }))

    expect(await screen.findByText('EC-2026-0999')).toBeInTheDocument()
    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 'VIDEO', proposito: 'Grabación de clase' }),
    )
    expect(screen.queryByRole('button', { name: 'Enviar Radicado' })).not.toBeInTheDocument()
  })

  it('crear rechazado por el servidor: muestra su mensaje tal cual y deja el formulario abierto', async () => {
    const mensaje = 'Error CA-06: el horario seleccionado se cruza con otra reserva. Elige otra franja.'
    const crear = vi.fn<ApiSolicitudes['crear']>().mockResolvedValue({
      ok: false,
      error: { tipo: 'http', status: 409, mensajes: [mensaje], requiereRecarga: false },
    })
    const { container } = mostrar(apiFalsa({ crear }))
    await screen.findByText('No tienes solicitudes registradas aún.')

    fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
    llenarFormulario(container)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Radicado' }))

    expect(await screen.findByText(mensaje)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar Radicado' })).toBeInTheDocument()
  })
})
