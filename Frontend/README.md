# Frontend — Sistema de Gestión Estudio C

Interfaz web del sistema de gestión, reservas y seguimiento de solicitudes de espacios y equipos audiovisuales del **Estudio C** (Centro de Innovación Digital, Universidad CESMAG).

| Capa | Tecnología |
|---|---|
| Interfaz | React 19 + Vite 8 · rutas con react-router 7 |
| Estilos | Tailwind CSS v4 (plugin `@tailwindcss/vite`; tema CESMAG en `src/index.css`) |
| Contrato con la API | Zod 4: cada respuesta se valida en tiempo de ejecución |
| Autenticación | Google OAuth institucional (`@react-oauth/google`) → JWT del backend |
| Pruebas | Vitest 5 + Testing Library (jsdom) |
| Lint | oxlint (`--deny-warnings`) |
| Lenguaje | TypeScript en modo `strict`. **El tipo `any` está prohibido** (también las aserciones `as` en el código de la aplicación) |

El *por qué* de este diseño está en [ADR-006](../docs/adr/ADR-006-frontend-contrato-tipado.md); los sub-espacios, «No atendida» y «Validar con ajustes» (Fase 7), en [ADR-007](../docs/adr/ADR-007-subespacios-y-no-atendida.md); las reglas por categoría de la Fase 8 (edición, enlace del producto final y alias de estado por rol), en [ADR-008](../docs/adr/ADR-008-edicion-postproduccion-y-enlace-de-entrega.md). La Fase 9 (R9-1: anexo del solicitante, revisión del anexo al aprobar, historial y corrección de enlaces), en [ADR-009](../docs/adr/ADR-009-anexo-del-solicitante-y-fuente-unica-del-enlace.md), la E7 de [ADR-005](../docs/adr/ADR-005-maquina-de-estados-ca10.md) y [ADR-012](../docs/adr/ADR-012-eventos-de-auditoria-sin-transicion.md). El contrato de la API, en el [README del backend](../backend/README.md) (§8 a §14).

**Estado de la Fase 9 (2026-11-16):** implementada en la rama `feat/fase-9-anexo-solicitante` (frontend hasta `479c60c`), sin despliegue institucional confirmado. Necesita el backend de la misma rama, que a su vez necesita el esquema de la migración H1; H1 no tiene evidencia de aplicación autorizada y verificada en la base principal (paso 9.1.5 pendiente, README del backend §2.1). Pendientes en la §10.

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
| `npm test` | Vitest una vez (ver «Evidencia de pruebas», abajo) |
| `npm run test:tz` | La suite completa en 4 zonas horarias (UTC, Bogotá, UTC−11 y UTC+14). **Obligatorio si tocas fechas u horas** |
| `npm run test:watch` | Vitest en modo observación |
| `npm run build` | `tsc -b && vite build`: un error de tipos impide el build |

- El lint del frontend **no** usa `--type-aware` (`no-explicit-any` es una regla sintáctica), así que no necesita `tsgolint.exe`.
- El CI (`.github/workflows/ci.yml`, job **Frontend**) ejecuta `npm ci`, tipos, lint, pruebas, `test:tz` y build en Node 24, en paralelo al job del backend.
- **Evidencia de pruebas (C1, reportada):** el responsable del proyecto la ejecutó en el entorno local de desarrollo el 2026-11-12, al `479c60c`, y la reportó para revisión: 849 pruebas del frontend, `npm run test:tz` en las 4 zonas, `tsc` (`npm run typecheck`), lint y `vite build` correctos. No es una ejecución nueva; el frontend no ha cambiado desde `479c60c`. Son solo pruebas del frontend, con una api falsa, sin backend ni PostgreSQL: las del backend y las de integración con PostgreSQL están en el README del backend (§4 y §4.1). Texto anterior (`6bdd4a0`, 2026-10-29), conservado: «Vitest una vez (270 pruebas)».

## 3. Estructura

