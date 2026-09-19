import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Vector2d } from 'konva/lib/types';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { Group, Image as KImage, Layer, Rect, Shape, Stage, Text } from 'react-konva';
import { calcularTopes, elementosFuera, esRiel, huella, listarRieles, moverElemento, TOPE_ID } from '../core/colocacion';
import type { Contexto } from '../core/colocacion';
import type { Rect as Rectangulo } from '../core/geometria';
import { lineasEtiqueta, tamanoAjustado } from '../core/etiquetas';
import type { Elemento } from '../core/modelo';
import type { Componente } from '../core/tipos';
import { contextoActual, useContexto, useEditor } from '../store/editor';
import { registrarGeneradorPng } from './exportacion';
import { cargarLineales, textoDeBiblioteca, useImagen } from './imagenes';

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 12;
const AZUL = '#296099'; // --tec-azul-brillo
const ROJO = '#C62828';
export const TIPO_ARRASTRE = 'application/x-tec-componente';

interface ImagenProps {
  clave: string;
  obtener: () => Promise<string>;
  w: number;
  h: number;
}

/** Dibuja un SVG de la biblioteca a escala real (1 unidad = 1 mm). */
function Imagen({ clave, obtener, w, h }: ImagenProps) {
  const img = useImagen(clave, obtener, w, h);
  return img ? (
    <KImage image={img} width={w} height={h} listening={false} />
  ) : (
    <Rect width={w} height={h} fill="rgba(143,145,150,0.25)" listening={false} />
  );
}

/** Imagen de un componente del catálogo, con el largo real de los lineales. */
function ImagenComponente({ comp, largo }: { comp: Componente; largo: number }) {
  if (comp.montaje !== 'lineal') {
    return <Imagen clave={comp.svg} obtener={() => textoDeBiblioteca(comp.svg)} w={comp.ancho_mm} h={comp.alto_mm} />;
  }
  if (esRiel(comp)) {
    return (
      <Imagen clave={`riel:${largo}`} obtener={async () => (await cargarLineales()).rielSVG(largo)} w={largo} h={comp.alto_mm} />
    );
  }
  return (
    <Imagen
      clave={`canaleta:${largo}:${comp.alto_mm}`}
      obtener={async () => (await cargarLineales()).canaletaSVG(largo, comp.alto_mm)}
      w={largo}
      h={comp.alto_mm}
    />
  );
}

interface ElementoKonvaProps {
  el: Elemento;
  comp: Componente;
  seleccionado: boolean;
  fuera: boolean;
  onSeleccionar: (uid: string) => void;
  onArrastre: (el: Elemento, comp: Componente, x: number, y: number) => void;
  onSoltar: (el: Elemento, comp: Componente, nodo: Konva.Node) => void;
}

