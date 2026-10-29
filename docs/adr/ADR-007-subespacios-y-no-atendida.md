# ADR-007 — Sub-espacios del Estudio C y cierre de solicitudes no atendidas

| Campo | Valor |
|---|---|
| **Estado** | ✅ Aceptado · **completo**: *expand* (7A.0 a 7A.7 y 7B.1 a 7B.3, PR #10) y *contract* (7A.8) aplicados en producción |
| **Fecha** | 2026-10-22 |
| **Actualización** | 2026-10-23 · Implementación completa del *expand*: P-1 aprobada, `DEFAULT` temporal, M4 diferida al *contract*, D-4, K4 ampliada, «Validar con ajustes» y migración aplicada en producción con precheck y postcheck (§2, §3, §4 y §7) |
| **Actualización** | 2026-10-26 · *Contract* cerrado (M4, `DROP DEFAULT`, detector sin la restricción global y T7 *fail-closed*, §2.1, §2.3, §2.6 y §2.10) y nueva decisión SE10: el sub-espacio solo se elige en una solicitud de espacio físico (§2.13). DA-3 resuelta (§3) |
| **Actualización** | 2026-10-28 · Fase 8: el `WHERE` de las dos exclusiones de SE2 lo recrea la migración `20261028120000_ca06_edicion_postproduccion` ([ADR-008](ADR-008-edicion-postproduccion-y-enlace-de-entrega.md) §2.4, ED4); los nombres no cambian |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `feat/fase-7-subespacios` (desde `develop` @ `db87225`) |
| **Reemplaza** | La **Decisión Y** de [ADR-004](ADR-004-concurrencia-ca06.md) **en su forma** (un solo calendario global, una sola restricción). Se conservan su principio (el motor es el garante de CA-06), la Decisión Z y las Decisiones AA a AF. |
| **Complementa a** | [ADR-004](ADR-004-concurrencia-ca06.md) (AC: el detector reconoce una lista cerrada de nombres; AH: la fuente única de los estados que liberan la franja crece) · [ADR-005](ADR-005-maquina-de-estados-ca10.md) (T10, E5, K4 y K9 ampliados; CA-09 con el ajuste de lugar y de franja) · [ADR-006](ADR-006-frontend-contrato-tipado.md) (contrato Zod, formulario B2, acciones del Staff) |
| **Relacionado con** | PRD v2.2 §5.1, §5.5, §5.6, §8, §9 · CA-06, CA-09, CA-10, CA-12 a CA-17 · Diagnóstico de la Fase 7 (Frentes A y B) · Cuestionario del 22/10/2026 (Q-A1 a Q-A12, Q-B1 a Q-B3) |

---

## 1. Contexto

1. **Un solo calendario global.** Hasta la Fase 7, CA-06 lo garantizaba `Solicitud_sin_traslape_ca06` (migración `20261002200000_ca06_sin_traslape`): `EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&) WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario'))`. Dos solicitudes activas nunca se traslapaban, cualquiera fuera la categoría, y `Solicitud` no tenía ninguna columna de lugar.
2. **La directriz DT-2 de la Fase 7** divide el Estudio C en sub-espacios paralelos. El Responsable del Estudio C confirmó por escrito:
   - que son **2** (Q-A1) y que existe la reserva del **Estudio completo** (Q-A2);
   - que la categoría **no** determina el sub-espacio (Q-A3);
   - que el solicitante propone y el Staff ajusta al validar (Q-A4), y que después de validar el cambio exige mutuo acuerdo (Q-A5, Q-A6);
   - que lo existente queda como «Estudio completo» (Q-A7) y que todo cambio de sub-espacio se audita (Q-A12);
   - que no hay aforo, horarios distintos ni incompatibilidades entre servicios (Q-A8 a Q-A11).
3. **La brecha del Frente B (ADR-006 §5, DE6).** Una solicitud en `Recibido` con la franja vencida solo podía salir por T2 (`Rechazado`), y el registro llamaba «rechazo» a lo que fue falta de respuesta a tiempo. Q-B1 pide un estado propio, Q-B2 confirma el rescate directo (franja nueva y aprobación sin pedir permiso) y Q-B3 descarta el cierre automático.
4. **Restricciones de la fase:**
   - **DT-1:** no se tocan `Recurso` ni `Solicitud_Recurso`. El sub-espacio **no** es un recurso.
   - **DT-3:** la base de producción nunca se vacía. Toda migración es aditiva, su reversión es una migración nueva y `Log_Auditoria` no pierde ni cambia filas.

**Hechos del código que condicionaron el diseño** (lectura de `develop` @ `db87225`):

- `Solicitud.estado` es `TEXT` y **ningún `CHECK` limita sus valores**: un estado nuevo no requiere `ALTER TYPE`. Basta con el `WHERE` del `EXCLUDE` y la fuente única de TypeScript.
- El `PATCH` del Staff **ya** admitía el rescate atómico D2 + D7 (fechas nuevas y `APROBAR` en una sola petición, U-24). Q-B2 era, en el backend, una ampliación y no una funcionalidad nueva.
- `FIRMA_CA06` exigía el nombre **exacto** `Solicitud_sin_traslape_ca06` y rechazaba los sufijos a propósito. Un nombre como `Solicitud_sin_traslape_ca06_cabina` no lo reconocía el detector.

---

## 2. Decisiones

### 2.1 El sub-espacio como enum de tres valores (Decisión SE1)

```prisma
enum SubEspacio {
  CABINA_AUDIO       // "Espacio de grabación de audio, cabina insonorizada"
  ESTUDIO_GRABACION  // "Estudio de grabación, video y fotografía"
  ESTUDIO_COMPLETO   // "Estudio C completo" (los dos a la vez; también el registro histórico)
}
```

- **Una sola columna** `Solicitud.sub_espacio SubEspacio NOT NULL`.
- **Estado final, después del *contract* (7A.8): sin valor por defecto.** Olvidar el sub-espacio es un error, no un valor silencioso.
- **Durante el *expand* hubo un `DEFAULT 'ESTUDIO_COMPLETO'` temporal** (Decisión EX, §2.10): el código anterior a la Fase 7 no enviaba el sub-espacio, y con ese valor cada fila nueva se comportaba exactamente como con la restricción global. **Se retiró en el *contract* (aplicado el 2026-10-26):** desde entonces el motor rechaza una fila sin lugar (23502, I-35a).
- **Alternativas descartadas** (Diagnóstico A.3):
  - **A-1**, enum de 2 valores con `WITH =` y `btree_gist`: no puede expresar «el completo choca con todo».
  - **A-2**, catálogo `Sub_Espacio` con FK: tiene el mismo límite que A-1 y un catálogo editable no aporta nada con un número fijo de sub-espacios físicos.
  - **A-3**, tabla puente de ocupación: expresa el completo, pero duplica la franja y el estado fuera de `Solicitud` y complica el *compare-and-set* (F1) y K9.
- Las etiquetas visibles viven en el frontend (`presentacion/etiquetas.ts`: el nombre oficial, una versión corta para las insignias y una ayuda que dice qué deja libre cada opción). La base guarda el identificador estable.

### 2.2 CA-06 por sub-espacio: dos restricciones de exclusión parciales (Decisión SE2, reemplaza la forma de la Decisión Y)

```sql
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_sin_traslape_ca06_cabina"
  EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&)
  WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario', 'No atendida')
         AND sub_espacio IN ('CABINA_AUDIO', 'ESTUDIO_COMPLETO'));

ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_sin_traslape_ca06_estudio"
  EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&)
  WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario', 'No atendida')
         AND sub_espacio IN ('ESTUDIO_GRABACION', 'ESTUDIO_COMPLETO'));
```

- **Una restricción por sub-espacio físico.** Cabina y estudio caen en restricciones distintas y conviven. El completo entra en las dos y choca con cualquiera. Dos reservas del mismo sub-espacio chocan en la suya. Es exactamente la tabla del PRD v2.2 §5.1.
- **Sigue sin `btree_gist`:** cada restricción compara solo el rango (`&&`) y el sub-espacio va en el predicado parcial. El riesgo de la versión de la extensión en Supabase desaparece (Diagnóstico A.6).
- **Verificado:** PostgreSQL acepta el predicado parcial sobre el enum. Lo comprobaron el ensayo, la batería de integración (I-31 e I-32) y la producción (postcheck). El plan B (`sub_espacio` como `TEXT` con un `CHECK`) no hizo falta.
- PostgreSQL guarda el predicado reescrito como `sub_espacio = ANY (ARRAY['CABINA_AUDIO'::"SubEspacio", …])`. El postcheck compara contra esa forma.
- **Se conserva el principio de la Decisión Y:** la base de datos hace imposible guardar un conflicto, venga de donde venga la escritura. La consulta previa (`hayTraslape()`) sigue siendo la capa amable.
- **Se conserva la Decisión Z:** `Solicitud_fechas_validas_check` no se toca.
- **Contrapartida aceptada:** un tercer sub-espacio físico exigiría una restricción nueva (una migración). Con Q-A1 = 2, sería un cambio físico del Estudio que de todos modos requeriría un PRD nuevo.

### 2.3 El detector reconoce una lista cerrada de nombres (Decisión SE3, amplía la Decisión AC)

- `RESTRICCIONES_CA06` es una **lista cerrada**: hoy `[Solicitud_sin_traslape_ca06, Solicitud_sin_traslape_ca06_cabina, Solicitud_sin_traslape_ca06_estudio]`. La firma es una alternancia **anclada** de esos nombres exactos, escapados para la expresión regular, con la misma terminación de la Decisión AC.
- **No se reconoce «cualquier nombre que empiece con `Solicitud_sin_traslape_ca06_`».** Un detector por prefijo reintroduciría el riesgo que cerró la Decisión AC: una restricción futura con el mismo SQLSTATE se disfrazaría de CA-06. El caso del sufijo `_v2` se conserva y se suma un tercer nombre de la familia que no debe reconocerse.
- **Orden *expand/contract* (Decisión AE):** el detector que reconoce los nombres nuevos se publicó **antes** que la migración (7A.1). El nombre global siguió en la lista mientras pudo existir alguna base sin migrar y **se retiró en 7A.8.1** (`158e104`): un 23P01 con ese nombre ya no es CA-06 (casos 4g a 4i de `traslape-ca06.spec.ts`). En ningún momento una carrera respondió 500.

### 2.4 Fuente única del conflicto entre sub-espacios (Decisión SE4, amplía la Decisión AH)

- `reglas/sub-espacios.ts` es un módulo puro:
  - `OCUPA` dice qué sub-espacios físicos ocupa cada opción. Es un `Record` sobre el enum: un sub-espacio nuevo no compila hasta decidir qué ocupa.
  - `subEspaciosEnConflicto(s)` devuelve las opciones que comparten al menos un sub-espacio físico con `s`.
  - `RESTRICCION_DEL_SUBESPACIO` da el nombre de la restricción de cada sub-espacio físico.
- `hayTraslape(franja, subEspacio, excluirRadicado?)` filtra con `sub_espacio: { in: subEspaciosEnConflicto(subEspacio) }` en `create()`, `update()`, la propuesta (K5) y la aceptación (L4).
- **La regla existe dos veces** (TypeScript y los predicados del SQL), así que se vigila dos veces, como en AH:
  - `sub-espacios.spec.ts` compara contra un **oráculo** transcrito a mano de la tabla del PRD (nunca contra `OCUPA`, que sería una tautología);
  - el mismo archivo lee el SQL de la migración y comprueba que la relación de conflicto que **derivan** los dos `IN (…)` es la de `subEspaciosEnConflicto()`;
  - `estados.spec.ts` lee la migración nueva y comprueba que **cada** `estado NOT IN (…)` coincide con `ESTADOS_QUE_LIBERAN_FRANJA`.

### 2.5 Quién elige y cuándo cambia el sub-espacio (Decisiones SE5 y D-4)

- **Creación (Q-A4, modificada por SE10):** solo una solicitud de espacio físico elige el sub-espacio, y ahí es obligatorio; los servicios reservan el completo (§2.13). El formulario B2 no marca ninguna opción de entrada, porque marcar el completo por defecto bloquearía el Estudio sin necesidad.
- **En `Recibido` (D-4):** el Staff cambia el sub-espacio **solo junto con `APROBAR`** (T1), con o sin fechas nuevas. Es el rescate atómico de D2 + D7 ampliado al lugar. Se mira la **presencia** del campo: repetir el sub-espacio actual sin validar tampoco es una petición válida.
  - `sub_espacio` sin `APROBAR` → **400** `El sub-espacio solo se ajusta al validar la solicitud: envíelo junto con el estado "Validado".` (mismo criterio que E5).
  - `sub_espacio` fuera de `Recibido` → **409** `El sub-espacio solo se ajusta mientras la solicitud está en "Recibido", al validarla. Para una solicitud validada, proponga una reprogramación.` (mismo criterio que D2).
- **Desde `Validado`:** el sub-espacio solo cambia por CA-10 (T5 → T7).
- **CA-06 en `update()`:** se evalúa si el resultado ocupa la franja y cambian **las fechas o el sub-espacio**: pasar de la cabina al completo puede chocar sin tocar la hora.
- **Compare-and-set (F1):** `esperado` incluye el `sub_espacio` guardado, porque sobre él se calculó CA-06.

### 2.6 CA-10 con sub-espacio (Decisión SE6, amplía K4, K9 y L4 a L8)

- Columna `Solicitud.sub_espacio_propuesto SubEspacio NULL`.
- **T5:** `ProponerReprogramacionDto` exige `sub_espacio` (`MENSAJE_SUBESPACIO_PROPUESTO`). Para cambiar solo la hora se envía el sub-espacio vigente; para cambiar solo el lugar, la franja vigente.
- **K4 redefinida (D-2):** la propuesta debe diferir de la reserva vigente en **la franja o el sub-espacio**. Si es idéntica en ambos → **400** `La propuesta es igual a la reserva vigente (misma franja y mismo sub-espacio): no hay nada que reprogramar.` Antes, una propuesta con la misma franja era siempre inválida; ahora es válida si cambia el lugar (Q-A6).
- **K5 y L4:** CA-06 de la propuesta se evalúa en el **sub-espacio propuesto**, excluyendo la propia solicitud: cambiar solo de lugar en la misma franja no choca consigo misma.
- **L7 y L8:** el *compare-and-set* de T7 exige también el `sub_espacio_propuesto` leído. Aceptar mueve `sub_espacio` al propuesto y limpia la propuesta; T8 la limpia.
- **Propuesta sin lugar (`NULL`):** durante el *expand*, T7 la leía como «el mismo lugar» (`?? sub_espacio`): era el único significado posible para una propuesta escrita antes de la Fase 7. **Desde el *contract* es imposible (M4)** y, si apareciera, T7 responde 409 `MENSAJE_PROPUESTA_NO_DISPONIBLE` sin suponer un lugar (C-4, `158e104`, A-11b). El frontend conserva el `??` solo al **mostrar** una propuesta.
- **K9 ampliado al motor (M4), aplicado en el *contract* (7A.8, 2026-10-26):**

```sql
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_propuesta_subespacio_check"
  CHECK ((fecha_propuesta_inicio IS NULL) = (sub_espacio_propuesto IS NULL));
```

  - **Por qué no en el *expand*:** M4 habría rechazado las propuestas que el código anterior a la Fase 7 escribía sin lugar, y ese código siguió en uso hasta el merge del PR #10.
  - **Su poblado en el *contract*:** las filas con franja propuesta y sin lugar reciben `sub_espacio_propuesto = sub_espacio` (copiar el valor de cada fila, no un literal), con la misma condición que M4. En producción tocó **0 filas**: no había propuestas pendientes (precheck 7A.8.0).
  - M4 entra en la familia K9: I-12 verifica ahora las **cuatro** restricciones con su definición exacta.

### 2.7 Auditoría del ajuste: lugar y franja (Decisiones SE7 y P-1, amplían CA-09)

- Cuatro columnas nuevas en `Log_Auditoria`, todas `NULL`: `sub_espacio_anterior`, `sub_espacio_nuevo`, `fecha_inicio_anterior` y `fecha_fin_anterior`. Las filas existentes quedan intactas (DT-3), con el mismo patrón que `motivo_reprogramacion` y `motivo_rechazo` (ADR-005 §2.9 y §2.10).
- **P-1, aprobada el 2026-10-22:** el log registra también la franja que pidió el solicitante cuando el Staff la mueve al validar (rescate, Q-B2). Sin esto, D2 dejaba cambiar las fechas sin constancia de las originales.
- **El ajuste siempre viaja con un cambio de estado** (T1 o T7), así que se registra en **el mismo log** de esa transición y CA-09 conserva su regla: hay log si y solo si cambia el estado. Solo se registra lo que **de verdad** cambió: reenviar las mismas fechas no es un ajuste que auditar.
- **Garantizado por el motor** (seis `CHECK`, verificados con su definición exacta en I-31b):

| # | Restricción | Regla |
|---|---|---|
| A1 | `Log_Auditoria_sub_espacio_completo_check` | El par del sub-espacio va completo o no va |
| A2 | `Log_Auditoria_sub_espacio_cambio_real_check` | Si se registra un cambio, es un cambio real |
| A3 | `Log_Auditoria_sub_espacio_segun_estado_check` | Solo en un log que termina en `Validado` (T1 o T7) |
| F1 | `Log_Auditoria_franja_anterior_completa_check` | La franja anterior va completa o no va |
| F2 | `Log_Auditoria_franja_anterior_valida_check` | La franja anterior era válida (fin posterior al inicio) |
| F3 | `Log_Auditoria_franja_anterior_segun_estado_check` | Solo en un log que termina en `Validado` |

- **Deuda aceptada (DA-2):** las proyecciones del detalle todavía **no** exponen estas cuatro columnas, así que la línea de vida no muestra el ajuste. La auditoría está completa en la base (Q-A12). Mostrarla en el historial queda para un paso posterior (§6).

### 2.8 Backfill histórico (Decisión SE8)

- **Todas** las filas existentes reciben `sub_espacio = 'ESTUDIO_COMPLETO'` (Q-A7, D-3). Va en un `UPDATE` explícito y no como efecto del `DEFAULT`, porque es una decisión de negocio y el `DEFAULT` es temporal.
- `sub_espacio_propuesto` queda en `NULL` en todas las filas (§2.6: su poblado va con M4 en el *contract*).
- **Por qué es seguro con datos reales:** la restricción global garantizaba que ninguna solicitud activa se traslapaba con otra. Con todas en `ESTUDIO_COMPLETO`, las dos restricciones nuevas ven exactamente el mismo conjunto de filas que la global y se cumplen. El precheck lo confirmó en producción (`traslapes_activos = 0`).
- El backfill **no cambia `estado`**, así que no genera log (CA-09). Su trazabilidad es la propia migración versionada, con *checksum*, y este ADR. No es el `UPDATE` manual que prohíbe ADR-005 §1: es un cambio de esquema revisado, ensayado y registrado.
- Para liberar un sub-espacio de una solicitud heredada se usan los caminos normales: «Validar con ajustes» si está en `Recibido`, o la reprogramación por mutuo acuerdo si está validada.

### 2.9 Estado final «No atendida» y T10 (Decisiones NA1 a NA4)

- **NA1 · Estado.** `'No atendida'` entra en `ESTADOS`, es **final** (los finales se derivan de la tabla) y **libera la franja**: está en `ESTADOS_QUE_LIBERAN_FRANJA` y en el `WHERE` de las dos restricciones. Como `estado` es `TEXT`, no hubo `ALTER TYPE`.
- **NA2 · T10.** `{ id: 'T10', accion: 'CERRAR_NO_ATENDIDA', origen: 'Recibido', destino: 'No atendida', rol: STAFF }`, por el `PATCH` del tablero.
  - Precondición: el inicio de la franja guardada es **anterior o igual** al «ahora» del `Reloj` (D7 invertida, con la misma frontera). Con la franja futura → **409** `MENSAJE_NO_ATENDIDA_FRANJA_FUTURA`.
  - Con fechas en la misma petición → **400** `MENSAJE_NO_ATENDIDA_SIN_FECHAS`: se cierra la franja **registrada**.
  - El frontend ofrece «Cerrar como no atendida» solo con la franja ya iniciada según su reloj (`accionesVisiblesDelStaff`). Si el reloj difiere, decide el servidor.
- **NA3 · Sin motivo libre.** `motivo_rechazo` sigue admitiéndose solo con `Rechazado` (E5 y el `CHECK` R1). El solicitante ve un texto fijo, propiedad del frontend: **«La solicitud no pudo ser procesada a tiempo por el Estudio C.»** T2 sigue disponible cuando la decisión es realmente un rechazo con motivo.
- **NA4 · Sin cierre automático (Q-B3).** No hace falta un actor «sistema»: `modificado_por` sigue siendo un FK a `Usuario`, tomado del JWT.
- **Colisión de nombre:** ADR-005 §3 había reservado el nombre «T10» para el retiro de una propuesta por el Staff, que nunca se implementó. Desde la Fase 7, **T10 es «No atendida»** y el retiro sigue pendiente, sin id. ADR-005 y ADR-006 llevan una nota (y ADR-004, por la forma de la Decisión Y).

### 2.10 La migración y el orden *expand/contract* (Decisiones MG1 y EX)

Una sola migración escrita a mano (Decisión AB), `20261023120000_ca06_subespacios`, con `BEGIN … COMMIT` y LF:

| Paso | Qué hace |
|---|---|
| 1 | `CREATE TYPE "SubEspacio" AS ENUM (…)` |
| 2 | `ADD COLUMN sub_espacio` y `ADD COLUMN sub_espacio_propuesto`, ambas admitiendo `NULL` al crearse |
| 3 | Backfill SE8: `UPDATE "Solicitud" SET "sub_espacio" = 'ESTUDIO_COMPLETO'` |
| 4 | `SET DEFAULT 'ESTUDIO_COMPLETO'` (temporal) y `SET NOT NULL` |
| 5 | `Log_Auditoria`: las cuatro columnas de SE7 y P-1 y los seis `CHECK` A1 a A3 y F1 a F3 |
| 6 | `DROP CONSTRAINT "Solicitud_sin_traslape_ca06"` y `ADD` de las dos restricciones SE2, con `'No atendida'` |

**EX · Orden *expand/contract*.** Cada paso deja el sistema funcionando con el código anterior y con el nuevo:

| Momento | Qué se publica | Por qué en ese orden |
|---|---|---|
| 7A.1 | El detector reconoce los nombres nuevos sin olvidar el global | Una carrera nunca responde 500, haya o no migración |
| 7A.2 | T10 y «No atendida» en la máquina, antes de que el motor libere esa franja | La máquina es la fuente única; sus textos no prometían liberar la franja |
| 7A.3 | La migración (*expand*) con el `DEFAULT` temporal y sin M4 | El código anterior sigue creando solicitudes y propuestas sin lugar |
| 7A.4 a 7B.3 | El servicio, la API y la interfaz con sub-espacio | La interfaz siempre envía el sub-espacio |
| 7A.7 | Aplicación en producción con `npm run db:migrate` | Única vía permitida contra Supabase (Decisión AA) |
| **7B.4** | La regla por categoría (SE10) | Antes de retirar el `DEFAULT`, para que el camino de los servicios ya escriba su lugar de forma explícita y probada |
| **7A.8 (*contract*, ✅ 2026-10-26)** | Poblado, M4 y `DROP DEFAULT` (`20261027120000_ca06_subespacios_contract`); detector sin la restricción global y oráculos verificados contra el motor (I-9, I-30a); T7 *fail-closed* | Solo es seguro cuando el único código en uso ya envía siempre el sub-espacio: se aplicó después del merge del PR #10. Postcheck en producción: las 18 columnas en su valor y conteos idénticos (26 / 40 / 5) |

- **Verificación previa de solo lectura en producción (`precheck-7a.sql`):** siete bloqueantes, entre ellos `restriccion_global_instalada = 1`, `traslapes_activos = 0` y la ausencia de todo lo que la migración crea.
- **Ensayo:** en la base desechable, protegida por la guardia de tres capas (Decisión AI), y en un PostgreSQL local: aplicación limpia, *checksum*, precheck y postcheck completos.
- **Verificación posterior (`postcheck-7a.sql`):** registro de Prisma con el *checksum* (`5695…8fab`), el tipo, las columnas con el `DEFAULT` temporal, los seis `CHECK`, las dos exclusiones validadas con sus índices válidos y sus predicados exactos, la restricción global retirada, `Solicitud_fechas_validas_check` intacta y conteos de filas **idénticos** a los del precheck (DT-3).
- **Operación:** un `ACCESS EXCLUSIVE` breve sobre `Solicitud` mientras se construyen los dos índices; con el volumen actual es despreciable.
- **Reversión:** una migración **nueva** que restaure la restricción global, documentada en la cabecera de la migración. **Solo es posible mientras no existan reservas paralelas activas**; después, la restricción global fallaría al crearse y, por ser transaccional, no dejaría nada a medias. Las columnas se conservan siempre (DT-3).

### 2.11 «Validar con ajustes» en la vista del Staff (Decisión VA)

- **No es una transición nueva:** es otra forma de ofrecer T1. No está en la tabla de la máquina, que el contrato compara con el backend. Vive en `presentacion/acciones-staff.ts` como `OpcionDelStaff`: un botón más, justo después de «Validar», con el mismo destino y el mismo `PATCH`. El tipo impide asociar un ajuste a otra transición.
- **Parte de lo pedido:** los campos se abren con la franja y el sub-espacio del solicitante. `aCamposBogota()`, el inverso de `aIsoBogota()`, lee el instante en la hora de Bogotá y nunca en la del navegador (`test:tz`). En T5 la franja se abre vacía (DR5), pero el ajuste suele corregir una sola cosa.
- **Cuerpo mínimo:** `ajusteAlValidar()` envía solo lo que cambió. Reenviar la franja guardada no es inocuo: el servidor aplica CA-04 a toda franja que recibe, y una franja válida al radicar podría no serlo hoy.
- **Sin cambios no se confirma:** `razonBloqueoDelAjuste()` remite a «Validar». Es la misma regla para habilitar y para explicar (B3).
- **`CambiosTablero` más estrecho que el servidor:**
  - siempre lleva un destino;
  - la franja y el lugar solo pueden ir con `Validado`;
  - la franja va completa o no va.

  Con esto el cliente **no puede producir** la deuda DA-1 (§3).
- **Rescate (Q-B2):** con la franja vencida, el aviso DA4 nombra primero «validarla con ajustes en una franja futura».

### 2.12 Fuera de alcance (Decisión SE9)

Actividades externas al Estudio (D-1), aforo por sub-espacio (D-7: `num_participantes` sin `CHECK`), reglas de incompatibilidad entre servicios (Q-A9), horarios por sub-espacio (Q-A10), turnos del personal (Q-A8, el sistema no lo modela), cierre automático (Q-B3) e inventario (DT-1).

### 2.13 El sub-espacio según la categoría (Decisión SE10)

- **Directriz del Responsable del 26/10/2026, que modifica la decisión de Q-A3:** solo la categoría «Solicitud de espacio físico» (`ESPACIOS`) elige el sub-espacio al radicar, y ahí es obligatorio (CA-12). En las demás categorías el solicitante no lo elige y el servicio guarda `ESTUDIO_COMPLETO` (`SUB_ESPACIO_DE_SERVICIOS`, CA-18). PRD v2.3.
- **Fuente única:** `subEspacioAlRadicar()` en `reglas/sub-espacios.ts`, un módulo puro. El frontend copia la categoría (`CATEGORIA_QUE_ELIGE_SUB_ESPACIO`) y `contrato.test.ts` vigila que no diverja.
- **Un servicio que envía un sub-espacio recibe 400** (`El sub-espacio solo se elige en una solicitud de espacio físico; para los demás servicios lo asigna el Estudio C.`): no se ignora en silencio, con el mismo criterio de E5 y D-4. Una solicitud de espacio físico sin él recibe 400 del pipe. En el cliente, la unión discriminada `CuerpoCrearSolicitud` hace que ninguno de los dos cuerpos compile.
- **B2:** el selector solo aparece en «Solicitud de espacio físico»; en un servicio se explica que el Estudio C reserva el espacio completo y que el Staff puede ajustarlo. Cambiar de categoría borra la elección.
- **Sin `CHECK` que ate categoría y lugar:** el Staff puede reducir el completo de un servicio al validar (D-4). La regla aplica **al radicar**, no al dato.
- **Riesgo de capacidad, aceptado por el stakeholder:** un servicio bloquea los dos sub-espacios hasta que el Staff lo ajuste, y al radicar puede recibir 409 si a esa hora ya hay una cabina o un estudio reservados.
- **Datos existentes:** los servicios radicados con un lugar elegido entre el 7A.7 y el 7B.4 se conservan (DT-3).

---

## 3. Preguntas resueltas y deuda aceptada

| # | Tema | Resolución |
|---|---|---|
| P-1 | ¿El log de T1 registra la franja anterior en el rescate? | **Aprobada** (2026-10-22). Columnas `fecha_*_anterior` y `CHECK` F1 a F3 en la misma migración (§2.7). T7 también la registra |
| P-2 | Edición de fechas en `Recibido` **sin** aprobar (D2, permitida y sin log) | Se conserva como está. Queda la asimetría: la franja se puede editar suelta y el sub-espacio no (D-4). La interfaz no la ofrece |
| DA-1 | Fechas enviadas junto con `RECHAZAR` | El servidor las acepta (D2 en `Recibido`) y no las registra: F3 solo admite la franja anterior en un log que termina en `Validado`. **Deuda aceptada en el servidor**; el cliente no puede producirla porque `CambiosTablero` no lo compila (§2.11) |
| DA-2 | El historial no muestra los ajustes de lugar y de franja | Auditoría completa en la base; las proyecciones aún no exponen las columnas (§2.7). Aprobado como deuda documentada el 2026-10-23 |
| DA-3 | M4 todavía no protege la propuesta completa (franja **y** lugar) | ✅ **Resuelta** (2026-10-26): M4 aplicada en producción y T7 *fail-closed* ante una propuesta sin lugar (§2.6) |

---

## 4. Verificación

| Decisión | Pruebas |
|---|---|
| SE3 | `traslape-ca06.spec.ts`: los nombres de la lista se reconocen; `_v2` y un tercer nombre de la familia, no · I-30: el `23P01` real de cada sub-espacio físico es CA-06 y un nombre ajeno no |
| NA1 a NA3 | `maquina-estados.spec.ts` (T10, «No atendida» final) · U-33 a U-39 (T10 en el servicio: frontera de tiempo, fechas en la misma petición y estados de origen) · frontend: `contrato.test.ts`, insignia «No atendida», `MENSAJE_NO_ATENDIDA` en la línea de vida |
| SE1, SE2, SE4, SE8, MG1 | `sub-espacios.spec.ts` (oráculo del PRD y relación derivada del SQL) · `estados.spec.ts` (cada `NOT IN`) · I-31: alineación exacta de columnas, `DEFAULT` y `CHECK` · I-32: comportamiento del motor (CA-06.2 conviven, CA-06.3 choca en los cuatro cruces, el `DEFAULT` se comporta como la global, «No atendida» libera, A3 y F3) |
| SE5, D-4, SE7, P-1 | U-40 a U-48 (`create` y `update` con sub-espacio, 400 y 409 de D-4, CA-06 al cambiar solo el lugar, log del ajuste) · R-13 |
| SE6 | R-14 a R-17 (K4 ampliada, solo lugar, solo fecha, ambos) · A-14 a A-17 (T7 traslada y audita; propuesta `NULL` = mismo lugar) · e2e 40b (400 del pipe por un sub-espacio inválido en T5) |
| Concurrencia | I-33: `create()` por sub-espacio en carreras (el motor resolvió 7 de 8 en I-33c y 5 de 5 en I-33d) · I-34: T1, T5 y T7 con sub-espacio, incluida la carrera de dos Staff que validan con lugares distintos (gana uno y el log describe exactamente su ajuste) |
| Frontend (7B.1 a 7B.3) | Esquemas Zod estrictos y deriva del enum contra Prisma · B2 sin opción marcada, envío del elegido y bloqueo sin elección · T5 arranca en el lugar vigente · insignias, tarjetas, detalle y propuesta (solo se tacha lo que cambia) · «Validar con ajustes»: campos prellenados, bloqueo sin cambios, solo lugar, solo franja, rescate, aviso local de CA-04, 409 de CA-06 y borrador abandonado · `aCamposBogota` y `camposDeLaFranja` en las 4 zonas (`test:tz`) · `@ts-expect-error` para los cuerpos imposibles |
| Producción (7A.7) | Precheck con todos los bloqueantes en su valor · `prisma migrate status` con una sola pendiente · `npm run db:migrate` · postcheck con los 20 valores esperados y conteos idénticos · tablero con lo histórico como «Estudio C completo» |
| SE10 (7B.4) | `sub-espacios.spec.ts` (`subEspacioAlRadicar` por categoría) · SE10-a a SE10-c (servicio) · e2e 45a a 45d · `update-solicitude.dto.spec.ts` (el pipe y el PATCH) · I-33e (un servicio choca con una cabina) · frontend: B2 condicional, borrado al cambiar de categoría, cuerpos sin lugar en un servicio, `@ts-expect-error` y deriva de la categoría en `contrato.test.ts` |
| *Contract* (7A.8) | I-35a (sin lugar → 23502) · I-35b a I-35d (M4 en sus dos sentidos y la propuesta completa) · I-12 con las cuatro restricciones K9 · I-31a sin `DEFAULT` · oráculos verificados carácter por carácter contra el motor (I-9 e I-30a) · 4g a 4i (la restricción global ya no es CA-06) · A-11b (T7 *fail-closed*) · ensayo local de la migración, incluida su atomicidad · precheck y postcheck en producción |

Al cierre del *expand*: 84 pruebas de integración; al cierre del *contract* (2026-10-26): backend `npm test` 884 + 1 omitida, `test:tz` 769 en las 4 zonas, `test:e2e` 76 e integración 89; frontend 522 en las 4 zonas; lint en 0 en los dos proyectos.

---

## 5. Consecuencias

- **Positivas:**
  - el Estudio se usa en paralelo sin perder la garantía del motor;
  - el completo y el histórico se expresan sin tablas nuevas, y no hay dependencia de `btree_gist`;
  - el registro distingue un rechazo de una solicitud no atendida;
  - todo ajuste de lugar o de franja queda auditado en la misma transacción que lo produce;
  - la migración se aplicó sin vaciar ni alterar ninguna fila existente salvo el backfill documentado.
- **Riesgos aceptados:**
  - un tercer sub-espacio requiere una migración (SE2);
  - el detector depende del formato de los mensajes de Prisma 5.22 (ya aceptado en ADR-004);
  - la reversión deja de ser posible en cuanto existan reservas paralelas (MG1);
  - el calendario permite dos actividades simultáneas aunque el sistema no modela al personal (operable según Q-A8);
  - las deudas DA-1 a DA-3 (§3).
- **Mantenimiento:** cambiar la lista de estados que liberan la franja o la relación de conflicto requiere una migración nueva que recree **las dos** restricciones. `estados.spec.ts` y `sub-espacios.spec.ts` fallan si alguien cambia solo el código.

---

## 6. Pendiente

- ✅ **7A.8 · *contract*:** cerrado el 2026-10-26 (§2.10). El `sub_espacio` obligatorio para todas las categorías se reemplazó por SE10 (§2.13), y el respaldo `?? sub_espacio` de T7 se retiró a favor del 409 *fail-closed*.
- **DA-2:** exponer las columnas del ajuste en las proyecciones y mostrarlas en la línea de vida.
- **Texto de T10:** desde 7A.7 el motor libera la franja de una solicitud «No atendida». El diálogo puede decirlo, porque hoy evita prometerlo a propósito.
- **ADR-005 §3:** el retiro de una propuesta por el Staff sigue sin implementar (ahora sin id).

---

## 7. Historial de implementación

| Commit | Paso |
|---|---|
| — | 7A.0 · Precheck de solo lectura en producción (`precheck-7a.sql`): bloqueantes en su valor, `traslapes_activos = 0` |
| `1758018` | 7A.1 · El detector de CA-06 reconoce la lista cerrada de restricciones por sub-espacio (*expand*) |
| `b7541a5` | 7A.2 · Estado final «No atendida» (T10): el Staff cierra una solicitud vencida en `Recibido` |
| `beeff60` | 7A.3 · Migración de sub-espacios: CA-06 por sub-espacio físico, «No atendida» libera la franja y auditoría del ajuste (*expand*) |
| `e4bb218` | 7A.4 · CA-06 por sub-espacio en el servicio: el Staff ajusta el sub-espacio solo al validar y el log registra el ajuste |
| `e918aaf` | 7A.5 · CA-10 con sub-espacio: la propuesta cambia la franja, el lugar o ambos, y T7 traslada y audita el cambio |
| `5723509` | 7A.6 · Batería de integración de sub-espacios: creación, T1, T5 y T7 contra la base real, también en carreras |
| `c2dfd63` | 7B.1 · El contrato y las vistas muestran el sub-espacio y el lugar propuesto |
| `178da2c` | 7B.2 · El solicitante elige el sub-espacio al radicar y el Staff lo propone en la reprogramación |
| `ad854fd` | 7B.3 · El Staff valida con ajustes de franja y sub-espacio en un solo `PATCH` (rescate Q-B2) |
| `dd8ff70` | 7B.3 · El panel del solicitante y la confirmación del radicado muestran el sub-espacio |
| — | 7A.7 · `npm run db:migrate` en producción (2026-10-23), con precheck y postcheck |
| `405ce6c` · `c85e061` | 7A.9 · Este ADR, las notas de ADR-004, ADR-005 y ADR-006 y los README |
| `792ee30` | Merge del PR #10 en `develop` (punto de partida del *contract*) |
| — | 7A.8.0 · Precheck del *contract* en producción: 11 bloqueantes en su valor, 26 / 40 / 5, `propuestas_a_poblar = 0` |
| `e76e8ba` | 7B.4 y 7A.8.2 · El sub-espacio solo se elige en una solicitud de espacio físico (SE10) y migración del *contract* (poblado, M4 y `DROP DEFAULT`) |
| `158e104` | 7A.8.1 · El detector de CA-06 ya no reconoce la restricción global y T7 rechaza una propuesta sin lugar |
| — | 7A.8.3 · `npm run db:migrate` en producción (2026-10-26) y postcheck con las 18 columnas en su valor |
| — | 7A.8.4 · Este ADR completo, los README y el PRD v2.3 |
