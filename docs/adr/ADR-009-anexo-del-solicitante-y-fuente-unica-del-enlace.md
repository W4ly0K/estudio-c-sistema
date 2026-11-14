# ADR-009 — Anexo opcional del solicitante (R9-1) y fuente única del enlace seguro

| Campo | Valor |
|---|---|
| **Estado** | 🟡 Aceptado en la rama para el diseño original (`7b19090`). **Ampliado el 2026-11-10** con las respuestas del Responsable y las decisiones D1, D4-B′, D7, D9 y D10 (§2.7): la ampliación está **propuesta**. **Al 2026-11-11:** su parte de base de datos está implementada en la migración consolidada `20261109110000_enlace_anexo` (H1, `df4e6e9`), que reemplazó a la versión original y se verificó solo en la base desechable (H3-C); la parte de aplicación (AN2b en el DTO y el formulario, AN10 a AN15 y ADR-005 E7) estaba **sin implementar**. **Al 2026-11-12:** la ampliación se aceptó como base de diseño, con la enmienda DJ2-1 al orden de AN14, y su parte de aplicación en el backend está **implementada en la rama** (J0 `b2b292b`, J1 `04f23a0`, J2 `eeb978c`, J2b `f1962e6`); el frontend (lote K) estaba **pendiente**. **Al 2026-11-14:** el frontend está **implementado en la rama** (commits del 2026-11-12: K1 `0dc6eac`, K2 `5c27ec3`, K3 `be6a02a` y K4 `479c60c`). El paso 9.1.5 sobre la base principal (llamada «producción» en este ADR; ver la aclaración de §2.6), su postcheck y la prueba manual siguen **pendientes**. Pasa a ✅ con el postcheck |
| **Fecha** | 2026-11-09 |
| **Actualización** | 2026-11-10 · Respuestas 1, 2, 3, 4 y 5 del cuestionario (§3) y ampliación del anexo (§2.7, propuesta) · 2026-11-11 · migración consolidada H1 y checksum vigente (§2.6) · 2026-11-12 · ampliación aceptada e implementada en el backend de la rama, enmienda de AN14 y estado de las pruebas (§2.7, §4, §6 y §7) · 2026-11-14 · frontend K1 a K4 implementado en la rama, evidencia C1 y aclaración de contexto (§2.5, §2.6, §2.7, §4, §6 y §7). Ver [ADR-012](ADR-012-eventos-de-auditoria-sin-transicion.md) y la E7 de [ADR-005](ADR-005-maquina-de-estados-ca10.md) |
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
  - **Sin restricción por estado** (el anexo acompaña todo el ciclo) **ni por categoría** mientras la pregunta 5 no se responda. La pregunta 5 ya se respondió: ver AN2b (propuesto el 2026-11-10; implementado en el backend en J0, `b2b292b`).

### 2.3 Radicación y regla de auditoría (AN3 y AN4)

- **AN3 · Opcional al radicar:** `CreateSolicitudeDto.enlace_anexo?` con `@IsOptional()` + `@EnlaceSeguro(MENSAJE_ENLACE_ANEXO)`. Ausente o `null` = sin anexo; la cadena vacía, los espacios o una forma insegura → **400** (no hay conversión silenciosa a NULL). `create()` escribe `enlace_anexo ?? null`, siempre explícito.
- **AN4 · Excluido del `PATCH`:** `UpdateSolicitudeDto` extiende `PartialType(OmitType(CreateSolicitudeDto, ['categoria', 'enlace_anexo']))`. Sin el `OmitType`, el campo se habría heredado sin que nadie lo decidiera (el mismo riesgo que H2 de ADR-008). Un `PATCH` con `enlace_anexo` recibe **400** «property enlace_anexo should not exist» (pipe global con `forbidNonWhitelisted`) hasta que el Responsable decida si se edita después de radicar (pregunta 3). **Actualización:** decidió que sí (§3), pero no por este camino: el `PATCH` es del Staff y sigue sin admitir `enlace_anexo`. La edición tiene su propio endpoint (AN10; propuesto el 2026-11-10, implementado en la rama en J2, `eeb978c`).

### 2.4 Lectura (AN5)

