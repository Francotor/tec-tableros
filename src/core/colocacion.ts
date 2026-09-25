import type { CajaResuelta, FijacionMm } from './caja';
import { calcularAreaUtil, calcularCapacidad } from './capacidad';
import type { Capacidad, Margenes, Modo, SeccionCanaleta } from './capacidad';
import { contiene, distanciaARect, redondear, solapan } from './geometria';
import type { Punto, Rect } from './geometria';
import { largoPorDefecto, nuevoUid } from './modelo';
import type { Elemento } from './modelo';
import type { Catalogo, Componente, ComponenteRiel, ParametrosLayout } from './tipos';

export const RIEL_DIN_ID = 'riel_din';
export const TOPE_ID = 'tope_riel';
/** Distancia máxima a la que un aparato se imanta al borde de su vecino. */
export const IMAN_MM = 3;

/** Margen, modo y sección de canaleta con los que se calcula la capacidad y el área útil. */
export interface AjustesCapacidad {
  margenes: Margenes;
  modo: Modo;
  seccionCanaleta: SeccionCanaleta;
  parametrosLayout: ParametrosLayout;
  moduloMm: number;
  altoModularMm: number;
  /** true: el proyecto usa topes de riel automáticos. Por defecto false (se activan cuando hacen falta). */
  topes?: boolean;
}

export interface Contexto {
  comps: ReadonlyMap<string, Componente>;
  caja: CajaResuelta;
  /** Alto del riel DIN en pantalla (mm). */
  rielAlto: number;
  margenes: Margenes;
  modo: Modo;
  seccionCanaleta: SeccionCanaleta;
  moduloMm: number;
  /** Alto modular de un aparato de riel (una fila), en mm. */
  altoModularMm: number;
  /** Topes de riel automáticos activos en este proyecto. */
  topes: boolean;
  /** Capacidad de riel con el margen/modo/sección actuales; null en cajas plásticas (rieles fijos). */
  capacidad: Capacidad | null;
  /** Placa reducida por el margen de borde: referencia para largos por defecto, no un límite duro. */
  areaUtil: Rect;
}

export function crearContexto(catalogo: Catalogo, caja: CajaResuelta, ajustes: AjustesCapacidad): Contexto {
  const comps = new Map(catalogo.componentes.map((c) => [c.id, c]));
  const capacidad = caja.permiteRieles
    ? calcularCapacidad(
        caja.area.w,
        caja.area.h,
        ajustes.margenes,
        ajustes.modo,
        ajustes.seccionCanaleta,
        ajustes.parametrosLayout,
        ajustes.moduloMm,
        ajustes.altoModularMm,
      )
    : null;
  return {
    comps,
    caja,
    rielAlto: comps.get(RIEL_DIN_ID)?.alto_mm ?? catalogo.riel_din_ancho_mm,
    margenes: ajustes.margenes,
    modo: ajustes.modo,
    seccionCanaleta: ajustes.seccionCanaleta,
    moduloMm: ajustes.moduloMm,
    altoModularMm: ajustes.altoModularMm,
    topes: ajustes.topes ?? false,
    capacidad,
    areaUtil: calcularAreaUtil(caja.area, ajustes.margenes),
  };
}

export interface RielInfo {
  uid: string;
  incluido: boolean;
  x: number;
  yCentro: number;
  largo: number;
  rect: Rect;
}

export type ClasePieza = 'riel' | 'aparato' | 'canaleta' | 'libre';

/** Cualquier cosa que ocupa espacio en la placa, vista de forma uniforme. */
export interface Pieza {
  uid: string;
  clase: ClasePieza;
  rect: Rect;
  /** Para aparatos de riel: el riel donde están montados. */
  rielUid?: string;
}

export interface Solicitud {
  comp: Componente;
  /** Punto del puntero: el centro deseado del elemento. */
  punto: Punto;
  actual?: Elemento;
  largo_mm?: number;
  rotacion?: 0 | 90;
  /** Movimiento fino (flechas): sin rejilla ni imán. */
  sinSnap?: boolean;
  /** uids que no cuentan como obstáculo (el propio elemento y, si es un riel, sus aparatos). */
  excluir?: ReadonlySet<string>;
}

export type Colocacion =
  | { ok: true; x_mm: number; y_mm: number; largo_mm?: number; rotacion?: 0 | 90; rielUid?: string }
  | { ok: false; motivo: string };

