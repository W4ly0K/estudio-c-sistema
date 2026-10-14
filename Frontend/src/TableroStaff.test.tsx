import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import TableroStaff, { TEXTO_CARGANDO_TABLERO, TEXTO_COLUMNA_PENDIENTE, TEXTO_COLUMNA_VACIA } from './TableroStaff'
import { ProveedorApi } from './api/ProveedorApi'
import type { Resultado } from './api/cliente'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type { SolicitudTablero } from './api/esquemas'
import type { ApiSolicitudes } from './api/solicitudes'
import { formatearFranja } from './fechas/bogota'
import { textoUrgentes } from './presentacion/tablero'
import { SOLICITUD_TABLERO, apiFalsa } from './test/fixtures-api'

const STAFF = { id: 'uuid-staff', nombre: 'Staff Estudio C', rol: 'STAFF' } as const

const solicitud = (cambios: Partial<SolicitudTablero>): SolicitudTablero => ({ ...SOLICITUD_TABLERO, ...cambios })

const responde = (...solicitudes: SolicitudTablero[]) =>
  vi.fn<ApiSolicitudes['tablero']>().mockResolvedValue({ ok: true, datos: solicitudes })

function mostrar(tablero: ApiSolicitudes['tablero']) {
  render(
    <MemoryRouter>
      <ProveedorApi api={apiFalsa({ tablero })}>
        <TableroStaff usuario={STAFF} onLogout={() => undefined} />
      </ProveedorApi>
    </MemoryRouter>,
  )
}

/** Radicados de una región, en el orden en que se pintan. */
const radicadosEn = (region: HTMLElement) =>
  within(region)
    .getAllByRole('heading', { level: 4, hidden: true })
    .map((h) => h.textContent)

/** Una promesa que la prueba resuelve cuando quiere (para ver el estado intermedio). */
function diferida<T>() {
  let resolver: (valor: T) => void = () => undefined
  const promesa = new Promise<T>((r) => {
    resolver = r
  })
  return { promesa, resolver: (valor: T) => resolver(valor) }
}

