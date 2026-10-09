# ADR-005 — Máquina de estados y reprogramación por mutuo acuerdo (CA-10)

| Campo | Valor |
|---|---|
| **Estado** | ✅ Aceptado |
| **Fecha** | 2026-10-09 |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `feat/fase-5-maquina-de-estados` |
| **Complementa a** | [ADR-002](ADR-002-autorizacion-a-nivel-de-dato.md) (404 uniforme y proyecciones por rol en los comandos del solicitante) · [ADR-003](ADR-003-reglas-de-horario.md) (la franja propuesta pasa por las mismas reglas de horario) · [ADR-004](ADR-004-concurrencia-ca06.md) (el motor como garante; este ADR **reemplaza** la reactivación de su Decisión AG) |
| **Relacionado con** | PRD v2.1 §5.5 y §8 (diagrama de estados) · CA-09 (auditoría) · CA-10 (reprogramación por mutuo acuerdo) |

---

## 1. Contexto

El diagnóstico de la Fase 5 (solo lectura sobre el código y sobre producción) encontró:

1. **No había máquina de estados (H1).** `PATCH` aceptaba cualquier transición entre los 7 estados, incluso salir de un estado final (`Entregado` → `Recibido`).
2. **El solicitante no podía ejecutar ninguna de sus 4 transiciones (H2).** `PATCH` es solo del Staff, así que únicamente el Staff podía marcar `Cancelado por el Usuario`: la cancelación unilateral que prohíbe el PRD §5.5.
3. **CA-10 no estaba implementado (H3).** El Staff movía la franja de una solicitud validada sin el acuerdo del solicitante; `fecha_propuesta_*` existía en el esquema, pero nada la escribía.
4. **La reactivación contradecía el diagrama (H4).** La Decisión AG de ADR-004 permitía `Rechazado` → `Recibido` con validación de CA-06.
5. **Carrera en las transiciones (H5).** `update()` leía y escribía en sentencias separadas: si dos actores actuaban a la vez, ganaba el último y el log quedaba con un `estado_anterior` falso.
6. **Menores:** la lista de estados estaba duplicada (H6), `motivo_rechazo` se aceptaba en cualquier transición (H7), `update()` respondía 400 con el radicado cuando no existía (H8) y el 501 de `DELETE` remitía a un `PATCH` que el solicitante no puede usar (H9).

**Datos reales de producción** (consultas E1 a E3, solo `SELECT`):

- 11 solicitudes en `Recibido` (8 con la franja ya vencida) y 1 en `En Producción`. Ninguna propuesta de reprogramación.
- **Anomalía heredada:** el log registra una transición `Rechazado` → `En Producción`, imposible según el diagrama, y **ninguna** transición hacia `Rechazado`: esa solicitud llegó a `Rechazado` sin dejar log, probablemente antes de CA-09.
- **Decisión sobre la anomalía:** no se corrige a mano. Un `UPDATE` manual sería otra modificación sin auditoría, justo lo que esta fase prohíbe. Con la máquina nueva, esa solicitud solo puede avanzar a `Entregado` (T9), así que no bloquea nada. Queda aquí como evidencia de por qué el log debe escribirse en la misma transacción que el cambio de estado.

---

## 2. Decisiones

### 2.1 Una máquina pura y única (paso 5.1 · Decisión D1)

| # | Origen | Destino | Rol | Acción | Ruta |
|---|---|---|---|---|---|
| T1 | Recibido | Validado | STAFF | `APROBAR` | `PATCH` |
| T2 | Recibido | Rechazado | STAFF | `RECHAZAR` | `PATCH` (motivo obligatorio) |
| T3 | Recibido | Cancelado por el Usuario | SOLICITANTE | `CANCELAR` | `POST …/cancelar` |
| T4 | Validado | En Producción | STAFF | `INICIAR_PRODUCCION` | `PATCH` |
| T5 | Validado | Pendiente de Reprogramación | STAFF | `PROPONER_REPROGRAMACION` | `POST …/reprogramacion` |
| T6 | Validado | Cancelado por el Usuario | SOLICITANTE | `CANCELAR` | `POST …/cancelar` |
| T7 | Pendiente de Reprogramación | Validado | SOLICITANTE | `ACEPTAR_REPROGRAMACION` | `POST …/reprogramacion/aceptar` |
| T8 | Pendiente de Reprogramación | Cancelado por el Usuario | SOLICITANTE | `RECHAZAR_REPROGRAMACION` | `POST …/reprogramacion/rechazar` |
| T9 | En Producción | Entregado | STAFF | `FINALIZAR` | `PATCH` |

