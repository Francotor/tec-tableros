import { useCallback, useEffect, useRef, useState } from 'react';
import { combinarProyectos, crearRespaldo, parsearRespaldo } from '../core/proyectos';
import type { Proyecto } from '../core/modelo';
import { combinarPlantillas } from '../core/plantillas';
import type { Plantilla } from '../core/plantillas';
import {
  abrirProyecto,
  crearProyectoDesdePlantilla,
  crearProyectoNuevo,
  duplicarProyectoGuardado,
  eliminarPlantilla,
  eliminarProyecto,
  guardarAhora,
  guardarComoPlantilla,
  renombrarPlantillaGuardada,
  useEstadoGuardado,
} from '../store/autoguardado';
import { guardarPlantilla, guardarProyecto, listarPlantillas, listarProyectos } from '../store/persistencia';
import { useEditor } from '../store/editor';
import { descargar } from './descarga';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
}

const formatoFecha = new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' });

function GuardarComoPlantilla({ onListo }: { onListo: () => void }) {
  const [activo, setActivo] = useState(false);
  const [nombre, setNombre] = useState('');

  if (!activo) {
    return (
      <button type="button" onClick={() => setActivo(true)}>
        Guardar como plantilla
      </button>
    );
  }

  const confirmar = async () => {
    const limpio = nombre.trim();
    if (!limpio) return;
    await guardarComoPlantilla(limpio);
    setActivo(false);
    setNombre('');
    onListo();
  };

  return (
    <span className="nombrar-plantilla">
      <input
        type="text"
        placeholder="Nombre de la plantilla"
        maxLength={80}
        value={nombre}
        autoFocus
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void confirmar()}
      />
      <button type="button" onClick={() => void confirmar()} disabled={nombre.trim() === ''}>
        Guardar
      </button>
      <button
        type="button"
        className="secundario"
        onClick={() => {
          setActivo(false);
          setNombre('');
        }}
      >
        Cancelar
      </button>
    </span>
  );
}

