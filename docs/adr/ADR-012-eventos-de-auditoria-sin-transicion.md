# ADR-012 — Eventos de auditoría que no son transiciones de estado

| Campo | Valor |
|---|---|
| **Estado** | ✅ **Aceptado** el 2026-11-11 (decisión). **Implementación parcial:** la capa de base de datos está implementada; la capa de aplicación del backend está **implementada en la rama** (2026-11-12); el frontend y la producción están **pendientes** (ver «Implementación») |
| **Fecha** | 2026-11-10 · actualizado el 2026-11-11 |
| **Implementación** | **Base de datos (hecho):** EV2 y EV3 en la migración consolidada `20261109110000_enlace_anexo` y en `schema.prisma` (H1 y H2, `df4e6e9`), SHA-256 `886aeb80aee4a2f48c474b9b55013c7768aa06394eb06e3cc97465282549f059`. Verificada **solo en la base desechable de integración** (H3-C: 11 suites, 182 pruebas). **Producción:** sin migrar (paso 9.1.5 pendiente). **Aplicación del backend (hecho en la rama `feat/fase-9-anexo-solicitante`):** EV6 (I-1, `f7cd10e`), filtros de EV7 (I-2, `eadd395`), AN2b al radicar (J0, `b2b292b`), ADR-005 E7 (J1, `04f23a0`), edición del anexo (J2, `eeb978c`), historial de enlaces del Staff (J2b, `f1962e6`) y corrección del enlace de entrega (J3, `e0bc0d7`). Cifras acumuladas **reportadas** al `e0bc0d7` (base desechable): 1.365 unitarias, 126 e2e e integración 16 suites y 212 pruebas. **Pendiente:** frontend (lote K) y producción (paso 9.1.5) |
| **Autoría** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Aprobación** | Sebastián Eraso, 2026-11-11: diseño EV1 a EV7 y división del lote I en I-1 (tipos) e I-2 (filtros) · 2026-11-12: enmienda de D10 (DJ2-1 y DJ3-1, §2.5) y forma del historial de enlaces (DJ2b-1 a DJ2b-3, §2.7) |
| **Rama** | `feat/fase-9-anexo-solicitante` (desde `develop` @ `6c35493`) |
| **Complementa a** | [ADR-002](ADR-002-autorizacion-a-nivel-de-dato.md) (propiedad en el `WHERE`, 404 uniforme y proyecciones por rol) · [ADR-005](ADR-005-maquina-de-estados-ca10.md) (`Log_Auditoria`, *compare-and-set* y precondición E7 de T1) · [ADR-008](ADR-008-edicion-postproduccion-y-enlace-de-entrega.md) (corrección del enlace de entrega, §2.7) · [ADR-009](ADR-009-anexo-del-solicitante-y-fuente-unica-del-enlace.md) (edición y retiro del anexo, §2.7) |
| **Dependencias futuras** | ADR-011 (borrador no aceptado, fuera del repositorio; notificaciones por correo, R9-2) · R9-4 (tablero de estadísticas, sin diseño) |
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

> **Nota (2026-11-11):** esta sección describe el código antes de H1. Desde H1, B7 exige **en el motor** que un log con el mismo estado sea un evento de enlace, y la tabla tiene las cuatro columnas de EV2. La aplicación todavía escribe solo transiciones.

### 1.3 El problema

Los cambios de las preguntas 3, 4 y 24 no son transiciones: el estado no cambia. Si se registran como si lo fueran, la línea de vida mueve sus fechas y, más adelante, los correos de R9-2 y las métricas de R9-4 contarían eventos que no existieron.

---

## 2. Decisiones (aceptadas el 2026-11-11)

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

Migración aditiva, sin *backfill* y sin tocar registros existentes (DT-3): los logs históricos quedan con las cuatro columnas en NULL. **Implementado** en la migración consolidada del anexo (`20261109110000_enlace_anexo`, H1, `df4e6e9`; checksum en el encabezado), que reemplazó a la versión original antes de aplicarse en producción (ADR-009 §2.6). Producción todavía no la tiene.

### 2.3 EV3 · Restricciones del motor

Recordatorio: un `CHECK` solo rechaza cuando la expresión da FALSE; si da NULL, pasa.

