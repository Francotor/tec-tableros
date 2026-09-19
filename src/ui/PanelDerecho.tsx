import { useState } from 'react';
import { useEditor } from '../store/editor';
import { PanelLista, useAnalisis } from './PanelLista';
import { PanelPropiedades } from './PanelPropiedades';

type Pestana = 'propiedades' | 'lista';

/** Columna derecha: propiedades del elemento seleccionado y lista de materiales. */
export function PanelDerecho() {
  const [pestana, setPestana] = useState<Pestana>('propiedades');
  const seleccion = useEditor((s) => s.seleccion);
  const avisos = useAnalisis()?.avisos.length ?? 0;

  // Al elegir un elemento se muestran sus propiedades (ajuste de estado durante el render).
  const [previa, setPrevia] = useState(seleccion);
  if (seleccion !== previa) {
    setPrevia(seleccion);
    if (seleccion) setPestana('propiedades');
  }

  return (
    <aside className="panel-props" aria-label="Propiedades y lista de materiales">
      <div className="pestanas" role="tablist">
        <button type="button" role="tab" aria-selected={pestana === 'propiedades'} onClick={() => setPestana('propiedades')}>
          Propiedades
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'lista'} onClick={() => setPestana('lista')}>
          Lista de materiales
          {avisos > 0 && (
            <span className="insignia" title={`${avisos} aviso(s)`}>
              {avisos}
            </span>
          )}
        </button>
      </div>
      <div role="tabpanel">{pestana === 'propiedades' ? <PanelPropiedades /> : <PanelLista />}</div>
    </aside>
  );
}
