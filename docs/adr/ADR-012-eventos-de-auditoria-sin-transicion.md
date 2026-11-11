# ADR-012 — Eventos de auditoría que no son transiciones de estado

| Campo | Valor |
|---|---|
| **Estado** | 📝 **Propuesto** · sin implementar. Diseño revisado el 2026-11-10; falta la aprobación arquitectónica definitiva |
| **Fecha** | 2026-11-10 |
| **Autoría** | Pendiente de confirmación |
| **Aprobación** | Pendiente de confirmación |
| **Rama** | `feat/fase-9-anexo-solicitante` (desde `develop` @ `6c35493`) |
| **Complementa a** | [ADR-002](ADR-002-autorizacion-a-nivel-de-dato.md) (propiedad en el `WHERE`, 404 uniforme y proyecciones por rol) · [ADR-005](ADR-005-maquina-de-estados-ca10.md) (`Log_Auditoria`, *compare-and-set* y precondición E7 de T1) · [ADR-008](ADR-008-edicion-postproduccion-y-enlace-de-entrega.md) (corrección del enlace de entrega, §2.7) · [ADR-009](ADR-009-anexo-del-solicitante-y-fuente-unica-del-enlace.md) (edición y retiro del anexo, §2.7) |
| **Dependencias futuras** | ADR-011 (borrador, notificaciones por correo, R9-2) · R9-4 (tablero de estadísticas, sin diseño) |
| **Relacionado con** | Cuestionario de la Fase 9 firmado por el Responsable del Estudio C el 2026-11-10 (preguntas 3, 4 y 24) · decisiones D1 a D10 del 2026-11-10 |

---

## 1. Contexto

### 1.1 Lo que pidió el Estudio C (cuestionario firmado)

- **Pregunta 3:** el solicitante puede agregar o cambiar el anexo, solo mientras la solicitud está en «Recibido».
- **Pregunta 4:** cada cambio del anexo queda registrado: quién, cuándo y cuál era el enlace anterior.
- **Pregunta 24:** el Staff corrige desde el sistema un enlace del producto final mal registrado, y la corrección queda en el registro de auditoría.

### 1.2 Lo que ya existe en el código (`7b19090`)

- `Log_Auditoria` registra solo transiciones T1 a T12. Que los dos estados sean distintos lo garantiza el código (ADR-005 E2: pedir el estado actual no deja log; los comandos responden `MISMO_ESTADO`); **ninguna restricción del motor lo exige**.
- Toda escritura sobre una solicitud existente pasa por `escribirConCompareAndSet()`: una transacción interactiva con el `updateMany` con *compare-and-set*, el log y la relectura (ADR-005 §2.3).
- La línea de vida del frontend (`presentacion/linea-de-vida.ts`) toma la fecha de cada paso del último log cuyo `estado_nuevo` es ese paso.
- **Conservación del log:** la aplicación no actualiza ni borra registros (no hay `update`, `delete` ni `upsert` sobre `log_Auditoria`; `remove()` lanza `NotImplementedException`; la FK es `ON DELETE RESTRICT`). **PostgreSQL no lo impide:** no hay trigger, `RULE` ni restricción de privilegios sobre la tabla.

### 1.3 El problema

Los cambios de las preguntas 3, 4 y 24 no son transiciones: el estado no cambia. Si se registran como si lo fueran, la línea de vida mueve sus fechas y, más adelante, los correos de R9-2 y las métricas de R9-4 contarían eventos que no existieron.

---

## 2. Decisiones (propuestas)

### 2.1 EV1 · Tres tipos de evento en la misma tabla

| Campo | Transición T1 a T12 | Cambio del anexo | Corrección del enlace de entrega |
|---|---|---|---|
| `estado_anterior` y `estado_nuevo` | Distintos | `Recibido` y `Recibido` | `Entregado` y `Entregado` |
| `enlace_campo` | NULL | `ANEXO` | `ENTREGA` |
| `enlace_anterior` | Prohibido | Opcional (NULL = no había anexo) | No nulo, **por el servicio** (D2) |
| `enlace_nuevo` | Prohibido | Opcional (NULL = retirado, D1) | Obligatorio |
| Anterior ≠ nuevo | — | Obligatorio | Obligatorio |
| `motivo_correccion` | Prohibido | Prohibido | Opcional (D8); validado si existe |
| `motivo_rechazo` y `motivo_reprogramacion` | Según ADR-005 | Prohibidos | Prohibidos |
| Sub-espacio y franja anteriores | Según ADR-007 | Prohibidos | Prohibidos |

