# Bitácora de R9-3 · Identidad visual institucional del frontend

| Campo | Valor |
|---|---|
| **Requerimiento** | R9-3 (Fase 9): frontend más institucional, inspirado en el sitio de la Universidad CESMAG |
| **Decisión de referencia** | [ADR-010](../adr/ADR-010-identidad-visual-institucional.md) · **Propuesto** (no aceptado) |
| **Rama** | `feat/fase-9-identidad-institucional`, creada desde `develop` @ `67a1fb2`; local, sin push ni PR |
| **Último commit** | `8c6d401` |
| **Periodo** | 2026-11-23 a 2026-11-24 |
| **Estado** | Implementación cerrada salvo el escudo institucional; revisión visual manual pendiente de evidencia |

Los resultados de pruebas de esta bitácora fueron ejecutados por el responsable del proyecto en el entorno local de desarrollo y reportados para revisión.

---

## 1. Commits de la rama

| Commit | Paso | Contenido |
|---|---|---|
| `9c39be3` | — | ADR-010 en estado Propuesto, con el diagnóstico actualizado (la revisión institucional 9.3.0 sigue pendiente) |
| `fe012b3` | 9.3.1 | `font-semibold` → `font-bold` (24 usos) |
| `ef58c16` | 9.3.2 | Seis tokens neutros y de foco en hex, medidos en `tema.test.ts` |
| `21d295d` | 9.3.1 | Roboto autoalojada (`@fontsource/roboto` 5.3.0): pesos 400, 500, 700 y 900; subconjuntos latin y latin-ext |
| `54dc57d` | 9.3.3 | Neutros y bordes a tokens; retiro del token `outline` (1,70:1) |
| `420b68d` | 9.3.3 | Guardia D-R3-7 contra la paleta por defecto, con trinquete de pendientes |
| `2faafeb` | 9.3.3 | `text-surface` sobre los botones institucionales |
| `c5095e8` | 9.3.3 | Token `texto-principal` (#3A4057) en lugar de `gray-700` |
| `ddd30d7` | — | Actualización de dependencias de desarrollo por seguridad: `vite`, `undici` y `source-map-js`, dentro de sus rangos (alertas altas de `npm audit`) |
| `87515ac` | 9.3.3 | Insignias con equivalencia neutra 1:1 (pregunta 16) |
| `f416fb0` | 9.3.3 | `CajaError` con `borde-error` y barra lateral; botón deshabilitado en `superficie-suave` |
| `d8a2e0b` | 9.3.4 | Acción principal en Azul 2 y foco visible institucional |
| `8bc8b41` | 9.3.5 | Pantalla de acceso con jerarquía institucional (sin escudo) |
| `8c6d401` | 9.3.6 | «Autenticando...» como estado informativo; hover institucional en las acciones principales |

Las decisiones de implementación están registradas en ADR-010 §2.7 (I-1 a I-12).

## 2. Evidencia automatizada

| Fecha | Alcance | Resultado reportado |
|---|---|---|
| 2026-11-23 | Frontend en `8c6d401` | Vitest 910/910 (50 archivos); `tema.test.ts` 56/56; lint 0 errores y 0 advertencias; build conforme |
| 2026-11-23 | Dependencias tras `ddd30d7` | `npm audit` y `npm audit --omit=dev`: 0 vulnerabilidades |
| 2026-11-24 | Backend (idéntico al de `develop`) | 1512 pruebas aprobadas y 1 omitida; build conforme |

Qué cubren las pruebas del frontend, entre otras:

- **Contraste WCAG 2.x medido** de cada par de texto, borde de control, foco, insignia sólida, `borde-error` y acción principal.
- **Guardias:** ninguna clase de la paleta por defecto de Tailwind fuera de la excepción `backdrop:bg-black/50`; ningún uso del token retirado `outline`; ninguna acción principal con `hover:opacity-*`.
- **Comportamiento conservado:** las 5 columnas del tablero, los alias por rol, las 9 insignias distinguibles entre sí, las cajas de error con `role="alert"` y su marca propia frente a la urgencia, y el estado «Autenticando...» con rol `status`.

## 3. Resultados manuales reportados

El 2026-11-24, con el backend y el frontend en el entorno local de desarrollo:

- El backend arrancó con el esquema actualizado y `GET /salud` respondió 200.
- El frontend de R9-3 quedó disponible en el servidor de desarrollo local.
- Las comprobaciones funcionales locales se reportaron satisfactorias, sin detalle por punto.

## 4. Pendientes no verificados

| Pendiente | Situación |
|---|---|
| Revisión visual manual de 9.3.6 | Sin evidencia por punto: carga local de Roboto (sin peticiones a Google Fonts), pantalla de acceso, foco visible y orden de tabulación, diálogos, insignias y urgencia, y responsividad (375, 768 y 1280 px, zoom al 200 %). **No se declara aprobada** |
| Escudo institucional (9.3.4 y 9.3.5) | Espera las preguntas 14 y 15 y el recurso oficial en una tinta |
| ADR-010 | Permanece **Propuesto** mientras las preguntas 14 y 15 sigan abiertas |
| Limitación aceptada (I-9) | En los controles con sombra de utilidad, la separación del anillo de foco muestra el fondo en lugar de blanco |
| `public/icons.svg` y `src/assets/Logo_Estudio_C_2-02.svg` | Sin referencias en el código; pendientes de revisión; **no se eliminan** |

## 5. Entorno de la entrega

- **Migración H1 de R9-1** (`20261109110000_enlace_anexo`, checksum `886aeb80…`) aplicada el 2026-11-23 en la base principal de demostración, con autorización expresa del responsable del proyecto. Postcheck de esquema reportado conforme: 5 columnas nuevas, 11 restricciones CHECK nuevas validadas, las 2 exclusiones de CA-06 intactas y ninguna migración fallida.
- **Desviación de procedimiento:** por decisión del responsable, y por tratarse de una base de demostración sin datos reales, la migración se aplicó sin respaldo verificable previo y con un precheck reducido (estado de las migraciones y comprobación de la restricción B7).
- **Combinación entregada:** backend igual al de `develop` y frontend de R9-3 (`8c6d401`), ejecutados en el entorno local de desarrollo. Las pruebas que escriben datos se reservan para la base desechable de integración.
- Sin push, PR ni despliegue.
