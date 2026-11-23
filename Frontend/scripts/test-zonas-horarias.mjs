// Fase 6.3 · DH5: repite TODA la suite de Vitest en cuatro zonas horarias.
// Método del backend (backend/scripts/test-zonas-horarias.mjs): en un equipo en Bogotá,
// un error de zona horaria no se ve; en UTC o en UTC+14, sí.
// Es un script de Node y no `TZ=UTC vitest` porque npm en Windows ejecuta los scripts
// con cmd.exe, que no entiende esa sintaxis.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ZONAS = ['UTC', 'America/Bogota', 'Pacific/Pago_Pago', 'Pacific/Kiritimati']
const VITEST = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))

/** Precondición: el proceso hijo de verdad corre en esa zona (si no, el verde sería falso). */
function zonaEfectiva(zona) {
  const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)'], {
    env: { ...process.env, TZ: zona },
    encoding: 'utf8',
  })
  return r.stdout
}

const fallidas = []
for (const zona of ZONAS) {
  const efectiva = zonaEfectiva(zona)
  if (efectiva !== zona) {
    console.error(`\n✘ ${zona}: el proceso no tomó la zona (resultó "${efectiva}"). La prueba no sería válida.`)
    fallidas.push(zona)
    continue
  }
  console.log(`\n━━━ Vitest con TZ=${zona} ━━━`)
  const r = spawnSync(process.execPath, [VITEST, 'run'], { stdio: 'inherit', env: { ...process.env, TZ: zona } })
  if (r.status !== 0) fallidas.push(zona)
}

console.log(
  fallidas.length === 0
    ? `\n✔ La suite pasó en las ${ZONAS.length} zonas: ${ZONAS.join(', ')}`
    : `\n✘ Falló en: ${fallidas.join(', ')}`,
)
process.exit(fallidas.length === 0 ? 0 : 1)
