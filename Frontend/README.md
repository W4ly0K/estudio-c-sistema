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

Requisitos: Node.js **24** (la misma versión del CI) y el backend corriendo (por defecto en `http://localhost:3000`).

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
| `npm test` | Vitest una vez (105 pruebas) |
| `npm run test:watch` | Vitest en modo observación |
| `npm run build` | `tsc -b && vite build`: un error de tipos impide el build |

- El lint del frontend **no** usa `--type-aware` (`no-explicit-any` es una regla sintáctica), así que no necesita `tsgolint.exe`.
- El CI (`.github/workflows/ci.yml`, job **Frontend**) ejecuta `npm ci`, tipos, lint, pruebas y build en Node 24, en paralelo al job del backend.

## 3. Estructura

```
src/
├── api/                  Contrato tipado con el backend (ADR-006)
│   ├── esquemas.ts       Esquemas Zod y tipos derivados (z.infer): login, solicitudes, detalle por rol, errores
│   ├── maquina-estados.ts Copia de T1–T9 SOLO para la vista; accionesDisponibles(estado, rol)
│   ├── mensajes.ts       Mensajes del backend que cambian el comportamiento de la UI (409 concurrente)
│   ├── cliente.ts        crearClienteApi: Resultado<T>, ErrorApi, validación de cada respuesta
│   ├── solicitudes.ts    Una función tipada por ruta de /solicitudes
│   ├── auth.ts           POST /auth/google/login (ruta pública)
│   ├── errores.ts        textoDeError(): el texto que ve la persona para cada ErrorApi
│   ├── crear-api.ts      Raíz de composición: conecta el cliente con el entorno y el navegador
│   └── contrato.test.ts  Prueba de deriva contra el código del backend
├── config/entorno.ts     Variables de entorno validadas (fail-fast)
├── sesion/token.ts       Único módulo que conoce localStorage (con try/catch)
├── test/                 setup.ts (jest-dom) y fixtures-api.ts (cargas del contrato y fetch falso)
├── App.tsx               Dueña de la sesión; crea la api y la inyecta
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

## 5. ✅ Lista de verificación para consumir una ruta nueva

1. **Esquema primero** en `esquemas.ts`, y el tipo con `z.infer`. Nunca un `interface` escrito a mano para una respuesta.
2. Declara solo los campos que la UI usa (lector tolerante). Los estados, siempre con `esquemaEstado`.
3. Una función en `solicitudes.ts` (o su módulo) que llame a `cliente.solicitar`. El radicado va por `rutaDe()` (`encodeURIComponent`).
4. **El cuerpo, más estrecho que el backend:** si el servidor lo rechazaría por su forma, que no compile. Pruébalo con `@ts-expect-error` en `solicitudes.test.ts`.
5. Nunca `fetch` directo ni `res.json() as T` en un componente. Nunca `localStorage` fuera de `sesion/token.ts`.
6. Maneja los cuatro tipos de `ErrorApi` con `textoDeError()`; si la acción puede chocar con otra, contempla `requiereRecarga`.
7. Si el backend agrega o cambia un estado, una transición, un rol, una categoría o el mensaje concurrente, `contrato.test.ts` falla: actualiza la copia **a propósito**, nunca la prueba.
8. Botones de acción: deshabilitados mientras la petición está en curso (evita el doble clic y el 409 de estado final).
9. Nada de `dangerouslySetInnerHTML` (`react/no-danger` es error): React escapa los mensajes del servidor.
10. Pruebas en el mismo commit: la función con el fetch falso (`crearEntornoDePrueba`) y el componente con una api falsa inyectada.

## 6. Pruebas

- `src/api/*.test.ts`: esquemas, máquina (oráculo de las 14 combinaciones de estado y rol), cliente (18 casos de transporte y error), una prueba por ruta y la **prueba de deriva**.
- **Prueba de deriva (`contrato.test.ts`):** lee como texto (`?raw` de Vite) `backend/src/solicitudes/reglas/maquina-estados.ts`, `backend/prisma/schema.prisma` y `backend/src/solicitudes/solicitudes.service.ts`, y compara estados, acciones, transiciones, roles, categorías y el mensaje concurrente. Exige encontrar exactamente 9 transiciones: un cambio de formato en el backend falla en lugar de pasar sin comparar nada. `vitest.config.ts` permite leer `..` solo en las pruebas.
- Las variables de entorno de las pruebas son ficticias y viven en `vitest.config.ts`: las pruebas no dependen del `.env.local` de nadie.

## 7. Pendiente en la Fase 6

- **6.2:** restaurar la sesión al recargar y CORS limitado al origen del frontend.
- **6.3:** fechas en `America/Bogota` (hoy `toISOString()` usa la zona del navegador) y retiro de la validación local que contradice CA-04.
- **6.4 y 6.5:** vistas del solicitante (B1 a B4) y del Staff (tablero y acciones).
