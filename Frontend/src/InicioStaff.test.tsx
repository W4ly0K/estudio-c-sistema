import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InicioStaff, { TEXTO_CARGANDO_INICIO, TEXTO_IR_AL_TABLERO, TEXTO_TITULO_INICIO_STAFF } from './InicioStaff'
import { ProveedorApi } from './api/ProveedorApi'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type { SolicitudTablero } from './api/esquemas'
import type { ApiSolicitudes } from './api/solicitudes'
import { RUTA_TABLERO } from './rutas'
import { SOLICITUD_TABLERO, apiFalsa } from './test/fixtures-api'

const STAFF = { id: 'uuid-staff', nombre: 'Staff Estudio C', rol: 'STAFF' } as const
const PASADO = '2026-10-19T14:00:00.000Z'
const FUTURO = '2026-10-28T14:00:00.000Z'

const solicitud = (cambios: Partial<SolicitudTablero>): SolicitudTablero => ({ ...SOLICITUD_TABLERO, ...cambios })

const responde = (...solicitudes: SolicitudTablero[]) =>
  vi.fn<ApiSolicitudes['tablero']>().mockResolvedValue({ ok: true, datos: solicitudes })

function mostrar(tablero: ApiSolicitudes['tablero']) {
  render(
    <MemoryRouter>
      <ProveedorApi api={apiFalsa({ tablero })}>
        <InicioStaff usuario={STAFF} onLogout={() => undefined} />
      </ProveedorApi>
    </MemoryRouter>,
  )
}

/** Los cuatro datos de prueba: 2 urgentes (1 vencida), 1 vencida más, 1 esperando, 3 en producción. */
const MEZCLA = [
  solicitud({ radicado: 'EC-1', estado: 'Recibido', es_urgencia: true, fecha_inicio: FUTURO }),
  solicitud({ radicado: 'EC-2', estado: 'Recibido', es_urgencia: true, fecha_inicio: PASADO }),
  solicitud({ radicado: 'EC-3', estado: 'Recibido', es_urgencia: false, fecha_inicio: PASADO }),
  solicitud({ radicado: 'EC-4', estado: 'Pendiente de Reprogramación', fecha_inicio: FUTURO }),
  solicitud({ radicado: 'EC-5', estado: 'En Producción', fecha_inicio: PASADO }),
  solicitud({ radicado: 'EC-6', estado: 'En Producción', fecha_inicio: PASADO }),
  solicitud({ radicado: 'EC-7', estado: 'En Producción', fecha_inicio: PASADO }),
  solicitud({ radicado: 'EC-8', estado: 'Entregado', es_urgencia: true, fecha_inicio: PASADO }),
]

describe('InicioStaff (Fase 7 · C4)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T15:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saluda, hace UN solo GET /solicitudes y muestra los cuatro atajos con sus números', async () => {
    const tablero = responde(...MEZCLA)
    mostrar(tablero)

    const atajos = await screen.findByRole('navigation', { name: 'Atajos del Staff' })
    expect(tablero).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Hola, Staff Estudio C' })).toBeInTheDocument()
    expect(screen.getByText(TEXTO_TITULO_INICIO_STAFF)).toBeInTheDocument()
    expect(within(atajos).getAllByRole('link').map((l) => l.textContent)).toEqual([
      '⚠ 2 Urgentes por revisar',
      '⚠ 2 Recibidas con la franja vencida',
      '1 Esperan al solicitante',
      '3 En producción',
    ])
  })

  it('cada atajo lleva al tablero y su ayuda es la descripción accesible del enlace', async () => {
    mostrar(responde(...MEZCLA))

    const vencidas = await screen.findByRole('link', { name: /Recibidas con la franja vencida/ })
    expect(vencidas).toHaveAttribute('href', RUTA_TABLERO)
    expect(vencidas).toHaveAccessibleDescription(/recházalas con un motivo/)
    expect(screen.getByRole('link', { name: TEXTO_IR_AL_TABLERO })).toHaveAttribute('href', RUTA_TABLERO)
  })

  it('solo se resalta lo que pide acción del Staff y hay algo (por la forma, no solo el color)', async () => {
    mostrar(responde(solicitud({ estado: 'Recibido', es_urgencia: true, fecha_inicio: FUTURO })))

    const atajos = await screen.findByRole('navigation', { name: 'Atajos del Staff' })
    const tarjetas = within(atajos).getAllByRole('listitem').map((li) => li.firstElementChild)
    expect(tarjetas.map((t) => t?.getAttribute('data-atencion'))).toEqual(['true', 'false', 'false', 'false'])
    expect(tarjetas[0]).toHaveClass('border-2')
    expect(tarjetas[1]).not.toHaveClass('border-2')
  })

  it('sin solicitudes: los cuatro atajos en cero y ninguno resaltado', async () => {
    mostrar(responde())

    const atajos = await screen.findByRole('navigation', { name: 'Atajos del Staff' })
    expect(within(atajos).getAllByRole('link').map((l) => l.textContent?.trim().split(' ')[0])).toEqual(['0', '0', '0', '0'])
    expect(atajos.querySelectorAll('[data-atencion="true"]')).toHaveLength(0)
  })

  it('Q-C2 y Q-C3: no ofrece "Nueva solicitud" ni la Agenda', async () => {
    mostrar(responde(...MEZCLA))
    await screen.findByRole('navigation', { name: 'Atajos del Staff' })

    expect(screen.queryByRole('link', { name: /nueva solicitud/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /nueva solicitud/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/agenda|calendario/i)).not.toBeInTheDocument()
  })

  it('mientras carga lo dice; sin conexión lo dice (no finge ceros) y "Reintentar" vuelve a pedir', async () => {
    const tablero = vi
      .fn<ApiSolicitudes['tablero']>()
      .mockResolvedValueOnce({ ok: false, error: { tipo: 'red' } })
      .mockResolvedValueOnce({ ok: true, datos: MEZCLA })
    mostrar(tablero)

    expect(screen.getByText(TEXTO_CARGANDO_INICIO)).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTO_SIN_CONEXION)
    expect(screen.queryByRole('navigation', { name: 'Atajos del Staff' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('navigation', { name: 'Atajos del Staff' })).toBeInTheDocument()
    expect(tablero).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Fase 8 · requisito 6: el atajo de urgentes se pinta en rojo; el de vencidas sigue en el azul del Estudio', async () => {
    mostrar(responde(...MEZCLA))

    const atajos = await screen.findByRole('navigation', { name: 'Atajos del Staff' })
    const [urgentes, vencidas] = within(atajos).getAllByRole('listitem').map((li) => li.firstElementChild)
    expect(urgentes).toHaveAttribute('data-urgencia', 'true')
    expect(urgentes).toHaveClass('border-urgencia')
    expect(within(atajos).getByRole('link', { name: /Urgentes por revisar/ })).toHaveClass('text-urgencia')
    expect(vencidas).toHaveAttribute('data-urgencia', 'false')
    expect(vencidas).toHaveClass('border-primary')
    expect(within(atajos).getByRole('link', { name: /Recibidas con la franja vencida/ })).toHaveClass('text-primary')
  })
})