/** Mensaje de error si el largo no es válido para el lineal; null si lo es. */
export function validarLargo(comp: Componente, largo: number): string | null {
  if (comp.montaje !== 'lineal') return 'Solo los rieles y canaletas tienen largo.';
  if (!Number.isInteger(largo)) return 'El largo debe ser un número entero de milímetros.';
  if (largo < comp.largo_min_mm || largo > comp.largo_max_mm) {
    return `El largo debe estar entre ${comp.largo_min_mm} y ${comp.largo_max_mm} mm.`;
  }
  return null;
}

const fallo = (motivo: string): { ok: false; motivo: string } => ({ ok: false, motivo });

export const MOTIVOS = {
  sinRiel: 'No hay ningún riel donde montar este aparato. Agrega primero un riel DIN.',
  fueraRiel: 'El aparato queda fuera del riel.',
  fueraArea: 'Queda fuera del área de trabajo de la caja.',
  colision: 'Se superpone con otro elemento.',
  cajaConRieles: 'Esta caja trae sus rieles incluidos: no se pueden agregar ni quitar.',
  fijacion: 'Se superpone con una fijación de la caja (perno).',
};

/** true si el rectángulo invade alguna fijación (perno) de la caja. */
export function colisionaConFijaciones(rect: Rect, fijaciones: readonly FijacionMm[]): boolean {
  return fijaciones.some((f) => distanciaARect({ x: f.x, y: f.y }, rect) < f.r - 0.01);
}

// ---------------------------------------------------------------- geometría de elementos

export function huella(el: Elemento, comp: Componente): Rect {
  if (comp.montaje === 'lineal') {
    const largo = el.largo_mm ?? largoPorDefecto(comp);
    return (el.rotacion ?? 0) === 90
      ? { x: el.x_mm, y: el.y_mm, w: comp.alto_mm, h: largo }
      : { x: el.x_mm, y: el.y_mm, w: largo, h: comp.alto_mm };
  }
  return { x: el.x_mm, y: el.y_mm, w: comp.ancho_mm, h: comp.alto_mm };
}

export function esRiel(comp: Componente): boolean {
  return comp.montaje === 'lineal' && comp.id === RIEL_DIN_ID;
}

export function esCanaleta(comp: Componente): boolean {
  return comp.montaje === 'lineal' && comp.id !== RIEL_DIN_ID;
}

export function listarRieles(elementos: readonly Elemento[], ctx: Contexto): RielInfo[] {
  const rieles: RielInfo[] = ctx.caja.rielesIncluidos.map((r, i) => ({
    uid: `incl:${i}`,
    incluido: true,
    x: r.x,
    yCentro: r.yCentro,
    largo: r.largo,
    rect: { x: r.x, y: r.yCentro - ctx.rielAlto / 2, w: r.largo, h: ctx.rielAlto },
  }));
  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (!comp || !esRiel(comp)) continue;
    const rect = huella(el, comp);
    rieles.push({
      uid: el.uid,
      incluido: false,
      x: rect.x,
      yCentro: rect.y + rect.h / 2,
      largo: rect.w,
      rect,
    });
  }
  return rieles;
}

/** Riel al que pertenece un aparato: misma línea central y dentro de su largo. */
export function rielDe(el: Elemento, comp: ComponenteRiel, rieles: readonly RielInfo[]): RielInfo | undefined {
  return rieles.find(
    (r) =>
      Math.abs(el.y_mm + comp.riel_y_mm - r.yCentro) < 0.5 &&
      el.x_mm >= r.x - 0.01 &&
      el.x_mm + comp.ancho_mm <= r.x + r.largo + 0.01,
  );
}

export function listarPiezas(elementos: readonly Elemento[], ctx: Contexto): Pieza[] {
  const rieles = listarRieles(elementos, ctx);
  const piezas: Pieza[] = rieles.filter((r) => r.incluido).map((r) => ({ uid: r.uid, clase: 'riel', rect: r.rect }));
  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (!comp) continue;
    const rect = huella(el, comp);
    if (comp.montaje === 'lineal') {
      piezas.push({ uid: el.uid, clase: esRiel(comp) ? 'riel' : 'canaleta', rect });
    } else if (comp.montaje === 'riel') {
      piezas.push({ uid: el.uid, clase: 'aparato', rect, rielUid: rielDe(el, comp, rieles)?.uid });
    } else {
      piezas.push({ uid: el.uid, clase: 'libre', rect });
    }
  }
  return piezas;
}

/** Un aparato puede solaparse con su propio riel; con cualquier otra cosa, no. */
function solapePermitido(a: Pieza, b: Pieza): boolean {
  const par = (p: Pieza, q: Pieza): boolean => p.clase === 'aparato' && q.clase === 'riel' && p.rielUid === q.uid;
  return par(a, b) || par(b, a);
}

