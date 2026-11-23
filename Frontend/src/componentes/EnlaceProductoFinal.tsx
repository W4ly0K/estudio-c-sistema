import { EnlaceExternoSeguro } from './EnlaceExternoSeguro'

export const TEXTO_PRODUCTO_FINAL = 'Producto final'
export const TEXTO_ENLACE_NO_DISPONIBLE = 'El enlace registrado no es válido. Comunícate con el Estudio C.'

/**
 * Fase 8 · requisito 4: el enlace del producto final, abierto de forma segura. Desde la Fase 9
 * (R9-1, D2) la regla de apertura vive en EnlaceExternoSeguro, compartida con el anexo; esta
 * envoltura conserva los textos y la marca de la Fase 8 (sus pruebas no cambian).
 */
export function EnlaceProductoFinal({ enlace, radicado }: { enlace: string; radicado: string }) {
  return (
    <EnlaceExternoSeguro
      enlace={enlace}
      radicado={radicado}
      texto="Abrir el producto final"
      textoNoDisponible={TEXTO_ENLACE_NO_DISPONIBLE}
      marca="producto-final"
    />
  )
}
