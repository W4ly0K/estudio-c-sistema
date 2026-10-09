# Backend — Sistema de Gestión Estudio C

API del sistema de gestión, reservas y seguimiento de solicitudes de espacios y equipos audiovisuales del **Estudio C** (Centro de Innovación Digital, Universidad CESMAG).

| Capa | Tecnología |
|---|---|
| Framework | NestJS 12 (sus paquetes se publican como **ESM**) |
| Persistencia | Prisma 5 + PostgreSQL (Supabase) |
| Autenticación | Google OAuth institucional (`@unicesmag.edu.co`) → JWT propio (Passport) |
| Pruebas | Jest 30 + ts-jest + supertest |
| Lenguaje | TypeScript en modo `strict`. **El tipo `any` está prohibido** |

---

## 1. Requisitos

- Node.js **>= 20** (definido en `engines`).
- npm.
- Acceso a la base de datos del proyecto en Supabase (solo para ejecutar la API; **las pruebas no la necesitan**).

## 2. Configuración local

```bash
cd backend
npm install        # ejecuta también "prisma generate" (postinstall)
```

Crea un archivo `backend/.env` con estas variables. **Nunca subas este archivo al repositorio**; ya está en `.gitignore`.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Prisma a PostgreSQL (pooler de Supabase) |
| `DIRECT_URL` | Conexión directa, usada por Prisma para migraciones |
| `JWT_SECRET` | Secreto para firmar y verificar los JWT. **Obligatorio**: si falta, la API no arranca (fail-fast). Usa una cadena larga y aleatoria |
| `GOOGLE_CLIENT_ID` | Client ID de Google OAuth usado para verificar el token de inicio de sesión |

## 2.1 Base de datos y migraciones

Desde la Fase 4.1 el esquema se versiona con **Prisma Migrate** en `prisma/migrations/`. La migración `0_init` es el *baseline*: describe la base de datos que ya existía en Supabase y quedó registrada como aplicada con `prisma migrate resolve --applied 0_init` (su SQL nunca se ejecutó en Supabase). Cualquier cambio posterior, incluidas las restricciones que `schema.prisma` no puede expresar (por ejemplo, la restricción de exclusión de CA-06), llega como una migración nueva en SQL.

Migraciones vigentes: `0_init` (*baseline*), `20261002200000_ca06_sin_traslape` (CA-06, [ADR-004](../docs/adr/ADR-004-concurrencia-ca06.md)) y `20261008120000_k9_propuesta_coherente` (invariante K9 de la reprogramación, [ADR-005](../docs/adr/ADR-005-maquina-de-estados-ca10.md)).

```bash
npm run db:migrate   # prisma migrate deploy: aplica las migraciones pendientes
npx prisma migrate status
```

| Comando | Contra Supabase | Motivo |
|---|---|---|
| `npm run db:migrate` (`prisma migrate deploy`) | ✅ Único comando que modifica el esquema | Aplica solo migraciones pendientes y nunca hace *reset* |
| `prisma migrate status` / `prisma migrate diff` | ✅ Solo lectura | Diagnóstico de migraciones pendientes y de *drift* |
| `prisma migrate dev` | ❌ Prohibido | Necesita una base *shadow* y, si detecta *drift*, ofrece resetear la base y borrar los datos |
| `prisma db push` | ❌ Retirado | No deja historial y podría eliminar restricciones escritas en SQL |
| `prisma migrate reset` | ❌ Nunca | Destruye todos los datos |

- `DIRECT_URL` debe usar el **puerto 5432** (pooler en modo sesión). Prisma Migrate usa *advisory locks* de sesión, que el modo transacción (puerto 6543, PgBouncer) no conserva.
- Las migraciones nuevas se escriben a mano en `prisma/migrations/<timestamp>_<nombre>/migration.sql` y se revisan antes de aplicarlas.
- Una migración ya aplicada **no se edita**: Prisma guarda su *checksum* (SHA-256 del archivo) en `_prisma_migrations`. Para corregirla se crea una migración nueva.
- El `.gitattributes` de la raíz fuerza **LF** en `prisma/migrations/**/*.sql`, de modo que el *checksum* sea idéntico en Windows, en el CI y en la base de datos.
- En Windows, si se genera SQL con `prisma migrate diff ... > archivo.sql`, hay que hacerlo desde Git Bash o PowerShell 7: el `>` de PowerShell 5.1 escribe UTF-16 y Prisma no puede leer el archivo.

## 3. Ejecución

```bash
npm run start:dev   # http://localhost:3000, con recarga automática
```

## 4. Pruebas

```bash
npm test                 # Pruebas unitarias (658; 1 omitida por diseño)
npm run test:e2e         # Pruebas end-to-end por HTTP real (54)
npm run test:tz          # Pruebas de src/solicitudes en 4 zonas horarias
npm run test:integracion # CA-06, K9 y concurrencia contra PostgreSQL real, en una base DESECHABLE (25)
```

