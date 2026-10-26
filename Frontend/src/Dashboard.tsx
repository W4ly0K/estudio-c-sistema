import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { textoDeError } from './api/errores';
import {
  CATEGORIAS,
  type Categoria,
  type Solicitud,
  type SolicitudPropia,
  type SubEspacio,
  type UsuarioSesion,
} from './api/esquemas';
import { useApi } from './api/contexto-api';
import { CampoSubEspacio, TEXTO_ELIGE_SUB_ESPACIO, TEXTO_LEYENDA_SUB_ESPACIO } from './componentes/CampoSubEspacio';
import { CamposFranja } from './componentes/CamposFranja';
import { Encabezado } from './componentes/Encabezado';
import { ExitoRadicado } from './componentes/ExitoRadicado';
import { TarjetaSolicitud } from './componentes/TarjetaSolicitud';
import { ETIQUETAS_CATEGORIA } from './presentacion/etiquetas';
import { FRANJA_VACIA, franjaDesdeCampos, type ValoresFranja } from './presentacion/franja';
import { resumirSolicitudes, textoPorDecidir, textoResumen } from './presentacion/resumen';

interface DashboardProps {
  usuario: UsuarioSesion;
  onLogout: () => void;
}

interface FormularioSolicitud {
  /** Fecha y horas: campos y reglas compartidos con C4 (6.5.4a · presentacion/franja). */
  franja: ValoresFranja;
  categoria: Categoria;
  proposito: string;
  /** Fase 7 · Q-A4: lo PROPONE el solicitante; sin valor inicial para no elegir por él. */
  subEspacio: SubEspacio | null;
}

const FORMULARIO_VACIO: FormularioSolicitud = {
  franja: FRANJA_VACIA,
  categoria: 'ESPACIOS',
  proposito: '',
  subEspacio: null,
};

/**
 * Qué muestra el diálogo. Una unión discriminada en lugar de dos estados sueltos
 * (`abierto` + `creada`): así no existe la combinación imposible "cerrado pero con éxito".
 */
type EstadoDialogo =
  | { readonly vista: 'cerrado' }
  | { readonly vista: 'formulario' }
  | { readonly vista: 'exito'; readonly solicitud: Solicitud };

const DIALOGO_CERRADO: EstadoDialogo = { vista: 'cerrado' };