export function buscarColision(cand: Pieza, otras: readonly Pieza[], excluir: ReadonlySet<string>): Pieza | undefined {
  return otras.find((o) => !excluir.has(o.uid) && solapan(cand.rect, o.rect) && !solapePermitido(cand, o));
}

/** Riel más cercano al punto (distancia al rectángulo del riel). */
export function rielMasCercano(punto: Punto, rieles: readonly RielInfo[]): RielInfo | undefined {
  let mejor: RielInfo | undefined;
  let dMejor = Infinity;
  for (const r of rieles) {
    const d = distanciaARect(punto, r.rect);
    if (d < dMejor) {
      dMejor = d;
      mejor = r;
    }
  }
  return mejor;
}

// ---------------------------------------------------------------- ajuste (rejilla e imán)

/** Ajusta la posición x (esquina izquierda) a la rejilla del riel y luego al borde de un vecino. */
export function ajustarEnRiel(
  x: number,
  ancho: number,
  inicioRiel: number,
  pasoMm: number,
  vecinos: readonly Rect[],
): number {
  const enRejilla = inicioRiel + Math.round((x - inicioRiel) / pasoMm) * pasoMm;
  let mejor: { x: number; d: number } | null = null;
  for (const v of vecinos) {
    for (const cand of [v.x + v.w, v.x - ancho]) {
      const d = Math.min(Math.abs(cand - enRejilla), Math.abs(cand - x));
      if (d <= IMAN_MM + 1e-9 && (mejor === null || d < mejor.d)) mejor = { x: cand, d };
    }
  }
  return mejor ? mejor.x : enRejilla;
}

// ---------------------------------------------------------------- colocación

/**
 * Tramo libre, a lo largo del eje del lineal, alrededor de `puntoEje`: parte del área útil y se recorta con las
 * canaletas perpendiculares cuya banda cruza la del lineal nuevo (`banda`, en el eje transversal).
 */
function tramoLibreEntreCanaletas(
  piezas: readonly Pieza[],
  excluir: ReadonlySet<string>,
  horizontal: boolean,
  banda: readonly [number, number],
  puntoEje: number,
  util: readonly [number, number],
): { inicio: number; fin: number; recortado: boolean } {
  let inicio = util[0];
  let fin = util[1];
  let recortado = false;
  for (const p of piezas) {
    if (p.clase !== 'canaleta' || excluir.has(p.uid)) continue;
    const vertical = p.rect.h > p.rect.w;
    if (vertical !== horizontal) continue; // solo las perpendiculares
    const [b0, b1] = horizontal ? [p.rect.y, p.rect.y + p.rect.h] : [p.rect.x, p.rect.x + p.rect.w];
    if (!(b0 < banda[1] - 0.01 && banda[0] < b1 - 0.01)) continue;
    const [o0, o1] = horizontal ? [p.rect.x, p.rect.x + p.rect.w] : [p.rect.y, p.rect.y + p.rect.h];
    if ((o0 + o1) / 2 <= puntoEje) {
      if (o1 > inicio) {
        inicio = o1;
        recortado = true;
      }
    } else if (o0 < fin) {
      fin = o0;
      recortado = true;
    }
  }
  return { inicio, fin, recortado };
}

