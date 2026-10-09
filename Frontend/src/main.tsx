import { GoogleOAuthProvider } from '@react-oauth/google'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { entorno } from './config/entorno'
import './index.css'

const contenedor = document.getElementById('root')
if (!contenedor) {
  throw new Error('No se encontró el elemento #root en index.html.')
}

createRoot(contenedor).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={entorno.googleClientId}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
