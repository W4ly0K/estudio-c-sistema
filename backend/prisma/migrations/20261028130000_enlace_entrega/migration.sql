-- Fase 8 · Paso 8.6 · Enlace del producto final (directriz del tutor, requisito 4; ADR-008).
--
-- Una columna nueva y cuatro CHECK, todo en una transacción:
--   1. enlace_entrega TEXT NULL.
--   2. Validados al crearse (la columna nace vacía: ninguna fila puede incumplirlos):
--      - solo en "Entregado";
--      - solo en las categorías con producto en línea (PODCAST, VIDEO y STREAMING);
--      - formato mínimo: https:// sin espacios y hasta 2048 caracteres. El DTO repite la
--        misma condición (@Matches) para que nunca llegue aquí y termine en un 500.
--   3. NOT VALID (DT-3): un "Entregado" de esas categorías exige enlace. Rige para toda fila
--      nueva o modificada; NO revisa las entregas anteriores a la Fase 8 (el precheck 8.0 midió
--      una: un PODCAST). Esas filas son finales y su categoría no cambia (8.4), así que nada
--      vuelve a escribirlas.
-- Las categorías y el límite deben coincidir con categorias.ts y con ENLACE_ENTREGA_MAXIMO:
-- categorias.spec.ts lee este archivo.
--
-- Reversión (documentada, NO se ejecuta): DROP de las cuatro restricciones y de la columna.
-- Borra los enlaces registrados: solo antes de que existan entregas con enlace.

BEGIN;

ALTER TABLE "Solicitud" ADD COLUMN "enlace_entrega" TEXT;

ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_enlace_entrega_segun_estado_check"
  CHECK (enlace_entrega IS NULL OR estado = 'Entregado');

ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_enlace_entrega_segun_categoria_check"
  CHECK (enlace_entrega IS NULL OR categoria IN ('PODCAST', 'VIDEO', 'STREAMING'));

ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_enlace_entrega_formato_check"
  CHECK (enlace_entrega ~ '^https://[^[:space:]]+$' AND char_length(enlace_entrega) <= 2048);

ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_entrega_con_enlace_check"
  CHECK (estado <> 'Entregado' OR categoria NOT IN ('PODCAST', 'VIDEO', 'STREAMING') OR enlace_entrega IS NOT NULL)
  NOT VALID;

COMMIT;