export function resolverColocacion(elementos: readonly Elemento[], ctx: Contexto, s: Solicitud): Colocacion {
  const { comp } = s;
  const excluir = s.excluir ?? new Set(s.actual ? [s.actual.uid] : []);
  const piezas = listarPiezas(elementos, ctx);
  const area = ctx.caja.area;

  if (comp.montaje === 'riel') {
    const rieles = listarRieles(elementos, ctx).filter((r) => !excluir.has(r.uid));
    const riel = rielMasCercano(s.punto, rieles);
    if (!riel) return fallo(MOTIVOS.sinRiel);
    const y = redondear(riel.yCentro - comp.riel_y_mm);
    let x = s.punto.x - comp.ancho_mm / 2;
    if (!s.sinSnap) {
      const vecinos = piezas
        .filter((p) => p.clase === 'aparato' && p.rielUid === riel.uid && !excluir.has(p.uid))
        .map((p) => p.rect);
      x = ajustarEnRiel(x, comp.ancho_mm, riel.x, comp.snap.paso_mm, vecinos);
    }
    x = redondear(x);
    const rect: Rect = { x, y, w: comp.ancho_mm, h: comp.alto_mm };
    if (x < riel.x - 0.01 || x + rect.w > riel.x + riel.largo + 0.01) return fallo(MOTIVOS.fueraRiel);
    if (!contiene(area, rect)) return fallo(MOTIVOS.fueraArea);
    if (colisionaConFijaciones(rect, ctx.caja.fijaciones)) return fallo(MOTIVOS.fijacion);
    if (buscarColision({ uid: '', clase: 'aparato', rect, rielUid: riel.uid }, piezas, excluir)) {
      return fallo(MOTIVOS.colision);
    }
    return { ok: true, x_mm: x, y_mm: y, rielUid: riel.uid };
  }

  if (comp.montaje === 'libre') {
    const x = s.sinSnap ? s.punto.x - comp.ancho_mm / 2 : Math.round(s.punto.x - comp.ancho_mm / 2);
    const y = s.sinSnap ? s.punto.y - comp.alto_mm / 2 : Math.round(s.punto.y - comp.alto_mm / 2);
    const rect: Rect = { x: redondear(x), y: redondear(y), w: comp.ancho_mm, h: comp.alto_mm };
    if (!contiene(area, rect)) return fallo(MOTIVOS.fueraArea);
    if (colisionaConFijaciones(rect, ctx.caja.fijaciones)) return fallo(MOTIVOS.fijacion);
    if (buscarColision({ uid: '', clase: 'libre', rect }, piezas, excluir)) return fallo(MOTIVOS.colision);
    return { ok: true, x_mm: rect.x, y_mm: rect.y };
  }

  // lineal: riel DIN o canaleta
  const esR = esRiel(comp);
  if (esR && !ctx.caja.permiteRieles) return fallo(MOTIVOS.cajaConRieles);
  const rotacion: 0 | 90 = esR ? 0 : (s.rotacion ?? s.actual?.rotacion ?? 0);
  const disponible = rotacion === 90 ? area.h : area.w;
  // Riel: la cantidad de módulos completos que caben en la caja actual. Canaleta: el ancho o alto
  // útil de la placa (según quede horizontal o vertical). Se acorta si no cabe en la placa física.
  const utilDisponible = rotacion === 90 ? ctx.areaUtil.h : ctx.areaUtil.w;
  const defecto = esR ? (ctx.capacidad ? ctx.capacidad.modulosPorFila * ctx.moduloMm : largoPorDefecto(comp)) : utilDisponible;
  const horizontal = rotacion !== 90;
  const alto = comp.alto_mm;
  let largo: number;
  let inicioForzado: number | null = null;
  if (s.largo_mm !== undefined || s.actual?.largo_mm !== undefined) {
    largo = (s.largo_mm ?? s.actual?.largo_mm) as number;
  } else {
    // Largo por defecto: no debe pisar las canaletas perpendiculares (verticales, si el nuevo es horizontal)
    // que ya cruzan su fila. Se acorta al tramo libre y se coloca pegado a su inicio.
    const centroBanda = (horizontal ? s.punto.y : s.punto.x) - alto / 2;
    const banda: [number, number] = [centroBanda, centroBanda + alto];
    const util: [number, number] = horizontal ? [ctx.areaUtil.x, ctx.areaUtil.x + ctx.areaUtil.w] : [ctx.areaUtil.y, ctx.areaUtil.y + ctx.areaUtil.h];
    const libre = tramoLibreEntreCanaletas(piezas, excluir, horizontal, banda, horizontal ? s.punto.x : s.punto.y, util);
    const tope = libre.recortado ? Math.min(defecto, libre.fin - libre.inicio) : defecto;
    if (libre.recortado) inicioForzado = libre.inicio;
    largo = Math.max(comp.largo_min_mm, Math.min(comp.largo_max_mm, Math.floor(tope), Math.floor(disponible)));
  }
  const errorLargo = validarLargo(comp, largo);
  if (errorLargo) return fallo(errorLargo);
  const w = rotacion === 90 ? comp.alto_mm : largo;
  const h = rotacion === 90 ? largo : comp.alto_mm;
  let x = s.sinSnap ? s.punto.x - w / 2 : Math.round(s.punto.x - w / 2);
  let y = s.sinSnap ? s.punto.y - h / 2 : Math.round(s.punto.y - h / 2);
  if (inicioForzado !== null) {
    if (horizontal) x = Math.ceil(inicioForzado - 0.01);
    else y = Math.ceil(inicioForzado - 0.01);
  }
  const rect: Rect = { x: redondear(x), y: redondear(y), w, h };
  if (!contiene(area, rect)) return fallo(MOTIVOS.fueraArea);
  if (colisionaConFijaciones(rect, ctx.caja.fijaciones)) return fallo(MOTIVOS.fijacion);
  if (buscarColision({ uid: s.actual?.uid ?? '', clase: esR ? 'riel' : 'canaleta', rect }, piezas, excluir)) {
    return fallo(MOTIVOS.colision);
  }
  return { ok: true, x_mm: rect.x, y_mm: rect.y, largo_mm: largo, rotacion };
}

