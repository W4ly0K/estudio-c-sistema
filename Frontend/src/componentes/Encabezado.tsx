import { NavLink } from 'react-router'
import type { UsuarioSesion } from '../api/esquemas'
import logoEstudioC from '../assets/Logo_Estudio_C_3-01.png'
import { navegacionDelRol } from '../presentacion/navegacion'

interface EncabezadoProps {
  usuario: UsuarioSesion
  onLogout: () => void
  titulo: string
}

/**
 * Encabezado institucional de las pantallas con sesión.
 * Fase 7 · C6: navegación principal por rol. `NavLink` marca la pantalla vigente con
 * `aria-current="page"` (el lector de pantalla dice "página actual"); `end` evita que "Inicio"
 * quede marcado en "/tablero". En el detalle de un radicado ningún enlace es la página actual.
 * La vigente se distingue por la forma (subrayado grueso), no solo por el color.
 */
export function Encabezado({ usuario, onLogout, titulo }: EncabezadoProps) {
  return (
    <header className="w-full bg-surface border-b border-outline px-8 py-3 flex justify-between items-center sticky top-0 z-50 shadow-xs">
      <div className="flex items-center gap-4">
        <img src={logoEstudioC} alt="Logo Estudio C" className="h-8" />
        <span className="font-bold text-primary border-l border-outline pl-4 tracking-wide">{titulo}</span>
        <nav aria-label="Navegación principal" className="border-l border-outline pl-4">
          <ul className="flex items-center gap-4 text-sm">
            {navegacionDelRol(usuario.rol).map((enlace) => (
              <li key={enlace.ruta}>
                <NavLink
                  to={enlace.ruta}
                  end
                  className={({ isActive }) =>
                    isActive
                      ? 'font-bold text-primary underline decoration-2 underline-offset-4'
                      : 'text-gray-600 hover:text-primary hover:underline'
                  }
                >
                  {enlace.texto}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="flex items-center gap-5">
        <div className="text-right">
          <p className="text-sm font-bold text-primary">{usuario.nombre}</p>
          <p className="text-xs text-gray-500">
            Rol: <span className="font-semibold text-accent">{usuario.rol}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="px-4 py-1.5 border border-outline rounded-sm text-sm font-medium hover:bg-gray-50 text-primary transition-colors"
        >
          Salir
        </button>
      </div>
    </header>
  )
}
