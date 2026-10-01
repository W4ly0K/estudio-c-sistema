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

## 3. Ejecución

```bash
npm run start:dev   # http://localhost:3000, con recarga automática
```

## 4. Pruebas

```bash
npm test            # Pruebas unitarias (217; 1 omitida por diseño)
npm run test:e2e    # Pruebas end-to-end por HTTP real (23)
npm run test:tz     # Pruebas de src/solicitudes en 4 zonas horarias (4 × 166)
```

- Las pruebas **nunca tocan Supabase**: `PrismaService` se reemplaza por un mock. Los e2e levantan el `AppModule` real (guards globales, rutas y `ValidationPipe` de producción) y hacen peticiones HTTP reales con `supertest`.
- ⚠️ **No quites `--experimental-vm-modules` de los scripts de prueba.** Los paquetes de NestJS 12 son ESM y Jest necesita ese flag para cargarlos. El aviso `ExperimentalWarning: VM Modules` que aparece en consola es esperado.
- ⚠️ Jest 30 usa un resolvedor nativo (`unrs-resolver`) que se descarga **por sistema operativo**. Si copias `node_modules` de un sistema a otro (por ejemplo, de Windows a Linux), Jest falla con un mensaje engañoso: `Module ts-jest ... was not found`. La solución es ejecutar `npm ci` en cada sistema.
- Durante los e2e verás líneas `WARN [JwtAuthGuard] JWT rechazado: ...`. **Son esperadas**: registran los ataques que simulan las pruebas.
- **`npm run test:tz` es obligatorio si tocas fechas u horas.** Jest entrega a cada suite una *copia* de `process.env`, así que la zona horaria no se puede cambiar desde una prueba. El script `scripts/test-zonas-horarias.mjs` relanza Jest con `TZ` = UTC, America/Bogota, Pacific/Pago_Pago (UTC−11) y Pacific/Kiritimati (UTC+14). En un equipo en Bogotá, `npm test` **no detecta** un `getFullYear()` o un `getDay()` mal usados; en UTC sí. La prueba omitida de `npm test` es la precondición de esta verificación: solo se ejecuta cuando el proceso recibe `TZ`.

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

### Matriz de acceso vigente

| Endpoint | Acceso |
|---|---|
| `POST /auth/google/login` | 🌐 Público |
| `GET /` | 🔐 Autenticado |
| `POST /solicitudes` | 🔐 Autenticado. El solicitante sale del token |
| `GET /solicitudes/mis-solicitudes` | 🔐 Autenticado. Solo ve sus propias solicitudes |
| `GET /solicitudes` | 🛡️ STAFF |
| `GET /solicitudes/:radicado` | 🔐 Autenticado. SOLICITANTE: solo los **propios**, con proyección mínima; ajeno o inexistente → **404 idéntico**. STAFF: todos, con proyección completa |
| `PATCH /solicitudes/:radicado` | 🛡️ STAFF. El autor del log de auditoría sale del token |
| `DELETE /solicitudes/:radicado` | 🛡️ STAFF. El borrado físico está prohibido (responde 501) |
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
│   └── reglas/          Código puro: fecha civil, zona horaria, calendario laboral, urgencia y HorarioValidator
├── usuarios/  recursos/  prisma/
test/
├── utils/               Helpers solo para pruebas (excluidos del build), incluido RelojFijo
└── *.e2e-spec.ts
scripts/
└── test-zonas-horarias.mjs   Lanzador de npm run test:tz
```

## 7. Decisiones de arquitectura

El *por qué* de este diseño está en los ADR (Architecture Decision Records):

- [ADR-001 — Identidad y autorización Zero Trust](../docs/adr/ADR-001-identidad-zero-trust.md)
- [ADR-002 — Autorización a nivel de dato en solicitudes](../docs/adr/ADR-002-autorizacion-a-nivel-de-dato.md)
- [ADR-003 — Reglas de horario, días hábiles y zona horaria](../docs/adr/ADR-003-reglas-de-horario.md)

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
