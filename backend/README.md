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
npm test            # Pruebas unitarias (45)
npm run test:e2e    # Pruebas end-to-end de la cadena de seguridad (14)
```

- Las pruebas **nunca tocan Supabase**: `PrismaService` se reemplaza por un mock. Los e2e levantan el `AppModule` real (guards globales, rutas y `ValidationPipe` de producción) y hacen peticiones HTTP reales con `supertest`.
- ⚠️ **No quites `--experimental-vm-modules` de los scripts de prueba.** Los paquetes de NestJS 12 son ESM y Jest necesita ese flag para cargarlos. El aviso `ExperimentalWarning: VM Modules` que aparece en consola es esperado.
- ⚠️ Jest 30 usa un resolvedor nativo (`unrs-resolver`) que se descarga **por sistema operativo**. Si copias `node_modules` de un sistema a otro (por ejemplo, de Windows a Linux), Jest falla con un mensaje engañoso: `Module ts-jest ... was not found`. La solución es ejecutar `npm ci` en cada sistema.
- Durante los e2e verás líneas `WARN [JwtAuthGuard] JWT rechazado: ...`. **Son esperadas**: registran los ataques que simulan las pruebas.

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

### Herramientas disponibles

| Herramienta | Ubicación | Para qué sirve |
|---|---|---|
| `@Public()` | `src/auth/decorators/public.decorator.ts` | Excluye un endpoint de la exigencia de JWT. Úsalo solo con justificación |
| `@Roles(...)` | `src/auth/decorators/roles.decorator.ts` | Restringe un endpoint o controlador a uno o más roles. El del método tiene prioridad sobre el de la clase |
| `@UsuarioActual()` | `src/auth/decorators/usuario-actual.decorator.ts` | Inyecta la identidad verificada (`UsuarioAutenticado`). Responde 401 si no existe (fail-closed) |
| `crearValidationPipe()` | `src/common/pipes/crear-validation-pipe.ts` | Única fuente de la configuración de validación (la usan `main.ts`, los tests y los e2e) |

### ✅ Lista de verificación para agregar un endpoint

1. **No agregues `@UseGuards(JwtAuthGuard)`.** El guard ya es global; repetirlo solo duplica la consulta a la BD.
2. **`@Public()` solo con justificación explícita.** Hoy el único endpoint público es `POST /auth/google/login`.
3. Si el endpoint es exclusivo del Staff, usa `@Roles(RolUsuario.STAFF)`.
4. Obtén la identidad **solo** con `@UsuarioActual() usuario: UsuarioAutenticado`, importando el tipo con **`import type`** (lo exige la combinación `emitDecoratorMetadata` + `isolatedModules`).
5. **Nunca** declares en un DTO, query o parámetro campos de identidad o autoría (`id_usuario`, `modificado_por`, `rol`).
6. Si el endpoint devuelve datos de un solicitante, **filtra por `usuario.id` en el servicio** (aislamiento de datos).
7. Declara las rutas estáticas **antes** que las dinámicas (por ejemplo, `mis-solicitudes` antes de `:radicado`). Express las evalúa en orden de declaración.
8. Agrega pruebas: unitarias para los metadatos de `@Roles` y e2e si cambias la cadena de seguridad.

### Matriz de acceso vigente

| Endpoint | Acceso |
|---|---|
| `POST /auth/google/login` | 🌐 Público |
| `GET /` | 🔐 Autenticado |
| `POST /solicitudes` | 🔐 Autenticado. El solicitante sale del token |
| `GET /solicitudes/mis-solicitudes` | 🔐 Autenticado. Solo ve sus propias solicitudes |
| `GET /solicitudes` | 🛡️ STAFF |
| `GET /solicitudes/:radicado` | 🛡️ STAFF *(temporal: en la Fase 2 se abrirá también al dueño)* |
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
├── common/pipes/        crearValidationPipe()
├── solicitudes/  usuarios/  recursos/  prisma/
test/
├── utils/               Helpers solo para pruebas (excluidos del build)
└── *.e2e-spec.ts
```

## 7. Decisiones de arquitectura

El *por qué* de este diseño está en los ADR (Architecture Decision Records):

- [ADR-001 — Identidad y autorización Zero Trust](../docs/adr/ADR-001-identidad-zero-trust.md)