- El módulo `src/solicitudes/reglas/maquina-estados.ts` es **puro**: no conoce HTTP, Nest ni la base de datos. Una sola tabla, `TRANSICIONES`, responde las dos preguntas del sistema: `evaluarTransicion(origen, destino, rol)` para el tablero y `evaluarAccion(accion, origen, rol)` para los comandos. Ambas devuelven un resultado tipado con su motivo (`ESTADO_DESCONOCIDO`, `MISMO_ESTADO`, `ESTADO_FINAL`, `TRANSICION_NO_DEFINIDA`, `ROL_NO_AUTORIZADO`), nunca una excepción de HTTP.
- Ninguna transición es compartida entre roles. Los estados finales se **derivan** de la tabla (estados sin salida): `Entregado`, `Rechazado` y `Cancelado por el Usuario`.
- **D1 · Sin reactivación.** `Rechazado` y `Cancelado por el Usuario` son finales absolutos.
- **H6 · Fuente única.** `ESTADOS` es la única lista: el DTO valida con `@IsIn(ESTADOS)` y `ESTADOS_QUE_LIBERAN_FRANJA` se declara con `satisfies readonly Estado[]`, así que un error tipográfico no compila.
- `esEstado()` compara exacto (mayúsculas, tildes y espacios). Un estado guardado fuera del diagrama es `ESTADO_DESCONOCIDO` y responde 409 (*fail-closed*).

### 2.2 El tablero del Staff (paso 5.2a · Decisiones D2, D7 y E1 a E6)

- **E1:** `PATCH` solo ejecuta T1, T2, T4 y T9. Pedir `Pendiente de Reprogramación` (T5) responde 409 y remite a `/reprogramacion`: así el tablero nunca deja una solicitud pendiente sin propuesta.
- **E2:** 403 si la transición le corresponde al solicitante; 409 para estado final, transición no definida o estado desconocido. Pedir el estado actual no es un error: 200, sin log.
- **D2 / E3:** las fechas solo se editan si el estado **guardado** es `Recibido`; en `Validado`, el único camino es CA-10. Se admite el **rescate atómico**: fechas nuevas y aprobación en un solo `PATCH`, con un solo log.
- **D7 / E4:** T1 exige que el inicio de la franja **efectiva** sea posterior al "ahora" del `Reloj` (*fail-closed*). Las 8 solicitudes vencidas se reprograman antes de aprobarse.
- **E5:** `motivo_rechazo` solo se admite con un cambio real a `Rechazado` (400). Se valida en el servicio: dos `@ValidateIf` sobre la misma propiedad se contradicen.
- **E6:** las pruebas de la reactivación no se borraron: cambiaron de camino. Por ejemplo, U-7 pasó a "`Rechazado` → `Recibido` responde 409 `ESTADO_FINAL` sin consultar CA-06 ni escribir".
- **H8:** 404 uniforme (`Solicitud no encontrada.`) en `update()` y en los comandos.

### 2.3 Un solo camino de escritura con *compare-and-set* (paso 5.2b · Decisiones D5, D6 y F1 a F4)

- **D5:** toda escritura sobre una solicitud existente pasa por `escribirConCompareAndSet()`, una **transacción interactiva** cuyo `updateMany` lleva en el `WHERE` la fila **tal como se validó**. Si no actualiza exactamente una fila, responde 409 `MENSAJE_CAMBIO_CONCURRENTE` (F3, distinto del de CA-06) y emite un `logger.warn` con el radicado propio únicamente.
- **F1:** en `update()`, el *compare-and-set* compara el estado **y** la franja guardados, porque sobre ellos se calcularon D2, el horario, D7 y CA-06. **F2:** un solo camino, también para ediciones sin cambio de estado. **F4:** las pruebas unitarias simulan `tx` con `$transaction.mockImplementation((fn) => fn(mock))`.
- **D6:** toda transición, también las del solicitante, deja su log en la **misma** transacción, con `modificado_por` tomado del JWT.
- **R1:** `updateMany` no admite escrituras anidadas; los recursos se reemplazan con `deleteMany`/`createMany` dentro de la transacción.
- **Medido antes de escribir el código (5.2b.0):**
  - **I-9:** un `23P01` lanzado dentro de una transacción interactiva conserva su clase y su firma (el detector de ADR-004 sigue sirviendo) y revierte el log ya escrito.
  - **I-10:** en `READ COMMITTED`, un `updateMany` concurrente espera el bloqueo de fila (1043 ms medidos) y reevalúa su `WHERE` sobre la versión confirmada: exactamente uno gana.

