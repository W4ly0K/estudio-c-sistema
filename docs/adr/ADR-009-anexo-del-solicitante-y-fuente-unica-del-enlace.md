# ADR-009 — Anexo opcional del solicitante (R9-1) y fuente única del enlace seguro

| Campo | Valor |
|---|---|
| **Estado** | 🟡 Aceptado en la rama para el diseño original (`7b19090`). **Ampliado el 2026-11-10** con las respuestas del Responsable y las decisiones D1, D4-B′, D7, D9 y D10 (§2.7): la ampliación está **propuesta, sin implementar**. La migración `20261109110000_enlace_anexo` conserva su versión original y se ajusta antes de ejecutarse; la migración definitiva y el paso 9.1.5 están **pendientes**. Pasa a ✅ con el postcheck |
| **Fecha** | 2026-11-09 |
| **Actualización** | 2026-11-10 · Respuestas 1, 2, 3, 4 y 5 del cuestionario (§3) y ampliación del anexo (§2.7, propuesta). Ver [ADR-012](ADR-012-eventos-de-auditoria-sin-transicion.md) y la E7 de [ADR-005](ADR-005-maquina-de-estados-ca10.md) |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `feat/fase-9-anexo-solicitante` (desde `develop` @ `6c35493`) |
| **Complementa a** | [ADR-002](ADR-002-autorizacion-a-nivel-de-dato.md) (las proyecciones son listas blancas: el anexo se agrega a propósito) · [ADR-006](ADR-006-frontend-contrato-tipado.md) (contrato Zod y cuerpos tipados) · [ADR-008](ADR-008-edicion-postproduccion-y-enlace-de-entrega.md) (EN3 y EN5 pasan a la fuente única) |
| **Relacionado con** | Backlog de la Fase 9 (R9-1) · PRD v2.5 (borrador) · precheck 9.1.0 y postcheck 9.1.5 |

---

## 1. Contexto

- R9-1 pide un **anexo opcional** al radicar (por ejemplo, el guion en Google Drive) para que el Staff lo analice, visible para el Staff y para el solicitante.
- Se guarda un **enlace**, no un archivo: el sistema no tiene almacenamiento de archivos ni servidor institucional (el despliegue se transfirió a los próximos practicantes), y el archivo sigue bajo el control de su autor.
- Riesgo de privacidad: si el solicitante comparte el guion como «Cualquier persona con el enlace», queda expuesto a quien vea la URL. El sistema no puede verificar los permisos de Drive; solo puede explicarlos.
- Ya existía un enlace con reglas probadas: el del producto final (ADR-008, EN1 a EN5). Duplicar esas reglas para un segundo enlace abría la puerta a que se separaran con el tiempo.

---

## 2. Decisiones

### 2.1 Fuente única del enlace seguro (FU1 a FU3)

- **FU1 · `EnlaceSeguro`:** `backend/src/common/validadores/enlace-seguro.decorator.ts` exporta `ENLACE_MAXIMO` (2048), `PATRON_ENLACE_SEGURO` (`/^https:\/\/\S+$/`) y el decorador compuesto (`@IsString`, `@MaxLength`, `@Matches`, `@IsUrl` con `https`, `require_tld` y `disallow_auth`). Lo usan `enlace_entrega` (sin cambio de comportamiento) y `enlace_anexo`. Cada DTO decide la opcionalidad con su propio `@IsOptional()`. Los campos obligatorios que aceptan `null` de §2.7 usarán `@ValidateIf` en su lugar (AN11).
- **FU2 · DTO ⊆ CHECK:** el pipe puede ser **más** estricto que el `CHECK` del motor, **nunca** más laxo; si el motor rechazara algo que el pipe aceptó, respondería 500. Hoy el pipe es más estricto: exige dominio de primer nivel y prohíbe usuario y contraseña, y `MaxLength` cuenta unidades UTF-16, que nunca son menos que los caracteres de `char_length`.
- **FU3 · Una sola copia de los casos:** `backend/test/utils/casos-enlace.ts` separa lo que aceptan ambos, lo que rechaza el motor y lo que solo rechaza el pipe. La usan las pruebas del decorador, de los DTOs y de integración.

