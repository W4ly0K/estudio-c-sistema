-- Fase 5.5b - Invariante K9 de la reprogramacion (CA-10) garantizado por el motor
-- (ADR-005, en preparacion). K9: existe propuesta si y solo si la solicitud esta en
-- Pendiente de Reprogramacion, y toda propuesta esta completa y bien formada.
-- Requisito verificado antes de aplicar: precheck-5.5b.sql con 0 filas en M1, M2 y M3.
-- Reversion manual (solo si fuera necesario, y siempre como migracion NUEVA):
--   ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_propuesta_fechas_validas_check";
--   ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_propuesta_segun_estado_check";
--   ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_propuesta_completa_check";

-- Prisma no envuelve la migracion en una transaccion: el DDL de PostgreSQL si es
-- transaccional, asi que se crean las tres restricciones o ninguna.
BEGIN;

-- M1. Las dos fechas de la propuesta existen juntas o no existe ninguna.
ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_propuesta_completa_check"
  CHECK ((fecha_propuesta_inicio IS NULL) = (fecha_propuesta_fin IS NULL));

-- M2. Hay propuesta si y solo si el estado es Pendiente de Reprogramacion (destino
--     de T5). M1 garantiza la otra fecha. estado es NOT NULL e IS NOT NULL nunca da
--     NULL: la comparacion siempre es TRUE o FALSE. El literal lo vigila la prueba I-12.
ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_propuesta_segun_estado_check"
  CHECK ((estado = 'Pendiente de Reprogramación') = (fecha_propuesta_inicio IS NOT NULL));

-- M3. La propuesta tiene la misma forma que la franja oficial (fin > inicio). Sin
--     propuesta la expresion da NULL y el CHECK la acepta: ese caso es de M1 y M2.
ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_propuesta_fechas_validas_check"
  CHECK (fecha_propuesta_fin > fecha_propuesta_inicio);

COMMIT;