- `npm test`, `test:e2e` y `test:tz` **nunca tocan Supabase**: `PrismaService` se reemplaza por un mock. Los e2e levantan el `AppModule` real (guards globales, rutas y `ValidationPipe` de producción) y hacen peticiones HTTP reales con `supertest`.
- ⚠️ **No quites `--experimental-vm-modules` de los scripts de prueba.** Los paquetes de NestJS 12 son ESM y Jest necesita ese flag para cargarlos. El aviso `ExperimentalWarning: VM Modules` que aparece en consola es esperado.
- ⚠️ Jest 30 usa un resolvedor nativo (`unrs-resolver`) que se descarga **por sistema operativo**. Si copias `node_modules` de un sistema a otro (por ejemplo, de Windows a Linux), Jest falla con un mensaje engañoso: `Module ts-jest ... was not found`. La solución es ejecutar `npm ci` en cada sistema.
- Durante los e2e verás líneas `WARN [JwtAuthGuard] JWT rechazado: ...`. **Son esperadas**: registran los ataques que simulan las pruebas.
- **`npm run test:tz` es obligatorio si tocas fechas u horas.** Jest entrega a cada suite una *copia* de `process.env`, así que la zona horaria no se puede cambiar desde una prueba. El script `scripts/test-zonas-horarias.mjs` relanza Jest con `TZ` = UTC, America/Bogota, Pacific/Pago_Pago (UTC−11) y Pacific/Kiritimati (UTC+14). En un equipo en Bogotá, `npm test` **no detecta** un `getFullYear()` o un `getDay()` mal usados; en UTC sí. La prueba omitida de `npm test` es la precondición de esta verificación: solo se ejecuta cuando el proceso recibe `TZ`.

### 4.1 Pruebas de integración (`npm run test:integracion`)

Prueban contra **PostgreSQL real** lo que los mocks no pueden: 10 peticiones simultáneas por la misma franja (CA-06 sin carrera), el **canario** del formato del error de Prisma que reconoce `esViolacionDeTraslapeCa06` (si una actualización de Prisma lo cambia, esta batería falla antes que producción) y la coincidencia entre la restricción instalada y el código. Desde la Fase 5 también prueban el *compare-and-set* en transacciones interactivas, las tres restricciones del invariante K9 y la concurrencia de la máquina de estados: una **barrera determinista** que fuerza la carrera en cada ejecución y una batería por propiedades (nunca un 500, historial legal, ninguna actualización perdida).

**Nunca se ejecutan contra producción.** El `globalSetup` aplica tres capas, todas *fail-closed*:

1. **Identidad del proyecto:** la referencia de Supabase sale del usuario (`postgres.<ref>`) **o** del host (`db.<ref>.supabase.co`) y se compara con todas las URLs de `backend/.env`, incluidas las duplicadas y las comentadas.
2. **Confirmación explícita:** `INTEGRACION_CONFIRMO_DESECHABLE` debe ser igual a la referencia (o `host:puerto/base`).
3. **Centinela dentro de la base:** la tabla `guardia.bd_desechable` debe existir y tener una fila antes de cada `TRUNCATE`.

**Preparación (una sola vez, en el SQL Editor del proyecto DESECHABLE):**

```sql
DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres;
CREATE SCHEMA IF NOT EXISTS guardia;
CREATE TABLE IF NOT EXISTS guardia.bd_desechable (marcada_en timestamptz DEFAULT now());
INSERT INTO guardia.bd_desechable DEFAULT VALUES;
```

Después copia `.env.integracion.ejemplo` como `.env.integracion` (ignorado por Git), completa las URLs y la confirmación, y ejecuta `npm run test:integracion`. El script aplica las migraciones con `prisma migrate deploy` usando **solo** las URLs de prueba y vacía las tablas antes de cada caso.

---

## 5. Arquitectura de seguridad (Zero Trust)

Cada petición atraviesa esta cadena, en este orden:

```
Petición HTTP
  → JwtAuthGuard   (global)  ¿Quién eres?      Token válido + usuario vigente en BD → si no, 401
  → RolesGuard     (global)  ¿Puedes hacerlo?  Rol exigido por @Roles → si no, 403
  → ValidationPipe (global)  ¿Datos válidos?   DTO estricto; campos no declarados → 400
  → Controlador → Servicio
```

**Principio rector:** *denegar por defecto*. Todo endpoint exige JWT salvo que se marque explícitamente como público. La identidad **siempre** sale del token verificado y de la base de datos, **nunca** del cuerpo de la petición.

**Autorización a nivel de dato:** que un endpoint esté abierto a un rol no significa que ese rol vea *todas* las filas. La propiedad se aplica **dentro de la consulta** con `filtroDeAcceso(usuario)`, y cada rol recibe solo los campos de su **proyección** (ver [ADR-002](../docs/adr/ADR-002-autorizacion-a-nivel-de-dato.md)).

