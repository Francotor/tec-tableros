import { useEffect, useRef, useState } from 'react';
import type { Plantilla } from '../core/plantillas';
import {
  crearProyectoDesdePlantilla,
  eliminarPlantilla,
  guardarComoPlantilla,
  renombrarPlantillaGuardada,
} from '../store/autoguardado';
import { listarPlantillas } from '../store/persistencia';

const formatoFecha = new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' });

interface PropsGuardar {
  abierto: boolean;
  onCerrar: () => void;
}

/** "Guardar como plantilla": pide un nombre (distinto del nombre del proyecto) y confirma. */
export function DialogoGuardarPlantilla({ abierto, onCerrar }: PropsGuardar) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      setNombre('');
      d.showModal();
    } else if (!abierto && d.open) {
      d.close();
    }
  }, [abierto]);

  const confirmar = async () => {
    const limpio = nombre.trim();
    if (!limpio) return;
    setGuardando(true);
    try {
      await guardarComoPlantilla(limpio);
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <dialog ref={dialogo} className="dialogo dialogo-chico" onClose={onCerrar} aria-labelledby="titulo-guardar-plantilla">
      <div className="dialogo-cabecera">
        <h2 id="titulo-guardar-plantilla">Guardar como plantilla</h2>
        <button type="button" className="secundario" onClick={onCerrar} aria-label="Cerrar">
          ×
        </button>
      </div>
      <label className="campo" htmlFor="nombre-plantilla-nueva">
        Nombre de la plantilla
        <input
          id="nombre-plantilla-nueva"
          type="text"
          maxLength={80}
          value={nombre}
          autoFocus
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void confirmar()}
        />
        <span className="ayuda">Guarda la caja, el dibujo, el margen y el modo; no el N° de cotización ni las notas.</span>
      </label>
      <div className="dialogo-acciones">
        <button type="button" onClick={() => void confirmar()} disabled={nombre.trim() === '' || guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </dialog>
  );
}

interface PropsNuevo {
  abierto: boolean;
  onCerrar: () => void;
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
            Usar
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

/** "Nuevo desde plantilla": lista las plantillas guardadas, cada una con usar, renombrar y borrar. */
export function DialogoNuevoDesdePlantilla({ abierto, onCerrar }: PropsNuevo) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [version, setVersion] = useState(0);

  const refrescar = () => setVersion((v) => v + 1);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    else if (!abierto && d.open) d.close();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    listarPlantillas().then((lista) => vigente && setPlantillas(lista));
    return () => {
      vigente = false;
    };
  }, [abierto, version]);

  return (
    <dialog ref={dialogo} className="dialogo" onClose={onCerrar} aria-labelledby="titulo-nuevo-desde-plantilla">
      <div className="dialogo-cabecera">
        <h2 id="titulo-nuevo-desde-plantilla">Nuevo desde plantilla</h2>
        <button type="button" className="secundario" onClick={onCerrar} aria-label="Cerrar">
          ×
        </button>
      </div>
      {plantillas.length === 0 ? (
        <p className="vacio">
          Aún no hay plantillas guardadas. Usa "Guardar como plantilla" en la barra superior para crear la primera.
        </p>
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
