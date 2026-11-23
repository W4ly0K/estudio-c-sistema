import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { textoDeError } from './api/errores';
import {
  CATEGORIAS,
  CATEGORIA_QUE_ELIGE_SUB_ESPACIO,
  type Categoria,
  type Solicitud,
  type SolicitudPropia,
  type SubEspacio,
  type UsuarioSesion,
} from './api/esquemas';
import { ADMITE_ANEXO, admiteAnexo } from './api/categorias';
import { useApi } from './api/contexto-api';
import type { CuerpoCrearSolicitud } from './api/solicitudes';
import {
  CampoSubEspacio,
  TEXTO_ELIGE_SUB_ESPACIO,
  TEXTO_LEYENDA_SUB_ESPACIO,
  TEXTO_LUGAR_DE_SERVICIOS,
} from './componentes/CampoSubEspacio';
import { CampoEnlace } from './componentes/CampoEnlace';
import { CamposFranja } from './componentes/CamposFranja';
import { Encabezado } from './componentes/Encabezado';
import { ExitoRadicado } from './componentes/ExitoRadicado';
import { TarjetaSolicitud } from './componentes/TarjetaSolicitud';
import {
  anexoParaEnviar,
  anexoSegunCategoria,
  TEXTO_ANEXO_INVALIDO,
  TEXTO_AYUDA_ANEXO,
  TEXTO_ETIQUETA_ANEXO,
} from './presentacion/anexo';
import { ETIQUETAS_CATEGORIA } from './presentacion/etiquetas';
import { FRANJA_VACIA, franjaDesdeCampos, type ValoresFranja } from './presentacion/franja';
import { resumirSolicitudes, textoPorDecidir, textoResumen } from './presentacion/resumen';
import { CajaError } from './componentes/CajaError';

interface DashboardProps {
  usuario: UsuarioSesion;
  onLogout: () => void;
}

interface FormularioSolicitud {
  /** Fecha y horas: campos y reglas compartidos con C4 (6.5.4a · presentacion/franja). */
  franja: ValoresFranja;
  categoria: Categoria;
  proposito: string;
  /**
   * Fase 7 · Q-A4 y SE10: lo PROPONE el solicitante, solo en una solicitud de espacio físico;
   * sin valor inicial para no elegir por él. Fuera de esa categoría siempre es null.
   */
  subEspacio: SubEspacio | null;
  /**
   * Fase 9 · R9-1: enlace opcional al guion; vacío = sin anexo (la clave no viaja). Fase 9 · AN2b
   * (K2): solo en PODCAST, VIDEO y STREAMING. Al pasar a ESPACIOS o ASESORIAS se BORRA (como el
   * lugar en SE10); entre categorías que lo admiten se conserva.
   */
  anexo: string;
}