### Herramientas disponibles

| Herramienta | Ubicación | Para qué sirve |
|---|---|---|
| `@Public()` | `src/auth/decorators/public.decorator.ts` | Excluye un endpoint de la exigencia de JWT. Úsalo solo con justificación |
| `@Roles(...)` | `src/auth/decorators/roles.decorator.ts` | Restringe un endpoint o controlador a uno o más roles. El del método tiene prioridad sobre el de la clase |
| `@UsuarioActual()` | `src/auth/decorators/usuario-actual.decorator.ts` | Inyecta la identidad verificada (`UsuarioAutenticado`). Responde 401 si no existe (fail-closed) |
| `crearValidationPipe()` | `src/common/pipes/crear-validation-pipe.ts` | Única fuente de la configuración de validación (la usan `main.ts`, los tests y los e2e) |
| `filtroDeAcceso(usuario)` | `src/solicitudes/politicas/filtro-de-acceso.ts` | Política de acceso por fila: devuelve el fragmento de `WHERE` que limita lo que cada rol puede ver. Un rol nuevo sin política **no compila** |
| `SELECT_DETALLE_*` | `src/solicitudes/proyecciones/detalle-solicitud.proyeccion.ts` | Proyecciones por rol (`select` = lista blanca). La del solicitante no expone identidades internas ni inventario |
| `Reloj` | `src/common/reloj/reloj.ts` | Fuente inyectable del "ahora". Pídelo **una sola vez** por operación. En pruebas se reemplaza por `RelojFijo` (`test/utils/`) |
| `@FechaConZonaHoraria()` | `src/common/validadores/fecha-con-zona-horaria.decorator.ts` | Acepta solo fechas ISO 8601 **reales** con `Z` o `±HH:MM`. Rechaza fechas ambiguas e imposibles (`2026-02-30`, `T24:00`) |
| `evaluarHorario(...)` | `src/solicitudes/reglas/horario.validator.ts` | Reglas puras de CA-04, fechas pasadas, mismo día, día hábil y urgencia por 5 días hábiles. Devuelve un resultado; no lanza excepciones de HTTP |
| `calendarioLaboralColombia` | `src/solicitudes/reglas/calendario-colombia.ts` | Días hábiles: lunes a viernes sin los festivos de la Ley 51 de 1983, calculados con el algoritmo de Meeus |
| `evaluarTransicion` / `evaluarAccion` | `src/solicitudes/reglas/maquina-estados.ts` | Máquina de estados pura (T1–T9): dice **si** una transición es legal y **quién** puede ejecutarla. Devuelve un resultado con su motivo; no lanza excepciones de HTTP |
| `escribirConCompareAndSet` | `src/solicitudes/solicitudes.service.ts` (privado) | Único camino de escritura sobre una solicitud existente: transacción interactiva con *compare-and-set*, recursos, log de auditoría y relectura |
| `leerPropiaYAutorizar` | `src/solicitudes/solicitudes.service.ts` (privado) | Lectura común de los comandos del solicitante: primero la propiedad (404 uniforme) y después la máquina |

### ✅ Lista de verificación para agregar un endpoint

1. **No agregues `@UseGuards(JwtAuthGuard)`.** El guard ya es global; repetirlo solo duplica la consulta a la BD.
2. **`@Public()` solo con justificación explícita.** Hoy el único endpoint público es `POST /auth/google/login`.
3. Si el endpoint es exclusivo del Staff, usa `@Roles(RolUsuario.STAFF)`.
4. Obtén la identidad **solo** con `@UsuarioActual() usuario: UsuarioAutenticado`, importando el tipo con **`import type`** (lo exige la combinación `emitDecoratorMetadata` + `isolatedModules`).
5. **Nunca** declares en un DTO, query o parámetro campos de identidad o autoría (`id_usuario`, `modificado_por`, `rol`).
6. Si el endpoint devuelve datos de un solicitante, aplica la propiedad **dentro de la consulta** (`where: { ...criterio, ...filtroDeAcceso(usuario) }`). **Nunca** traigas la fila para comprobar después si es suya: un `if` olvidado es un IDOR.
7. Si un recurso ajeno o inexistente debe rechazarse, responde **404 con el mismo mensaje** en ambos casos. Nunca 403: confirmaría que el recurso existe.
8. Devuelve datos con **`select` explícito** (lista blanca) y una proyección por rol. No uses `include` para respuestas de la API.
9. Declara las rutas estáticas **antes** que las dinámicas (por ejemplo, `mis-solicitudes` antes de `:radicado`). Express las evalúa en orden de declaración.
10. Agrega pruebas **en el mismo commit**: unitarias para los metadatos de `@Roles` y la política, y e2e si cambias la cadena de seguridad (incluido un caso de recurso **ajeno**).
11. **Fechas y horas:** recibe fechas con `@FechaConZonaHoraria()` (nunca `@Type(() => Date)` solo), obtén el "ahora" del `Reloj` inyectado (nunca `new Date()` ni `@MinDate` en un DTO, que se evalúa al cargar el módulo) y evalúa las reglas en la hora de Bogotá con `aMomentoLocal()`. **Nunca** uses métodos locales de `Date` (`getHours`, `getDay`, `getFullYear`…). Ejecuta `npm run test:tz`.
12. **Integridad garantizada por el motor:** toda regla de unicidad o de no traslape se garantiza con una restricción de PostgreSQL, no solo con una consulta previa (bajo concurrencia, la consulta previa no protege: ADR-004). El error del motor se traduce con un detector anclado a **esa** restricción y **nunca** se reenvía su mensaje al cliente (el `DETAIL` contiene datos de terceros). Los cambios de esquema van solo por migraciones nuevas con `npm run db:migrate`; una migración aplicada no se edita. Ejecuta `npm run test:integracion` si tocas restricciones o migraciones.
13. **Cambios de estado:** ningún endpoint escribe `estado` por su cuenta. Consulta la máquina (`evaluarTransicion` en el tablero, `evaluarAccion` en un comando), traduce sus motivos (403 solo para `ROL_NO_AUTORIZADO`, 409 para el resto) y escribe **solo** con `escribirConCompareAndSet()`, con el estado leído en el `WHERE` y el log en la misma transacción. En los comandos del solicitante, primero la propiedad (`leerPropiaYAutorizar`) y después el estado. Una transición nueva es una fila nueva en `TRANSICIONES`, nunca un `if` en el servicio ([ADR-005](../docs/adr/ADR-005-maquina-de-estados-ca10.md)).