### 2.2 Modelo de datos (AN1 y AN2)

- **AN1 · Columna:** `enlace_anexo TEXT NULL`, sin `DEFAULT`. Migración aditiva `20261109110000_enlace_anexo`, en LF.
- **AN2 · `Solicitud_enlace_anexo_formato_check`:** `enlace_anexo ~ '^https://[^[:space:]]+$' AND char_length(enlace_anexo) <= 2048`, la misma forma que `Solicitud_enlace_entrega_formato_check`.
  - **Validado al crearse** (no `NOT VALID`): la columna nace vacía y ninguna fila puede incumplirlo.
  - **Sin `IS NULL OR`:** un NULL deja la condición en UNKNOWN y un `CHECK` solo rechaza FALSE.
  - **Sin restricción por estado** (el anexo acompaña todo el ciclo) **ni por categoría** mientras la pregunta 5 no se responda. La pregunta 5 ya se respondió: ver AN2b (propuesto).

### 2.3 Radicación y regla de auditoría (AN3 y AN4)

- **AN3 · Opcional al radicar:** `CreateSolicitudeDto.enlace_anexo?` con `@IsOptional()` + `@EnlaceSeguro(MENSAJE_ENLACE_ANEXO)`. Ausente o `null` = sin anexo; la cadena vacía, los espacios o una forma insegura → **400** (no hay conversión silenciosa a NULL). `create()` escribe `enlace_anexo ?? null`, siempre explícito.
- **AN4 · Excluido del `PATCH`:** `UpdateSolicitudeDto` extiende `PartialType(OmitType(CreateSolicitudeDto, ['categoria', 'enlace_anexo']))`. Sin el `OmitType`, el campo se habría heredado sin que nadie lo decidiera (el mismo riesgo que H2 de ADR-008). Un `PATCH` con `enlace_anexo` recibe **400** «property enlace_anexo should not exist» (pipe global con `forbidNonWhitelisted`) hasta que el Responsable decida si se edita después de radicar (pregunta 3). **Actualización:** decidió que sí (§3), pero no por este camino: el `PATCH` es del Staff y sigue sin admitir `enlace_anexo`. La edición tendrá su propio endpoint (AN10, propuesto).

### 2.4 Lectura (AN5)

- `SELECT_DETALLE_STAFF` y `SELECT_DETALLE_SOLICITANTE` incluyen `enlace_anexo`. El filtro de propiedad y el 404 uniforme para una solicitud ajena no cambian (ADR-002).

### 2.5 Frontend (AN6 a AN8)

- **AN6 · Contrato *fail-closed*:** `enlace_anexo: z.string().nullable()` es **obligatorio** en `esquemaSolicitud`. Si una proyección del backend lo pierde, la respuesta no se acepta en silencio. En el cuerpo de radicación es opcional, y `CambiosTablero` no lo admite (`@ts-expect-error` en `solicitudes.test.ts`).
- **AN7 · `EnlaceExternoSeguro`:** un solo componente decide la apertura de un enlace guardado: sin `<a>` si no pasa `esEnlaceSeguro`, pestaña nueva con `rel="noopener noreferrer"` y nombre accesible con el radicado. `EnlaceProductoFinal` (Fase 8) y `EnlaceAnexo` son envolturas con sus textos. `CampoEnlace` recibe `etiqueta` y `ayuda`.
- **AN8 · Formulario B2:** campo opcional después de «Propósito», marcado en vivo (`aria-invalid` y borde punteado: no solo color) y validado con `anexoParaEnviar` antes de enviar.
  - El cliente **recorta** los espacios de los extremos (como `enlaceParaEnviar` en la entrega); el servidor sigue siendo estricto.
  - Vacío = la clave `enlace_anexo` no viaja.
  - La ayuda (`aria-describedby`) explica cómo compartir en Drive. Su texto es **provisional** (pregunta 2) y vive en una sola constante, `TEXTO_AYUDA_ANEXO`. La pregunta 2 ya lo define (AN15, propuesto).
  - Cambiar de categoría no borra el anexo. **Cambia con AN2b (propuesto):** el campo solo aparecerá en PODCAST, VIDEO y STREAMING, y en las demás categorías la clave `enlace_anexo` no viajará (si viajara, el servidor respondería 400).

