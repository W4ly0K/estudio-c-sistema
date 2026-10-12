# ADR-006 — Bases del frontend y contrato tipado con la API

| Campo | Valor |
|---|---|
| **Estado** | ✅ Aceptado (pasos 6.0 y 6.1; la Fase 6 lo amplía en 6.2 a 6.5) |
| **Fecha** | 2026-10-11 |
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

**Sabotajes (mutaciones manuales, todas detectadas y revertidas):**

| Paso | Sabotaje | Lo detectó |
|---|---|---|
| 6.0.3 | Un `any` en el código | `npm run lint` |
| 6.0.3 | `faltantes.length > 1` en `entorno.ts` | `entorno.test.ts` |
| 6.1.1 | T7 con rol `STAFF` en la copia | La prueba de deriva **y** el oráculo |
| 6.1.1 | El mensaje concurrente sin su punto final | La prueba de deriva |
| 6.1.2 | El radicado sin `encodeURIComponent` | Las 5 pruebas de URL |
| 6.1.2 | `status > 500` en lugar de `>= 500` | El 500 de NestJS llegaba crudo a la pantalla |

**Verificación manual (6.1.3):** login, lista y creación; un token alterado devuelve al login con el aviso de sesión expirada; con el backend apagado aparece el mensaje de red y la UI no se rompe.

**Resultado:** `npm run typecheck` y `npm run lint` limpios · `npm test` 11 archivos · 105 ✅ · CI con los jobs Backend y Frontend en verde.

---

## 4. Consecuencias

- **Positivas:**
  - ninguna respuesta de la API llega a la UI sin validar, y ningún error queda sin un texto para la persona;
  - un 401 ya no deja un panel muerto;
  - las desalineaciones con el backend fallan en el CI, no en producción;
  - los cuerpos ilegales no compilan.
- **Costo:**
  - una dependencia nueva (Zod);
  - una copia de la máquina que hay que mantener, vigilada por la prueba de deriva;
  - la prueba de deriva depende del formato de una línea por transición en el backend: si cambia, falla de forma ruidosa y se actualiza a propósito.
- **Mantenimiento:** una ruta nueva sigue la lista de verificación del README del frontend (§5): esquema primero, una función por ruta, el cuerpo más estrecho posible y pruebas en el mismo commit.

## 5. Riesgos y deuda conocida

- **F2 y F3 (6.3):** `toISOString()` todavía usa la zona del navegador al crear, y la validación local del almuerzo contradice CA-04.
- **F4 (6.2):** la sesión no se restaura al recargar; el backend no tiene un endpoint de perfil. CORS sin restricción de origen.
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
| — | Este ADR y el README del frontend |
