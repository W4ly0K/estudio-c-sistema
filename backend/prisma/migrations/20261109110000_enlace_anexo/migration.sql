-- Fase 9 · R9-1 y ADR-012 · Anexo del solicitante y auditoría de enlaces (migración consolidada).
--
-- Reemplaza la versión original de esta misma migración (checksum 9840a71e…, nunca aplicada en
-- producción: P0, precheck 9.1.0b, 2026-11-11). Fuentes: ADR-009 (§2.2 y §2.7) y ADR-012 (§2.2 y §2.3).
--
-- Todo es aditivo y va en una sola transacción: si cualquier sentencia falla, no queda nada.
-- No se actualiza, borra ni reconstruye ningún dato (DT-3): las filas existentes quedan en NULL en
-- las columnas nuevas, y todas las restricciones se validan sobre ellas tal como están.
--
-- A. Solicitud
--   1. enlace_anexo TEXT NULL (sin DEFAULT): el solicitante lo escribe al radicar y lo cambia o retira
--      en «Recibido» (lo controla el servicio, ADR-009 AN10 a AN12).
--   2. Formato: la MISMA regla de Solicitud_enlace_entrega_formato_check (https:// sin espacios y hasta
--      2048 caracteres). Un NULL deja la condición en UNKNOWN y el CHECK no lo rechaza: por eso no lleva
--      "IS NULL OR". El DTO (EnlaceSeguro) es más estricto (ADR-009 FU2; H0).
--      El límite debe coincidir con ENLACE_MAXIMO: enlace-seguro.decorator.spec.ts lee este archivo.
--   3. Categoría (pregunta 5, AN2b): solo PODCAST, VIDEO y STREAMING. Sin restricción por estado: el
--      anexo se conserva cuando la solicitud avanza.
--
-- B. Log_Auditoria (ADR-012): eventos de enlace que no son transiciones.
--   4. Enum "CampoEnlace" y cuatro columnas que admiten NULL: los 47 logs históricos medidos en P0 (y los
--      que existan al migrar) quedan con las cuatro en NULL, sin tocarlos.
--   5. B1 a B9. Un CHECK solo rechaza FALSE; cada comentario indica qué pasa con NULL.
--      B7 se crea VALIDADA: P0 midió 0 logs con estado_anterior = estado_nuevo (fila 30). El precheck
--      inmediato al despliegue lo vuelve a medir; si apareciera alguno, esta transacción falla completa y
--      no cambia nada (se decide D3 de nuevo, sin corregir registros).
--
-- Fuera de esta migración (las garantiza el servicio, lotes I y J): la propiedad del solicitante, el
-- enlace previo obligatorio para corregir una entrega (D2), el valor anterior observado (D9) y la
-- precondición de T1 (ADR-005 E7). Tampoco hay triggers ni cambios de privilegios (D5).
-- No toca enlace_entrega, fechas, propuestas, CA-06 (las dos exclusiones) ni la máquina T1 a T12.
--
-- Recuperación (documentada; NO se ejecuta y requiere aprobación): DROP de las 11 restricciones nuevas,
-- de las 5 columnas y del tipo "CampoEnlace". Solo es posible sin pérdida mientras no existan anexos ni
-- eventos de enlace registrados; después se corrige hacia adelante con una migración nueva.

BEGIN;

-- A1. Columna del anexo.
ALTER TABLE "Solicitud" ADD COLUMN "enlace_anexo" TEXT;

-- A2. Formato. NULL: UNKNOWN, se acepta (anexo opcional).
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_enlace_anexo_formato_check"
  CHECK (enlace_anexo ~ '^https://[^[:space:]]+$' AND char_length(enlace_anexo) <= 2048);

-- A3. Categoría. categoria es NOT NULL: la expresión siempre da TRUE o FALSE.
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_enlace_anexo_segun_categoria_check"
  CHECK (enlace_anexo IS NULL OR categoria IN ('PODCAST', 'VIDEO', 'STREAMING'));

-- B. Tipo y columnas del evento de enlace.
CREATE TYPE "CampoEnlace" AS ENUM ('ANEXO', 'ENTREGA');

ALTER TABLE "Log_Auditoria" ADD COLUMN "enlace_campo" "CampoEnlace";
ALTER TABLE "Log_Auditoria" ADD COLUMN "enlace_anterior" TEXT;
ALTER TABLE "Log_Auditoria" ADD COLUMN "enlace_nuevo" TEXT;
ALTER TABLE "Log_Auditoria" ADD COLUMN "motivo_correccion" TEXT;

-- B1. Sin tipo de enlace no hay valores de enlace. Solo usa IS [NOT] NULL: nunca da NULL.
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_enlace_completo_check"
  CHECK (enlace_campo IS NOT NULL OR (enlace_anterior IS NULL AND enlace_nuevo IS NULL));

-- B2. Un evento de enlace es un cambio real. IS DISTINCT FROM nunca da NULL: NULL → NULL se rechaza,
--     NULL → x, x → y y x → NULL se aceptan.
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_enlace_cambio_real_check"
  CHECK (enlace_campo IS NULL OR enlace_anterior IS DISTINCT FROM enlace_nuevo);

-- B3. Un evento de enlace no cambia de estado. Los dos estados son NOT NULL: nunca da NULL.
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_enlace_sin_transicion_check"
  CHECK (enlace_campo IS NULL OR estado_anterior = estado_nuevo);

-- B4. ANEXO solo en Recibido; ENTREGA solo en Entregado y con enlace nuevo (no se retira). Con
--     enlace_campo no nulo, cada comparación da TRUE o FALSE (estado_nuevo es NOT NULL).
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_enlace_segun_estado_check"
  CHECK (enlace_campo IS NULL
         OR (enlace_campo = 'ANEXO' AND estado_nuevo = 'Recibido')
         OR (enlace_campo = 'ENTREGA' AND estado_nuevo = 'Entregado' AND enlace_nuevo IS NOT NULL));

-- B5. Forma del enlace anterior: la misma de A2. NULL: UNKNOWN, se acepta (no había enlace).
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_enlace_anterior_formato_check"
  CHECK (enlace_anterior ~ '^https://[^[:space:]]+$' AND char_length(enlace_anterior) <= 2048);

-- B6. Forma del enlace nuevo. NULL: UNKNOWN, se acepta (retiro del anexo, D1; B4 lo prohíbe en ENTREGA).
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_enlace_nuevo_formato_check"
  CHECK (enlace_nuevo ~ '^https://[^[:space:]]+$' AND char_length(enlace_nuevo) <= 2048);

-- B7. Un log con el mismo estado tiene que ser un evento de enlace. Nunca da NULL. Validada (P0: 0).
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_transicion_o_enlace_check"
  CHECK (estado_anterior <> estado_nuevo OR enlace_campo IS NOT NULL);

-- B8. El motivo solo existe en eventos ENTREGA. IS NOT DISTINCT FROM nunca da NULL: con
--     enlace_campo = 'ENTREGA', un enlace_campo nulo daría NULL y dejaría pasar un motivo en una transición.
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_motivo_correccion_segun_evento_check"
  CHECK (motivo_correccion IS NULL OR enlace_campo IS NOT DISTINCT FROM 'ENTREGA');

-- B9. Longitud del motivo, de 10 a 500 caracteres reales sin los espacios de los extremos (como
--     motivo_rechazo). El DTO lo guarda ya recortado. NULL: UNKNOWN, se acepta (motivo opcional, D8).
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_motivo_correccion_longitud_check"
  CHECK (char_length(btrim(motivo_correccion)) BETWEEN 10 AND 500);

COMMIT;