| Id | Qué protege | Predicado (conceptual) | Estado |
|---|---|---|---|
| B1 | Sin tipo de enlace no hay valores de enlace | `enlace_campo IS NOT NULL OR (enlace_anterior IS NULL AND enlace_nuevo IS NULL)` | En H1 |
| B2 | Un evento de enlace es un cambio real | `enlace_campo IS NULL OR enlace_anterior IS DISTINCT FROM enlace_nuevo` | En H1 |
| B3 | Un evento de enlace no cambia de estado | `enlace_campo IS NULL OR estado_anterior = estado_nuevo` | En H1 |
| B4 | ANEXO solo en `Recibido`; ENTREGA solo en `Entregado` y con valor nuevo | `enlace_campo IS NULL OR (ANEXO y Recibido) OR (ENTREGA y Entregado y enlace_nuevo IS NOT NULL)` | En H1 |
| B5 y B6 | Forma de `enlace_anterior` y `enlace_nuevo` | `col ~ '^https://[^[:space:]]+$' AND char_length(col) <= 2048` (NULL pasa) | En H1 |
| B7 | Un log con el mismo estado tiene que ser un evento de enlace | `estado_anterior <> estado_nuevo OR enlace_campo IS NOT NULL` | En H1, validada (D3: P0 midió 0) |
| B8 | El motivo solo existe en eventos ENTREGA | `motivo_correccion IS NULL OR enlace_campo IS NOT DISTINCT FROM 'ENTREGA'` | En H1 |
| B9 | Longitud del motivo, cuando existe | `char_length(btrim(motivo_correccion)) BETWEEN 10 AND 500` (NULL pasa) | En H1 |

- «En H1» significa presente en la migración consolidada y verificada en la base desechable (I-40); no en producción.
- **B7 (D3, resuelta):** P0 (precheck 9.1.0b, fila 30) midió 0 logs con el mismo estado, así que H1 la crea validada. El precheck inmediato al 9.1.5 lo vuelve a medir: si apareciera alguno, la migración falla completa sin cambiar nada y D3 se decide de nuevo (`NOT VALID` u omitirla). En ningún caso se corrigen registros.
- **B8 se escribe con `IS NOT DISTINCT FROM`:** con `enlace_campo = 'ENTREGA'`, un `enlace_campo` nulo daría NULL y el `CHECK` dejaría pasar un motivo dentro de una transición.
- **B9:** el DTO guarda el motivo ya recortado con `trim()`, así que `btrim` no lo cambia y la longitud que mide el motor es la que validó el DTO. Es la misma asimetría que `motivo_rechazo` (ADR-005 §2.10).
- **B5 y B6 no son equivalentes a `EnlaceSeguro`.** El DTO es más estricto: `MaxLength` cuenta unidades UTF-16 (nunca menos que los puntos de código de `char_length`), `IsUrl` exige dominio de primer nivel y prohíbe usuario y contraseña, y `Matches` usa `[^\s\p{Cc}]` desde H0. Lo que se mantiene es la regla de ADR-009 FU2: **el DTO nunca acepta un valor que el `CHECK` rechace**. Lo contrario sí pasa, a propósito (`https://localhost`, `https://u:p@x.com`). Que el patrón del DTO fuera al menos tan estricto como `[^[:space:]]` dependía del `LC_CTYPE` de la base: **P0 (fila 28) mostró que no lo era** con caracteres de control. **H0 (`a111c73`)** cambió `PATRON_ENLACE_SEGURO` a `/^https:\/\/[^\s\p{Cc}]+$/u` (y la misma exclusión en `esEnlaceSeguro` de la vista); I-38b e I-40b cubren esos casos en la base desechable. En producción se vuelve a medir con el precheck 0c (fila 28 ajustada) antes del 9.1.5.
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
- **Sin cambios (D10):** si el valor pedido ya es el vigente, 200 con `sin_cambios: true`, sin escritura ni log. **Enmienda (2026-11-12, DJ2-1 y DJ3-1; implementada en J2 y J3):** antes se comprueban autenticación, rol, forma del cuerpo, existencia o propiedad, categoría, **el estado** y, en la corrección de entrega, **EN8**; `sin_cambios: true` solo se responde cuando el cambio sería válido en ese estado, y es cierto aunque el valor anterior enviado no coincida con el vigente. **Texto anterior (2026-11-11, sustituido; se conserva por trazabilidad):** «Antes se comprueban autenticación, rol, forma del cuerpo, propiedad y categoría». No es una modificación y no prueba que una petición anterior se haya confirmado; tampoco es idempotencia completa (se garantiza el efecto, no la respuesta original). Ante una respuesta incierta, el frontend vuelve a consultar el detalle.
- CA-06 (las exclusiones por sub-espacio) y DT-1 (inventario suspendido) no cambian: ninguno de estos eventos escribe estado, franja, sub-espacio ni recursos.

