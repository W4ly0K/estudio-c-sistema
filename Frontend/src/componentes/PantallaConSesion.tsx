import type { ReactNode } from 'react'
import type { UsuarioSesion } from '../api/esquemas'
import { Encabezado, ID_CONTENIDO } from './Encabezado'
import { PieInstitucional } from './PieInstitucional'

interface PantallaConSesionProps {
  usuario: UsuarioSesion
  onLogout: () => void
  /** Clases del `<main>` (ancho máximo y espaciado de cada pantalla). */
  claseContenido: string
  children: ReactNode
}

/**
 * Fase 9 · R9-3 · V1-A (ADR-010 §2.8): composición común de las pantallas con sesión. Un solo
 * lugar para el encabezado institucional, el contenido principal (destino de «Saltar al
 * contenido») y el pie. El `<main>` admite el foco por código (`tabIndex={-1}`) y no muestra el
 * anillo: el foco llega desde el enlace de salto, no desde el recorrido con Tab.
 */
export function PantallaConSesion({ usuario, onLogout, claseContenido, children }: PantallaConSesionProps) {
  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Encabezado usuario={usuario} onLogout={onLogout} />
      <main id={ID_CONTENIDO} tabIndex={-1} className={`outline-none ${claseContenido}`}>
        {children}
      </main>
      <PieInstitucional />
    </div>
  )
}
