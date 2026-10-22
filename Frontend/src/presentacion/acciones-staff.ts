import { TRANSICIONES, type Estado } from '../api/maquina-estados'
import type { TextosAccion } from './acciones-solicitante'
import { franjaCompleta, type ValoresFranja } from './franja'
import { MENSAJE_NO_ATENDIDA } from './linea-de-vida'
import { LIMITES_MOTIVO_RECHAZO, LIMITES_MOTIVO_REPROGRAMACION, evaluarMotivo, razonMotivoInvalido } from './motivo'

/**
 * Acciones del Staff en el detalle C3 (6.5.3 · DA1 y 6.5.4 · DR2). Se DERIVAN de la tabla
 * de la máquina, como las del solicitante. Dos canales: T1, T2, T4, T9 y T10 viajan por el
 * PATCH del tablero (E1); T5 tiene su propia ruta, con franja y motivo. Mostrar un botón
 * no autoriza nada: el servidor vuelve a decidir con el token.
 */
export type TransicionStaff = Extract<(typeof TRANSICIONES)[number], { rol: 'STAFF' }>
export type TransicionDelTableroStaff = Exclude<TransicionStaff, { accion: 'PROPONER_REPROGRAMACION' }>
export type AccionDelStaff = TransicionStaff['accion']
export type DestinoDelStaff = TransicionStaff['destino']
/** Los destinos del canal PATCH: deben ser exactamente los que acepta CambiosTablero. */
export type DestinoDelTableroStaff = TransicionDelTableroStaff['destino']

export function accionesDelStaff(estado: Estado): readonly TransicionStaff[] {
  return TRANSICIONES.filter((t): t is TransicionStaff => t.rol === 'STAFF' && t.origen === estado)
}

/**
 * Fase 7 · T10: lo que la sección "Resolución" OFRECE. Igual que accionesDelStaff, salvo que
 * "Cerrar como no atendida" solo aparece con la franja ya iniciada según el reloj del cliente:
 * con la franja por delante el servidor siempre la rechaza (409), así que ofrecerla sería
 * invitar a un error. Si el reloj del cliente difiere del servidor, decide el servidor.
 */
export function accionesVisiblesDelStaff(estado: Estado, inicioIso: string, ahora: Date): readonly TransicionStaff[] {
  return accionesDelStaff(estado).filter(
    (t) => t.accion !== 'CERRAR_NO_ATENDIDA' || franjaYaInicio(inicioIso, ahora),
  )
}

/** El canal de la transición: todas por el PATCH del tablero, salvo T5 (DR2). */
export function porElTablero(transicion: TransicionStaff): transicion is TransicionDelTableroStaff {
  return transicion.accion !== 'PROPONER_REPROGRAMACION'
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
    case 'CERRAR_NO_ATENDIDA':
      // Fase 7 · T10: en este paso la franja todavía no se libera (llega con la migración
      // 7A.3), y como ya pasó no estorba a nadie: el texto no promete que "queda libre".
      return {
        boton: 'Cerrar como no atendida',
        titulo: 'Cerrar como no atendida',
        descripcion: `El radicado ${radicado} pasa a "No atendida", un estado final: no se puede deshacer. Su franja (${franja}) ya inició sin que la solicitud se atendiera. El solicitante verá en su historial: "${MENSAJE_NO_ATENDIDA}"`,
        confirmar: 'Sí, cerrar como no atendida',
        irreversible: true,
      }
    case 'PROPONER_REPROGRAMACION':
      // README §12.2 y ADR-005 §3: la franja oficial sigue ocupada, la propuesta no se
      // reserva, no existe una transición para retirarla (el "retiro de la propuesta" de
      // ADR-005 §3 sigue pendiente; desde la Fase 7 el id T10 es "No atendida") y
      // rechazarla (T8) cancela la solicitud.
      return {
        boton: 'Proponer reprogramación',
        titulo: 'Proponer una reprogramación',
        descripcion: `El radicado ${radicado} pasa a "Pendiente de Reprogramación" hasta que el solicitante responda: si acepta, pasa a la franja propuesta; si la rechaza, la solicitud se cancela. Mientras tanto conserva su franja actual (${franja}). La propuesta no reserva la nueva franja (si otra solicitud la ocupa antes, aceptarla fallará) y no se puede retirar.`,
        confirmar: 'Sí, enviar la propuesta',
        irreversible: true,
      }
    default: {
      const imposible: never = accion
      return imposible
    }
  }
}

/** Fase 7 · B3: T5 sin franja completa. Va antes que el motivo: es el orden del formulario. */
export const TEXTO_RAZON_FRANJA_INCOMPLETA = 'Para confirmar, elige la fecha y las dos horas de la nueva franja.'

/**
 * Fase 7 · B3: por qué "Confirmar" sigue bloqueado para esta acción, o `undefined` si nada lo
 * bloquea. Es la ÚNICA regla local de confirmación del Staff: AccionesStaff deriva
 * `puedeConfirmar` de aquí, así que la regla y su explicación no pueden divergir. Solo cubre
 * lo que la vista sabe sin el servidor (DR5): días hábiles, bloques y CA-06 los decide él.
 */
export function razonBloqueoDelStaff(accion: AccionDelStaff, motivo: string, franja: ValoresFranja): string | undefined {
  switch (accion) {
    case 'RECHAZAR':
      return razonMotivoInvalido(evaluarMotivo(motivo, LIMITES_MOTIVO_RECHAZO), LIMITES_MOTIVO_RECHAZO)
    case 'PROPONER_REPROGRAMACION':
      if (!franjaCompleta(franja)) return TEXTO_RAZON_FRANJA_INCOMPLETA
      return razonMotivoInvalido(evaluarMotivo(motivo, LIMITES_MOTIVO_REPROGRAMACION), LIMITES_MOTIVO_REPROGRAMACION)
    case 'APROBAR':
    case 'INICIAR_PRODUCCION':
    case 'FINALIZAR':
    case 'CERRAR_NO_ATENDIDA':
      return undefined
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
  'La franja ya inició: el servidor no permite validarla. Si no se va a atender, puedes cerrarla como "No atendida" o rechazarla con un motivo.'

/** Igual que el servidor: un inicio igual a "ahora" ya cuenta como iniciado. Una fecha ilegible no advierte. */
export function franjaYaInicio(inicioIso: string, ahora: Date): boolean {
  const inicio = Date.parse(inicioIso)
  return !Number.isNaN(inicio) && inicio <= ahora.getTime()
}
