-- Fase 9 · R9-1 · Anexo opcional del solicitante (guion por enlace; ADR-009).
--
-- Una columna nueva y un CHECK, en una transacción:
--   1. enlace_anexo TEXT NULL: el solicitante la escribe al radicar; es opcional.
--   2. Formato, validado al crearse (la columna nace vacía: ninguna fila puede incumplirlo):
--      la MISMA regla de Solicitud_enlace_entrega_formato_check: https:// sin espacios y hasta
--      2048 caracteres. Un NULL deja la condición en UNKNOWN y el CHECK no lo rechaza: por eso
--      no lleva "IS NULL OR". El DTO (EnlaceSeguro) repite la regla y es más estricto.
-- Sin restricción por estado: el anexo acompaña a la solicitud en todo su ciclo. Sin restricción
-- por categoría mientras el Responsable no lo decida (pregunta 5 del cuestionario de la Fase 9).
-- El límite debe coincidir con ENLACE_MAXIMO: enlace-seguro.decorator.spec.ts lee este archivo.
--
-- Reversión (documentada, NO se ejecuta): DROP CONSTRAINT y DROP COLUMN. Borra los anexos
-- registrados: solo antes de que existan.

BEGIN;

ALTER TABLE "Solicitud" ADD COLUMN "enlace_anexo" TEXT;

ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_enlace_anexo_formato_check"
  CHECK (enlace_anexo ~ '^https://[^[:space:]]+$' AND char_length(enlace_anexo) <= 2048);

COMMIT;