const ElementoKonva = memo(function ElementoKonva({ el, comp, seleccionado, fuera, onSeleccionar, onArrastre, onSoltar }: ElementoKonvaProps) {
  const r = huella(el, comp);
  const girado = comp.montaje === 'lineal' && (el.rotacion ?? 0) === 90;
  const largo = comp.montaje === 'lineal' ? (girado ? r.h : r.w) : 0;
  const etiqueta = 'etiqueta' in comp ? comp.etiqueta : null;
  const lineas = etiqueta ? lineasEtiqueta(comp, el) : [];
  const elegir = (e: KonvaEventObject<Event>) => {
    // Con una ficha elegida el toque es para colocarla (el escenario lo maneja), no para seleccionar.
    if (useEditor.getState().fichaActiva) return;
    e.cancelBubble = true;
    onSeleccionar(el.uid);
  };
  return (
    <Group
      x={el.x_mm}
      y={el.y_mm}
      draggable
      onClick={elegir}
      onTap={elegir}
      onDragStart={() => onSeleccionar(el.uid)}
      onDragMove={(e) => onArrastre(el, comp, e.target.x(), e.target.y())}
      onDragEnd={(e) => onSoltar(el, comp, e.target)}
    >
      <Rect width={r.w} height={r.h} fill="rgba(0,0,0,0)" />
      {girado ? (
        <Group x={r.w} rotation={90} listening={false}>
          <ImagenComponente comp={comp} largo={largo} />
        </Group>
      ) : (
        <Group listening={false}>
          <ImagenComponente comp={comp} largo={largo} />
        </Group>
      )}
      {etiqueta &&
        lineas.map((linea, i) => {
          const alto = etiqueta.h / lineas.length;
          return (
            <Text
              key={i}
              x={etiqueta.x}
              y={etiqueta.y + alto * i}
              width={etiqueta.w}
              height={alto}
              align="center"
              verticalAlign="middle"
              wrap="none"
              text={linea}
              fontSize={tamanoAjustado(linea, etiqueta.w, etiqueta.tamano_mm)}
              fontStyle="bold"
              fontFamily="Arial, Helvetica, sans-serif"
              fill="#2B2F36"
              listening={false}
            />
          );
        })}
      {(seleccionado || fuera) && (
        <Rect
          name="marca"
          width={r.w}
          height={r.h}
          stroke={fuera ? ROJO : AZUL}
          strokeWidth={2}
          strokeScaleEnabled={false}
          fill={fuera ? 'rgba(198,40,40,0.25)' : undefined}
          listening={false}
        />
      )}
    </Group>
  );
});

function Cuadricula({ ancho, alto, zoom }: { ancho: number; alto: number; zoom: number }) {
  const lineas = (paso: number) => (c: Konva.Context, forma: Konva.Shape) => {
    c.beginPath();
    for (let x = 0; x <= ancho; x += paso) {
      c.moveTo(x, 0);
      c.lineTo(x, alto);
    }
    for (let y = 0; y <= alto; y += paso) {
      c.moveTo(0, y);
      c.lineTo(ancho, y);
    }
    c.strokeShape(forma);
  };
  return (
    <>
      {zoom >= 1 && (
        <Shape name="cuadricula" sceneFunc={lineas(10)} stroke="rgba(5,33,68,0.10)" strokeWidth={1} strokeScaleEnabled={false} listening={false} />
      )}
      <Shape name="cuadricula" sceneFunc={lineas(50)} stroke="rgba(5,33,68,0.22)" strokeWidth={1} strokeScaleEnabled={false} listening={false} />
    </>
  );
}

function CapaCaja({ ctx, cuadricula, zoom, elementos }: { ctx: Contexto; cuadricula: boolean; zoom: number; elementos: Elemento[] }) {
  const { caja } = ctx;
  const incluidos = listarRieles(elementos, ctx).filter((r) => r.incluido);
  const tope = ctx.comps.get(TOPE_ID);
  const topes = calcularTopes(elementos, ctx);
  return (
    <Layer listening={false}>
      {caja.svg ? (
        <Imagen clave={caja.svg} obtener={() => textoDeBiblioteca(caja.svg ?? '')} w={caja.ancho} h={caja.alto} />
      ) : (
        <>
          <Rect width={caja.ancho} height={caja.alto} fill="#8C95A2" stroke="#6E7784" strokeWidth={0.5} cornerRadius={3} />
          <Rect x={caja.area.x} y={caja.area.y} width={caja.area.w} height={caja.area.h} fill="#DDE1E6" stroke="#B9BFC8" strokeWidth={0.5} />
        </>
      )}
      {cuadricula && <Cuadricula ancho={caja.ancho} alto={caja.alto} zoom={zoom} />}
      {incluidos.map((r) => (
        <Group key={r.uid} x={r.rect.x} y={r.rect.y}>
          <Imagen clave={`riel:${r.largo}`} obtener={async () => (await cargarLineales()).rielSVG(r.largo)} w={r.largo} h={r.rect.h} />
        </Group>
      ))}
      {tope &&
        topes.map((t, i) => (
          <Group key={`${t.rielUid}:${i}`} x={t.rect.x} y={t.rect.y}>
            <Imagen clave={tope.svg} obtener={() => textoDeBiblioteca(tope.svg)} w={t.rect.w} h={t.rect.h} />
          </Group>
        ))}
    </Layer>
  );
}

