# Incidente de R9-3 · Merge del PR #19 en `main` por error de base

| Campo | Valor |
|---|---|
| **Tipo** | Incidente de integración (G0 §6) |
| **Complementa a** | [`bitacora-r9-3-ampliacion-visual.md`](bitacora-r9-3-ampliacion-visual.md), que no se modifica |
| **Fecha** | 2026-11-24 (merge) · 2026-11-27 (reversión integrada) |
| **Estado** | Contenido de `main` restaurado; integración correcta en `develop` pendiente de autorización |

---

## 1. Hechos

| Fecha | Hecho | Commit |
|---|---|---|
| 2026-11-24 | El PR #19 (`feat/fase-9-identidad-v1a`, último commit `274e734`) se abrió con base `main` en lugar de `develop` y se fusionó antes de corregir el destino. La autorización era integrar solo en `develop` | `29f6132` (padres `860bfbf` y `274e734`) |
| 2026-11-25 | Reversión del merge, tomando como base el primer padre | `edffe3d` |
| 2026-11-27 | Integración de la reversión en `main` por el PR #20 | `ddeee6d` |

## 2. Alcance y efecto

- El merge incorporó a `main` 42 commits y 56 archivos: la gobernanza G0 (PR #15), la base de R9-3 (PR #18) y la ampliación visual (20 commits). Ningún archivo de `backend/`, ninguna migración y ningún cambio de configuración de despliegue.
- Tras el PR #20, el contenido de `main` es idéntico al de `860bfbf` (sin diferencias en `git diff`).
- El único workflow del repositorio (`ci.yml`) prueba y compila; no despliega. No hay despliegue asociado al incidente.
- `develop` no se vio afectado (`a5a74ed`) y la rama `feat/fase-9-identidad-v1a` se conservó intacta en `274e734`.
- El escudo permanece en el historial público de `main`; no se reescribe el historial. Su uso oficial sigue condicionado al visto bueno de Comunicaciones.

## 3. Advertencia para una futura integración de `develop` en `main`

Para Git, los 42 commits del PR #19 ya están integrados en `main` y el commit `edffe3d` los anula. **Antes de cualquier integración futura de `develop` en `main`, debe revisarse el efecto de esa reversión** (y, si corresponde, revertirla primero). Si no se hace, la gobernanza G0 y R9-3 quedarían fuera de `main` sin que el merge lo muestre.

Tampoco debe integrarse `main` en `develop` mientras contenga esa reversión: eliminaría de `develop` el trabajo revertido.

## 4. Medidas

- Integración correcta mediante un PR nuevo con base `develop` y compare `feat/fase-9-identidad-v1a`, verificando antes del merge el número de commits y de archivos.
- Recomendada: una regla de protección para `main` que exija PR y revisión antes del merge.
- Sin cambios en ADR-010, que permanece **Propuesto**.
