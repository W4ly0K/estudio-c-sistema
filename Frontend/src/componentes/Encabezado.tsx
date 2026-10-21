import { NavLink } from 'react-router'
import type { UsuarioSesion } from '../api/esquemas'
import logoEstudioC from '../assets/Logo_Estudio_C_3-01.png'
import { navegacionDelRol } from '../presentacion/navegacion'

interface EncabezadoProps {
  usuario: UsuarioSesion
  onLogout: () => void
  titulo: string
}

/** Área táctil de 44 px (WCAG 2.5.5) para cada control del encabezado. */
const AREA_TACTIL = 'inline-flex min-h-11 items-center'

/**
 * Encabezado institucional de las pantallas con sesión.
 *
 * Fase 7 · C6: navegación principal por rol. `NavLink` marca la pantalla vigente con
 * `aria-current="page"` (el lector de pantalla dice "página actual"); `end` evita que "Inicio"
 * quede marcado en "/tablero". En el detalle de un radicado ningún enlace es la página actual.
 * La vigente se distingue por la forma (subrayado grueso), no solo por el color.
 *
 * Fase 7 · C8: mobile-first. La auditoría a 320 px mostró que una sola fila sin `flex-wrap`
 * se desbordaba (el nombre largo se montaba sobre la navegación y "Salir" quedaba fuera de la
 * pantalla). Ahora:
 * - En móvil, tres filas apiladas: marca, navegación y usuario. En escritorio (`md`), una fila
 *   que puede partirse (`md:flex-wrap`): entre `md` y `lg` el bloque del usuario baja a la
 *   derecha en lugar de desbordar.
 * - El orden del DOM es el orden visual en todos los anchos (sin `order-*` de CSS): el
 *   recorrido con Tab coincide con lo que se ve (WCAG 1.3.2 y 2.4.3).
 * - El nombre envuelve (`min-w-0` + `break-words`) y nunca se trunca: cortarlo esconde datos.
 * - Fijo (`sticky`) solo desde `md`: en móvil se desplaza con la página y no tapa el contenido.
 *   El `scroll-padding-top` de `index.css` evita que el foco quede bajo el encabezado fijo.
 */
export function Encabezado({ usuario, onLogout, titulo }: EncabezadoProps) {
  return (
    <header className="w-full bg-surface border-b border-outline px-4 py-3 sm:px-8 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-x-6 md:sticky md:top-0 z-50 shadow-xs">
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <div data-parte="marca" className="flex min-w-0 items-center gap-4">
          <img src={logoEstudioC} alt="Logo Estudio C" className="h-8 shrink-0" />
          <span className="font-bold text-primary border-l border-outline pl-4 tracking-wide">{titulo}</span>
        </div>
        <nav aria-label="Navegación principal" className="md:border-l md:border-outline md:pl-4">
          <ul className="flex flex-wrap items-center gap-2 text-sm">
            {navegacionDelRol(usuario.rol).map((enlace) => (
              <li key={enlace.ruta}>
                <NavLink
                  to={enlace.ruta}
                  end
                  className={({ isActive }) =>
                    `${AREA_TACTIL} px-2 rounded-sm ${
                      isActive
                        ? 'font-bold text-primary underline decoration-2 underline-offset-4'
                        : 'text-gray-600 hover:text-primary hover:underline'
                    }`
                  }
                >
                  {enlace.texto}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div data-parte="usuario" className="flex min-w-0 items-center justify-between gap-4 md:ml-auto md:justify-end">
        <div className="min-w-0 md:max-w-xs md:text-right">
          <p className="text-sm font-bold text-primary break-words">{usuario.nombre}</p>
          <p className="text-xs text-gray-500">
            Rol: <span className="font-semibold text-accent">{usuario.rol}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className={`${AREA_TACTIL} shrink-0 px-4 border border-outline rounded-sm text-sm font-medium hover:bg-gray-50 text-primary transition-colors`}
        >
          Salir
        </button>
      </div>
    </header>
  )
}