- `SELECT_DETALLE_STAFF` y `SELECT_DETALLE_SOLICITANTE` incluyen `enlace_anexo`. El filtro de propiedad y el 404 uniforme para una solicitud ajena no cambian (ADR-002).

### 2.5 Frontend (AN6 a AN8)

- **AN6 · Contrato *fail-closed*:** `enlace_anexo: z.string().nullable()` es **obligatorio** en `esquemaSolicitud`. Si una proyección del backend lo pierde, la respuesta no se acepta en silencio. En el cuerpo de radicación es opcional, y `CambiosTablero` no lo admite (`@ts-expect-error` en `solicitudes.test.ts`).
- **AN7 · `EnlaceExternoSeguro`:** un solo componente decide la apertura de un enlace guardado: sin `<a>` si no pasa `esEnlaceSeguro`, pestaña nueva con `rel="noopener noreferrer"` y nombre accesible con el radicado. `EnlaceProductoFinal` (Fase 8) y `EnlaceAnexo` son envolturas con sus textos. `CampoEnlace` recibe `etiqueta` y `ayuda`.
- **AN8 · Formulario B2:** campo opcional después de «Propósito», marcado en vivo (`aria-invalid` y borde punteado: no solo color) y validado con `anexoParaEnviar` antes de enviar.
  - El cliente **recorta** los espacios de los extremos (como `enlaceParaEnviar` en la entrega); el servidor sigue siendo estricto.
  - Vacío = la clave `enlace_anexo` no viaja.
  - La ayuda (`aria-describedby`) explica cómo compartir en Drive. Su texto es **provisional** (pregunta 2) y vive en una sola constante, `TEXTO_AYUDA_ANEXO`. La pregunta 2 ya lo define (AN15; el cambio del texto estaba pendiente en el lote K). **Hecho en K2 (`5c27ec3`):** el texto aprobado está en AN15 (§2.7).
  - Cambiar de categoría no borra el anexo. **Cambia con AN2b (el backend ya lo exige desde J0, `b2b292b`; el formulario estaba pendiente en el lote K):** el campo solo aparecerá en PODCAST, VIDEO y STREAMING, y en las demás categorías la clave `enlace_anexo` no viajará (si viajara, el servidor respondería 400). **Hecho en K2 (`5c27ec3`):** ver AN2b (§2.7).

### 2.6 Entrega y despliegue (AN9)

- Precheck 9.1.0 (hecho: 10/10) → precheck de nuevo **justo antes** de migrar → `npx prisma migrate status` (host del pooler) → `npm run db:migrate` → postcheck 9.1.5 (checksum SHA-256 y conteos idénticos, DT-3).
- **Checksum (actualizado el 2026-11-11):** el vigente es `886aeb80aee4a2f48c474b9b55013c7768aa06394eb06e3cc97465282549f059` (SHA-256 de la migración consolidada H1, en LF y sin CR, `df4e6e9`), con el anexo (AN1, AN2 y la regla de categoría de AN2b en el motor) y las columnas y restricciones de [ADR-012](ADR-012-eventos-de-auditoria-sin-transicion.md). Reemplaza a `9840a71e…1b05d38`, la versión original, que nunca se aplicó en producción (P0, precheck 9.1.0b). P0 ya midió `_prisma_migrations`, B7 (0) y la compatibilidad Unicode (fila 28, corregida por H0, `a111c73`). El precheck 0c lo repite justo antes del 9.1.5, y el postcheck se reescribe para H1.
- Hasta la migración, el equipo de la oficina sigue en `develop` @ `6c35493`: el código de esta rama escribe `enlace_anexo`. Después, backend y frontend se actualizan **juntos**, por AN6.
  - **Aclaración de contexto (2026-11-12, criterio DH2; registrada el 2026-11-14):** el sistema está en desarrollo, sin despliegue institucional, y la base principal (la que este ADR llama «producción») contiene datos de prueba. La línea anterior se conserva como registro histórico: el uso local desde la oficina **no está verificado** como operación institucional. Integrar el código no exige migrar antes la base principal, pero el backend y el frontend de la rama necesitan H1 para ejecutarse y van juntos. Todo cambio en una base persistente, empezando por el 9.1.5, se aprueba por separado, con precheck, análisis de impacto, respaldo cuando corresponda, postcheck y plan de recuperación.

