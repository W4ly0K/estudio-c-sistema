import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import { ProveedorApi } from './api/ProveedorApi'
import { TEXTO_SIN_CONEXION } from './api/errores'
import { TEXTO_AVISO_URGENCIA, TEXTO_EXITO_TITULO } from './componentes/ExitoRadicado'
import { TEXTO_LUGAR_DE_SERVICIOS } from './componentes/CampoSubEspacio'
import type { SubEspacio } from './api/esquemas'
import type { ApiSolicitudes } from './api/solicitudes'
import { ETIQUETAS_SUB_ESPACIO } from './presentacion/etiquetas'
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

/**
 * Llena el formulario B2: martes 20 de octubre de 2026, de `inicio` a `fin`.
 * Fase 7 · SE10: un sub-espacio → solicitud de espacio físico en ese lugar; `null` → espacio
 * físico sin elegir (el navegador frena el envío); `'servicio'` → un Video, que no elige lugar.
 */
function llenarFormulario(
  contenedor: HTMLElement,
  inicio = '08:00',
  fin = '10:00',
  lugar: SubEspacio | null | 'servicio' = 'CABINA_AUDIO',
): void {
  // Consultas ACCESIBLES (DV6): si una etiqueta no está asociada a su campo, la prueba falla.
  const formulario = within(contenedor)
  fireEvent.change(formulario.getByLabelText('Categoría'), { target: { value: lugar === 'servicio' ? 'VIDEO' : 'ESPACIOS' } })
  if (lugar !== null && lugar !== 'servicio') {
    const grupo = formulario.getByRole('group', { name: 'Sub-espacio' })
    fireEvent.click(within(grupo).getByLabelText(ETIQUETAS_SUB_ESPACIO[lugar]))
  }
  fireEvent.change(formulario.getByLabelText('Propósito de la reserva'), { target: { value: 'Grabación de clase' } })
  fireEvent.change(formulario.getByLabelText('Fecha'), { target: { value: '2026-10-20' } })
  fireEvent.change(formulario.getByLabelText('Hora de inicio'), { target: { value: inicio } })
  fireEvent.change(formulario.getByLabelText('Hora de finalización'), { target: { value: fin } })
}

