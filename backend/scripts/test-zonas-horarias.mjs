/**
 * Ejecuta las pruebas de `src/solicitudes/reglas` una vez por zona horaria.
 *
 * Por qué existe (Fase 3, Decisión D-K): Jest entrega a cada suite una COPIA
 * de `process.env`, así que asignar `process.env.TZ` dentro de una prueba no
 * cambia la zona del proceso. La única forma fiable es fijar `TZ` en el
 * entorno ANTES de que arranque Jest. Este lanzador lo hace sin dependencias
 * (no requiere cross-env) y funciona igual en Windows, Linux y CI.
 *
 * Uso: npm run test:tz
 */
import { spawnSync } from 'node:child_process';

const ZONAS = [
  'UTC',
  'America/Bogota',
  'Pacific/Pago_Pago', // UTC−11: la medianoche UTC todavía es "ayer"
  'Pacific/Kiritimati', // UTC+14: el otro extremo
];

for (const zona of ZONAS) {
  console.log(`\n▶ Pruebas de reglas con TZ=${zona}`);
  const resultado = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      './node_modules/jest/bin/jest.js',
      'src/solicitudes/reglas',
    ],
    { stdio: 'inherit', env: { ...process.env, TZ: zona } },
  );

  if (resultado.error) {
    console.error(`✖ No se pudo iniciar Jest con TZ=${zona}:`, resultado.error);
    process.exit(1);
  }
  if (resultado.status !== 0) {
    console.error(`✖ Las pruebas fallaron con TZ=${zona}`);
    process.exit(resultado.status ?? 1);
  }
}

console.log(`\n✔ Reglas verificadas en ${ZONAS.length} zonas horarias.`);
