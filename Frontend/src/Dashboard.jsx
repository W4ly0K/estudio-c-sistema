import React, { useEffect, useState } from 'react';
import logoEstudioC from './assets/Logo_Estudio_C_3-01.png'; // O el .svg si lo prefieres

export default function Dashboard({ usuario, onLogout }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // 1. Estado actualizado para hacer "match" con el DTO de NestJS y Prisma
  const [form, setForm] = useState({ 
    fecha: '', 
    horaInicio: '', 
    horaFin: '', 
    categoria: 'ESPACIOS', 
    proposito: '' 
  });
  const [errorValidacion, setErrorValidacion] = useState('');

  // Cargar solicitudes del usuario
  useEffect(() => {
    const fetchSolicitudes = async () => {
      try {
        const token = localStorage.getItem('estudio_c_token');
        const res = await fetch('http://localhost:3000/solicitudes/mis-solicitudes', {
          headers: { 
              'Content-Type': 'application/json', 
              'Authorization': `Bearer ${token}` 
}
        });
        if (res.ok) {
          const data = await res.json();
          setSolicitudes(data);
        }
      } catch (err) {
        console.error('Error cargando solicitudes:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSolicitudes();
  }, []);

  // 2. Validación Shift-Left mejorada y envío al backend
  const handleCrearSolicitud = async (e) => {
    e.preventDefault();
    setErrorValidacion('');

    const inicioNum = parseInt(form.horaInicio.replace(':', ''));
    const finNum = parseInt(form.horaFin.replace(':', ''));

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

    try {
      const token = localStorage.getItem('estudio_c_token');
      
      // 3. Transformar los datos visuales al formato ISO-8601 que exige NestJS (IsDate)
      const payload = {
        categoria: form.categoria,
        proposito: form.proposito,
        fecha_inicio: new Date(`${form.fecha}T${form.horaInicio}:00`).toISOString(),
        fecha_fin: new Date(`${form.fecha}T${form.horaFin}:00`).toISOString()
      };

      const res = await fetch('http://localhost:3000/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Error al registrar la solicitud');
      }
      
      const respuesta = await res.json();
      
      // Agregamos la solicitud nueva a la tabla visualmente
      setSolicitudes([respuesta.solicitud, ...solicitudes]);
      setShowModal(false);
      
      // Limpiamos el formulario
      setForm({ fecha: '', horaInicio: '', horaFin: '', categoria: 'ESPACIOS', proposito: '' });
      
    } catch (err) {
      // Si pasa un error desde el backend (ej. Array de validaciones), lo mostramos
      const mensajeError = Array.isArray(err.message) ? err.message.join(', ') : err.message;
      setErrorValidacion(mensajeError);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      {/* Header Institucional CESMAG - Intacto */}
      <header className="w-full bg-surface border-b border-outline px-8 py-3 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <img src={logoEstudioC} alt="Logo Estudio C" className="h-8" />
          <span className="font-bold text-primary border-l border-outline pl-4 tracking-wide">
            Panel de Solicitudes
          </span>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-sm font-bold text-primary">{usuario?.nombre}</p>
            <p className="text-xs text-gray-500">Rol: <span className="font-semibold text-accent">{usuario?.rol}</span></p>
          </div>
          <button onClick={onLogout} className="px-4 py-1.5 border border-outline rounded text-sm font-medium hover:bg-gray-50 text-primary transition-colors">
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
            className="px-5 py-2.5 bg-accent text-white rounded shadow-sm text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <span className="text-lg">+</span> Nueva Solicitud
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Cargando radicados...</p>
        ) : solicitudes.length === 0 ? (
          <div className="border border-outline rounded-lg p-8 text-center bg-surface">
            <p className="text-gray-500 text-sm">No tienes solicitudes registradas aún.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {solicitudes.map((sol) => (
              <div key={sol.radicado} className="border border-outline rounded-lg p-6 bg-surface shadow-sm relative hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start border-b border-outline pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs text-gray-500 font-bold tracking-wider">RADICADO</span>
                      <span className="text-lg font-black text-primary">{sol.radicado}</span>
                    </div>
                    <span className="inline-block px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-primary border border-gray-200">
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
                  className="w-full border border-outline rounded p-2 text-primary" 
                  value={form.categoria}
                  onChange={e => setForm({...form, categoria: e.target.value})}
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
                  rows="2"
                  className="w-full border border-outline rounded p-2 text-primary resize-none" 
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
                  className="w-full border border-outline rounded p-2 text-primary" 
                  value={form.fecha}
                  onChange={e => setForm({...form, fecha: e.target.value})} 
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-600 mb-1">Hora Inicio</label>
                  <input type="time" required className="w-full border border-outline rounded p-2 text-primary" value={form.horaInicio} onChange={e => setForm({...form, horaInicio: e.target.value})} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Hora Fin</label>
                  <input type="time" required className="w-full border border-outline rounded p-2 text-primary" value={form.horaFin} onChange={e => setForm({...form, horaFin: e.target.value})} />
                </div>
              </div>

              {errorValidacion && (
                <div className="p-3 mt-2 bg-red-50 border border-red-200 rounded text-xs font-bold text-accent">
                  {errorValidacion}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-outline rounded text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded font-bold hover:opacity-90">Enviar Radicado</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}