// ---------------------------------------------------------------- operaciones sobre el proyecto

export type Cambio = { ok: true; elementos: Elemento[]; uid?: string } | { ok: false; motivo: string };

function aElemento(base: Elemento, r: Extract<Colocacion, { ok: true }>, comp: Componente): Elemento {
  const el: Elemento = { ...base, x_mm: r.x_mm, y_mm: r.y_mm };
  if (comp.montaje === 'lineal') {
    el.largo_mm = r.largo_mm;
    if (esCanaleta(comp)) el.rotacion = r.rotacion;
  }
  return el;
}

/** Agrega un elemento nuevo centrado en `punto` (con rejilla e imán). */
export function agregarElemento(
  elementos: readonly Elemento[],
  ctx: Contexto,
  componenteId: string,
  punto: Punto,
  valores: Elemento['valores'],
): Cambio {
  const comp = ctx.comps.get(componenteId);
  if (!comp) return fallo(`Componente desconocido: ${componenteId}`);
  const r = resolverColocacion(elementos, ctx, { comp, punto });
  if (!r.ok) return r;
  const base: Elemento = { uid: nuevoUid(), componenteId, x_mm: 0, y_mm: 0, valores };
  const nuevo = aElemento(base, r, comp);
  return { ok: true, elementos: [...elementos, nuevo], uid: nuevo.uid };
}

function hijosDeRiel(elementos: readonly Elemento[], ctx: Contexto, rielUid: string): Elemento[] {
  const piezas = listarPiezas(elementos, ctx);
  const uids = new Set(piezas.filter((p) => p.clase === 'aparato' && p.rielUid === rielUid).map((p) => p.uid));
  return elementos.filter((e) => uids.has(e.uid));
}

/** Mueve un elemento para que su centro quede en `punto`. Un riel arrastra a sus aparatos. */
export function moverElemento(
  elementos: readonly Elemento[],
  ctx: Contexto,
  uid: string,
  punto: Punto,
  opciones: { sinSnap?: boolean } = {},
): Cambio {
  const el = elementos.find((e) => e.uid === uid);
  const comp = el && ctx.comps.get(el.componenteId);
  if (!el || !comp) return fallo('Elemento no encontrado.');
  const hijos = esRiel(comp) ? hijosDeRiel(elementos, ctx, uid) : [];
  const grupo = new Set([uid, ...hijos.map((h) => h.uid)]);
  const r = resolverColocacion(elementos, ctx, { comp, punto, actual: el, excluir: grupo, sinSnap: opciones.sinSnap });
  if (!r.ok) return r;
  const movido = aElemento(el, r, comp);
  const dx = movido.x_mm - el.x_mm;
  const dy = movido.y_mm - el.y_mm;
  const reemplazos = new Map<string, Elemento>([[uid, movido]]);
  if (hijos.length > 0) {
    const otras = listarPiezas(elementos, ctx);
    for (const h of hijos) {
      const hc = ctx.comps.get(h.componenteId);
      if (!hc) continue;
      const nh = { ...h, x_mm: redondear(h.x_mm + dx), y_mm: redondear(h.y_mm + dy) };
      const rect = huella(nh, hc);
      if (!contiene(ctx.caja.area, rect)) return fallo(MOTIVOS.fueraArea);
      if (colisionaConFijaciones(rect, ctx.caja.fijaciones)) return fallo(MOTIVOS.fijacion);
      if (buscarColision({ uid: h.uid, clase: 'libre', rect }, otras, grupo)) return fallo(MOTIVOS.colision);
      reemplazos.set(h.uid, nh);
    }
  }
  return { ok: true, elementos: elementos.map((e) => reemplazos.get(e.uid) ?? e), uid };
}

