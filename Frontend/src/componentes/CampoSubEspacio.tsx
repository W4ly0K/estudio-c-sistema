import { useId } from 'react'
import { SUB_ESPACIOS, type SubEspacio } from '../api/esquemas'
import { AYUDAS_SUB_ESPACIO, ETIQUETAS_SUB_ESPACIO } from '../presentacion/etiquetas'

// Fast Refresh (react/only-export-components): este archivo exporta un componente y literales.
export const TEXTO_LEYENDA_SUB_ESPACIO = 'Sub-espacio'
export const TEXTO_ELIGE_SUB_ESPACIO = 'Elige el sub-espacio donde se hará la actividad.'
/**
 * Fase 7 · 7B.4 (ADR-007 SE10): en un servicio el solicitante no elige; se le dice qué pasa,
 * porque su tarjeta mostrará "Estudio C completo" sin que lo haya elegido.
 */
export const TEXTO_LUGAR_DE_SERVICIOS =
  'Para este servicio el Estudio C reserva el espacio completo; el Staff puede ajustarlo al validar.'

interface CampoSubEspacioProps {
  /** El nombre accesible del grupo: "Sub-espacio" en B2, "Sub-espacio propuesto" en T5. */
  leyenda: string
  /** `null`: nada elegido todavía (B2 no elige por el solicitante: Q-A4). */
  valor: SubEspacio | null
  onCambio: (valor: SubEspacio) => void
  /** Mientras la petición está en vuelo (como CampoMotivo): no se cambia lo que se envía. */
  soloLectura?: boolean
}

/**
 * Fase 7 · PRD v2.2 §5.1: el sub-espacio como un grupo de opciones con nombre accesible
 * (fieldset y legend, DV6). Opciones y no una lista desplegable: son solo tres y cada una
 * necesita su explicación (qué deja libre). Componente controlado, como CamposFranja.
 * `required` en las opciones: el navegador no envía el formulario sin una elegida.
 */
export function CampoSubEspacio({ leyenda, valor, onCambio, soloLectura = false }: CampoSubEspacioProps) {
  const id = useId()
  return (
    <fieldset>
      <legend className="block text-gray-600 mb-1">{leyenda}</legend>
      <div className="space-y-2">
        {SUB_ESPACIOS.map((opcion) => {
          const idOpcion = `${id}-${opcion}`
          const idAyuda = `${idOpcion}-ayuda`
          return (
            <div key={opcion} className="flex items-start gap-2">
              <input
                id={idOpcion}
                type="radio"
                name={`${id}-sub-espacio`}
                value={opcion}
                required
                checked={valor === opcion}
                disabled={soloLectura}
                aria-describedby={idAyuda}
                onChange={() => onCambio(opcion)}
                className="mt-1 size-4 shrink-0"
              />
              <div className="min-w-0">
                <label htmlFor={idOpcion} className="font-medium text-primary">
                  {ETIQUETAS_SUB_ESPACIO[opcion]}
                </label>
                <p id={idAyuda} className="text-xs text-gray-500">
                  {AYUDAS_SUB_ESPACIO[opcion]}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
