import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Configuración de pruebas separada de vite.config.ts: el build de producción no
// carga nada de Vitest. mergeConfig reutiliza los mismos plugins (React, Tailwind).
export default mergeConfig(
  viteConfig,
  defineConfig({
    // La prueba de deriva (src/api/contrato.test.ts) lee archivos de ../backend con
    // ?raw: se permite leer desde la raíz del repositorio, solo en las pruebas.
    server: { fs: { allow: ['..'] } },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
      // Fase 8 · tema.test.ts lee el tema real con ?raw. Vitest reemplaza todo CSS por '' salvo lo
      // que liste css.include: se habilita SOLO la lectura cruda de index.css (Tailwind ignora las
      // consultas ?raw, así que llega el texto sin compilar), no la hoja que importa la aplicación.
      css: { include: [/\/src\/index\.css\?raw$/] },
      // Valores ficticios y fijos: las pruebas no dependen del .env.local de nadie
      // y el CI no necesita uno. entorno.ts los valida al importar App.
      env: {
        VITE_API_URL: 'http://api.prueba.local',
        VITE_GOOGLE_CLIENT_ID: 'client-id-de-prueba.apps.googleusercontent.com',
      },
    },
  }),
)
