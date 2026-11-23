-- Fase 6.5b - Motivo del RECHAZO (T2, DE1) en el log de auditoria.
-- La columna Log_Auditoria.motivo_rechazo existe desde 0_init (TEXT, admite NULL); esta
-- migracion solo le agrega las dos reglas que hasta hoy vivian unicamente en el codigo
-- (DTO + E5), con el mismo molde que el motivo de la reprogramacion (20261009200000).
-- Requisito verificado antes de aplicar: precheck-6.5b.sql con todos los contadores
-- bloqueantes en 0 (rechazos sin motivo, motivos fuera de T2, cortos, largos).
-- Reversion manual (solo si fuera necesario, y siempre como migracion NUEVA):
--   ALTER TABLE "Log_Auditoria" DROP CONSTRAINT "Log_Auditoria_motivo_rechazo_segun_estado_check";
--   ALTER TABLE "Log_Auditoria" DROP CONSTRAINT "Log_Auditoria_motivo_rechazo_longitud_check";

-- Prisma no envuelve la migracion en una transaccion: el DDL de PostgreSQL si es
-- transaccional, asi que se crean las dos restricciones o ninguna.
BEGIN;

-- R2. Un motivo real: entre 10 y 500 caracteres sin contar los espacios de los
--     extremos. char_length cuenta caracteres, no bytes (un emoji vale 1); el DTO
--     cuenta igual (longitudReal). btrim sin segundo argumento solo quita espacios:
--     el DTO ya guarda el texto recortado con String.trim(), asi que por la API ambas
--     medidas coinciden (asimetria documentada en ADR-005). Sin motivo la expresion da
--     NULL y el CHECK la acepta: ese caso es de R1. Va antes que R1 a proposito: si R1
--     falla, la reversion debe deshacer tambien R2 (ensayo de atomicidad).
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_motivo_rechazo_longitud_check"
  CHECK (char_length(btrim(motivo_rechazo)) BETWEEN 10 AND 500);

-- R1. Hay motivo si y solo si el log registra la llegada a Rechazado (destino de T2,
--     el rechazo del Staff). Es E5 llevado a la base: ningun log guarda un motivo de
--     rechazo huerfano ni un rechazo sin motivo. estado_nuevo es NOT NULL e IS NOT NULL
--     nunca da NULL: la comparacion siempre es TRUE o FALSE. El literal lo vigila la
--     prueba de alineacion de integracion.
ALTER TABLE "Log_Auditoria"
  ADD CONSTRAINT "Log_Auditoria_motivo_rechazo_segun_estado_check"
  CHECK ((motivo_rechazo IS NOT NULL) = (estado_nuevo = 'Rechazado'));

COMMIT;