### 2.7 Ampliación: categorías, edición, retiro y visibilidad (AN2b, AN10 a AN15; propuesta el 2026-11-10; aceptada el 2026-11-12; base de datos en H1; backend implementado en la rama; frontend implementado en la rama en K1 a K4; base principal pendiente, paso 9.1.5)

**Origen.** Los requisitos son las preguntas 2, 3, 4 y 5 del cuestionario firmado (§3). El mecanismo sale de las decisiones del proyecto del 2026-11-10: D1 (retiro), D7 (visibilidad), D9 (valor anterior observado) y D10 (sin cambios), con la auditoría de [ADR-012](ADR-012-eventos-de-auditoria-sin-transicion.md).

- **AN2b · Categorías (pregunta 5):** solo PODCAST, VIDEO y STREAMING admiten anexo. Fuente única: `POLITICA_POR_CATEGORIA.admiteAnexo` y la lista derivada `CATEGORIAS_CON_ANEXO` (hoy coincide con `CATEGORIAS_CON_ENLACE`, pero por otro motivo). En el motor, `Solicitud_enlace_anexo_segun_categoria_check`: sin anexo, o una de esas categorías. Al radicar, un anexo en otra categoría → 400 `MENSAJE_ANEXO_NO_APLICA` (amplía AN3). **Estado (2026-11-11):** la restricción del motor está en H1 (I-38d); la validación del DTO y el formulario estaban sin implementar. Mientras tanto, con H1 aplicada, el DTO de la rama aceptaba un anexo en ESPACIOS o ASESORIAS que el motor rechaza: incumplía DTO ⊆ CHECK (FU2).
  - **Estado (2026-11-12):** cerrado en el backend por J0 (`b2b292b`). Antes del cambio se midió, en la base desechable, que la radicación terminaba en un error del motor (SQLSTATE 23514, sin `HttpException`, 0 filas) en ESPACIOS y ASESORIAS. Ahora el servicio responde 400 `MENSAJE_ANEXO_NO_APLICA` antes de las validaciones de franja y de CA-06. Pruebas: unitarias del servicio, e2e del anexo e integración I-38e. **Pendiente (lote K):** ocultar el campo en el formulario para las categorías sin anexo.
  - **Frontend (K2, `5c27ec3`):** el formulario muestra el campo solo en PODCAST, VIDEO y STREAMING, con la política `ADMITE_ANEXO` (copia de `admiteAnexo`; `contrato.test.ts` la compara con el backend desde K1). Al cambiar a ESPACIOS o ASESORIAS el anexo se borra y, aunque quedara un valor residual, no se valida ni viaja (`anexoSegunCategoria()`); entre categorías que lo admiten se conserva. `CuerpoCrearSolicitud` impide en compilación un `enlace_anexo` en ESPACIOS o ASESORIAS. El servidor sigue decidiendo (400).
- **AN10 · Endpoint (preguntas 3 y 4):** `PATCH /solicitudes/:radicado/anexo`, `@Roles(SOLICITANTE)`, separado del `PATCH` del tablero. La propiedad va en el `WHERE`: una solicitud ajena o inexistente recibe el mismo 404 (ADR-002). Solo en `Recibido` y en `CATEGORIAS_CON_ANEXO`. El actor sale del JWT, y cada cambio efectivo deja un evento ANEXO (quién, cuándo, enlace anterior y nuevo) en la misma transacción.
- **AN11 · Cuerpo:** `{ enlace_anexo_anterior: string | null, enlace_anexo: string | null }`, las dos **obligatorias**. Cada una se valida con `@ValidateIf(o => o.<campo> !== null)` seguido de sus validadores: si la propiedad no vino, los validadores corren y responden 400; con `null`, se omiten. El nuevo, si es texto, usa `EnlaceSeguro`; el anterior es un valor para comparar (texto de hasta 2048). Otro tipo, `''` o una forma insegura → 400.
  - **Precisión (2026-11-12, implementada en J2):** el anterior tampoco admite solo espacios, se compara exactamente y su forma inválida responde `MENSAJE_ANEXO_ANTERIOR_FORMA`.