const FORMULARIO_VACIO: FormularioSolicitud = {
  franja: FRANJA_VACIA,
  categoria: 'ESPACIOS',
  proposito: '',
  subEspacio: null,
  anexo: '',
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
    lugarDeServicios: `${id}-lugar-servicios`,
  };
  const [solicitudes, setSolicitudes] = useState<SolicitudPropia[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [dialogo, setDialogo] = useState<EstadoDialogo>(DIALOGO_CERRADO);
  const abierto = dialogo.vista !== 'cerrado';
  // Modal NATIVO (DV6): el navegador captura el foco, cierra con Escape y vuelve inerte el fondo.
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormularioSolicitud>(FORMULARIO_VACIO);
  const eligeLugar = form.categoria === CATEGORIA_QUE_ELIGE_SUB_ESPACIO;
  // Fase 9 · AN2b (K2): el campo del anexo solo existe en las categorías que lo admiten.
  const pideAnexo = ADMITE_ANEXO[form.categoria];
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
    // Fase 9 · R9-1 y AN2b (K2): el anexo se valida con la misma regla con la que se pinta
    // (esEnlaceSeguro), y solo en las categorías que lo admiten: un texto residual en ESPACIOS o
    // ASESORIAS no se valida ni viaja.
    const anexo = anexoSegunCategoria(form.categoria, form.anexo);
    if (!anexo.ok) {
      setErrorValidacion(anexo.error);
      return;
    }
    const comun = {
      proposito: form.proposito,
      fecha_inicio: franja.inicio,
      fecha_fin: franja.fin,
    };
    const { categoria } = form;
    let cuerpo: CuerpoCrearSolicitud;
    // Fase 7 · SE10 y Fase 9 · AN2b: la rama decide también el tipo. TypeScript no deja enviar un
    // servicio con lugar, un espacio sin él, ni un anexo en ESPACIOS o ASESORIAS.
    if (categoria === CATEGORIA_QUE_ELIGE_SUB_ESPACIO) {
      // El navegador ya lo exige (`required`); esta guarda es la defensa en profundidad y lo
      // que le permite a TypeScript enviar un SubEspacio y no un null.
      if (form.subEspacio === null) {
        setErrorValidacion(TEXTO_ELIGE_SUB_ESPACIO);
        return;
      }
      cuerpo = { ...comun, categoria, sub_espacio: form.subEspacio };
    } else if (admiteAnexo(categoria)) {
      // Sin anexo, la clave no viaja: el servidor rechaza la cadena vacía (DTO ⊆ CHECK).
      cuerpo = { ...comun, categoria, ...(anexo.enlace === undefined ? {} : { enlace_anexo: anexo.enlace }) };
    } else {
      cuerpo = { ...comun, categoria };
    }

    const resultado = await api.crear(cuerpo);

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
        <div className="flex justify-between items-end border-b border-borde-suave pb-4 mb-8">
          <div>
            <h2 className="text-2xl font-black text-primary">Historial de Radicados</h2>
            <p className="text-sm text-texto-secundario mt-1">
              {!loading && !errorCarga && solicitudes.length > 0
                ? textoResumen(resumen)
                : 'Seguimiento de tus reservas de espacios y equipos.'}
            </p>
          </div>
          <button 
            onClick={() => setDialogo({ vista: 'formulario' })}
            className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-surface rounded-sm shadow-xs text-sm font-bold flex items-center gap-2 transition-colors"
          >
            <span className="text-lg">+</span> Nueva Solicitud
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-texto-secundario">Cargando radicados...</p>
        ) : errorCarga ? (
          <CajaError className="text-sm font-bold">
            {errorCarga}
          </CajaError>
        ) : solicitudes.length === 0 ? (
          <div className="border border-borde-suave rounded-lg p-8 text-center bg-surface">
            <p className="text-texto-secundario text-sm">No tienes solicitudes registradas aún.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Wireframe B1 · intervención inmediata: lo que espera al solicitante, arriba. */}
            {avisoPorDecidir !== null && (
              <p className="p-3 border border-dotted border-borde-control rounded-sm bg-superficie-suave text-sm font-bold text-primary">
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
        className="m-auto w-[calc(100%-2rem)] max-w-md bg-surface border border-borde-suave rounded-xl p-6 shadow-xl backdrop:bg-black/50"
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
                <label htmlFor={ids.categoria} className="block text-texto-secundario mb-1">Categoría</label>
                <select 
                  id={ids.categoria}
                  required 
                  className="w-full border border-borde-control rounded-sm p-2 text-primary" 
                  value={form.categoria}
                  // SE10: en un servicio, el texto que explica el lugar describe la categoría elegida.
                  aria-describedby={eligeLugar ? undefined : ids.lugarDeServicios}
                  onChange={e => {
                    // Sin aserción: solo se acepta un valor que esté en el contrato.
                    const categoria = CATEGORIAS.find((c) => c === e.target.value);
                    // SE10: al salir de "espacio físico" la elección se BORRA: un lugar elegido antes
                    // no viaja oculto, y volver a esa categoría pide elegir de nuevo.
                    if (!categoria) return;
                    // AN2b (K2 · DK2-2 y DK2-5): hacia ESPACIOS o ASESORIAS el anexo se borra sin
                    // aviso; entre categorías que lo admiten se conserva.
                    const conservaAnexo = ADMITE_ANEXO[categoria];
                    setForm({ ...form, categoria, subEspacio: null, anexo: conservaAnexo ? form.anexo : '' });
                    // DK2-3: si se descarta, su aviso local también; los demás mensajes se conservan.
                    if (!conservaAnexo) {
                      setErrorValidacion((actual) => (actual === TEXTO_ANEXO_INVALIDO ? '' : actual));
                    }
                  }}
                >
                  {CATEGORIAS.map((categoria) => (
                    <option key={categoria} value={categoria}>{ETIQUETAS_CATEGORIA[categoria]}</option>
                  ))}
                </select>
              </div>

              {/* Fase 7 · SE10: el lugar solo se elige en una solicitud de espacio físico (lo puede
                  ajustar el Staff al validar); en un servicio se explica qué reserva el Estudio C. */}
              {eligeLugar ? (
                <CampoSubEspacio
                  leyenda={TEXTO_LEYENDA_SUB_ESPACIO}
                  valor={form.subEspacio}
                  onCambio={(subEspacio) => setForm({ ...form, subEspacio })}
                />
              ) : (
                <p id={ids.lugarDeServicios} className="text-xs text-texto-secundario">
                  {TEXTO_LUGAR_DE_SERVICIOS}
                </p>
              )}

              <div>
                <label htmlFor={ids.proposito} className="block text-texto-secundario mb-1">Propósito de la reserva</label>
                <textarea 
                  id={ids.proposito}
                  required 
                  rows={2}
                  className="w-full border border-borde-control rounded-sm p-2 text-primary resize-none" 
                  placeholder="Describe brevemente el uso..."
                  value={form.proposito}
                  onChange={e => setForm({...form, proposito: e.target.value})}
                />
              </div>

              {/* Fase 9 · R9-1: anexo opcional (guion); la ayuda explica cómo compartirlo (AN15).
                  AN2b (K2): solo en PODCAST, VIDEO y STREAMING. */}
              {pideAnexo && (
                <CampoEnlace
                  etiqueta={TEXTO_ETIQUETA_ANEXO}
                  ayuda={TEXTO_AYUDA_ANEXO}
                  valor={form.anexo}
                  onCambio={(anexo) => setForm({ ...form, anexo })}
                  invalido={!anexoParaEnviar(form.anexo).ok}
                  soloLectura={false}
                />
              )}

              <CamposFranja valores={form.franja} onCambio={(franja) => setForm({ ...form, franja })} ahora={new Date()} />

              {/* R9-3 (D-R3-3): antes esta caja no tenía role="alert" y un rechazo al radicar (CA-04, CA-06,
                  anexo, sub-espacio) no se anunciaba. Ningún campo del formulario anuncia su propio error:
                  la alerta no se duplica. */}
              {errorValidacion && (
                <CajaError className="mt-2 text-xs font-bold">
                  {errorValidacion}
                </CajaError>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setDialogo(DIALOGO_CERRADO)} className="px-4 py-2 border border-borde-control rounded-sm text-texto-secundario hover:bg-superficie-suave">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-primary text-surface rounded-sm font-bold hover:opacity-90">Enviar Radicado</button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </div>
  );
}