# ADR-001 — Identidad y autorización Zero Trust en el backend

| Campo | Valor |
|---|---|
| **Estado** | ✅ Aceptado · La restricción temporal de la Decisión E sobre `GET /solicitudes/:radicado` fue superada por [ADR-002](ADR-002-autorizacion-a-nivel-de-dato.md) |
| **Fecha** | 2026-09-29 |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `refactor/fase-1-zero-trust` |
| **Relacionado con** | Modelo de Seguridad y Amenazas · PRD v2.1 (CA-09) · Documento de Control de Versiones |

---

## 1. Contexto

La revisión de `solicitudes.service.ts` y de la capa `auth` (Fase 0) encontró vulnerabilidades que contradicen el *Modelo de Seguridad y Amenazas* del proyecto:

1. **Suplantación en la auditoría.** El autor de cada cambio de estado se tomaba del cuerpo de la petición (`modificado_por`) y, si faltaba, se usaba un valor fijo (`'1085000000'`). Cualquier usuario podía atribuirle un cambio a otra persona, lo que anulaba la trazabilidad inmutable exigida por **CA-09**.
2. **Sin control por rol.** Un SOLICITANTE autenticado podía listar todas las solicitudes, cambiar estados y consultar radicados ajenos (IDOR). También podía listar, editar y borrar usuarios, y alterar el inventario de recursos.
3. **Rol tipado como `string`** y un tipo de `Request` incorrecto: se usaba el `Request` de la Fetch API en lugar del de Express.
4. **Protección opcional (*opt-in*).** Cada controlador tenía que acordarse de aplicar `@UseGuards(JwtAuthGuard)`. Un olvido dejaba el endpoint público.
5. **Campos ajenos descartados en silencio.** Con solo `whitelist: true`, un intento de inyectar campos se eliminaba sin error ni rastro.

**Principio rector adoptado:** *nunca confiar, siempre verificar*. La identidad y los permisos de un usuario se derivan exclusivamente del token verificado y de la base de datos. Nunca de lo que el cliente declara.

---

## 2. Decisiones

### Decisión A — El rol y la identidad se leen de la base de datos en cada petición

`JwtStrategy.validate()` consulta al usuario por el `sub` del token (con un `select` mínimo de 3 campos) y construye un `UsuarioAutenticado` con el **rol vigente en la BD**, no con el que dice el token.

- **Alternativa descartada:** confiar en los *claims* del token. Un token dura 8 horas, así que un usuario degradado o eliminado conservaría sus privilegios durante todo ese tiempo.
- **Consecuencias:**
  - ✅ Degradar o eliminar a un usuario tiene efecto **inmediato**, desde su siguiente petición.
  - ⚠️ Cuesta una consulta por clave primaria en cada petición autenticada. Es aceptable para el volumen del Estudio C; si llegara a pesar, la mitigación sería una caché de vida corta.
- **Complementos:** se fija `algorithms: ['HS256']` para cerrar la puerta a la confusión de algoritmo. Si falta `JWT_SECRET`, la API no arranca (*fail-fast*). Un `sub` vacío se rechaza **antes** de consultar la BD.
- **Contratos separados:** `JwtPayload` es lo que *dice el cliente* (su `rol` es solo informativo para la UI). `UsuarioAutenticado` es lo que *verificó el servidor*. Ambos usan el enum `RolUsuario`, no `string`.

### Decisión B — Rechazo explícito de campos no declarados (`forbidNonWhitelisted`)

Cualquier campo que no exista en el DTO provoca un **400**, en lugar de descartarse en silencio. `modificado_por` se eliminó del DTO; un comentario en el código documenta que su ausencia es intencional.

- **Alternativa descartada:** solo `whitelist: true`. Oculta los intentos de *mass assignment* y los errores de integración.
- **Consecuencias:**
  - ✅ Los intentos de inyección son **visibles**.
  - ⚠️ Un cliente que envíe campos de más recibe un 400. Antes de activarlo se verificó que el frontend (`Dashboard.jsx`, `App.jsx`) solo envía campos declarados.
  - ⚠️ Solo protege a los endpoints que reciben **clases DTO**; un `@Body('campo')` de tipo primitivo no se valida (ver Deuda conocida).

### Decisión C — La seguridad queda respaldada por pruebas automatizadas

Cada decisión de este ADR tiene al menos una prueba que falla si alguien la revierte: **45 pruebas unitarias y 14 end-to-end**. Prisma siempre se simula, así que las pruebas nunca tocan Supabase.

- **Alternativa descartada:** pruebas manuales con Postman. No se pueden repetir y no detectan regresiones.
- **Consecuencias:**
  - ✅ Las regresiones de seguridad se detectan antes de integrar.
  - ⚠️ Jest 30 depende de un binario nativo por sistema operativo, así que `node_modules` debe instalarse en cada sistema donde se ejecuten las pruebas.

### Decisión D — Guards globales con "denegar por defecto" y excepción explícita `@Public()`

`JwtAuthGuard` y `RolesGuard` se registran como `APP_GUARD`, **en ese orden**. Todo endpoint exige JWT salvo los marcados con `@Public()`; hoy el único es `POST /auth/google/login`.

