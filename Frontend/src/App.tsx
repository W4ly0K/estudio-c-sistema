import { useState, type ReactNode } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import Dashboard from './Dashboard';
import logoEstudioC from './assets/Logo_Estudio_C_3-01.png';
import { textoDeError } from './api/errores';
import { useSesion } from './sesion/use-sesion';

export const TEXTO_VERIFICANDO = 'Verificando tu sesión…';
export const TEXTO_SIN_VERIFICAR =
  'No pudimos verificar tu sesión con el servidor. Tu sesión sigue guardada: intenta de nuevo en un momento.';

/** Marco común de las pantallas sin sesión (login, verificación y reintento). */
function PantallaCentrada({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans">
      <div className="bg-surface p-10 border border-outline rounded-xl shadow-md max-w-sm w-full text-center flex flex-col items-center">
        <img src={logoEstudioC} alt="Logo Estudio C" className="h-16 w-64 mx-auto mb-6 object-contain" />
        {children}
      </div>
    </div>
  );
}

function App() {
  const { sesion, api, iniciarSesion, cerrarSesion, reintentar } = useSesion();
  const [status, setStatus] = useState('');

  const handleLoginSuccess = async (credentialResponse: CredentialResponse) => {
    const credencial = credentialResponse.credential;
    if (credencial === undefined) {
      setStatus('❌ Google no entregó la credencial. Intenta de nuevo.');
      return;
    }

    setStatus('Autenticando...');
    const error = await iniciarSesion(credencial);
    // Mensaje del servidor tal cual (por ejemplo, el del dominio institucional).
    setStatus(error === null ? '' : `❌ ${textoDeError(error)}`);
  };

  const handleLogout = () => {
    setStatus('');
    cerrarSesion();
  };

  // Un render por estado de la máquina (DS3): el `switch` no deja estados sin pantalla.
  switch (sesion.estado) {
    case 'verificando':
      // Evita el parpadeo de la pantalla de login antes de saltar al panel.
      return (
        <PantallaCentrada>
          <p role="status" className="text-sm text-gray-500">{TEXTO_VERIFICANDO}</p>
        </PantallaCentrada>
      );

    case 'sin-conexion':
      return (
        <PantallaCentrada>
          <p role="alert" className="text-sm text-primary mb-6">{TEXTO_SIN_VERIFICAR}</p>
          <div className="flex gap-3">
            <button type="button" onClick={reintentar} className="px-4 py-2 bg-primary text-white rounded-sm font-bold hover:opacity-90">
              Reintentar
            </button>
            <button type="button" onClick={handleLogout} className="px-4 py-2 border border-outline rounded-sm text-gray-600 hover:bg-gray-50">
              Cerrar sesión
            </button>
          </div>
        </PantallaCentrada>
      );

    case 'autenticada':
      return <Dashboard usuario={sesion.usuario} onLogout={handleLogout} api={api.solicitudes} />;

    case 'anonima':
      break;
  }

  // Aviso de la máquina (sesión expirada) o resultado del último intento de login.
  const mensaje = status !== '' ? status : sesion.aviso === null ? '' : `⚠️ ${sesion.aviso}`;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans">
      <div className="bg-surface p-10 border border-outline rounded-xl shadow-md max-w-sm w-full text-center flex flex-col items-center">
        
        {/* Logo (Verifica que la ruta sea correcta) */}
        <img src={logoEstudioC} alt="Logo Estudio C" className="h-16 w-64 mx-auto mb-6 object-contain" />
        
        <h2 className="text-xl font-bold text-primary mb-1">Acceso al Sistema</h2>
        <p className="text-xs text-gray-500 mb-6">
          Inicia sesión exclusivamente con tu correo institucional CESMAG.
        </p>
        
        <div className="flex justify-center mb-4">
          <GoogleLogin
            onSuccess={handleLoginSuccess}
            onError={() => setStatus('❌ Error al conectar con Google')}
            useOneTap
            shape="rectangular"
            theme="outline"
          />
        </div>
        
        {mensaje && (
          <p className="mt-3 text-xs font-bold text-accent">{mensaje}</p>
        )}
      </div>
      
      <p className="mt-6 text-xs text-gray-400 font-medium">
        Universidad CESMAG · Ciencia y Servicio
      </p>
    </div>
  );
}

export default App;