### Matriz de acceso vigente

| Endpoint | Acceso |
|---|---|
| `POST /auth/google/login` | 🌐 Público |
| `GET /` | 🔐 Autenticado |
| `POST /solicitudes` | 🔐 Autenticado. El solicitante sale del token |
| `GET /solicitudes/mis-solicitudes` | 🔐 Autenticado. Solo ve sus propias solicitudes |
| `GET /solicitudes` | 🛡️ STAFF |
| `GET /solicitudes/:radicado` | 🔐 Autenticado. SOLICITANTE: solo los **propios**, con proyección mínima; ajeno o inexistente → **404 idéntico**. STAFF: todos, con proyección completa |
| `PATCH /solicitudes/:radicado` | 🛡️ STAFF. Tablero: solo las transiciones T1, T2, T4 y T9. El autor del log de auditoría sale del token |
| `POST /solicitudes/:radicado/cancelar` | 🙋 SOLICITANTE **dueño** (T3, T6). Ajeno o inexistente → **404 idéntico** |
| `POST /solicitudes/:radicado/reprogramacion` | 🛡️ STAFF (T5, CA-10). El autor del log sale del token |
| `POST /solicitudes/:radicado/reprogramacion/aceptar` | 🙋 SOLICITANTE **dueño** (T7). Ajeno o inexistente → **404 idéntico** |
| `POST /solicitudes/:radicado/reprogramacion/rechazar` | 🙋 SOLICITANTE **dueño** (T8). Ajeno o inexistente → **404 idéntico** |
| `DELETE /solicitudes/:radicado` | 🛡️ STAFF. El borrado físico está prohibido (responde 501 y remite a `POST /solicitudes/:radicado/cancelar`) |
| `/usuarios` (todas las operaciones) | 🛡️ STAFF |
| `GET /recursos`, `GET /recursos/:id` | 🔐 Autenticado (catálogo del formulario) |
| `POST / PATCH / DELETE /recursos` | 🛡️ STAFF (inventario) |

---

## 6. Estructura

```
src/
├── auth/
│   ├── decorators/      @Public, @Roles, @UsuarioActual
│   ├── guards/          RolesGuard
│   ├── interfaces/      JwtPayload, UsuarioAutenticado, RequestAutenticado
│   ├── jwt-auth.guard.ts
│   └── jwt.strategy.ts  Valida el JWT y consulta el usuario vigente en la BD
├── common/
│   ├── pipes/           crearValidationPipe()
│   ├── reloj/           Reloj (abstracto) y RelojDelSistema
│   └── validadores/     @FechaConZonaHoraria()
├── solicitudes/
│   ├── politicas/       filtroDeAcceso (autorización por fila)
│   ├── proyecciones/    SELECT_DETALLE_STAFF / SELECT_DETALLE_SOLICITANTE
│   └── reglas/          Código puro: fecha civil, zona horaria, calendario laboral, urgencia, HorarioValidator y la máquina de estados (T1–T9)
├── usuarios/  recursos/  prisma/
prisma/
├── schema.prisma
└── migrations/          Historial versionado (0_init = baseline); se aplica solo con npm run db:migrate
test/
├── utils/               Helpers solo para pruebas (excluidos del build), incluido RelojFijo
├── integracion/         Batería contra PostgreSQL real (*.int-spec.ts): CA-06, K9 y concurrencia de la máquina
└── *.e2e-spec.ts
scripts/
└── test-zonas-horarias.mjs   Lanzador de npm run test:tz
```

