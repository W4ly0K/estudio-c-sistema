# Seguimiento documental (G0)

Esta carpeta contiene los **documentos maestros de seguimiento** del Sistema de Gestión del Estudio C (bitácoras, backlogs y complementos) creados desde la adopción de esta política el 2026-11-17.

**El repositorio es público.** Todo lo que se incorpora aquí es información pública y permanente: el historial de Git no se considera borrable.

El registro de documentos, publicaciones y documentos anteriores a G0 está en [`indice.md`](indice.md).

---

## 1. Clases de documento

| Clase | Ubicación | Autoridad | Cómo cambia |
|---|---|---|---|
| **Maestro** | `docs/seguimiento/` (Git) | Fuente de verdad desde G0 | Solo mediante un commit revisado y aprobado |
| **Copia de consulta** | Proyecto (espacio de documentos del equipo, externo al repositorio) | Derivada de un maestro; solo de consulta | No se modifica: cada versión se publica en una ruta nueva |
| **Material de trabajo** | `sesiones_locales/` (excluida de Git) | Ninguna: respaldos, diagnósticos, borradores y evidencias | Libremente, fuera de Git |
| **Histórico anterior a G0** | Proyecto y entorno local de desarrollo | Fuente histórica de su periodo | No se migra, no se reconstruye y no se sustituye |

## 2. Reglas

1. Todo documento destinado a Git se trata como información pública y permanente.
2. Los maestros nuevos de seguimiento viven en `docs/seguimiento/`, únicamente en su versión publicable.
3. `sesiones_locales/` sigue excluida de Git. Su contenido no se incorpora al repositorio de forma indiscriminada: solo pueden trasladarse borradores concretos después de una revisión y una aprobación específicas.
4. Los maestros de esta carpeta usan finales de línea LF (`.gitattributes`). Así, el SHA-256 del archivo coincide con la versión que informa la publicación de su copia de consulta.
5. Un documento no contiene su propio SHA-256 ni el commit que lo incorpora. Esos valores se registran después, en `indice.md`.
6. Ninguna copia de consulta del Proyecto se sobrescribe mientras no sea posible verificar su versión vigente antes de reemplazarla.
7. Se distinguen dos niveles de identidad: la **textual** (el SHA-256 del texto en LF coincide con la versión publicada) y la **binaria** (los bytes del archivo original), que solo se afirma cuando los bytes se comparan.
8. Los documentos anteriores a G0 se conservan como fuentes históricas de su periodo.

## 3. Clasificación del contenido

| Clase | Ejemplos | Tratamiento |
|---|---|---|
| **Publicable** | Decisiones y su estado, commits, fechas, cifras de pruebas con su atribución, pendientes, referencias a los ADR | Se incluye |
| **Publicable resumido** | Desviaciones de procedimiento, incidentes, restricciones operativas, respuestas del Responsable del Estudio C | Se incluyen el hecho y su efecto, sin datos de infraestructura ni datos personales; las personas se identifican por su rol |
| **No publicable** | Secretos y credenciales; identificadores de proyectos, hosts y bases de datos; nombres de computadores personales; rutas de máquinas personales; salidas crudas de consultas; conteos o datos de la base principal; datos personales no necesarios; cuestionarios; borradores no aceptados | Permanece en `sesiones_locales/` |

**Revisión antes de cada commit:**

1. Búsqueda automática de patrones sensibles (credenciales, identificadores de infraestructura, correos, rutas locales y referencias a equipos personales).
2. Clasificación de cada coincidencia: mención normativa dentro de esta política, secreto, identificador real, dato personal o información operativa.
3. Lectura humana del diff completo con una pregunta: *¿este dato es necesario y está justificada su exposición pública?*

El criterio de aceptación es **cero exposiciones no justificadas**, no cero apariciones literales de una palabra.

## 4. Procedimiento

| Paso | Contenido | Control |
|---|---|---|
| 1. Borrador | Redacción en `sesiones_locales/` | Fuera de Git |
| 2. Revisión | Diff completo frente al maestro vigente y clasificación de contenido (§3) | Búsqueda de patrones y lectura contextual |
| 3. Aprobación | Autorización expresa del responsable del proyecto | — |
| 4. Commit | Copia al maestro, staging por ruta y commit `docs(seguimiento): …` | `git diff --check`, LF y solo los archivos aprobados |
| 5. Publicación (opcional) | Copia de consulta desde el archivo del commit, en una ruta única (§5) | `replaced: false` y versión igual al SHA-256 esperado |
| 6. Registro | Fila en `indice.md`, en el siguiente commit documental | Estado según el resultado de la verificación |

Push, CI y PR requieren una autorización propia, distinta de la del commit.

## 5. Publicación de copias de consulta

- **Ruta única por versión:** `seguimiento/<nombre-del-maestro>__<sha8>.md`, donde `sha8` son los 8 primeros caracteres del SHA-256 del maestro en LF.
- **Antes de publicar** se comprueba que la ruta no existe. Esa comprobación no protege de una escritura simultánea: lo decisivo es la respuesta de la publicación.
- **Condiciones de verificación:** la respuesta indica `replaced: false` y su versión coincide con el SHA-256 esperado. Después se relee el documento publicado para confirmar su presencia.
- **Registro:** si la publicación se comprobó antes del siguiente commit documental, se registra directamente como `vigente`. Si falta alguna comprobación, como `pendiente de verificación`.

## 6. Fallos e incidentes

| Situación | Actuación |
|---|---|
| `replaced: true` inesperado | 1) Detener toda escritura en el Proyecto. 2) Conservar la evidencia: respuesta completa, ruta, hora y archivo subido. 3) Determinar qué documento se sustituyó y si su contenido anterior existía como maestro en Git o como respaldo con hash verificado. 4) Solo ese contenido se puede recuperar con garantías; si no existía, se declara no recuperable, sin reconstruirlo. 5) Registrar el estado `incidente` en `indice.md` antes de cualquier intento de recuperación, que requiere autorización |
| Versión distinta de la esperada | La publicación queda `pendiente de verificación`. No se corrige sobrescribiendo: se publica de nuevo en otra ruta y la anterior pasa a `superada` |
| Error de contenido en una copia publicada | Se corrige el maestro, se hace un nuevo commit y se publica en una ruta nueva. No se elimina nada del Proyecto sin autorización |
| Dato sensible en un commit todavía no publicado | Se detiene la publicación y se decide su corrección con un plan y una autorización propios |
| Dato sensible en el historial ya publicado | Un secreto se considera comprometido y se rota de inmediato. Cualquier reescritura de la historia pública es una decisión aparte, y la exposición se registra |

## 7. Continuidad y recuperación

- Un maestro se recupera desde cualquier clon con `git show <commit>:docs/seguimiento/<archivo>`.
- Una copia de consulta solo se recupera con garantías si su contenido existe como maestro o respaldo verificable; `indice.md` vincula cada publicación con su origen.
- `sesiones_locales/` existe solo en el entorno local de desarrollo: nada imprescindible debe depender exclusivamente de ella.
- El repositorio y el Proyecto dependen de cuentas individuales. La transferencia a una cuenta u organización institucional es una decisión de gobernanza pendiente.

## 8. Documentos anteriores a G0

Se conservan como fuentes históricas de su periodo, sin migrarlos, reconstruirlos ni sustituirlos. `indice.md` los lista por nombre y ubicación. Cualquier depuración o rectificación se hace con documentos complementarios nuevos, no reescribiéndolos.
