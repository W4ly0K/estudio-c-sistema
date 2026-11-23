-- Fase 8 · Paso 8.5 · "Edición y postproducción" libera el sub-espacio en CA-06
-- (directriz del tutor, requisito 3; Opción A de H1, aprobada el 2026-10-28; ADR-008).
--
-- Recrea las DOS restricciones de exclusión por sub-espacio CON LOS MISMOS NOMBRES (el
-- detector de CA-06 no cambia). Cambia solo el WHERE:
--   1. 'Edición y postproducción' se suma a los estados que liberan la franja (T11).
--   2. 'Entregado' deja de ocupar en las categorías con edición (PODCAST y VIDEO): ya liberaron
--      la franja en T11, y T12 no debe volver a ocuparla (H1: si otra reserva tomó ese tiempo,
--      la entrega fallaría con 23P01 para siempre).
-- Debe coincidir con estados.ts y categorias.ts: estados.spec.ts lee este archivo.
--
-- El predicado nuevo solo QUITA filas de las restricciones (libera más, nunca ocupa más): si
-- hoy no hay traslapes, recrearlas no puede fallar por datos. Ningún dato cambia (DT-3).
-- Atómica: DROP y ADD en la misma transacción, sin ventana sin CA-06.
--
-- Reversión (documentada, NO se ejecuta): recrear las dos restricciones con el WHERE de
-- 20261023120000_ca06_subespacios. Solo es posible si ninguna fila quedó en el estado nuevo ni
-- hay traslapes entre las franjas que volverían a ocupar.

BEGIN;

ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_sin_traslape_ca06_cabina";
ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_sin_traslape_ca06_estudio";

ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_sin_traslape_ca06_cabina"
  EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&)
  WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario', 'No atendida', 'Edición y postproducción')
         AND NOT (estado = 'Entregado' AND categoria IN ('PODCAST', 'VIDEO'))
         AND sub_espacio IN ('CABINA_AUDIO', 'ESTUDIO_COMPLETO'));

ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_sin_traslape_ca06_estudio"
  EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&)
  WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario', 'No atendida', 'Edición y postproducción')
         AND NOT (estado = 'Entregado' AND categoria IN ('PODCAST', 'VIDEO'))
         AND sub_espacio IN ('ESTUDIO_GRABACION', 'ESTUDIO_COMPLETO'));

COMMIT;