Los tres llevan `radicado_solicitud`, `modificado_por` (de la identidad autenticada, nunca del cuerpo) y `fecha_modificacion` (`now()` de la transacción).

**Alternativa descartada:** una tabla `Historial_Enlace` aparte. Duplicaba el autor, la fecha y la FK, y partía en dos la evidencia de una misma solicitud.

### 2.2 EV2 · Columnas nuevas

| Columna | Tipo | NULL |
|---|---|---|
| `enlace_campo` | enum `CampoEnlace` (`ANEXO`, `ENTREGA`) | Sí |
| `enlace_anterior` | `TEXT` | Sí |
| `enlace_nuevo` | `TEXT` | Sí |
| `motivo_correccion` | `TEXT` | Sí |

Migración aditiva, sin *backfill* y sin tocar registros existentes (DT-3): los logs históricos quedan con las cuatro columnas en NULL. Va en la misma migración que el anexo (`20261109110000_enlace_anexo`), que se reescribe antes de aplicarse (ADR-009 §2.6).

### 2.3 EV3 · Restricciones del motor

Recordatorio: un `CHECK` solo rechaza cuando la expresión da FALSE; si da NULL, pasa.

| Id | Qué protege | Predicado (conceptual) | Estado |
|---|---|---|---|
| B1 | Sin tipo de enlace no hay valores de enlace | `enlace_campo IS NOT NULL OR (enlace_anterior IS NULL AND enlace_nuevo IS NULL)` | Propuesto |
| B2 | Un evento de enlace es un cambio real | `enlace_campo IS NULL OR enlace_anterior IS DISTINCT FROM enlace_nuevo` | Propuesto |
| B3 | Un evento de enlace no cambia de estado | `enlace_campo IS NULL OR estado_anterior = estado_nuevo` | Propuesto |
| B4 | ANEXO solo en `Recibido`; ENTREGA solo en `Entregado` y con valor nuevo | `enlace_campo IS NULL OR (ANEXO y Recibido) OR (ENTREGA y Entregado y enlace_nuevo IS NOT NULL)` | Propuesto |
| B5 y B6 | Forma de `enlace_anterior` y `enlace_nuevo` | `col ~ '^https://[^[:space:]]+$' AND char_length(col) <= 2048` (NULL pasa) | Propuesto |
| B7 | Un log con el mismo estado tiene que ser un evento de enlace | `estado_anterior <> estado_nuevo OR enlace_campo IS NOT NULL` | **Pendiente de P0 (D3)** |
| B8 | El motivo solo existe en eventos ENTREGA | `motivo_correccion IS NULL OR enlace_campo IS NOT DISTINCT FROM 'ENTREGA'` | Propuesto |
| B9 | Longitud del motivo, cuando existe | `char_length(btrim(motivo_correccion)) BETWEEN 10 AND 500` (NULL pasa) | Propuesto |

- **B7:** no se sabe todavía si hay logs históricos con el mismo estado; no se supone. Si P0 mide 0, B7 se crea validada (opción preferida). Si mide más, las alternativas son `NOT VALID` (rige solo para filas nuevas) u omitirla. En ningún caso se corrigen registros.
- **B8 se escribe con `IS NOT DISTINCT FROM`:** con `enlace_campo = 'ENTREGA'`, un `enlace_campo` nulo daría NULL y el `CHECK` dejaría pasar un motivo dentro de una transición.
- **B9:** el DTO guarda el motivo ya recortado con `trim()`, así que `btrim` no lo cambia y la longitud que mide el motor es la que validó el DTO. Es la misma asimetría que `motivo_rechazo` (ADR-005 §2.10).
- **B5 y B6 no son equivalentes a `EnlaceSeguro`.** El DTO es más estricto: `MaxLength` cuenta unidades UTF-16 (nunca menos que los puntos de código de `char_length`), `IsUrl` exige dominio de primer nivel y prohíbe usuario y contraseña, y `Matches` usa `\S` de JavaScript. Lo que se mantiene es la regla de ADR-009 FU2: **el DTO nunca acepta un valor que el `CHECK` rechace**. Lo contrario sí pasa, a propósito (`https://localhost`, `https://u:p@x.com`). Que `\S` sea al menos tan estricto como `[^[:space:]]` depende del `LC_CTYPE` de la base: **no está demostrado** para producción y se verifica en P0 y en las pruebas de integración (§6).
- **No es una restricción del motor:** que una entrega tenga un enlace previo para poder corregirla (D2), ni que toda corrección tenga motivo (D8).

