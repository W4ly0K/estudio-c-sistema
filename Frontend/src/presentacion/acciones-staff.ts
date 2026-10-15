import { TRANSICIONES, type Estado } from '../api/maquina-estados'
import type { TextosAccion } from './acciones-solicitante'

/**
 * Acciones del Staff en el detalle C3 (paso 6.5.3 · DA1). Se DERIVAN de la tabla de la
 * máquina, como las del solicitante. Solo las que viajan por el PATCH del tablero (E1):
 * T5 tiene su propia ruta y su formulario de franja (6.5.4). Mostrar un botón no
 * autoriza nada: el servidor vuelve a decidir con el token.
 */
type TransicionStaff = Extract<(typeof TRANSICIONES)[number], { rol: 'STAFF' }>
export type TransicionDelTableroStaff = Exclude<TransicionStaff, { accion: 'PROPONER_REPROGRAMACION' }>
export type AccionDelStaff = TransicionDelTableroStaff['accion']
export type DestinoDelStaff = TransicionDelTableroStaff['destino']

export function accionesDelStaff(estado: Estado): readonly TransicionDelTableroStaff[] {
  return TRANSICIONES.filter(
    (t): t is TransicionDelTableroStaff =>
      t.rol === 'STAFF' && t.accion !== 'PROPONER_REPROGRAMACION' && t.origen === estado,
  )
}

/**
 * Textos honestos: dicen lo que hará el servidor y nada más. El sistema no envía
 * notificaciones, así que ningún texto promete "se le avisará": el solicitante lo verá
 * en su panel.
 */
export function textosDelStaff(accion: AccionDelStaff, radicado: string, franja: string): TextosAccion {
  switch (accion) {
    case 'APROBAR':
      return {
        boton: 'Validar',
        titulo: 'Validar la solicitud',
        descripcion: `El radicado ${radicado} pasa a "Validado" y su franja (${franja}) queda confirmada. El solicitante verá el cambio en su panel.`,
        confirmar: 'Sí, validar',
        irreversible: false,
      }
    case 'RECHAZAR':
      return {
        boton: 'Rechazar',
        titulo: 'Rechazar la solicitud',
        descripcion: `El radicado ${radicado} pasa a "Rechazado", un estado final: no se puede deshacer. Su franja (${franja}) queda libre y el solicitante verá el motivo en su historial.`,
        confirmar: 'Sí, rechazar',
        irreversible: true,
      }
    case 'INICIAR_PRODUCCION':
      return {
        boton: 'Iniciar producción',
        titulo: 'Iniciar la producción',
        descripcion: `El radicado ${radicado} pasa a "En Producción". Desde ese momento el solicitante ya no puede cancelarla en línea.`,
        confirmar: 'Sí, iniciar la producción',
        irreversible: false,
      }
    case 'FINALIZAR':
      return {
        boton: 'Marcar como entregada',
        titulo: 'Marcar como entregada',
        descripcion: `El radicado ${radicado} pasa a "Entregado", un estado final: no admite más cambios.`,
        confirmar: 'Sí, marcar como entregada',
        irreversible: true,
      }
    default: {
      const imposible: never = accion
      return imposible
    }
  }
}

/** Aviso tras el éxito (DA2): lo escribe el cliente con el destino, que es lo que se aplicó. */
export function textoExito(destino: DestinoDelStaff): string {
  return `La solicitud pasó a "${destino}".`
}

/**
 * DA4 · Zero Trust temporal: el servidor no valida una franja que ya inició (D7, 409). El
 * cliente lo ADVIERTE sin bloquear: su reloj puede estar desfasado del servidor, y quien
 * decide es el servidor.
 */
export const TEXTO_FRANJA_INICIADA =
  'La franja ya inició: el servidor no permite validarla. Si no se va a atender, puedes rechazarla con un motivo.'

/** Igual que el servidor: un inicio igual a "ahora" ya cuenta como iniciado. Una fecha ilegible no advierte. */
export function franjaYaInicio(inicioIso: string, ahora: Date): boolean {
  const inicio = Date.parse(inicioIso)
  return !Number.isNaN(inicio) && inicio <= ahora.getTime()
}
