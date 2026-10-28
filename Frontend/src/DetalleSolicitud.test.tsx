import { fireEvent, render, screen, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import DetalleSolicitud, { TEXTO_NO_ENCONTRADA } from './DetalleSolicitud'
import { ProveedorApi } from './api/ProveedorApi'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type { DetalleSolicitante } from './api/esquemas'
import type { ApiSolicitudes } from './api/solicitudes'
import { formatearFranja } from './fechas/bogota'
import { ETIQUETAS_SUB_ESPACIO } from './presentacion/etiquetas'
import { RUTA_DETALLE, RUTA_MIS_SOLICITUDES } from './rutas'
import { DETALLE_SOLICITANTE, LOG, apiFalsa } from './test/fixtures-api'

const USUARIO = { id: 'uuid', nombre: 'Ana Pérez', rol: 'SOLICITANTE' } as const

function mostrar(detalleSolicitante: ApiSolicitudes['detalleSolicitante'], ruta = '/solicitudes/EC-2026-0142') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      {/* Navegación de un detalle a otro sin desmontar la pantalla (misma ruta, otro parámetro). */}
      <Link to="/solicitudes/EC-2026-0200">Ir a otra solicitud</Link>
      <ProveedorApi api={apiFalsa({ detalleSolicitante })}>
        <Routes>
          <Route path={RUTA_MIS_SOLICITUDES} element={<p>Panel</p>} />
          <Route path={RUTA_DETALLE} element={<DetalleSolicitud usuario={USUARIO} onLogout={() => undefined} />} />
        </Routes>
      </ProveedorApi>
    </MemoryRouter>,
  )
}

const responde = (detalle: DetalleSolicitante) =>
  vi.fn<ApiSolicitudes['detalleSolicitante']>().mockResolvedValue({ ok: true, datos: detalle })

