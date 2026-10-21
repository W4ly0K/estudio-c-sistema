import type { Rol } from '../api/maquina-estados'
import { RUTA_INICIO, RUTA_MIS_SOLICITUDES, RUTA_TABLERO } from '../rutas'

/**
 * Navegación principal por rol (Fase 7 · C6). Función pura: el encabezado solo pinta.
 * Cada rol ve SOLO sus pantallas: nunca un enlace que SoloRol (C2) le devolvería a "/".
 * `switch` exhaustivo: un rol nuevo no compila hasta tener su navegación (como DE2).
 */
export interface EnlaceNavegacion {
  readonly ruta: string
  readonly texto: string
}

export function navegacionDelRol(rol: Rol): readonly EnlaceNavegacion[] {
  switch (rol) {
    case 'STAFF':
      return [
        { ruta: RUTA_INICIO, texto: 'Inicio' },
        { ruta: RUTA_TABLERO, texto: 'Tablero' },
      ]
    case 'SOLICITANTE':
      return [
        { ruta: RUTA_INICIO, texto: 'Inicio' },
        { ruta: RUTA_MIS_SOLICITUDES, texto: 'Mis solicitudes' },
      ]
    default: {
      const imposible: never = rol
      return imposible
    }
  }
}
