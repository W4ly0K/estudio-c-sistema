/**
 * Mensajes del backend que cambian el COMPORTAMIENTO de la UI (Decisión DC5).
 * El resto de los mensajes se muestra tal cual, sin compararlos. contrato.test.ts
 * verifica que este texto sea idéntico al del backend.
 */

/**
 * Primera regla de CA-04 (README §9). Es la única que el cliente valida (Fase 6.3 · DH4):
 * con el mismo texto, el usuario lee lo mismo venga el aviso del cliente o del servidor.
 */
export const MENSAJE_FIN_NO_POSTERIOR = 'Error CA-04: La hora de finalización debe ser posterior a la hora de inicio.'

/** 409 del compare-and-set (README §10, fila 8): la UI recarga en lugar de culpar al usuario. */
export const MENSAJE_CAMBIO_CONCURRENTE =
  'La solicitud fue modificada por otra operación mientras se procesaba este cambio. Recargue y vuelva a intentarlo.';