### 2.6 EV6 · Tipado

`OperacionCompareAndSet` reemplaza el campo `log` por `evento?`, una unión discriminada por `tipo`. El campo actual (`Omit<Prisma.Log_AuditoriaUncheckedCreateInput, 'radicado_solicitud'>`) ya admite, desde H2, las columnas de enlace en cualquier log: hoy solo el motor detendría un motivo de corrección en una transición.

| `tipo` | Qué recibe | Qué completa el servicio |
|---|---|---|
| `TRANSICION` | Los campos actuales del log, **sin** las cuatro columnas de EV2 | Nada: los datos escritos son los mismos de hoy |
| `ENLACE_ANEXO` | Autor, `enlace_anterior: string \| null` y `enlace_nuevo: string \| null` | `enlace_campo = 'ANEXO'` y `Recibido` en los dos estados |
| `ENLACE_ENTREGA` | Autor, `enlace_anterior: string`, `enlace_nuevo: string` y `motivo_correccion?` | `enlace_campo = 'ENTREGA'` y `Entregado` en los dos estados |

- Una función pura arma los datos del log con un `switch` exhaustivo (`never`). Para `TRANSICION` devuelve **exactamente** el objeto que se escribe hoy: sin `tipo` y sin claves de enlace en NULL.
- El tipo impide en compilación un motivo en una transición o en un cambio del anexo, un retiro en una corrección de entrega y estados elegidos por quien llama en un evento de enlace. El motor sigue siendo la última barrera (B1 a B9).
- Sin evento (`undefined`) sigue siendo válido: el `PATCH` del tablero sin cambio de estado no escribe log.
- **Estado:** implementado en la rama, lote I-1 (`f7cd10e`), sin cambio de comportamiento: `EventoAuditoria`, `datosDelLog` y `ESTADO_DEL_EVENTO_DE_ENLACE` en `src/solicitudes/auditoria/evento-auditoria.ts`.

### 2.7 EV7 · Consumidores

| Consumidor | Situación | Qué cambia |
|---|---|---|
| Línea de vida (`linea-de-vida.ts`), en el detalle de **los dos roles** | Implementada; protegida en el backend (lote I-2, `eadd395`) | Recibe solo transiciones porque `logs` se filtra en las dos proyecciones. Sin el filtro, un evento ANEXO movería la fecha de «Recibido» (`fechaDe` toma el último log con ese `estado_nuevo`), uno ENTREGA la de «Entregado», y los dos aparecerían como eventos «X → X». El contrato del frontend no tiene `enlace_campo`, así que la vista no puede distinguirlos |
| Proyección del solicitante | Implementada; adaptada en el lote I-2 (`eadd395`, `FILTRO_LOGS_DE_TRANSICION`) | `logs` con `where: { enlace_campo: null }`: el solicitante ve su anexo vigente, no el historial (D7, ADR-002) |
| Detalle del Staff | Implementado; `logs` filtrado en el lote I-2 (`eadd395`); historial en J2b (`f1962e6`) | `logs` queda solo con transiciones, igual que en el solicitante. El «Historial de enlaces» va aparte porque Prisma no selecciona la misma relación dos veces con filtros distintos. **Decisión (DJ2b-1 a DJ2b-3):** consulta propia, `GET /solicitudes/:radicado/historial-enlaces`, solo Staff (403 en el servicio antes de consultar); responde `{ radicado, eventos }` en orden cronológico (`FILTRO_EVENTOS_DE_ENLACE`, `SELECT_HISTORIAL_ENLACES`: siete campos, con el motivo cuando existe y solo `modificado_por` como actor). **Pendiente:** la vista del historial (lote K) |
| R9-2 · correos (ADR-011: borrador no aceptado, fuera del repositorio) | **Dependencia futura** | **Regla de este ADR:** cualquier consumidor que notifique encola solo los eventos con `evento.tipo === 'TRANSICION'` (EV6) |
| R9-4 · métricas | **Dependencia futura** (sin diseño) | Excluir los eventos de enlace (por ejemplo, del tiempo de primera respuesta, pregunta 21) |

