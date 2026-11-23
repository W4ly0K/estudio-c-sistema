-- Fase 4.4b - CA-06 garantizado por el motor (ADR-004, en preparacion).
-- Requisitos verificados en 4.0 y repetidos antes de aplicar: sin traslapes
-- activos (C5) ni fechas invertidas (C4).
-- Reversion manual (solo si fuera necesario, y siempre como migracion NUEVA):
--   ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_sin_traslape_ca06";
--   ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_fechas_validas_check";

-- Prisma no envuelve la migracion en una transaccion: el DDL de PostgreSQL si
-- es transaccional, asi que se crean las dos restricciones o ninguna.
BEGIN;

-- 1. Fechas coherentes. Va primero: rechaza fin <= inicio con 23514 antes de
--    que tsrange() falle con "range lower bound must be less than or equal...".
ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_fechas_validas_check"
  CHECK (fecha_fin > fecha_inicio);

-- 2. CA-06: ninguna pareja de solicitudes activas puede traslaparse.
--    '[)' = intervalo semiabierto, igual que CA-04 (Decision L): 10:00-11:00 y
--    11:00-12:00 no chocan. tsrange porque las columnas son timestamp(3) sin
--    zona (UTC). El nombre es el que reconoce esViolacionDeTraslapeCa06 (4.3).
ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_sin_traslape_ca06"
  EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&)
  WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario'));

COMMIT;
