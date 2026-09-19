import { agruparPorCategoria, formatearMm } from '../core/biblioteca';
import type { Componente } from '../core/tipos';
import { urlBiblioteca } from '../store/biblioteca';
import { useEditor } from '../store/editor';
import { TIPO_ARRASTRE } from './Lienzo';

function medidas(c: Componente): string {
  return c.ancho_mm === null
    ? `largo variable × ${formatearMm(c.alto_mm)} mm`
    : `${formatearMm(c.ancho_mm)} × ${formatearMm(c.alto_mm)} mm`;
}

export function PanelCatalogo({ componentes }: { componentes: Componente[] }) {
  const fichaActiva = useEditor((s) => s.fichaActiva);
  const setFichaActiva = useEditor((s) => s.setFichaActiva);

  return (
    <aside className="panel-catalogo" aria-label="Catálogo de componentes">
      <p className="ayuda-panel">Arrastra una pieza al tablero, o tócala y luego toca el tablero.</p>
      {agruparPorCategoria(componentes).map(({ categoria, componentes: lista }) => (
        <details key={categoria} open className="grupo">
          <summary>
            {categoria} <span className="cuenta">{lista.length}</span>
          </summary>
          <ul>
            {lista.map((c) => {
              const activa = fichaActiva === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`ficha${activa ? ' activa' : ''}`}
                    aria-pressed={activa}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(TIPO_ARRASTRE, c.id);
                      e.dataTransfer.setData('text/plain', c.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => setFichaActiva(activa ? null : c.id)}
                  >
                    <span className="miniatura">
                      <img src={urlBiblioteca(c.svg)} alt="" loading="lazy" draggable={false} />
                    </span>
                    <span>
                      <span className="nombre">{c.nombre}</span>
                      <span className="medidas">{medidas(c)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </aside>
  );
}
