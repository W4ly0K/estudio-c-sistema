import { useId } from 'react'
import { evaluarMotivo, textoContador, type LimitesMotivo } from '../presentacion/motivo'

interface CampoMotivoProps {
  etiqueta: string
  ayuda: string
  valor: string
  onCambio: (valor: string) => void
  limites: LimitesMotivo
  /** Mientras viaja la petición: se puede leer, no editar. */
  soloLectura: boolean
}

/**
 * Motivo escrito por el Staff (T2 y, en la 6.5.4, T5). Reutilizable: los límites llegan
 * por props y se miden como el backend (DA3). SIN `maxLength`: cuenta unidades UTF-16 y
 * cortaría los emojis a la mitad; el exceso se muestra y bloquea la confirmación.
 * El contador no usa aria-live (anunciaría cada tecla): se lee al enfocar el campo,
 * porque está en su aria-describedby.
 */
export function CampoMotivo({ etiqueta, ayuda, valor, onCambio, limites, soloLectura }: CampoMotivoProps) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idContador = `${id}-contador`
  const evaluacion = evaluarMotivo(valor, limites)
  const excede = evaluacion.estado === 'largo'

  return (
    <div className="mt-4">
      <label htmlFor={id} className="block font-semibold text-primary">
        {etiqueta}
      </label>
      <p id={idAyuda} className="text-xs text-gray-600 mb-1">
        {ayuda}
      </p>
      <textarea
        id={id}
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        readOnly={soloLectura}
        rows={4}
        aria-describedby={`${idAyuda} ${idContador}`}
        aria-invalid={excede || undefined}
        className={`w-full p-2 rounded-sm text-sm ${excede ? 'border-2 border-dashed border-primary' : 'border border-outline'}`}
      />
      <p
        id={idContador}
        data-estado={evaluacion.estado}
        className={`text-xs ${evaluacion.valido ? 'text-gray-600' : 'font-bold text-primary'}`}
      >
        {textoContador(evaluacion, limites)}
      </p>
    </div>
  )
}
