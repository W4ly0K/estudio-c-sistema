-- Fase 7 - Paso 7A.3 - Sub-espacios del Estudio C y estado "No atendida" en CA-06
-- (PRD v2.2 secc. 5.1 y 8; ADR-007 SE1, SE2, SE7, SE8, NA1 y MG1).
-- Requisito verificado antes de aplicar en produccion: precheck-7a.sql con
-- traslapes_activos = 0 y los demas contadores bloqueantes en su valor esperado.
--
-- Expand/contract (ADR-007, paso 7A.8):
--   - sub_espacio nace con DEFAULT 'ESTUDIO_COMPLETO' TEMPORAL: el codigo de hoy no
--     envia el sub-espacio y cada fila nueva se comporta exactamente como con la
--     restriccion global (el completo choca con todo). El DEFAULT se retira en el
--     contract, cuando la API ya exija el sub-espacio.
--   - sub_espacio_propuesto nace SIN su CHECK (M4): el servicio de hoy escribe
--     propuestas (T5) sin sub-espacio y M4 las rechazaria. M4 y su poblado van en el
--     contract, cuando T5/T7/T8 ya escriban la columna.
--
-- Reversion (solo si fuera necesario, y siempre como migracion NUEVA). Posible SOLO
-- mientras no existan reservas paralelas activas: con dos sub-espacios ocupados a la
-- vez, la restriccion global fallaria al crearse (y no dejaria nada a medias).
--   ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_sin_traslape_ca06_cabina";
--   ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_sin_traslape_ca06_estudio";
--   ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_sin_traslape_ca06"
--     EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&)
--     WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario', 'No atendida'));
--   (las columnas, el tipo y los CHECK del log se conservan: DT-3)

-- Prisma no envuelve la migracion en una transaccion: el DDL de PostgreSQL si es
-- transaccional, asi que se aplica todo o nada.
BEGIN;

-- 1. SE1. El sub-espacio como enum de tres valores. Los dos primeros son los
--    sub-espacios FISICOS (Q-A1); ESTUDIO_COMPLETO reserva los dos a la vez (Q-A2) y es
--    tambien el registro historico (Q-A7). Las etiquetas visibles viven en el frontend.
CREATE TYPE "SubEspacio" AS ENUM ('CABINA_AUDIO', 'ESTUDIO_GRABACION', 'ESTUDIO_COMPLETO');

-- 2. Columnas nuevas de Solicitud, creadas admitiendo NULL.
ALTER TABLE "Solicitud" ADD COLUMN "sub_espacio" "SubEspacio";
ALTER TABLE "Solicitud" ADD COLUMN "sub_espacio_propuesto" "SubEspacio";

-- 3. SE8. Backfill historico (Q-A7, D-3): todo lo existente se hizo cuando el Estudio
--    era un solo espacio, asi que ocupaba los dos. No cambia estado ni fechas: no
--    genera log (CA-09). Va como UPDATE explicito, no como efecto del DEFAULT, porque
--    es una decision de negocio y el DEFAULT es temporal.
UPDATE "Solicitud" SET "sub_espacio" = 'ESTUDIO_COMPLETO';

-- 4. NOT NULL: en un EXCLUDE, una fila con sub_espacio NULL no entraria en ningun
--    predicado y escaparia de CA-06 sin error. DEFAULT temporal: ver la cabecera.
ALTER TABLE "Solicitud"
  ALTER COLUMN "sub_espacio" SET DEFAULT 'ESTUDIO_COMPLETO',
  ALTER COLUMN "sub_espacio" SET NOT NULL;

-- 5. SE7 y P-1. Columnas de auditoria del log, todas admiten NULL: las filas
--    existentes quedan intactas (DT-3, ADR-005 secc. 1). Solo T1 (ajuste al aprobar) y
--    T7 (aceptar la reprogramacion) cambian el sub-espacio o la franja, y las dos
--    terminan en Validado.
ALTER TABLE "Log_Auditoria" ADD COLUMN "sub_espacio_anterior" "SubEspacio";
ALTER TABLE "Log_Auditoria" ADD COLUMN "sub_espacio_nuevo" "SubEspacio";
ALTER TABLE "Log_Auditoria" ADD COLUMN "fecha_inicio_anterior" TIMESTAMP(3);
ALTER TABLE "Log_Auditoria" ADD COLUMN "fecha_fin_anterior" TIMESTAMP(3);

-- A1. El par del sub-espacio va completo o no va.
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_sub_espacio_completo_check"
  CHECK ((sub_espacio_anterior IS NULL) = (sub_espacio_nuevo IS NULL));

-- A2. Si se registra un cambio, es un cambio real. Sin par la expresion da NULL y el
--     CHECK la acepta: ese caso es de A1.
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_sub_espacio_cambio_real_check"
  CHECK (sub_espacio_anterior <> sub_espacio_nuevo);

-- A3. Solo T1 y T7 cambian el sub-espacio: los dos terminan en Validado.
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_sub_espacio_segun_estado_check"
  CHECK (sub_espacio_nuevo IS NULL OR estado_nuevo = 'Validado');

-- F1. La franja anterior va completa o no va.
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_franja_anterior_completa_check"
  CHECK ((fecha_inicio_anterior IS NULL) = (fecha_fin_anterior IS NULL));

-- F2. La franja anterior era una franja valida (mismo criterio que
--     Solicitud_fechas_validas_check). Sin franja la expresion da NULL: caso de F1.
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_franja_anterior_valida_check"
  CHECK (fecha_fin_anterior > fecha_inicio_anterior);

-- F3. Solo T1 (rescate en Recibido, Q-B2) y T7 mueven la franja: terminan en Validado.
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_franja_anterior_segun_estado_check"
  CHECK (fecha_inicio_anterior IS NULL OR estado_nuevo = 'Validado');

-- 6. SE2 y NA1. CA-06 por sub-espacio FISICO: una restriccion por cada uno. El
--    completo entra en las dos y choca con cualquier reserva; cabina y estudio caen en
--    restricciones distintas y conviven. Sin btree_gist: cada restriccion compara solo
--    el rango; el sub-espacio va en el predicado parcial. 'No atendida' (T10) libera la
--    franja, igual que los otros dos finales que no se ejecutaron.
--    La nueva es MAS PERMISIVA que la global: con todo en ESTUDIO_COMPLETO, las dos ven
--    exactamente las filas que veia la global, asi que los datos existentes la cumplen.
--    Los nombres son los que reconoce esViolacionDeTraslapeCa06 desde 7A.1 (lista
--    cerrada). Solicitud_fechas_validas_check (Decision Z) no se toca.
ALTER TABLE "Solicitud" DROP CONSTRAINT "Solicitud_sin_traslape_ca06";

ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_sin_traslape_ca06_cabina"
  EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&)
  WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario', 'No atendida')
         AND sub_espacio IN ('CABINA_AUDIO', 'ESTUDIO_COMPLETO'));

ALTER TABLE "Solicitud"
  ADD CONSTRAINT "Solicitud_sin_traslape_ca06_estudio"
  EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&)
  WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario', 'No atendida')
         AND sub_espacio IN ('ESTUDIO_GRABACION', 'ESTUDIO_COMPLETO'));

COMMIT;