### 2.4 Cancelación por el solicitante (paso 5.3 · Decisiones G1 a G8 y H9)

- **G1:** `POST /solicitudes/:radicado/cancelar`, solo SOLICITANTE, sin cuerpo, 200 (es un comando; no crea nada).
- **G2:** primero la propiedad (404 uniforme) y después el estado. Invertir el orden revelaría con un 409 el estado de un radicado ajeno.
- **G3:** la propiedad también va en el `WHERE` de la escritura: la base de datos nunca toca filas ajenas.
- **G4:** regla de estado sin regla de tiempo: se cancela desde `Recibido` o `Validado` aunque la franja ya haya pasado.
- **G5:** mensajes propios para `En Producción` y `Pendiente de Reprogramación`. **G6:** sin idempotencia silenciosa: el segundo clic responde 409 `ESTADO_FINAL`.
- **G7:** `escribirConCompareAndSet()` es común a todos los comandos. **G8:** la respuesta usa la proyección del solicitante, sin la identidad del Staff.
- **H9:** el 501 de `DELETE` remite a `POST /solicitudes/:radicado/cancelar`.

### 2.5 CA-10, proponer (paso 5.4 · Decisiones D3, D4 y K1 a K9)

- **D4:** endpoints de comando, cada uno con su rol, su cuerpo, su regla de propiedad y su auditoría, en lugar de un `PATCH` genérico para el estado.
- **K1:** un DTO propio con solo las dos fechas (`@FechaConZonaHoraria()`): la lista blanca rechaza cualquier otro campo.
- **K2:** orden de validación: existencia (404) → estado (409) → forma (400) → CA-04 (400) → CA-06 (409) → escritura.
- **K3:** mensajes propios para `Recibido` (edite las fechas con el `PATCH`) y para `Pendiente` (ya hay una propuesta). `Pendiente` queda congelada.
- **K4:** la propuesta pasa por las mismas reglas de horario que una solicitud nueva y debe diferir de la franja oficial.
- **D3 / K5:** CA-06 sobre la propuesta solo en la consulta previa, excluyendo la propia solicitud. **La propuesta no se reserva en el motor** (sin migración): la franja oficial sigue ocupada mientras la solicitud está pendiente.
- **K6:** *compare-and-set* sobre el estado y la franja oficiales; no cambian ni la franja oficial ni `es_urgencia`. **K8:** responde con la proyección del Staff.
- **K7:** sin motivo de la reprogramación. `Log_Auditoria` solo tiene `motivo_rechazo`, y reutilizarlo corrompería su significado. Queda en el backlog (columna nueva).
- **K9:** invariante "hay propuesta si y solo si la solicitud está en `Pendiente`", llevado al motor en el paso 5.5b (§2.7).

### 2.6 CA-10, responder (paso 5.5a · Decisiones L1 a L10)

- **L1:** `POST …/reprogramacion/aceptar` y `…/rechazar`, solo SOLICITANTE, sin cuerpo: se acepta exactamente la propuesta guardada.
- **L2 / L3:** propiedad primero y propiedad en la escritura, en un único método `leerPropiaYAutorizar()` para los tres comandos del solicitante.
- **L4:** aceptar revalida en este orden: existe la propuesta (si no, 409 *fail-closed* y aviso) → reglas de horario con el `Reloj` de la petición → consulta previa de CA-06 → el motor.
- **L5:** propuesta vencida → 409 `MENSAJE_PROPUESTA_VENCIDA`; ocupada → 409 `MENSAJE_CA06`, el mismo de la consulta previa y del motor (Decisión AD de ADR-004).
- **L6:** al aceptar, `es_urgencia` queda en `false`: la fecha la eligió el Estudio C, no el solicitante. Se aparta a propósito de la Opción A del `PATCH`.
- **L7:** el *compare-and-set* de aceptar exige además la propuesta exacta que se validó.
- **L8:** aceptar mueve la franja oficial a la propuesta y limpia la propuesta. **L9:** rechazar cancela, limpia la propuesta y conserva la franja oficial como registro (liberada por el estado).
- **L10:** el invariante K9 pasa al motor en un paso aparte, con su propia migración.

