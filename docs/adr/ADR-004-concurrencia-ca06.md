# ADR-004 — Concurrencia y anti-traslape (CA-06) garantizados por el motor

| Campo | Valor |
|---|---|
| **Estado** | ✅ Aceptado |
| **Fecha** | 2026-10-03 |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `feat/fase-4-concurrencia-ca06` |
| **Complementa a** | [ADR-002](ADR-002-autorizacion-a-nivel-de-dato.md) (la Decisión H de minimización se extiende a CA-06) y [ADR-003](ADR-003-reglas-de-horario.md) (sus reglas puras se reutilizan en `update()`) |
| **Relacionado con** | PRD v2.1 §13 · CA-06 (dos solicitudes de cualquier categoría con horario traslapado: el sistema lo impide) · CA-09 (auditoría) |

---

## 1. Contexto

El diagnóstico de la Fase 4 encontró que CA-06 **funcionaba con una petición, pero no con dos al mismo tiempo**:

1. **Condición de carrera TOCTOU en `create()`.** El anti-traslape era un `findFirst` seguido de un `create`, en dos sentencias y sin transacción. Dos peticiones simultáneas podían ver la franja libre y guardar ambas. **Medido:** con 10 peticiones simultáneas sobre la misma franja se guardaron **10 de 10** reservas traslapadas.
2. **El mensaje de CA-06 revelaba el radicado de otra persona**, en contra de la Decisión H de ADR-002.
3. **`update()` no revalidaba nada.** Movía fechas sin CA-04 ni CA-06, combinaba una edición parcial con las fechas guardadas sin validar el resultado, permitía reactivar una solicitud `Rechazado` sobre una franja ya ocupada y, si llegaban `estado` y fechas en la misma petición, **descartaba las fechas en silencio**.
4. **El esquema se aplicaba con `prisma db push`**, sin historial de migraciones: no había dónde versionar una restricción que `schema.prisma` no puede expresar.

Hechos que el experimento previo (Paso 4.2, PostgreSQL 17 y Prisma 5.22.0 en una base desechable) estableció antes de escribir código:

- Prisma 5.22 reporta la violación de una restricción de exclusión como **`PrismaClientUnknownRequestError` sin `code`**: el SQLSTATE `23P01` y el nombre de la restricción solo aparecen dentro de `message`.
- Ese `message` incluye el **`DETAIL` del motor**, que contiene la franja de la otra reserva. El `23514` de un `CHECK` incluye la **fila completa**, con datos del usuario.
- Los *rollbacks* son completos (escrituras anidadas y `$transaction`) y `migrate diff` **no** ve la restricción como *drift*.

---

## 2. Decisiones

### CA-06 garantizado por el motor, con defensa en profundidad (Decisiones Y y Z)

```sql
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_fechas_validas_check" CHECK (fecha_fin > fecha_inicio);
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_sin_traslape_ca06"
  EXCLUDE USING gist (tsrange(fecha_inicio, fecha_fin, '[)') WITH &&)
  WHERE (estado NOT IN ('Rechazado', 'Cancelado por el Usuario'));
```

- **Y:** la garantía de CA-06 es una **restricción de exclusión**: la base de datos hace imposible guardar dos solicitudes activas traslapadas, venga la escritura de `create()`, de `update()`, de un cambio de estado o de SQL manual. Se descartaron una transacción `Serializable` y un *advisory lock* porque ambas dependen de que cada camino de escritura recuerde usarlas. La consulta previa (`findFirst`) se conserva solo como **capa amable**: responde rápido en el caso secuencial. `'[)'` es el mismo intervalo semiabierto de CA-04 (Decisión L), y `tsrange` corresponde a columnas `timestamp(3)` sin zona en UTC. No hace falta `btree_gist`: no hay columna escalar en la comparación.
- **Z:** el `CHECK` se crea **antes** que el `EXCLUDE`. PostgreSQL evalúa los `CHECK` antes de los índices, así que unas fechas invertidas producen un `23514` claro en lugar del error interno de `tsrange`.

