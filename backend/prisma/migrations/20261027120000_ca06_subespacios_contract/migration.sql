-- Fase 7 - Paso 7A.8.2 - Contract de los sub-espacios
-- (ADR-007 secc. 2.6, 2.10 y 6; PRD v2.2 secc. 5.5). Cierra el expand de la migracion
-- 20261023120000_ca06_subespacios.
-- Requisito verificado antes de aplicar en produccion: precheck-7a8.sql con los 11
-- bloqueantes en su valor esperado (expand aplicado con su checksum, DEFAULT temporal
-- presente, M4 inexistente, propuestas coherentes y ningun lugar sin propuesta).
--
-- Por que es seguro con el codigo vigente (develop despues del PR #10):
--   - Ningun escritor depende del DEFAULT: create() escribe sub_espacio siempre de forma
--     explicita (7A.4; desde 7B.4, con subEspacioAlRadicar()).
--   - Ningun escritor viola M4: T5 escribe sub_espacio_propuesto junto con la franja
--     propuesta (7A.5), y T7 y T8 limpian los dos campos juntos.
--   El codigo ANTERIOR a la Fase 7 (por ejemplo, la rama main) ya no puede escribir en esta
--   base: sus inserciones fallarian por el NOT NULL sin DEFAULT. No se levanta contra ella.
--
-- Reversion (solo si fuera necesario, y siempre como migracion NUEVA). Los valores
-- poblados en el paso 1 se conservan: son correctos.
--   ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_propuesta_subespacio_check";
--   ALTER TABLE "Solicitud" ALTER COLUMN "sub_espacio" SET DEFAULT 'ESTUDIO_COMPLETO';

-- Prisma no envuelve la migracion en una transaccion: el DDL de PostgreSQL si es
-- transaccional, asi que se aplica todo o nada.
BEGIN;

-- 1. Poblado de las propuestas anteriores a la Fase 7: solo cambiaban la hora, asi que su
--    lugar es el de su reserva. Se COPIA el valor de cada fila (no un literal). La condicion
--    es exactamente la de M4 (franja propuesta presente, lugar ausente): el paso 2 no puede
--    fallar por una diferencia entre los dos criterios. No cambia el estado: no genera log
--    (CA-09), igual que el backfill SE8.
UPDATE "Solicitud"
SET "sub_espacio_propuesto" = "sub_espacio"
WHERE "fecha_propuesta_inicio" IS NOT NULL
  AND "sub_espacio_propuesto" IS NULL;

-- 2. M4 (K9 ampliado al motor, ADR-007 SE6): hay lugar propuesto si y solo si hay franja
--    propuesta. Junto con M1 (Solicitud_propuesta_completa_check) y M2
--    (Solicitud_propuesta_segun_estado_check), la propuesta es completa (franja Y lugar) si y
--    solo si la solicitud esta en "Pendiente de Reprogramacion".
ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_propuesta_subespacio_check"
  CHECK ((fecha_propuesta_inicio IS NULL) = (sub_espacio_propuesto IS NULL));

-- 3. SE1, estado final: sin valor por defecto. Olvidar el sub-espacio pasa a ser un error
--    del motor (23502), no un valor silencioso. El NOT NULL del expand se conserva.
ALTER TABLE "Solicitud" ALTER COLUMN "sub_espacio" DROP DEFAULT;

COMMIT;