## 7. Decisiones de arquitectura

El *por qué* de este diseño está en los ADR (Architecture Decision Records):

- [ADR-001 — Identidad y autorización Zero Trust](../docs/adr/ADR-001-identidad-zero-trust.md)
- [ADR-002 — Autorización a nivel de dato en solicitudes](../docs/adr/ADR-002-autorizacion-a-nivel-de-dato.md)
- [ADR-003 — Reglas de horario, días hábiles y zona horaria](../docs/adr/ADR-003-reglas-de-horario.md)
- [ADR-004 — Concurrencia y anti-traslape (CA-06) garantizados por el motor](../docs/adr/ADR-004-concurrencia-ca06.md)
- [ADR-005 — Máquina de estados y reprogramación por mutuo acuerdo (CA-10)](../docs/adr/ADR-005-maquina-de-estados-ca10.md)

## 8. Contrato de `GET /solicitudes/:radicado` para el frontend (pantalla B3)

Respuesta **200** para el SOLICITANTE dueño (proyección mínima):

```json
{
  "radicado": "EC-2026-0142",
  "categoria": "PODCAST",
  "proposito": "Grabación del episodio piloto",
  "num_participantes": 3,
  "fecha_inicio": "2026-10-15T14:00:00.000Z",
  "fecha_fin": "2026-10-15T16:00:00.000Z",
  "fecha_propuesta_inicio": null,
  "fecha_propuesta_fin": null,
  "estado": "En Producción",
  "es_urgencia": true,
  "recursos": [{ "cantidad_solicitada": 2, "recurso": { "nombre": "Micrófono de solapa" } }],
  "logs": [
    { "estado_anterior": "Recibido", "estado_nuevo": "Validado",
      "fecha_modificacion": "2026-10-10T15:20:00.000Z", "motivo_rechazo": null }
  ]
}
```

- `logs` viene ordenado por fecha ascendente: alimenta directamente la **línea de vida operativa**. El actor de cada cambio no se envía; la UI debe mostrarlo como *"Staff Estudio C"*.
- **404** `{ "statusCode": 404, "message": "Solicitud no encontrada.", "error": "Not Found" }` cuando el radicado no existe **o** no pertenece al usuario. La UI debe tratar ambos casos igual (por ejemplo: *"No encontramos esa solicitud"*).
- El STAFF recibe además `id_usuario`, `usuario`, `recursos[].id_detalle`, `recurso.id_recurso`, `recurso.cantidad_total`, `logs[].id_log` y `logs[].modificado_por`.

## 9. Contrato de `POST /solicitudes` para el frontend (pantalla B2)

**Fechas:** `fecha_inicio` y `fecha_fin` deben ser ISO 8601 con zona horaria explícita. Cualquiera de estas formas es válida:

```json
{ "fecha_inicio": "2026-10-13T08:00:00-05:00", "fecha_fin": "2026-10-13T10:00:00-05:00" }
{ "fecha_inicio": "2026-10-13T13:00:00.000Z",  "fecha_fin": "2026-10-13T15:00:00.000Z" }
```

Una fecha sin zona (`2026-10-13T08:00:00`) o imposible (`2026-02-30…`) responde **400** desde el pipe, con un mensaje que empieza por `fecha_inicio debe ser una fecha ISO 8601 real con zona horaria explícita`.

**Reglas de horario** (siempre en la hora de Bogotá). Si se incumplen, la respuesta es **400** con **uno solo** de estos mensajes, el de la primera regla incumplida, en este orden:

| Regla | `message` |
|---|---|
| Fin posterior al inicio | `Error CA-04: La hora de finalización debe ser posterior a la hora de inicio.` |
| No en el pasado | `Error CA-04: No se puede programar una solicitud en una fecha u hora pasada.` |
| Mismo día | `Error CA-04: La reserva debe iniciar y terminar el mismo día.` |
| Día hábil | `Error CA-04: El Estudio C no atiende sábados, domingos ni festivos.` |
| Bloque de atención | `Error CA-04: El horario debe estar completamente dentro de un bloque de atención (8:00 a.m. – 12:00 p.m. o 2:00 p.m. – 6:00 p.m.).` |

- Terminar **exactamente** a las 12:00 o a las 18:00 es válido.
- Las reglas de horario se evalúan **antes** que el anti-traslape (CA-06): el mensaje `Error CA-06: …` solo aparece con una franja válida.
- **201:** la solicitud creada incluye `es_urgencia`. Es `true` cuando la reserva cae antes del 6.º día hábil posterior a la radicación (5 días hábiles completos para el Staff, PRD §6). La urgencia **no bloquea** el envío: la UI debe avisar al solicitante que tiene que notificar al Staff por correo o WhatsApp.

