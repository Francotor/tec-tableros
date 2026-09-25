import { useEffect, useRef, useState } from 'react';
import { agruparPorCategoria, formatearMm } from '../core/biblioteca';
import type { Componente } from '../core/tipos';
import { urlBiblioteca } from '../store/biblioteca';
import { useEditor } from '../store/editor';
import { TIPO_ARRASTRE } from './Lienzo';
import { usePreferencia } from './preferencias';

function medidas(c: Componente): string {
  return c.ancho_mm === null
    ? `largo variable × ${formatearMm(c.alto_mm)} mm`
    : `${formatearMm(c.ancho_mm)} × ${formatearMm(c.alto_mm)} mm`;
}

/** Pieza que representa a su categoría en la franja plegada: el riel para Montaje (el tope, que va primero, no se reconoce). */
function representante(lista: Componente[]): Componente | undefined {
  return lista.find((c) => c.id === 'riel_din') ?? lista[0];
}

/**
 * Catálogo de componentes. Plegado (lo normal) es una franja angosta con una pieza por categoría; al pasar el mouse
 * o tocar, se despliega encima del dibujo sin quitarle ancho. "Fijar panel" lo deja desplegado a un costado.
 */
export function PanelCatalogo({ componentes }: { componentes: Componente[] }) {
  const fichaActiva = useEditor((s) => s.fichaActiva);
  const setFichaActiva = useEditor((s) => s.setFichaActiva);
  const grupos = agruparPorCategoria(componentes);
  const [fijo, setFijo] = usePreferencia('tec.catalogoFijo', false);
  const [flotante, setFlotante] = useState(false);
  const enfoque = useRef<string | null>(null);
  const arrastrando = useRef(false);
  const raiz = useRef<HTMLDivElement>(null);
  const visible = fijo || flotante;

  // Un toque fuera del catálogo desplegado (o Escape) lo vuelve a plegar.
  useEffect(() => {
    if (!flotante || fijo) return;
    const fuera = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setFlotante(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setFlotante(false);
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [flotante, fijo]);

  // Al elegir una categoría en la franja, el panel se abre y la lleva a la vista.
  const llevarACategoria = (categoria: string): void => {
    document.getElementById(`cat-${categoria}`)?.scrollIntoView({ block: 'start' });
  };
  useEffect(() => {
    if (visible && enfoque.current) {
      llevarACategoria(enfoque.current);
      enfoque.current = null;
    }
  }, [visible]);

  const plegarSiFlotante = () => {
    if (!fijo) setFlotante(false);
  };

  return (
    <div
      ref={raiz}
      className={`catalogo-envoltura${fijo ? ' fijo' : ''}`}
      onMouseEnter={() => !fijo && setFlotante(true)}
      onMouseLeave={() => {
        if (!arrastrando.current) setFlotante(false);
      }}
    >
      {!fijo && (
        <nav className="franja-catalogo" aria-label="Categorías del catálogo">
          <button type="button" className="franja-abrir" aria-label="Abrir el catálogo" aria-expanded={flotante} onClick={() => setFlotante(!flotante)}>
            <span aria-hidden="true">›</span>
          </button>
          {grupos.map(({ categoria, componentes: lista }) => {
            const c = representante(lista);
            return (
              <button
                key={categoria}
                type="button"
                title={`${categoria} (${lista.length})`}
                aria-label={`${categoria}, ${lista.length} piezas`}
                onClick={() => {
                  if (flotante) {
                    llevarACategoria(categoria);
                  } else {
                    enfoque.current = categoria;
                    setFlotante(true);
                  }
                }}
              >
                {c && <img src={urlBiblioteca(c.svg)} alt="" draggable={false} />}
              </button>
            );
          })}
        </nav>
      )}
      {visible && (
        <aside className={`panel-catalogo${fijo ? '' : ' flotante'}`} aria-label="Catálogo de componentes">
          <div className="cabecera-catalogo">
            <p className="ayuda-panel">Arrastra una pieza al tablero, o tócala y luego toca el tablero.</p>
            <button
              type="button"
              className="fijar-panel"
              aria-pressed={fijo}
              onClick={() => {
                setFijo(!fijo);
                setFlotante(false);
              }}
            >
              {fijo ? 'Plegar panel ‹' : 'Fijar panel'}
            </button>
          </div>
          {grupos.map(({ categoria, componentes: lista }) => (
            <details key={categoria} id={`cat-${categoria}`} open className="grupo">
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
                          arrastrando.current = true;
                          e.dataTransfer.setData(TIPO_ARRASTRE, c.id);
                          e.dataTransfer.setData('text/plain', c.id);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onDragEnd={() => {
                          arrastrando.current = false;
                          plegarSiFlotante();
                        }}
                        onClick={() => {
                          setFichaActiva(activa ? null : c.id);
                          if (!activa) plegarSiFlotante();
                        }}
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
      )}
    </div>
  );
}