**Evidencia en producción de la Decisión Y:** en la prueba de integración I-1 (10 peticiones simultáneas por la misma franja contra PostgreSQL real), **las 9 peticiones rechazadas pasaron la consulta previa y las detuvo el motor (9 de 9)**. La consulta previa, por sí sola, no protege nada bajo concurrencia.

### Migraciones versionadas (Decisiones AA y AB)

- **AA:** el esquema se versiona con **Prisma Migrate**. La migración `0_init` es el *baseline* de la base que ya existía, registrada con `migrate resolve --applied` (su SQL nunca se ejecutó en Supabase). Contra Supabase solo se usa `prisma migrate deploy` (`npm run db:migrate`). `migrate dev`, `db push` y `migrate reset` quedan prohibidos (README §2.1). El `.gitattributes` fuerza **LF** en los `.sql` para que el *checksum* que guarda Prisma sea idéntico en Windows, en el CI y en la base (verificado con `sha256sum`).
- **AB:** las migraciones que `schema.prisma` no puede expresar se escriben **a mano**, envueltas en `BEGIN`/`COMMIT` (Prisma no las envuelve en una transacción; el DDL de PostgreSQL sí es transaccional: se crean todas las restricciones o ninguna). Cada migración se **ensaya byte a byte** en la base desechable antes de producción, y una migración aplicada **nunca se edita**.

### Traducción segura del error del motor (Decisiones AC, AD, AE y AF)

- **AC:** `esViolacionDeTraslapeCa06(error: unknown)` exige la **clase** (`PrismaClientUnknownRequestError`) y una **firma anclada**: `code: "23P01", message: "…\"Solicitud_sin_traslape_ca06\""`. La parte `(?:[^"\\]|\\.)*` recorre solo el campo `message` sin cruzar una comilla real. Como el formato *Debug* de Rust escapa los datos del usuario que viajan en el `DETAIL`, nadie puede imitar la firma, y una restricción futura con el mismo SQLSTATE no se disfraza de CA-06. No depende del idioma del servidor. Todo lo demás devuelve `false` (*fail-closed*).
- **AD:** CA-06 responde **409 Conflict** con un único `MENSAJE_CA06`, idéntico si el conflicto lo detecta la consulta previa o el motor. No incluye el radicado, la franja ni el `DETAIL`. Un 400 significaría "petición mal formada"; aquí la petición es válida y choca con el estado del recurso.
- **AE:** despliegue *expand/contract*: primero se publicó el código que traduce el `23P01` (4.4a) y después la restricción que lo produce (4.4b). En ningún momento una carrera respondió 500.
- **AF:** cuando el motor resuelve una carrera se emite un `logger.warn` con el radicado **propio**, nunca con `error.message`. Es una métrica de concurrencia real sin datos de terceros.

### `update()` en un único camino (Decisión AG)

1. Un único "ahora" por petición (Decisión U).
2. **Franja y estado efectivos:** una edición parcial se combina con lo guardado **antes** de validar.
3. **Las reglas de horario se evalúan solo si cambian las fechas.** Marcar `Entregado` una reserva que ya ocurrió no debe fallar con `EN_EL_PASADO`.
4. **CA-06 se consulta** solo si el resultado ocupa la franja **y** cambian las fechas o se **reactiva** una solicitud desde un estado que la libera. Se excluye la propia solicitud (`NOT: { radicado }`), así una reprogramación nunca choca consigo misma.
5. **`es_urgencia` se recalcula** con el `Reloj` al reprogramar (Opción A: la anticipación real que queda).
6. **Estado y fechas se aplican juntos.** Con cambio de estado: actualización y log en una `$transaction` (CA-09). Sin cambio de estado: una sola sentencia, ya atómica.

### Fuente única de los estados que liberan la franja (Decisión AH)