```
src/
├── api/                  Contrato tipado con el backend (ADR-006)
│   ├── esquemas.ts       Esquemas Zod y tipos derivados (z.infer): login, solicitudes, detalle por rol (con enlace_anexo desde la Fase 9), errores, SUB_ESPACIOS; respuestas de los comandos de enlace con sin_cambios obligatorio e historial de enlaces con strictObject (K3 y K4)
│   ├── maquina-estados.ts Copia de T1–T12 SOLO para la vista; accionesDisponibles(estado, rol)
│   ├── categorias.ts     PASA_POR_EDICION, REQUIERE_ENLACE y transicionAplicaALaCategoria(): copia de vista de la política del backend (Fase 8); ADMITE_ANEXO, CategoriaConAnexo y admiteAnexo() (Fase 9 · K1 y K2)
│   ├── mensajes.ts       Mensajes del backend que la UI reconoce o repite (409 concurrente, primera regla de CA-04)
│   ├── cliente.ts        crearClienteApi: Resultado<T>, ErrorApi, validación de cada respuesta
│   ├── solicitudes.ts    Una función tipada por ruta de /solicitudes; CambiosTablero no compila un ajuste fuera de T1; Fase 9: editarAnexo (K3), historialEnlaces y corregirEnlaceEntrega (K4), con CuerpoEditarAnexo, CuerpoCorregirEnlaceEntrega y RevisionDelAnexo (K1)
│   ├── auth.ts           POST /auth/google/login (ruta pública)
│   ├── errores.ts        textoDeError(): el texto que ve la persona para cada ErrorApi
│   ├── crear-api.ts      Raíz de composición: conecta el cliente con el entorno y el navegador
│   ├── contexto-api.ts   ContextoApi y useApi(): la api para las vistas (lanza fuera del proveedor)
│   ├── ProveedorApi.tsx  <ProveedorApi api={…}>: la App inyecta la api real; las pruebas, una falsa
│   └── contrato.test.ts  Prueba de deriva contra el código del backend
├── componentes/          Piezas de las vistas (solo componentes y literales: Fast Refresh)
│   ├── Encabezado, Insignias, LineaDeVida     Comunes a los dos roles; el encabezado navega por rol (NavLink y aria-current)
│   ├── SoloRol            Guarda de presentación: con otro rol vuelve a "/" en silencio y sin montar la pantalla
│   ├── DialogoConfirmacion  <dialog> nativo; abre y cierra con useLayoutEffect; puedeConfirmar opcional
│   ├── TarjetaSolicitud, ExitoRadicado, AccionesSolicitud   Solicitante (B1, B1b, B3 y B4)
│   ├── TarjetaTablero, AccionesStaff          Staff: tarjeta del tablero y resolución T1 (directo o con ajustes), T2, T4, T5, T9, T10, T11 y T12; en T1 de PODCAST, VIDEO y STREAMING muestra y confirma el anexo revisado (Fase 9 · K1)
│   ├── CampoEnlace        Campo de enlace controlado (type="url", aria-invalid) con etiqueta y ayuda propias: producto final al entregar (Fase 8) y anexo al radicar (Fase 9)
│   ├── EnlaceProductoFinal  Abre el producto final con noopener noreferrer; sin <a> si el enlace no es seguro (Fase 8); desde la Fase 9, envoltura de EnlaceExternoSeguro
│   ├── EnlaceExternoSeguro  Único lugar que abre un enlace guardado: sin <a> si esEnlaceSeguro lo rechaza; pestaña nueva con noopener noreferrer (Fase 9 · `749566d`)
│   ├── EnlaceAnexo        Envoltura de EnlaceExternoSeguro para el anexo, en los dos detalles (Fase 9 · `749566d`)
│   ├── EdicionAnexo       Solicitante: agregar, cambiar o retirar el anexo en «Recibido» (Fase 9 · K3)
│   ├── HistorialEnlaces   Staff: historial de enlaces, aparte de la línea de vida; valores como texto (Fase 9 · K4)
│   ├── CorreccionEnlaceEntrega  Staff: corrección del enlace del producto final, con su advertencia sobre datos personales (Fase 9 · K4)
│   ├── CampoMotivo        Motivo con contador de caracteres reales (T2 y T5), sin maxLength
│   ├── CampoSubEspacio    Grupo de 3 opciones con su ayuda (B2, T5 y el ajuste de T1), controlado
│   └── CamposFranja       Fecha y horas en hora de Bogotá (B2, T5 y el ajuste de T1), controlado
├── config/entorno.ts     Variables de entorno validadas (fail-fast)
├── fechas/bogota.ts      Fechas SIEMPRE en la hora de Bogotá: aIsoBogota y su inverso aCamposBogota, hoyEnBogota y formatear*
├── presentacion/         Funciones PURAS de la vista (se prueban sin React)
│   ├── etiquetas, resumen               Nombres de categoría y de sub-espacio (oficial, corto y ayuda), alias de estado por rol (etiquetaEstado) y resumen del panel B1
│   ├── enlace           esEnlaceSeguro(), razonBloqueoDelEnlace() y enlaceParaEnviar(): enlaces del producto final (Fase 8), del anexo y de la corrección (Fase 9); rechaza caracteres de control desde H0 (`a111c73`) y mide la longitud en unidades UTF-16 (§10)
│   ├── anexo            Anexo del solicitante: anexoSegunCategoria() al radicar (K2); edicionDelAnexoDisponible(), cuerpoDeEdicion() y cuerpoDeRetiro() (K3); TEXTO_AYUDA_ANEXO
│   ├── enlaces-staff    historialAplica(), autorDelEvento(), correccionDisponible(), cuerpoDeCorreccion() y la advertencia sobre datos personales (K4)
│   ├── linea-de-vida    lineaDeVida(detalle, perspectiva): actores y motivos según quién mira
│   ├── acciones-solicitante, acciones-staff   Acciones derivadas de la máquina, con sus textos honestos y su canal; opciones del Staff y ajuste mínimo al validar
│   ├── tablero          agruparTablero(): columnas derivadas de la máquina, orden por urgencia e instante
│   ├── inicio           Resúmenes y atajos del inicio por rol, y las reglas del Estudio C (Fase 7)
│   ├── navegacion       navegacionDelRol(): los enlaces del encabezado de cada rol (Fase 7)
│   ├── detalle-staff    filasDeRecursos(): inventario TOTAL; alerta solo si se supera
│   ├── motivo           Límites y longitud real de los motivos (rechazo, reprogramación y, desde K4, corrección del enlace), igual que el backend; textos de ayuda
│   └── franja           franjaDesdeCampos(): las dos reglas locales de una franja (DH1 y DH4); camposDeLaFranja() y mismaFranja()
├── sesion/
│   ├── token.ts          Único módulo que conoce localStorage (con try/catch)
│   ├── maquina-sesion.ts Máquina pura de la sesión: estados, eventos y reducirSesion()
│   └── use-sesion.ts     Hook dueño de la sesión: conecta la máquina con el token, el perfil y el 401
├── test/                 setup.ts (jest-dom y el polyfill de <dialog>) y fixtures-api.ts (cargas, fetch y api falsos)
├── rutas.ts              Las rutas, en un solo lugar: una constante por pantalla (RUTA_INICIO, RUTA_TABLERO, RUTA_MIS_SOLICITUDES), RUTA_DETALLE y rutaDetalle(radicado)
├── App.tsx               Una pantalla por estado de la sesión; con sesión, las rutas por ROL (PantallaInicio, SoloRol y PantallaDetalle)
├── InicioStaff.tsx       Inicio del Staff: cuatro atajos hacia el tablero (urgentes, vencidas, esperando, en producción)
├── InicioSolicitante.tsx Inicio del solicitante: pendientes de su respuesta, próximas reservas y reglas
├── Dashboard.tsx         Panel del solicitante (B1, B1b y el formulario B2)
├── DetalleSolicitud.tsx  Detalle del solicitante (B3), propuesta (B4) y acciones; "cargando" se deriva
├── TableroStaff.tsx      Tablero del Staff: un solo GET, columnas por estado, cerradas plegadas y "Actualizar"
└── DetalleStaff.tsx      Detalle del Staff (C3): proyección completa, recursos, resolución y recarga honesta
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

### 4.1 Comandos con valor anterior (Fase 9 · K1, K3 y K4)

Tres acciones envían, además del valor nuevo, el valor que la persona vio, y el servidor lo compara exactamente con el vigente: la aprobación T1 de PODCAST, VIDEO o STREAMING (`anexo_revisado`, K1), la edición del anexo (`enlace_anexo_anterior`, K3) y la corrección del enlace del producto final (`enlace_entrega_anterior`, K4).

| Regla | Qué hace la UI | Dónde |
|---|---|---|
| Fotografía del valor anterior | Se toma al abrir el diálogo y viaja **exacta**: sin recortar ni transformar, y `null` cuando no había anexo (`anexo_revisado` y `enlace_anexo_anterior`). Si el detalle cambia con el diálogo abierto, se envía lo que se vio | `anexoObservado` en `AccionesStaff`; `anteriorObservado` en `EdicionAnexo` y `CorreccionEnlaceEntrega`; `revisionDelAnexo()`, `cuerpoDeEdicion()`, `cuerpoDeRetiro()` y `cuerpoDeCorreccion()` |
| Valor nuevo | Se recorta (`enlaceParaEnviar`) y pasa por `esEnlaceSeguro`. Vacío, inseguro o idéntico a la fotografía se bloquea con una razón visible y no se envía. Retirar el anexo envía `null` explícito, con su propio botón y su confirmación | `presentacion/anexo` y `presentacion/enlaces-staff` |
| HTTP 409 | **Cualquier** 409 invalida la fotografía, sin comparar el texto del servidor (DC5): la confirmación queda bloqueada con una razón visible, aparece «Recargar la solicitud» y cerrar el diálogo recarga una sola vez. **Nunca se reintenta automáticamente** | `AccionesStaff` (T1), `EdicionAnexo` y `CorreccionEnlaceEntrega` |
| `sin_cambios` | Obligatorio en el esquema (*fail-closed*): una respuesta sin él es un error de `contrato`. Con `true` o `false`, la UI muestra la `solicitud` y el `mensaje` del servidor y no inventa eventos. Si falla la recarga posterior a una corrección, el aviso distingue si el servidor escribió (`TEXTO_RECARGA_FALLIDA_SIN_CAMBIOS`) | `esquemaRespuestaEdicionAnexo` y `esquemaRespuestaCorreccionEntrega`; `DetalleStaff` |

- **Distinto de `requiereRecarga`** (tabla anterior): ese indicador solo se marca con el 409 del *compare-and-set* (`MENSAJE_CAMBIO_CONCURRENTE`) y sigue rigiendo las demás acciones. En estos tres comandos el 409 puede venir también del estado, del anexo o del enlace; en todos los casos, lo que se ve ya no es lo vigente.
- **Contratos tipados:** `CuerpoEditarAnexo` exige las dos claves (las dos admiten `null`); `CuerpoCorregirEnlaceEntrega` exige el anterior y el nuevo como texto, con `motivo_correccion` opcional; `RevisionDelAnexo` solo existe en T1; `CuerpoCrearSolicitud` no compila con `enlace_anexo` en ESPACIOS ni en ASESORIAS (K2). El historial (`esquemaHistorialEnlaces`) usa `strictObject`: un campo de más es un error de `contrato`.
- **La interfaz ofrece; el servidor decide.** Ninguna de estas reglas sustituye la autorización del backend, que vuelve a decidir rol, propiedad (404 uniforme), categoría, estado y concurrencia (README del backend §10 y §14).

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
11. Pruebas en el mismo commit: la función con el fetch falso (`crearEntornoDePrueba`) y el componente con una api falsa inyectada (`apiFalsa()` dentro de `<ProveedorApi>`).
12. **Accesibilidad:** busca en las pruebas por rol, etiqueta y nombre accesible (`getByRole`, `getByLabelText`), nunca por clases. Diálogos con `<dialog>` y `showModal()`; tras cambiar de pantalla, el foco al título. Si `jsx-a11y` marca algo, se corrige; no se silencia.
13. **Si el backend rechaza algo, el texto dice qué pasará de verdad** (ADR-006 §2.11): ni promesas que la máquina no cumple ni datos que no se guardan.
14. **Efectos que tocan el DOM de forma síncrona** (`focus()`, `showModal()`, `close()`) van en `useLayoutEffect`: así ocurren en el mismo *commit* que pinta el cambio. Con `useEffect` queda un fotograma intermedio, y las pruebas con `findBy…` lo ven como un fallo intermitente (ADR-006 §2.12).
15. **Un archivo de componentes exporta solo componentes y literales** (`react/only-export-components`, Fast Refresh). Un texto que se calcula (por ejemplo, con una función) vive en `presentacion/`.
16. **Un límite de texto se mide como lo mide el backend** (`longitudReal()` en `presentacion/motivo.ts`), nunca con `maxLength`, y sus constantes quedan vigiladas por `contrato.test.ts`. **Excepción vigente (2026-11-16): los enlaces.** `esEnlaceSeguro` mide `ENLACE_MAXIMO` en unidades UTF-16 (`texto.length`), mientras que `EnlaceSeguro` del backend lo mide en puntos de código desde `5b2bcdd`; `contrato.test.ts` vigila la constante, no el algoritmo. Es un pendiente abierto (§10), no un patrón para copiar.

## 8. Pruebas

- `src/api/*.test.ts`: esquemas, máquina (oráculo de las 18 combinaciones de estado y rol), cliente (18 casos de transporte y error), una prueba por ruta y la **prueba de deriva**.
- **Prueba de deriva (`contrato.test.ts`):** lee como texto (`?raw` de Vite) `backend/src/solicitudes/reglas/maquina-estados.ts`, `backend/prisma/schema.prisma` y `backend/src/solicitudes/solicitudes.service.ts`, y compara estados, acciones, transiciones, roles, categorías, el mensaje concurrente y el aviso de "fin posterior al inicio" (`horario.validator.ts`). Desde la 6.5.3 también lee los dos DTO de motivos y el decorador `@TextoConLongitudReal`: compara los límites **y** el algoritmo de conteo. Desde la Fase 8 lee `backend/src/solicitudes/reglas/categorias.ts` (`PASA_POR_EDICION` y `REQUIERE_ENLACE`; en la Fase 9, también `ADMITE_ANEXO`) y `backend/src/common/validadores/enlace-seguro.decorator.ts` (`ENLACE_MAXIMO`); en la Fase 9 (K4), además, el enum `CampoEnlace` de Prisma y los límites del motivo de la corrección (`corregir-enlace-entrega.dto.ts`). Del enlace compara **solo la constante**, no el algoritmo de conteo (§7, ítem 16, y §10). Exige encontrar exactamente **12 transiciones** (T1 a T12): un cambio de formato en el backend falla en lugar de pasar sin comparar nada. `vitest.config.ts` permite leer `..` solo en las pruebas.
  **Corrección (2026-11-16):** el texto anterior (`6bdd4a0`) decía «Exige encontrar exactamente 9 transiciones» y «oráculo de las 14 combinaciones de estado y rol»; el código exige 12 transiciones (`contrato.test.ts`) y el oráculo cubre 18 combinaciones (`maquina-estados.test.ts`). El título de esa prueba de deriva todavía dice «las 10 transiciones T1 a T10»; se registra y no se cambia en esta actualización documental.
- Las variables de entorno de las pruebas son ficticias y viven en `vitest.config.ts`: las pruebas no dependen del `.env.local` de nadie.
- `src/sesion/*.test.ts`: la máquina con una tabla de transiciones (incluidos los eventos ignorados, verificados con `toBe`) y el hook con `renderHook` y un `fetch` falso por ruta.
- `src/fechas/bogota.test.ts`: el canario del desfase de Bogotá, entradas inválidas, el día de "hoy" a las 19:30 y el formato. `Dashboard.test.tsx` fija el reloj con `vi.setSystemTime` para el mínimo del calendario.
- **`npm run test:tz`** repite toda la suite en 4 zonas y verifica antes que cada proceso de verdad tomó su zona (sin eso, el verde podría ser falso).
- Las vistas se prueban con `apiFalsa()` dentro de `<ProveedorApi>` y un `MemoryRouter`. jsdom no implementa `showModal()`: el polyfill de `src/test/setup.ts` imita las reglas del navegador que importan (`InvalidStateError` al abrir dos veces y el evento `close`).
- Las funciones de `presentacion/` se prueban sin React: ahí vive la lógica de la vista.
- **Fase 9 (K1 a K4):** `DetalleStaff.acciones.test.tsx` (K1: el anexo revisado en T1 y el 409), `Dashboard.test.tsx` (K2), `DetalleSolicitud.anexo.test.tsx` (K3) y `DetalleStaff.enlaces.test.tsx` (K4); sin React, `presentacion/anexo.test.ts` y `presentacion/enlaces-staff.test.ts`; los esquemas en `api/esquemas.test.ts` y los cuerpos con `@ts-expect-error` en `api/solicitudes.test.ts`. Ninguna prueba ensaya un enlace de más de 2048 unidades UTF-16 y como máximo 2048 puntos de código (§10).
- Un refactor se verifica con la red existente **sin tocarla**: en la 6.5.4a, `Dashboard.test.tsx` pasó sin cambiar una línea tras extraer `CamposFranja`.

## 9. Vistas y despliegue

Una URL por pantalla: la vista depende del rol que trae el token (DE2). Es solo presentación; el backend vuelve a decidir con `@Roles`. Desde la Fase 7, `/` es el **inicio** de cada rol y el encabezado navega entre sus pantallas (ADR-006 §2.13).

| Ruta | SOLICITANTE | STAFF |
|---|---|---|
| `/` | Inicio: pendientes de su respuesta, próximas reservas, "Nueva solicitud" y las reglas del Estudio C | Inicio: atajos con contador (urgentes, recibidas con la franja vencida, esperando al solicitante, en producción) |
| `/mis-solicitudes` | Panel (B1): resumen, aviso de decisiones pendientes, tarjetas y el formulario B2 con su confirmación (B1b) | Vuelve a `/` en silencio (`SoloRol`) |
| `/tablero` | Vuelve a `/` en silencio (`SoloRol`) | Tablero: columnas Recibido, Validado, Pendiente de Reprogramación, En Producción y Edición y postproducción; cerradas plegadas; aviso de urgentes |
| `/solicitudes/:radicado` | Detalle (B3): línea de vida según la categoría, historial, propuesta (B4), producto final y acciones (cancelar, aceptar, rechazar); anexo (guion) y, en `Recibido` de PODCAST, VIDEO o STREAMING, agregarlo, cambiarlo o retirarlo (Fase 9 · K3) | Detalle (C3): solicitante, recursos frente al inventario, sub-espacio, producto final, resolución (validar, validar con ajustes, rechazar, cerrar como no atendida, iniciar producción, pasar a edición, entregar con enlace si la categoría lo exige, proponer reprogramación) e historial; anexo, que se confirma como revisado al validar en PODCAST, VIDEO o STREAMING (K1), historial de enlaces y «Corregir enlace» en el `Entregado` con enlace registrado, o el aviso `TEXTO_ENTREGA_SIN_ENLACE` si no lo tiene (K4) |
| cualquier otra | Vuelve a `/` | Vuelve a `/` |

- **Despliegue en producción:** el servidor debe responder `index.html` en **cualquier** ruta (*SPA fallback*). `npm run dev` ya lo hace; un hosting estático, no por defecto. Sin eso, recargar o abrir un enlace directo a `/solicitudes/EC-…` responde 404.
- Ajena o inexistente se ven igual: *"No encontramos esa solicitud"* (404 uniforme del backend).
- **Fase 9 · las acciones se ofrecen, no se autorizan:** `edicionDelAnexoDisponible()` y `correccionDisponible()` solo deciden si se muestra un botón. El servidor vuelve a decidir rol, propiedad (404 uniforme), categoría, estado y concurrencia (README del backend §14).
- **Historial de enlaces (K4), solo en el detalle del Staff** (`historialAplica()`: PODCAST, VIDEO y STREAMING): cambios del anexo y correcciones del enlace del producto final, aparte de la línea de vida, porque no son transiciones. Cada valor se muestra como texto, nunca como enlace ejecutable, y `modificado_por` no se muestra. El autor se nombra con criterio conservador (`autorDelEvento()`): «Solicitante» o «Staff Estudio C» solo si el tipo de evento y la comparación con el dueño coinciden; si no, «Autor no identificado».

## 10. Pendiente

- ✅ **6.5b · Backend (cerrada):** `motivo_rechazo` con `@TextoConLongitudReal(10, 500)` y dos CHECK en la base (ADR-005 §2.10). El formulario de rechazo usará `MOTIVO_RECHAZO_MINIMO` y `MOTIVO_RECHAZO_MAXIMO` con su prueba de deriva.
- ✅ **6.5 · Vista del Staff (cerrada):** tablero por estado, detalle C3 y acciones T1, T2, T4, T5 y T9 (ADR-006 §2.12). Lo que quedó fuera está en ADR-006 §5.
- ✅ **6.6 · Cierre de la Fase 6** (bitácora, ADR y PR).
- ✅ **Fase 7 · Frente A (sub-espacios):** el sub-espacio en el contrato, B1, B1b, B2, el tablero y los detalles; T5 con lugar; «Cerrar como no atendida» (T10) y «Validar con ajustes» (ADR-007).
- ✅ **Fase 7 · *contract* y SE10 (PRD v2.3):** B2 muestra el selector de sub-espacio **solo** para «Espacio físico»; en los demás servicios explica que se reserva el Estudio C completo. `CuerpoCrearSolicitud` es una unión discriminada por `categoria`, así que un servicio con `sub_espacio` no compila, y cambiar de categoría borra la elección. El backend lo exige igual (400) y la base de datos ya no tiene valor por defecto (ADR-007 §2.13).
- ✅ **Fase 8 · directrices del tutor (PRD v2.4):** alias «Confirmado» (solicitante) y «Revisado y aprobado» (Staff), «Dirección audiovisual y producción», urgencia en rojo con contraste AA, «Edición y postproducción» por categoría y enlace del producto final (ADR-008).
- ✅ **Fase 8 · corrección del enlace después de la entrega (DA-4): resuelta en la rama** con K4 (`479c60c`; ADR-008 §2.7). La base principal sigue pendiente (ver «Fase 9 · pendiente»). Texto anterior (`6bdd4a0`, 2026-10-29), conservado: «**Fase 8 · pendiente (ADR-008 §3):** corregir un enlace después de la entrega (DA-4).»
- ✅ **Fase 9 · R9-1 en la rama `feat/fase-9-anexo-solicitante` (sin despliegue institucional; [ADR-009](../docs/adr/ADR-009-anexo-del-solicitante-y-fuente-unica-del-enlace.md), E7 de [ADR-005](../docs/adr/ADR-005-maquina-de-estados-ca10.md) y [ADR-012](../docs/adr/ADR-012-eventos-de-auditoria-sin-transicion.md)):**
  - anexo opcional al radicar y en los dos detalles, con `EnlaceExternoSeguro` (`749566d`);
  - `esEnlaceSeguro` también rechaza caracteres de control sin codificar (H0, `a111c73`);
  - K1 (`0dc6eac`): `anexo_revisado` en las dos rutas de T1;
  - K2 (`5c27ec3`): el anexo solo en PODCAST, VIDEO y STREAMING, con `TEXTO_AYUDA_ANEXO`;
  - K3 (`be6a02a`): edición y retiro del anexo por el solicitante;
  - K4 (`479c60c`): historial de enlaces y corrección del enlace del producto final para el Staff.
- **Fase 9 · pendiente** (aspectos por resolver, verificar o autorizar según corresponda; ninguna operación pendiente queda autorizada por este documento):
  - **Base principal:** el paso 9.1.5 y su postcheck. Este frontend necesita el backend de la misma rama, y ese backend necesita el esquema de la migración H1, sin evidencia de aplicación autorizada y verificada en la base principal (README del backend §2.1).
  - **Matriz de compatibilidad** entre versiones del frontend, del backend y del esquema: hipótesis sin medir.
  - **Prueba manual** con navegador real.
  - **Longitud de los enlaces, sin corregir en el frontend:** `esEnlaceSeguro` mide `ENLACE_MAXIMO` en unidades UTF-16 (`texto.length`, `presentacion/enlace.ts`); `EnlaceSeguro` del backend lo mide en puntos de código desde `5b2bcdd`. Las dos medidas **no están alineadas**. Las unidades UTF-16 nunca son menos que los puntos de código, así que en longitud el frontend no deja pasar algo que el servidor rechace; pero un enlace de más de 2048 unidades UTF-16 y como máximo 2048 puntos de código (por ejemplo, con emojis u otros caracteres fuera del plano básico, que ocupan dos unidades UTF-16 y un punto de código) se bloquea al radicar, editar o corregir con un mensaje que no habla de longitud, y, si ya está guardado, se muestra como no disponible, sin `<a>` (`EnlaceExternoSeguro`). `contrato.test.ts` vigila la constante, no el algoritmo, y ninguna prueba ni ensayo con navegador cubre ese caso.
  - **Unicode:** U+0000 y los sustitutos UTF-16 aislados son un hallazgo independiente, sin medir.
  - **D5** (inmutabilidad del log impuesta por PostgreSQL; por eso la atribución del historial es conservadora) y **R9-2** (notificaciones por correo) siguen abiertos en [ADR-012](../docs/adr/ADR-012-eventos-de-auditoria-sin-transicion.md).
- **Fase 7 · pendiente (ADR-007 §6):**
  - el historial (línea de vida) todavía no muestra los ajustes de lugar y de franja que el log ya guarda (DA-2);
  - el diálogo de T10 puede decir que la franja queda libre (el motor ya la libera);
  - el retiro de una propuesta por el Staff sigue fuera de alcance (ADR-005 §3).
