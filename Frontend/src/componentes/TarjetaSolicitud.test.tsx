import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { SolicitudPropia } from '../api/esquemas'
import { ETIQUETAS_CORTAS_SUB_ESPACIO, ETIQUETAS_SUB_ESPACIO } from '../presentacion/etiquetas'
import { RECURSOS_RESUMEN, SOLICITUD } from '../test/fixtures-api'
import { TEXTO_PROPUESTA_EN_ESPERA, TEXTO_PROPUESTA_STAFF, TarjetaSolicitud } from './TarjetaSolicitud'

const BASE: SolicitudPropia = { ...SOLICITUD, recursos: [] }

const mostrar = (cambios: Partial<SolicitudPropia> = {}) =>
  render(
    <MemoryRouter>
      <TarjetaSolicitud solicitud={{ ...BASE, ...cambios }} />
    </MemoryRouter>,
  )

describe('TarjetaSolicitud (B1)', () => {
  it('es un artículo cuyo nombre accesible es el radicado', () => {
    mostrar()

    const tarjeta = screen.getByRole('article', { name: SOLICITUD.radicado })
    expect(within(tarjeta).getByText('Podcast / Vodcast')).toBeInTheDocument()
    expect(tarjeta.querySelector('[data-estado="Validado"]')).not.toBeNull()
  })

  it('enlaza al detalle con un nombre accesible único (incluye el radicado)', () => {
    mostrar()

    const enlace = screen.getByRole('link', { name: `Ver seguimiento detallado de ${SOLICITUD.radicado}` })
    expect(enlace).toHaveAttribute('href', `/solicitudes/${SOLICITUD.radicado}`)
  })

  it('urgencia: muestra la insignia y resalta el borde', () => {
    mostrar({ es_urgencia: true })

    const tarjeta = screen.getByRole('article', { name: SOLICITUD.radicado })
    expect(within(tarjeta).getByText('Urgencia')).toBeInTheDocument()
    expect(tarjeta).toHaveClass('border-2')
  })

  it('sin urgencia: no hay insignia', () => {
    mostrar()

    expect(screen.queryByText('Urgencia')).not.toBeInTheDocument()
  })

  it('lista los recursos con su cantidad', () => {
    mostrar({ recursos: RECURSOS_RESUMEN })

    expect(screen.getByText('Recursos: 2 × Micrófono de solapa')).toBeInTheDocument()
  })

  it('Pendiente de Reprogramación: avisa y muestra la franja propuesta en hora de Bogotá', () => {
    mostrar({
      estado: 'Pendiente de Reprogramación',
      fecha_propuesta_inicio: '2026-10-21T19:00:00.000Z',
      fecha_propuesta_fin: '2026-10-21T21:00:00.000Z',
    })

    expect(screen.getByText(TEXTO_PROPUESTA_STAFF)).toBeInTheDocument()
    expect(screen.getByText(TEXTO_PROPUESTA_EN_ESPERA)).toBeInTheDocument()
    expect(screen.getByText('miércoles, 21 de octubre de 2026 · 14:00 – 16:00')).toBeInTheDocument()
  })

  it('Pendiente sin franja propuesta (contrato incompleto): avisa sin inventar fechas', () => {
    mostrar({ estado: 'Pendiente de Reprogramación' })

    expect(screen.getByText(TEXTO_PROPUESTA_STAFF)).toBeInTheDocument()
    expect(screen.queryByText(/Franja propuesta/)).not.toBeInTheDocument()
  })

  it('Fase 7: muestra la insignia del sub-espacio reservado', () => {
    mostrar({ sub_espacio: 'ESTUDIO_GRABACION' })

    const insignia = screen.getByRole('article', { name: SOLICITUD.radicado }).querySelector('[data-sub-espacio]')
    expect(insignia).toHaveAttribute('data-sub-espacio', 'ESTUDIO_GRABACION')
    expect(insignia).toHaveTextContent(`Sub-espacio: ${ETIQUETAS_CORTAS_SUB_ESPACIO.ESTUDIO_GRABACION}`)
  })

  it('Fase 7 · Q-A6: en la propuesta, el lugar propuesto aparece solo si cambia', () => {
    const pendiente = {
      estado: 'Pendiente de Reprogramación',
      fecha_propuesta_inicio: '2026-10-21T19:00:00.000Z',
      fecha_propuesta_fin: '2026-10-21T21:00:00.000Z',
    } as const
    const { unmount } = mostrar({ ...pendiente, sub_espacio_propuesto: 'ESTUDIO_COMPLETO' })
    expect(screen.getByText(/Sub-espacio propuesto/)).toHaveTextContent(ETIQUETAS_SUB_ESPACIO.ESTUDIO_COMPLETO)
    unmount()

    // El mismo lugar (o una propuesta anterior a la Fase 7, sin lugar): no se anuncia un cambio que no hay.
    const mismo = mostrar({ ...pendiente, sub_espacio_propuesto: SOLICITUD.sub_espacio })
    expect(screen.queryByText(/Sub-espacio propuesto/)).not.toBeInTheDocument()
    mismo.unmount()
    mostrar({ ...pendiente, sub_espacio_propuesto: null })
    expect(screen.queryByText(/Sub-espacio propuesto/)).not.toBeInTheDocument()
  })

  it('en otros estados no hay aviso de propuesta', () => {
    const { container } = mostrar({
      fecha_propuesta_inicio: '2026-10-21T19:00:00.000Z',
      fecha_propuesta_fin: '2026-10-21T21:00:00.000Z',
    })

    expect(container.querySelector('[data-aviso="reprogramacion"]')).toBeNull()
  })
})