`ESTADOS_QUE_LIBERAN_FRANJA` (`reglas/estados.ts`) alimenta `create()`, `update()` y `ocupaFranja()`. Un estado desconocido **ocupa** la franja, igual que en el motor. La lista existe dos veces (TypeScript y el `WHERE` de la migración), así que se vigila dos veces: `estados.spec.ts` **lee el SQL de la migración** en cada `npm test`, y la prueba de integración I-6 lee `pg_get_constraintdef` de la base real.

### Pruebas de integración seguras (Decisiones AI y AJ)

- **AI:** guardia de tres capas, todas *fail-closed*:
  1. **Identidad del proyecto:** la referencia sale del usuario (`postgres.<ref>`) **o** del host (`db.<ref>.supabase.co`) y se compara con **todas** las URLs de `backend/.env`, incluidas las duplicadas y las comentadas.
  2. **Confirmación explícita:** `INTEGRACION_CONFIRMO_DESECHABLE`.
  3. **Centinela dentro de la base:** `guardia.bd_desechable`, en un esquema que `migrate diff` no inspecciona, verificado antes de cada `TRUNCATE`.

  Nace de un incidente del Paso 4.2: la guardia anterior comparaba el **usuario** de la URL, y con la conexión directa (usuario `postgres` a secas) la comparación habría pasado contra cualquier proyecto. Se verificó que producción no fue afectada.
- **AJ:** la integración es una batería aparte (`*.int-spec.ts`, `globalSetup`, `maxWorkers: 1`, `npm run test:integracion`), de modo que `npm test` nunca necesita una base de datos. `Math.random` se fija en las carreras para que una colisión aleatoria del radicado (deuda conocida) no se confunda con un resultado de CA-06.

---

## 3. Verificación

| Decisión | Pruebas que la protegen |
|---|---|
| Y | `solicitudes.service.spec.ts` (pre-validación con `select` mínimo) · integración **I-1** (10 `create()` simultáneos: 1 creada y 9 con 409; 9 de 9 resueltas por el motor) · **I-5** (2 `update()` simultáneos) · **I-7** (frontera `[)`) |
| Z | Integración **I-4** (`23514` real, no reconocido como CA-06) |
| AA, AB | Ensayo de la migración en la base desechable · `migrate status` y `migrate diff` vacíos · *checksum* igual al `sha256sum` · atomicidad demostrada: con datos traslapados el `EXCLUDE` falla y no queda **ninguna** restricción |
| AC | `traslape-ca06.spec.ts` (18 casos con mensajes reales: firma imitada en el `proposito`, otra restricción con nuestro nombre en el `DETAIL`, sufijo `_v2`, idioma español, otras clases de error) · canarios de integración **I-2** e **I-3** |
| AD, AF | `solicitudes.service.spec.ts` (409 exacto, sin radicado ni `DETAIL`; aviso con el radicado propio) · e2e 23 a 25 y 27 a 28 (por HTTP: 409 y un 500 genérico sin `DETAIL`) |
| AG | `solicitudes.service.spec.ts` U-1 a U-14 · e2e 26 a 29 |
| AH | `estados.spec.ts` (contra el SQL de la migración) · integración **I-6** (contra `pg_constraint`) |
| AI | `guardia-bd.spec.ts` (27 casos, incluido **el incidente 4.2**) · `centinela.spec.ts` · ensayo del `globalSetup` con el `.env` real: rechaza la conexión directa de producción |
| AJ | **I-8** (sin huérfanos en `Solicitud_Recurso` tras una carrera con recursos anidados) |

**Pruebas de mutación.** Cada paso se mutó en copias temporales, con anclas que deben aparecer exactamente una vez. Por paso: 4.3 (6 de 6), 4.4a (9 de 9), 4.5 (13 de 13) y 4.6a (9 de 9). El análisis de mutaciones **encontró dos pruebas faltantes antes del commit** (casos 5b y 7b del detector). Algunas:

| Mutación | Detectada por |
|---|---|
| Volver a las dos coincidencias independientes del primer diseño del detector | Casos 7 y 7b (otra restricción con nuestro nombre en el `DETAIL`) |
| Quitar el `await` de `return await` dentro del `try` | U-10, U-11 y la prueba 3 de `create()` |
| Validar el horario en toda edición | U-3, U-14 y e2e 29 |
| Quitar `NOT: { radicado }` | U-5 |
| Agregar `'Entregado'` a los estados que liberan la franja | `estados.spec.ts` (contra el SQL) |
| **Reintroducir la guardia vieja** (identidad solo por el usuario) | 9 pruebas de `guardia-bd.spec.ts` |

**Resultado al cierre:** `npm test` 300 pruebas (299 ✅ y 1 omitida por diseño) · `npm run test:e2e` 30 ✅ · `npm run test:tz` 4 zonas × 219 ✅ · `npm run test:integracion` 8 ✅ contra PostgreSQL 17.

---

## 4. Consecuencias

- **Positivas:** CA-06 ya no depende de la disciplina de cada camino de escritura; los mensajes no filtran datos de terceros; el esquema tiene historial reproducible; la base de pruebas se reconstruye con las mismas restricciones que producción.
- **Riesgo aceptado:** el detector depende del formato del mensaje de Prisma 5.22. Si una actualización lo cambia, un conflicto respondería 500, pero **nunca** se guardaría un traslape: la garantía está en el motor. Los canarios I-2 e I-3 fallan en ese caso antes de llegar a producción.
- **Mantenimiento:** cambiar la lista de estados que liberan la franja requiere una **migración nueva** que recree la restricción; `estados.spec.ts` falla si alguien cambia solo el código.
- **Operación:** `ADD CONSTRAINT` toma un bloqueo `ACCESS EXCLUSIVE` mientras construye el índice. Con 12 filas fue instantáneo; en una tabla grande requeriría una ventana de mantenimiento.

## 5. Deuda conocida (fuera del alcance de este ADR)

- **Calidad:** `chore(lint)` para los 2 errores previos (`main.ts` y `jwt-auth.guard.spec.ts`) y activar `typescript/no-explicit-any: "error"`, para que la herramienta haga cumplir la regla del proyecto.
- **Radicado:** colisión aleatoria (9000 valores por año) → `P2002` → 500. Reintento o secuencia.
- **ADR-002:** `update()` y `remove()` responden 400 con el radicado cuando no existe; falta el 404 uniforme.
- **Fase 5:** máquina de estados (transiciones válidas) y CA-10 (`Pendiente de Reprogramación`).
- **Esquema:** `estado` como enum de Prisma y una columna `fecha_radicacion` (necesaria para auditoría y para calcular la urgencia contra la radicación original).
- **CI:** GitHub Actions con `npm run test:tz` y `npm run test:integracion` sobre un contenedor de servicio `postgres:17` (la guardia ya admite `host:puerto/base`).
- **Frontend:** manejar el 409 de CA-06 en `POST` y `PATCH`, además de los pendientes de ADR-003.

## 6. Historial de implementación

| Commit | Paso |
|---|---|
| `1ceec06` | 4.1 · *Baseline* de migraciones (`0_init`), LF en `.sql` y retiro de `db push` |
| `5678747` | 4.3 · Detector tipado de violaciones de CA-06 (firma anclada de `23P01`) |
| `c171a17` | 4.4a · CA-06 responde 409 con mensaje mínimo y traduce la violación del motor en `create()` |
| `e9c25f7` | 4.4b · Restricción de exclusión CA-06 y `CHECK` de fechas (aplicada en producción con `npm run db:migrate`) |
| `7e4a1b9` | 4.5 · `update()` revalida CA-04 y CA-06 en un único camino |
| `6399a7a` | 4.6a · Guardia de BD por identidad del proyecto y confirmación explícita |
| `30d67a1` | 4.6b · CA-06 contra PostgreSQL real: guardia de 3 capas, canario de Prisma y alineación de la restricción |

Los pasos 4.0 (consultas de diagnóstico de solo lectura) y 4.2 (experimento en una base desechable) no produjeron commits: su resultado son las decisiones de este documento.
