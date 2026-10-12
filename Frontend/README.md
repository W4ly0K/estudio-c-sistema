# Frontend — Sistema de Gestión Estudio C

Interfaz web del sistema de gestión, reservas y seguimiento de solicitudes de espacios y equipos audiovisuales del **Estudio C** (Centro de Innovación Digital, Universidad CESMAG).

| Capa | Tecnología |
|---|---|
| Interfaz | React 19 + Vite 8 |
| Estilos | Tailwind CSS v4 (plugin `@tailwindcss/vite`; tema CESMAG en `src/index.css`) |
| Contrato con la API | Zod 4: cada respuesta se valida en tiempo de ejecución |
| Autenticación | Google OAuth institucional (`@react-oauth/google`) → JWT del backend |
| Pruebas | Vitest 5 + Testing Library (jsdom) |
| Lint | oxlint (`--deny-warnings`) |
| Lenguaje | TypeScript en modo `strict`. **El tipo `any` está prohibido** (también las aserciones `as` en el código de la aplicación) |

El *por qué* de este diseño está en [ADR-006](../docs/adr/ADR-006-frontend-contrato-tipado.md). El contrato de la API, en el [README del backend](../backend/README.md) (§8 a §12).

---

## 1. Configuración local

Requisitos: Node.js **24** (la misma versión del CI) y el backend corriendo (por defecto en `http://localhost:3000`), con `CORS_ORIGENES` que incluya el origen del frontend (`http://localhost:5173`; ver el README del backend §2). Sin eso, el navegador bloquea las respuestas por CORS.

```bash
cd Frontend
npm install
cp .env.example .env.local   # y completa los valores
npm run dev                  # http://localhost:5173
```

| Variable | Uso |
|---|---|
| `VITE_API_URL` | URL base de la API, sin barra final |
| `VITE_GOOGLE_CLIENT_ID` | Client ID de Google OAuth (Google Cloud Console → Credenciales) |

- Las variables `VITE_*` quedan **dentro del bundle** del navegador: nunca pongas secretos en ellas.
- `.env.local` está ignorado por Git (`*.local`).
- Si falta una variable o `VITE_API_URL` no es una URL `http(s)`, la app se detiene al cargar con un mensaje que dice cuál falta (*fail-fast*, `src/config/entorno.ts`). Mira la consola del navegador.

## 2. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm run typecheck` | `tsc -b`: tipos de la app y de la configuración (incluye las pruebas) |
| `npm run lint` | oxlint sobre `src/`; cualquier advertencia falla |
| `npm test` | Vitest una vez (185 pruebas) |
| `npm run test:tz` | La suite completa en 4 zonas horarias (UTC, Bogotá, UTC−11 y UTC+14). **Obligatorio si tocas fechas u horas** |
| `npm run test:watch` | Vitest en modo observación |
| `npm run build` | `tsc -b && vite build`: un error de tipos impide el build |

- El lint del frontend **no** usa `--type-aware` (`no-explicit-any` es una regla sintáctica), así que no necesita `tsgolint.exe`.
- El CI (`.github/workflows/ci.yml`, job **Frontend**) ejecuta `npm ci`, tipos, lint, pruebas, `test:tz` y build en Node 24, en paralelo al job del backend.

## 3. Estructura