- **Alternativa descartada:** `@UseGuards` en cada controlador (*opt-in*). Un olvido deja el endpoint público sin que nadie lo note.
- **Consecuencias:**
  - ✅ Un olvido produce un **401**, no una fuga de datos.
  - ✅ Se separa **401** (no sé quién eres) de **403** (sé quién eres, pero no tienes permiso).
  - ⚠️ **El orden de los `APP_GUARD` es crítico**: `RolesGuard` necesita el `req.user` que llena `JwtAuthGuard`. Lo protege el test e2e n.º 7.
  - ⚠️ `@Roles()` sin argumentos **no compila** (la firma exige al menos un rol), porque un `@Roles()` vacío sería ambiguo.

**Complemento: el decorador `@UsuarioActual()` es *fail-closed*.** Si no hay identidad, responde 401. Sin esta verificación, un endpoint sin guard entregaría `undefined` al servicio, y **Prisma ignora los campos `undefined` en un `where`**: `findMany({ where: { id_usuario: undefined } })` devolvería **todas** las solicitudes, sin ningún error visible.

### Decisión E — Cierre de `/usuarios` y de la escritura de `/recursos` al rol STAFF

- `/usuarios` (todas las operaciones) → `STAFF`.
- `/recursos`: lectura para cualquier usuario autenticado (el formulario de solicitud necesita el catálogo); escritura (`POST`/`PATCH`/`DELETE`) → `STAFF`, porque el inventario es responsabilidad del Staff (PRD §7).
- `/solicitudes`: listar todas, cambiar estados y eliminar → `STAFF`. `GET /solicitudes/:radicado` → `STAFF` **de forma temporal**, hasta implementar el control de propiedad (Fase 2).
- **Consecuencia:** ✅ se cierran la exposición de datos personales, la edición de cuentas ajenas y la alteración del inventario. En `/solicitudes/:radicado` se prefirió **negar por defecto** mientras llega la regla definitiva ("el dueño o el Staff").

### Decisión F — Una sola fuente para la configuración de validación

`crearValidationPipe()` concentra la configuración (`whitelist`, `forbidNonWhitelisted` y `transform`), y la usan `main.ts`, las pruebas unitarias y las e2e.

- **Alternativa descartada:** copiar la configuración en cada prueba. Produce **deriva silenciosa**: si alguien cambia `main.ts`, las pruebas siguen en verde verificando una configuración que ya no existe en producción.
- **Consecuencia:** ✅ las pruebas verifican exactamente lo que corre en producción.

---

## 3. Verificación

| Decisión | Pruebas que la protegen |
|---|---|
| A | `jwt.strategy.spec.ts` (degradación inmediata, usuario borrado, `sub` vacío, *fail-fast*) · e2e 4 y 8 |
| B | `update-solicitude.dto.spec.ts` · e2e 12 |
| D | `roles.guard.spec.ts` · `jwt-auth.guard.spec.ts` · `usuario-actual.decorator.spec.ts` · e2e 1, 5, 7 y `app.e2e` |
| E | `solicitudes.controller.spec.ts` (metadatos de `@Roles`) · e2e 6, 9 y 10 |
| Auditoría CA-09 | `solicitudes.service.spec.ts` (incluye defensa en profundidad ante un DTO manipulado) · e2e 13 |
| Orden de las rutas | e2e 11 (`mis-solicitudes` no es capturada por `:radicado`) |

**Resultado al cierre:** 14 suites y 45 pruebas unitarias en verde; 2 suites y 14 pruebas e2e en verde.

## 4. Deuda conocida (fuera del alcance de este ADR)

- ~~Control de propiedad en `GET /solicitudes/:radicado` (Fase 2).~~ ✅ Resuelto en ADR-002.
- `LoginGoogleDto` para validar el body del login, que hoy es un primitivo.
- `CreateUsuarioDto` acepta `id_usuario` del cliente, y `UpdateUsuarioDto` permite modificar la clave primaria.
- El borrado de usuarios es físico, lo que rompe la trazabilidad de la auditoría.
- Los mensajes de validación salen en inglés (se pueden personalizar con `exceptionFactory`).
- Integración continua (GitHub Actions) para ejecutar las pruebas en cada push.

## 5. Historial de implementación

| Commit | Paso |
|---|---|
| `bf65770` | 1.1–1.2 · Contrato `UsuarioAutenticado` y validación del JWT contra la BD |
| `a59fc89` | 1.3 · Decorador `@UsuarioActual()` *fail-closed* |
| `9173b8f` | 1.4 · `RolesGuard`, guards globales, `@Public()`; cierre de `/usuarios` y `/recursos` |
| `67c0f3e` | 1.5 · `SolicitudesController` con identidad verificada; `Logger` |
| `bbbee04` | 1.6 · Eliminación de `modificado_por` y `forbidNonWhitelisted` |
| `8974110` | 1.8.2 · Mocks mínimos en los specs generados |
| `cf981d3` | 1.8.3 · Pruebas unitarias de `auth` |
| `d4aeef9` | 1.8.3 · Pruebas unitarias de `solicitudes`; `crearValidationPipe()` |
| `5305b9a` | 1.8.4 · Pruebas e2e de la cadena de seguridad |
