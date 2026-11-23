import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Solicitud } from '../api/esquemas'
import { ETIQUETAS_SUB_ESPACIO } from '../presentacion/etiquetas'
import { SOLICITUD } from '../test/fixtures-api'
import { ExitoRadicado, TEXTO_AVISO_URGENCIA, TEXTO_EXITO_TITULO } from './ExitoRadicado'

const CREADA: Solicitud = { ...SOLICITUD, radicado: 'EC-2026-0999', estado: 'Recibido' }

function mostrar(cambios: Partial<Solicitud> = {}, onVolver = vi.fn<() => void>()) {
  render(
    <MemoryRouter>
      <ExitoRadicado solicitud={{ ...CREADA, ...cambios }} responsable="Ana Pérez" idTitulo="titulo" onVolver={onVolver} />
    </MemoryRouter>,
  )
  return { onVolver }
}

describe('ExitoRadicado (B1b)', () => {
  it('muestra el radicado y el resumen de lo radicado', () => {
    mostrar()

    expect(screen.getByText('EC-2026-0999')).toBeInTheDocument()
    expect(screen.getByText('Podcast / Vodcast')).toBeInTheDocument()
    expect(screen.getByText('jueves, 15 de octubre de 2026 · 09:00 – 11:00')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(document.querySelector('[data-estado="Recibido"]')).not.toBeNull()
  })

  it('Fase 7: muestra el sub-espacio con su nombre oficial, el que guardó el servidor', () => {
    mostrar({ sub_espacio: 'ESTUDIO_COMPLETO' })

    const fila = screen.getByText('Sub-espacio').closest('div')
    expect(fila).toHaveTextContent(ETIQUETAS_SUB_ESPACIO.ESTUDIO_COMPLETO)
  })

  it('lleva el foco al título: el botón que lo tenía ya no existe', () => {
    mostrar()

    const titulo = screen.getByRole('heading', { name: TEXTO_EXITO_TITULO })
    expect(titulo).toHaveAttribute('id', 'titulo')
    expect(titulo).toHaveFocus()
  })

  it('urgencia marcada por el servidor: pide avisar al Staff', () => {
    mostrar({ es_urgencia: true })

    expect(screen.getByText(TEXTO_AVISO_URGENCIA, { exact: false })).toBeInTheDocument()
  })

  it('sin urgencia: no hay aviso', () => {
    mostrar()

    expect(document.querySelector('[data-aviso="urgencia"]')).toBeNull()
  })

  it('ofrece ir al seguimiento detallado del radicado nuevo', () => {
    mostrar()

    expect(screen.getByRole('link', { name: 'Ver seguimiento detallado' })).toHaveAttribute('href', '/solicitudes/EC-2026-0999')
  })

  it('"Volver al panel" avisa al contenedor', () => {
    const { onVolver } = mostrar()

    fireEvent.click(screen.getByRole('button', { name: 'Volver al panel' }))

    expect(onVolver).toHaveBeenCalledOnce()
  })
})
