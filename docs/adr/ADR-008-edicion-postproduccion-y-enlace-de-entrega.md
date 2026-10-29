# ADR-008 — Reglas por categoría: «Edición y postproducción», enlace del producto final y categoría inmutable

| Campo | Valor |
|---|---|
| **Estado** | ✅ Aceptado · implementado en `feat/fase-8-ux-estados-entregables` y migraciones aplicadas en producción el 2026-10-28 con precheck y postcheck |
| **Fecha** | 2026-10-28 |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `feat/fase-8-ux-estados-entregables` (desde `develop` @ `ee86285`) |
| **Complementa a** | [ADR-004](ADR-004-concurrencia-ca06.md) (AH: la fuente única de lo que libera la franja ahora depende también de la categoría) · [ADR-005](ADR-005-maquina-de-estados-ca10.md) (T11 y T12) · [ADR-006](ADR-006-frontend-contrato-tipado.md) (contrato Zod, `CambiosTablero`, acciones del Staff) · [ADR-007](ADR-007-subespacios-y-no-atendida.md) (SE2: el `WHERE` de las dos exclusiones se recrea; SE10: la categoría ya gobernaba el lugar) |
| **Relacionado con** | PRD v2.4 (§4, §6, §8 y CA-19 a CA-26) · las 6 directrices del tutor del 2026-10-26 · precheck 8.0 y 8.7, postcheck 8.7 |

---

## 1. Contexto

1. **Las directrices del tutor (2026-10-26):**
   - R1: el solicitante ve «Validado» como «Confirmado».
   - R2: el Staff ve «Validado» como «Revisado y aprobado».
   - R3: un estado obligatorio «Edición y postproducción» para Podcast y Video.
   - R4: un enlace `https` obligatorio del producto final al entregar.
   - R5: la categoría VIDEO pasa a llamarse «Dirección audiovisual y producción».
   - R6: la urgencia se muestra en rojo con contraste accesible.
2. **Todo depende de la categoría.** R3 y R4 cambian el camino y la entrega **según la categoría**, igual que SE10 (ADR-007 §2.13) ya cambiaba el lugar. Antes de esta fase esa regla vivía repartida en condiciones sueltas.
3. **Hechos de producción (precheck 8.0):**
   - 26 solicitudes, 40 logs y PostgreSQL 17.6;
   - una sola solicitud de las categorías con edición en curso: `EC-2026-3402` (VIDEO, en producción);
   - una entrega histórica de PODCAST sin enlace;
   - ninguna entrega de PODCAST o VIDEO con la franja en el futuro.
4. **Hallazgos del diagnóstico:**
   - **H1:** si «Entregado» volviera a ocupar la franja que «Edición» liberó, la entrega fallaría con `23P01` **para siempre** en cuanto otra reserva tomara ese tiempo.
   - **H2:** el `PATCH` del Staff aceptaba `categoria`: cambiarla después de radicar habría saltado las reglas que la categoría gobierna.
5. **Restricciones heredadas:**
   - DT-3: producción nunca se vacía.
   - `Solicitud.estado` es `TEXT` y **ningún `CHECK` limita sus valores** (fila 11 del precheck 8.7 = `ninguna`).

---

## 2. Decisiones

### 2.1 Fuente única por categoría (CT1)

- `reglas/categorias.ts` define `POLITICA_POR_CATEGORIA: Record<CategoriaSolicitud, { pasaPorEdicion, enlaceAlEntregar }>`.
- Es un `Record` sobre el enum de Prisma: una categoría nueva **no compila** hasta que se decide su política.
- De la tabla se derivan `CATEGORIAS_CON_EDICION`, `CATEGORIAS_CON_ENLACE` y `transicionAplicaALaCategoria()`.
- Se entregó primero sin cambio de comportamiento (8.1).
- El frontend guarda una **copia de vista** (`PASA_POR_EDICION`, `REQUIERE_ENLACE`) vigilada por `contrato.test.ts`, que lee la tabla del backend.

| Categoría | Pasa por edición | Enlace al entregar |
|---|---|---|
| PODCAST | sí | OBLIGATORIO |
| VIDEO | sí | OBLIGATORIO |
| STREAMING | no | OBLIGATORIO |
| ESPACIOS | no | PROHIBIDO |
| ASESORIAS | no | PROHIBIDO |

### 2.2 Presentación por rol (VI1 a VI3)