### 2.7 K9 garantizado por el motor (paso 5.5b · Decisiones M1 a M3)

```sql
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_propuesta_completa_check"
  CHECK ((fecha_propuesta_inicio IS NULL) = (fecha_propuesta_fin IS NULL));                    -- M1
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_propuesta_segun_estado_check"
  CHECK ((estado = 'Pendiente de Reprogramación') = (fecha_propuesta_inicio IS NOT NULL));      -- M2
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_propuesta_fechas_validas_check"
  CHECK (fecha_propuesta_fin > fecha_propuesta_inicio);                                        -- M3
```

- **Tres restricciones con nombre propio en lugar de una.** Una sola equivalencia ("estado `Pendiente` ⇔ ambas fechas") dejaba pasar media propuesta en `Validado`. Con nombres separados, el `23514` dice exactamente qué regla se rompió.
- **M3 no necesita `IS NULL`:** un `CHECK` solo rechaza cuando la expresión da FALSE, y `NULL > NULL` da NULL. Ese caso es de M1 y M2. En M2, `estado` es `NOT NULL` e `IS NOT NULL` nunca da NULL: la comparación siempre es TRUE o FALSE.
- Migración `20261008120000_k9_propuesta_coherente` (`BEGIN`/`COMMIT`, LF), con el método de ADR-004 (AA, AB):
  - verificación previa de solo lectura en producción: 0 filas violaban M1, M2 o M3;
  - atomicidad demostrada en la base desechable: con una fila que viola solo M3, la última restricción, M1 y M2 se crearon y se revirtieron, y no quedó ninguna;
  - aplicada con `npm run db:migrate`; *checksum* `3d307547…f0f3` verificado en `_prisma_migrations`, y las tres restricciones con `convalidated = true`.
- Un `23514` de K9 que llegara a la API responde 500 genérico (*fail-closed*): sería un error del sistema, no del usuario, y su `DETAIL` contiene la fila completa.

### 2.8 Concurrencia de la máquina (paso 5.6 · hallazgos N1 a N4)

- **N1:** el canario I-3 se rediseñó sobre T7. El anterior protegía formas de escritura que el servicio ya no usa (`update()` y `$transaction([…])`) y una reactivación que D1 eliminó.
- **Barrera determinista (I-11a a I-11e):** se fuerza el peor orden posible, en el que las dos peticiones leen el mismo estado y pasan la máquina antes de que ninguna escriba. El *compare-and-set* decide en **cada** ejecución, no "casi siempre".
- **Propiedades (I-11f):** en cualquier orden, nunca hay un 500; el historial del log, encadenado desde el estado inicial, es legal según la propia máquina; y el número de éxitos es igual al de transiciones registradas (ninguna actualización perdida).
- **N2** está en la §3; **N3** y **N4**, en la §6.

---

## 3. Política de las propuestas de reprogramación

1. **La propuesta no reserva la franja (D3).** Mientras la solicitud está en `Pendiente de Reprogramación`, su franja **oficial** sigue ocupada y la **propuesta** está libre para cualquiera.
2. **N2 · Gana quien acepta primero.** El Staff puede proponer la misma franja libre a varias solicitudes. Al aceptar, la propuesta se revalida y el motor decide: la primera aceptación confirma la franja; las demás reciben 409 `MENSAJE_CA06` y siguen en `Pendiente` con su propuesta intacta.
   - **Medido en I-19:** 4 aceptaciones simultáneas de la misma franja → 1 `Validado` y 3 rechazos (1 resuelto por el motor con `23P01` y 2 por la consulta previa), con un solo log.