export default function Dashboard({ usuario, onLogout }: DashboardProps) {
  // DV1: la api llega por Context (en las pruebas, una api falsa en el proveedor).
  const api = useApi();
  // DV6: ids únicos para asociar cada etiqueta con su campo (y el diálogo con su título).
  const id = useId();
  const ids = {
    titulo: `${id}-titulo`,
    categoria: `${id}-categoria`,
    proposito: `${id}-proposito`,
  };
  const [solicitudes, setSolicitudes] = useState<SolicitudPropia[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [dialogo, setDialogo] = useState<EstadoDialogo>(DIALOGO_CERRADO);
  const abierto = dialogo.vista !== 'cerrado';
  // Modal NATIVO (DV6): el navegador captura el foco, cierra con Escape y vuelve inerte el fondo.
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormularioSolicitud>(FORMULARIO_VACIO);
  const [errorValidacion, setErrorValidacion] = useState('');

  // Una sola fuente de verdad: el estado `dialogo` manda y el <dialog> lo obedece.
  // Guardas con `open`: `showModal()` nativo lanza InvalidStateError si ya está abierto.
  // Pasar de formulario a éxito no cambia `abierto`: el diálogo sigue abierto y solo
  // cambia su contenido.
  useEffect(() => {
    const elemento = dialogoRef.current;
    if (elemento === null) return;
    if (abierto && !elemento.open) elemento.showModal();
    if (!abierto && elemento.open) elemento.close();
  }, [abierto]);

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

    // DH1 y DH4: las mismas dos reglas de siempre, ahora en franjaDesdeCampos (6.5.4a).
    const franja = franjaDesdeCampos(form.franja);
    if (!franja.ok) {
      setErrorValidacion(franja.error);
      return;
    }
    // Fase 7: el navegador ya lo exige (`required`); esta guarda es la defensa en profundidad
    // y lo que le permite a TypeScript enviar un SubEspacio y no un null.
    if (form.subEspacio === null) {
      setErrorValidacion(TEXTO_ELIGE_SUB_ESPACIO);
      return;
    }

    const resultado = await api.crear({
      categoria: form.categoria,
      proposito: form.proposito,
      fecha_inicio: franja.inicio,
      fecha_fin: franja.fin,
      sub_espacio: form.subEspacio,
    });

    if (!resultado.ok) {
      // Mensajes del servidor tal cual (CA-04, CA-06...); una sesión vencida ya la cerró la App.
      setErrorValidacion(textoDeError(resultado.error));
      return;
    }

    // POST /solicitudes responde la solicitud sin la relación de recursos; este
    // formulario tampoco los envía.
    setSolicitudes((anteriores) => [{ ...resultado.datos, recursos: [] }, ...anteriores]);
    // B1b: el radicado se muestra en el mismo diálogo, con el aviso de urgencia si aplica.
    setDialogo({ vista: 'exito', solicitud: resultado.datos });
    setForm(FORMULARIO_VACIO);
  };

  const resumen = resumirSolicitudes(solicitudes);
  const avisoPorDecidir = textoPorDecidir(resumen);

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Encabezado usuario={usuario} onLogout={onLogout} titulo="Panel de Solicitudes" />

      {/* Área de Trabajo - Tabla Intacta */}
      <main className="flex-1 p-8 max-w-[1200px] mx-auto w-full">
        <div className="flex justify-between items-end border-b border-outline pb-4 mb-8">
          <div>
            <h2 className="text-2xl font-black text-primary">Historial de Radicados</h2>
            <p className="text-sm text-gray-600 mt-1">
              {!loading && !errorCarga && solicitudes.length > 0
                ? textoResumen(resumen)
                : 'Seguimiento de tus reservas de espacios y equipos.'}
            </p>
          </div>
          <button 
            onClick={() => setDialogo({ vista: 'formulario' })}
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
            {/* Wireframe B1 · intervención inmediata: lo que espera al solicitante, arriba. */}
            {avisoPorDecidir !== null && (
              <p className="p-3 border border-dotted border-gray-500 rounded-sm bg-gray-50 text-sm font-bold text-primary">
                <span aria-hidden="true">↻ </span>
                {avisoPorDecidir}
              </p>
            )}
            {solicitudes.map((sol) => (
              <TarjetaSolicitud key={sol.radicado} solicitud={sol} />
            ))}
          </div>
        )}
      </main>

      {/* Diálogo B2 (formulario) y B1b (éxito). Siempre montado: `showModal()` necesita el
          elemento. El contenido solo existe abierto, así un diálogo cerrado no deja campos
          ocultos en el DOM. `onClose` recoge TODO cierre (Escape, Cancelar, Volver al panel)
          y lo devuelve al estado de React. */}
      <dialog
        ref={dialogoRef}
        onClose={() => setDialogo(DIALOGO_CERRADO)}
        aria-labelledby={ids.titulo}
        className="m-auto w-[calc(100%-2rem)] max-w-md bg-surface border border-outline rounded-xl p-6 shadow-xl backdrop:bg-black/50"
      >
        {dialogo.vista === 'exito' && (
          <ExitoRadicado
            solicitud={dialogo.solicitud}
            responsable={usuario.nombre}
            idTitulo={ids.titulo}
            onVolver={() => setDialogo(DIALOGO_CERRADO)}
          />
        )}
        {dialogo.vista === 'formulario' && (
          <>
            <h3 id={ids.titulo} className="text-lg font-bold text-primary mb-4">Nueva Solicitud · Estudio C</h3>
            
            <form onSubmit={handleCrearSolicitud} className="space-y-4 text-sm">
              
              <div>
                <label htmlFor={ids.categoria} className="block text-gray-600 mb-1">Categoría</label>
                <select 
                  id={ids.categoria}
                  required 
                  className="w-full border border-outline rounded-sm p-2 text-primary" 
                  value={form.categoria}
                  onChange={e => {
                    // Sin aserción: solo se acepta un valor que esté en el contrato.
                    const categoria = CATEGORIAS.find((c) => c === e.target.value);
                    if (categoria) setForm({ ...form, categoria });
                  }}
                >
                  {CATEGORIAS.map((categoria) => (
                    <option key={categoria} value={categoria}>{ETIQUETAS_CATEGORIA[categoria]}</option>
                  ))}
                </select>
              </div>

              {/* Fase 7 · PRD v2.2 §4.1: dónde se hará la actividad (lo puede ajustar el Staff al validar). */}
              <CampoSubEspacio
                leyenda={TEXTO_LEYENDA_SUB_ESPACIO}
                valor={form.subEspacio}
                onCambio={(subEspacio) => setForm({ ...form, subEspacio })}
              />

              <div>
                <label htmlFor={ids.proposito} className="block text-gray-600 mb-1">Propósito de la reserva</label>
                <textarea 
                  id={ids.proposito}
                  required 
                  rows={2}
                  className="w-full border border-outline rounded-sm p-2 text-primary resize-none" 
                  placeholder="Describe brevemente el uso..."
                  value={form.proposito}
                  onChange={e => setForm({...form, proposito: e.target.value})}
                />
              </div>

              <CamposFranja valores={form.franja} onCambio={(franja) => setForm({ ...form, franja })} ahora={new Date()} />

              {errorValidacion && (
                <div className="p-3 mt-2 bg-red-50 border border-red-200 rounded-sm text-xs font-bold text-accent">
                  {errorValidacion}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setDialogo(DIALOGO_CERRADO)} className="px-4 py-2 border border-outline rounded-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-sm font-bold hover:opacity-90">Enviar Radicado</button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </div>
  );
}