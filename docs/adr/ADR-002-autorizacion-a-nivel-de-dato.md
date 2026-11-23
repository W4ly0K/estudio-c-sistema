# ADR-002 — Autorización a nivel de dato en solicitudes

| Campo | Valor |
|---|---|
| **Estado** | ✅ Aceptado |
| **Fecha** | 2026-09-30 |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `feat/fase-2-propiedad-radicado` |
| **Complementa a** | [ADR-001](ADR-001-identidad-zero-trust.md). Supera la restricción **temporal** de su Decisión E sobre `GET /solicitudes/:radicado` |
| **Relacionado con** | Modelo de Seguridad y Amenazas (aislamiento de datos, prevención de enumeración) · Pantalla B3 (detalle y seguimiento) |

---

## 1. Contexto

ADR-001 resolvió **quién eres** (identidad verificada) y **qué rol tienes** (401 vs 403). Quedaba abierta una tercera pregunta: **¿qué filas puedes ver?**

Para no exponer un IDOR (acceso a registros ajenos con solo cambiar el identificador), `GET /solicitudes/:radicado` quedó cerrado al Staff de forma temporal. Eso dejaba **inutilizable la pantalla B3**: el solicitante no podía consultar el detalle de su propia solicitud.

El diagnóstico de la Fase 2 encontró además:

1. **Radicados enumerables.** El formato `EC-AAAA-NNNN` deja unas 9.000 combinaciones por año. Negar el acceso no basta: la respuesta **no debe revelar si un radicado existe**. Un 403 en un radicado ajeno le confirmaría al atacante "existe, pero no es tuyo".
2. **Exposición excesiva de datos.** La consulta usaba `include`, que devuelve todas las columnas: identidad y rol del dueño, inventario total de cada recurso (`cantidad_total`) y los **UUID internos del Staff** en `logs[].modificado_por`.
3. **Código HTTP incorrecto.** Un radicado inexistente respondía 400, y el mensaje repetía la entrada del usuario.

---

## 2. Decisiones

### Decisión G — La autorización va dentro de la consulta, no después

Una función de política pura devuelve el fragmento de `WHERE` que corresponde a cada rol, y ese fragmento viaja **en la misma consulta**:

```ts
export function filtroDeAcceso(usuario: UsuarioAutenticado): Prisma.SolicitudWhereInput {
  switch (usuario.rol) {
    case RolUsuario.STAFF:       return {};
    case RolUsuario.SOLICITANTE: return { id_usuario: usuario.id };
    default: { const rolSinPolitica: never = usuario.rol; throw new Error(/* … */); }
  }
}
// findFirst({ where: { radicado, ...filtroDeAcceso(usuario) }, select: … })
```

- **Alternativa descartada:** traer la fila y comprobar después `if (solicitud.id_usuario !== usuario.id)`. Funciona, pero depende de que **cada** endpoint recuerde ese `if`. Un solo olvido es un IDOR.
- **Consecuencias:**
  - ✅ La base de datos **nunca devuelve** filas ajenas: no hay comprobación que olvidar.
  - ✅ **Fail-closed en dos niveles.** Si se agrega un rol al enum de Prisma sin definir su política, la asignación a `never` **no compila**. Si en ejecución llegara un rol inesperado, se lanza un error en lugar de devolver `{}`, que significaría "ver todo".
  - ✅ La política es reutilizable. La Fase 5 (edición y cancelación por parte del dueño) usará la misma función.
  - ℹ️ Se usa `findFirst` en lugar de `findUnique` porque el `WHERE` combina la clave primaria con el filtro de propiedad. PostgreSQL sigue usando el índice de la clave primaria, así que no hay costo de rendimiento.

### Decisión H — 404 idéntico para "no existe" y "no es tuyo"

Un radicado ajeno y uno inexistente reciben **el mismo código (404) y el mismo cuerpo** (`Solicitud no encontrada.`), sin repetir el radicado consultado. El Staff también recibe 404 cuando un radicado no existe.

- **Alternativa descartada:** 403 para los ajenos. Es semánticamente "más preciso", pero convierte el endpoint en un **oráculo** para enumerar los radicados existentes.
- **Consecuencias:**
  - ✅ La enumeración no revela información.
  - ⚠️ No impide que un atacante **lance miles de peticiones** y cargue la base de datos. La mitigación es un límite de peticiones (`@nestjs/throttler`), registrado para la Fase 6.
  - ⚠️ El frontend debe mostrar un único mensaje para ambos casos.