/** Cambia el largo de un lineal conservando su esquina superior izquierda. */
export function cambiarLargo(elementos: readonly Elemento[], ctx: Contexto, uid: string, largo: number): Cambio {
  const el = elementos.find((e) => e.uid === uid);
  const comp = el && ctx.comps.get(el.componenteId);
  if (!el || !comp || comp.montaje !== 'lineal') return fallo('Solo los rieles y canaletas tienen largo.');
  const invalido = validarLargo(comp, largo);
  if (invalido) return fallo(invalido);
  if (esRiel(comp)) {
    const rect = huella(el, comp);
    const hijos = hijosDeRiel(elementos, ctx, uid);
    if (hijos.some((h) => h.x_mm + (ctx.comps.get(h.componenteId) as ComponenteRiel).ancho_mm > rect.x + largo + 0.01)) {
      return fallo('Hay aparatos que quedarían fuera del riel con ese largo.');
    }
  }
  const rotacion = el.rotacion ?? 0;
  const w = rotacion === 90 ? comp.alto_mm : largo;
  const h = rotacion === 90 ? largo : comp.alto_mm;
  const r = resolverColocacion(elementos, ctx, {
    comp,
    punto: { x: el.x_mm + w / 2, y: el.y_mm + h / 2 },
    actual: el,
    largo_mm: largo,
    sinSnap: true,
  });
  if (!r.ok) return r;
  return { ok: true, elementos: elementos.map((e) => (e.uid === uid ? aElemento(e, r, comp) : e)), uid };
}

export type Extremo = 'inicio' | 'fin';

/**
 * Cambia el largo de un lineal moviendo un solo extremo ('inicio': su esquina superior/izquierda;
 * 'fin': la opuesta); el otro extremo queda fijo. `coordenada` es la nueva posición de ese extremo
 * en el eje del lineal (x si está horizontal, y si está vertical), en mm.
 */
export function cambiarLargoDesdeExtremo(
  elementos: readonly Elemento[],
  ctx: Contexto,
  uid: string,
  extremo: Extremo,
  coordenada: number,
): Cambio {
  const el = elementos.find((e) => e.uid === uid);
  const comp = el && ctx.comps.get(el.componenteId);
  if (!el || !comp || comp.montaje !== 'lineal') return fallo('Solo los rieles y canaletas tienen largo.');
  const r0 = huella(el, comp);
  const rotacion = el.rotacion ?? 0;
  const inicioActual = rotacion === 90 ? r0.y : r0.x;
  const finActual = inicioActual + (rotacion === 90 ? r0.h : r0.w);
  const nuevoInicio = Math.round(extremo === 'inicio' ? coordenada : inicioActual);
  const nuevoFin = Math.round(extremo === 'fin' ? coordenada : finActual);
  const largo = nuevoFin - nuevoInicio;
  const invalido = validarLargo(comp, largo);
  if (invalido) return fallo(invalido);
  if (esRiel(comp)) {
    const hijos = hijosDeRiel(elementos, ctx, uid);
    const fueraDeRango = (h: Elemento): boolean => {
      const ancho = (ctx.comps.get(h.componenteId) as ComponenteRiel).ancho_mm;
      return h.x_mm < nuevoInicio - 0.01 || h.x_mm + ancho > nuevoFin + 0.01;
    };
    if (hijos.some(fueraDeRango)) return fallo('Hay aparatos que quedarían fuera del riel con ese largo.');
  }
  const w = rotacion === 90 ? comp.alto_mm : largo;
  const h = rotacion === 90 ? largo : comp.alto_mm;
  const x = rotacion === 90 ? el.x_mm : nuevoInicio;
  const y = rotacion === 90 ? nuevoInicio : el.y_mm;
  const r = resolverColocacion(elementos, ctx, {
    comp,
    punto: { x: x + w / 2, y: y + h / 2 },
    actual: el,
    largo_mm: largo,
    rotacion,
    sinSnap: true,
  });
  if (!r.ok) return r;
  return { ok: true, elementos: elementos.map((e) => (e.uid === uid ? aElemento(e, r, comp) : e)), uid };
}

/**
 * Extiende un lineal hasta el obstáculo más cercano a cada lado: el borde de la placa con el
 * margen de borde, o una canaleta perpendicular (vertical si el lineal es horizontal, y viceversa).
 * Nunca mueve ni recorta otra cosa: si el resultado choca con algo no considerado aquí (un aparato,
 * una canaleta paralela, una fijación), se rechaza igual que cualquier otra colocación.
 */
