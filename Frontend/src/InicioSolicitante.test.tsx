import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InicioSolicitante, {
  TEXTO_CARGANDO_INICIO_SOLICITANTE,
  TEXTO_NUEVA_SOLICITUD,
  TEXTO_SIN_PROXIMAS,
  TEXTO_TITULO_PENDIENTES,
  TEXTO_TITULO_PROXIMAS,
  TEXTO_TITULO_REGLAS,
  TEXTO_VER_TODAS,
} from './InicioSolicitante'
import { ProveedorApi } from './api/ProveedorApi'
import { TEXTO_SIN_CONEXION } from './api/errores'
import type { SolicitudPropia } from './api/esquemas'
import type { ApiSolicitudes } from './api/solicitudes'
import { TEXTO_BLOQUES_ATENCION } from './presentacion/franja'
import { REGLAS_ESTUDIO_C } from './presentacion/inicio'
import { RUTA_MIS_SOLICITUDES } from './rutas'
import { RECURSOS_RESUMEN, SOLICITUD, apiFalsa } from './test/fixtures-api'

const ANA = { id: 'uuid-ana', nombre: 'Ana Pérez', rol: 'SOLICITANTE' } as const
const PASADO = '2026-10-19T14:00:00.000Z'

const propia = (cambios: Partial<SolicitudPropia>): SolicitudPropia => ({ ...SOLICITUD, recursos: RECURSOS_RESUMEN, ...cambios })

/** Una validada que empieza `dia` de noviembre a las 9:00 de Bogotá. */
const validadaEl = (radicado: string, dia: number): SolicitudPropia =>
  propia({
    radicado,
    estado: 'Validado',
    fecha_inicio: `2026-11-${String(dia).padStart(2, '0')}T14:00:00.000Z`,
    fecha_fin: `2026-11-${String(dia).padStart(2, '0')}T15:00:00.000Z`,
  })

const pendiente = (radicado: string, diaPropuesta: number): SolicitudPropia =>
  propia({
    radicado,
    estado: 'Pendiente de Reprogramación',
    fecha_propuesta_inicio: `2026-10-${diaPropuesta}T14:00:00.000Z`,
    fecha_propuesta_fin: `2026-10-${diaPropuesta}T15:00:00.000Z`,
  })

const responde = (...solicitudes: SolicitudPropia[]) =>
  vi.fn<ApiSolicitudes['misSolicitudes']>().mockResolvedValue({ ok: true, datos: solicitudes })

function mostrar(misSolicitudes: ApiSolicitudes['misSolicitudes']) {
  render(
    <MemoryRouter>
      <ProveedorApi api={apiFalsa({ misSolicitudes })}>
        <InicioSolicitante usuario={ANA} onLogout={() => undefined} />
      </ProveedorApi>
    </MemoryRouter>,
  )
}

/** Radicados de las tarjetas de una sección, en el orden en que se pintan (el h3 de cada tarjeta). */
const radicadosEn = (seccion: HTMLElement) =>
  within(seccion)
    .getAllByRole('article')
    .map((tarjeta) => within(tarjeta).getByRole('heading', { level: 3 }).textContent)

const seccion = (nombre: RegExp | string) => screen.getByRole('region', { name: nombre })