```
src/
├── api/                  Contrato tipado con el backend (ADR-006)
│   ├── esquemas.ts       Esquemas Zod y tipos derivados (z.infer): login, solicitudes, detalle por rol, errores
│   ├── maquina-estados.ts Copia de T1–T9 SOLO para la vista; accionesDisponibles(estado, rol)
│   ├── mensajes.ts       Mensajes del backend que la UI reconoce o repite (409 concurrente, primera regla de CA-04)
│   ├── cliente.ts        crearClienteApi: Resultado<T>, ErrorApi, validación de cada respuesta
│   ├── solicitudes.ts    Una función tipada por ruta de /solicitudes
│   ├── auth.ts           POST /auth/google/login (ruta pública)
│   ├── errores.ts        textoDeError(): el texto que ve la persona para cada ErrorApi
│   ├── crear-api.ts      Raíz de composición: conecta el cliente con el entorno y el navegador
│   └── contrato.test.ts  Prueba de deriva contra el código del backend
├── config/entorno.ts     Variables de entorno validadas (fail-fast)
├── fechas/bogota.ts      Fechas SIEMPRE en la hora de Bogotá: aIsoBogota, hoyEnBogota y formatear*
├── sesion/
│   ├── token.ts          Único módulo que conoce localStorage (con try/catch)
│   ├── maquina-sesion.ts Máquina pura de la sesión: estados, eventos y reducirSesion()
│   └── use-sesion.ts     Hook dueño de la sesión: conecta la máquina con el token, el perfil y el 401
├── test/                 setup.ts (jest-dom) y fixtures-api.ts (cargas del contrato y fetch falso)
├── App.tsx               Una pantalla por estado de la sesión; inyecta la api en el panel
└── Dashboard.tsx         Panel del solicitante (recibe la api por props)
```

## 4. Cómo se habla con la API

**Principio:** el frontend refleja; el backend decide. La UI usa la copia de la máquina solo para mostrar los botones que tienen sentido. La legalidad la decide el servidor, y sus mensajes (en español y sin datos de terceros) se muestran tal cual.

```tsx
const resultado = await api.cancelar(radicado)
if (!resultado.ok) {
  if (resultado.error.tipo === 'http' && resultado.error.requiereRecarga) {
    // 409 concurrente: recargar la solicitud, no culpar al usuario.
  }
  setError(textoDeError(resultado.error))
  return
}
mostrar(resultado.datos.solicitud) // tipado y validado
```

| `ErrorApi` | Cuándo | Qué hace la UI |
|---|---|---|
| `http` | El servidor respondió 4xx o 5xx | Muestra `mensajes` (siempre una lista). En 5xx llega un mensaje genérico: el texto del servidor nunca se reenvía |
| `http` + `requiereRecarga` | 409 de cambio concurrente (README del backend §10, fila 8) | Recarga la solicitud y permite repetir la acción |
| `sesion-expirada` | 401 en una ruta privada, o no hay token | Ya se ejecutó `alExpirarSesion`: la App borró el token y volvió al login |
| `red` | El servidor no respondió | *"No pudimos conectar con el servidor…"* |
| `contrato` | Respondió 2xx con algo que no cumple el esquema | Mensaje genérico; en la consola, la ruta y los campos que fallaron (nunca los datos) |

## 5. La sesión

La sesión es una máquina de estados (`src/sesion/maquina-sesion.ts`, ADR-006 §2.9). La App renderiza una pantalla por estado:

| Estado | Cuándo | Pantalla |
|---|---|---|
| `verificando` | Al cargar con un token guardado, o al reintentar | *"Verificando tu sesión…"* (sin mostrar el login) |
| `autenticada` | `GET /auth/perfil` respondió 200, o el login fue correcto | El panel |
| `anonima` | Sin token, al salir, o tras un 401 (con el aviso *"Tu sesión expiró"*) | El login |
| `sin-conexion` | El perfil no se pudo verificar (red, 5xx o contrato) | Reintentar o cerrar sesión. **El token se conserva** |

- Un evento que no corresponde al estado actual se ignora: una respuesta tardía nunca reabre una sesión cerrada.
- Ningún componente toca la sesión directamente: todo pasa por `useSesion()` (`iniciarSesion`, `cerrarSesion`, `reintentar`) y por `alExpirarSesion` del cliente.

## 6. Fechas y horas

El Estudio C está en Pasto: toda fecha se crea y se muestra en la hora de Bogotá, desde cualquier equipo (ADR-006 §2.10).

| Para | Usa | Nunca |
|---|---|---|
| Enviar una franja | `aIsoBogota(fecha, hora)` → `'2026-10-20T08:00:00-05:00'` | `` new Date(`${fecha}T${hora}`).toISOString() `` (usa la zona del navegador) |
| Mostrar una fecha u hora | `formatearFecha`, `formatearHora`, `formatearFranja` (24 horas) | `toLocaleDateString()` / `toLocaleTimeString()` sin `timeZone`, `getHours()`, `getDate()` |
| Saber qué día es hoy | `hoyEnBogota(new Date())` | `new Date().toISOString().split('T')[0]` (es el día en UTC) |

