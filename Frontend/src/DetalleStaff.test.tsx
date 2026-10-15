import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { TEXTO_NO_ENCONTRADA } from './DetalleSolicitud'
import DetalleStaff, {
  TEXTO_NO_ENCONTRADA_AYUDA_STAFF,
  TEXTO_PROPUESTA_EN_ESPERA_STAFF,
  TEXTO_SIN_RECURSOS,
  TEXTO_SUPERA_INVENTARIO,
} from './DetalleStaff'
import { ProveedorApi } from './api/ProveedorApi'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type { DetalleStaff as DatosDetalleStaff } from './api/esquemas'
import type { ApiSolicitudes } from './api/solicitudes'
import { formatearFranja } from './fechas/bogota'
import { RUTA_DETALLE, RUTA_PANEL } from './rutas'
import { DETALLE_STAFF, LOG, apiFalsa } from './test/fixtures-api'

const STAFF = { id: 'uuid-staff', nombre: 'Staff Estudio C', rol: 'STAFF' } as const

/** El fixture con el rol del solicitante tipado como el esquema lo exige. */
const BASE: DatosDetalleStaff = { ...DETALLE_STAFF, usuario: { ...DETALLE_STAFF.usuario, rol: 'SOLICITANTE' } }
const detalle = (cambios: Partial<DatosDetalleStaff>): DatosDetalleStaff => ({ ...BASE, ...cambios })

const responde = (datos: DatosDetalleStaff) =>
  vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue({ ok: true, datos })

function mostrar(detalleStaff: ApiSolicitudes['detalleStaff'], ruta = '/solicitudes/EC-2026-0142') {
  const api = apiFalsa({ detalleStaff })
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorApi api={api}>
        <Routes>
          <Route path={RUTA_PANEL} element={<p>Tablero</p>} />
          <Route path={RUTA_DETALLE} element={<DetalleStaff usuario={STAFF} onLogout={() => undefined} />} />
        </Routes>
      </ProveedorApi>
    </MemoryRouter>,
  )
  return api
}

const log = (desde: DatosDetalleStaff['estado'], hacia: DatosDetalleStaff['estado'], dia: number) => ({
  ...LOG,
  id_log: `log-${dia}`,
  modificado_por: 'uuid-x',
  estado_anterior: desde,
  estado_nuevo: hacia,
  fecha_modificacion: `2026-10-${dia}T15:00:00.000Z`,
})

describe('DetalleStaff (C3 · 6.5.2)', () => {
  it('pide la proyección del Staff (nunca la del solicitante) y lleva el foco al radicado', async () => {
    const detalleStaff = responde(BASE)
    const api = mostrar(detalleStaff)

    const titulo = await screen.findByRole('heading', { name: 'EC-2026-0142' })
    expect(detalleStaff).toHaveBeenCalledWith('EC-2026-0142')
    expect(api.detalleSolicitante).not.toHaveBeenCalled()
    expect(titulo).toHaveFocus()
  })

  it('ficha: el solicitante con su correo como mailto (DD5), la franja y el propósito', async () => {
    mostrar(responde(BASE))

    const correo = await screen.findByRole('link', { name: 'ana@unicesmag.edu.co' })
    expect(correo).toHaveAttribute('href', 'mailto:ana@unicesmag.edu.co')
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText(formatearFranja(BASE.fecha_inicio, BASE.fecha_fin))).toBeInTheDocument()
    expect(screen.getByText(BASE.proposito)).toBeInTheDocument()
  })

  it('DD3: solo la fila que supera el inventario total lo dice; pedir el total exacto no alerta', async () => {
    mostrar(
      responde(
        detalle({
          recursos: [
            { id_detalle: 'd1', cantidad_solicitada: 6, recurso: { id_recurso: 1, nombre: 'Micrófono de solapa', cantidad_total: 6 } },
            { id_detalle: 'd2', cantidad_solicitada: 3, recurso: { id_recurso: 2, nombre: 'Cámara 4K', cantidad_total: 2 } },
          ],
        }),
      ),
    )

    const camara = await screen.findByRole('row', { name: /Cámara 4K/ })
    expect(within(camara).getByText(TEXTO_SUPERA_INVENTARIO)).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Micrófono de solapa/ })).queryByText(TEXTO_SUPERA_INVENTARIO)).toBeNull()
    expect(screen.getAllByText(TEXTO_SUPERA_INVENTARIO)).toHaveLength(1)
  })

  it('sin recursos lo dice, sin tabla vacía', async () => {
    mostrar(responde(detalle({ recursos: [] })))

    expect(await screen.findByText(TEXTO_SIN_RECURSOS)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('pendiente: la propuesta enviada, su motivo con la etiqueta del Staff y que espera al solicitante', async () => {
    mostrar(
      responde(
        detalle({
          estado: 'Pendiente de Reprogramación',
          fecha_propuesta_inicio: '2026-10-28T19:00:00.000Z',
          fecha_propuesta_fin: '2026-10-28T20:00:00.000Z',
          logs: [
            log('Recibido', 'Validado', 12),
            { ...log('Validado', 'Pendiente de Reprogramación', 13), motivo_reprogramacion: 'Mantenimiento del set.' },
          ],
        }),
      ),
    )

    const propuesta = await screen.findByRole('region', { name: 'Propuesta de reprogramación' })
    expect(within(propuesta).getByText(TEXTO_PROPUESTA_EN_ESPERA_STAFF)).toBeInTheDocument()
    expect(within(propuesta).getByText('Motivo de la reprogramación:')).toBeInTheDocument()
    expect(
      within(propuesta).getByText(formatearFranja('2026-10-28T19:00:00.000Z', '2026-10-28T20:00:00.000Z')),
    ).toBeInTheDocument()
  })

  it('historial desde la perspectiva del Staff: "Staff" y "Solicitante", nunca "Tú" (DD2)', async () => {
    mostrar(
      responde(
        detalle({
          estado: 'Cancelado por el Usuario',
          logs: [log('Recibido', 'Validado', 12), log('Validado', 'Cancelado por el Usuario', 13)],
        }),
      ),
    )

    const historial = await screen.findByRole('region', { name: 'Historial de cambios' })
    expect(within(historial).getByText('Por: Staff')).toBeInTheDocument()
    expect(within(historial).getByText('Por: Solicitante')).toBeInTheDocument()
    // Sin \b: en JavaScript la ú no es carácter de palabra y \b nunca coincidiría tras ella.
    expect(screen.queryByText(/Tú/)).not.toBeInTheDocument()
  })

  it('404 uniforme: el mismo texto que ve el solicitante, con ayuda que remite al tablero', async () => {
    mostrar(
      vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue({
        ok: false,
        error: { tipo: 'http', status: 404, mensajes: ['Solicitud no encontrada.'], requiereRecarga: false },
      }),
    )

    const titulo = await screen.findByRole('heading', { name: TEXTO_NO_ENCONTRADA })
    expect(titulo).toHaveFocus()
    expect(screen.getByText(TEXTO_NO_ENCONTRADA_AYUDA_STAFF)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Volver al tablero/ })).toHaveAttribute('href', RUTA_PANEL)
  })

  it('sin conexión: lo dice, en lugar de fingir que no existe', async () => {
    mostrar(vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue({ ok: false, error: { tipo: 'red' } }))

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTO_SIN_CONEXION)
    expect(screen.queryByText(TEXTO_NO_ENCONTRADA)).not.toBeInTheDocument()
  })
})