export function extenderAAreaUtil(elementos: readonly Elemento[], ctx: Contexto, uid: string): Cambio {
  const el = elementos.find((e) => e.uid === uid);
  const comp = el && ctx.comps.get(el.componenteId);
  if (!el || !comp || comp.montaje !== 'lineal') return fallo('Solo los rieles y canaletas se pueden extender.');
  const r0 = huella(el, comp);
  const rotacion = el.rotacion ?? 0;
  const horizontal = rotacion !== 90;

  // Obstáculos: solo las canaletas perpendiculares cuya banda se cruza con la del elemento.
  const bandaSolapa = (o: Rect): boolean =>
    horizontal ? o.y < r0.y + r0.h - 0.01 && r0.y < o.y + o.h - 0.01 : o.x < r0.x + r0.w - 0.01 && r0.x < o.x + o.w - 0.01;
  const obstaculos = elementos.flatMap((otro) => {
    if (otro.uid === uid) return [];
    const c = ctx.comps.get(otro.componenteId);
    if (!c || !esCanaleta(c)) return [];
    const otroHorizontal = (otro.rotacion ?? 0) !== 90;
    if (otroHorizontal === horizontal) return [];
    const rect = huella(otro, c);
    return bandaSolapa(rect) ? [rect] : [];
  });

  const inicioActual = horizontal ? r0.x : r0.y;
  const finActual = inicioActual + (horizontal ? r0.w : r0.h);
  const bordeInicio = horizontal ? ctx.areaUtil.x : ctx.areaUtil.y;
  const bordeFin = bordeInicio + (horizontal ? ctx.areaUtil.w : ctx.areaUtil.h);

  let nuevoInicio = bordeInicio;
  let nuevoFin = bordeFin;
  for (const o of obstaculos) {
    const oInicio = horizontal ? o.x : o.y;
    const oFin = oInicio + (horizontal ? o.w : o.h);
    if (oFin <= inicioActual + 0.01) nuevoInicio = Math.max(nuevoInicio, oFin);
    if (oInicio >= finActual - 0.01) nuevoFin = Math.min(nuevoFin, oInicio);
  }
  nuevoInicio = Math.round(nuevoInicio);
  nuevoFin = Math.round(nuevoFin);
  const largo = nuevoFin - nuevoInicio;
  if (largo <= 0) return fallo('No hay espacio para extender.');
  const invalido = validarLargo(comp, largo);
  if (invalido) return fallo(invalido);
  if (esRiel(comp)) {
    const hijos = hijosDeRiel(elementos, ctx, uid);
    const fueraDeRango = (h: Elemento): boolean => {
      const ancho = (ctx.comps.get(h.componenteId) as ComponenteRiel).ancho_mm;
      return h.x_mm < nuevoInicio - 0.01 || h.x_mm + ancho > nuevoFin + 0.01;
    };
    if (hijos.some(fueraDeRango)) return fallo('Hay aparatos que quedarían fuera del riel con ese largo.');
  }
  const w = horizontal ? largo : comp.alto_mm;
  const h = horizontal ? comp.alto_mm : largo;
  const x = horizontal ? nuevoInicio : el.x_mm;
  const y = horizontal ? el.y_mm : nuevoInicio;
  const r = resolverColocacion(elementos, ctx, {
    comp,
    punto: { x: x + w / 2, y: y + h / 2 },
    actual: el,
    largo_mm: largo,
    rotacion,
    sinSnap: true,
  });
  if (!r.ok) return r;
  return { ok: true, elementos: elementos.map((e) => (e.uid === uid ? aElemento(e, r, comp) : e)), uid };
}

/** Mueve un lineal a una nueva posición X, conservando su Y. Un riel arrastra a sus aparatos, como al arrastrarlo con el mouse. */
export function moverX(elementos: readonly Elemento[], ctx: Contexto, uid: string, nuevoX: number): Cambio {
  const el = elementos.find((e) => e.uid === uid);
  const comp = el && ctx.comps.get(el.componenteId);
  if (!el || !comp || comp.montaje !== 'lineal') return fallo('Solo los rieles y canaletas tienen esta posición editable.');
  const r0 = huella(el, comp);
  return moverElemento(elementos, ctx, uid, { x: Math.round(nuevoX) + r0.w / 2, y: r0.y + r0.h / 2 }, { sinSnap: true });
}

/** Gira una canaleta 0° ↔ 90° alrededor de su centro. */
export function rotarElemento(elementos: readonly Elemento[], ctx: Contexto, uid: string): Cambio {
  const el = elementos.find((e) => e.uid === uid);
  const comp = el && ctx.comps.get(el.componenteId);
  if (!el || !comp || !esCanaleta(comp)) return fallo('Solo las canaletas se pueden girar.');
  const r0 = huella(el, comp);
  const nueva: 0 | 90 = (el.rotacion ?? 0) === 90 ? 0 : 90;
  const r = resolverColocacion(elementos, ctx, {
    comp,
    punto: { x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 },
    actual: el,
    rotacion: nueva,
  });
  if (!r.ok) return r;
  return { ok: true, elementos: elementos.map((e) => (e.uid === uid ? aElemento(e, r, comp) : e)), uid };
}