describe('DetalleSolicitud (B3)', () => {
  it('pide el radicado de la URL y lleva el foco a su título', async () => {
    const detalleSolicitante = responde(DETALLE_SOLICITANTE)
    mostrar(detalleSolicitante)

    const titulo = await screen.findByRole('heading', { name: 'EC-2026-0142' })
    expect(detalleSolicitante).toHaveBeenCalledWith('EC-2026-0142')
    expect(titulo).toHaveFocus()
    expect(screen.getByText('Podcast / Vodcast')).toBeInTheDocument()
  })

  it('el radicado de la URL llega decodificado a la api (que lo vuelve a codificar)', async () => {
    const detalleSolicitante = responde(DETALLE_SOLICITANTE)
    mostrar(detalleSolicitante, '/solicitudes/EC%2F1')

    await screen.findByRole('heading', { name: 'EC-2026-0142' })
    expect(detalleSolicitante).toHaveBeenCalledWith('EC/1')
  })

  it('línea de vida: Recibido completado, Validado en curso (aria-current) y el resto pendiente', async () => {
    mostrar(responde(DETALLE_SOLICITANTE))

    // Acotada a su región: desde la Fase 7 (C6) el encabezado también tiene <li> (la navegación),
    // y una búsqueda global de listitem resolvía con ellos antes de que llegara el detalle.
    const linea = await screen.findByRole('region', { name: 'Línea de vida' })
    const camino = within(linea)
      .getAllByRole('listitem')
      .filter((li) => li.hasAttribute('data-situacion'))
    expect(camino.map((li) => li.getAttribute('data-situacion'))).toEqual(['completado', 'actual', 'pendiente', 'pendiente', 'pendiente'])
    expect(camino[1]).toHaveAttribute('aria-current', 'step')
    expect(camino[1]).toHaveTextContent('en curso')
  })

  it('historial: el cambio del Staff con su hora en Bogotá, y la radicación sin hora', async () => {
    mostrar(responde(DETALLE_SOLICITANTE))

    const historial = await screen.findByRole('region', { name: 'Historial de cambios' })
    expect(within(historial).getByText('Solicitud radicada')).toBeInTheDocument()
    expect(within(historial).getByText('Recibido → Confirmado')).toBeInTheDocument()
    expect(within(historial).getByText('Por: Staff Estudio C')).toBeInTheDocument()
    expect(within(historial).getByText('sábado, 10 de octubre de 2026 · 10:20')).toBeInTheDocument()
  })

  it('pendiente de reprogramación: muestra la propuesta con el motivo del Staff (solo lectura)', async () => {
    mostrar(
      responde({
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
      }),
    )

    const propuesta = await screen.findByRole('region', { name: 'Propuesta de reprogramación' })
    expect(within(propuesta).getByText('Mantenimiento de la cabina de sonido.')).toBeInTheDocument()
    expect(within(propuesta).getByText('miércoles, 21 de octubre de 2026 · 14:00 – 16:00')).toBeInTheDocument()
    expect(within(propuesta).queryByRole('button')).not.toBeInTheDocument()
  })

  it('Fase 7 · B3: la ficha muestra el sub-espacio con su nombre oficial (Q-A1)', async () => {
    mostrar(responde(DETALLE_SOLICITANTE))

    await screen.findByRole('heading', { name: 'EC-2026-0142' })
    expect(screen.getByText('Sub-espacio')).toBeInTheDocument()
    expect(screen.getByText(ETIQUETAS_SUB_ESPACIO.CABINA_AUDIO)).toBeInTheDocument()
  })

  it('Fase 7 · B4 (Q-A6): una propuesta SOLO de lugar muestra el sub-espacio propuesto y no tacha la franja que se conserva', async () => {
    mostrar(
      responde({
        ...DETALLE_SOLICITANTE,
        estado: 'Pendiente de Reprogramación',
        fecha_propuesta_inicio: DETALLE_SOLICITANTE.fecha_inicio,
        fecha_propuesta_fin: DETALLE_SOLICITANTE.fecha_fin,
        sub_espacio_propuesto: 'ESTUDIO_GRABACION',
      }),
    )

    const propuesta = await screen.findByRole('region', { name: 'Propuesta de reprogramación' })
    const franjas = within(propuesta).getAllByText(formatearFranja(DETALLE_SOLICITANTE.fecha_inicio, DETALLE_SOLICITANTE.fecha_fin))
    expect(franjas).toHaveLength(2)
    expect(franjas[0]).not.toHaveClass('line-through')
    expect(within(propuesta).getByText(ETIQUETAS_SUB_ESPACIO.CABINA_AUDIO)).toHaveClass('line-through')
    expect(within(propuesta).getByText(ETIQUETAS_SUB_ESPACIO.ESTUDIO_GRABACION)).toBeInTheDocument()
  })

  it('Fase 7 · B4: una propuesta anterior a la Fase 7 (sin lugar) se lee como el MISMO sub-espacio, sin tacharlo', async () => {
    mostrar(
      responde({
        ...DETALLE_SOLICITANTE,
        estado: 'Pendiente de Reprogramación',
        fecha_propuesta_inicio: '2026-10-21T19:00:00.000Z',
        fecha_propuesta_fin: '2026-10-21T21:00:00.000Z',
        sub_espacio_propuesto: null,
      }),
    )

    const propuesta = await screen.findByRole('region', { name: 'Propuesta de reprogramación' })
    expect(within(propuesta).getByText('(el mismo sub-espacio)')).toBeInTheDocument()
    const lugares = within(propuesta).getAllByText(ETIQUETAS_SUB_ESPACIO.CABINA_AUDIO, { exact: false })
    expect(lugares[0]).not.toHaveClass('line-through')
  })

  it('404 (ajena o inexistente, idénticas): "No encontramos esa solicitud", sin decir cuál de las dos', async () => {
    mostrar(
      vi.fn<ApiSolicitudes['detalleSolicitante']>().mockResolvedValue({
        ok: false,
        error: { tipo: 'http', status: 404, mensajes: ['Solicitud no encontrada.'], requiereRecarga: false },
      }),
    )

    const titulo = await screen.findByRole('heading', { name: TEXTO_NO_ENCONTRADA })
    expect(titulo).toHaveFocus()
    expect(screen.queryByText(/no pertenece|no es tuya/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Volver al panel/ })).toHaveAttribute('href', RUTA_MIS_SOLICITUDES)
  })

  it('al pasar a otro radicado no muestra el anterior mientras carga el nuevo', async () => {
    const detalleSolicitante = vi
      .fn<ApiSolicitudes['detalleSolicitante']>()
      .mockResolvedValueOnce({ ok: true, datos: DETALLE_SOLICITANTE })
      .mockReturnValueOnce(new Promise(() => undefined)) // la segunda respuesta nunca llega
    mostrar(detalleSolicitante)
    await screen.findByRole('heading', { name: 'EC-2026-0142' })

    fireEvent.click(screen.getByRole('link', { name: 'Ir a otra solicitud' }))

    expect(await screen.findByText('Cargando la solicitud...')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'EC-2026-0142' })).not.toBeInTheDocument()
    expect(detalleSolicitante).toHaveBeenLastCalledWith('EC-2026-0200')
  })

  it('sin conexión: lo dice, en lugar de fingir que no existe', async () => {
    mostrar(vi.fn<ApiSolicitudes['detalleSolicitante']>().mockResolvedValue({ ok: false, error: { tipo: 'red' } }))

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTO_SIN_CONEXION)
    expect(screen.queryByText(TEXTO_NO_ENCONTRADA)).not.toBeInTheDocument()
  })
})