- **AN12 · Retiro (D1):** `enlace_anexo: null` retira el anexo, solo en solicitudes propias en `Recibido`. Si hay un cambio efectivo, el evento guarda el enlace anterior, `NULL` como nuevo, el actor, la fecha y el radicado.
- **AN13 · Valor anterior observado (D9):** `enlace_anexo_anterior: null` significa «vi que no había anexo». Si no coincide con el vigente → **409** `MENSAJE_ANEXO_DESACTUALIZADO`, sin escritura ni log. `esperado` lleva `id_usuario`, `estado: 'Recibido'` y el valor observado; si cambia entre la lectura y la escritura → 409. El límite ABA está en ADR-012 §2.5.
- **AN14 · Sin cambios (D10):** si el valor pedido ya es el vigente → **200** con `sin_cambios: true`, sin escritura ni log. **Orden (enmendado el 2026-11-12, DJ2-1; implementado en J2):** 401 → 403 → 400 de forma → 404 → 400 de categoría → 409 si no está en `Recibido` → 200 `sin_cambios` → 409 por AN13 → *compare-and-set* y evento. `sin_cambios: true` solo se responde cuando la edición sería válida en ese estado; es la misma regla de [ADR-012](ADR-012-eventos-de-auditoria-sin-transicion.md) D10 enmendada. **Orden anterior (2026-11-10, sustituido; se conserva por trazabilidad):** … → 400 de categoría → 200 `sin_cambios` → 409 si no está en `Recibido` → 409 por AN13 → … («La igualdad va antes del estado solo porque no escribe»).
  - **Respuesta (DJ2-2):** `{ mensaje, sin_cambios, solicitud }`, con la proyección del solicitante. `sin_cambios` no es una modificación ni prueba que una petición anterior se haya confirmado, y no es idempotencia completa: ante una respuesta incierta, el frontend vuelve a consultar el detalle. La respuesta del backend (NestJS) ya lleva `sin_cambios` de forma explícita (J2, `eeb978c`); el contrato de Zod del frontend que lo valide estaba **pendiente** (lote K). **Hecho en K3 (`be6a02a`):** `esquemaRespuestaEdicionAnexo` exige `sin_cambios` booleano; una respuesta sin él es un error de contrato.
- **Frontend de AN10 a AN14 (K3, `be6a02a`):** en el detalle del solicitante, junto a la fila «Anexo (guion)», fuera de la máquina de estados y de `AccionesSolicitud`.
  - **Cuándo se ofrece:** solo al rol SOLICITANTE, en `Recibido` y en PODCAST, VIDEO o STREAMING («Agregar anexo», o «Cambiar anexo» y «Retirar anexo»). Ofrecerlo no autoriza nada: propiedad, estado y categoría los decide el servidor (AN10).
  - **Cuerpo:** `enlace_anexo_anterior` es la foto del detalle al abrir el diálogo y viaja exacta, `null` incluido (AN13). El nuevo pasa por `anexoParaEnviar`; el campo vacío no retira (se indica usar «Retirar anexo») y el mismo enlace no se envía. El retiro es una acción propia, con confirmación y `enlace_anexo: null` explícito (AN12); no se presenta como irreversible.
  - **Respuestas:** tras un éxito, con o sin `sin_cambios`, la ficha se pinta solo con la `solicitud` devuelta y se anuncia su `mensaje`; no se simulan eventos. Un 409 bloquea la confirmación y recarga el detalle una sola vez al cerrar, sin reintento automático. 400 y 404 muestran el mensaje del servidor.