**Anti-traslape (CA-06).** Si la franja se cruza con otra solicitud activa (cualquier estado distinto de `Rechazado` y `Cancelado por el Usuario`), la respuesta es **409 Conflict** con este mensaje exacto:

```
Error CA-06: el horario seleccionado se cruza con otra reserva. Elige otra franja.
```

- Es el **mismo** mensaje si el cruce lo detecta la consulta previa o si lo detecta PostgreSQL al guardar (dos peticiones simultáneas por la misma franja). El frontend no debe distinguirlos.
- El mensaje **no incluye** el radicado, el horario ni ningún otro dato de la reserva con la que se cruza (minimización de datos).
- Los intervalos son semiabiertos `[inicio, fin)`: una reserva de 10:00 a 11:00 y otra de 11:00 a 12:00 no se cruzan.

## 10. Contrato de `PATCH /solicitudes/:radicado` (solo STAFF)

Es el **tablero** del Staff: edita la solicitud y ejecuta las transiciones T1, T2, T4 y T9 de la máquina de estados (§11). Todos los campos son opcionales. Lo que se envía se combina con lo guardado **antes** de validar: enviar solo `fecha_inicio` se evalúa junto con la `fecha_fin` existente.

- `estado` debe ser uno de los 7 estados, escrito exactamente igual (mayúsculas, tildes y espacios incluidos). Si no, el pipe responde **400** con `Estado no válido según la máquina de estados`.
- Enviar el estado actual no es un cambio de estado: **200** sin log.
- **Rechazar (T2)** exige `motivo_rechazo`. Si falta o es corto, el pipe responde **400** con `El motivo de rechazo es obligatorio y debe ser detallado (mínimo 10 caracteres)`.

**Errores, en el orden en que se evalúan** (responde la primera regla incumplida):

| # | Regla | HTTP | `message` |
|---|---|---|---|
| 1 | El radicado no existe | 404 | `Solicitud no encontrada.` |
| 2 | `motivo_rechazo` sin un cambio real a `Rechazado` | 400 | `El motivo de rechazo solo se admite al cambiar el estado a "Rechazado".` |
| 3 | La transición le corresponde al solicitante (por ejemplo, pasar a `Cancelado por el Usuario`) | 403 | `Esta transición le corresponde al solicitante.` |
| 3 | La solicitud está en un estado final | 409 | `La solicitud está en un estado final y no admite cambios de estado.` |
| 3 | La máquina no define esa transición (por ejemplo, `Validado` → `Rechazado`) | 409 | `Transición de estado no permitida desde el estado actual.` |
| 3 | El estado guardado está fuera del diagrama | 409 | `El estado registrado de la solicitud no es válido; no se aplican cambios.` |
| 3 | Se pide `Pendiente de Reprogramación` (T5 tiene su propia ruta, §12.2) | 409 | `Para proponer una nueva fecha use la reprogramación: POST /solicitudes/:radicado/reprogramacion.` |
| 4 | Cambian las fechas y la solicitud no está en `Recibido` | 409 | `Las fechas solo se editan mientras la solicitud está en "Recibido". Para una solicitud validada, proponga una reprogramación.` |
| 5 | Reglas de horario (solo si cambian las fechas) | 400 | Los mensajes de la §9, en el mismo orden |
| 6 | Se aprueba (T1) una franja que ya inició | 409 | `No se puede aprobar una solicitud cuya franja ya inició o pasó. Reprográmela antes de aprobarla.` |
| 7 | Anti-traslape (solo si cambian las fechas y la solicitud ocupa la franja) | 409 | `Error CA-06: el horario seleccionado se cruza con otra reserva. Elige otra franja.` |
| 8 | Otra operación cambió la solicitud entre la lectura y la escritura | 409 | `La solicitud fue modificada por otra operación mientras se procesaba este cambio. Recargue y vuelva a intentarlo.` |

- **Rescate atómico:** mientras la solicitud está en `Recibido`, un mismo `PATCH` puede traer fechas nuevas y `"estado": "Validado"`. Se valida contra la franja nueva y se registra un solo log.
- **`es_urgencia`:** al cambiar las fechas se **recalcula** con la anticipación real en el momento del cambio.
- **Sin reactivación:** `Rechazado` y `Cancelado por el Usuario` son finales. Un cambio de estado por sí solo nunca vuelve a ocupar una franja, así que no pasa por CA-06.
- Estado y fechas se aplican **juntos**, en una sola transacción con *compare-and-set*. Si cambia el estado, el log de auditoría registra al STAFF del token (CA-09).
- El 409 de la fila 8 **no es un error del usuario**: la UI debe recargar la solicitud y permitir repetir la acción sobre el estado actual.
- **200:** `{ mensaje, solicitud }`. `mensaje` es `Estado actualizado y auditado correctamente en la bitácora` si cambió el estado, o `Solicitud actualizada correctamente (sin cambio de estado)` si no.