### 2.4 EV4 · Qué garantiza el motor y qué el servicio

| Garantía | Quién la da |
|---|---|
| Coherencia interna de cada log (B1 a B9) | Motor |
| Forma y categoría del enlace en `Solicitud` (ADR-008 y ADR-009) | Motor |
| Que existan el autor y el radicado | Motor (FK) |
| Propiedad (solicitante) o rol (Staff) | Guardias y servicio |
| Estado al escribir, valor anterior observado (D9) y precondición de T1 (D4-B′, ADR-005 E7) | Servicio, con *compare-and-set* |
| Que el log diga exactamente qué cambió en la solicitud | Servicio, en la misma transacción |
| Que no se agregue por primera vez un enlace de entrega (D2) | **Solo el servicio**; lo cubren pruebas |
| Que el motivo solo llegue en una corrección de entrega | API (solo `CorregirEnlaceEntregaDto` lo declara), tipo (EV6) y motor (B8) |
| Que los logs no se modifiquen ni se borren | La aplicación; **PostgreSQL no** (D5, §4) |

### 2.5 EV5 · Atomicidad, autorización y concurrencia

- **Atomicidad:** cada cambio efectivo y su log se confirman en la misma transacción de `escribirConCompareAndSet()`. Si algo falla, se revierten los dos.
- **Autorización:**
  - el anexo es del SOLICITANTE: la propiedad va en el `WHERE` y una solicitud ajena o inexistente recibe el mismo 404 (ADR-002);
  - la corrección del enlace de entrega es del STAFF;
  - el actor sale del JWT.
- **Concurrencia (D9):** el cliente envía el valor anterior que vio. Si no es el vigente, 409 sin escritura ni log. El valor observado también va en `esperado`: si cambia entre la lectura y la escritura, el *compare-and-set* pierde y responde 409. Límite conocido: si el valor vuelve al mismo que el cliente vio (ABA), la regla se cumple.
- **Sin cambios (D10):** si el valor pedido ya es el vigente, 200 con `sin_cambios: true`, sin escritura ni log. Antes se comprueban autenticación, rol, forma del cuerpo, propiedad y categoría. No es una modificación y no prueba que una petición anterior se haya confirmado; tampoco es idempotencia completa (se garantiza el efecto, no la respuesta original). Ante una respuesta incierta, el frontend vuelve a consultar el detalle.
- CA-06 (las exclusiones por sub-espacio) y DT-1 (inventario suspendido) no cambian: ninguno de estos eventos escribe estado, franja, sub-espacio ni recursos.

### 2.6 EV6 · Tipado

`OperacionCompareAndSet` pasa de un log genérico a una unión discriminada `evento: TRANSICION | ENLACE`. Así TypeScript impide mezclar campos de un tipo con los del otro (por ejemplo, un motivo de corrección en una transición).

### 2.7 EV7 · Consumidores

| Consumidor | Situación | Qué cambia |
|---|---|---|
| Línea de vida (`linea-de-vida.ts`) | **Implementado; hay que adaptarlo** | Solo usa transiciones; las fechas de recepción y entrega no se mueven |
| Proyección del solicitante | Implementada; hay que adaptarla | `logs` con `where: { enlace_campo: null }`: el solicitante ve su anexo vigente, no el historial (D7, ADR-002) |
| Detalle del Staff | Implementado; hay que ampliarlo | «Historial de enlaces» aparte, con el motivo cuando exista |
| ADR-011 · correos | **Dependencia futura** (borrador) | Encolar solo `evento.tipo === 'TRANSICION'` |
| R9-4 · métricas | **Dependencia futura** (sin diseño) | Excluir los eventos de enlace (por ejemplo, del tiempo de primera respuesta, pregunta 21) |

