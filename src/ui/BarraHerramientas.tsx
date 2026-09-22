import { useState } from 'react';
import { ANCHO_MAX_LIBRE_MM, ANCHO_MIN_LIBRE_MM } from '../core/caja';
import { SECCIONES_CANALETA } from '../core/capacidad';
import type { Modo } from '../core/capacidad';
import { esCanaleta, huella } from '../core/colocacion';
import { formatearMm } from '../core/biblioteca';
import { margenBordePorDefecto } from '../core/margenes';
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

/** Margen de borde, modo y sección de canaleta: solo aplican a cajas metálicas o inox (con rieles propios). */
function AjustesCapacidad() {
  const ctx = useContexto();
  const biblioteca = useBiblioteca((s) => s.biblioteca);
  const proyecto = useEditor((s) => s.proyecto);
  const { setMargenBorde, setModo, setSeccionCanaleta, avisar } = useEditor.getState();

  if (!ctx || !biblioteca || !ctx.caja.permiteRieles) return null;

  const margenMostrado =
    proyecto.margenBordeManual && proyecto.margenBorde_mm !== null
      ? proyecto.margenBorde_mm
      : margenBordePorDefecto(proyecto.caja, biblioteca.gabinetes);

  const confirmarMargen = (v: string, input: HTMLInputElement) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      avisar('El margen de borde debe ser un número entero entre 0 y 100 mm.');
      input.value = String(margenMostrado);
      return;
    }
    if (n !== margenMostrado) setMargenBorde(n);
  };

  return (
    <div className="grupo-barra">
      <label>
        Margen de borde (mm)
        <input
          key={margenMostrado}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          defaultValue={margenMostrado}
          onBlur={(e) => confirmarMargen(e.target.value, e.target)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
      <label>
        Distribución
        <select value={proyecto.modo} onChange={(e) => setModo(e.target.value as Modo)}>
          <option value="compacto">Compacta (sin canaleta)</option>
          <option value="con_canaleta">Con canaleta</option>
        </select>
      </label>
      {proyecto.modo === 'con_canaleta' && (
        <label>
          Sección canaleta (mm)
          <select value={proyecto.seccionCanaleta_mm} onChange={(e) => setSeccionCanaleta(Number(e.target.value) as (typeof SECCIONES_CANALETA)[number])}>
            {SECCIONES_CANALETA.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      {ctx.capacidad && (
        <span className="hint">
          {ctx.capacidad.modulosPorFila} módulos/fila · {ctx.capacidad.filas} fila(s)
        </span>
      )}
    </div>
  );
}

function Seleccion() {
  const ctx = useContexto();
  const uid = useEditor((s) => s.seleccion);
  const el = useEditor((s) => s.proyecto.elementos.find((e) => e.uid === s.seleccion));
  const { duplicar, borrar, rotar } = useEditor.getState();
  const comp = el && ctx?.comps.get(el.componenteId);
  if (!uid || !el || !comp) return <span className="hint">Selecciona un elemento para moverlo, girarlo, duplicarlo o borrarlo.</span>;

  const r = huella(el, comp);
  return (
    <div className="grupo-barra">
      <strong className="sel-nombre">{comp.nombre}</strong>
      <span className="hint">
        x {formatearMm(r.x)} · y {formatearMm(r.y)} mm
      </span>
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
        <AjustesCapacidad />
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
