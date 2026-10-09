import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Configuración de pruebas separada de vite.config.ts: el build de producción no
// carga nada de Vitest. mergeConfig reutiliza los mismos plugins (React, Tailwind).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
      // Valores ficticios y fijos: las pruebas no dependen del .env.local de nadie
      // y el CI no necesita uno. entorno.ts los valida al importar App.
      env: {
        VITE_API_URL: 'http://api.prueba.local',
        VITE_GOOGLE_CLIENT_ID: 'client-id-de-prueba.apps.googleusercontent.com',
      },
    },
  }),
)
