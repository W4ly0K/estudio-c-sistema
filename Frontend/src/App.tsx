import { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import Dashboard, { type UsuarioSesion } from './Dashboard';
import logoEstudioC from './assets/Logo_Estudio_C_3-01.png';
import { entorno } from './config/entorno';

// Tipo mínimo de la respuesta de POST /auth/google/login. El paso 6.1 lo
// reemplaza por el contrato tipado de src/api/.
interface RespuestaLogin {
  token: string;
  usuario: UsuarioSesion;
}


function App() {
  const [status, setStatus] = useState('');
  const [userData, setUserData] = useState<UsuarioSesion | null>(null);

  const handleLoginSuccess = async (credentialResponse: CredentialResponse) => {
    setStatus('Autenticando...');
    try {
      const res = await fetch(`${entorno.apiUrl}/auth/google/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential })
      });

      if (!res.ok) throw new Error('Acceso restringido a @unicesmag.edu.co');
      
      // Aserción temporal: 6.1 la reemplaza por apiFetch, que valida la respuesta.
      const data = (await res.json()) as RespuestaLogin;
      localStorage.setItem('estudio_c_token', data.token);
      setUserData(data.usuario);
      
    } catch (error) {
      console.error('Error:', error);
      setStatus("❌ " + (error instanceof Error ? error.message : 'Error desconocido'));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('estudio_c_token');
    setUserData(null);
    setStatus('');
  };

  if (userData) {
    return <Dashboard usuario={userData} onLogout={handleLogout} />;
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