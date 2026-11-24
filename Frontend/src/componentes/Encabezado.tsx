import type { MouseEvent } from 'react'
import { NavLink } from 'react-router'
import type { UsuarioSesion } from '../api/esquemas'
import logoEstudioC from '../assets/logo-estudio-c-horizontal.png'
import { ETIQUETAS_ROL } from '../presentacion/etiquetas'
import { DESCRIPTOR_SISTEMA, JERARQUIA_INSTITUCIONAL } from '../presentacion/identidad'
import { navegacionDelRol } from '../presentacion/navegacion'

interface EncabezadoProps {
  usuario: UsuarioSesion
  onLogout: () => void
}

/** Destino de «Saltar al contenido»: el `<main>` de PantallaConSesion. */
export const ID_CONTENIDO = 'contenido'

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
 *
 * Fase 9 · R9-3 · V1-A (ADR-010 §2.8): dos niveles.
 * - «Saltar al contenido» es el primer elemento enfocable; lleva el foco al `<main>` por código
 *   (sin cambiar la URL ni depender del router).
 * - Nivel 1: franja en Azul 2 con la pertenencia en texto (Universidad CESMAG · CIDU · Estudio C).
 *   No hay escudo ni marcador que lo simule (preguntas 14 y 15). La franja es el primer elemento
 *   del mismo contenedor flexible y ocupa su propia línea de borde a borde (ancho más el relleno,
 *   sin encogerse): el orden C8 de lo que sigue (marca → navegación → nombre → Salir) no cambia.
 * - Nivel 2: el logo de Estudio C, el nombre del sistema, la navegación y el usuario. El título de
 *   la página ya no se repite aquí: es el `h1` de CabeceraPagina (V1-B). El rol se
 *   muestra en palabras y sin el rojo de error (D-R3-4).
 */
export function Encabezado({ usuario, onLogout }: EncabezadoProps) {
  const saltarAlContenido = (evento: MouseEvent<HTMLAnchorElement>) => {
    evento.preventDefault()
    document.getElementById(ID_CONTENIDO)?.focus()
  }
  return (
    <header className="relative w-full bg-surface border-b border-borde-suave px-4 pb-3 sm:px-8 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-x-6 md:sticky md:top-0 z-50 shadow-xs">
      <a
        href={`#${ID_CONTENIDO}`}
        onClick={saltarAlContenido}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[60] focus:rounded-sm focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary"
      >
        Saltar al contenido
      </a>
      <div data-parte="identidad" className="-mx-4 sm:-mx-8 md:shrink-0 md:basis-[calc(100%_+_4rem)] bg-primary px-4 py-2 sm:px-8 text-surface">
        <p className="text-sm font-bold tracking-wide break-words">
          {JERARQUIA_INSTITUCIONAL.map((parte, i) => (
            <span key={parte}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              {parte}
            </span>
          ))}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <div data-parte="marca" className="flex min-w-0 items-center gap-4">
          <img src={logoEstudioC} alt="Logo Estudio C" className="h-10 w-auto shrink-0" />
          <p className="min-w-0 border-l border-borde-suave pl-4 font-bold text-primary tracking-wide">{DESCRIPTOR_SISTEMA}</p>
        </div>
        <nav aria-label="Navegación principal" className="md:border-l md:border-borde-suave md:pl-4">
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
                        : 'text-texto-secundario hover:text-primary hover:underline'
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
          <p className="text-xs text-texto-secundario">
            Rol: <span className="font-bold text-texto-principal">{ETIQUETAS_ROL[usuario.rol]}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className={`${AREA_TACTIL} shrink-0 px-4 border border-borde-control rounded-sm text-sm font-medium hover:bg-superficie-suave text-primary transition-colors`}
        >
          Salir
        </button>
      </div>
    </header>
  )
}
