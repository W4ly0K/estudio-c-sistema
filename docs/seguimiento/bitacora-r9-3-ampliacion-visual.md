# Bitácora de R9-3 · Ampliación visual institucional (V1-A a V1-D, V2 y C-13)

| Campo | Valor |
|---|---|
| **Requerimiento** | R9-3 (Fase 9): ampliación visual del frontend institucional, posterior a la integración del PR #18 |
| **Complementa a** | [`bitacora-r9-3-identidad-institucional.md`](bitacora-r9-3-identidad-institucional.md) (PR #18), que no se modifica |
| **Decisión de referencia** | [ADR-010](../adr/ADR-010-identidad-visual-institucional.md) §2.8 (C-1 a C-13) · **Propuesto** (no aceptado) |
| **Rama** | `feat/fase-9-identidad-v1a`, creada desde `develop` @ `a5a74ed`; local, sin push ni PR al redactar esta bitácora |
| **Último commit registrado** | `dc15056` |
| **Periodo** | 2026-11-24 |
| **Estado** | Implementación cerrada; pruebas automatizadas conformes; revisión visual manual incompleta; uso institucional del escudo condicionado al visto bueno de Comunicaciones |

Los resultados de pruebas de esta bitácora fueron ejecutados por el responsable del proyecto en el entorno local de desarrollo y reportados para revisión.

---

## 1. Alcance

Solo presentación del frontend. Sin cambios en el backend, la base de datos, la autenticación, la API, la máquina de estados, las reglas de horario, CA-06 ni las dependencias. Se conservan los cinco estados operativos, sus alias por rol, las nueve insignias, la prioridad de urgencia y las solicitudes cerradas.

## 2. Commits de la rama

| Commit | Lote | Contenido |
|---|---|---|
| `39ccc11` | V1-A | Encabezado institucional de dos niveles («Universidad CESMAG · CIDU · Estudio C»), identidad compartida en `presentacion/identidad.ts`, enlace «Saltar al contenido», `PantallaConSesion` y pie institucional |
| `5de6743` | V1-A | ADR-010 §2.8 (C-1 a C-6) |
| `598407c` | V1-B | Acceso de dos paneles y `CabeceraPagina`: un `h1` por pantalla |
| `7dab6db` | V1-B | ADR-010 (C-7 y C-8) |
| `b651a3e` | V2 | Escudo oficial a color en el encabezado y el acceso; lema institucional «Hombres nuevos para tiempos nuevos» |
| `14be0c6` | V2 | ADR-010 (C-9 y C-10): procedencia del escudo y lema |
| `8ae70c5` | V2 | Escudo del acceso en el panel institucional, centrado sobre una superficie blanca |
| `ca30e90` | V2 | ADR-010 (C-9): ubicación del escudo en el acceso |
| `9254f35` | V1-C | Inicios del solicitante y del Staff con el componente `Seccion` |
| `6221666` | V1-C | ADR-010 (C-11) |
| `3bccf2d` | V1-D | Columnas del tablero con cabecera, contador fuera del `h3` y vacío proporcionado |
| `60a46e9` | V1-D | Jerarquía de la tarjeta de solicitud |
| `656d3e3` | V1-D | Secciones de los detalles con relleno adaptable y títulos uniformes |
| `4158496` | V1-D | Formulario de radicación agrupado con `fieldset` y `legend` |
| `d409ef3` | V1-D | ADR-010 (C-12) |
| `df27714` | C-13 | Tablero: fila de cuatro etapas operativas y «Pendiente de Reprogramación» debajo, a ancho completo y compacta cuando está vacía |
| `dc15056` | C-13 | ADR-010 (C-13) |

## 3. Evidencia automatizada

| Fecha | Commit | Resultado reportado |
|---|---|---|
| 2026-11-24 | `39ccc11` (V1-A) | Vitest 921/921 |
| 2026-11-24 | `598407c` (V1-B) | Vitest 926/926 |
| 2026-11-24 | `b651a3e` (V2) | Vitest 928/928 |
| 2026-11-24 | `8ae70c5` (V2) | Vitest 928/928 |
| 2026-11-24 | `9254f35` (V1-C) | Vitest 933/933 (54 archivos) |
| 2026-11-24 | `4158496` (V1-D) | Vitest 935/935; lint y build conformes |
| 2026-11-24 | `df27714` (C-13) | Vitest 939/939 (54 archivos); lint 0 errores y 0 advertencias; build conforme |

Qué cubren, además de las pruebas previas al PR #18: textos de identidad y enlace de salto del encabezado; nombre accesible del escudo; un solo `h1` por pantalla; regiones de `Seccion` nombradas por su `h2`; cabeceras de columna del tablero nombradas solo por su estado; la fila de cuatro etapas operativas con la espera fuera de ella y después en el orden de lectura; los dos grupos del formulario con sus campos en orden; y la guardia D-R3-7 sobre 34 componentes.

## 4. Escudo institucional

- **Archivo:** `Frontend/src/assets/escudo-universidad-cesmag.png`, PNG 1024×1024 descargado del sitio institucional de la Universidad CESMAG. SHA-256 `a9b952d4e4c015bb3513d1451b37a7bb2ee79b90b649f46ca3a36d118fe9b09f`, comprobado contra el archivo del commit.
- **Uso:** a color, sin recoloraciones, filtros, sombras, recortes ni deformaciones; sobre superficie blanca en la franja azul; tamaño mínimo y espacio de respeto según el *Manual de identidad visual* (ADR-010 §2.8 C-9).
- **Restricción:** el **uso institucional del escudo queda condicionado al visto bueno de Comunicaciones**, que no existe a la fecha. La versión en una tinta sigue pendiente.

## 5. Resultados manuales reportados

- **V2:** tras la revisión del responsable, el escudo del acceso se reubicó de la tarjeta al panel institucional (`8ae70c5`).
- **V1-C:** revisión visual reportada satisfactoria, sin detalle por punto.
- **V1-D y C-13:** sin revisión visual reportada.

## 6. Pendientes no verificados

| Pendiente | Situación |
|---|---|
| Revisión visual manual de la ampliación | V1-A a V1-D, V2 y C-13 a 320, 768 y 1280 px y con zoom al 200 %, con evidencia por punto. **No se declara aprobada** |
| Visto bueno de Comunicaciones | Condición para el uso institucional del escudo, la integración en `main`, el despliegue y cualquier publicación oficial |
| Escudo en una tinta | Pendiente de conseguir |
| ADR-010 | Permanece **Propuesto**; las preguntas 14 y 15 siguen abiertas |
| `public/icons.svg` y `src/assets/Logo_Estudio_C_2-02.svg` | Sin referencias en el código; pendientes de revisión; **no se eliminan** |

## 7. Integración autorizada

El 2026-11-24 el responsable del proyecto autorizó preparar la integración de esta rama en `develop` como integración de desarrollo, sin esperar el visto bueno de Comunicaciones. **No autoriza** la integración en `main`, el despliegue ni la publicación oficial. Push, PR y merge requieren su autorización posterior.