### Decisión I — Proyección estricta por rol, con `select` como lista blanca

Se definen dos proyecciones tipadas con `Prisma.validator<Prisma.SolicitudSelect>()`:

| Campo | STAFF | SOLICITANTE |
|---|---|---|
| Datos de la solicitud, estado, urgencia y `fecha_propuesta_*` | ✅ | ✅ |
| Recursos: nombre y cantidad solicitada | ✅ | ✅ |
| `recurso.cantidad_total` (inventario) | ✅ | ❌ |
| Datos del dueño (`id_usuario`, `usuario`) | ✅ | ❌ |
| Logs: estados, fecha y motivo de rechazo | ✅ | ✅ |
| Logs: `id_log` y `modificado_por` | ✅ | ❌ |

- **Alternativa descartada:** `include`. Devuelve **todas** las columnas de la tabla: una columna sensible que se agregue mañana al `schema.prisma` saldría en la API sin que nadie lo decida.
- **Consecuencias:**
  - ✅ **Mínimo privilegio en los datos.** El solicitante nunca conoce los UUID internos del Staff. La pantalla B3 muestra al actor como "Staff Estudio C".
  - ✅ **Fail-safe.** Cualquier rol distinto de STAFF recibe la proyección **mínima**.
  - ✅ **La garantía queda en el compilador.** Los tipos `DetalleSolicitud*` se derivan de las proyecciones con `SolicitudGetPayload`, y un `@ts-expect-error` en el spec **impide compilar** si alguien agrega `modificado_por` a la proyección del solicitante. Se verificó con una prueba de mutación, que falló con `TS2578: Unused '@ts-expect-error' directive`.
  - ℹ️ El Staff perdió dos campos redundantes (`radicado_solicitud` e `id_recurso` dentro de cada detalle). Ninguna pantalla los consumía.

---

## 3. Verificación

| Decisión | Pruebas que la protegen |
|---|---|
| G | `filtro-de-acceso.spec.ts` (Staff → `{}`; solicitante → `{ id_usuario }`; rol desconocido → error) · `solicitudes.service.spec.ts` (el `WHERE` incluye la propiedad) · e2e 14 y 15 |
| H | `solicitudes.service.spec.ts` (404 genérico sin eco del radicado) · e2e 15, 16 (**cuerpos idénticos**) y 18 |
| I | `solicitudes.service.spec.ts` (se usa exactamente la proyección de cada rol; la del solicitante no contiene campos sensibles) · **test de compilación** con `@ts-expect-error` · e2e 14 y 17 |
| Retiro del candado temporal | `solicitudes.controller.spec.ts` (`findOne` ya no exige rol y recibe el usuario completo) |

**Prueba de mutación de la cerradura.** Se eliminó `filtroDeAcceso` del `WHERE` en una copia temporal del código. **Tres e2e independientes fallaron** (14, 15 y 16): la regresión se detecta tanto en la consulta enviada como en el comportamiento HTTP que ve un atacante.

**Límite conocido de los e2e:** el mock de Prisma no aplica el `select`. Los e2e verifican **qué proyección se pide**; que la respuesta no contenga campos sensibles lo garantizan la prueba unitaria y el test de compilación.

**Resultado al cierre:** `npm test` 15 suites y 53 pruebas ✅ · `npm run test:e2e` 2 suites y 19 pruebas ✅.

## 4. Deuda conocida (fuera del alcance de este ADR)

- **Rate limiting** con `@nestjs/throttler` en `GET /solicitudes/:radicado` (Fase 6).
- Unificar a 404 los radicados inexistentes en `update()` y `remove()`, que hoy responden 400 (Fase 6).
- Pipe de formato de radicado (`EC-AAAA-NNNN`) para rechazar entradas basura antes de consultar la BD (Fase 6).
- Alertas por intentos repetidos de acceso a radicados ajenos (junto con CA-08).
- Integración de la pantalla B3 en el frontend, consumiendo el contrato documentado en `backend/README.md` §8.

## 5. Historial de implementación

| Commit | Paso |
|---|---|
| `5f28708` | 2.1 · `filtroDeAcceso`, proyecciones por rol y 404 uniforme en `findOne` (el endpoint sigue cerrado al Staff) |
| `54c2d25` | 2.2 · Apertura de `GET /solicitudes/:radicado` al dueño, con e2e de propiedad y anti-enumeración en el mismo commit |
