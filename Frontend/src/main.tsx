import { GoogleOAuthProvider } from '@react-oauth/google'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { entorno } from './config/entorno'
// Roboto autoalojada (ADR-010, 9.3.1): solo pesos 400, 500, 700 y 900,
// subconjuntos latin y latin-ext; ninguna petición a Google Fonts.
// Estos CSS no declaran unicode-range: latin-ext va primero para que la
// cara latin, declarada después, sea la que el navegador pruebe primero.
import '@fontsource/roboto/latin-ext-400.css'
import '@fontsource/roboto/latin-ext-500.css'
import '@fontsource/roboto/latin-ext-700.css'
import '@fontsource/roboto/latin-ext-900.css'
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'
import '@fontsource/roboto/latin-900.css'
import './index.css'

const contenedor = document.getElementById('root')
if (!contenedor) {
  throw new Error('No se encontró el elemento #root en index.html.')
}

createRoot(contenedor).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={entorno.googleClientId}>
      {/* DV1: el router envuelve la App; en las pruebas, MemoryRouter. */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GoogleOAuthProvider>
  </StrictMode>,
)