### 2.6 Entrega y despliegue (AN9)

- Precheck 9.1.0 (hecho: 10/10) → precheck de nuevo **justo antes** de migrar → `npx prisma migrate status` (host del pooler) → `npm run db:migrate` → postcheck 9.1.5 (checksum SHA-256 y conteos idénticos, DT-3).
- **Checksum (actualizado el 2026-11-10):** `9840a71ecadad767aef2295acb9085eca95e10daa597ae30e2e1c87141b05d38` corresponde a la **versión original** de la migración, la que sigue en el repositorio. **No es el definitivo:** la migración se reescribirá con AN2b y las columnas de [ADR-012](ADR-012-eventos-de-auditoria-sin-transicion.md), y el checksum nuevo se registrará desde la salida real. Antes, un P0 autorizado verifica `_prisma_migrations` por nombre y estado, B7 y el `LC_CTYPE` de la base.
- Hasta la migración, el equipo de la oficina sigue en `develop` @ `6c35493`: el código de esta rama escribe `enlace_anexo`. Después, backend y frontend se actualizan **juntos**, por AN6.

### 2.7 Ampliación: categorías, edición, retiro y visibilidad (AN2b, AN10 a AN15; propuesto, sin implementar)

**Origen.** Los requisitos son las preguntas 2, 3, 4 y 5 del cuestionario firmado (§3). El mecanismo sale de las decisiones del proyecto del 2026-11-10: D1 (retiro), D7 (visibilidad), D9 (valor anterior observado) y D10 (sin cambios), con la auditoría de [ADR-012](ADR-012-eventos-de-auditoria-sin-transicion.md).

