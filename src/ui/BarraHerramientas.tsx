import { useState } from 'react';
import { ANCHO_MAX_LIBRE_MM, ANCHO_MIN_LIBRE_MM } from '../core/caja';
import { esCanaleta, huella } from '../core/colocacion';
import { formatearMm } from '../core/biblioteca';
import type { Caja, TipoCaja } from '../core/tipos';
import { useBiblioteca } from '../store/biblioteca';
import { useContexto, useEditor } from '../store/editor';

const LIBRE = '__libre__';
const GRUPOS: { tipo: TipoCaja; rotulo: string }[] = [
  { tipo: 'metalica', rotulo: 'Metálicas' },
  { tipo: 'inox', rotulo: 'Inox' },
  { tipo: 'plastica_sobrepuesta', rotulo: 'Plásticas sobrepuestas' },
  { tipo: 'plastica_embutida', rotulo: 'Plásticas embutidas' },
];

function SelectorCaja({ cajas }: { cajas: Caja[] }) {
  const caja = useEditor((s) => s.proyecto.caja);
  const cambiarCaja = useEditor((s) => s.cambiarCaja);
  const avisar = useEditor((s) => s.avisar);
  const libre = 'libre' in caja ? caja.libre : null;
  const [ancho, setAncho] = useState(String(libre?.ancho_mm ?? 600));
  const [alto, setAlto] = useState(String(libre?.alto_mm ?? 500));
  const [tipo, setTipo] = useState<'metalica' | 'inox'>(libre?.tipo ?? 'metalica');

  const aplicarLibre = (a: string, h: string, t: 'metalica' | 'inox') => {
    const [an, al] = [Number(a), Number(h)];
    const valido = (v: number) => Number.isInteger(v) && v >= ANCHO_MIN_LIBRE_MM && v <= ANCHO_MAX_LIBRE_MM;
    if (!valido(an) || !valido(al)) {
      avisar(`Ancho y alto deben ser números enteros entre ${ANCHO_MIN_LIBRE_MM} y ${ANCHO_MAX_LIBRE_MM} mm.`);
      return;
    }
    cambiarCaja({ libre: { ancho_mm: an, alto_mm: al, tipo: t } });
  };

  return (
    <div className="grupo-barra">
      <label>
        Caja
        <select
          value={'libre' in caja ? LIBRE : caja.id}
          onChange={(e) => (e.target.value === LIBRE ? aplicarLibre(ancho, alto, tipo) : cambiarCaja({ id: e.target.value }))}
        >
          {GRUPOS.map((g) => (
            <optgroup key={g.tipo} label={g.rotulo}>
              {cajas
                .filter((c) => c.tipo === g.tipo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </optgroup>
          ))}
          <option value={LIBRE}>Medida libre…</option>
        </select>
      </label>
      {libre && (
        <>
          <label>
            Ancho (mm)
            <input type="number" inputMode="numeric" value={ancho} onChange={(e) => setAncho(e.target.value)} />
          </label>
          <label>
            Alto (mm)
            <input type="number" inputMode="numeric" value={alto} onChange={(e) => setAlto(e.target.value)} />
          </label>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value === 'inox' ? 'inox' : 'metalica')}>
              <option value="metalica">Metálica</option>
              <option value="inox">Inox</option>
            </select>
          </label>
          <button type="button" onClick={() => aplicarLibre(ancho, alto, tipo)}>
            Aplicar
          </button>
        </>
      )}
    </div>
  );
}

function Seleccion() {
  const ctx = useContexto();
  const uid = useEditor((s) => s.seleccion);
  const el = useEditor((s) => s.proyecto.elementos.find((e) => e.uid === s.seleccion));
  const { duplicar, borrar, rotar, cambiarLargo, avisar } = useEditor.getState();
  const comp = el && ctx?.comps.get(el.componenteId);
  if (!uid || !el || !comp) return <span className="hint">Selecciona un elemento para moverlo, girarlo, duplicarlo o borrarlo.</span>;

  const r = huella(el, comp);
  const largo = comp.montaje === 'lineal' ? ((el.rotacion ?? 0) === 90 ? r.h : r.w) : null;

  const confirmarLargo = (texto: string) => {
    const v = Number(texto);
    if (!Number.isInteger(v)) {
      avisar('El largo debe ser un número entero de milímetros.');
      return;
    }
    if (v !== largo) cambiarLargo(uid, v);
  };

  return (
    <div className="grupo-barra">
      <strong className="sel-nombre">{comp.nombre}</strong>
      <span className="hint">
        x {formatearMm(r.x)} · y {formatearMm(r.y)} mm
      </span>
      {largo !== null && comp.montaje === 'lineal' && (
        <label>
          Largo (mm)
          <input
            key={`${uid}:${largo}`}
            type="number"
            inputMode="numeric"
            min={comp.largo_min_mm}
            max={comp.largo_max_mm}
            defaultValue={largo}
            onBlur={(e) => {
              confirmarLargo(e.target.value);
              e.target.value = String(largo);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
      )}
      {esCanaleta(comp) && (
        <button type="button" onClick={() => rotar(uid)} title="Girar 90° (R)">
          Girar 90°
        </button>
      )}
      <button type="button" onClick={() => duplicar(uid)} title="Duplicar (Ctrl+D)">
        Duplicar
      </button>
      <button type="button" className="peligro" onClick={() => borrar(uid)} title="Borrar (Supr)">
        Borrar
      </button>
    </div>
  );
}

export function BarraHerramientas() {
  const gabinetes = useBiblioteca((s) => s.biblioteca?.gabinetes);
  const cuadricula = useEditor((s) => s.cuadricula);
  const alternarCuadricula = useEditor((s) => s.alternarCuadricula);
  const puedeDeshacer = useEditor((s) => s.historial.pasado.length > 0);
  const puedeRehacer = useEditor((s) => s.historial.futuro.length > 0);
  const deshacer = useEditor((s) => s.deshacer);
  const rehacer = useEditor((s) => s.rehacer);

  return (
    <div className="barra-herramientas">
      <div className="fila-barra">
        {gabinetes && <SelectorCaja cajas={gabinetes.cajas} />}
        <div className="grupo-barra">
          <button type="button" onClick={deshacer} disabled={!puedeDeshacer} title="Deshacer (Ctrl+Z)">
            Deshacer
          </button>
          <button type="button" onClick={rehacer} disabled={!puedeRehacer} title="Rehacer (Ctrl+Y)">
            Rehacer
          </button>
          <button type="button" aria-pressed={cuadricula} onClick={alternarCuadricula}>
            Cuadrícula
          </button>
        </div>
      </div>
      <div className="fila-barra">
        <Seleccion />
      </div>
    </div>
  );
}
