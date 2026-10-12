/**
 * Mensajes del backend que cambian el COMPORTAMIENTO de la UI (Decisión DC5).
 * El resto de los mensajes se muestra tal cual, sin compararlos. contrato.test.ts
 * verifica que este texto sea idéntico al del backend.
 */

/** 409 del compare-and-set (README §10, fila 8): la UI recarga en lugar de culpar al usuario. */
export const MENSAJE_CAMBIO_CONCURRENTE =
  'La solicitud fue modificada por otra operación mientras se procesaba este cambio. Recargue y vuelva a intentarlo.';