---

## 3. Relación con otros ADR

- **ADR-002:** se mantienen la propiedad dentro del `WHERE`, el 404 uniforme y las proyecciones como listas blancas.
- **ADR-005:** `Log_Auditoria` deja de ser «una fila, una transición». Las reglas de E2 y `MISMO_ESTADO` siguen rigiendo las transiciones, y la máquina T1 a T12 no cambia. La precondición de T1 está en su E7.
- **ADR-008:** el evento ENTREGA es el mecanismo de la corrección del enlace (§2.7, DA-4).
- **ADR-009:** el evento ANEXO es el mecanismo de la edición y el retiro del anexo (§2.7).
- **ADR-011 (borrador):** usará el discriminante de EV6 para decidir qué se encola.

---

## 4. Fuera de alcance

- **D5 · Inmutabilidad impuesta por PostgreSQL:** un trigger o una restricción de privilegios que impida modificar o borrar logs. Es deuda de seguridad independiente y necesita su propio ADR.
- **D2 · Agregar por primera vez un enlace a una entrega histórica que nunca lo tuvo.**

---

## 5. Riesgos conocidos

- Quien acceda directamente a la base puede modificar o borrar logs (D5).
- Que el log coincida con la solicitud, y la regla de D2, dependen del servicio, no del motor.
- El valor anterior observado y `anexo_revisado` son afirmaciones del cliente: protegen contra vistas desactualizadas, no contra un cliente manipulado.
- Un enlace igual no garantiza que el archivo externo tenga el mismo contenido.
- El motivo es texto libre: podría contener datos personales si el Staff los escribe. La interfaz debe advertirlo.
- B7 y la equivalencia de las clases de espacio (B5 y B6) dependen de P0.

---

## 6. Pruebas pendientes (nada ejecutado)

| Qué | Pruebas |
|---|---|
| Alineación del modelo | Integración: columnas, enum y B1 a B9 tal como los deja la migración (B7 según D3) |
| El motor rechaza por sí mismo | Integración: un log incoherente por cada restricción, con su nombre |
| DTO ⊆ `CHECK` (B5 y B6) | Los casos compartidos de `test/utils/casos-enlace.ts` (ADR-009 FU3) contra las columnas nuevas; casos que el motor acepta y el DTO rechaza (`https://localhost`, usuario y contraseña, más de 2048 unidades UTF-16 con ≤ 2048 caracteres); espacios Unicode (U+00A0, U+0085, U+2028, U+3000, U+FEFF) sin ningún 500; `LC_CTYPE` de producción y de integración registrados en P0 |
| Atomicidad | Integración: un log que el motor rechaza deja la solicitud intacta; un *compare-and-set* perdido no deja log |
| Concurrencia | Integración: dos cambios del anexo a la vez, anexo frente a T1 (en los dos órdenes) y dos correcciones de entrega a la vez |
| Proyecciones y línea de vida | e2e: el solicitante no recibe eventos de enlace y el Staff sí · Vitest: la línea de vida los ignora |
| Notificaciones | Cuando exista ADR-011: un evento de enlace no encola |

---

## 7. Consecuencias

**A favor**
- Una sola fuente de auditoría por solicitud, con el tipo de evento explícito.
- El motor protege la forma de cada evento, y el tipado evita mezclarlos en el código.

**En contra**
- Todo consumidor de `Log_Auditoria` tiene que filtrar por `enlace_campo`.
- Parte de la coherencia (D2 y que el log diga lo que cambió) depende del servicio.
- La migración del anexo crece y su checksum cambia.

---

## 8. Pendiente

- Aprobación arquitectónica de este ADR, con autoría confirmada.
- P0 autorizado: inventario de `_prisma_migrations`, B7 (D3) y `LC_CTYPE`.
- Implementación: migración, Prisma, servicio, endpoints, proyecciones, línea de vida y pruebas.
- D5 en su propio ADR.