- **VI1 · Alias de estado:** `ALIAS_DE_ESTADO` y `etiquetaEstado(estado, perspectiva)` en el frontend.
  - El **dato** sigue siendo `Validado` en la API, la base y el log; solo cambia cómo se nombra según quién mira.
  - Así no hay migración ni se rompe el contrato.
- **VI2 · Etiqueta de VIDEO:** «Dirección audiovisual y producción». Solo cambia la presentación; el enum no se toca.
- **VI3 · Urgencia:**
  - Token semántico `--color-urgencia: #BA1828` (rojo institucional).
  - Contraste de ~6,4:1 sobre `surface` y ~6:1 sobre `background` (WCAG AA), medido en `tema.test.ts`.
  - **No** reutiliza `accent`, que es el rojo de los errores y de las acciones destructivas.
  - La insignia conserva su texto y su borde punteado: el color no es la única señal.

### 2.3 La categoría no cambia después de radicar (IN1, H2)

- `UpdateSolicitudeDto extends PartialType(OmitType(CreateSolicitudeDto, ['categoria']))`.
- Con `forbidNonWhitelisted`, el pipe responde **400** `property categoria should not exist`, que es el mismo mecanismo que protege `modificado_por`.
- La inmutabilidad es la premisa que permite que la categoría gobierne el lugar (SE10), el camino (§2.4) y la entrega (§2.5).

### 2.4 «Edición y postproducción» (ED1 a ED4)

- **ED1 · Estado nuevo y dos transiciones del Staff:**
  - **T11:** `En Producción` → `Edición y postproducción`, con la acción `INICIAR_EDICION`.
  - **T12:** `Edición y postproducción` → `Entregado`, que reutiliza `FINALIZAR` porque entregar es la misma acción desde la producción (T9) o desde la edición.
  - Las dos van por el mismo `PATCH` del tablero.
- **ED2 · La máquina dice si un paso existe; la categoría, si le aplica:**
  - `autorizarTransicionDelStaff()` consulta primero la máquina y después `transicionAplicaALaCategoria()`.
  - Un PODCAST o VIDEO que pide T9 recibe **409** «Esta categoría pasa por "Edición y postproducción" antes de la entrega…».
  - Las demás categorías que piden T11 o T12 reciben **409** «Esta categoría no pasa por "Edición y postproducción"…».
  - La vista solo ofrece las transiciones que aplican.
- **ED3 · CA-06 (H1, Opción A, aprobada el 2026-10-28):**
  - «Edición y postproducción» **libera** la franja al entrar (T11). La edición es trabajo posterior a la sesión y no usa el sub-espacio.
  - El «Entregado» de PODCAST y VIDEO **tampoco ocupa**.
  - En las demás categorías, «Entregado» sigue ocupando como antes.
  - La invariante deja de ser «solo los finales liberan» y pasa a ser **«liberar es irreversible»**, verificada por categoría en `maquina-estados.spec.ts`.
  - **Descartadas:**
    - mantener la franja ocupada durante la edición, porque bloquea el sub-espacio por un trabajo que no lo usa;
    - volver a ocuparla en T12, que es H1.
  - Fuente única: `ocupaFranja(estado, categoria)` y `FILTRO_OCUPA_FRANJA`, este último para la consulta previa.
- **ED4 · Migración `20261028120000_ca06_edicion_postproduccion`:**
  - Recrea las **dos** exclusiones **con los mismos nombres**, en una sola transacción, así que el detector de CA-06 no cambia.
  - Solo cambia el `WHERE`, que suma `'Edición y postproducción'` al `NOT IN` y agrega `AND NOT (estado = 'Entregado' AND categoria IN ('PODCAST','VIDEO'))`.
  - El predicado nuevo solo **quita** filas de la restricción, así que no puede fallar por los datos.
  - `estados.spec.ts` compara el SQL con el código.

### 2.5 Enlace del producto final (EN1 a EN5)

- **EN1 · Columna:** `enlace_entrega TEXT NULL`. Las proyecciones del solicitante y del Staff la exponen.
- **EN2 · Política por categoría** (servicio, en la categoría **guardada**):
  - **1b:** un enlace que llega sin una entrega real recibe **400** «El enlace del producto final solo se envía al marcar la solicitud como "Entregado".» (como E5).
  - **2c:** se evalúa después de la máquina, para que un PODCAST que intenta T9 reciba primero el 409 de la edición, que es lo que de verdad le falta.
    - Si es OBLIGATORIO y falta: **400**.
    - Si es PROHIBIDO y llega: **400**.
  - `null` cuenta como ausente: por esa vía nunca llega al motor una entrega sin enlace.
