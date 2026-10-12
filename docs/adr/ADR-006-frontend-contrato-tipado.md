# ADR-006 — Bases del frontend y contrato tipado con la API

| Campo | Valor |
|---|---|
| **Estado** | ✅ Aceptado (pasos 6.0 a 6.3; la Fase 6 lo amplía en 6.4 y 6.5) |
| **Fecha** | 2026-10-11 |
| **Actualización** | 2026-10-12 · Paso 6.2: CORS con lista blanca, `GET /auth/perfil` y la sesión como máquina de estados (§2.7 a §2.9) |
| **Actualización** | 2026-10-12 · Paso 6.3: fechas en la hora de Bogotá y pruebas en cuatro zonas horarias; F2 y F3 resueltos (§2.10) |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `feat/fase-6-frontend` |
| **Complementa a** | [ADR-005](ADR-005-maquina-de-estados-ca10.md) (el frontend consume T1–T9 y CA-10, incluido el motivo de §2.9) · [ADR-002](ADR-002-autorizacion-a-nivel-de-dato.md) (una proyección por rol; 404 uniforme) · [ADR-001](ADR-001-identidad-zero-trust.md) (la identidad sale del JWT, nunca del cuerpo) |
| **Relacionado con** | README del backend §8 a §12 (contrato) · README del frontend · Diagnóstico de la Fase 6 (F1 a F7) |

---

## 1. Contexto

El diagnóstico de la Fase 6 (solo lectura) encontró un frontend de unas 330 líneas que no consumía nada de la Fase 5:

1. **F1 · JavaScript, no TypeScript.** Incumplía la regla del proyecto y no había tipos para los 7 estados, las respuestas ni los mensajes del contrato.
2. **Confianza ciega en la red.** `res.json()` es `any`: la UI usaba lo que llegara. Un error al cargar la lista se veía como *"No tienes solicitudes"*.
3. **F4 · Sesión incoherente.** Un JWT vencido (8 h) no cerraba la sesión: quedaba un panel muerto.
4. **F6 · Configuración frágil.** URL de la API escrita en tres sitios, `clientId` de Google en el código y Tailwind mezclando la configuración v3 con un paquete v4 sin usar.
5. **F7 · Sin pruebas ni CI.**

F2 (zona horaria), F3 (validación local que contradice CA-04) y F5 (vistas por rol) se resuelven en los pasos 6.3 a 6.5.

El paso 6.2 partió de dos hechos más del backend: `app.enableCors()` sin opciones permitía **cualquier** origen, y no existía un endpoint que dijera "quién soy": el nombre del usuario solo llegaba en la respuesta del login, así que al recargar no había con qué reconstruir la sesión (F4).

**Principio rector de la fase:** *el frontend refleja; el backend decide.* La UI puede saber qué botones mostrar, pero la legalidad de cada acción la decide el servidor.

---

## 2. Decisiones

### 2.1 Bases (paso 6.0 · Decisiones DF1 y DT1 a DT4)

