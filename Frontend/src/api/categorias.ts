import type { Categoria } from './esquemas'
import type { IdTransicion } from './maquina-estados'

/**
 * Copia, SOLO PARA LA VISTA, de backend/src/solicitudes/reglas/categorias.ts (Fase 8 ·
 * requisito 3). La vista la usa para no ofrecer un paso que el servidor rechazaría; la
 * legalidad la decide el servidor. contrato.test.ts compara esta copia con la del backend.
 */
export const PASA_POR_EDICION: Readonly<Record<Categoria, boolean>> = {
  PODCAST: true,
  VIDEO: true,
  ESPACIOS: false,
  STREAMING: false,
  ASESORIAS: false,
}

/** Fase 8 · requisito 4: la entrega exige el enlace del producto final (enlaceAlEntregar). */
export const REQUIERE_ENLACE: Readonly<Record<Categoria, boolean>> = {
  PODCAST: true,
  VIDEO: true,
  ESPACIOS: false,
  STREAMING: true,
  ASESORIAS: false,
}

export const TRANSICIONES_SIN_EDICION: readonly IdTransicion[] = ['T9']
export const TRANSICIONES_CON_EDICION: readonly IdTransicion[] = ['T11', 'T12']

/** La máquina dice si el paso existe; la categoría, si le aplica (igual que en el backend). */
export function transicionAplicaALaCategoria(id: IdTransicion, categoria: Categoria): boolean {
  const pasaPorEdicion = PASA_POR_EDICION[categoria]
  if (TRANSICIONES_CON_EDICION.includes(id)) return pasaPorEdicion
  if (TRANSICIONES_SIN_EDICION.includes(id)) return !pasaPorEdicion
  return true
}