describe('TableroStaff (6.5.1)', () => {
  it('un solo GET: cada solicitud en la columna de su estado, urgentes primero, y la columna vacía lo dice', async () => {
    const tablero = responde(
      solicitud({ radicado: 'EC-1', estado: 'Recibido', fecha_inicio: '2026-10-20T14:00:00.000Z' }),
      solicitud({ radicado: 'EC-2', estado: 'Recibido', fecha_inicio: '2026-10-22T14:00:00.000Z', es_urgencia: true }),
      solicitud({ radicado: 'EC-3', estado: 'Validado' }),
    )
    mostrar(tablero)

    const recibido = await screen.findByRole('region', { name: 'Recibido' })
    expect(tablero).toHaveBeenCalledTimes(1)
    expect(tablero).toHaveBeenCalledWith()
    expect(radicadosEn(recibido)).toEqual(['EC-2', 'EC-1'])
    expect(within(recibido).getByText('2 solicitudes')).toBeInTheDocument()
    expect(radicadosEn(screen.getByRole('region', { name: 'Validado' }))).toEqual(['EC-3'])
    expect(within(screen.getByRole('region', { name: 'En Producción' })).getByText(TEXTO_COLUMNA_VACIA)).toBeInTheDocument()
  })

  it('Pendiente de Reprogramación: dice que espera al solicitante y muestra la franja propuesta', async () => {
    const pendiente = solicitud({
      radicado: 'EC-7',
      estado: 'Pendiente de Reprogramación',
      fecha_propuesta_inicio: '2026-10-28T19:00:00.000Z',
      fecha_propuesta_fin: '2026-10-28T20:00:00.000Z',
    })
    mostrar(responde(pendiente))

    const columna = await screen.findByRole('region', { name: 'Pendiente de Reprogramación' })
    expect(within(columna).getByText(TEXTO_COLUMNA_PENDIENTE)).toBeInTheDocument()
    expect(within(columna).getByText(formatearFranja('2026-10-28T19:00:00.000Z', '2026-10-28T20:00:00.000Z'))).toBeInTheDocument()
  })

  it('las cerradas van plegadas en <details>, con su total y la insignia de estado', async () => {
    mostrar(
      responde(
        solicitud({ radicado: 'EC-8', estado: 'Rechazado' }),
        solicitud({ radicado: 'EC-9', estado: 'Entregado' }),
        solicitud({ radicado: 'EC-1', estado: 'Recibido' }),
      ),
    )

    const resumen = await screen.findByText('Solicitudes cerradas (2)')
    const detalles = resumen.closest('details')
    if (detalles === null) throw new Error('Las cerradas deben vivir en un <details>')
    expect(detalles).not.toHaveAttribute('open')
    expect(radicadosEn(detalles)).toEqual(['EC-9', 'EC-8'])
    expect(detalles.querySelector('[data-estado="Rechazado"]')).not.toBeNull()
    // En las activas la columna ya dice el estado: sin insignia repetida.
    expect(screen.getByRole('region', { name: 'Recibido' }).querySelector('[data-estado]')).toBeNull()
  })

  it('DT2: avisa de las urgentes que esperan revisión en Recibido', async () => {
    mostrar(responde(solicitud({ radicado: 'EC-1', estado: 'Recibido', es_urgencia: true })))

    expect(await screen.findByText(textoUrgentes(1) ?? '')).toBeInTheDocument()
  })

  it('DT2: sin urgentes en Recibido no hay aviso (una urgente ya validada no cuenta)', async () => {
    mostrar(responde(solicitud({ radicado: 'EC-1', estado: 'Validado', es_urgencia: true })))

    await screen.findByRole('region', { name: 'Validado' })
    expect(screen.queryByText(/esperan? revisión/)).not.toBeInTheDocument()
  })

  it('DT3: cada tarjeta lleva a su detalle con un nombre accesible único', async () => {
    mostrar(responde(solicitud({ radicado: 'EC-2026-0142' }), solicitud({ radicado: 'EC-2026-0143' })))

    const enlace = await screen.findByRole('link', { name: 'Abrir detalle de EC-2026-0142' })
    expect(enlace).toHaveAttribute('href', '/solicitudes/EC-2026-0142')
    expect(screen.getByRole('link', { name: 'Abrir detalle de EC-2026-0143' })).toBeInTheDocument()
  })

  it('DE5: "Actualizar" vuelve a pedir, conserva el tablero mientras viaja y anuncia el resultado', async () => {
    const segunda = diferida<Resultado<SolicitudTablero[]>>()
    const tablero = vi
      .fn<ApiSolicitudes['tablero']>()
      .mockResolvedValueOnce({ ok: true, datos: [solicitud({ radicado: 'EC-1' })] })
      .mockReturnValueOnce(segunda.promesa)
    mostrar(tablero)

    expect(screen.getByText(TEXTO_CARGANDO_TABLERO)).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar' }))

    // Mientras viaja: botón bloqueado y el tablero anterior sigue a la vista (sin parpadeo).
    expect(screen.getByRole('button', { name: 'Actualizando…' })).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'EC-1' })).toBeInTheDocument()
    expect(screen.queryByText(TEXTO_CARGANDO_TABLERO)).not.toBeInTheDocument()

    await act(async () => {
      segunda.resolver({ ok: true, datos: [solicitud({ radicado: 'EC-1' }), solicitud({ radicado: 'EC-2' })] })
    })

    expect(tablero).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('Tablero actualizado (2 en total).')
    expect(screen.getByRole('heading', { name: 'EC-2' })).toBeInTheDocument()
  })

  it('sin conexión: lo dice (no finge un tablero vacío) y permite reintentar', async () => {
    mostrar(vi.fn<ApiSolicitudes['tablero']>().mockResolvedValue({ ok: false, error: { tipo: 'red' } }))

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTO_SIN_CONEXION)
    expect(screen.queryByText(TEXTO_COLUMNA_VACIA)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeEnabled()
  })
})
