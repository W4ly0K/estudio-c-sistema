/** Rutas de la vista (DV1). Un solo lugar: los enlaces y el `<Routes>` no pueden divergir. */
export const RUTA_PANEL = '/'
export const RUTA_DETALLE = '/solicitudes/:radicado'

/** El radicado va codificado: un "/" o un "?" no pueden cambiar la ruta (igual que en la api). */
export function rutaDetalle(radicado: string): string {
  return `/solicitudes/${encodeURIComponent(radicado)}`
}