3. **Propuesta vencida u ocupada: opción (a), vigente.** Aceptar responde 409 (`MENSAJE_PROPUESTA_VENCIDA` o `MENSAJE_CA06`) y remite al Estudio C. La máquina no le da al Staff ninguna salida desde `Pendiente`, así que el solicitante solo puede rechazar (lo que cancela la solicitud, T8) o esperar una gestión del Estudio.
4. **Opción (b), ruta técnica viable para el futuro: T10, "el Staff retira la propuesta".** `Pendiente de Reprogramación` → `Validado`, ejecutada por el Staff. La franja oficial se conserva (nunca se movió) y la propuesta se limpia. Encaja en la arquitectura actual sin fricción:
   - una fila más en `TRANSICIONES` (acción `RETIRAR_PROPUESTA`, rol STAFF), que la prueba exhaustiva de la máquina y sus invariantes cubren de inmediato;
   - un comando `POST /solicitudes/:radicado/reprogramacion/retirar` con el patrón de K1 a K8: *compare-and-set* sobre el estado y la propuesta, y log con el autor del token;
   - **K9 no cambia:** el destino es `Validado` con la propuesta en `null`, permitido por M1 a M3, así que no requiere migración;
   - con T10, el Staff puede retirar y volver a proponer, lo que resuelve el bloqueo del punto 3 sin cancelar una reserva válida.
5. **Sin respuesta del solicitante.** Hoy una propuesta puede esperar indefinidamente. Queda abierto definir un plazo y qué ocurre al vencerlo (por ejemplo, un retiro automático por T10).

---

## 4. Verificación

| Decisión | Pruebas que la protegen |
|---|---|
| D1, máquina | `maquina-estados.spec.ts`: 257 pruebas (oráculo del diagrama, 98 combinaciones de `evaluarTransicion`, 112 de `evaluarAccion` e invariantes) |
| D2, D7, E1 a E6, H8 | `solicitudes.service.spec.ts` (U-1 a U-32) · e2e de horario |
| D5, D6, F1 a F4 | Unitarias del *compare-and-set* exacto y de la carrera perdida · integración I-9 e I-10 |
| G1 a G8, H9 | C-1 a C-10 · `solicitudes.controller.spec.ts` · e2e de seguridad |
| K1 a K9 | R-1 a R-12 · pruebas de `ProponerReprogramacionDto` · e2e |
| L1 a L10 | A-1 a A-13 y X-1 a X-7 · e2e |
| M1 a M3 | Integración I-12 (alineación exacta con `pg_constraint`; el literal se deriva del destino de T5) a I-18 (rutas reales T5 → T7 y T5 → T8) |
| N1, N2 | Integración I-3 (canario de T7), I-11a a I-11f e I-19 |

**Pruebas de mutación.** Cada paso se mutó con anclas de exactamente una aparición, restauración garantizada y verificación por *hash*:

| Paso | Detectadas |
|---|---|
| 5.1 · Máquina | 20 de 20 |
| 5.2a · Tablero | 13 de 13 |
| 5.2b · *Compare-and-set* | 11 de 11 |
| 5.3 · Cancelar | 14 de 14 |
| 5.4 · Proponer | 13 de 13 |
| 5.5a · Responder | 15 de 15 |
| 5.6 · Concurrencia (detector: integración real) | 4 de 4, más 1 equivalente justificada |

**El mutante equivalente X5** quita el estado del *compare-and-set* de aceptar y sigue en verde. No es una prueba faltante: M2 hace que "la propuesta es la validada" implique "el estado es `Pendiente`". Una restricción del motor vuelve redundante una condición del código; la condición se conserva como defensa en profundidad.

**Resultado al cierre:** `npm test` 26 suites (658 ✅ y 1 omitida por diseño) · `npm run test:e2e` 3 suites · 54 ✅ · `npm run test:integracion` 4 suites · 25 ✅ contra PostgreSQL 17 (base desechable) · `npm run test:tz` no se volvió a ejecutar en esta fase (queda en la lista de verificación de cierre).

---

## 5. Consecuencias

