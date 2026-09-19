import { agruparPorCategoria, formatearMm } from '../core/biblioteca';
import type { Componente } from '../core/tipos';
import { urlBiblioteca } from '../store/biblioteca';

function medidas(c: Componente): string {
  return c.ancho_mm === null
    ? `largo variable × ${formatearMm(c.alto_mm)} mm`
    : `${formatearMm(c.ancho_mm)} × ${formatearMm(c.alto_mm)} mm`;
}

export function PanelCatalogo({ componentes }: { componentes: Componente[] }) {
  return (
    <aside className="panel-catalogo" aria-label="Catálogo de componentes">
      {agruparPorCategoria(componentes).map(({ categoria, componentes: lista }) => (
        <details key={categoria} open className="grupo">
          <summary>
            {categoria} <span className="cuenta">{lista.length}</span>
          </summary>
          <ul>
            {lista.map((c) => (
              <li key={c.id} className="ficha">
                <div className="miniatura">
                  <img src={urlBiblioteca(c.svg)} alt="" loading="lazy" />
                </div>
                <div>
                  <div className="nombre">{c.nombre}</div>
                  <div className="medidas">{medidas(c)}</div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </aside>
  );
}
