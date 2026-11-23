-- Fase 6.1b - Motivo de la reprogramacion (CA-10, K7 de ADR-005) en el log de auditoria.
-- El motivo vive en el log de T5 (Decision DB1): el log es inmutable, asi que el motivo
-- sobrevive a T7 y T8 y la linea de vida del solicitante conserva la historia.
-- Requisito verificado antes de aplicar: precheck-6.1b.sql con logs_t5_violarian_r1 = 0.
-- Reversion manual (solo si fuera necesario, y siempre como migracion NUEVA):
--   ALTER TABLE "Log_Auditoria" DROP CONSTRAINT "Log_Auditoria_motivo_reprogramacion_segun_estado_check";
--   ALTER TABLE "Log_Auditoria" DROP CONSTRAINT "Log_Auditoria_motivo_reprogramacion_longitud_check";
--   ALTER TABLE "Log_Auditoria" DROP COLUMN "motivo_reprogramacion";

-- Prisma no envuelve la migracion en una transaccion: el DDL de PostgreSQL si es
-- transaccional, asi que se crean la columna y las dos restricciones o nada.
BEGIN;

ALTER TABLE "Log_Auditoria" ADD COLUMN "motivo_reprogramacion" TEXT;

-- R2. Un motivo real: entre 10 y 500 caracteres sin contar los espacios de los
--     extremos. char_length cuenta caracteres, no bytes (un emoji vale 1); el DTO
--     cuenta igual. Sin motivo la expresion da NULL y el CHECK la acepta: ese caso
--     es de R1. Va antes que R1 a proposito: si R1 falla, la reversion debe
--     deshacer tambien la columna y R2 (ensayo de atomicidad).
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_motivo_reprogramacion_longitud_check"
  CHECK (char_length(btrim(motivo_reprogramacion)) BETWEEN 10 AND 500);

-- R1. Hay motivo si y solo si el log registra la llegada a Pendiente de
--     Reprogramacion (destino de T5, la propuesta del Staff). estado_nuevo es
--     NOT NULL e IS NOT NULL nunca da NULL: la comparacion siempre es TRUE o FALSE.
--     El literal lo vigila la prueba I-20.
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_motivo_reprogramacion_segun_estado_check"
  CHECK ((motivo_reprogramacion IS NOT NULL) = (estado_nuevo = 'Pendiente de Reprogramación'));

COMMIT;
