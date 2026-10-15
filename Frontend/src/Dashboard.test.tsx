import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import { ProveedorApi } from './api/ProveedorApi'
import { TEXTO_SIN_CONEXION } from './api/errores'
import { TEXTO_AVISO_URGENCIA, TEXTO_EXITO_TITULO } from './componentes/ExitoRadicado'
import type { ApiSolicitudes } from './api/solicitudes'
import { RECURSOS_RESUMEN, SOLICITUD, apiFalsa } from './test/fixtures-api'

const USUARIO = { id: 'uuid', nombre: 'Ana Pérez', rol: 'SOLICITANTE' } as const
const PROPIA = { ...SOLICITUD, recursos: RECURSOS_RESUMEN }

/** El panel con la api falsa en el proveedor (DV1): igual que en la App. */
const mostrar = (api: ApiSolicitudes) =>
  render(
    <MemoryRouter>
      <ProveedorApi api={api}>
        <Dashboard usuario={USUARIO} onLogout={() => undefined} />
      </ProveedorApi>
    </MemoryRouter>,
  )

/** Llena el formulario B2: martes 20 de octubre de 2026, de `inicio` a `fin`. */
function llenarFormulario(contenedor: HTMLElement, inicio = '08:00', fin = '10:00'): void {
  // Consultas ACCESIBLES (DV6): si una etiqueta no está asociada a su campo, la prueba falla.
  const formulario = within(contenedor)
  fireEvent.change(formulario.getByLabelText('Categoría'), { target: { value: 'VIDEO' } })
  fireEvent.change(formulario.getByLabelText('Propósito de la reserva'), { target: { value: 'Grabación de clase' } })
  fireEvent.change(formulario.getByLabelText('Fecha'), { target: { value: '2026-10-20' } })
  fireEvent.change(formulario.getByLabelText('Hora de inicio'), { target: { value: inicio } })
  fireEvent.change(formulario.getByLabelText('Hora de finalización'), { target: { value: fin } })
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

  it('crear: envía el cuerpo tipado, muestra el radicado (B1b) y agrega la solicitud al inicio', async () => {
    const crear = vi.fn<ApiSolicitudes['crear']>().mockResolvedValue({
      ok: true,
      datos: { ...SOLICITUD, radicado: 'EC-2026-0999', estado: 'Recibido' },
    })
    const { container } = mostrar(apiFalsa({ crear }))
    await screen.findByText('No tienes solicitudes registradas aún.')

    fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
    llenarFormulario(container)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Radicado' }))

    // B1b: el mismo diálogo cambia de contenido (y de nombre accesible) al radicado.
    const exito = await screen.findByRole('dialog', { name: TEXTO_EXITO_TITULO })
    expect(within(exito).getByText('EC-2026-0999')).toBeInTheDocument()
    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 'VIDEO', proposito: 'Grabación de clase' }),
    )
    expect(screen.queryByRole('button', { name: 'Enviar Radicado' })).not.toBeInTheDocument()

    fireEvent.click(within(exito).getByRole('button', { name: 'Volver al panel' }))

    expect(exito).not.toHaveAttribute('open')
    expect(screen.queryByText(TEXTO_EXITO_TITULO)).not.toBeInTheDocument()
    const articulos = screen.getAllByRole('article')
    expect(articulos[0]).toHaveAccessibleName('EC-2026-0999')
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

      expect(within(container).getByLabelText('Fecha')).toHaveAttribute('min', '2026-10-20')
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

  describe('panel y confirmación (Fase 6.4.2 · B1 y B1b)', () => {
    it('crear con urgencia marcada por el servidor: la confirmación pide avisar al Staff', async () => {
      const crear = vi.fn<ApiSolicitudes['crear']>().mockResolvedValue({
        ok: true,
        datos: { ...SOLICITUD, radicado: 'EC-2026-0999', estado: 'Recibido', es_urgencia: true },
      })
      const { container } = mostrar(apiFalsa({ crear }))
      await screen.findByText('No tienes solicitudes registradas aún.')

      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
      llenarFormulario(container)
      fireEvent.click(screen.getByRole('button', { name: 'Enviar Radicado' }))

      const exito = await screen.findByRole('dialog', { name: TEXTO_EXITO_TITULO })
      expect(within(exito).getByText(TEXTO_AVISO_URGENCIA, { exact: false })).toBeInTheDocument()
    })

    it('resume las solicitudes y avisa cuando una espera respuesta a una reprogramación', async () => {
      const pendiente = {
        ...PROPIA,
        radicado: 'EC-2026-0098',
        estado: 'Pendiente de Reprogramación',
        fecha_propuesta_inicio: '2026-10-21T19:00:00.000Z',
        fecha_propuesta_fin: '2026-10-21T21:00:00.000Z',
      } as const
      const entregada = { ...PROPIA, radicado: 'EC-2026-0034', estado: 'Entregado' } as const
      mostrar(
        apiFalsa({
          misSolicitudes: vi
            .fn<ApiSolicitudes['misSolicitudes']>()
            .mockResolvedValue({ ok: true, datos: [PROPIA, pendiente, entregada] }),
        }),
      )

      expect(await screen.findByText('Tienes 2 solicitudes activas y 1 cerrada.')).toBeInTheDocument()
      expect(screen.getByText('1 solicitud espera tu respuesta a una propuesta de reprogramación.')).toBeInTheDocument()
      expect(screen.getAllByRole('article')).toHaveLength(3)
    })

    it('sin nada por decidir, no hay aviso', async () => {
      mostrar(
        apiFalsa({
          misSolicitudes: vi.fn<ApiSolicitudes['misSolicitudes']>().mockResolvedValue({ ok: true, datos: [PROPIA] }),
        }),
      )

      expect(await screen.findByText('Tienes 1 solicitud activa y 0 cerradas.')).toBeInTheDocument()
      expect(screen.queryByText(/espera tu respuesta/)).not.toBeInTheDocument()
    })
  })

  describe('bases de la vista (Fase 6.4.1)', () => {
    it('muestra la categoría con su nombre legible y la insignia del estado', async () => {
      mostrar(
        apiFalsa({
          misSolicitudes: vi.fn<ApiSolicitudes['misSolicitudes']>().mockResolvedValue({ ok: true, datos: [PROPIA] }),
        }),
      )

      expect(await screen.findByText('Podcast / Vodcast')).toBeInTheDocument()
      expect(document.querySelector('[data-estado="Validado"]')).toHaveTextContent('Validado')
    })

    it('el formulario es un diálogo con nombre accesible', async () => {
      mostrar(apiFalsa())
      await screen.findByText('No tienes solicitudes registradas aún.')

      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))

      expect(screen.getByRole('dialog', { name: 'Nueva Solicitud · Estudio C' })).toBeInTheDocument()
    })

    it('el evento close del diálogo (Escape en el navegador) oculta el formulario', async () => {
      mostrar(apiFalsa())
      await screen.findByText('No tienes solicitudes registradas aún.')
      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
      const dialogo = screen.getByRole('dialog', { name: 'Nueva Solicitud · Estudio C' })
      expect(dialogo).toHaveAttribute('open')

      // Cierre que NO pasa por el botón Cancelar: lo origina el propio <dialog>.
      fireEvent(dialogo, new Event('close'))

      expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()
      expect(dialogo).not.toHaveAttribute('open')
    })

    it('Cancelar cierra el diálogo y permite abrirlo de nuevo', async () => {
      mostrar(apiFalsa())
      await screen.findByText('No tienes solicitudes registradas aún.')
      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()

      // Si el estado y el <dialog> se desincronizaran, showModal() lanzaría InvalidStateError.
      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
      expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    })
  })
})
