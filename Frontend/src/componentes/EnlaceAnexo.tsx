import { EnlaceExternoSeguro } from './EnlaceExternoSeguro'

export const TEXTO_ANEXO = 'Anexo (guion)'
export const TEXTO_ANEXO_NO_DISPONIBLE = 'El enlace del anexo registrado no es válido.'

/**
 * Fase 9 · R9-1: el anexo que adjuntó el solicitante, abierto de forma segura. Lo ven el dueño y
 * el Staff; la regla de apertura es la misma del producto final (EnlaceExternoSeguro).
 */
export function EnlaceAnexo({ enlace, radicado }: { enlace: string; radicado: string }) {
  return (
    <EnlaceExternoSeguro
      enlace={enlace}
      radicado={radicado}
      texto="Abrir el anexo"
      textoNoDisponible={TEXTO_ANEXO_NO_DISPONIBLE}
      marca="anexo"
    />
  )
}
