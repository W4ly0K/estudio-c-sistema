# Índice de seguimiento documental

Registro de los documentos maestros de `docs/seguimiento/`, de sus copias de consulta publicadas y de los documentos de seguimiento anteriores a G0. La política está en [`README.md`](README.md).

`README.md` e `indice.md` son documentos de gobernanza: su integridad la garantiza el historial de Git y no se registran en este índice.

**Estados**

| Ámbito | Estado | Significado |
|---|---|---|
| Maestro | `pendiente de publicación` | Incorporado en Git; su copia de consulta todavía no se ha publicado |
| Maestro | `publicado` | Tiene al menos una publicación registrada en la tabla 2 |
| Maestro | `no destinado a publicación` | Solo se consulta en el repositorio |
| Publicación | `pendiente de verificación` | Publicada, sin completar las comprobaciones de la política |
| Publicación | `vigente` | Comprobada: `replaced: false`, versión coincidente y relectura de presencia |
| Publicación | `superada` | Reemplazada por una publicación posterior en otra ruta |
| Publicación | `incidente` | Resultado anómalo registrado según el procedimiento de incidentes |

---

## 1. Maestros

| Archivo | Tipo | Commit que lo incorpora | SHA-256 (LF) | Estado |
|---|---|---|---|---|
| [`bitacora-r9-3-identidad-institucional.md`](bitacora-r9-3-identidad-institucional.md) | Bitácora | `8a0a08c` | `e875a8f9e5e1551b61e654f119557f0b3f9ba1000932c9c55d39281ee6b14523` | pendiente de publicación |
| [`bitacora-r9-3-ampliacion-visual.md`](bitacora-r9-3-ampliacion-visual.md) | Bitácora | `2c95429` | `eb09892259346d9effe2b48a85fe69cde8d9c8b98261b1baee94c07f536dc2b1` | pendiente de publicación |

## 2. Publicaciones

| Maestro | Commit de origen | SHA-256 esperado | Ruta en el Proyecto | Versión informada | `replaced` | Fecha | Supera a | Estado |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | Sin registros |

## 3. Documentos anteriores a G0

Fuentes históricas de su periodo. No son maestros, no se han migrado y no se reconstruyen. Se citan por su nombre en el Proyecto; la fecha es la de su creación allí y no refleja ediciones posteriores.

| Documento | Ubicación | Creado | Nota |
|---|---|---|---|
| `Bitacora_Fase_2_Propiedad_Radicado.md` | Proyecto | 2026-09-30 | Bitácora de la Fase 2 |
| `Bitacora_Fase_1_Zero_Trust.md` | Proyecto | 2026-10-01 | Bitácora de la Fase 1 |
| `Bitacora_Fase_3_Reglas_Horario.md` | Proyecto | 2026-10-01 | Bitácora de la Fase 3 |
| `Bitacora_Fase_4_Concurrencia_CA06.md` | Proyecto | 2026-10-03 | Bitácora de la Fase 4 |
| Registro histórico de incidente de conectividad | Proyecto | 2026-10-07 | Referencia descriptiva; nombre exacto conservado en el Proyecto |
| `Bitacora_Fase_5_Maquina_Estados_CA10.md` | Proyecto | 2026-10-09 | Bitácora de la Fase 5 |
| `Bitacora_Fase_6_Frontend.md` | Proyecto | 2026-10-15 | Bitácora de la Fase 6 |
| `Bitacora_Fase_7_Subespacios.md` | Proyecto | 2026-10-26 | Bitácora de la Fase 7 |
| `Bitacora_Fase_8_UX_Estados_Entregables.md` | Proyecto | 2026-10-29 | Bitácora de la Fase 8 |
| `Bitacora_UI_Identidad_Visual_PR13.md` | Proyecto | 2026-10-29 | Bitácora del PR #13 |
| `Contexto_Arranque_Despliegue_Fase_8.md` | Proyecto | 2026-11-03 | Contexto del despliegue de la Fase 8 |
| `Backlog_Fase_9.md` | Proyecto | 2026-11-03 | Backlog de la Fase 9; estado hasta el 2026-11-12 |
| `Bitacora_Despliegue_Fase_8_Aplazado.md` | Proyecto | 2026-11-09 | Despliegue de la Fase 8, aplazado |
| `Bitacora_Fase_9_R9-1_Anexo.md` | Proyecto | 2026-11-09 | Bitácora de R9-1; estado hasta el 2026-11-12 |
| `ADR-010-borrador.md` y `ADR-011-borrador.md` | Proyecto | 2026-11-09 | Borradores **no aceptados** de R9-3 y R9-2 |
| `Actualizacion_C3_Fase9_Bitacora_y_Backlog_2026-11-17.md` | Proyecto | 2026-11-17 | Complemento de la bitácora y el backlog de R9-1 (sección 4) |
| Copias y materiales de trabajo | `sesiones_locales/` | — | Fuera de Git. No son maestros ni se trasladan al repositorio |

La depuración de los documentos históricos sigue como pendiente independiente.

## 4. Complemento C3 (anterior a G0)

| Campo | Valor |
|---|---|
| Documento | `Actualizacion_C3_Fase9_Bitacora_y_Backlog_2026-11-17.md`, en el Proyecto |
| Naturaleza | Complemento de la bitácora y del backlog de R9-1 al 2026-11-17. No modifica ni sustituye esos documentos |
| Publicación | 2026-11-17. Según la respuesta de publicación: `replaced: false` y versión `ebc95363663ba124c027d68c1f3ce462bec1305940ac233139e78e4cce5a6d71` |
| Maestro en Git | Ninguno. Su contenido no se incorpora a este repositorio |
| Copias locales | Primera versión publicada: SHA-256 `7c5129a5881dbeec51875fe3838c4d1dc83d694d8b39cae81cbed28c14371474` (CRLF). Existe una revisión local posterior no publicada, conservada fuera de Git |
| Estado | Complemento histórico publicado; conserva las reservas documentadas en la fila siguiente. No está sujeto a los estados de publicación definidos para los nuevos maestros G0 |
| Reservas | Dos frases administrativas del documento describen el estado anterior a su publicación. No se corrigieron por sobrescritura porque no fue posible verificar la versión vigente del documento publicado |