- **AN15 · Visibilidad y ayuda (D7, pregunta 2):** el solicitante ve el anexo vigente de su solicitud; el historial de cambios solo lo ve el Staff (la proyección del solicitante excluye los eventos de enlace). La línea de vida y sus fechas no cambian. `TEXTO_AYUDA_ANEXO` pasa a indicar que el archivo se comparte con usuarios de `@unicesmag.edu.co`.
  - **Ayuda (K2, `5c27ec3`):** el texto orienta a iniciar sesión en Drive con la cuenta institucional (`@unicesmag.edu.co`) y a elegir, en Compartir, «Acceso general» → «Universidad Cesmag» → «Lector»; explica que así lo abren, con el enlace, las personas de la organización y que no queda público; advierte que no se use «Cualquier persona con el enlace» y remite al Estudio C si la opción institucional no aparece. Reemplaza el texto provisional con estudioc@unicesmag.edu.co. **Es orientación:** el sistema valida la forma del enlace, no los permisos del archivo en Drive.
  - **Visibilidad (K4, `479c60c`):** el historial de enlaces es una sección propia del detalle del Staff, aparte de la línea de vida; la pantalla del solicitante no lo pide ni lo muestra. El detalle está en [ADR-008](ADR-008-edicion-postproduccion-y-enlace-de-entrega.md) §2.7 y [ADR-012](ADR-012-eventos-de-auditoria-sin-transicion.md) EV7.
- **Relación con T1 (D4-B′):** en las categorías con anexo, aprobar exige `anexo_revisado` ([ADR-005](ADR-005-maquina-de-estados-ca10.md) E7). Si el solicitante cambia o retira el anexo después de que el Staff abrió el detalle, la aprobación recibe 409 y el Staff recarga. Se protege la referencia, no la lectura del archivo. **Frontend (K1, `0dc6eac`):** las dos rutas de T1 envían `anexo_revisado`; el detalle está en ADR-005 §2.2.

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
| AN2b, AN10 a AN15 | **Motor de AN2b (H1):** I-38d en H3-C. **Aplicación (backend, en la rama):** AN2b → unitarias del servicio, e2e del anexo e I-38e (J0); AN10 a AN14 → `editar-anexo.dto.spec.ts`, unitarias del servicio y del controlador, e2e del anexo e I-42 (`edicion-anexo.int-spec.ts`, con la concurrencia frente a T1 y a la cancelación) (J2); AN15 → I-41 (proyecciones) y, para el historial del Staff, `historial-enlaces.e2e-spec.ts` e I-45 (J2b); relación con T1 → ADR-005 E7 (J1, I-44). **Frontend (en la rama, Vitest):** K1 → `presentacion/acciones-staff.test.ts`, `DetalleStaff.acciones.test.tsx` y `api/contrato.test.ts` (`ADMITE_ANEXO` frente al backend); K2 (AN2b y ayuda) → `Dashboard.test.tsx`, `presentacion/anexo.test.ts` y `api/solicitudes.test.ts` (tipos); K3 (AN10 a AN14) → `DetalleSolicitud.anexo.test.tsx`, `presentacion/anexo.test.ts`, `api/esquemas.test.ts` y `api/solicitudes.test.ts`; K4 (AN15) → `DetalleStaff.enlaces.test.tsx`, `presentacion/enlaces-staff.test.ts` y `api/esquemas.test.ts`. **Pendiente:** el paso 9.1.5 sobre la base principal, su postcheck y la prueba manual. Estado previo a K1–K4, conservado: «Pendiente: el frontend (lote K) y la producción (9.1.5)» |

Cifras de la última corrida: backend 32 suites · 1067 + 1 omitida; e2e 7 · 92; integración 10 · 127/127; frontend 46 · 624. CI en verde en `aa9f9b7` y `749566d`. Con H1 (H3-C, base desechable, reportado el 2026-11-11): integración 11 · 182/182. Al `e0bc0d7` (base desechable, **reportado** el 2026-11-12, no reverificado al redactar este ADR): 1.365 unitarias, 126 e2e e integración 16 suites y 212 pruebas. C1 (entorno local de desarrollo, 2026-11-12; resultados ejecutados por el responsable del proyecto y reportados para revisión): frontend 849 pruebas, `test:tz` en 4 zonas, `tsc`, lint y `vite build` correctos; backend `tsc`, lint, 1.365 unitarias (1 omitida) y 126 e2e. La integración PostgreSQL no se repitió en C1 (evidencia anterior: 16 suites y 212 pruebas al `e0bc0d7`, base desechable).

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