function FilaPlantilla({ plantilla, onCambio, onCerrar }: { plantilla: Plantilla; onCambio: () => void; onCerrar: () => void }) {
  const [porBorrar, setPorBorrar] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState(plantilla.nombre);

  const usar = async () => {
    if (await crearProyectoDesdePlantilla(plantilla.id)) onCerrar();
  };

  const confirmarNombre = async () => {
    const limpio = nombre.trim();
    if (limpio && limpio !== plantilla.nombre) await renombrarPlantillaGuardada(plantilla.id, limpio);
    setRenombrando(false);
    onCambio();
  };

  return (
    <li>
      <div className="info-proyecto">
        {renombrando ? (
          <input
            type="text"
            maxLength={80}
            value={nombre}
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => void confirmarNombre()}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          <strong>{plantilla.nombre}</strong>
        )}
        <span className="detalle">
          {plantilla.elementos.length} elemento(s) · {formatoFecha.format(new Date(plantilla.actualizadoEn))}
        </span>
      </div>
      {porBorrar ? (
        <div className="confirmar">
          <span>¿Borrar esta plantilla?</span>
          <button
            type="button"
            className="peligro"
            onClick={() => {
              setPorBorrar(false);
              void eliminarPlantilla(plantilla.id).then(onCambio);
            }}
          >
            Sí, borrar
          </button>
          <button type="button" className="secundario" onClick={() => setPorBorrar(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="botones-proyecto">
          <button type="button" onClick={() => void usar()}>
            Nuevo desde esta
          </button>
          <button type="button" className="secundario" onClick={() => setRenombrando(true)}>
            Renombrar
          </button>
          <button type="button" className="peligro" onClick={() => setPorBorrar(true)}>
            Borrar
          </button>
        </div>
      )}
    </li>
  );
}

export function DialogoProyectos({ abierto, onCerrar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const idActual = useEditor((s) => s.proyecto.id);
  const version = useEstadoGuardado((s) => s.version);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const [porBorrar, setPorBorrar] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([listarProyectos(), listarPlantillas()]);
      setProyectos(p);
      setPlantillas(t);
    } catch {
      setMensaje({ texto: 'No se pudo leer la lista de proyectos.', error: true });
    }
  }, []);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      void guardarAhora().then(refrescar);
    } else if (!abierto && d.open) {
      d.close();
    }
  }, [abierto, refrescar]);

  // Relee las listas al abrir el diálogo y cada vez que cambian los proyectos o las plantillas guardadas.
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    Promise.all([listarProyectos(), listarPlantillas()])
      .then(([p, t]) => {
        if (vigente) {
          setProyectos(p);
          setPlantillas(t);
        }
      })
      .catch(() => vigente && setMensaje({ texto: 'No se pudo leer la lista de proyectos.', error: true }));
    return () => {
      vigente = false;
    };
  }, [abierto, version]);

  const informar = (texto: string, error = false) => setMensaje({ texto, error });

  const abrir = async (id: string) => {
    if (await abrirProyecto(id)) onCerrar();
    else informar('No se pudo abrir el proyecto.', true);
  };

  const nuevo = async () => {
    await crearProyectoNuevo();
    onCerrar();
  };

  const exportar = async () => {
    await guardarAhora();
    const [todos, todasPlantillas] = await Promise.all([listarProyectos(), listarPlantillas()]);
    if (todos.length === 0 && todasPlantillas.length === 0) {
      informar('No hay proyectos ni plantillas guardados que respaldar.', true);
      return;
    }
    const dia = new Date().toISOString().slice(0, 10);
    descargar(`tec-tableros-respaldo-${dia}.json`, JSON.stringify(crearRespaldo(todos, todasPlantillas), null, 1), 'application/json');
    informar(`Respaldo descargado con ${todos.length} proyecto(s) y ${todasPlantillas.length} plantilla(s).`);
  };

  const importar = async (archivo: File) => {
    try {
      const importado = parsearRespaldo(await archivo.text());
      await guardarAhora();
      const [c, cPlantillas] = await Promise.all([
        listarProyectos().then((existentes) => combinarProyectos(existentes, importado.proyectos)),
        listarPlantillas().then((existentes) => combinarPlantillas(existentes, importado.plantillas)),
      ]);
      for (const p of c.guardar) await guardarProyecto(p);
      for (const t of cPlantillas.guardar) await guardarPlantilla(t);
      await refrescar();
      const partes = [`${c.agregados} proyecto(s) nuevo(s)`, `${c.omitidos} ya existían`];
      if (c.copias > 0) partes.push(`${c.copias} proyecto(s) como copia`);
      if (importado.plantillas.length > 0) {
        partes.push(`${cPlantillas.agregadas} plantilla(s) nueva(s)`);
        if (cPlantillas.copias > 0) partes.push(`${cPlantillas.copias} plantilla(s) como copia`);
      }
      informar(`Respaldo importado: ${partes.join(', ')}.`);
    } catch (e) {
      informar(e instanceof Error ? e.message : 'No se pudo importar el respaldo.', true);
    } finally {
      if (entrada.current) entrada.current.value = '';
    }
  };

  return (
    <dialog ref={dialogo} className="dialogo" onClose={onCerrar} aria-labelledby="titulo-proyectos">
      <div className="dialogo-cabecera">
        <h2 id="titulo-proyectos">Proyectos</h2>
        <button type="button" className="secundario" onClick={onCerrar} aria-label="Cerrar">
          ×
        </button>
      </div>

      <div className="dialogo-acciones">
        <button type="button" onClick={() => void nuevo()}>
          Proyecto nuevo
        </button>
        <button type="button" onClick={() => void exportar()}>
          Exportar respaldo
        </button>
        <button type="button" onClick={() => entrada.current?.click()}>
          Importar respaldo
        </button>
        <input
          ref={entrada}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importar(f);
          }}
        />
      </div>

      {mensaje && (
        <p className={mensaje.error ? 'mensaje error' : 'mensaje'} role="status">
          {mensaje.texto}
        </p>
      )}

      {proyectos.length === 0 ? (
        <p className="vacio">Aún no hay proyectos guardados. Se guardan solos al editar.</p>
      ) : (
        <ul className="lista-proyectos">
          {proyectos.map((p) => (
            <li key={p.id} className={p.id === idActual ? 'actual' : undefined}>
              <div className="info-proyecto">
                <strong>{p.nombre || 'Sin nombre'}</strong>
                {p.id === idActual && <span className="etiqueta-actual">abierto</span>}
                <span className="detalle">
                  {p.numeroCotizacion ? `Cotización ${p.numeroCotizacion} · ` : ''}
                  {p.elementos.length} elemento(s) · {formatoFecha.format(new Date(p.actualizadoEn))}
                </span>
              </div>
              {porBorrar === p.id ? (
                <div className="confirmar">
                  <span>¿Borrar este proyecto?</span>
                  <button
                    type="button"
                    className="peligro"
                    onClick={() => {
                      setPorBorrar(null);
                      void eliminarProyecto(p.id);
                    }}
                  >
                    Sí, borrar
                  </button>
                  <button type="button" className="secundario" onClick={() => setPorBorrar(null)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="botones-proyecto">
                  <button type="button" onClick={() => void abrir(p.id)}>
                    Abrir
                  </button>
                  <button type="button" className="secundario" onClick={() => void duplicarProyectoGuardado(p.id)}>
                    Duplicar
                  </button>
                  <button type="button" className="peligro" onClick={() => setPorBorrar(p.id)}>
                    Borrar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="dialogo-cabecera dialogo-subseccion">
        <h3>Plantillas</h3>
        <GuardarComoPlantilla onListo={refrescar} />
      </div>
      <p className="ayuda">Una plantilla guarda la caja, el dibujo, el margen y el modo, sin N° de cotización ni notas.</p>
      {plantillas.length === 0 ? (
        <p className="vacio">Aún no hay plantillas guardadas.</p>
      ) : (
        <ul className="lista-proyectos">
          {plantillas.map((t) => (
            <FilaPlantilla key={t.id} plantilla={t} onCambio={refrescar} onCerrar={onCerrar} />
          ))}
        </ul>
      )}
    </dialog>
  );
}
