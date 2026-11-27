import { useId } from 'react'

export const TEXTO_ETIQUETA_ENLACE = 'Enlace del producto final (lo verá el solicitante)'
export const TEXTO_AYUDA_ENLACE =
  'Pega el enlace https:// donde está el producto final (por ejemplo, YouTube, Drive o el repositorio institucional). El solicitante lo abrirá en una pestaña nueva.'

interface CampoEnlaceProps {
  /** Fase 9 · R9-1 (D2): el campo sirve a la entrega y al anexo; cada uso trae sus textos. */
  etiqueta: string
  ayuda: string
  valor: string
  onCambio: (valor: string) => void
  /** Hay texto y no sirve: se marca, sin repetir la razón (la dice el diálogo, junto a "Confirmar"). */
  invalido: boolean
  /** Mientras viaja la petición: se puede leer, no editar. */
  soloLectura: boolean
}

/**
 * Fase 8 · requisito 4: el enlace del producto final al entregar (T9 o T12) en las categorías
 * que lo exigen; desde la Fase 9 (R9-1), también el anexo opcional al radicar. `type="url"` da el
 * teclado adecuado en el móvil; la regla real es esEnlaceSeguro, la misma con la que se pinta.
 */
export function CampoEnlace({ etiqueta, ayuda, valor, onCambio, invalido, soloLectura }: CampoEnlaceProps) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block font-semibold text-primary">
        {etiqueta}
      </label>
      <p id={idAyuda} className="text-xs text-gray-600 mb-1">
        {ayuda}
      </p>
      <input
        id={id}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="https://"
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        readOnly={soloLectura}
        aria-describedby={idAyuda}
        aria-invalid={invalido || undefined}
        className={`w-full p-2 rounded-sm text-sm ${invalido ? 'border-2 border-dashed border-primary' : 'border border-outline'}`}
      />
    </div>
  )
}
