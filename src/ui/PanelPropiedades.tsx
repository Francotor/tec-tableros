import { useState } from 'react';
import { esCanaleta, huella, validarLargo } from '../core/colocacion';
import { formatearMm } from '../core/biblioteca';
import { candidatosPadre, puedeConectarse } from '../core/conexion';
import { descripcionElemento, valoresEfectivos, interpretarValor } from '../core/etiquetas';
import type { Elemento } from '../core/modelo';
import type { Campo, Componente } from '../core/tipos';
import { useContexto, useEditor } from '../store/editor';

const SIN_PADRE = '__sin_padre__';
const SIN_CIRCUITO = '__sin_circuito__';

function CampoAlimentadoPor({ el }: { el: Elemento }) {
  const ctx = useContexto();
  const elementos = useEditor((s) => s.proyecto.elementos);
  const alimentarDesde = useEditor((s) => s.alimentarDesde);
  const id = `campo-${el.uid}-alimentado-por`;
  if (!ctx) return null;
  const candidatos = candidatosPadre(elementos, ctx, el.uid);
  const textoElemento = (c: Elemento): string => {
    const comp = ctx.comps.get(c.componenteId);
    return comp ? descripcionElemento(comp, c) : c.componenteId;
  };

  return (
    <label className="campo" htmlFor={id}>
      Alimentado por
      <select
        id={id}
        value={el.alimentadoPor ?? SIN_PADRE}
        onChange={(e) => alimentarDesde(el.uid, e.target.value === SIN_PADRE ? null : e.target.value)}
      >
        <option value={SIN_PADRE}>Sin alimentación (raíz)</option>
        {candidatos.map((c) => (
          <option key={c.uid} value={c.uid}>
            {textoElemento(c)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CampoCircuito({ el }: { el: Elemento }) {
  const circuitos = useEditor((s) => s.proyecto.circuitos);
  const asignarCircuito = useEditor((s) => s.asignarCircuito);
  const id = `campo-${el.uid}-circuito`;

  return (
    <label className="campo" htmlFor={id}>
      Circuito
      <select
        id={id}
        value={el.circuitoId ?? SIN_CIRCUITO}
        onChange={(e) => asignarCircuito(el.uid, e.target.value === SIN_CIRCUITO ? null : e.target.value)}
      >
        <option value={SIN_CIRCUITO}>Sin circuito</option>
        {circuitos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.numero} · {c.nombre}
          </option>
        ))}
      </select>
      {circuitos.length === 0 && <span className="ayuda">Crea circuitos con el botón "Circuitos" de la barra superior.</span>}
    </label>
  );
}

interface CampoProps {
  uid: string;
  campo: Campo;
  valor: string | number;
}

function CampoEditable({ uid, campo, valor }: CampoProps) {
  const cambiarValor = useEditor((s) => s.cambiarValor);
  const id = `campo-${uid}-${campo.id}`;
  const [texto, setTexto] = useState(String(valor));

  if (campo.tipo === 'select') {
    return (
      <label className="campo" htmlFor={id}>
        {campo.rotulo}
        <select
          id={id}
          value={String(valor)}
          onChange={(e) => {
            const v = interpretarValor(campo, e.target.value);
            if (v !== null) cambiarValor(uid, campo.id, v);
          }}
        >
          {campo.opciones.map((o) => (
            <option key={String(o)} value={String(o)}>
              {String(o)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (campo.tipo === 'texto') {
    return (
      <label className="campo" htmlFor={id}>
        {campo.rotulo}
        <input id={id} type="text" maxLength={12} value={String(valor)} onChange={(e) => cambiarValor(uid, campo.id, e.target.value)} />
      </label>
    );
  }

  const valido = interpretarValor(campo, texto) !== null;
  return (
    <label className="campo" htmlFor={id}>
      {campo.rotulo}
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={texto}
        aria-invalid={!valido}
        onChange={(e) => {
          setTexto(e.target.value);
          const v = interpretarValor(campo, e.target.value);
          if (v !== null) cambiarValor(uid, campo.id, v);
        }}
        onBlur={() => setTexto(String(valor))}
      />
      {!valido && <span className="error-campo">Escribe un número entero.</span>}
    </label>
  );
}

function CampoLargo({ el, comp, largo }: { el: Elemento; comp: Extract<Componente, { montaje: 'lineal' }>; largo: number }) {
  const cambiarLargo = useEditor((s) => s.cambiarLargo);
  const [texto, setTexto] = useState(String(largo));
  const id = `campo-${el.uid}-largo`;
  const error = texto.trim() === '' ? 'Escribe el largo en mm.' : validarLargo(comp, Number(texto));

  const confirmar = () => {
    if (!error && Number(texto) !== largo) cambiarLargo(el.uid, Number(texto));
    setTexto(String(useEditor.getState().proyecto.elementos.find((e) => e.uid === el.uid)?.largo_mm ?? largo));
  };

  return (
    <label className="campo" htmlFor={id}>
      Largo (mm)
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={comp.largo_min_mm}
        max={comp.largo_max_mm}
        value={texto}
        aria-invalid={error !== null}
        aria-describedby={`${id}-ayuda`}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span id={`${id}-ayuda`} className={error ? 'error-campo' : 'ayuda'}>
        {error ?? `Entre ${comp.largo_min_mm} y ${comp.largo_max_mm} mm. Enter para aplicar.`}
      </span>
    </label>
  );
}

function CampoX({ el }: { el: Elemento }) {
  const moverX = useEditor((s) => s.moverX);
  const [texto, setTexto] = useState(String(el.x_mm));
  const id = `campo-${el.uid}-x`;
  const invalido = texto.trim() === '' || !Number.isInteger(Number(texto));

  const confirmar = () => {
    const n = Number(texto);
    if (!invalido && n !== el.x_mm) moverX(el.uid, n);
    setTexto(String(useEditor.getState().proyecto.elementos.find((e) => e.uid === el.uid)?.x_mm ?? el.x_mm));
  };

  return (
    <label className="campo" htmlFor={id}>
      Posición X (mm)
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={texto}
        aria-invalid={invalido}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {invalido && <span className="error-campo">Escribe un número entero de milímetros.</span>}
    </label>
  );
}

function BotonExtender({ el }: { el: Elemento }) {
  const extender = useEditor((s) => s.extender);
  const vertical = (el.rotacion ?? 0) === 90;
  return (
    <button
      type="button"
      onClick={() => extender(el.uid)}
      title="Lleva cada extremo hasta el borde de la placa con margen, o hasta la canaleta perpendicular más cercana."
    >
      Extender al {vertical ? 'alto' : 'ancho'} útil
    </button>
  );
}

/** Girar (solo canaletas), duplicar y borrar el elemento seleccionado, y su posición. */
function AccionesElemento({ el, comp }: { el: Elemento; comp: Componente }) {
  const rotar = useEditor((s) => s.rotar);
  const duplicar = useEditor((s) => s.duplicar);
  const borrar = useEditor((s) => s.borrar);
  const r = huella(el, comp);
  return (
    <div className="acciones-elemento">
      <p className="posicion-elemento">
        x {formatearMm(r.x)} · y {formatearMm(r.y)} mm
      </p>
      <div className="botones-elemento" role="group" aria-label="Acciones del elemento">
        {esCanaleta(comp) && (
          <button type="button" onClick={() => rotar(el.uid)} title="Girar 90° (R)">
            Girar 90°
          </button>
        )}
        <button type="button" onClick={() => duplicar(el.uid)} title="Duplicar (Ctrl+D)">
          Duplicar
        </button>
        <button type="button" className="peligro" onClick={() => borrar(el.uid)} title="Borrar (Supr)">
          Borrar
        </button>
      </div>
    </div>
  );
}

export function PanelPropiedades() {
  const ctx = useContexto();
  const el = useEditor((s) => s.proyecto.elementos.find((e) => e.uid === s.seleccion));
  const comp = el && ctx?.comps.get(el.componenteId);

  if (!el || !comp) {
    return (
      <div>
        <h2>Propiedades</h2>
        <p className="vacio">Selecciona un elemento del tablero para editar sus datos.</p>
      </div>
    );
  }

  const valores = valoresEfectivos(comp, el);
  const editables = comp.campos.filter((c) => !(comp.montaje === 'lineal' && c.id === 'largo'));
  const largoActual = el.largo_mm ?? Number(valores.largo ?? 0);

  return (
    // La clave fuerza a React a desmontar y reconstruir todo el bloque al cambiar de selección,
    // en vez de reutilizar posicionalmente los campos entre elementos con distinta forma de campos
    // (lo que producía un <select> "Alimentado por" fantasma del elemento anterior).
    <div key={el.uid}>
      <h2>{comp.nombre}</h2>
      <AccionesElemento el={el} comp={comp} />
      {comp.notas && <p className="sub">{comp.notas}</p>}
      {/* La clave incluye el uid para reiniciar el estado local al cambiar de selección. */}
      {comp.montaje === 'lineal' && (
        <>
          <CampoLargo key={`${el.uid}:${largoActual}`} el={el} comp={comp} largo={largoActual} />
          <CampoX key={`${el.uid}:${el.x_mm}`} el={el} />
          <BotonExtender el={el} />
        </>
      )}
      {editables.map((c) => (
        <CampoEditable key={`${el.uid}:${c.id}`} uid={el.uid} campo={c} valor={valores[c.id] ?? c.defecto} />
      ))}
      {editables.length === 0 && comp.montaje !== 'lineal' && <p className="vacio">Esta pieza no tiene datos editables.</p>}
      {puedeConectarse(comp) && <CampoAlimentadoPor key={`${el.uid}:${el.alimentadoPor ?? ''}`} el={el} />}
      <CampoCircuito key={`${el.uid}:${el.circuitoId ?? ''}`} el={el} />
    </div>
  );
}