/** Borra un elemento; si es un riel, borra también los aparatos montados en él. */
export function borrarElemento(elementos: readonly Elemento[], ctx: Contexto, uid: string): Cambio {
  const el = elementos.find((e) => e.uid === uid);
  const comp = el && ctx.comps.get(el.componenteId);
  if (!el || !comp) return fallo('Elemento no encontrado.');
  const quitar = new Set([uid]);
  if (esRiel(comp)) for (const h of hijosDeRiel(elementos, ctx, uid)) quitar.add(h.uid);
  return { ok: true, elementos: elementos.filter((e) => !quitar.has(e.uid)) };
}

/** Duplica un elemento en el primer lugar libre: al lado (aparatos) o desplazado (el resto). */
export function duplicarElemento(elementos: readonly Elemento[], ctx: Contexto, uid: string): Cambio {
  const el = elementos.find((e) => e.uid === uid);
  const comp = el && ctx.comps.get(el.componenteId);
  if (!el || !comp) return fallo('Elemento no encontrado.');
  const r0 = huella(el, comp);
  const copia = (x: number, y: number): Elemento => ({ ...el, uid: nuevoUid(), x_mm: x, y_mm: y, valores: { ...el.valores } });
  const sinLugar = fallo('No hay espacio libre para duplicar.');

  if (comp.montaje === 'riel') {
    const riel = rielDe(el, comp, listarRieles(elementos, ctx));
    if (!riel) return sinLugar;
    const inicios = [r0.x + r0.w];
    for (let x = riel.x; x + r0.w <= riel.x + riel.largo + 0.01; x += 1) inicios.push(x);
    for (const x of inicios) {
      const r = resolverColocacion(elementos, ctx, {
        comp,
        punto: { x: x + r0.w / 2, y: r0.y + r0.h / 2 },
        sinSnap: true,
      });
      if (r.ok && Math.abs(r.x_mm - x) < 0.01) {
        const nuevo = copia(r.x_mm, r.y_mm);
        return { ok: true, elementos: [...elementos, nuevo], uid: nuevo.uid };
      }
    }
    return sinLugar;
  }

  const paso = 10;
  const desplazamientos: [number, number][] = [
    [0, r0.h + paso],
    [r0.w + paso, 0],
    [0, -(r0.h + paso)],
    [-(r0.w + paso), 0],
    [20, 20],
  ];
  for (const [dx, dy] of desplazamientos) {
    const r = resolverColocacion(elementos, ctx, {
      comp,
      punto: { x: r0.x + dx + r0.w / 2, y: r0.y + dy + r0.h / 2 },
      largo_mm: el.largo_mm,
      rotacion: el.rotacion,
      sinSnap: true,
    });
    if (r.ok) {
      const nuevo = aElemento(copia(r.x_mm, r.y_mm), r, comp);
      return { ok: true, elementos: [...elementos, nuevo], uid: nuevo.uid };
    }
  }
  return sinLugar;
}

// ---------------------------------------------------------------- lectura

/** uids de los elementos que no caben en el área de la caja actual o no tienen riel. */
export function elementosFuera(elementos: readonly Elemento[], ctx: Contexto): Set<string> {
  const fuera = new Set<string>();
  for (const p of listarPiezas(elementos, ctx)) {
    if (p.uid.startsWith('incl:')) continue;
    if (!contiene(ctx.caja.area, p.rect) || (p.clase === 'aparato' && p.rielUid === undefined)) fuera.add(p.uid);
  }
  return fuera;
}

export interface Tope {
  rielUid: string;
  rect: Rect;
}

/** Dos topes automáticos por riel con aparatos: uno a cada extremo del grupo. */
export function calcularTopes(elementos: readonly Elemento[], ctx: Contexto): Tope[] {
  if (!ctx.topes) return [];
  const tope = ctx.comps.get(TOPE_ID);
  const w = tope?.ancho_mm ?? 8;
  const h = tope?.alto_mm ?? 45;
  const yRel = tope && tope.montaje === 'riel' ? tope.riel_y_mm : h / 2;
  const piezas = listarPiezas(elementos, ctx);
  const res: Tope[] = [];
  for (const r of listarRieles(elementos, ctx)) {
    const grupo = piezas.filter((p) => p.clase === 'aparato' && p.rielUid === r.uid);
    if (grupo.length === 0) continue;
    const minX = Math.min(...grupo.map((p) => p.rect.x));
    const maxX = Math.max(...grupo.map((p) => p.rect.x + p.rect.w));
    const y = r.yCentro - yRel;
    res.push({ rielUid: r.uid, rect: { x: minX - w, y, w, h } }, { rielUid: r.uid, rect: { x: maxX, y, w, h } });
  }
  return res;
}
