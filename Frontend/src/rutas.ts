/** Rutas de la vista (DV1). Un solo lugar: los enlaces y el `<Routes>` no pueden divergir. */

/**
 * Fase 7 · C1: una constante por PANTALLA, no por URL. Hoy "/", "/tablero" y
 * "/mis-solicitudes" muestran lo mismo (la vista del rol); separarlas ahora permite que "/"
 * pase a ser el inicio por rol (C6) sin que "Volver al tablero" ni "Volver al panel"
 * cambien de destino.
 */
export const RUTA_INICIO = '/'
export const RUTA_TABLERO = '/tablero'
export const RUTA_MIS_SOLICITUDES = '/mis-solicitudes'
export const RUTA_DETALLE = '/solicitudes/:radicado'

/** El radicado va codificado: un "/" o un "?" no pueden cambiar la ruta (igual que en la api). */
export function rutaDetalle(radicado: string): string {
  return `/solicitudes/${encodeURIComponent(radicado)}`
}