- Hecho en el backend de la rama: la ampliación (§2.7) y la precondición de T1 (ADR-005 E7), con sus pruebas (J0 a J2b). Falta el frontend (lote K): ocultar el anexo fuera de PODCAST, VIDEO y STREAMING, `TEXTO_AYUDA_ANEXO`, la edición y el retiro del anexo, el historial para el Staff, `anexo_revisado` en T1 y `sin_cambios` en los contratos de Zod. Bloquea el PR.
  - ✅ **Estado al 2026-11-14:** el frontend está implementado en la rama: `anexo_revisado` en T1 (K1, `0dc6eac`); anexo según la categoría y `TEXTO_AYUDA_ANEXO` (K2, `5c27ec3`); edición y retiro del anexo, y Zod con `sin_cambios` (K3, `be6a02a`); historial para el Staff (K4, `479c60c`). Ya no bloquea el PR. La línea anterior se conserva como estado previo.
- Hecho: P0 (precheck 9.1.0b) y la migración consolidada H1 (`df4e6e9`, checksum en §2.6). Falta: el precheck 0c y el postcheck reescrito para H1, antes del 9.1.5.
- Paso 9.1.5 en producción y su postcheck. **Sigue pendiente (2026-11-14):** se aplica sobre la base principal, con aprobación propia (aclaración de §2.6).
- La prueba manual con navegador real después del 9.1.5 (con una solicitud real con anexo, o con un radicado de prueba que luego se cancela, conforme a DT-3). **Sigue pendiente.**

---

## 7. Historial de implementación

| Commit | Paso |
|---|---|
| — | 9.1.0 · Precheck de solo lectura en producción (`precheck-9-1-0.sql`): 10/10; línea base 28 / 47 / 0 / 17.6 |
| `a64984c` | 9.1.1 a 9.1.3 · Fuente única, migración aditiva, DTOs, servicio, proyecciones y pruebas |
| `aa9f9b7` | Prueba del anexo con un objeto plano y `satisfies` (`no-misused-spread`) |
| `749566d` | 9.1.4 · Frontend (contrato, `anexoParaEnviar`, `EnlaceExternoSeguro`, formulario B2 y detalles) y e2e del backend |
| `f8b3706` · `a111c73` · `df4e6e9` · `2af8f2f` | L0 (ADR-012 y enmiendas), H0 (patrón sin `\p{Cc}`), H1 y H2 (migración consolidada y modelo) y H3-A (pruebas I-38 e I-40) |
| `b2b292b` | Fase 9 · J0 · AN2b: anexo solo en PODCAST, VIDEO y STREAMING al radicar (400 antes del motor) |
| `04f23a0` | Fase 9 · J1 · ADR-005 E7: `anexo_revisado` en T1 |
| `eeb978c` | Fase 9 · J2 · AN10 a AN14: edición y retiro del anexo, con el orden de AN14 enmendado |
| `f1962e6` | Fase 9 · J2b · AN15: historial de enlaces para el Staff (`GET /solicitudes/:radicado/historial-enlaces`) |
| `0dc6eac` | Fase 9 · K1 · Frontend de ADR-005 E7: `anexo_revisado` en las dos rutas de T1 |
| `5c27ec3` | Fase 9 · K2 · Frontend de AN2b y AN15: anexo solo en PODCAST, VIDEO y STREAMING en el formulario, y ayuda institucional de Drive |
| `be6a02a` | Fase 9 · K3 · Frontend de AN10 a AN14: agregar, cambiar y retirar el anexo desde el detalle del solicitante; Zod con `sin_cambios` |
| `479c60c` | Fase 9 · K4 · Frontend de AN15: historial de enlaces solo en el detalle del Staff (y la corrección de la entrega, ADR-008) |
| — | Fase 9 · C1 (entorno local de desarrollo, 2026-11-12; resultados ejecutados por el responsable del proyecto y reportados para revisión): frontend 849 pruebas, `test:tz` en 4 zonas, `tsc`, lint y `vite build` correctos; backend `tsc`, lint, 1.365 unitarias (1 omitida) y 126 e2e. La integración PostgreSQL no se repitió en C1 (evidencia anterior: 16 suites y 212 pruebas al `e0bc0d7`, base desechable) |
| — | 9.1.5 · Precheck, `migrate status`, `npm run db:migrate` y postcheck en producción ⏳ |
| — | 9.1.6 · Este ADR, la nota de ADR-008, los README y el PR ⏳ |
