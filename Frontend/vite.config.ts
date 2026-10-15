import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tailwind v4 se integra como plugin de Vite: ya no usa PostCSS,
// autoprefixer ni tailwind.config.js. El tema vive en src/index.css (@theme).
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
