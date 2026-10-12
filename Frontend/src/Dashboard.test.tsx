import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

/** Llena el formulario B2: martes 20 de octubre de 2026, de `inicio` a `fin`. */
function llenarFormulario(contenedor: HTMLElement, inicio = '08:00', fin = '10:00'): void {
  const campo = <T extends Element>(selector: string, indice = 0): T => {
    const elemento = contenedor.querySelectorAll<T>(selector)[indice]
    if (elemento === undefined) throw new Error(`No se encontró ${selector}`)
    return elemento
  }
  fireEvent.change(campo('select'), { target: { value: 'VIDEO' } })
  fireEvent.change(campo('textarea'), { target: { value: 'Grabación de clase' } })
  fireEvent.change(campo('input[type="date"]'), { target: { value: '2026-10-20' } })
  fireEvent.change(campo('input[type="time"]', 0), { target: { value: inicio } })
  fireEvent.change(campo('input[type="time"]', 1), { target: { value: fin } })
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

  describe('fechas en la hora de Bogotá (Fase 6.3 · F2 y F3)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    /** Abre el formulario, lo llena y lo envía; devuelve el cuerpo que recibió `crear`. */
    async function enviar(inicio: string, fin: string) {
      const crear = vi.fn<ApiSolicitudes['crear']>().mockResolvedValue({
        ok: true,
        datos: { ...SOLICITUD, radicado: 'EC-2026-0999', estado: 'Recibido' },
      })
      const { container } = mostrar(apiFalsa({ crear }))
      await screen.findByText('No tienes solicitudes registradas aún.')
      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
      llenarFormulario(container, inicio, fin)
      fireEvent.click(screen.getByRole('button', { name: 'Enviar Radicado' }))
      return { crear, container }
    }

    it('F2a · envía la franja elegida en hora de Bogotá, sin importar la zona del equipo', async () => {
      const { crear } = await enviar('08:00', '10:00')

      await vi.waitFor(() => expect(crear).toHaveBeenCalledOnce())
      const cuerpo = crear.mock.calls[0]?.[0]
      // 08:00 y 10:00 de Bogotá son las 13:00 y las 15:00 en UTC, desde cualquier zona.
      expect(new Date(cuerpo?.fecha_inicio ?? '').toISOString()).toBe('2026-10-20T13:00:00.000Z')
      expect(new Date(cuerpo?.fecha_fin ?? '').toISOString()).toBe('2026-10-20T15:00:00.000Z')
      // Y el texto enviado lleva el desfase de Bogotá explícito (DH1): el backend no adivina nada.
      expect(cuerpo).toMatchObject({ fecha_inicio: '2026-10-20T08:00:00-05:00', fecha_fin: '2026-10-20T10:00:00-05:00' })
    })

    it('F2b · muestra la franja de cada solicitud en hora de Bogotá y en 24 horas', async () => {
      // 14:00Z a 16:00Z del jueves 15 de octubre = 09:00 a 11:00 en Bogotá.
      mostrar(
        apiFalsa({
          misSolicitudes: vi.fn<ApiSolicitudes['misSolicitudes']>().mockResolvedValue({ ok: true, datos: [PROPIA] }),
        }),
      )

      expect(await screen.findByText(/jueves, 15 de octubre de 2026/)).toBeInTheDocument()
      expect(screen.getByText(/09:00 – 11:00/)).toBeInTheDocument()
    })

    it('F2c · a las 19:30 de Bogotá, el calendario todavía permite elegir HOY', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-20T19:30:00-05:00')) // en UTC ya es el 21
      const { container } = mostrar(apiFalsa())
      await screen.findByText('No tienes solicitudes registradas aún.')

      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))

      expect(container.querySelector('input[type="date"]')).toHaveAttribute('min', '2026-10-20')
    })

    it('F3 · fin anterior al inicio: el aviso local usa el mismo texto que el backend (CA-04) y no envía nada', async () => {
      const { crear } = await enviar('10:00', '09:00')

      expect(
        await screen.findByText('Error CA-04: La hora de finalización debe ser posterior a la hora de inicio.'),
      ).toBeInTheDocument()
      expect(crear).not.toHaveBeenCalled()
    })

    it('F3 · una franja que cruza el mediodía ya no se bloquea en el cliente: decide el servidor', async () => {
      const { crear } = await enviar('11:00', '15:00')

      await vi.waitFor(() => expect(crear).toHaveBeenCalledOnce())
    })

    it('F3 · el formulario informa los bloques de atención, en hora de Colombia', async () => {
      mostrar(apiFalsa())
      await screen.findByText('No tienes solicitudes registradas aún.')

      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))

      expect(screen.getByText(/lunes a viernes hábiles, de 8:00 a 12:00 y de 14:00 a 18:00 \(hora de Colombia\)/)).toBeInTheDocument()
    })
  })
})
