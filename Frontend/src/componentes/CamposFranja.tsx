import { useId } from 'react'
import { hoyEnBogota } from '../fechas/bogota'
import { TEXTO_BLOQUES_ATENCION, type ValoresFranja } from '../presentacion/franja'

interface CamposFranjaProps {
  valores: ValoresFranja
  onCambio: (valores: ValoresFranja) => void
  /** El "ahora" para el mínimo del calendario (DH3): las pruebas fijan el reloj. */
  ahora: Date
}

/**
 * Los campos de la franja (fecha, hora de inicio y de fin) con el aviso de bloques de
 * atención. Componente controlado: el estado y la validación son de quien lo usa
 * (franjaDesdeCampos). Extraído de B2 en la 6.5.4a con el mismo marcado y las mismas
 * etiquetas, que son las que buscan las pruebas.
 */
export function CamposFranja({ valores, onCambio, ahora }: CamposFranjaProps) {
  const id = useId()
  const ids = { fecha: `${id}-fecha`, horaInicio: `${id}-hora-inicio`, horaFin: `${id}-hora-fin` }

  return (
    <>
      <div>
        <label htmlFor={ids.fecha} className="block text-gray-600 mb-1">Fecha</label>
        <input
          id={ids.fecha}
          type="date"
          required
          min={hoyEnBogota(ahora)} // DH3 · F2c: hoy en Bogotá, no en UTC
          className="w-full border border-outline rounded-sm p-2 text-primary"
          value={valores.fecha}
          onChange={(e) => onCambio({ ...valores, fecha: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={ids.horaInicio} className="block text-gray-600 mb-1">Hora de inicio</label>
          <input
            id={ids.horaInicio}
            type="time"
            required
            className="w-full border border-outline rounded-sm p-2 text-primary"
            value={valores.horaInicio}
            onChange={(e) => onCambio({ ...valores, horaInicio: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={ids.horaFin} className="block text-gray-600 mb-1">Hora de finalización</label>
          <input
            id={ids.horaFin}
            type="time"
            required
            className="w-full border border-outline rounded-sm p-2 text-primary"
            value={valores.horaFin}
            onChange={(e) => onCambio({ ...valores, horaFin: e.target.value })}
          />
        </div>
      </div>

      <p className="text-xs text-gray-500">{TEXTO_BLOQUES_ATENCION}</p>
    </>
  )
}