- **AN2b · Categorías (pregunta 5):** solo PODCAST, VIDEO y STREAMING admiten anexo. Fuente única: `POLITICA_POR_CATEGORIA.admiteAnexo` y la lista derivada `CATEGORIAS_CON_ANEXO` (hoy coincide con `CATEGORIAS_CON_ENLACE`, pero por otro motivo). En el motor, `Solicitud_enlace_anexo_segun_categoria_check`: sin anexo, o una de esas categorías. Al radicar, un anexo en otra categoría → 400 `MENSAJE_ANEXO_NO_APLICA` (amplía AN3).
- **AN10 · Endpoint (preguntas 3 y 4):** `PATCH /solicitudes/:radicado/anexo`, `@Roles(SOLICITANTE)`, separado del `PATCH` del tablero. La propiedad va en el `WHERE`: una solicitud ajena o inexistente recibe el mismo 404 (ADR-002). Solo en `Recibido` y en `CATEGORIAS_CON_ANEXO`. El actor sale del JWT, y cada cambio efectivo deja un evento ANEXO (quién, cuándo, enlace anterior y nuevo) en la misma transacción.
- **AN11 · Cuerpo:** `{ enlace_anexo_anterior: string | null, enlace_anexo: string | null }`, las dos **obligatorias**. Cada una se valida con `@ValidateIf(o => o.<campo> !== null)` seguido de sus validadores: si la propiedad no vino, los validadores corren y responden 400; con `null`, se omiten. El nuevo, si es texto, usa `EnlaceSeguro`; el anterior es un valor para comparar (texto de hasta 2048). Otro tipo, `''` o una forma insegura → 400.
- **AN12 · Retiro (D1):** `enlace_anexo: null` retira el anexo, solo en solicitudes propias en `Recibido`. Si hay un cambio efectivo, el evento guarda el enlace anterior, `NULL` como nuevo, el actor, la fecha y el radicado.
- **AN13 · Valor anterior observado (D9):** `enlace_anexo_anterior: null` significa «vi que no había anexo». Si no coincide con el vigente → **409** `MENSAJE_ANEXO_DESACTUALIZADO`, sin escritura ni log. `esperado` lleva `id_usuario`, `estado: 'Recibido'` y el valor observado; si cambia entre la lectura y la escritura → 409. El límite ABA está en ADR-012 §2.5.
- **AN14 · Sin cambios (D10):** si el valor pedido ya es el vigente → **200** con `sin_cambios: true`, sin escritura ni log. Orden: 401 → 403 → 400 de forma → 404 → 400 de categoría → 200 `sin_cambios` → 409 si no está en `Recibido` → 409 por AN13 → *compare-and-set* y evento. La igualdad va antes del estado solo porque no escribe. `sin_cambios` no es una modificación ni prueba que una petición anterior se haya confirmado, y no es idempotencia completa: ante una respuesta incierta, el frontend vuelve a consultar el detalle. Los contratos de NestJS y de Zod llevan `sin_cambios` de forma explícita.
- **AN15 · Visibilidad y ayuda (D7, pregunta 2):** el solicitante ve el anexo vigente de su solicitud; el historial de cambios solo lo ve el Staff (la proyección del solicitante excluye los eventos de enlace). La línea de vida y sus fechas no cambian. `TEXTO_AYUDA_ANEXO` pasa a indicar que el archivo se comparte con usuarios de `@unicesmag.edu.co`.
- **Relación con T1 (D4-B′):** en las categorías con anexo, aprobar exige `anexo_revisado` ([ADR-005](ADR-005-maquina-de-estados-ca10.md) E7). Si el solicitante cambia o retira el anexo después de que el Staff abrió el detalle, la aprobación recibe 409 y el Staff recarga. Se protege la referencia, no la lectura del archivo.

---

## 3. Preguntas al Responsable (respondidas el 2026-11-10)

Respuestas del cuestionario firmado por el Responsable del Estudio C. La pregunta 4 no estaba en la versión original de esta tabla; se agrega porque va con la 3.

| Pregunta | Opción por defecto (2026-11-09) | Respuesta | Efecto |
|---|---|---|---|
| **1** · ¿Solo enlaces de Google (Drive y Docs) o cualquier https? | Cualquier https seguro | Cualquier enlace seguro (`https://`) | Sin cambios en la regla de forma (AN2 y FU1) |
| **2** · ¿Con quién se comparte el archivo? | Texto provisional con estudioc@unicesmag.edu.co | Con cualquier persona de la universidad (`@unicesmag.edu.co`) | `TEXTO_AYUDA_ANEXO` (AN15) |
| **3** · ¿Se edita después de radicar? ¿En qué estados? | No se edita (AN4) | Sí, solo en «Recibido» | Endpoint propio y evento de auditoría (AN10 a AN14; ADR-012) |
| **4** · ¿El Staff necesita ver el enlace anterior? | No aplicaba | Sí: quién, cuándo y cuál era el enlace anterior | Evento ANEXO con el valor anterior y el nuevo (ADR-012) |
| **5** · ¿Para qué categorías aplica? | Todas | Solo PODCAST, VIDEO y STREAMING | AN2b |

---

## 4. Verificación

