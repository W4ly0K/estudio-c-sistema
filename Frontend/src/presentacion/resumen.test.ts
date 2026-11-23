import { describe, expect, it } from 'vitest'
import type { Estado } from '../api/maquina-estados'
import { resumirSolicitudes, textoPorDecidir, textoResumen } from './resumen'

const con = (...estados: Estado[]) => estados.map((estado) => ({ estado }))

describe('resumen del panel (B1)', () => {
  it('cuenta como cerradas las de estado final y como activas el resto', () => {
    const resumen = resumirSolicitudes(
      con('Recibido', 'En Producción', 'Pendiente de Reprogramación', 'Entregado', 'Rechazado', 'Cancelado por el Usuario'),
    )

    expect(resumen).toEqual({ activas: 3, cerradas: 3, porDecidir: 1 })
  })

  it('lista vacía: todo en cero', () => {
    expect(resumirSolicitudes([])).toEqual({ activas: 0, cerradas: 0, porDecidir: 0 })
  })

  it('singular y plural', () => {
    expect(textoResumen({ activas: 1, cerradas: 1, porDecidir: 0 })).toBe('Tienes 1 solicitud activa y 1 cerrada.')
    expect(textoResumen({ activas: 2, cerradas: 0, porDecidir: 0 })).toBe('Tienes 2 solicitudes activas y 0 cerradas.')
  })

  it('el aviso de decisiones pendientes solo existe si hay alguna', () => {
    expect(textoPorDecidir({ activas: 1, cerradas: 0, porDecidir: 0 })).toBeNull()
    expect(textoPorDecidir({ activas: 1, cerradas: 0, porDecidir: 1 })).toMatch(/^1 solicitud espera/)
    expect(textoPorDecidir({ activas: 2, cerradas: 0, porDecidir: 2 })).toMatch(/^2 solicitudes esperan/)
  })
})