- **EN3 · Tres capas que dicen lo mismo:**
  - **DTO:** `@MaxLength(2048)`, `@Matches(/^https:\/\/\S+$/)` e `@IsUrl({ protocols: ['https'], require_tld, disallow_auth })`.
  - **Motor:** `segun_estado`, `segun_categoria` y `formato` (`^https://[^[:space:]]+$` y ≤ 2048), los tres validados al crearse porque la columna nació vacía.
  - El DTO **repite** la regla del `CHECK` para que una entrada como `HTTPS://…` sea un 400 y nunca un 500.
- **EN4 · `Solicitud_entrega_con_enlace_check` `NOT VALID` (DT-3):**
  - Exige el enlace en toda entrega nueva o modificada de PODCAST, VIDEO y STREAMING.
  - **No** revisa la entrega histórica de PODCAST sin enlace (fila 19 del postcheck = 1). Esa fila es final y su categoría no cambia (IN1), así que nada la vuelve a escribir.
  - No se ejecuta `VALIDATE CONSTRAINT`: fallaría por esa fila y no se inventa un enlace.
- **EN5 · Vista:**
  - `esEnlaceSeguro()` exige `https://`, sin espacios, `URL` válida, con *hostname* y sin credenciales.
  - Defensa en profundidad: aunque la base ya lo garantiza, `EnlaceProductoFinal` **no crea ningún `<a>`** si el enlace no pasa la comprobación, y lo dice en texto.
  - El enlace abre con `target="_blank"` y `rel="noopener noreferrer"`. Su nombre accesible lleva el radicado y avisa que se abre en una pestaña nueva.
  - En el diálogo del Staff, `CampoEnlace` (`type="url"` y `aria-invalid`) bloquea «Confirmar» con su razón (vacío o inválido).
  - El enlace se envía recortado y el borrador se descarta al cerrar el diálogo.
  - `CambiosTablero` solo compila `enlace_entrega` junto con `estado: 'Entregado'`.

### 2.6 Orden de entrega y despliegue (MG2)

- **Primero lo que tolera el cambio y después el cambio** (lección 2 de la Fase 7):
  - 8.1 y 8.2 sin cambio de esquema;
  - 8.4 (inmutabilidad);
  - 8.5 y 8.6 de punta a punta, cada una con su migración ensayada en la base desechable;
  - producción al final (8.7).
- **Orden de despliegue: migración, luego backend de la Fase 8, luego frontend.**
  - El backend anterior, contra la base migrada, ofrece T9 a PODCAST y VIDEO. Además, su entrega de PODCAST, VIDEO o STREAMING sin enlace viola `Solicitud_entrega_con_enlace_check` y responde 500. Por eso, en esa ventana no se registran entregas.
  - El frontend nuevo exige `enlace_entrega` en el esquema Zod, así que contra un backend anterior rechazaría las respuestas.

---

## 3. Preguntas abiertas y deuda aceptada

| # | Tema | Resolución |
|---|---|---|
| DA-4 | Un enlace mal escrito no se corrige: «Entregado» es final | **Deuda aceptada.** Hoy se corrige solo con una migración de datos auditada. Pregunta para el Responsable del Estudio C: ¿se necesita «corregir enlace» con su propio registro en el log? |
| DA-5 | La entrega histórica de PODCAST no tiene enlace | Se muestra sin la fila «Producto final». La tolera el `NOT VALID` (EN4) |
| DA-6 | El enlace se valida por forma, no por contenido | El sistema no visita el enlace (sin SSRF ni dependencia de terceros); el Staff responde por el destino |
| DA-7 | Los alias son solo de presentación | La API, el log y cualquier exportación siguen diciendo `Validado`. Un reporte futuro debe usar `etiquetaEstado()` |

---

## 4. Verificación