| Decisión | Pruebas |
|---|---|
| FU1 a FU3 | `enlace-seguro.decorator.spec.ts`: forma, límite inclusivo, `null` y ausente sin `@IsOptional`, el par de patrones JS/SQL y la alineación con las dos migraciones (sin `NOT VALID` en el anexo) · `update-solicitude.dto.spec.ts` (los casos de la Fase 8 sin tocar) · frontend `contrato.test.ts` (`ENLACE_MAXIMO` contra la fuente única) |
| AN1 y AN2 | I-38a (columna y `CHECK` validado) e I-38b (el motor rechaza por sí mismo; acepta lo que solo detiene el pipe, FU2) en `anexo.int-spec.ts` · I-37a filtra por «entrega» |
| AN3 | DTO spec (opcional, aceptados y rechazados) · `solicitudes.service.spec.ts` (guarda el anexo o NULL explícito) · I-38c · e2e A1, A2 y A3 |
| AN4 | DTO spec (`PATCH` → 400) · e2e A4 (sin leer ni escribir) |
| AN5 | `solicitudes.service.spec.ts` (las dos proyecciones) · e2e A5 |
| AN6 | `esquemas.test.ts` (acepta el anexo; rechaza una respuesta sin el campo) · `solicitudes.test.ts` (`@ts-expect-error`) |
| AN7 | `EnlaceAnexo.test.tsx` · `EnlaceProductoFinal.test.tsx` (sin cambios) · `DetalleSolicitud.test.tsx` · `DetalleStaff.test.tsx` |
| AN8 | `presentacion/anexo.test.ts` · `Dashboard.test.tsx` (ayuda accesible, recorte, sin clave si está vacío, inválido no se envía) |
| AN2b, AN10 a AN15 | **Pendientes, sin implementar.** Plan en [ADR-012](ADR-012-eventos-de-auditoria-sin-transicion.md) §6: categorías (unitarias, alineación e integración), los casos de ausencia y `null` del cuerpo, 404 uniforme, 409 por estado y por valor anterior, `sin_cambios` sin log, concurrencia, proyecciones y la relación con T1 (ADR-005 E7) |

Cifras de la última corrida: backend 32 suites · 1067 + 1 omitida; e2e 7 · 92; integración 10 · 127/127; frontend 46 · 624. CI en verde en `aa9f9b7` y `749566d`.

---

## 5. Consecuencias

**A favor**
- Una sola regla para todo enlace guardado, en el backend (`EnlaceSeguro`) y en la vista (`EnlaceExternoSeguro`).
- El anexo no consume almacenamiento ni requiere servidor.
- El `PATCH` queda cerrado por diseño hasta que exista una regla de negocio.

**En contra**
- El sistema no puede comprobar los permisos de Drive: un enlace sin acceso le llega roto al Staff.
- AN6 obliga a desplegar backend y frontend juntos.
- Un endurecimiento posterior de la regla (preguntas 1 y 5), una vez existan anexos en producción, exigiría una migración con `NOT VALID` y revisión de datos. Por eso se esperan las respuestas antes del 9.1.5.

---

## 6. Pendiente

- Implementar la ampliación (§2.7) y la precondición de T1 (ADR-005 E7), con sus pruebas.
- P0 autorizado y la migración definitiva (`20261109110000_enlace_anexo` reescrita), con su checksum nuevo.
- Paso 9.1.5 en producción y su postcheck.
- La prueba manual con navegador real después del 9.1.5 (con una solicitud real con anexo, o con un radicado de prueba que luego se cancela, conforme a DT-3).

---

## 7. Historial de implementación

| Commit | Paso |
|---|---|
| — | 9.1.0 · Precheck de solo lectura en producción (`precheck-9-1-0.sql`): 10/10; línea base 28 / 47 / 0 / 17.6 |
| `a64984c` | 9.1.1 a 9.1.3 · Fuente única, migración aditiva, DTOs, servicio, proyecciones y pruebas |
| `aa9f9b7` | Prueba del anexo con un objeto plano y `satisfies` (`no-misused-spread`) |
| `749566d` | 9.1.4 · Frontend (contrato, `anexoParaEnviar`, `EnlaceExternoSeguro`, formulario B2 y detalles) y e2e del backend |
| — | 9.1.5 · Precheck, `migrate status`, `npm run db:migrate` y postcheck en producción ⏳ |
| — | 9.1.6 · Este ADR, la nota de ADR-008, los README y el PR ⏳ |
