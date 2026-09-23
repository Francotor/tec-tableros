import { useEffect, useRef, useState } from 'react';
import type { Circuito } from '../core/modelo';
import { useEditor } from '../store/editor';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
}

function FilaCircuito({ circuito }: { circuito: Circuito }) {
  const renombrarCircuito = useEditor((s) => s.renombrarCircuito);
  const borrarCircuito = useEditor((s) => s.borrarCircuito);
  const [editando, setEditando] = useState(false);
  const [numero, setNumero] = useState(circuito.numero);
  const [nombre, setNombre] = useState(circuito.nombre);
  const [porBorrar, setPorBorrar] = useState(false);

  const confirmar = () => {
    const n = numero.trim() || circuito.numero;
    const nm = nombre.trim() || circuito.nombre;
    if (n !== circuito.numero || nm !== circuito.nombre) renombrarCircuito(circuito.id, { numero: n, nombre: nm });
    setEditando(false);
  };

  return (
    <li>
      <div className="info-proyecto">
        {editando ? (
          <span className="editar-circuito">
            <input type="text" maxLength={10} value={numero} placeholder="N°" onChange={(e) => setNumero(e.target.value)} autoFocus />
            <input type="text" maxLength={60} value={nombre} placeholder="Nombre" onChange={(e) => setNombre(e.target.value)} />
          </span>
        ) : (
          <strong>
            {circuito.numero} · {circuito.nombre}
          </strong>
        )}
      </div>
      {porBorrar ? (
        <div className="confirmar">
          <span>¿Borrar este circuito? Los elementos que lo tienen quedan sin circuito.</span>
          <button
            type="button"
            className="peligro"
            onClick={() => {
              setPorBorrar(false);
              borrarCircuito(circuito.id);
            }}
          >
            Sí, borrar
          </button>
          <button type="button" className="secundario" onClick={() => setPorBorrar(false)}>
            Cancelar
          </button>
        </div>
      ) : editando ? (
        <div className="botones-proyecto">
          <button type="button" onClick={confirmar}>
            Guardar
          </button>
          <button
            type="button"
            className="secundario"
            onClick={() => {
              setNumero(circuito.numero);
              setNombre(circuito.nombre);
              setEditando(false);
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="botones-proyecto">
          <button type="button" className="secundario" onClick={() => setEditando(true)}>
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

/** Panel para crear, renombrar y borrar los circuitos del proyecto. */
export function DialogoCircuitos({ abierto, onCerrar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const circuitos = useEditor((s) => s.proyecto.circuitos);
  const crearCircuito = useEditor((s) => s.crearCircuito);
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      setNumero('');
      setNombre('');
      d.showModal();
    } else if (!abierto && d.open) {
      d.close();
    }
  }, [abierto]);

  const crear = () => {
    const n = numero.trim();
    const nm = nombre.trim();
    if (!n && !nm) return;
    crearCircuito(n, nm);
    setNumero('');
    setNombre('');
  };

  return (
    <dialog ref={dialogo} className="dialogo" onClose={onCerrar} aria-labelledby="titulo-circuitos">
      <div className="dialogo-cabecera">
        <h2 id="titulo-circuitos">Circuitos</h2>
        <button type="button" className="secundario" onClick={onCerrar} aria-label="Cerrar">
          ×
        </button>
      </div>
      <p className="ayuda">
        Un circuito agrupa elementos para el rotulado y, opcionalmente, para la lista de materiales. Se asigna desde el panel
        de Propiedades de cada elemento.
      </p>
      <div className="dialogo-acciones editar-circuito">
        <input type="text" maxLength={10} placeholder="N° (p. ej. C1)" value={numero} onChange={(e) => setNumero(e.target.value)} />
        <input type="text" maxLength={60} placeholder="Nombre (p. ej. Iluminación)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <button type="button" onClick={crear} disabled={!numero.trim() && !nombre.trim()}>
          Agregar
        </button>
      </div>
      {circuitos.length === 0 ? (
        <p className="vacio">Aún no hay circuitos creados.</p>
      ) : (
        <ul className="lista-proyectos">
          {circuitos.map((c) => (
            <FilaCircuito key={c.id} circuito={c} />
          ))}
        </ul>
      )}
    </dialog>
  );
}