Antes de escribir el primer evento de enlace, la invariante de `maquina-concurrencia.int-spec.ts` (no hay dos logs con el mismo `estado_anterior`) debe considerar solo transiciones. **Hecho:** su consulta del historial filtra `enlace_campo: null` (adaptación dentro del lote J2, `eeb978c`).

---

## 3. Relación con otros ADR

- **ADR-002:** se mantienen la propiedad dentro del `WHERE`, el 404 uniforme y las proyecciones como listas blancas.
- **ADR-005:** `Log_Auditoria` deja de ser «una fila, una transición». Las reglas de E2 y `MISMO_ESTADO` siguen rigiendo las transiciones, y la máquina T1 a T12 no cambia. La precondición de T1 está en su E7.
- **ADR-008:** el evento ENTREGA es el mecanismo de la corrección del enlace (§2.7, DA-4).
- **ADR-009:** el evento ANEXO es el mecanismo de la edición y el retiro del anexo (§2.7).
- **R9-2 · notificaciones (ADR-011, borrador no aceptado, fuera del repositorio):** la regla la fija este ADR: solo los eventos `TRANSICION` (EV6) pueden generar notificaciones. El borrador no decide nada aquí; cuando se formalice, debe respetarla.

---

## 4. Fuera de alcance

- **D5 · Inmutabilidad impuesta por PostgreSQL:** un trigger o una restricción de privilegios que impida modificar o borrar logs. Es deuda de seguridad independiente y necesita su propio ADR.
- **D2 · Agregar por primera vez un enlace a una entrega histórica que nunca lo tuvo.**

---

## 5. Riesgos conocidos

- Quien acceda directamente a la base puede modificar o borrar logs (D5).
- Que el log coincida con la solicitud, y la regla de D2, dependen del servicio, no del motor.
- El valor anterior observado y `anexo_revisado` ([ADR-005](ADR-005-maquina-de-estados-ca10.md) E7) son afirmaciones del cliente: protegen contra vistas desactualizadas, no contra un cliente manipulado.
- Un enlace igual no garantiza que el archivo externo tenga el mismo contenido.
- El motivo es texto libre: podría contener datos personales si el Staff los escribe. La interfaz debe advertirlo.
- B7 y la compatibilidad de B5 y B6 con el DTO se midieron en P0 y en la base desechable; en producción se confirman con el precheck 0c, justo antes del 9.1.5.

---

## 6. Pruebas

