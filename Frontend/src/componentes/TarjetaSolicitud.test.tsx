import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SolicitudPropia } from '../api/esquemas'
import { RECURSOS_RESUMEN, SOLICITUD } from '../test/fixtures-api'
import { TEXTO_PROPUESTA_EN_ESPERA, TEXTO_PROPUESTA_STAFF, TarjetaSolicitud } from './TarjetaSolicitud'

const BASE: SolicitudPropia = { ...SOLICITUD, recursos: [] }

const mostrar = (cambios: Partial<SolicitudPropia> = {}) =>
  render(<TarjetaSolicitud solicitud={{ ...BASE, ...cambios }} />)

describe('TarjetaSolicitud (B1)', () => {
  it('es un artículo cuyo nombre accesible es el radicado', () => {
    mostrar()

    const tarjeta = screen.getByRole('article', { name: SOLICITUD.radicado })
    expect(within(tarjeta).getByText('Podcast / Vodcast')).toBeInTheDocument()
    expect(tarjeta.querySelector('[data-estado="Validado"]')).not.toBeNull()
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

  it('en otros estados no hay aviso de propuesta', () => {
    const { container } = mostrar({
      fecha_propuesta_inicio: '2026-10-21T19:00:00.000Z',
      fecha_propuesta_fin: '2026-10-21T21:00:00.000Z',
    })

    expect(container.querySelector('[data-aviso="reprogramacion"]')).toBeNull()
  })
})
