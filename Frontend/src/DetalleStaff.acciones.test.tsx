import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DetalleStaff, { TEXTO_RECARGA_FALLIDA } from './DetalleStaff'
import { ProveedorApi } from './api/ProveedorApi'
import type { Resultado } from './api/cliente'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type { Categoria, DetalleStaff as DatosDetalleStaff } from './api/esquemas'
import type { Estado } from './api/maquina-estados'
import { MENSAJE_CAMBIO_CONCURRENTE, MENSAJE_FIN_NO_POSTERIOR } from './api/mensajes'
import type { ApiSolicitudes } from './api/solicitudes'
import {
  TEXTO_ACTUALIZANDO,
  TEXTO_AYUDA_AJUSTE,
  TEXTO_AYUDA_CONFLICTO,
  TEXTO_LEYENDA_SUB_ESPACIO_AJUSTE,
  TEXTO_LEYENDA_SUB_ESPACIO_PROPUESTO,
  TEXTO_ETIQUETA_MOTIVO_RECHAZO,
  TEXTO_ETIQUETA_MOTIVO_REPROGRAMACION,
} from './componentes/AccionesStaff'
import { formatearFranja } from './fechas/bogota'
import { TEXTO_FRANJA_INICIADA, TEXTO_RAZON_AJUSTE_SIN_CAMBIOS } from './presentacion/acciones-staff'
import { ETIQUETAS_SUB_ESPACIO } from './presentacion/etiquetas'
import { MENSAJE_NO_ATENDIDA } from './presentacion/linea-de-vida'
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

  it.each<[Estado, Categoria, string[]]>([
    ['Recibido', 'PODCAST', ['Validar', 'Validar con ajustes', 'Rechazar']],
    ['Validado', 'PODCAST', ['Iniciar producción', 'Proponer reprogramación']],
    ['En Producción', 'ESPACIOS', ['Marcar como entregada']],
    // Fase 8 · requisito 3: PODCAST y VIDEO pasan por edición antes de la entrega.
    ['En Producción', 'PODCAST', ['Pasar a edición']],
    ['Edición y postproducción', 'VIDEO', ['Marcar como entregada']],
  ])('en "%s" (%s) la resolución ofrece %j', async (estado, categoria, botones) => {
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok({ ...en(estado), categoria })) })

    const resolucion = await screen.findByRole('region', { name: 'Resolución' })
    expect(within(resolucion).getAllByRole('button').map((b) => b.textContent)).toEqual(botones)
  })

  it.each<Estado>(['Pendiente de Reprogramación', 'Entregado', 'Rechazado', 'No atendida'])('en "%s" no hay resolución', async (estado) => {
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
    expect(dialogo).toHaveAccessibleDescription(/EC-2026-0142.*"Revisado y aprobado"/)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, validar' }))

    expect(await screen.findByRole('button', { name: 'Iniciar producción' })).toBeEnabled()
    expect(actualizarTablero).toHaveBeenCalledExactlyOnceWith('EC-2026-0142', { estado: 'Validado' })
    expect(detalleStaff).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('La solicitud pasó a "Revisado y aprobado".')
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
    expect(screen.getByRole('button', { name: 'Validar con ajustes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'EC-2026-0142' })).toBeInTheDocument()
    expect(screen.queryByText('Cargando la solicitud...')).not.toBeInTheDocument()
  })

  it.each<[Estado, Categoria, string, string, Estado]>([
    ['Validado', 'PODCAST', 'Iniciar producción', 'Sí, iniciar la producción', 'En Producción'],
    ['En Producción', 'ESPACIOS', 'Marcar como entregada', 'Sí, marcar como entregada', 'Entregado'],
    // Fase 8 · requisito 3: T11 y T12 por el mismo PATCH, solo con el destino.
    ['En Producción', 'VIDEO', 'Pasar a edición', 'Sí, pasar a edición', 'Edición y postproducción'],
    ['Edición y postproducción', 'PODCAST', 'Marcar como entregada', 'Sí, marcar como entregada', 'Entregado'],
  ])('desde "%s" (%s), "%s" envía su destino', async (estado, categoria, boton, confirmar, destino) => {
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
    mostrar({
      detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok({ ...en(estado), categoria })),
      actualizarTablero,
    })
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
    expect(screen.getByRole('status')).toHaveTextContent('La solicitud pasó a "Revisado y aprobado".')

    fireEvent.click(screen.getByRole('button', { name: 'Recargar la solicitud' }))

    expect(await screen.findByRole('button', { name: 'Iniciar producción' })).toBeInTheDocument()
    expect(actualizarTablero).toHaveBeenCalledOnce() // recargar NO repite la acción
    expect(screen.getByRole('status')).toHaveTextContent('La solicitud pasó a "Revisado y aprobado".')
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

  it('Fase 7 · B1: con la franja ya TERMINADA, la advertencia DA4 no bloquea el rechazo y T2 sale por el PATCH (D7 solo frena T1)', async () => {
    // La franja del fixture es el 15-oct de 14:00 a 16:00 Z: el 16-oct ya terminó del todo.
    vi.setSystemTime(new Date('2026-10-16T15:00:00.000Z'))
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)), actualizarTablero })

    // El escenario es el de una vencida: la advertencia está a la vista...
    expect(await screen.findByText(TEXTO_FRANJA_INICIADA)).toBeInTheDocument()
    // ...y aun así la salida que deja D7 (rechazar con motivo) sigue disponible.
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeEnabled()

    const dialogo = abrir('Rechazar', 'Rechazar la solicitud')
    fireEvent.change(within(dialogo).getByLabelText(TEXTO_ETIQUETA_MOTIVO_RECHAZO), {
      target: { value: 'La franja venció sin respuesta del Estudio' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, rechazar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('La solicitud pasó a "Rechazado".')
    expect(actualizarTablero).toHaveBeenCalledExactlyOnceWith('EC-2026-0142', {
      estado: 'Rechazado',
      motivo_rechazo: 'La franja venció sin respuesta del Estudio',
    })
  })

  it('Fase 7 · T10: con la franja ya iniciada, la resolución ofrece además "Cerrar como no atendida" (sin quitar el rechazo)', async () => {
    vi.setSystemTime(new Date('2026-10-16T15:00:00.000Z'))
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)) })

    const resolucion = await screen.findByRole('region', { name: 'Resolución' })
    expect(within(resolucion).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Validar',
      'Validar con ajustes',
      'Rechazar',
      'Cerrar como no atendida',
    ])
  })

  it('Fase 7 · T10: cerrar como no atendida envía solo el destino por el PATCH (sin motivo), avisa lo que verá el solicitante y anuncia el éxito', async () => {
    vi.setSystemTime(new Date('2026-10-16T15:00:00.000Z'))
    const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)), actualizarTablero })
    await esperarDetalle()

    const dialogo = abrir('Cerrar como no atendida', 'Cerrar como no atendida')
    expect(dialogo).toHaveAccessibleDescription(/EC-2026-0142.*"No atendida"/)
    expect(dialogo).toHaveAccessibleDescription(expect.stringContaining(MENSAJE_NO_ATENDIDA))
    // Sin formulario: nada que completar, "Confirmar" está disponible de entrada.
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, cerrar como no atendida' })
    expect(confirmar).toBeEnabled()
    fireEvent.click(confirmar)

    expect(await screen.findByRole('status')).toHaveTextContent('La solicitud pasó a "No atendida".')
    expect(actualizarTablero).toHaveBeenCalledExactlyOnceWith('EC-2026-0142', { estado: 'No atendida' })
  })

  it('Fase 7 · B3: al rechazar, "Confirmar" bloqueado explica por qué (visible y como descripción accesible) y la razón se va con un motivo válido', async () => {
    mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)) })
    await esperarDetalle()

    const dialogo = abrir('Rechazar', 'Rechazar la solicitud')
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, rechazar' })
    const pideMotivo = 'Para confirmar, escribe un motivo de al menos 10 caracteres.'
    expect(confirmar).toBeDisabled()
    expect(confirmar).toHaveAccessibleDescription(pideMotivo)
    expect(within(dialogo).getByText(pideMotivo)).toBeVisible()

    const campo = within(dialogo).getByLabelText(TEXTO_ETIQUETA_MOTIVO_RECHAZO)
    fireEvent.change(campo, { target: { value: 'x'.repeat(501) } })
    expect(confirmar).toHaveAccessibleDescription('Para confirmar, acorta el motivo a 500 caracteres como máximo.')

    fireEvent.change(campo, { target: { value: 'El set está en mantenimiento esa semana' } })
    expect(confirmar).toBeEnabled()
    expect(confirmar).not.toHaveAttribute('aria-describedby')
    expect(within(dialogo).queryByText(pideMotivo)).not.toBeInTheDocument()
  })
  describe('Fase 7 · 7B.3 · Validar con ajustes (PRD v2.2 §5.6 · Q-B2 y D-4)', () => {
    // RECIBIDO pide el 15-oct de 09:00 a 11:00 (Bogotá) en la cabina; el reloj va el 5-oct.
    const abrirAjuste = () => abrir('Validar con ajustes', 'Validar con ajustes')
    const confirmarAjuste = (dialogo: HTMLElement) => within(dialogo).getByRole('button', { name: 'Sí, validar con ajustes' })
    const grupoDe = (dialogo: HTMLElement) => within(dialogo).getByRole('group', { name: TEXTO_LEYENDA_SUB_ESPACIO_AJUSTE })

    it('parte de lo pedido: franja y lugar del solicitante en los campos, y lo dice', async () => {
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)) })
      await esperarDetalle()

      const dialogo = abrirAjuste()
      expect(dialogo).toHaveAccessibleDescription(/EC-2026-0142.*"Revisado y aprobado"/)
      expect(within(dialogo).getByText(formatearFranja(RECIBIDO.fecha_inicio, RECIBIDO.fecha_fin))).toBeInTheDocument()
      expect(within(dialogo).getByLabelText('Fecha')).toHaveValue('2026-10-15')
      expect(within(dialogo).getByLabelText('Hora de inicio')).toHaveValue('09:00')
      expect(within(dialogo).getByLabelText('Hora de finalización')).toHaveValue('11:00')
      expect(within(grupoDe(dialogo)).getByLabelText(ETIQUETAS_SUB_ESPACIO.CABINA_AUDIO)).toBeChecked()
      expect(within(dialogo).getByText(TEXTO_AYUDA_AJUSTE)).toBeInTheDocument()
    })

    it('sin cambios, "Confirmar" sigue bloqueado y explica que eso es "Validar"; con un cambio se habilita', async () => {
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)) })
      await esperarDetalle()

      const dialogo = abrirAjuste()
      expect(confirmarAjuste(dialogo)).toBeDisabled()
      expect(confirmarAjuste(dialogo)).toHaveAccessibleDescription(TEXTO_RAZON_AJUSTE_SIN_CAMBIOS)

      fireEvent.click(within(grupoDe(dialogo)).getByLabelText(ETIQUETAS_SUB_ESPACIO.ESTUDIO_GRABACION))
      expect(confirmarAjuste(dialogo)).toBeEnabled()

      // Volver al lugar pedido deshace el cambio: otra vez bloqueado.
      fireEvent.click(within(grupoDe(dialogo)).getByLabelText(ETIQUETAS_SUB_ESPACIO.CABINA_AUDIO))
      expect(confirmarAjuste(dialogo)).toBeDisabled()
    })

    it('solo el lugar (Q-A4): un PATCH con el destino y el sub-espacio, SIN fechas; anuncia y recarga', async () => {
      const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
      const detalleStaff = vi
        .fn<ApiSolicitudes['detalleStaff']>()
        .mockResolvedValueOnce(ok(RECIBIDO))
        .mockResolvedValueOnce(ok({ ...en('Validado'), sub_espacio: 'ESTUDIO_GRABACION' }))
      mostrar({ detalleStaff, actualizarTablero })
      await esperarDetalle()

      const dialogo = abrirAjuste()
      fireEvent.click(within(grupoDe(dialogo)).getByLabelText(ETIQUETAS_SUB_ESPACIO.ESTUDIO_GRABACION))
      fireEvent.click(confirmarAjuste(dialogo))

      expect(await screen.findByRole('status')).toHaveTextContent('La solicitud pasó a "Revisado y aprobado".')
      expect(actualizarTablero).toHaveBeenCalledExactlyOnceWith('EC-2026-0142', {
        estado: 'Validado',
        sub_espacio: 'ESTUDIO_GRABACION',
      })
      await waitFor(() => expect(detalleStaff).toHaveBeenCalledTimes(2))
      expect(dialogo).not.toHaveAttribute('open')
    })

    it('solo la franja: el destino y la franja nueva en hora de Bogotá, SIN sub-espacio', async () => {
      const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)), actualizarTablero })
      await esperarDetalle()

      const dialogo = abrirAjuste()
      fireEvent.change(within(dialogo).getByLabelText('Fecha'), { target: { value: '2026-10-20' } })
      fireEvent.click(confirmarAjuste(dialogo))

      await waitFor(() => expect(actualizarTablero).toHaveBeenCalledOnce())
      expect(actualizarTablero).toHaveBeenCalledWith('EC-2026-0142', {
        estado: 'Validado',
        fecha_inicio: '2026-10-20T09:00:00-05:00',
        fecha_fin: '2026-10-20T11:00:00-05:00',
      })
    })

    it('Q-B2 · rescate: con la franja ya iniciada se ofrece, y mueve franja y lugar en el mismo PATCH', async () => {
      vi.setSystemTime(new Date('2026-10-16T15:00:00.000Z'))
      const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)), actualizarTablero })

      expect(await screen.findByText(TEXTO_FRANJA_INICIADA)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Validar con ajustes' })).toBeEnabled()

      const dialogo = abrirAjuste()
      expect(within(dialogo).getByLabelText('Fecha')).toHaveAttribute('min', '2026-10-16')
      fireEvent.change(within(dialogo).getByLabelText('Fecha'), { target: { value: '2026-10-22' } })
      fireEvent.change(within(dialogo).getByLabelText('Hora de inicio'), { target: { value: '14:00' } })
      fireEvent.change(within(dialogo).getByLabelText('Hora de finalización'), { target: { value: '15:00' } })
      fireEvent.click(within(grupoDe(dialogo)).getByLabelText(ETIQUETAS_SUB_ESPACIO.ESTUDIO_COMPLETO))
      fireEvent.click(confirmarAjuste(dialogo))

      expect(await screen.findByRole('status')).toHaveTextContent('La solicitud pasó a "Revisado y aprobado".')
      expect(actualizarTablero).toHaveBeenCalledExactlyOnceWith('EC-2026-0142', {
        estado: 'Validado',
        fecha_inicio: '2026-10-22T14:00:00-05:00',
        fecha_fin: '2026-10-22T15:00:00-05:00',
        sub_espacio: 'ESTUDIO_COMPLETO',
      })
    })

    it('fin no posterior al inicio: aviso local de CA-04 y no se envía nada (DH4)', async () => {
      const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>()
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)), actualizarTablero })
      await esperarDetalle()

      const dialogo = abrirAjuste()
      fireEvent.change(within(dialogo).getByLabelText('Hora de finalización'), { target: { value: '08:00' } })
      fireEvent.click(confirmarAjuste(dialogo))

      expect(within(dialogo).getByRole('alert')).toHaveTextContent(MENSAJE_FIN_NO_POSTERIOR)
      expect(actualizarTablero).not.toHaveBeenCalled()
      expect(dialogo).toHaveAttribute('open')
    })

    it('un 409 de CA-06 (el lugar nuevo choca con otra reserva) muestra el mensaje, la ayuda y la recarga', async () => {
      const mensaje = 'Error CA-06: el horario seleccionado se cruza con otra reserva. Elige otra franja.'
      const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue({
        ok: false,
        error: { tipo: 'http', status: 409, mensajes: [mensaje], requiereRecarga: false },
      })
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)), actualizarTablero })
      await esperarDetalle()

      const dialogo = abrirAjuste()
      fireEvent.click(within(grupoDe(dialogo)).getByLabelText(ETIQUETAS_SUB_ESPACIO.ESTUDIO_COMPLETO))
      fireEvent.click(confirmarAjuste(dialogo))

      const alerta = await within(dialogo).findByRole('alert')
      expect(alerta).toHaveTextContent(mensaje)
      expect(alerta).toHaveTextContent(TEXTO_AYUDA_CONFLICTO)
      expect(within(dialogo).getByRole('button', { name: 'Recargar la solicitud' })).toBeInTheDocument()
    })

    it('un borrador abandonado no se filtra: reabrir vuelve a lo pedido y "Validar" sigue enviando solo el destino', async () => {
      const actualizarTablero = vi.fn<ApiSolicitudes['actualizarTablero']>().mockResolvedValue(PATCH_OK)
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(RECIBIDO)), actualizarTablero })
      await esperarDetalle()

      const dialogo = abrirAjuste()
      fireEvent.change(within(dialogo).getByLabelText('Fecha'), { target: { value: '2026-10-20' } })
      fireEvent.click(within(grupoDe(dialogo)).getByLabelText(ETIQUETAS_SUB_ESPACIO.ESTUDIO_GRABACION))
      fireEvent.click(within(dialogo).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))

      const otraVez = abrirAjuste()
      expect(within(otraVez).getByLabelText('Fecha')).toHaveValue('2026-10-15')
      expect(within(grupoDe(otraVez)).getByLabelText(ETIQUETAS_SUB_ESPACIO.CABINA_AUDIO)).toBeChecked()
      fireEvent.click(within(otraVez).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))

      fireEvent.click(within(abrir('Validar', 'Validar la solicitud')).getByRole('button', { name: 'Sí, validar' }))
      await waitFor(() => expect(actualizarTablero).toHaveBeenCalledOnce())
      expect(actualizarTablero).toHaveBeenCalledWith('EC-2026-0142', { estado: 'Validado' })
    })
  })

  describe('T5 · proponer reprogramación (6.5.4b)', () => {
    const VALIDADO = en('Validado')
    const PENDIENTE = en('Pendiente de Reprogramación')

    interface Propuesta {
      readonly fecha?: string
      readonly inicio?: string
      readonly fin?: string
      readonly motivo?: string
    }

    const abrirPropuesta = () => abrir('Proponer reprogramación', 'Proponer una reprogramación')

    /** Llena el formulario de C4 dentro del diálogo (por etiquetas, como lo haría una persona). */
    function llenar(dialogo: HTMLElement, propuesta: Propuesta = {}) {
      const {
        fecha = '2026-10-28',
        inicio = '09:00',
        fin = '10:30',
        motivo = '   Mantenimiento del set de grabación   ',
      } = propuesta
      const campos = within(dialogo)
      fireEvent.change(campos.getByLabelText('Fecha'), { target: { value: fecha } })
      fireEvent.change(campos.getByLabelText('Hora de inicio'), { target: { value: inicio } })
      fireEvent.change(campos.getByLabelText('Hora de finalización'), { target: { value: fin } })
      fireEvent.change(campos.getByLabelText(TEXTO_ETIQUETA_MOTIVO_REPROGRAMACION), { target: { value: motivo } })
    }

    const confirmarEn = (dialogo: HTMLElement) => within(dialogo).getByRole('button', { name: 'Sí, enviar la propuesta' })

    it('el diálogo dice lo que hará el servidor, muestra la franja actual y el calendario empieza hoy en Bogotá', async () => {
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(VALIDADO)) })
      await esperarDetalle()

      const dialogo = abrirPropuesta()
      expect(dialogo).toHaveAccessibleDescription(/si la rechaza, la solicitud se cancela.*no se puede retirar/)
      expect(within(dialogo).getByText(formatearFranja(VALIDADO.fecha_inicio, VALIDADO.fecha_fin))).toBeInTheDocument()
      expect(within(dialogo).getByLabelText('Fecha')).toHaveAttribute('min', '2026-10-05')
    })

    it('"Confirmar" sigue bloqueado hasta tener fecha, ambas horas y un motivo válido', async () => {
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(VALIDADO)) })
      await esperarDetalle()

      const dialogo = abrirPropuesta()
      expect(confirmarEn(dialogo)).toBeDisabled()

      llenar(dialogo, { motivo: 'x'.repeat(9) })
      expect(confirmarEn(dialogo)).toBeDisabled()

      llenar(dialogo, { fin: '' })
      expect(confirmarEn(dialogo)).toBeDisabled()

      llenar(dialogo)
      expect(confirmarEn(dialogo)).toBeEnabled()
    })

    it('Fase 7 · B3: "Confirmar" bloqueado explica primero la franja que falta, luego el motivo, y sin razón se habilita', async () => {
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(VALIDADO)) })
      await esperarDetalle()

      const dialogo = abrirPropuesta()
      const pideFranja = 'Para confirmar, elige la fecha y las dos horas de la nueva franja.'
      expect(confirmarEn(dialogo)).toHaveAccessibleDescription(pideFranja)
      expect(within(dialogo).getByText(pideFranja)).toBeVisible()

      llenar(dialogo, { motivo: 'corto' })
      expect(confirmarEn(dialogo)).toHaveAccessibleDescription('Para confirmar, escribe un motivo de al menos 10 caracteres.')

      llenar(dialogo)
      expect(confirmarEn(dialogo)).toBeEnabled()
      expect(confirmarEn(dialogo)).not.toHaveAttribute('aria-describedby')
    })

    it('Fase 7 · Q-A6: el lugar propuesto empieza en el vigente y se puede cambiar; se envía el elegido', async () => {
      const proponerReprogramacion = vi
        .fn<ApiSolicitudes['proponerReprogramacion']>()
        .mockResolvedValue({ ok: true, datos: { mensaje: 'Propuesta de reprogramación registrada.', solicitud: en('Pendiente de Reprogramación') } })
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(VALIDADO)), proponerReprogramacion })
      await esperarDetalle()

      const dialogo = abrirPropuesta()
      const grupo = within(dialogo).getByRole('group', { name: TEXTO_LEYENDA_SUB_ESPACIO_PROPUESTO })
      expect(within(grupo).getByLabelText(ETIQUETAS_SUB_ESPACIO.CABINA_AUDIO)).toBeChecked()

      fireEvent.click(within(grupo).getByLabelText(ETIQUETAS_SUB_ESPACIO.ESTUDIO_GRABACION))
      llenar(dialogo)
      fireEvent.click(confirmarEn(dialogo))

      await waitFor(() => expect(proponerReprogramacion).toHaveBeenCalledOnce())
      expect(proponerReprogramacion.mock.calls[0]?.[1]).toMatchObject({ sub_espacio: 'ESTUDIO_GRABACION' })
    })

    it('fin no posterior al inicio: aviso local con el texto de CA-04 y no se envía nada (DH4)', async () => {
      const proponerReprogramacion = vi.fn<ApiSolicitudes['proponerReprogramacion']>()
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(VALIDADO)), proponerReprogramacion })
      await esperarDetalle()

      const dialogo = abrirPropuesta()
      llenar(dialogo, { inicio: '10:00', fin: '09:00' })
      fireEvent.click(confirmarEn(dialogo))

      expect(within(dialogo).getByRole('alert')).toHaveTextContent(MENSAJE_FIN_NO_POSTERIOR)
      expect(proponerReprogramacion).not.toHaveBeenCalled()
      expect(dialogo).toHaveAttribute('open')
    })

    it('envía la franja en hora de Bogotá y el motivo recortado por SU canal; anuncia y recarga (DR3)', async () => {
      const proponerReprogramacion = vi
        .fn<ApiSolicitudes['proponerReprogramacion']>()
        .mockResolvedValue({ ok: true, datos: { mensaje: 'Propuesta de reprogramación registrada.', solicitud: PENDIENTE } })
      const detalleStaff = vi
        .fn<ApiSolicitudes['detalleStaff']>()
        .mockResolvedValueOnce(ok(VALIDADO))
        .mockResolvedValueOnce(ok(PENDIENTE))
      const api = mostrar({ detalleStaff, proponerReprogramacion })
      await esperarDetalle()

      const dialogo = abrirPropuesta()
      llenar(dialogo)
      fireEvent.click(confirmarEn(dialogo))

      expect(await screen.findByRole('status')).toHaveTextContent('La solicitud pasó a "Pendiente de Reprogramación".')
      expect(proponerReprogramacion).toHaveBeenCalledExactlyOnceWith('EC-2026-0142', {
        fecha_inicio: '2026-10-28T09:00:00-05:00',
        fecha_fin: '2026-10-28T10:30:00-05:00',
        // Fase 7 · SE6: sin tocar el grupo, se propone el MISMO lugar (el del fixture).
        sub_espacio: 'CABINA_AUDIO',
        motivo: 'Mantenimiento del set de grabación',
      })
      expect(api.actualizarTablero).not.toHaveBeenCalled()
      await waitFor(() => expect(detalleStaff).toHaveBeenCalledTimes(2))
      // En Pendiente el Staff ya no tiene acciones: la decisión es del solicitante.
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Resolución' })).not.toBeInTheDocument())
      expect(dialogo).not.toHaveAttribute('open')
    })

    it('un 400 del servidor (reglas de horario) se muestra tal cual, sin la ayuda de conflicto ni la recarga', async () => {
      const mensaje = 'Error CA-04: Solo se pueden reservar días hábiles (lunes a viernes, sin festivos).'
      const proponerReprogramacion = vi.fn<ApiSolicitudes['proponerReprogramacion']>().mockResolvedValue({
        ok: false,
        error: { tipo: 'http', status: 400, mensajes: [mensaje], requiereRecarga: false },
      })
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(VALIDADO)), proponerReprogramacion })
      await esperarDetalle()

      const dialogo = abrirPropuesta()
      llenar(dialogo, { fecha: '2026-10-31' })
      fireEvent.click(confirmarEn(dialogo))

      const alerta = await within(dialogo).findByRole('alert')
      expect(alerta).toHaveTextContent(mensaje)
      expect(alerta).not.toHaveTextContent(TEXTO_AYUDA_CONFLICTO)
      expect(within(dialogo).queryByRole('button', { name: 'Recargar la solicitud' })).not.toBeInTheDocument()
    })

    it('un 409 (CA-06: la propuesta choca con otra reserva) muestra el mensaje, la ayuda y la recarga', async () => {
      const mensaje = 'Error CA-06: el horario seleccionado se cruza con otra reserva. Elige otra franja.'
      const proponerReprogramacion = vi.fn<ApiSolicitudes['proponerReprogramacion']>().mockResolvedValue({
        ok: false,
        error: { tipo: 'http', status: 409, mensajes: [mensaje], requiereRecarga: false },
      })
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(VALIDADO)), proponerReprogramacion })
      await esperarDetalle()

      const dialogo = abrirPropuesta()
      llenar(dialogo)
      fireEvent.click(confirmarEn(dialogo))

      const alerta = await within(dialogo).findByRole('alert')
      expect(alerta).toHaveTextContent(mensaje)
      expect(alerta).toHaveTextContent(TEXTO_AYUDA_CONFLICTO)
      expect(within(dialogo).getByRole('button', { name: 'Recargar la solicitud' })).toBeInTheDocument()
    })

    it('reabrir el diálogo empieza con la franja y el motivo en blanco', async () => {
      mostrar({ detalleStaff: vi.fn<ApiSolicitudes['detalleStaff']>().mockResolvedValue(ok(VALIDADO)) })
      await esperarDetalle()

      const dialogo = abrirPropuesta()
      llenar(dialogo)
      fireEvent.click(within(dialogo).getByRole('button', { name: TEXTO_VOLVER_SIN_CAMBIOS }))

      const otraVez = abrirPropuesta()
      expect(within(otraVez).getByLabelText('Fecha')).toHaveValue('')
      expect(within(otraVez).getByLabelText('Hora de inicio')).toHaveValue('')
      expect(within(otraVez).getByLabelText(TEXTO_ETIQUETA_MOTIVO_REPROGRAMACION)).toHaveValue('')
    })
  })
})