| Qué | Pruebas | Estado |
|---|---|---|
| Alineación del modelo | Integración: columnas, enum y B1 a B9 tal como los deja la migración | ✅ I-40a (H3-C, base desechable) |
| El motor rechaza por sí mismo | Integración: un log incoherente por cada restricción, con su nombre | ✅ I-40b; casos válidos y semántica de NULL en I-40c; B7 en I-40d |
| DTO ⊆ `CHECK` (B5 y B6) | Los casos compartidos de `test/utils/casos-enlace.ts` (ADR-009 FU3) contra las columnas nuevas; casos que el motor acepta y el DTO rechaza (`https://localhost`, usuario y contraseña, más de 2048 unidades UTF-16 con ≤ 2048 caracteres); espacios Unicode (U+00A0, U+0085, U+2028, U+3000, U+FEFF) sin ningún 500 | 🟡 Parcial: P0 (fila 28) y H0; controles en I-40b e I-38b. Los DTO de los endpoints ya existen, con sus pruebas de forma (`editar-anexo.dto.spec.ts`, J2; `corregir-enlace-entrega.dto.spec.ts`, J3). Pendiente: confirmar su contraste explícito con las columnas del log y el precheck 0c en producción |
| Atomicidad | Integración: un log que el motor rechaza deja la solicitud intacta; un *compare-and-set* perdido no deja log | ✅ En la rama: I-40e; *compare-and-set* perdido con un evento de enlace → 409 sin evento en I-42e (J2) e I-43g (J3), y en T1 con anexo en I-44c (J1) |
| EV6 sin cambio de comportamiento | Las comparaciones exactas de `log_Auditoria.create` en `solicitudes.service.spec.ts`, `seguridad.e2e-spec.ts` y `horario.e2e-spec.ts` pasan **sin modificarse**; unitarias de la función pura (TRANSICION idéntica a hoy; ANEXO, retiro y ENTREGA con y sin motivo); `@ts-expect-error` para las combinaciones prohibidas | ✅ En la rama, lote I-1 (`f7cd10e`): `evento-auditoria.spec.ts` y las comparaciones existentes sin modificarse |
| Proyecciones y línea de vida | **I-41** (integración, comportamiento observable): con un evento ANEXO y otro ENTREGA válidos insertados directamente, el detalle del solicitante y el del Staff, leídos por el servicio, devuelven en `logs` solo las transiciones, iguales a las de antes de insertar el evento, y el evento sigue en `Log_Auditoria` · e2e y Vitest cuando existan los endpoints y el historial | ✅ En la rama: I-41 (lote I-2, `eadd395`) y `detalle-solicitud.proyeccion.spec.ts`; historial: `historial-enlaces.e2e-spec.ts` e I-45 (J2b, `f1962e6`). ⏳ Vitest con el lote K |
| Concurrencia | Integración: dos cambios del anexo a la vez, anexo frente a T1 (en los dos órdenes) y dos correcciones de entrega a la vez | ✅ En la rama: I-42 (J2, incluida la edición frente a T1 y a la cancelación), I-44 (J1) e I-43 (J3) |
| Notificaciones | Cuando se implemente R9-2: un evento de enlace no encola (regla de EV7) | ⏳ Con R9-2 |

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

- ✅ Aprobación de este ADR y autoría confirmada (2026-11-11).
- ✅ P0 (precheck 9.1.0b): inventario de `_prisma_migrations`, B7 (0) y compatibilidad Unicode (fila 28, corregida por H0).
- ✅ Migración consolidada y `schema.prisma` (H1 y H2, `df4e6e9`), verificadas en la base desechable (H3-C).
- ✅ Lote I-1 en la rama (`f7cd10e`): EV6 (unión discriminada y función pura), sin cambio de comportamiento.
- ✅ Lote I-2 en la rama (`eadd395`): filtros de EV7 en las dos proyecciones e I-41.
- ✅ **AN2b en el servidor ([ADR-009](ADR-009-anexo-del-solicitante-y-fuente-unica-del-enlace.md) §2.7), fuera de I-1 e I-2 y antes del PR:** (cerrado en J0, `b2b292b`; texto original conservado) en `src` no hay validación de la categoría de `enlace_anexo` al radicar, y con H1 la restricción A3 del motor rechaza el anexo en ESPACIOS y ASESORIAS. **Hipótesis pendiente de prueba, no resultado verificado:** hoy la respuesta sería un 500. Primero se mide la respuesta actual con una prueba; después se corrige la validación del servidor para responder 400 cuando la categoría no admite anexo. **Cierre (J0, `b2b292b`):** el HTTP 500 quedó como hipótesis histórica y no se verificó como respuesta HTTP. Lo medido antes de corregir, con I-38e contra la base desechable, fue una excepción de Prisma (`PrismaClientUnknownRequestError`) con SQLSTATE 23514 por la restricción A3, sin `HttpException` y con cero filas escritas, en ESPACIOS y ASESORIAS. Después de J0, el servicio responde 400 `MENSAJE_ANEXO_NO_APLICA` antes de escribir.
- ✅ Backend en la rama: ADR-005 E7 (J1, `04f23a0`), edición del anexo (J2, `eeb978c`), historial de enlaces del Staff (J2b, `f1962e6`), corrección del enlace de entrega (J3, `e0bc0d7`) y sus pruebas de concurrencia.
- ⏳ Frontend (lote K): `anexo_revisado` en T1, anexo según la categoría, `TEXTO_AYUDA_ANEXO`, edición y retiro del anexo, historial, corrección del enlace con la advertencia sobre datos personales y `sin_cambios` en los contratos de Zod. Bloquea el PR.
- ⏳ 9.1.5 en producción: precheck 0c (fila 28 ajustada), postcheck reescrito para H1, respaldo, `migrate status` y `npm run db:migrate`.
- ⏳ D5 en su propio ADR.
