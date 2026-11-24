# ADR-010 — Identidad visual institucional (R9-3): Roboto autoalojada, tokens de color medibles y marca CESMAG

| Campo | Valor |
|---|---|
| **Estado** | 📝 **Propuesto.** Decisiones aprobadas en sesión el 2026-11-09; implementación en curso por lotes. Siguen abiertas las preguntas 14 y 15 y el recurso oficial del escudo en una tinta (§3); la pregunta 16 se resolvió el 2026-11-23 (§2.7) |
| **Fecha** | 2026-11-09 · diagnóstico actualizado el 2026-11-23 |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `feat/fase-9-identidad-institucional`, creada desde `develop` @ `67a1fb2` (R9-1 integrado por el PR #17) |
| **Complementa a** | [ADR-006](ADR-006-frontend-contrato-tipado.md) (frontend tipado y pruebas de contrato que leen el código fuente) · [ADR-008](ADR-008-edicion-postproduccion-y-enlace-de-entrega.md) (VI1 a VI3: alias por rol y urgencia en Rojo 1, AA medido en `tema.test.ts`) · [ADR-009](ADR-009-anexo-del-solicitante-y-fuente-unica-del-enlace.md) (`EnlaceExternoSeguro` y los campos que se reestilizan) |
| **Relacionado con** | Backlog de la Fase 9 (R9-3) · PRD v2.5 (borrador) · *Manual de identidad visual* CESMAG (págs. 7 a 12 y 15) · *Manual de Roboto* · bitácora del PR #13 (identidad del Estudio C) |

---

## 1. Contexto

- R9-3 pide un frontend **más institucional**, inspirado en unicesmag.edu.co (**inspiración, no copia**), con WCAG AA **medido**, conservando las columnas del tablero, la forma que no depende solo del color (DV6) y la urgencia distinta del error (VI3).
- **Fuente oficial:** el *Manual de identidad*. La paleta principal (pág. 11) es Azul 1 #1F5BA3, Azul 2 #2C3967, Rojo 1 #BA1828, Rojo 2 #E00F38 y Blanco #FFFFFF, con dos degradados (Azul 1 → Azul 2 y Rojo 1 → Rojo 2). La tipografía es la familia **Roboto** (pág. 12). El escudo tiene versiones positiva y en una tinta, área de seguridad, un tamaño mínimo de 6 × 6 mm y usos incorrectos (págs. 9, 10 y 15). **El manual no define neutros (grises).**
- **Diagnóstico estático**, hecho el 2026-11-09 y actualizado el 2026-11-23 sobre `develop` @ `67a1fb2` (R9-1 integrado). Hoy hay **29 componentes `.tsx`** sin contar las pruebas (21 en el primer diagnóstico):
  - **Roboto no se carga:** `--font-sans: "Roboto", sans-serif` depende de que el equipo la tenga instalada (H-R3-1).
  - **212 usos de la paleta por defecto de Tailwind** (196 en el primer diagnóstico): grises, rojos, negro y blanco, definidos en **OKLCH** en Tailwind v4. `tema.test.ts`, que lee hex, no puede medirlos (H-R3-2).
  - **Fallos AA probables** (cálculo aproximado, porque los colores OKLCH se convirtieron a hex): `gray-500` sobre `background` ≈ 4,49; `accent` sobre `red-50` (las cajas de error) ≈ 4,47; el *placeholder* `gray-400` ≈ 2,6; el borde de los campos `outline` #c6c6cd ≈ 1,70 sobre blanco, por debajo del 3:1 de WCAG 1.4.11 (H-R3-3 y H-R3-4).
  - La acción principal «Nueva Solicitud» usa Rojo 2 (H-R3-5); urgencia y error se diferencian solo 1,32:1 por color (H-R3-6); el escudo no aparece (H-R3-7); no hay un estilo de foco propio (H-R3-8).
  - **24 usos de `font-semibold`**, que pide un peso (600) que Roboto estática no tiene (H-R3-9).
- **Antecedente (H9-1, aprobado en el diagnóstico de la Fase 9):** los azules son el color primario de la interfaz; Rojo 1 queda para la marca y la urgencia.

---

## 2. Decisiones

### 2.1 Tipografía (D-R3-1)

- **Roboto autoalojada** con `@fontsource/roboto`, importada en `main.tsx`, solo con los pesos **400, 500, 700 y 900** y los subconjuntos **latin y latin-ext** (tildes y «ñ»).
- **Sin CDN de Google Fonts:** funciona sin Internet en la oficina y no envía la IP de los usuarios a terceros.
- **`font-semibold` (600) se reemplaza por `font-bold` (700).** Con los pesos disponibles, el navegador ya resuelve 600 con el peso 700 (regla de selección de fuentes de CSS: para un peso pedido mayor que 500, se busca primero el siguiente más grueso). El reemplazo, por tanto, **no cambia lo que se ve**; solo hace explícito el peso real. Un ajuste a 500 en un caso concreto sería una decisión visual aparte, no parte de este reemplazo.
- `--font-sans` sigue siendo `"Roboto", sans-serif`.
- Es una dependencia **solo del frontend**: la imagen Docker del backend no cambia.

### 2.2 Tokens de color medibles (D-R3-2)

- **Todos los colores de la interfaz son tokens `--color-*` en hex** dentro del `@theme` de `index.css`. Nunca OKLCH, para que `tema.test.ts` los mida.
- Los cinco colores del manual se escriben **una sola vez** (`cesmag-*`). Los tokens semánticos los referencian: `primary` = Azul 2, `primary-hover` = Azul 1, `accent` = Rojo 2, `urgencia` = Rojo 1, `surface` = Blanco.
- **Neutros propios** (el manual no los define), derivados del Azul 2 para que los grises se vean institucionales («fríos»). Los fondos de los pares de texto son `surface`, `background` y `superficie-suave`:

| Token | Valor | Uso | Umbral medido | Mínimo medido |
|---|---|---|---|---|
| `texto-secundario` | #545D7C | Etiquetas `<dt>`, metadatos y ayudas (reemplaza `gray-500` y `gray-600`) | ≥ 4,5 sobre los tres fondos | 5,85 |
| `texto-terciario` | #646C88 | Tercer nivel de texto, incluido el *placeholder* | ≥ 4,5 sobre los tres fondos | 4,68 |
| `borde-control` | #7C849F | Bordes de campos, casillas y botones secundarios | ≥ 3,0 sobre los tres fondos (WCAG 1.4.11) | 3,34 |
| `borde-suave` | #D5D9E5 | Separadores decorativos | Sin umbral: no identifica controles | — |
| `superficie-suave` | #F1F3F8 | Paneles y avisos (reemplaza `gray-50` y `gray-100`) | Fondo de los pares de texto | — |
| `foco` | #1F5BA3 (Azul 1) | Anillo de `focus-visible` | ≥ 3,0 contra el desplazamiento blanco (ver 2.5) | 6,81 |

- Los valores **solo se aceptan si pasan `tema.test.ts`**. Los mínimos de la tabla salen de la misma fórmula de luminancia (WCAG 2.x) que usa la prueba.
- **Transición:** los tokens existentes `outline` (#c6c6cd, 1,70 sobre blanco) y el *placeholder* `gray-400` se sustituyen en el refactor mecánico (9.3.3), no en el paso que crea los tokens. Hasta entonces no se miden, porque fallan por diseño (H-R3-4).

### 2.3 Cajas de error y VI3 (D-R3-3)

- Las cajas `role="alert"` pasan de `bg-red-50` a **`bg-surface`** con `text-accent`, un borde y un **ícono ⚠ textual** (marcado como decorativo para el lector de pantalla, porque el mensaje ya está en texto). Accent sobre blanco = 4,89 (AA).
- **VI3 se cumple por la forma, no solo por el color.** Con apenas 1,32:1 entre Rojo 1 y Rojo 2, el color no basta: el error es una caja con ícono y la urgencia es su insignia (borde y marca propios). Las pruebas distinguen las dos por sus marcas (`data-*`), no por el tono.

### 2.4 Jerarquía de color (D-R3-4)

- **Acciones principales en azul:** «Nueva Solicitud» pasa de `bg-accent` a `bg-primary` (blanco sobre Azul 2 = 11,12).
- `accent` (Rojo 2) queda **solo** para errores y acciones irreversibles (por ejemplo, la confirmación destructiva de `DialogoConfirmacion`). Rojo 1 queda para el escudo y la urgencia.

### 2.5 Marca, foco y guardia (D-R3-5 a D-R3-7)

- **D-R3-5 · Encabezado institucional:** franja en Azul 2 con el **escudo**, «Universidad CESMAG» y el logo del Estudio C. **Pendiente:** depende de la pregunta 14 y del recurso del escudo (§3); no se implementa antes.
  - **Enmienda (2026-11-24, §2.8 C-2):** mientras la pregunta 14 siga abierta, el encabezado se implementa en dos niveles con la identidad en **texto** y sin escudo ni marcador que lo simule. El escudo se integra en V2.
  - **Versión del escudo:** positiva sobre blanco o en una tinta blanca sobre azul (pág. 9). Nunca deformado ni recoloreado (pág. 15).
  - **Tamaño y área:** ≥ 24 px de alto en pantalla (equivalente a 6 mm), con su área de seguridad (pág. 10).
  - **Recurso:** recortado a su contenido real desde el original de 1201 px (lección 1 del PR #13). Si no existe la versión oficial en una tinta, se pide a la Oficina de Comunicaciones y Mercadeo.
  - **Jerarquía** entre el escudo y el logo del Estudio C: según la pregunta 14 del cuestionario.
  - **Inspiración** en la **estructura** del sitio institucional (encabezado, jerarquía tipográfica, pie con lema), sin copiar plantillas ni imágenes.
- **D-R3-6 · Foco visible propio:** `focus-visible` con un anillo de 2 px en el token `foco` **y un desplazamiento de 2 px en blanco**. El desplazamiento garantiza el contraste del anillo tanto sobre blanco como sobre el Azul 2 del encabezado, y es lo que se mide.
- **D-R3-7 · Guardia contra regresiones**, en `tema.test.ts`: lee como texto (`?raw` o `import.meta.glob`) los `.tsx` de `src/` sin pruebas y **falla** si aparece una utilidad de la paleta por defecto (`(text|bg|border|ring)-(gray|red|black|white|…)`). Las excepciones van explícitas y comentadas en una lista; por ejemplo, el fondo del modal `bg-black/50`, si se conserva. Se activa con el refactor mecánico (9.3.3).

### 2.6 Fuera de alcance (D-R3-8)

- La paleta complementaria por facultades, los degradados como fondo de texto y el modo oscuro.
- El inventario (`Recurso` y `Solicitud_Recurso`, suspendido desde la Fase 7).
- El backend y la base de datos: R9-3 es solo frontend.

### 2.8 Composición institucional (V1, 2026-11-24)

Objetivo aprobado por el responsable del proyecto: que el sistema se perciba como una plataforma de la Universidad CESMAG vinculada al CIDU, no como una aplicación genérica con colores institucionales. Las capturas del sitio institucional son referencia de **estructura**; los prototipos de otros sistemas, solo inspiración.

| Id | Decisión |
|---|---|
| C-1 | **Identidad textual única** en `presentacion/identidad.ts`: «Universidad CESMAG · CIDU · Estudio C», «Sistema de Solicitudes y Reservas» y el lema «Ciencia y Servicio», confirmados por el responsable del proyecto. CIDU va solo como sigla. Ningún componente dibuja ni simula el escudo |
| C-2 | **Encabezado de dos niveles** (enmienda de D-R3-5): franja en Azul 2 con la identidad en texto blanco (11,12:1) y barra blanca con el logo de Estudio C, el sistema y la página, la navegación por rol y el usuario. Se conserva el orden C8 (marca → navegación → nombre → Salir) y el comportamiento responsivo. «Saltar al contenido» es el primer elemento enfocable y lleva el foco al contenido principal |
| C-3 | **Composición común** `PantallaConSesion`: encabezado, `<main id="contenido">` con foco por código y pie, en las 6 pantallas con sesión |
| C-4 | **Pie discreto** `PieInstitucional`: pertenencia, sistema y lema; sin datos de contacto ni enlaces, porque ninguno está verificado |
| C-5 | **Rol en palabras** («Solicitante», «Staff») y sin el rojo de error (D-R3-4) |
| C-7 | **Cabecera de página** `CabeceraPagina` (V1-B): el único `h1` de cada pantalla con sesión, con rótulo de contexto, descripción y acción principal opcionales. El encabezado deja de repetir el título de la página y muestra el nombre del sistema. En los detalles, el `h1` nombra la pantalla y el radicado sigue siendo el `h2` que recibe el foco al cargar |
| C-8 | **Acceso de dos paneles** (V1-B): panel institucional en Azul 2 con la pertenencia en texto, el sistema, el descriptor y el lema (apilado arriba en móvil), y la tarjeta de acceso con el logo de Estudio C. Lo comparten el login, la verificación y el reintento. Sin cambios en Google, la sesión ni los mensajes |
| C-9 | **Escudo oficial, solo sobre blanco** (V2, autorizado por el responsable del proyecto el 2026-11-24). Recurso: `https://www.unicesmag.edu.co/recursos/uploads/2022/04/Escudos_2-2-1024x1024.png`, PNG 1024 × 1024 RGBA a color, SHA-256 `a9b952d4e4c015bb3513d1451b37a7bb2ee79b90b649f46ca3a36d118fe9b09f`, descargado del dominio de la Universidad y verificado por el responsable del proyecto. Se usa en `src/assets/escudo-universidad-cesmag.png` sin recolorear, recortar, deformar ni aplicar efectos; solo se escala en proporción. Ubicación: barra blanca del encabezado (32 px en móvil, 40 px desde `md`), a la izquierda del logo de Estudio C y separado por un divisor; tarjeta blanca del acceso (56 px), encima del logo. No va en la franja azul, el pie, las tarjetas, los formularios ni los diálogos. Reglas verificadas en el Manual (págs. 8, 9, 10 y 14): versión a color, proporción, tamaño mínimo de 6 × 6 mm, escudo a la izquierda del texto, sin efectos ni baja resolución. **Pendiente de Comunicaciones:** el valor exacto del área de seguridad «x», el uso junto al logo de Estudio C sin constituir un identificador alterado, el uso a color sobre Azul 2 (solo hay una muestra, «Función fondos») y la confirmación del archivo como recurso digital autorizado. **No existe visto bueno formal de Comunicaciones** |
| C-10 | **Lema institucional** «Hombres nuevos para tiempos nuevos» (Manual, págs. 15 y 16, de Fray Guillermo de Castellana, OFMCap.) en el acceso y el pie, en lugar de «Ciencia y Servicio», que es la leyenda del escudo y solo aparece dentro de su imagen |
| C-6 | **Dirección aprobada para los lotes siguientes:** V1-B (login de dos paneles y cabeceras de página con un `h1` por pantalla), V1-C (inicios del solicitante y del Staff), V1-D (tablero, detalles, tarjetas y formularios) y V2 (escudo oficial, tras las preguntas 14 y 15). Tema claro con superficies blancas; sin rojo decorativo mientras D-R3-4 no cambie |

### 2.7 Registro de decisiones de implementación (2026-11-23)

Decisiones tomadas por el responsable del proyecto durante 9.3.3, sobre la base de las secciones anteriores. No cambian el estado del documento.

| Id | Decisión | Medición |
|---|---|---|
| I-1 | **`texto-principal` #3A4057** para el texto principal (reemplaza `gray-700`): tono del Azul 2 desaturado, con el mismo peso visual que el gris anterior | 10,24 sobre `surface`; 9,50 sobre `background`; 9,22 sobre `superficie-suave` |
| I-2 | **`text-surface`** para el texto blanco sobre los botones institucionales (sin token nuevo) | 11,12 sobre `primary`; 4,89 sobre `accent` |
| I-3 | **Trinquete de D-R3-7:** los usos pendientes se registran como inventario exacto de deuda técnica, por archivo y clase; no son excepciones permanentes y solo pueden reducirse | La guardia en `tema.test.ts` |
| I-4 | **Pregunta 16 · insignias:** se conservan los 9 estados, las 5 columnas del tablero, los alias por rol, los símbolos y las diferencias de borde, con una **equivalencia neutra 1:1** de los grises (claro → `superficie-suave`/`surface`; bordes → `borde-control`/`borde-suave`; texto y bordes fuertes → `texto-principal`; «En Producción» sólido en `texto-principal` y «Edición y postproducción» en `texto-secundario`). Los estados en curso no usan el azul, reservado a las acciones, para que una insignia sólida no parezca un botón | Blanco sobre `texto-principal` 10,24 y sobre `texto-secundario` 6,49; bordes de forma ≥ 3,34 |
| I-5 | **Cajas de error (D-R3-3):** componente único `CajaError` (el componente número 30): fondo `surface`, texto `accent`, borde continuo con **barra lateral de 4 px** en **`borde-error`**, alias de `accent` (`cesmag-rojo-2`), ícono ⚠ decorativo y marca `data-aviso="error"`. La urgencia conserva su píldora de borde discontinuo y recibe la marca `data-insignia="urgencia"`: se distinguen por la forma y por la marca, no por el tono | `accent` sobre `surface` 4,89; `borde-error` sobre `surface` 4,89 (umbral 3) |
| I-6 | **Botón deshabilitado (D-R3-4):** `bg-gray-200` → `superficie-suave`, con el borde punteado, el cursor y la razón accesible (`aria-describedby`) sin cambios | `texto-secundario` sobre `superficie-suave` 5,85 |
| I-7 | **Excepción revisada en `Dashboard`:** la caja de validación del formulario de radicación no tenía `role="alert"`, y un rechazo (CA-04, CA-06, anexo o sub-espacio) no se anunciaba. Como ningún campo anuncia su propio error, `CajaError` le da la alerta sin duplicar anuncios. No hay otras cajas de error sin alerta | Prueba de `Dashboard` (rechazo del servidor anunciado) |
| I-8 | **Acción principal (D-R3-4, 9.3.4):** «Nueva Solicitud» pasa de `bg-accent` a `bg-primary` (Azul 2) con `hover:bg-primary-hover` (Azul 1), en lugar de `hover:opacity-90`. Los demás botones primarios conservan su hover actual | Blanco sobre `primary` 11,12 y sobre `primary-hover` 6,81 |
| I-9 | **Foco visible (D-R3-6, 9.3.4):** regla global `:focus-visible` en `index.css`: anillo `outline` de 2 px en `foco` con `outline-offset` de 2 px, y sombra blanca de 2 px que rellena la separación. Las cabeceras con foco por código conservan `outline-none`. Limitación aceptada: en un control con sombra de utilidad (`shadow-*`) prevalece esa sombra y la separación muestra el fondo; sobre los fondos claros el anillo sigue visible | `foco` sobre `surface` 6,81 (umbral 3); `tema.test.ts` lee la regla |
| I-10 | **Pantalla de acceso (9.3.5, sin escudo):** el título pasa a `h1` (no hay encabezado sin sesión) en Roboto 900 y `primary`; la indicación sube de `text-xs` a `text-sm` en `texto-secundario`; «Reintentar» usa `hover:bg-primary-hover`. Sin cambios en la autenticación, los mensajes ni la navegación; el foco lo da la regla global (I-9). El escudo espera las preguntas 14 y 15 | `primary` sobre `surface` 11,12; `texto-secundario` sobre `surface` 6,49 |
| I-11 | **«Autenticando...» como estado informativo (9.3.6):** se pinta aparte en un `<output>` (rol `status`) con `texto-secundario`, que existe solo mientras dura la validación; nunca convive con el mensaje de error, así que el mismo intento no genera dos anuncios. El texto, los mensajes de error y el flujo de autenticación no cambian | `texto-secundario` sobre `surface` 6,49 · prueba de `App` |
| I-12 | **Hover de las acciones principales (9.3.6):** las cuatro restantes con `hover:opacity-90` («Ver seguimiento detallado», «Enviar Radicado», «Nueva solicitud» del inicio y «Ir al tablero») pasan a `hover:bg-primary-hover`. Los botones de las acciones sobre la solicitud y de confirmación (incluida la destructiva en `accent`) conservan su estilo propio. La guardia de `tema.test.ts` impide volver a combinar `bg-primary` con `hover:opacity-*` | Blanco sobre `primary-hover` 6,81 |

---

## 3. Preguntas abiertas

| Pregunta | Opción vigente por defecto | Qué cambia si la respuesta es otra |
|---|---|---|
| **14** · ¿Escudo y logo del Estudio C juntos? ¿Cuál tiene más jerarquía? ¿Hace falta el visto bueno de Comunicaciones? | Escudo a la izquierda en el encabezado y logo del Estudio C como marca del sistema. **2026-11-24:** implementado así con autorización del responsable del proyecto y las reglas del Manual (§2.8 C-9); **sigue abierta** hasta el visto bueno de Comunicaciones | Cambia la composición del encabezado y del login; si Comunicaciones debe aprobar, la integración de 9.3.4 espera su visto bueno |
| **15** · ¿Los azules como marca y el rojo para el escudo y la urgencia? | Sí (H9-1) | — |
| **16** · ¿Qué debe mantenerse sí o sí en el tablero? | ✅ **Resuelta el 2026-11-23** (§2.7, I-4): las 5 columnas, los alias por rol y las insignias, con la equivalencia neutra 1:1 | Criterio de aceptación: pruebas de `TableroStaff`, `Insignias` y de los alias, sin cambios de comportamiento |
| Recurso oficial del escudo en una tinta | Pendiente de verificar en los archivos | Si no existe: el escudo en positivo sobre una placa blanca dentro de la franja azul, respetando el área de seguridad |

---

## 4. Verificación (plan)

| Decisión | Prueba o evidencia |
|---|---|
| D-R3-1 | La fuente se sirve desde el paquete del frontend (revisión de red en local: ninguna petición a Google Fonts) · revisión visual sin Roboto instalada en el equipo · cero `font-semibold` en `src/` |
| D-R3-2 | `tema.test.ts`: tabla de pares como datos (texto 4,5; controles y foco 3,0) e invariantes de marca (`primary` = `cesmag-azul-2`, `urgencia` = `cesmag-rojo-1`, `accent` = `cesmag-rojo-2`) |
| D-R3-3 | `tema.test.ts` (accent sobre `surface` ≥ 4,5) · pruebas de vista de las cajas `role="alert"` (ícono, borde y marca) · VI3: insignia de urgencia y caja de error con marcas distintas |
| D-R3-4 | Prueba de vista de la acción principal · `DialogoConfirmacion.test.tsx` actualizado **a propósito** (`bg-gray-200` y `bg-accent` pasan a sus tokens) |
| D-R3-5 | Pruebas de `Encabezado` (nombre accesible del escudo, orden del DOM ya probado en C8) · revisión manual del tamaño mínimo y del área de seguridad |
| D-R3-6 | `tema.test.ts` (`foco` ≥ 3,0 contra el desplazamiento blanco) · navegación con teclado en local |
| D-R3-7 | La guardia en `tema.test.ts`: cero coincidencias fuera de la lista de excepciones |
| Columnas del tablero | Las pruebas actuales de `TableroStaff` e `Insignias` siguen en verde sin cambios de comportamiento |

Cifras: se registran de la salida real de la terminal en la bitácora de R9-3.

---

## 5. Consecuencias

**A favor**
- La identidad deja de depender del equipo de cada usuario: misma fuente y mismos colores en todas partes.
- **Todo color se mide**: el AA pasa de supuesto a probado, y la guardia impide volver a la paleta por defecto.
- La urgencia y el error se distinguen por la forma, accesibles para personas con daltonismo.
- La marca CESMAG aparece con sus reglas (escudo, azules y Roboto).

**En contra**
- Un diff amplio en 29 componentes: se mitiga con lotes pequeños y con el refactor mecánico separado de los cambios de marca (lección 3 de R9-1).
- Algunas pruebas fijan clases de color y deben actualizarse a propósito.
- Una dependencia nueva en el frontend (`@fontsource/roboto`), con su peso en el paquete acotado a 4 pesos y 2 subconjuntos.
- La jerarquía del encabezado depende de terceros (pregunta 14 y, quizá, Comunicaciones).

---

## 6. Pendiente

- Las respuestas 14 a 16 y la revisión visual conjunta del sitio institucional (paso 9.3.0).
- El recurso oficial del escudo en una tinta.
- `public/icons.svg` y `src/assets/Logo_Estudio_C_2-02.svg` (pendiente heredado del PR #13): el 2026-11-23 un `grep` no encontró referencias en `.ts`, `.tsx`, `.html` ni `.css`. **Pendientes de revisión: no se eliminan todavía**; su retiro es una decisión aparte.

---

## 7. Historial de implementación

| Commit | Paso |
|---|---|
| — | 9.3.0 · Revisión visual de unicesmag.edu.co y respuestas 14 a 16 ⏳ |
| `fe012b3` · `21d295d` | 9.3.1 · `@fontsource/roboto` con pesos acotados; `font-semibold` → 700 ✅ |
| `ef58c16` | 9.3.2 · Tokens neutros y `foco` en `index.css` + `tema.test.ts` con la tabla de pares ✅ |
| `54dc57d` · `420b68d` · `2faafeb` · `c5095e8` · `87515ac` · `f416fb0` | 9.3.3 · Refactor mecánico de la paleta por defecto a tokens, por lotes, más la guardia D-R3-7; el trinquete queda vacío (solo la excepción `backdrop:bg-black/50`) ✅ |
| `ddd30d7` | Fuera de los pasos de R9-3: actualización de `vite`, `undici` y `source-map-js` dentro de sus rangos (alertas altas de `npm audit`, solo de desarrollo) ✅ |
| `d8a2e0b` | 9.3.4 · Marca: encabezado con escudo, acción principal en azul y foco ⏳ (los errores sobre `surface` y el deshabilitado se adelantaron al cierre de 9.3.3: I-5 e I-6; la acción principal y el foco, en el lote sin escudo: I-8 e I-9; el encabezado espera las preguntas 14 y 15 y el recurso del escudo) |
| `8bc8b41` | 9.3.5 · Login institucional ⏳ (lote sin escudo: I-10; el escudo espera las preguntas 14 y 15) |
| `8c6d401` | 9.3.6 · Verificación (`tsc`, `npm test`, revisión manual en local), bitácora y PR ⏳ (preparación: I-11 e I-12) |
| `39ccc11` | V1-A · Encabezado institucional textual, identidad compartida y pie (§2.8 C-1 a C-5) ✅ |
| `598407c` | V1-B · Acceso de dos paneles y cabeceras de página con un `h1` por pantalla (§2.8 C-7 y C-8) ✅ |
| — | V2 · Escudo oficial sobre blanco en el encabezado y el acceso; lema institucional (§2.8 C-9 y C-10) ⏳ |
