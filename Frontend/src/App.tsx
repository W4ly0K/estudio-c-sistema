import { useCallback, useMemo, useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import Dashboard from './Dashboard';
import logoEstudioC from './assets/Logo_Estudio_C_3-01.png';
import { crearApi } from './api/crear-api';
import { TEXTO_SESION_EXPIRADA, textoDeError } from './api/errores';
import type { UsuarioSesion } from './api/esquemas';
import { borrarToken, guardarToken, leerToken } from './sesion/token';

function App() {
  const [status, setStatus] = useState('');
  const [userData, setUserData] = useState<UsuarioSesion | null>(null);

  // DC3: ante un 401 en cualquier ruta privada, el cliente llama aquí. La App es la
  // dueña de la sesión: borra el token y vuelve al login con un aviso.
  const expirarSesion = useCallback(() => {
    borrarToken();
    setUserData(null);
    setStatus(`⚠️ ${TEXTO_SESION_EXPIRADA}`);
  }, []);

  // Un solo cliente durante toda la vida de la App. Si se creara en cada render, el
  // efecto del Dashboard (que depende de la api) volvería a pedir las solicitudes en
  // un ciclo sin fin. useMemo + useCallback lo mantienen estable.
  const api = useMemo(
    () => crearApi({ obtenerToken: leerToken, alExpirarSesion: expirarSesion }),
    [expirarSesion],
  );

  const handleLoginSuccess = async (credentialResponse: CredentialResponse) => {
    const credencial = credentialResponse.credential;
    if (credencial === undefined) {
      setStatus('❌ Google no entregó la credencial. Intenta de nuevo.');
      return;
    }

    setStatus('Autenticando...');
    const resultado = await api.auth.loginConGoogle(credencial);
    if (!resultado.ok) {
      // Mensaje del servidor tal cual (por ejemplo, el del dominio institucional).
      setStatus(`❌ ${textoDeError(resultado.error)}`);
      return;
    }

    guardarToken(resultado.datos.token);
    setStatus('');
    setUserData(resultado.datos.usuario);
  };

  const handleLogout = () => {
    borrarToken();
    setUserData(null);
    setStatus('');
  };

  if (userData) {
    return <Dashboard usuario={userData} onLogout={handleLogout} api={api.solicitudes} />;
  }

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
        
        {status && (
          <p className="mt-3 text-xs font-bold text-accent">{status}</p>
        )}
      </div>
      
      <p className="mt-6 text-xs text-gray-400 font-medium">
        Universidad CESMAG · Ciencia y Servicio
      </p>
    </div>
  );
}

export default App;