describe('Dashboard con la api inyectada', () => {
  // Reloj fijo para TODO el archivo: el martes 20 de octubre de 2026, 05:00 en Bogotá
  // (10:00 Z). `llenarFormulario` elige ese día y el calendario B2 pone `min` = hoy en
  // Bogotá (F2c): con el reloj real, desde el 21 de octubre el `<input type="date">`
  // quedaba por debajo del mínimo, la validación nativa frenaba el submit y `crear` nunca
  // se llamaba. Solo se finge `Date`: los temporizadores reales siguen moviendo
  // `findBy…`/`waitFor` (con todos falsos, las esperas no avanzarían).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
      expect.objectContaining({ categoria: 'ESPACIOS', proposito: 'Grabación de clase', sub_espacio: 'CABINA_AUDIO' }),
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

  describe('sub-espacio en B2 (Fase 7 · PRD v2.2 §4.1 · Q-A4)', () => {
    const abrirFormulario = async () => {
      const crear = vi.fn<ApiSolicitudes['crear']>().mockResolvedValue({
        ok: true,
        datos: { ...SOLICITUD, radicado: 'EC-2026-0999', estado: 'Recibido', sub_espacio: 'ESTUDIO_COMPLETO' },
      })
      const resultado = mostrar(apiFalsa({ crear }))
      await screen.findByText('No tienes solicitudes registradas aún.')
      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
      return { crear, ...resultado }
    }

    it('ofrece las tres opciones con su nombre oficial y su explicación, sin ninguna elegida de antemano', async () => {
      await abrirFormulario()

      const grupo = screen.getByRole('group', { name: 'Sub-espacio' })
      const opciones = within(grupo).getAllByRole('radio')
      expect(opciones.map((o) => o.getAttribute('value'))).toEqual(['CABINA_AUDIO', 'ESTUDIO_GRABACION', 'ESTUDIO_COMPLETO'])
      for (const opcion of opciones) expect(opcion).not.toBeChecked()
      expect(within(grupo).getByLabelText('Estudio C completo')).toHaveAccessibleDescription(
        'Ocupa los dos sub-espacios: nadie más puede reservar en esa franja.',
      )
    })

    it('envía el sub-espacio elegido', async () => {
      const { crear, container } = await abrirFormulario()

      llenarFormulario(container, '08:00', '10:00', 'ESTUDIO_COMPLETO')
      fireEvent.click(screen.getByRole('button', { name: 'Enviar Radicado' }))

      await vi.waitFor(() => expect(crear).toHaveBeenCalledOnce())
      expect(crear.mock.calls[0]?.[0]).toMatchObject({ sub_espacio: 'ESTUDIO_COMPLETO' })
    })

    it('sin elegir el sub-espacio no se envía nada (campo obligatorio: el servidor no elige por el solicitante)', async () => {
      const { crear, container } = await abrirFormulario()

      llenarFormulario(container, '08:00', '10:00', null)
      fireEvent.click(screen.getByRole('button', { name: 'Enviar Radicado' }))

      expect(crear).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Enviar Radicado' })).toBeInTheDocument()
    })
  })

  describe('sub-espacio según la categoría (Fase 7 · 7B.4 · ADR-007 SE10)', () => {
    const abrir = async () => {
      const crear = vi.fn<ApiSolicitudes['crear']>().mockResolvedValue({
        ok: true,
        datos: { ...SOLICITUD, radicado: 'EC-2026-0999', estado: 'Recibido', sub_espacio: 'ESTUDIO_COMPLETO' },
      })
      const resultado = mostrar(apiFalsa({ crear }))
      await screen.findByText('No tienes solicitudes registradas aún.')
      fireEvent.click(screen.getByRole('button', { name: /Nueva Solicitud/ }))
      return { crear, ...resultado }
    }
    const categoria = () => screen.getByLabelText('Categoría')

    it('el grupo aparece solo en "Solicitud de espacio físico"; en un servicio se explica qué reserva el Estudio C', async () => {
      await abrir()

      expect(screen.getByRole('group', { name: 'Sub-espacio' })).toBeInTheDocument()
      expect(screen.queryByText(TEXTO_LUGAR_DE_SERVICIOS)).not.toBeInTheDocument()

      for (const servicio of ['PODCAST', 'VIDEO', 'STREAMING', 'ASESORIAS']) {
        fireEvent.change(categoria(), { target: { value: servicio } })
        expect(screen.queryByRole('group', { name: 'Sub-espacio' })).not.toBeInTheDocument()
        // La explicación describe la categoría elegida (también para el lector de pantalla).
        expect(categoria()).toHaveAccessibleDescription(TEXTO_LUGAR_DE_SERVICIOS)
      }
    })

    it('un servicio se envía SIN sub-espacio (lo asigna el Estudio C)', async () => {
      const { crear, container } = await abrir()

      llenarFormulario(container, '08:00', '10:00', 'servicio')
      fireEvent.click(screen.getByRole('button', { name: 'Enviar Radicado' }))

      await vi.waitFor(() => expect(crear).toHaveBeenCalledOnce())
      expect(crear.mock.calls[0]?.[0]).toEqual({
        categoria: 'VIDEO',
        proposito: 'Grabación de clase',
        fecha_inicio: '2026-10-20T08:00:00-05:00',
        fecha_fin: '2026-10-20T10:00:00-05:00',
      })
    })

    it('al salir de "espacio físico" la elección se borra: no viaja oculta y volver pide elegir de nuevo', async () => {
      const { crear, container } = await abrir()
      const grupo = () => screen.getByRole('group', { name: 'Sub-espacio' })

      fireEvent.click(within(grupo()).getByLabelText(ETIQUETAS_SUB_ESPACIO.ESTUDIO_GRABACION))
      fireEvent.change(categoria(), { target: { value: 'PODCAST' } })
      fireEvent.change(categoria(), { target: { value: 'ESPACIOS' } })

      for (const opcion of within(grupo()).getAllByRole('radio')) expect(opcion).not.toBeChecked()

      // Y un servicio enviado después de haber elegido un lugar tampoco lo lleva.
      fireEvent.click(within(grupo()).getByLabelText(ETIQUETAS_SUB_ESPACIO.CABINA_AUDIO))
      llenarFormulario(container, '08:00', '10:00', 'servicio')
      fireEvent.click(screen.getByRole('button', { name: 'Enviar Radicado' }))
      await vi.waitFor(() => expect(crear).toHaveBeenCalledOnce())
      expect(crear.mock.calls[0]?.[0]).not.toHaveProperty('sub_espacio')
    })
  })

  describe('fechas en la hora de Bogotá (Fase 6.3 · F2 y F3)', () => {
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
      expect(document.querySelector('[data-estado="Validado"]')).toHaveTextContent('Confirmado')
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
