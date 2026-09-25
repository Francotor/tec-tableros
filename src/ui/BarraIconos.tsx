import type { ReactNode } from 'react';
import { useEditor } from '../store/editor';

function Icono({ children }: { children: ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/**
 * Herramientas de edición en una barra angosta de iconos, flotando sobre la esquina del dibujo: deshacer, rehacer,
 * cuadrícula, topes de riel y lado de las bisagras. Cada botón mide 40 px y lleva su nombre en el título.
 */
export function BarraIconos() {
  const cuadricula = useEditor((s) => s.cuadricula);
  const alternarCuadricula = useEditor((s) => s.alternarCuadricula);
  const puedeDeshacer = useEditor((s) => s.historial.pasado.length > 0);
  const puedeRehacer = useEditor((s) => s.historial.futuro.length > 0);
  const deshacer = useEditor((s) => s.deshacer);
  const rehacer = useEditor((s) => s.rehacer);
  const topes = useEditor((s) => s.proyecto.topesAutomaticos);
  const setTopes = useEditor((s) => s.setTopes);
  const ladoBisagras = useEditor((s) => s.proyecto.ladoBisagras);
  const setLadoBisagras = useEditor((s) => s.setLadoBisagras);
  const izquierda = ladoBisagras === 'izquierda';

  return (
    <div className="barra-iconos" role="toolbar" aria-label="Herramientas de edición" aria-orientation="vertical">
      <button type="button" onClick={deshacer} disabled={!puedeDeshacer} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
        <Icono>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </Icono>
      </button>
      <button type="button" onClick={rehacer} disabled={!puedeRehacer} title="Rehacer (Ctrl+Y)" aria-label="Rehacer">
        <Icono>
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H10a6 6 0 0 0 0 12h3" />
        </Icono>
      </button>
      <span className="separador-iconos" aria-hidden="true" />
      <button type="button" aria-pressed={cuadricula} onClick={alternarCuadricula} title="Cuadrícula" aria-label="Cuadrícula">
        <Icono>
          <path d="M4 4h16v16H4z" />
          <path d="M4 12h16M12 4v16" />
        </Icono>
      </button>
      <button
        type="button"
        aria-pressed={topes}
        onClick={() => setTopes(!topes)}
        title="Topes de riel automáticos (2 por riel con aparatos). Por defecto no se usan; actívalos cuando el tablero los necesite."
        aria-label="Topes de riel"
      >
        <Icono>
          <path d="M3 12h18" />
          <path d="M6 7v10M18 7v10" />
        </Icono>
      </button>
      <button
        type="button"
        onClick={() => setLadoBisagras(izquierda ? 'derecha' : 'izquierda')}
        title={`Bisagras de la puerta (vista frontal): ${izquierda ? 'izquierda' : 'derecha'}. Toca para cambiar.`}
        aria-label={`Bisagras a la ${izquierda ? 'izquierda' : 'derecha'}`}
      >
        <Icono>
          <rect x="5" y="3" width="14" height="18" rx="1" />
          {izquierda ? <path d="M5 7h-2v3h2M5 14h-2v3h2" /> : <path d="M19 7h2v3h-2M19 14h2v3h-2" />}
        </Icono>
      </button>
    </div>
  );
}