describe('InicioSolicitante (Fase 7 · C5)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T15:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saluda, hace UN solo GET de sus solicitudes y "Nueva solicitud" lleva al panel (donde vive B2)', async () => {
    const misSolicitudes = responde(validadaEl('EC-1', 3))
    mostrar(misSolicitudes)

    expect(await screen.findByRole('region', { name: TEXTO_TITULO_PROXIMAS })).toBeInTheDocument()
    expect(misSolicitudes).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Hola, Ana Pérez' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: TEXTO_NUEVA_SOLICITUD })).toHaveAttribute('href', RUTA_MIS_SOLICITUDES)
  })

  it('pendientes de tu respuesta: van ARRIBA, solo las de propuesta y la más próxima primero', async () => {
    mostrar(responde(validadaEl('EC-V', 3), pendiente('EC-P-tarde', 29), propia({ radicado: 'EC-R', estado: 'Recibido' }), pendiente('EC-P-pronto', 22)))

    const pendientes = await screen.findByRole('region', { name: new RegExp(TEXTO_TITULO_PENDIENTES) })
    expect(radicadosEn(pendientes)).toEqual(['EC-P-pronto', 'EC-P-tarde'])
    expect(within(pendientes).getByRole('heading', { level: 2 })).toHaveTextContent(`${TEXTO_TITULO_PENDIENTES} (2)`)
    // El orden en la página: lo que bloquea al Estudio va antes que las próximas.
    const secciones = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
    const indice = (titulo: string) => secciones.findIndex((texto) => texto.includes(titulo))
    expect(indice(TEXTO_TITULO_PENDIENTES)).toBeGreaterThan(-1)
    expect(indice(TEXTO_TITULO_PENDIENTES)).toBeLessThan(indice(TEXTO_TITULO_PROXIMAS))
  })

  it('sin propuestas pendientes no aparece la sección (es un llamado a la acción, no ruido)', async () => {
    mostrar(responde(validadaEl('EC-1', 3)))
    await screen.findByRole('region', { name: TEXTO_TITULO_PROXIMAS })

    expect(screen.queryByRole('region', { name: new RegExp(TEXTO_TITULO_PENDIENTES) })).not.toBeInTheDocument()
  })

  it('próximas: solo validadas por delante, la más cercana primero y como máximo 3; "Ver todas" lleva al panel', async () => {
    mostrar(
      responde(
        validadaEl('EC-4', 20),
        validadaEl('EC-1', 3),
        propia({ radicado: 'EC-pasada', estado: 'Validado', fecha_inicio: PASADO }),
        validadaEl('EC-3', 12),
        validadaEl('EC-2', 5),
      ),
    )

    const proximas = await screen.findByRole('region', { name: TEXTO_TITULO_PROXIMAS })
    expect(radicadosEn(proximas)).toEqual(['EC-1', 'EC-2', 'EC-3'])
    expect(within(proximas).getByRole('link', { name: TEXTO_VER_TODAS })).toHaveAttribute('href', RUTA_MIS_SOLICITUDES)
  })

  it('sin próximas lo dice, en lugar de dejar la sección vacía', async () => {
    mostrar(responde())

    const proximas = await screen.findByRole('region', { name: TEXTO_TITULO_PROXIMAS })
    expect(within(proximas).getByText(TEXTO_SIN_PROXIMAS)).toBeInTheDocument()
    expect(within(proximas).queryAllByRole('article')).toHaveLength(0)
  })

  it('recuerda las reglas del Estudio C, con el MISMO horario del formulario B2', async () => {
    mostrar(responde())
    await screen.findByRole('region', { name: TEXTO_TITULO_PROXIMAS })

    const reglas = seccion(TEXTO_TITULO_REGLAS)
    expect(within(reglas).getAllByRole('listitem').map((li) => li.textContent)).toEqual([...REGLAS_ESTUDIO_C])
    expect(within(reglas).getByText(TEXTO_BLOQUES_ATENCION)).toBeInTheDocument()
  })

  it('mientras carga lo dice; sin conexión lo dice (no finge que no hay nada) y "Reintentar" vuelve a pedir', async () => {
    const misSolicitudes = vi
      .fn<ApiSolicitudes['misSolicitudes']>()
      .mockResolvedValueOnce({ ok: false, error: { tipo: 'red' } })
      .mockResolvedValueOnce({ ok: true, datos: [validadaEl('EC-1', 3)] })
    mostrar(misSolicitudes)

    expect(screen.getByText(TEXTO_CARGANDO_INICIO_SOLICITANTE)).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTO_SIN_CONEXION)
    expect(screen.queryByRole('region', { name: TEXTO_TITULO_PROXIMAS })).not.toBeInTheDocument()
    // Las reglas no dependen del servidor: siguen a la vista aunque falle la carga.
    expect(seccion(TEXTO_TITULO_REGLAS)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('region', { name: TEXTO_TITULO_PROXIMAS })).toBeInTheDocument()
    expect(misSolicitudes).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
