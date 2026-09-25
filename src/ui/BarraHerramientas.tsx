import { useMemo, useState } from 'react';
import { ANCHO_MAX_LIBRE_MM, ANCHO_MIN_LIBRE_MM } from '../core/caja';
import { SECCIONES_CANALETA } from '../core/capacidad';
import type { Modo } from '../core/capacidad';
import { esCanaleta, huella } from '../core/colocacion';
import { agruparCajasSelector, buscarCaja, formatearMm } from '../core/biblioteca';
import { margenBordePorDefecto } from '../core/margenes';
import type { Caja, Gabinetes } from '../core/tipos';
import { useBiblioteca } from '../store/biblioteca';
import { useContexto, useEditor } from '../store/editor';

const LIBRE = '__libre__';

/** Datos de fábrica de la caja elegida: referencia, puerta transparente y doble puerta. */
function DatosFabricante({ caja }: { caja: Caja }) {
  if (!caja.ref_fabricante && !caja.puertas) return null;
  return (
    <span className="hint datos-fabricante">
      {caja.ref_fabricante && <>Ref. {caja.ref_fabricante}</>}
      {caja.ref_puerta_transparente && <> · puerta transparente {caja.ref_puerta_transparente}</>}
      {caja.puertas === 2 && <span className="etiqueta-doble-puerta">Doble puerta</span>}
    </span>
  );
}

function SelectorCaja({ gabinetes }: { gabinetes: Gabinetes }) {
  const caja = useEditor((s) => s.proyecto.caja);
  const cambiarCaja = useEditor((s) => s.cambiarCaja);
  const avisar = useEditor((s) => s.avisar);
  const libre = 'libre' in caja ? caja.libre : null;
  const cajaActual = 'id' in caja ? buscarCaja(gabinetes, caja.id) : null;
  const [ancho, setAncho] = useState(String(libre?.ancho_mm ?? 600));
  const [alto, setAlto] = useState(String(libre?.alto_mm ?? 500));
  const [tipo, setTipo] = useState<'metalica' | 'inox'>(libre?.tipo ?? 'metalica');
  const [verGenericas, setVerGenericas] = useState(false);
  const [oferta, setOferta] = useState<{ referencialId: string; reemplazo: Caja } | null>(null);

  // La caja actual, si es referencial, se muestra igual aunque el toggle esté apagado.
  const grupos = useMemo(
    () => agruparCajasSelector(gabinetes.cajas, verGenericas || cajaActual?.referencial === true),
    [gabinetes, verGenericas, cajaActual],
  );

  const aplicarLibre = (a: string, h: string, t: 'metalica' | 'inox') => {
    const [an, al] = [Number(a), Number(h)];
    const valido = (v: number) => Number.isInteger(v) && v >= ANCHO_MIN_LIBRE_MM && v <= ANCHO_MAX_LIBRE_MM;
    if (!valido(an) || !valido(al)) {
      avisar(`Ancho y alto deben ser números enteros entre ${ANCHO_MIN_LIBRE_MM} y ${ANCHO_MAX_LIBRE_MM} mm.`);
      return;
    }
    setOferta(null);
    cambiarCaja({ libre: { ancho_mm: an, alto_mm: al, tipo: t } });
  };

  const elegir = (id: string) => {
    cambiarCaja({ id });
    const c = buscarCaja(gabinetes, id);
    const reemplazo = c?.referencial && c.reemplazo_sugerido ? buscarCaja(gabinetes, c.reemplazo_sugerido) : undefined;
    setOferta(reemplazo ? { referencialId: id, reemplazo } : null);
  };

  return (
    <div className="grupo-barra selector-caja">
      <label>
        Caja
        <select value={'libre' in caja ? LIBRE : caja.id} onChange={(e) => (e.target.value === LIBRE ? aplicarLibre(ancho, alto, tipo) : elegir(e.target.value))}>
          {grupos.map((g) => (
            <optgroup key={g.etiqueta} label={g.etiqueta}>
              {g.cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.referencial ? ' (medida genérica)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={LIBRE}>Medida libre…</option>
        </select>
      </label>
      <label className="ver-genericas">
        <input
          type="checkbox"
          checked={verGenericas}
          onChange={(e) => setVerGenericas(e.target.checked)}
          disabled={cajaActual?.referencial === true}
        />
        Ver medidas genéricas
      </label>
      {cajaActual && <DatosFabricante caja={cajaActual} />}
      {oferta && 'id' in caja && caja.id === oferta.referencialId && (
        <div className="oferta-reemplazo" role="status">
          <span>
            Es una medida referencial. En el catálogo hay una caja real: <strong>{oferta.reemplazo.nombre}</strong>
            {oferta.reemplazo.ref_fabricante && ` (ref. ${oferta.reemplazo.ref_fabricante})`}.
          </span>
          <button type="button" onClick={() => elegir(oferta.reemplazo.id)}>
            Usar la real
          </button>
          <button type="button" className="secundario" onClick={() => setOferta(null)}>
            Mantener esta medida
          </button>
        </div>
      )}
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

/** "Distribuir automáticamente": pide confirmación si ya hay algo dibujado, porque reemplaza rieles y canaletas. */
function BotonDistribuir() {
  const elementos = useEditor((s) => s.proyecto.elementos);
  const ctx = useContexto();
  const [confirmando, setConfirmando] = useState(false);
  if (!ctx) return null;

  const aparatos = elementos.filter((e) => ctx.comps.get(e.componenteId)?.montaje === 'riel').length;
  const lineales = elementos.filter((e) => ctx.comps.get(e.componenteId)?.montaje === 'lineal').length;
  const ejecutar = () => {
    setConfirmando(false);
    useEditor.getState().distribuirAutomaticamente();
  };

  if (confirmando) {
    return (
      <div className="grupo-barra confirmar-distribucion" role="alertdialog" aria-label="Confirmar distribución automática">
        <span className="hint">
          Se reemplazarán {lineales} riel(es)/canaleta(s) por la distribución automática y se reubicarán {aparatos} aparato(s) en el riel más cercano, en su orden. Si alguno no cabe, no se cambia nada.
        </span>
        <button type="button" onClick={ejecutar}>
          Aplicar
        </button>
        <button type="button" onClick={() => setConfirmando(false)}>
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => (elementos.length > 0 ? setConfirmando(true) : ejecutar())}
      title="Coloca canaletas y un riel por fila según el margen, modo y sección de canaleta actuales."
    >
      Distribuir automáticamente
    </button>
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
      <BotonDistribuir />
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
  const topes = useEditor((s) => s.proyecto.topesAutomaticos);
  const setTopes = useEditor((s) => s.setTopes);

  return (
    <div className="barra-herramientas">
      <div className="fila-barra">
        {gabinetes && <SelectorCaja gabinetes={gabinetes} />}
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
          <button
            type="button"
            aria-pressed={topes}
            onClick={() => setTopes(!topes)}
            title="Topes de riel automáticos: 2 por riel con aparatos (uno a cada extremo del grupo). Apagados, no se dibujan ni se cuentan en la lista."
          >
            Topes de riel
          </button>
        </div>
      </div>
      <div className="fila-barra">
        <Seleccion />
      </div>
    </div>
  );
}