- **DF1 · TypeScript estricto antes que cualquier flujo nuevo.** Escribir las vistas en JavaScript y migrarlas después sería hacer el trabajo dos veces. `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `verbatimModuleSyntax` y `erasableSyntaxOnly`.
  - TypeScript 6 ya no carga `@types/*` por su cuenta: `"types": ["vite/client"]` se declara.
  - `strictImportMetaEnv` quita el `[key: string]: any` que Vite deja en `import.meta.env`: un `any` escondido.
- **DT1 · Tailwind v4 con el plugin de Vite.** Una sola fuente de configuración (`@theme` en `index.css`) y sin PostCSS. Tres utilidades cambiaron de nombre (`rounded`, `shadow-sm`) y el bloque de compatibilidad de la guía oficial conserva el cursor de los botones y el color del texto de ejemplo.
- **DT2 · Migrar sin cambiar el comportamiento.** Si algo fallaba después de la migración, la causa solo podía ser la migración. El renombre (`git mv`) fue un commit **aparte** del contenido: con el nombre y el contenido a la vez, el parecido baja del 50 % y Git pierde la historia (`git log --follow`).
- **DT3 · Configuración con *fail-fast*.** `VITE_API_URL` y `VITE_GOOGLE_CLIENT_ID` se validan al cargar en `src/config/entorno.ts`, una función pura que se prueba sin Vite.
- **DT4 · La carpeta sigue llamándose `Frontend`.** Renombrar solo mayúsculas en Windows es problemático para Git y no aporta nada.
- **Lint y pruebas:** oxlint con `correctness` como error, `no-explicit-any`, `no-non-null-assertion`, `eqeqeq`, las reglas de hooks y `no-danger`, todo con `--deny-warnings`. Es sintáctico: no necesita `tsgolint.exe`. Vitest se configura en `vitest.config.ts` para que el build de producción no cargue nada de pruebas.
- **CI:** un job `frontend` en paralelo al del backend (Node 24, caché por `Frontend/package-lock.json`, `npm ci`, tipos, lint, pruebas y build). Se verificó que el *lockfile*, generado en Windows, incluye los binarios nativos de Linux.

### 2.2 El contrato se valida en tiempo de ejecución (paso 6.1.1 · DC1)

- Los tipos de TypeScript desaparecen al compilar. Cada respuesta se valida con **Zod 4** y su tipo se **deriva** del esquema (`z.infer`): el validador y el tipo no pueden contradecirse.
- **Lector tolerante:** `z.object` descarta los campos no declarados. Un campo nuevo del backend no rompe nada; un campo declarado que falta o cambia de tipo es un error explícito.
- **Estados estrictos (*fail-closed*):** un estado fuera del diagrama hace fallar la respuesta completa, igual que `ESTADO_DESCONOCIDO` en el backend. Se prefirió que falle de forma visible a que se rompa en silencio.
- **Una proyección por rol (ADR-002):** `esquemaDetalleSolicitante` y `esquemaDetalleStaff` son distintos; la del solicitante no pasa como la del Staff. Los `logs` incluyen `motivo_reprogramacion` (ADR-005 §2.9).
- Las fechas se validan como texto ISO 8601 y siguen siendo texto: convertirlas a la hora de Bogotá es del paso 6.3.

### 2.3 Resultados tipados, no excepciones (paso 6.1.2 · DC2 y DC5)

```ts
type Resultado<T> = { ok: true; datos: T } | { ok: false; error: ErrorApi };
type ErrorApi =
  | { tipo: 'http'; status: number; mensajes: string[]; requiereRecarga: boolean }
  | { tipo: 'sesion-expirada' } | { tipo: 'red' } | { tipo: 'contrato' };
```

- Es el patrón de `evaluarTransicion()` del backend: con una excepción, el compilador no obliga a manejar el error; con esta unión, `datos` no se puede usar sin preguntar por `ok`. `textoDeError()` usa un `switch` exhaustivo: un tipo de error nuevo no compila hasta tener su texto.
- `mensajes` siempre es una lista (NestJS responde `message` como texto o, desde el pipe, como arreglo).
- **5xx:** siempre un mensaje genérico en español. El texto del servidor puede describir internos y nunca se reenvía.
- **Contrato roto:** la consola registra la ruta y los campos que fallaron, nunca los datos.
- **DC5 · Se clasifica por código HTTP y el mensaje se muestra tal cual.** Comparar textos para decidir comportamiento es frágil, así que hay **una sola** excepción: el 409 de cambio concurrente se reconoce por su mensaje exacto y marca `requiereRecarga`, porque no es un error del usuario. Si hiciera falta distinguir más casos, lo correcto es un campo `codigo` en los errores del backend (backlog), no más comparaciones de texto.

### 2.4 Dependencias inyectadas y una raíz de composición (pasos 6.1.2 y 6.1.3 · DC3)

- `crearClienteApi({ baseUrl, obtenerToken, alExpirarSesion, fetch })`: las pruebas usan un `fetch` falso, como el backend usa `RelojFijo`.
- **El token se consulta en cada petición** (la sesión puede cambiar). **Sin token, una ruta privada no envía nada** (*fail-closed*). Un 401 llama a `alExpirarSesion`: el cliente no conoce `localStorage`.
- **Ruta pública (login):** no envía token y su 401 (correo fuera de `@unicesmag.edu.co`) es un error normal con su mensaje.
- **Raíz de composición:** `crearApi()` es el único lugar donde el cliente se conecta con el entorno y el navegador. El `fetch` del navegador se envuelve (`(url, init) => fetch(url, init)`): llamarlo como método de otro objeto lanza `Illegal invocation` en Chrome y Safari.
- **La App es la dueña de la sesión.** Crea la api con `useMemo` y `useCallback`: si el cliente se recreara en cada render, el efecto del Dashboard (que depende de él) pediría las solicitudes en un ciclo sin fin. El Dashboard la recibe **por props**: hoy hay un consumidor y la dependencia queda visible en su firma. Con las vistas de 6.4 y 6.5 pasará a un `Context`.
- **DF2 · El token sigue en `localStorage` en el MVP,** pero solo `src/sesion/token.ts` lo conoce, y cada acceso va en `try/catch`: sin almacenamiento, la app se comporta como "sin sesión". La cookie `httpOnly` exige protección CSRF y cambiar la autenticación: queda como fase propia.

### 2.5 La copia de la máquina y la prueba de deriva (paso 6.1.1 · DC4)

- El frontend necesita T1–T9 solo para decidir qué botones mostrar (`accionesDisponibles(estado, rol)`); los estados finales se derivan de la tabla, como en el backend.
- **El riesgo de una copia es que se desalinee en silencio.** `contrato.test.ts` lee como texto, con `?raw` de Vite, tres archivos del backend y compara estados, acciones, las 9 transiciones fila por fila, roles y categorías (contra los `enum` de Prisma) y el mensaje del 409 concurrente. Es el método de `estados.spec.ts` del backend, que lee la migración.
  - Normaliza CRLF (Git en Windows) a LF.
  - Exige encontrar **exactamente 9** transiciones: un cambio de formato en el backend falla en lugar de pasar sin comparar nada.
- **La prueba vive en el frontend, el consumidor del contrato:** la alarma suena en el job que depende de la copia.

### 2.6 Cuerpos más estrechos que el backend (paso 6.1.2)

- Lo que el servidor rechazaría por su forma, en el frontend **no compila**:
  - los destinos del `PATCH` se derivan de la tabla (`APROBAR | RECHAZAR | INICIAR_PRODUCCION | FINALIZAR`): pedir `Pendiente de Reprogramación` por el tablero es imposible de escribir (E1);
  - `motivo_rechazo` solo existe junto con `Rechazado`, y ahí es obligatorio (E5);
  - proponer una reprogramación exige `motivo` (K7).
- Se verifica con `@ts-expect-error`: si una de esas líneas compilara, `tsc` la reportaría como "expect-error sin usar".
- Los radicados van con `encodeURIComponent` y los filtros con `URLSearchParams`: un radicado como `EC-1/../cancelar` no puede cambiar la ruta.

### 2.7 CORS con lista blanca (paso 6.2.1 · Decisión DS2)

- `CORS_ORIGENES` lista los orígenes permitidos, separados por comas. **Obligatoria (*fail-fast*)**, como `JWT_SECRET`: si falta o es inválida, la API no arranca y el mensaje dice cómo corregirla.
- `leerOrigenesCors()` es una función pura: rechaza `*`, URL inválidas, esquemas distintos de `http(s)` y cualquier origen que no sea **exacto**. La comparación es contra `URL.origin`, la forma canónica que usa el navegador, así que una ruta, una barra final, mayúsculas o el puerto por defecto dan error con la forma correcta sugerida.
- Opciones explícitas: `GET`, `POST`, `PATCH` y `DELETE`; encabezados `Authorization`, `Content-Type` y `Accept`; `credentials: false` (no hay cookies) y *preflight* reutilizable 10 minutos.
- `aplicarCors()` es la **única** forma de configurarlo: la usan `main.ts` y la app de los e2e, igual que `crearValidationPipe()`.
- **Lo que CORS protege, sin exagerarlo:** es una barrera del navegador, no del servidor. Una petición desde un origen ajeno **sí llega** a la API (la prueba C-3 lo demuestra con un 401 del JWT); el navegador solo impide leer la respuesta. Como el token viaja en un encabezado y no en una cookie, CSRF no aplica: CORS es defensa en profundidad, no el control de acceso.

### 2.8 `GET /auth/perfil` (paso 6.2.2 · Decisión DS1)

- Responde `{ id, nombre, rol }`: la **misma forma** que el `usuario` del login, validada en el frontend con un único esquema. Sin el correo (minimización), y sin `@Public()` ni `@Roles()`: cualquier usuario autenticado consulta **su propio** perfil, con la identidad tomada del token.
- **No se decodifica el JWT en el frontend:** el payload no trae el nombre, y leer un token sin verificar su firma es confiar en algo que cualquiera puede alterar. El perfil se lee de la base de datos en cada consulta: si el Staff degrada o elimina a alguien, el perfil lo refleja de inmediato (prueba e2e PE-4: un Staff degradado, con un token que todavía dice `STAFF`, se ve como `SOLICITANTE`).
- `SELECT_PERFIL` (lista blanca de columnas) y `perfilDe()` son la única traducción de una fila al perfil público. El login se refactorizó para usar la misma función: así el login y el perfil no pueden divergir.
- Si el usuario se elimina entre la validación del token y la consulta, responde 401 (*fail-closed*, mismo mensaje que `JwtStrategy`).

### 2.9 La sesión del frontend como máquina de estados (paso 6.2.3 · Decisión DS3)

```ts
type Sesion =
  | { estado: 'verificando' }                        // hay token; se confirma con GET /auth/perfil
  | { estado: 'anonima'; aviso: string | null }
  | { estado: 'autenticada'; usuario: UsuarioSesion }
  | { estado: 'sin-conexion' };                      // no se pudo verificar: el token se CONSERVA
```

- **Estados con nombre en lugar de banderas booleanas.** Cada estado lleva solo los datos que tienen sentido en él: no existe un `usuario` mientras se verifica.
- **Una máquina pura y un hook que la conecta** (el patrón del backend: `maquina-estados.ts` y el servicio). `reducirSesion()` en `maquina-sesion.ts` se prueba con una tabla de transiciones, sin React. `useSesion()` conecta la máquina con el token guardado, `GET /auth/perfil` y el 401 de cualquier ruta privada, y crea la api una sola vez.
- **Un evento que no corresponde al estado actual se ignora** y se devuelve el **mismo objeto** (React no vuelve a renderizar). Es la defensa contra las respuestas tardías: un perfil que llega después de cerrar la sesión no la reabre, y un 401 tardío sin sesión no muestra "tu sesión expiró". Es el mismo principio del *compare-and-set*: un cambio solo se aplica si el estado sigue siendo el que se validó.

| Al recargar | `GET /auth/perfil` | Estado |
|---|---|---|
| Sin token | No se llama | `anonima` |
| Con token | 200 | `autenticada`, sin volver a pedir login |
| Con token | 401 (vencido o usuario eliminado) | `anonima` con "Tu sesión expiró"; el token se borra |
| Con token | Red caída, 5xx o contrato roto | `sin-conexion`, con **Reintentar**. El token **no** se borra: una caída del servidor no debe cerrar la sesión |

- La App es un `switch` sobre el estado: ninguno queda sin pantalla. Mientras dura `verificando` se muestra *"Verificando tu sesión…"*, así que el login no parpadea antes de saltar al panel.
- **Fuera de alcance (DS4):** cerrar la sesión en todas las pestañas a la vez, cerrarla de forma proactiva al vencer el JWT, revocar tokens en el servidor y la cookie `httpOnly` (DF2). Están en la §5.

### 2.10 Fechas en la hora de Bogotá (paso 6.3 · Decisiones DH1 a DH5)

El Estudio C es un lugar físico en Pasto: "8:00" significa las 8:00 de Colombia, sin importar desde dónde se reserve o se consulte. El diagnóstico encontró F2 y F3; al revisar el código apareció un tercer error de zona horaria (F2c):

| # | Código anterior | Problema |
|---|---|---|
| F2a · al crear | `` new Date(`${fecha}T${hora}:00`).toISOString() `` | Interpretaba la hora en la zona del **navegador**: desde Madrid, "08:00" se guardaba como la 01:00 de Bogotá |
| F2b · al mostrar | `toLocaleDateString()` / `toLocaleTimeString()` | La misma reserva se veía con otra hora según desde dónde se mirara |
| F2c · mínimo del calendario | `new Date().toISOString().split('T')[0]` | Era el día en **UTC**: todos los días, desde las 7:00 p. m. de Colombia, el calendario ya no dejaba elegir hoy. Fallaba también en un equipo en Colombia |
| F3 · validación local | Bloqueaba solo de 12:00 a 14:00 | Contradecía CA-04: dejaba enviar 07:00 o 19:00 y no conocía los días hábiles ni los festivos |

- **DH1 · El ISO se construye con el desfase explícito, sin pasar por `Date`:** `aIsoBogota('2026-10-20', '08:00')` → `'2026-10-20T08:00:00-05:00'`, el formato que el backend ya acepta (`@FechaConZonaHoraria`). Valida que la fecha y la hora existan (rechaza `2026-02-30` y `24:00`).
  - El desfase `-05:00` es una constante: Colombia no tiene horario de verano desde 1993. Una **prueba canario** lo compara con lo que reporta `Intl` para `America/Bogota` en un instante de cada mes de 2026 y 2030; si eso cambiara, falla antes que producción (el criterio del canario del `23P01` en el backend).
- **DH2 · Se muestra con `Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota' })`, en 24 horas** (*"jueves, 15 de octubre de 2026 · 09:00 – 11:00"*): sin la ambigüedad de "a. m." en una reserva. Los formateadores se crean una vez; una fecha ilegible muestra *"Fecha no disponible"*, nunca *"Invalid Date"*.
- **DH3 · "Hoy" se calcula en Bogotá y recibe el "ahora" como parámetro** (`hoyEnBogota(ahora)`), como el `Reloj` del backend.
- **DH4 · El cliente valida solo "fin posterior al inicio";** los bloques, los días hábiles y los festivos los decide el servidor, y el formulario solo los informa. Copiar CA-04 completo en el cliente habría duplicado el calendario de festivos (algoritmo de Meeus, Ley 51): dos fuentes de verdad, justo el problema de F3.
  - El aviso local usa el **mismo texto** que la primera regla del backend (`MENSAJE_FIN_NO_POSTERIOR`), y la prueba de deriva lo compara con `horario.validator.ts`: la persona lee lo mismo venga el aviso del cliente o del servidor.
  - `horaFin <= horaInicio` compara texto: `<input type="time">` entrega siempre `HH:MM` en 24 horas con ceros a la izquierda (aunque el sistema operativo lo dibuje en 12 horas), y en ese formato el orden alfabético es el cronológico.
- **DH5 · Toda la suite corre en cuatro zonas horarias** (`npm run test:tz`): UTC, America/Bogota, Pacific/Pago_Pago (UTC−11) y Pacific/Kiritimati (UTC+14), también en el CI.
  - Es un lanzador en Node (`scripts/test-zonas-horarias.mjs`), no `TZ=UTC vitest`: npm en Windows ejecuta los scripts con `cmd.exe`.
  - Antes de cada zona verifica que el proceso hijo de verdad la tomó: si `TZ` no se aplicara, las cuatro ejecuciones correrían en la hora de Bogotá y el verde sería falso.
- **Por qué es indispensable: la prueba roja.** Las pruebas del panel se escribieron **antes** de la corrección. Con el código anterior, F2a (que compara el **instante** enviado) **pasaba en Bogotá** y fallaba en las otras tres zonas: en UTC enviaba `08:00Z`, en Pago_Pago `19:00Z` y en Kiritimati las `18:00Z` del día anterior, en lugar de `13:00Z`. En el equipo de quien desarrolla en Colombia, F2 era invisible. F2c fallaba en las cuatro (`min="2026-10-21"` a las 19:30 del 20). Con la corrección, las mismas pruebas pasaron en las cuatro zonas.

---

## 3. Verificación

| Decisión | Pruebas que la protegen |
|---|---|
| DT3 | `entorno.test.ts` (9 casos) |
| DC1 | `esquemas.test.ts` (25 casos: ejemplos del README, lector tolerante, 8 rechazos, proyecciones por rol) |
| DC2, DC3 y DC5 | `cliente.test.ts` (18 casos) · `errores.test.ts` · `token.test.ts` |
| DC4 | `contrato.test.ts` (6) · `maquina-estados.test.ts` (oráculo de las 14 combinaciones de estado y rol) |
| §2.6 | `solicitudes.test.ts` (rutas, codificación y 4 `@ts-expect-error`) · `auth.test.ts` |
| Integración en la UI | `App.test.tsx` (login, dominio rechazado y 401 que cierra la sesión, con un servidor falso por ruta) · `Dashboard.test.tsx` (api falsa inyectada) |
| DS2 (backend) | `configurar-cors.spec.ts` (14) · e2e C-1 a C-4 (*preflight* permitido y ajeno, petición ajena que llega pero no se lee, `Vary: Origin`) |
| DS1 (backend) | `auth.service.spec.ts` P-1 a P-3 · `auth.controller.spec.ts` · e2e PE-1 a PE-5 |
| DS3 | `maquina-sesion.test.ts` (8 transiciones y 6 eventos ignorados, con `toBe`) · `use-sesion.test.ts` (10) · `App.test.tsx` (restaurar al recargar y servidor caído) |
| DH1 a DH3 | `bogota.test.ts` (44: el canario del desfase en 24 instantes, 8 entradas inválidas, F2c a las 19:30, formato en 24 horas y el día de Bogotá aunque en UTC ya sea otro) |
| DH4 y F2 en la UI | `Dashboard.test.tsx` (F2a con el instante y el texto exactos, F2b, F2c con `vi.setSystemTime`, y tres de F3) · `contrato.test.ts` (el aviso local idéntico a CA-04) |
| DH5 | `npm run test:tz`: la suite completa en 4 zonas, en local y en el CI |

**Sabotajes (mutaciones manuales, todas detectadas y revertidas):**

| Paso | Sabotaje | Lo detectó |
|---|---|---|
| 6.0.3 | Un `any` en el código | `npm run lint` |
| 6.0.3 | `faltantes.length > 1` en `entorno.ts` | `entorno.test.ts` |
| 6.1.1 | T7 con rol `STAFF` en la copia | La prueba de deriva **y** el oráculo |
| 6.1.1 | El mensaje concurrente sin su punto final | La prueba de deriva |
| 6.1.2 | El radicado sin `encodeURIComponent` | Las 5 pruebas de URL |
| 6.1.2 | `status > 500` en lugar de `>= 500` | El 500 de NestJS llegaba crudo a la pantalla |
| 6.2.2 | `correo: true` en `SELECT_PERFIL` | P-1: el correo ni siquiera debe leerse |
| 6.2.2 | El perfil de un id fijo en lugar del id del token | La prueba del controlador |
| 6.2.3 | `perfil-confirmado` sin la guarda de estado | Los dos eventos ignorados de perfiles tardíos |
| 6.2.3 | Tratar el 401 del perfil como una falla de red | La prueba del token vencido |
| 6.3.1 | `hour12: true` en lugar de `hourCycle: 'h23'` | Las pruebas de `08:00` y `18:30` |
| 6.3.2 | El código anterior del panel, antes de corregirlo (prueba roja) | `test:tz`: F2a en verde solo en Bogotá y en rojo en las otras tres zonas; F2b, F2c y F3 en rojo en las cuatro |

**Verificación manual (6.1.3):** login, lista y creación; un token alterado devuelve al login con el aviso de sesión expirada; con el backend apagado aparece el mensaje de red y la UI no se rompe.

**Verificación manual (6.2):**
- sin `CORS_ORIGENES`, la API se niega a arrancar con el `FATAL ERROR`; con la variable, el flujo completo funciona sin errores de CORS en la consola;
- al recargar (F5) con sesión, se ve *"Verificando tu sesión…"* y luego el panel, sin pasar por el login;
- con el backend detenido, al recargar aparece la pantalla de reintento y el token sigue guardado; con el backend arriba, **Reintentar** entra al panel;
- un token alterado devuelve al login con el aviso; **Salir** deja el login sin aviso.

**Verificación manual (6.3):**
- una solicitud de 08:00 a 10:00 se crea y se muestra como *"… · 08:00 – 10:00"*;
- con la zona del navegador cambiada a Berlín (herramientas del navegador → *Sensors*), las franjas conservan sus horas y una solicitud nueva de 08:00 se guarda como 08:00 de Bogotá;
- una franja de 11:00 a 15:00 ya no se bloquea en el cliente: responde el servidor con su mensaje de CA-04.

**Resultado al cierre de 6.1:** `npm test` del frontend, 11 archivos · 105 ✅.

**Resultado al cierre de 6.2:** frontend `npm test` 13 archivos · 134 ✅ · backend `npm test` 705 ✅ y 1 omitida · `npm run test:e2e` 5 suites · 64 ✅ · CI con los jobs Backend y Frontend en verde, 0 advertencias de lint.

**Resultado al cierre de 6.3:** frontend `npm test` 14 archivos · 185 ✅ y `npm run test:tz` 185 ✅ en cada una de las 4 zonas · CI en verde con el paso nuevo de zonas horarias.

---

## 4. Consecuencias

- **Positivas:**
  - ninguna respuesta de la API llega a la UI sin validar, y ningún error queda sin un texto para la persona;
  - un 401 ya no deja un panel muerto, y la sesión sobrevive a una recarga y a una caída del servidor (F4 resuelto);
  - una reserva significa la misma hora real desde cualquier equipo, y se ve igual desde cualquier zona horaria (F2 resuelto); el cliente ya no contradice CA-04 (F3 resuelto);
  - la API solo responde a los orígenes del frontend en el navegador;
  - las desalineaciones con el backend fallan en el CI, no en producción;
  - los cuerpos ilegales no compilan.
- **Costo:**
  - una dependencia nueva (Zod);
  - una copia de la máquina que hay que mantener, vigilada por la prueba de deriva;
  - la prueba de deriva depende del formato de una línea por transición en el backend: si cambia, falla de forma ruidosa y se actualiza a propósito;
  - una variable de entorno obligatoria más (`CORS_ORIGENES`) en cada despliegue del backend;
  - restaurar la sesión cuesta una petición (`GET /auth/perfil`) al cargar la página;
  - las reglas de CA-04 distintas de "fin posterior al inicio" se ven al enviar, no al escribir;
  - la suite del frontend corre cinco veces en el CI (una normal y cuatro por zona).
- **Mantenimiento:** una ruta nueva sigue la lista de verificación del README del frontend (§5): esquema primero, una función por ruta, el cuerpo más estrecho posible y pruebas en el mismo commit.

## 5. Riesgos y deuda conocida

- **Desfase fijo:** si Colombia adoptara horario de verano, la prueba canario falla y `DESFASE_BOGOTA` tendría que calcularse por fecha con `Intl`.
- **Sesión (DS4, fuera del 6.2):** cerrar la sesión en todas las pestañas a la vez (evento `storage`); cerrarla de forma proactiva al vencer el JWT (hoy se cierra con el primer 401); revocar tokens en el servidor al salir (el JWT es *stateless*: uno robado sigue vigente hasta sus 8 h); la cookie `httpOnly` (DF2).
- **Backend:** el puerto 3000 sigue fijo en `main.ts`.
- **Backend:** `findMisSolicitudes()` y `findAll()` usan `include` y devuelven todas las columnas (punto 8 de su lista de verificación). El lector tolerante las descarta, pero viajan por la red.
- **Accesibilidad:** las etiquetas del formulario no están asociadas a sus campos (`htmlFor`); `jsx-a11y` entra con las vistas de 6.4.
- **CI:** `actions/checkout` y `setup-node` `@v4` corren sobre Node 20 (aviso de obsolescencia): subir a `@v5` junto con la fijación por SHA, en los dos jobs.
- **Identidad visual:** la fuente Roboto se declara en el tema pero no se carga.

## 6. Historial de implementación

| Commit | Paso |
|---|---|
| `2efe2b6` | 6.0.1 · Tailwind v4 con el plugin de Vite y limpieza de la plantilla |
| `c0b4697` | 6.0.2a · Renombre a `.tsx` sin cambiar el contenido |
| `4078b47` | 6.0.2b · TypeScript estricto y configuración por variables de entorno |
| `8acb756` · `12d98fd` | 6.0.3 · Lint estricto sin `any`, Vitest y Testing Library |
| `8048fe9` | 6.0.4 · Job del frontend en el CI |
| `2f92777` · `ad4822d` | 6.1b · Motivo de la reprogramación en el backend (ADR-005 §2.9) |
| `6c2e6b0` | 6.1.1 · Esquemas Zod, máquina de la vista y prueba de deriva |
| `ab3c3b8` | 6.1.2 · Cliente con resultados tipados y una función por ruta |
| `fda9515` | 6.1.3 · App y Dashboard usan el cliente; un 401 cierra la sesión |
| `7e088dc` | 6.1 · Este ADR y el README del frontend |
| `14b9e56` | Supresión justificada de `no-misused-spread` en `longitudReal` (el CI la exigía) |
| `150bf4a` | 6.2.1 · CORS con lista blanca y *fail-fast* |
| `96b048e` | 6.2.2 · `GET /auth/perfil` con el rol leído de la base de datos |
| `fa9a73b` | 6.2.3 · La sesión como máquina de estados |
| `3ef7543` | 6.2.4 · §2.7 a §2.9 y los README |
| `fb1471e` | 6.3.1 · `src/fechas/bogota.ts`, `test:tz` y su paso en el CI |
| `6cdf6bb` | 6.3.2 · El panel crea y muestra las franjas en la hora de Bogotá (F2) y solo valida fin posterior al inicio (F3) |
| — | 6.3.3 · Esta actualización (§2.10) y el README |
