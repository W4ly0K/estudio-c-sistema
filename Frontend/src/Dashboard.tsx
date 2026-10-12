import { useEffect, useState, type FormEvent } from 'react';
import logoEstudioC from './assets/Logo_Estudio_C_3-01.png'; // O el .svg si lo prefieres
import { textoDeError } from './api/errores';
import { CATEGORIAS, type Categoria, type SolicitudPropia, type UsuarioSesion } from './api/esquemas';
import type { ApiSolicitudes } from './api/solicitudes';

interface DashboardProps {
  usuario: UsuarioSesion;
  onLogout: () => void;
  /** Inyectada por la App (DC3): en las pruebas, una api falsa. */
  api: ApiSolicitudes;
}

interface FormularioSolicitud {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  categoria: Categoria;
  proposito: string;
}

const FORMULARIO_VACIO: FormularioSolicitud = { fecha: '', horaInicio: '', horaFin: '', categoria: 'ESPACIOS', proposito: '' };

export default function Dashboard({ usuario, onLogout, api }: DashboardProps) {
  const [solicitudes, setSolicitudes] = useState<SolicitudPropia[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormularioSolicitud>(FORMULARIO_VACIO);
  const [errorValidacion, setErrorValidacion] = useState('');

  // Cargar solicitudes del usuario. `vigente` descarta la respuesta si el componente
  // se desmontó o el efecto se repitió (StrictMode lo ejecuta dos veces en desarrollo).
  useEffect(() => {
    let vigente = true;
    void api.misSolicitudes().then((resultado) => {
      if (!vigente) return;
      if (resultado.ok) {
        setSolicitudes(resultado.datos);
      } else {
        // Antes un error se veía como "No tienes solicitudes": ahora se dice qué pasó.
        setErrorCarga(textoDeError(resultado.error));
      }
      setLoading(false);
    });
    return () => {
      vigente = false;
    };
  }, [api]);

  // 2. Validación Shift-Left mejorada y envío al backend
  const handleCrearSolicitud = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorValidacion('');

    const inicioNum = parseInt(form.horaInicio.replace(':', ''), 10);
    const finNum = parseInt(form.horaFin.replace(':', ''), 10);

    // Shift-Left A: Validar coherencia temporal
    if (inicioNum >= finNum) {
      setErrorValidacion('⚠️ La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }

    // Shift-Left B: Bloque institucional estricto 12:00 - 14:00
    // Bloquea si empieza durante el almuerzo, si termina durante el almuerzo, o si abarca todo el almuerzo
    if ((inicioNum >= 1200 && inicioNum < 1400) || (finNum > 1200 && finNum <= 1400) || (inicioNum <= 1200 && finNum >= 1400)) {
      setErrorValidacion('⚠️ Regla CA-04: No se permiten reservas cruzando el horario de almuerzo institucional (12:00 - 14:00).');
      return;
    }

    // F2 (zona horaria) se corrige en el paso 6.3: aquí solo cambia el transporte.
    const resultado = await api.crear({
      categoria: form.categoria,
      proposito: form.proposito,
      fecha_inicio: new Date(`${form.fecha}T${form.horaInicio}:00`).toISOString(),
      fecha_fin: new Date(`${form.fecha}T${form.horaFin}:00`).toISOString(),
    });

    if (!resultado.ok) {
      // Mensajes del servidor tal cual (CA-04, CA-06...); una sesión vencida ya la cerró la App.
      setErrorValidacion(textoDeError(resultado.error));
      return;
    }

    // POST /solicitudes responde la solicitud sin la relación de recursos; este
    // formulario tampoco los envía.
    setSolicitudes((anteriores) => [{ ...resultado.datos, recursos: [] }, ...anteriores]);
    setShowModal(false);
    setForm(FORMULARIO_VACIO);
  };

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      {/* Header Institucional CESMAG - Intacto */}
      <header className="w-full bg-surface border-b border-outline px-8 py-3 flex justify-between items-center sticky top-0 z-50 shadow-xs">
        <div className="flex items-center gap-4">
          <img src={logoEstudioC} alt="Logo Estudio C" className="h-8" />
          <span className="font-bold text-primary border-l border-outline pl-4 tracking-wide">
            Panel de Solicitudes
          </span>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-sm font-bold text-primary">{usuario.nombre}</p>
            <p className="text-xs text-gray-500">Rol: <span className="font-semibold text-accent">{usuario.rol}</span></p>
          </div>
          <button onClick={onLogout} className="px-4 py-1.5 border border-outline rounded-sm text-sm font-medium hover:bg-gray-50 text-primary transition-colors">
            Salir
          </button>
        </div>
      </header>

      {/* Área de Trabajo - Tabla Intacta */}
      <main className="flex-1 p-8 max-w-[1200px] mx-auto w-full">
        <div className="flex justify-between items-end border-b border-outline pb-4 mb-8">
          <div>
            <h2 className="text-2xl font-black text-primary">Historial de Radicados</h2>
            <p className="text-sm text-gray-600 mt-1">Seguimiento de tus reservas de espacios y equipos.</p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="px-5 py-2.5 bg-accent text-white rounded-sm shadow-xs text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <span className="text-lg">+</span> Nueva Solicitud
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Cargando radicados...</p>
        ) : errorCarga ? (
          <p role="alert" className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm font-bold text-accent">
            {errorCarga}
          </p>
        ) : solicitudes.length === 0 ? (
          <div className="border border-outline rounded-lg p-8 text-center bg-surface">
            <p className="text-gray-500 text-sm">No tienes solicitudes registradas aún.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {solicitudes.map((sol) => (
              <div key={sol.radicado} className="border border-outline rounded-lg p-6 bg-surface shadow-xs relative hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start border-b border-outline pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs text-gray-500 font-bold tracking-wider">RADICADO</span>
                      <span className="text-lg font-black text-primary">{sol.radicado}</span>
                    </div>
                    <span className="inline-block px-2.5 py-1 rounded-sm text-xs font-medium bg-gray-100 text-primary border border-gray-200">
                      {sol.categoria}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-white">
                    {sol.estado}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 mb-0.5">Fecha y Horario</p>
                    <p className="font-medium text-primary">
                      {new Date(sol.fecha_inicio).toLocaleDateString()} <br/>
                      ({new Date(sol.fecha_inicio).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(sol.fecha_fin).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">Propósito</p>
                    <p className="font-medium text-primary line-clamp-2">{sol.proposito}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Nueva Solicitud (B2) - Actualizado al esquema Prisma */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-outline rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-bold text-primary mb-4">Nueva Solicitud · Estudio C</h3>
            
            <form onSubmit={handleCrearSolicitud} className="space-y-4 text-sm">
              
              <div>
                <label className="block text-gray-600 mb-1">Categoría</label>
                <select 
                  required 
                  className="w-full border border-outline rounded-sm p-2 text-primary" 
                  value={form.categoria}
                  onChange={e => {
                    // Sin aserción: solo se acepta un valor que esté en el contrato.
                    const categoria = CATEGORIAS.find((c) => c === e.target.value);
                    if (categoria) setForm({ ...form, categoria });
                  }}
                >
                  <option value="ESPACIOS">Reserva de Espacios</option>
                  <option value="PODCAST">Producción de Podcast</option>
                  <option value="VIDEO">Producción de Video</option>
                  <option value="STREAMING">Transmisión (Streaming)</option>
                  <option value="ASESORIAS">Asesoría Técnica</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Propósito de la reserva</label>
                <textarea 
                  required 
                  rows={2}
                  className="w-full border border-outline rounded-sm p-2 text-primary resize-none" 
                  placeholder="Describe brevemente el uso..."
                  value={form.proposito}
                  onChange={e => setForm({...form, proposito: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Fecha</label>
                <input 
                  type="date" 
                  required 
                  min={new Date().toISOString().split('T')[0]} // Bloquea días pasados en UI
                  className="w-full border border-outline rounded-sm p-2 text-primary" 
                  value={form.fecha}
                  onChange={e => setForm({...form, fecha: e.target.value})} 
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-600 mb-1">Hora Inicio</label>
                  <input type="time" required className="w-full border border-outline rounded-sm p-2 text-primary" value={form.horaInicio} onChange={e => setForm({...form, horaInicio: e.target.value})} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Hora Fin</label>
                  <input type="time" required className="w-full border border-outline rounded-sm p-2 text-primary" value={form.horaFin} onChange={e => setForm({...form, horaFin: e.target.value})} />
                </div>
              </div>

              {errorValidacion && (
                <div className="p-3 mt-2 bg-red-50 border border-red-200 rounded-sm text-xs font-bold text-accent">
                  {errorValidacion}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline rounded-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-sm font-bold hover:opacity-90">Enviar Radicado</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}