- **Positivas:**
  - las transiciones ilegales son imposibles desde la API;
  - el solicitante ejecuta sus 4 transiciones con propiedad y auditoría;
  - CA-10 está implementado de punta a punta;
  - ninguna escritura pierde una actualización concurrente (50 de 50 choques resueltos en I-11f);
  - K9 es inviolable, incluso desde SQL manual.
- **Costo:** el frontend tiene cuatro rutas y varios 409 nuevos que todavía no consume. Todo comando futuro debe usar `leerPropiaYAutorizar()` (si es del solicitante) y `escribirConCompareAndSet()`.
- **Mantenimiento:** una transición nueva es una fila nueva en `TRANSICIONES`, nunca un `if` en el servicio. Cambiar la regla de la propuesta exige una migración nueva que recree M1 a M3; la prueba I-12 falla si solo cambia el código.

## 6. Riesgos y deuda conocida

- **N3 · Agotamiento de conexiones (P2028).** Una transacción interactiva espera como máximo `maxWait` (2 s) por una conexión. Con `connection_limit=5`, más de 5 escrituras simultáneas pueden fallar con P2028 y responder 500 en lugar de 409. Necesita un experimento propio antes de operar con carga real: medir el *pooler* de Supabase, fijar `maxWait`/`timeout` de forma explícita y traducir P2028 a 503 con reintento.
- **N4 · El modo libre de I-11f no recorrió órdenes alternativos.** Los 50 choques los resolvió el *compare-and-set* (0 por la máquina y 0 con doble éxito): al lanzarse a la vez, las dos peticiones siempre leen antes de que alguna escriba, y el modo libre se comportó como la barrera. Los caminos en los que la segunda petición lee **después** de la primera confirmación están cubiertos por las pruebas unitarias, pero no bajo concurrencia real. **Mejora:** un retraso aleatorio y sembrado (de 0 a 300 ms) en una de las dos peticiones, registrando la semilla para reproducir cualquier fallo.
- **CA-10:** motivo de la reprogramación (K7), plazo de respuesta del solicitante y T10 (§3).
- **ADR-002:** `remove()` todavía responde 400 con el radicado cuando no existe; falta el 404 uniforme.
- **E3:** categoría, propósito y recursos siguen editables por el Staff fuera de `Recibido`.
- **Esquema:** `estado` como enum de Prisma (la migración debe convertir los valores y recrear el `EXCLUDE`).
- **CI:** `test:tz`, `test:integracion` (`postgres:17`) y e2e en el pipeline; acciones fijadas por SHA; protección de ramas.
- **Frontend:** consumir las rutas nuevas y sus 409 (README §10 a §12).

## 7. Historial de implementación

| Commit | Paso |
|---|---|
| `4c0fa67` … `cf1d198` | Paso previo (PR #5, merge `97a9834`): CI en GitHub Actions con Node 24, lint en 0 errores y 0 advertencias, `no-explicit-any` como error |
| `1687041` | 5.0 · Retira del comentario del workflow la referencia a un paso inexistente (Node 24) |
| `8011c7f` | 5.1 · Máquina de estados pura (T1–T9) con prueba exhaustiva e invariantes de CA-06 |
| `c1af3c5` | 5.2a · `update()` del Staff aplica la máquina (D1, D2, D7, 403/409, 404 uniforme) |
| `880cb0e` | 5.2b.0 · Canario del `23P01` en una transacción interactiva y semántica del *compare-and-set* (I-9, I-10) |
| `cf55c3d` | 5.2b.1 · `update()` en una transacción interactiva con *compare-and-set* (D5, F1 a F3, R1) |
| `3ffd71f` | 5.3 · `POST /cancelar` y `escribirConCompareAndSet()` común (G1 a G8, H9) |
| `e57d714` | 5.4 · CA-10: proponer reprogramación (T5) con DTO propio (K1 a K9) |
| `d703856` | 5.5a · CA-10: aceptar (T7) y rechazar (T8), con revalidación y *compare-and-set* estricto (L1 a L9) |
| `7b6449a` | 5.5b · Invariante K9 garantizado por el motor (aplicado en producción con `npm run db:migrate`) |
| `0c2ff7b` | 5.6 · Concurrencia: barrera determinista, propiedades e I-19 |
| — | 5.7 · Este ADR, el contrato del README (§10 a §12) y la Bitácora de la Fase 5 |