## 11. Máquina de estados (PRD §5.5 · ADR-005)

| # | Origen | Destino | Rol | Ruta |
|---|---|---|---|---|
| T1 | Recibido | Validado | STAFF | `PATCH /solicitudes/:radicado` con `{ "estado": "Validado" }` |
| T2 | Recibido | Rechazado | STAFF | `PATCH /solicitudes/:radicado` con `{ "estado": "Rechazado", "motivo_rechazo": "…" }` |
| T3 | Recibido | Cancelado por el Usuario | SOLICITANTE (dueño) | `POST /solicitudes/:radicado/cancelar` |
| T4 | Validado | En Producción | STAFF | `PATCH /solicitudes/:radicado` con `{ "estado": "En Producción" }` |
| T5 | Validado | Pendiente de Reprogramación | STAFF | `POST /solicitudes/:radicado/reprogramacion` |
| T6 | Validado | Cancelado por el Usuario | SOLICITANTE (dueño) | `POST /solicitudes/:radicado/cancelar` |
| T7 | Pendiente de Reprogramación | Validado | SOLICITANTE (dueño) | `POST /solicitudes/:radicado/reprogramacion/aceptar` |
| T8 | Pendiente de Reprogramación | Cancelado por el Usuario | SOLICITANTE (dueño) | `POST /solicitudes/:radicado/reprogramacion/rechazar` |
| T9 | En Producción | Entregado | STAFF | `PATCH /solicitudes/:radicado` con `{ "estado": "Entregado" }` |

- Estado inicial: `Recibido`. **Estados finales:** `Entregado`, `Rechazado` y `Cancelado por el Usuario`; no admiten ningún cambio de estado.
- Cualquier par que no está en la tabla está prohibido. Ninguna transición es compartida entre roles: si la pide el otro rol, la respuesta es 403.
- Toda transición queda en `Log_Auditoria`, en la misma transacción que el cambio, con el autor tomado del token.
- **Franjas:** todos los estados ocupan su franja oficial salvo `Rechazado` y `Cancelado por el Usuario`. En `Pendiente de Reprogramación` la franja oficial **sigue ocupada** y la propuesta **no** se reserva (§12.2).
- La base de datos garantiza que hay propuesta (`fecha_propuesta_inicio` y `fecha_propuesta_fin`) **si y solo si** la solicitud está en `Pendiente de Reprogramación`, y que la propuesta termina después de empezar (invariante K9).

## 12. Contratos de cancelación y reprogramación (CA-10)

Los cuatro comandos responden **200** (no crean recursos) con `{ mensaje, solicitud }`. Ninguno recibe identidad en el cuerpo: el usuario sale del token. En los cuatro:

- **401** sin token. **403** `No tienes permisos para realizar esta acción.` si el rol no corresponde (lo responde `RolesGuard`).
- **409** `La solicitud fue modificada por otra operación mientras se procesaba este cambio. Recargue y vuelva a intentarlo.` si otra operación cambió la solicitud mientras se procesaba. La UI debe recargar la solicitud.
- En los comandos del solicitante, la propiedad se verifica **antes** que el estado: un radicado ajeno siempre responde el mismo 404 que uno inexistente, sin revelar su estado.

### 12.1 `POST /solicitudes/:radicado/cancelar` (SOLICITANTE dueño · T3 y T6)

Sin cuerpo. **200:** `mensaje` = `Solicitud cancelada correctamente.` y `solicitud` con la proyección del solicitante (§8).

| Caso | HTTP | `message` |
|---|---|---|
| Ajeno o inexistente (respuesta idéntica) | 404 | `Solicitud no encontrada.` |
| En Producción | 409 | `La actividad ya comenzó ("En Producción") y la solicitud ya no puede cancelarse.` |
| Pendiente de Reprogramación | 409 | `La solicitud tiene una propuesta de reprogramación pendiente: acéptela o recházela.` |
| Estado final (incluido un segundo clic) | 409 | `La solicitud está en un estado final y no admite cambios de estado.` |
| Estado guardado fuera del diagrama | 409 | `El estado registrado de la solicitud no es válido; no se aplican cambios.` |

- No hay regla de tiempo: se puede cancelar en `Recibido` o `Validado` aunque la franja ya haya pasado. Cancelar libera la franja.
- Un segundo clic responde el 409 de estado final; la UI puede mostrarlo como *"la solicitud ya estaba cancelada"*.

### 12.2 `POST /solicitudes/:radicado/reprogramacion` (STAFF · T5)

Cuerpo: la franja **propuesta**, con las mismas reglas de fecha de la §9. Cualquier otro campo responde 400 (lista blanca).

```json
{ "fecha_inicio": "2026-10-28T09:00:00-05:00", "fecha_fin": "2026-10-28T10:00:00-05:00" }
```