export function Lienzo() {
  const ctx = useContexto();
  const elementos = useEditor((s) => s.proyecto.elementos);
  const seleccion = useEditor((s) => s.seleccion);
  const cuadricula = useEditor((s) => s.cuadricula);
  const aviso = useEditor((s) => s.aviso);
  const fichaActiva = useEditor((s) => s.fichaActiva);

  const contenedor = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const pinch = useRef<{ dist: number; centro: Vector2d } | null>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [fantasma, setFantasma] = useState<{ rect: Rectangulo; ok: boolean } | null>(null);

  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    const medir = () => setTam({ w: nodo.clientWidth, h: nodo.clientHeight });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(nodo);
    return () => obs.disconnect();
  }, []);

  const ajustar = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !ctx || tam.w === 0) return;
    const margen = 32;
    const s = Math.max(
      ZOOM_MIN,
      Math.min((tam.w - 2 * margen) / ctx.caja.ancho, (tam.h - 2 * margen) / ctx.caja.alto, ZOOM_MAX),
    );
    stage.scale({ x: s, y: s });
    stage.position({ x: (tam.w - ctx.caja.ancho * s) / 2, y: (tam.h - ctx.caja.alto * s) / 2 });
    setZoom(s);
  }, [ctx, tam.w, tam.h]);

  // Encuadra la caja al cargar y cada vez que cambian sus medidas (no al redimensionar la ventana).
  const claveCaja = ctx ? `${ctx.caja.ancho}x${ctx.caja.alto}` : '';
  const ajustarRef = useRef(ajustar);
  useEffect(() => {
    ajustarRef.current = ajustar;
  });
  const listo = tam.w > 0 && claveCaja !== '';
  useEffect(() => {
    if (listo) ajustarRef.current();
  }, [claveCaja, listo]);

  const zoomHacia = useCallback((centro: Vector2d, nuevo: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const viejo = stage.scaleX();
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nuevo));
    const bajo = { x: (centro.x - stage.x()) / viejo, y: (centro.y - stage.y()) / viejo };
    stage.scale({ x: z, y: z });
    stage.position({ x: centro.x - bajo.x * z, y: centro.y - bajo.y * z });
    setZoom(z);
  }, []);

  const centroVista = useCallback((): Vector2d => ({ x: tam.w / 2, y: tam.h / 2 }), [tam.w, tam.h]);

  const alRueda = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!stage || !p) return;
    zoomHacia(p, stage.scaleX() * (e.evt.deltaY < 0 ? 1.1 : 1 / 1.1));
  };

  const alTocarMover = (e: KonvaEventObject<TouchEvent>) => {
    const stage = stageRef.current;
    const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
    if (!stage || !t1 || !t2) return;
    e.evt.preventDefault();
    if (Konva.DD.isDragging) Konva.DD.node?.stopDrag();
    const caja = stage.container().getBoundingClientRect();
    const a = { x: t1.clientX - caja.left, y: t1.clientY - caja.top };
    const b = { x: t2.clientX - caja.left, y: t2.clientY - caja.top };
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const previo = pinch.current;
    pinch.current = { dist, centro };
    if (!previo || previo.dist === 0) return;
    zoomHacia(centro, (stage.scaleX() * dist) / previo.dist);
    stage.position({ x: stage.x() + centro.x - previo.centro.x, y: stage.y() + centro.y - previo.centro.y });
  };

  /** Punto del puntero en milímetros de la caja. */
  const puntoEnCaja = (): Vector2d | null => {
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!stage || !p) return null;
    return stage.getAbsoluteTransform().copy().invert().point(p);
  };

  const alClicVacio = (e: KonvaEventObject<Event>) => {
    const { fichaActiva: ficha, agregar, seleccionar, setFichaActiva } = useEditor.getState();
    if (!ficha && e.target !== e.target.getStage()) return;
    const pt = puntoEnCaja();
    if (ficha && pt) {
      if (agregar(ficha, pt)) setFichaActiva(null);
    } else seleccionar(null);
  };

  const alSoltarFicha = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(TIPO_ARRASTRE) || e.dataTransfer.getData('text/plain');
    const stage = stageRef.current;
    if (!id || !stage) return;
    stage.setPointersPositions(e.nativeEvent);
    const pt = puntoEnCaja();
    if (pt) useEditor.getState().agregar(id, pt);
  };

  const alArrastrar = useCallback(
    (el: Elemento, comp: Componente, x: number, y: number) => {
      if (!ctx) return;
      const r = huella(el, comp);
      const c = moverElemento(elementos, ctx, el.uid, { x: x + r.w / 2, y: y + r.h / 2 });
      const movido = c.ok ? c.elementos.find((e) => e.uid === el.uid) : undefined;
      setFantasma(movido ? { rect: huella(movido, comp), ok: true } : { rect: { x, y, w: r.w, h: r.h }, ok: false });
    },
    [ctx, elementos],
  );

  const alSoltarElemento = useCallback((el: Elemento, comp: Componente, nodo: Konva.Node) => {
    setFantasma(null);
    const r = huella(el, comp);
    const { mover } = useEditor.getState();
    mover(el.uid, { x: nodo.x() + r.w / 2, y: nodo.y() + r.h / 2 });
    // Deja el nodo donde quedó según las reglas (o de vuelta en su sitio si se rechazó).
    const actual = useEditor.getState().proyecto.elementos.find((e) => e.uid === el.uid);
    if (actual) nodo.position({ x: actual.x_mm, y: actual.y_mm });
  }, []);

  // PNG del tablero a escala fija (sin rejilla ni marcas de selección), para exportar.
  useEffect(() => {
    if (!ctx) return;
    registrarGeneradorPng(() => {
      const stage = stageRef.current;
      if (!stage) return null;
      const k = Math.min(6, 4000 / Math.max(ctx.caja.ancho, ctx.caja.alto));
      const previo = { w: stage.width(), h: stage.height(), s: stage.scaleX(), x: stage.x(), y: stage.y() };
      const ocultos = stage.find('.marca, .cuadricula');
      ocultos.forEach((n) => n.visible(false));
      stage.size({ width: ctx.caja.ancho * k, height: ctx.caja.alto * k });
      stage.scale({ x: k, y: k });
      stage.position({ x: 0, y: 0 });
      stage.draw();
      const url = stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
      ocultos.forEach((n) => n.visible(true));
      stage.size({ width: previo.w, height: previo.h });
      stage.scale({ x: previo.s, y: previo.s });
      stage.position({ x: previo.x, y: previo.y });
      stage.draw();
      return url;
    });
    return () => registrarGeneradorPng(null);
  }, [ctx]);

  // Teclado: flechas, suprimir, deshacer/rehacer, duplicar y girar.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      if (destino && /^(INPUT|SELECT|TEXTAREA)$/.test(destino.tagName)) return;
      const st = useEditor.getState();
      const tecla = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && tecla === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.rehacer();
        else st.deshacer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && tecla === 'y') {
        e.preventDefault();
        st.rehacer();
        return;
      }
      const uid = st.seleccion;
      if (!uid) return;
      if ((e.ctrlKey || e.metaKey) && tecla === 'd') {
        e.preventDefault();
        st.duplicar(uid);
      } else if (tecla === 'delete' || tecla === 'backspace') {
        e.preventDefault();
        st.borrar(uid);
      } else if (tecla === 'r') {
        st.rotar(uid);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const paso = e.shiftKey ? 18 : 1;
        const dx = e.key === 'ArrowLeft' ? -paso : e.key === 'ArrowRight' ? paso : 0;
        const dy = e.key === 'ArrowUp' ? -paso : e.key === 'ArrowDown' ? paso : 0;
        const el = st.proyecto.elementos.find((x) => x.uid === uid);
        const comp = el && contextoActual()?.comps.get(el.componenteId);
        if (!el || !comp) return;
        const r = huella(el, comp);
        st.mover(uid, { x: r.x + r.w / 2 + dx, y: r.y + r.h / 2 + dy }, true);
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // El aviso desaparece solo.
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => useEditor.getState().cerrarAviso(), 5000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const fuera = useMemo(() => (ctx ? elementosFuera(elementos, ctx) : new Set<string>()), [ctx, elementos]);
  const ordenados = useMemo(() => {
    if (!ctx) return [];
    // Rieles y canaletas al fondo; aparatos encima.
    const peso = (e: Elemento): number => (ctx.comps.get(e.componenteId)?.montaje === 'lineal' ? 0 : 1);
    return [...elementos].sort((a, b) => peso(a) - peso(b));
  }, [ctx, elementos]);

  const seleccionar = useCallback((uid: string) => useEditor.getState().seleccionar(uid), []);

  return (
    <section
      className="lienzo"
      ref={contenedor}
      onDragOver={(e) => e.preventDefault()}
      onDrop={alSoltarFicha}
      aria-label="Área de dibujo del tablero"
    >
      {ctx && tam.w > 0 && (
        <Stage
          ref={stageRef}
          width={tam.w}
          height={tam.h}
          draggable
          dragDistance={4}
          onWheel={alRueda}
          onTouchMove={alTocarMover}
          onTouchEnd={() => {
            pinch.current = null;
          }}
          onClick={alClicVacio}
          onTap={alClicVacio}
        >
          <CapaCaja ctx={ctx} cuadricula={cuadricula} zoom={zoom} elementos={elementos} />
          <Layer>
            {ordenados.map((el) => {
              const comp = ctx.comps.get(el.componenteId);
              return comp ? (
                <ElementoKonva
                  key={el.uid}
                  el={el}
                  comp={comp}
                  seleccionado={seleccion === el.uid}
                  fuera={fuera.has(el.uid)}
                  onSeleccionar={seleccionar}
                  onArrastre={alArrastrar}
                  onSoltar={alSoltarElemento}
                />
              ) : null;
            })}
            {fantasma && (
              <Rect
                name="marca"
                x={fantasma.rect.x}
                y={fantasma.rect.y}
                width={fantasma.rect.w}
                height={fantasma.rect.h}
                stroke={fantasma.ok ? AZUL : ROJO}
                fill={fantasma.ok ? 'rgba(41,96,153,0.18)' : 'rgba(198,40,40,0.25)'}
                strokeWidth={2}
                strokeScaleEnabled={false}
                dash={[6, 4]}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      )}

      <div className="controles-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomHacia(centroVista(), zoom * 1.25)} aria-label="Acercar">
          +
        </button>
        <button type="button" onClick={() => zoomHacia(centroVista(), zoom / 1.25)} aria-label="Alejar">
          −
        </button>
        <button type="button" onClick={ajustar}>
          Ajustar
        </button>
        <span className="zoom-valor">{Math.round(zoom * 100)} %</span>
      </div>

      {fichaActiva && <div className="pista">Toca el tablero para colocar la pieza elegida.</div>}
      {aviso && (
        <div className={`aviso-flotante ${aviso.tipo}`} role="status" aria-live="polite" key={aviso.id}>
          {aviso.texto}
          <button type="button" onClick={() => useEditor.getState().cerrarAviso()} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}
    </section>
  );
}