| Decisión | Pruebas |
|---|---|
| CT1 | `categorias.spec.ts`: la tabla como oráculo, listas derivadas y alineación con el SQL de las dos migraciones (categorías, 2048, exactamente un `NOT VALID`) · frontend `contrato.test.ts`: `PASA_POR_EDICION` y `REQUIERE_ENLACE` contra las filas del backend, y `ENLACE_MAXIMO` contra `ENLACE_ENTREGA_MAXIMO` |
| VI1 a VI3 | `etiquetas.test.ts` · `Insignias.test.tsx` · `linea-de-vida.test.ts` · `tema.test.ts` (contraste medido sobre `index.css`) |
| IN1 | `update-solicitude.dto.spec.ts` · e2e de `horario.e2e-spec.ts` (`franjaNueva`, sin `categoria`) |
| ED1 a ED3 | `maquina-estados.spec.ts` (T11, T12 y «liberar es irreversible» por categoría) · `estados.spec.ts` (cada `NOT IN` y la cláusula por categoría) · `solicitudes.service.spec.ts` (E-*) · I-36a a I-36c contra PostgreSQL real (alineación, motor y servicio: la franja liberada en T11 la toma otra reserva y T12 entrega sin `23P01`) |
| ED4 | I-1, I-33c/d e I-11f siguen en verde con el predicado nuevo · postcheck 8.7, filas 5 a 8 y 14 |
| EN1 a EN4 | `update-solicitude.dto.spec.ts` (acepta y rechaza) · EN-1 a EN-6 (servicio) · e2e 29b (`javascript:`, `HTTPS://` y `http` → 400) · I-37a (alineación) · I-37b (el motor rechaza por sí mismo) · I-37c (servicio) · postcheck 8.7, filas 9 a 12, 15 y 19 |
| EN5 | `enlace.test.ts` (17) · `EnlaceProductoFinal.test.tsx` (5) · `DetalleStaff.acciones.test.tsx` (bloqueo explicado, envío recortado, ESPACIOS sin campo, borrador descartado) · `TarjetaSolicitud.test.tsx` · `DetalleSolicitud.test.tsx` · `esquemas.test.ts` · `@ts-expect-error` en `solicitudes.test.ts` |

**Al cierre (2026-10-28):**

- Backend:
  - `npm test`: 1017 ✅ y 1 omitida.
  - `test:tz`: 902 ✅ en las 4 zonas.
  - `test:e2e`: 80 ✅.
  - Integración: 106 ✅.
- Frontend: 599 ✅ en 44 archivos, en las 4 zonas.
- Lint en 0 en los dos proyectos.

---

## 5. Consecuencias

- **Positivas:**
  - una categoría nueva obliga a decidir su política;
  - el sub-espacio queda libre durante la postproducción, sin riesgo de una entrega imposible;
  - el enlace está garantizado por el DTO, el servicio y el motor, y se abre de forma segura;
  - la presentación por rol no tocó ni el contrato ni el log;
  - ninguna fila de producción cambió (26 y 40, igual en el precheck y en el postcheck).
- **Riesgos aceptados:**
  - DA-4 a DA-7;
  - la ventana de despliegue (MG2);
  - una categoría que cambie su `pasaPorEdicion` exige una migración que recree las dos exclusiones (`categorias.spec.ts` y `estados.spec.ts` fallan si solo cambia el código).
- **Mantenimiento:**
  - la lista de categorías con edición vive en `categorias.ts` **y** en el `WHERE` de las exclusiones;
  - las categorías con enlace, en `categorias.ts` **y** en dos `CHECK`.
  - Las pruebas de alineación son las que impiden que diverjan.

---

## 6. Pendiente

- **DA-4:** la pregunta al Responsable del Estudio C sobre corregir el enlace después de la entrega.
- Heredados de ADR-007 §6: DA-2 (los ajustes en el historial), el texto de T10 y el retiro de una propuesta por el Staff.

---

## 7. Historial de implementación

| Commit | Paso |
|---|---|
| — | 8.0 · Precheck de solo lectura en producción (`precheck-8-0.sql`): 26 / 40 / 5, un VIDEO por pasar a edición, una entrega histórica de PODCAST sin enlace |
| `505de4d` | 8.1 · Fuente única de las reglas por categoría, sin cambio de comportamiento |
| `87ee029` | 8.2 · Alias de estado por rol, etiqueta de VIDEO y urgencia en rojo con contraste AA (incluye el 8.3 previsto) |
| `bc7e48b` | 8.4 · La categoría no cambia después de radicar |
| `b4d9ee7` | 8.5 · Edición y postproducción: T11 y T12, CA-06 por categoría y vista por categoría |
| `be23472` | Corrección de la prueba inestable de `App` C1 (se espera la petición del tablero en lugar de suponerla) |
| `aac0faa` | 8.6 · Enlace `https` del producto final obligatorio al entregar PODCAST, VIDEO y STREAMING |
| — | 8.7 · Precheck (16 indicadores), `migrate status` (2 pendientes), `npm run db:migrate` y postcheck (19 indicadores) en producción, más la prueba visual de solo lectura |
| — | 8.8 · Este ADR, las notas de ADR-005 y ADR-007, los README y el PRD v2.4 |