**200:** `mensaje` = `Propuesta de reprogramación registrada: queda pendiente de la respuesta del solicitante.` y `solicitud` con la proyección del Staff, que incluye la franja oficial y `fecha_propuesta_inicio`/`fecha_propuesta_fin`.

| Caso, en orden de evaluación | HTTP | `message` |
|---|---|---|
| Radicado inexistente | 404 | `Solicitud no encontrada.` |
| En Recibido | 409 | `La solicitud aún está en "Recibido": edite sus fechas directamente (PATCH /solicitudes/:radicado). La reprogramación por mutuo acuerdo aplica a solicitudes validadas.` |
| Ya está en Pendiente de Reprogramación | 409 | `La solicitud ya tiene una propuesta de reprogramación pendiente de respuesta del solicitante.` |
| En Producción | 409 | `Transición de estado no permitida desde el estado actual.` |
| Estado final | 409 | `La solicitud está en un estado final y no admite cambios de estado.` |
| Estado guardado fuera del diagrama | 409 | `El estado registrado de la solicitud no es válido; no se aplican cambios.` |
| Propuesta igual a la franja oficial | 400 | `La franja propuesta es igual a la actual: no hay nada que reprogramar.` |
| Reglas de horario | 400 | Los mensajes de la §9, en el mismo orden |
| La propuesta se cruza con otra reserva activa | 409 | `Error CA-06: el horario seleccionado se cruza con otra reserva. Elige otra franja.` |

- La franja oficial y `es_urgencia` no cambian. La solicitud queda en `Pendiente de Reprogramación` hasta que el solicitante responda: la propuesta no se puede reemplazar ni retirar.
- **La propuesta no se reserva:** otra solicitud puede ocupar esa franja mientras espera, y la misma franja libre puede proponerse a varias solicitudes. Al aceptar, se revalida (§12.3).
- No hay campo para el motivo de la reprogramación (pendiente en el backlog).

### 12.3 `POST /solicitudes/:radicado/reprogramacion/aceptar` (SOLICITANTE dueño · T7)

Sin cuerpo: se acepta exactamente la propuesta guardada. **200:** `mensaje` = `Reprogramación aceptada: la solicitud vuelve a "Validado" con la nueva franja.` y `solicitud` (proyección del solicitante) en `Validado`, con `fecha_inicio`/`fecha_fin` iguales a la propuesta, `fecha_propuesta_*` en `null` y `es_urgencia` en `false` (la fecha la eligió el Estudio C).

| Caso, en orden de evaluación | HTTP | `message` |
|---|---|---|
| Ajeno o inexistente (respuesta idéntica) | 404 | `Solicitud no encontrada.` |
| Sin propuesta pendiente (`Recibido`, `Validado` o `En Producción`) | 409 | `La solicitud no tiene una propuesta de reprogramación pendiente.` |
| Estado final | 409 | `La solicitud está en un estado final y no admite cambios de estado.` |
| Estado guardado fuera del diagrama | 409 | `El estado registrado de la solicitud no es válido; no se aplican cambios.` |
| Propuesta no disponible (dato inconsistente; la base de datos lo impide desde K9) | 409 | `La propuesta de reprogramación no está disponible. Comuníquese con el Estudio C.` |
| La propuesta ya inició o no cumple el horario de atención | 409 | `La propuesta ya no es válida: su franja ya inició o no cumple el horario de atención. Puede rechazarla o comunicarse con el Estudio C.` |
| La franja propuesta ya fue ocupada | 409 | `Error CA-06: el horario seleccionado se cruza con otra reserva. Elige otra franja.` |

- **Gana quien acepta primero.** Si la misma franja se propuso a varias solicitudes, la primera aceptación la confirma y las demás reciben el 409 de CA-06 y siguen en `Pendiente de Reprogramación` con su propuesta. La UI debe explicarlo sin culpar al usuario: puede rechazar la propuesta (lo que cancela la solicitud) o comunicarse con el Estudio C.

### 12.4 `POST /solicitudes/:radicado/reprogramacion/rechazar` (SOLICITANTE dueño · T8)

Sin cuerpo. **200:** `mensaje` = `Reprogramación rechazada: la solicitud quedó cancelada y su franja liberada.` y `solicitud` (proyección del solicitante) en `Cancelado por el Usuario`, con la propuesta en `null`. La franja oficial se conserva como registro y queda liberada.

| Caso | HTTP | `message` |
|---|---|---|
| Ajeno o inexistente (respuesta idéntica) | 404 | `Solicitud no encontrada.` |
| Sin propuesta pendiente | 409 | `La solicitud no tiene una propuesta de reprogramación pendiente.` |
| Estado final | 409 | `La solicitud está en un estado final y no admite cambios de estado.` |
| Estado guardado fuera del diagrama | 409 | `El estado registrado de la solicitud no es válido; no se aplican cambios.` |
