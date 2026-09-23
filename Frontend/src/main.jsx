import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Inyectamos tu credencial oficial generada en Google Cloud */}
    <GoogleOAuthProvider clientId="248777160383-7cea1m70ph6hukirat7e1v642avholkf.apps.googleusercontent.com">
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)