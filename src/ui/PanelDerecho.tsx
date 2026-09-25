import { useEffect, useState } from 'react';
import { useEditor } from '../store/editor';
import { PanelLista, useAnalisis } from './PanelLista';
import { PanelPropiedades } from './PanelPropiedades';
import { usePreferencia } from './preferencias';

type Pestana = 'propiedades' | 'lista';

function IconoPropiedades() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}

function IconoLista() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </svg>
  );
}

/** Columna derecha: propiedades del elemento seleccionado y lista de materiales. Se pliega a una franja de iconos. */
export function PanelDerecho() {
  const [pestana, setPestana] = useState<Pestana>('propiedades');
  const [abierto, setAbierto] = usePreferencia('tec.derechoAbierto', true);
  const seleccion = useEditor((s) => s.seleccion);
  const avisos = useAnalisis()?.avisos.length ?? 0;

  // Al elegir un elemento se muestran sus propiedades (ajuste de estado durante el render).
  const [previa, setPrevia] = useState(seleccion);
  if (seleccion !== previa) {
    setPrevia(seleccion);
    if (seleccion) setPestana('propiedades');
  }
  // Y si el panel estaba plegado, se despliega para poder editarlo.
  useEffect(() => {
    if (seleccion) setAbierto(true);
  }, [seleccion, setAbierto]);

  if (!abierto) {
    return (
      <aside className="panel-props plegado" aria-label="Propiedades y lista de materiales (plegado)">
        <button
          type="button"
          title="Propiedades"
          aria-label="Abrir Propiedades"
          onClick={() => {
            setPestana('propiedades');
            setAbierto(true);
          }}
        >
          <IconoPropiedades />
        </button>
        <button
          type="button"
          title="Lista de materiales"
          aria-label="Abrir la lista de materiales"
          onClick={() => {
            setPestana('lista');
            setAbierto(true);
          }}
        >
          <IconoLista />
          {avisos > 0 && <span className="insignia insignia-franja">{avisos}</span>}
        </button>
      </aside>
    );
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
        <button type="button" className="plegar-panel" title="Plegar el panel" aria-label="Plegar el panel" onClick={() => setAbierto(false)}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div role="tabpanel">{pestana === 'propiedades' ? <PanelPropiedades /> : <PanelLista />}</div>
    </aside>
  );
}