- El cliente solo valida "fin posterior al inicio", con el texto exacto del backend. Las demás reglas de CA-04 (bloques, días hábiles, festivos) las decide el servidor y su mensaje se muestra tal cual.
- **Si tocas fechas u horas, ejecuta `npm run test:tz`.** En un equipo en Bogotá, un error de zona horaria no se ve: la prueba F2a pasaba en Bogotá con el código equivocado.

## 7. ✅ Lista de verificación para consumir una ruta nueva

1. **Esquema primero** en `esquemas.ts`, y el tipo con `z.infer`. Nunca un `interface` escrito a mano para una respuesta.
2. Declara solo los campos que la UI usa (lector tolerante). Los estados, siempre con `esquemaEstado`.
3. Una función en `solicitudes.ts` (o su módulo) que llame a `cliente.solicitar`. El radicado va por `rutaDe()` (`encodeURIComponent`).
4. **El cuerpo, más estrecho que el backend:** si el servidor lo rechazaría por su forma, que no compile. Pruébalo con `@ts-expect-error` en `solicitudes.test.ts`.
5. Nunca `fetch` directo ni `res.json() as T` en un componente. Nunca `localStorage` fuera de `sesion/token.ts`.
6. Maneja los cuatro tipos de `ErrorApi` con `textoDeError()`; si la acción puede chocar con otra, contempla `requiereRecarga`.
7. Si el backend agrega o cambia un estado, una transición, un rol, una categoría o un mensaje que la UI repite, `contrato.test.ts` falla: actualiza la copia **a propósito**, nunca la prueba.
8. Fechas: con `src/fechas/bogota.ts`, nunca con la zona del navegador (§6).
9. Botones de acción: deshabilitados mientras la petición está en curso (evita el doble clic y el 409 de estado final).
10. Nada de `dangerouslySetInnerHTML` (`react/no-danger` es error): React escapa los mensajes del servidor.
11. Pruebas en el mismo commit: la función con el fetch falso (`crearEntornoDePrueba`) y el componente con una api falsa inyectada.

## 8. Pruebas

- `src/api/*.test.ts`: esquemas, máquina (oráculo de las 14 combinaciones de estado y rol), cliente (18 casos de transporte y error), una prueba por ruta y la **prueba de deriva**.
- **Prueba de deriva (`contrato.test.ts`):** lee como texto (`?raw` de Vite) `backend/src/solicitudes/reglas/maquina-estados.ts`, `backend/prisma/schema.prisma` y `backend/src/solicitudes/solicitudes.service.ts`, y compara estados, acciones, transiciones, roles, categorías, el mensaje concurrente y el aviso de "fin posterior al inicio" (`horario.validator.ts`). Exige encontrar exactamente 9 transiciones: un cambio de formato en el backend falla en lugar de pasar sin comparar nada. `vitest.config.ts` permite leer `..` solo en las pruebas.
- Las variables de entorno de las pruebas son ficticias y viven en `vitest.config.ts`: las pruebas no dependen del `.env.local` de nadie.
- `src/sesion/*.test.ts`: la máquina con una tabla de transiciones (incluidos los eventos ignorados, verificados con `toBe`) y el hook con `renderHook` y un `fetch` falso por ruta.
- `src/fechas/bogota.test.ts`: el canario del desfase de Bogotá, entradas inválidas, el día de "hoy" a las 19:30 y el formato. `Dashboard.test.tsx` fija el reloj con `vi.setSystemTime` para el mínimo del calendario.
- **`npm run test:tz`** repite toda la suite en 4 zonas y verifica antes que cada proceso de verdad tomó su zona (sin eso, el verde podría ser falso).

## 9. Pendiente en la Fase 6

- **6.4 y 6.5:** vistas del solicitante (B1 a B4) y del Staff (tablero y acciones).
