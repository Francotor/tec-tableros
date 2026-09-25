import { buscarColision, colisionaConFijaciones, listarPiezas, listarRieles, rielDe, RIEL_DIN_ID, TOPE_ID, validarLargo } from './colocacion';
import type { Cambio, Contexto } from './colocacion';
import { contiene, redondear } from './geometria';
import type { Rect } from './geometria';
import { nuevoUid, valoresPorDefecto } from './modelo';
import type { Elemento } from './modelo';
import type { ComponenteRiel } from './tipos';

const fallo = (motivo: string): { ok: false; motivo: string } => ({ ok: false, motivo });

/** Riel de una fila de la distribución. */
export interface RielPlan {
  x: number;
  /** Esquina superior del riel (y_mm del elemento) y su línea central. */
  y: number;
  yCentro: number;
  largo: number;
}

export interface LinealPlan {
  componenteId: string;
  x: number;
  y: number;
  largo: number;
  rotacion: 0 | 90;
}

export interface PlanDistribucion {
  canaletas: LinealPlan[];
  rieles: RielPlan[];
}

/** Solo las cajas metálicas e inox; las plásticas traen su riel incluido. */
export function puedeDistribuir(ctx: Contexto): boolean {
  return ctx.caja.permiteRieles && ctx.capacidad !== null;
}

/**
 * Geometría de la distribución con el margen, modo y sección de canaleta del proyecto. Reutiliza `ctx.capacidad`
 * (calcularCapacidad: filas, paso entre filas, largo de riel, módulos por fila), sin repetir sus fórmulas.
 *
 * - Compacto: solo rieles, uno por fila, cada `pasoFilas`, empezando en el margen vertical.
 * - Con canaleta: además una canaleta vertical a cada costado y una horizontal sobre y bajo cada fila (las
 *   intermedias son compartidas por dos filas), tal como supone la fórmula de capacidad:
 *   margen · canaleta · holgura · fila · holgura · canaleta · holgura · fila…
 */
export function planificarDistribucion(ctx: Contexto): { ok: true; plan: PlanDistribucion } | { ok: false; motivo: string } {
  const cap = ctx.capacidad;
  if (!puedeDistribuir(ctx) || !cap) return fallo('Esta caja trae su riel incluido: la distribución automática es solo para cajas metálicas e inox.');
  if (cap.filas < 1 || cap.modulosPorFila < 1) {
    return fallo('Con el margen, modo y sección de canaleta actuales no cabe ni una fila de aparatos. Reduce el margen o cambia el modo.');
  }
  const a = ctx.caja.area;
  const { lateral: ml, vertical: mv } = ctx.margenes;
  const conCanaleta = ctx.modo === 'con_canaleta';
  const sec = ctx.seccionCanaleta;
  const paso = cap.pasoFilasMm;
  const holguraFila = conCanaleta ? (paso - ctx.altoModularMm - sec) / 2 : 0;
  const primeraFila = a.y + mv + (conCanaleta ? sec + holguraFila : 0);

  const largoRiel = Math.floor(cap.largoRielMm);
  const xRiel = redondear(a.x + (a.w - largoRiel) / 2);
  const rieles: RielPlan[] = [];
  for (let k = 0; k < cap.filas; k++) {
    const yCentro = redondear(primeraFila + k * paso + ctx.altoModularMm / 2);
    rieles.push({ x: xRiel, y: redondear(yCentro - ctx.rielAlto / 2), yCentro, largo: largoRiel });
  }

  const canaletas: LinealPlan[] = [];
  if (conCanaleta) {
    const id = `canaleta_${sec}`;
    const largoHorizontal = Math.floor(a.w - 2 * (ml + sec));
    const largoVertical = Math.floor(cap.filas * paso + sec);
    for (let k = 0; k <= cap.filas; k++) {
      canaletas.push({ componenteId: id, x: redondear(a.x + ml + sec), y: redondear(a.y + mv + k * paso), largo: largoHorizontal, rotacion: 0 });
    }
    for (const x of [a.x + ml, a.x + a.w - ml - sec]) {
      canaletas.push({ componenteId: id, x: redondear(x), y: redondear(a.y + mv), largo: largoVertical, rotacion: 90 });
    }
  }

  for (const l of [...canaletas, ...rieles.map((r) => ({ componenteId: RIEL_DIN_ID, largo: r.largo }))]) {
    const comp = ctx.comps.get(l.componenteId);
    if (!comp) return fallo(`Falta el componente ${l.componenteId} en la biblioteca.`);
    const error = validarLargo(comp, l.largo);
    if (error) return fallo(`La distribución no se puede armar: ${error}`);
  }
  return { ok: true, plan: { canaletas, rieles } };
}

function elementoLineal(ctx: Contexto, componenteId: string, x: number, y: number, largo: number, rotacion?: 0 | 90): Elemento {
  const comp = ctx.comps.get(componenteId);
  const el: Elemento = { uid: nuevoUid(), componenteId, x_mm: x, y_mm: y, largo_mm: largo, valores: comp ? valoresPorDefecto(comp) : {} };
  if (rotacion !== undefined) el.rotacion = rotacion;
  return el;
}

interface Aparato {
  el: Elemento;
  comp: ComponenteRiel;
  /** Línea central y x de su riel de origen (o, si no tenía, referencias equivalentes). */
  refY: number;
  refX: number;
}

/** Reparte los aparatos de una fila entre `inicio` y `fin` en su orden; null si no caben. */
function acomodarFila(items: readonly Aparato[], inicio: number, fin: number, conHuecos: boolean, rielX: number): number[] | null {
  const xs: number[] = [];
  let cursor = inicio;
  for (const it of items) {
    let x = cursor;
    if (conHuecos) {
      const deseado = rielX + (it.el.x_mm - it.refX);
      const paso = it.comp.snap.tipo === 'modular' ? it.comp.snap.paso_mm : 1;
      x = Math.max(cursor, inicio + Math.round((deseado - inicio) / paso) * paso);
    }
    x = redondear(x);
    if (x + it.comp.ancho_mm > fin + 0.01) return null;
    xs.push(x);
    cursor = x + it.comp.ancho_mm;
  }
  return xs;
}

/** Comprueba que todo cabe en la placa, sin pisar fijaciones ni otras piezas, y que cada aparato tiene riel. */
function validarResultado(elementos: readonly Elemento[], ctx: Contexto): string | null {
  const piezas = listarPiezas(elementos, ctx);
  const nombre = (uid: string): string => {
    const el = elementos.find((e) => e.uid === uid);
    return (el && ctx.comps.get(el.componenteId)?.nombre) ?? 'un elemento';
  };
  for (const p of piezas) {
    if (p.uid.startsWith('incl:')) continue;
    const rect: Rect = p.rect;
    if (!contiene(ctx.caja.area, rect)) return `${nombre(p.uid)} queda fuera de la placa con la nueva distribución.`;
    if (colisionaConFijaciones(rect, ctx.caja.fijaciones)) return `${nombre(p.uid)} choca con una fijación (perno) de la caja.`;
    if (p.clase === 'aparato' && p.rielUid === undefined) return `${nombre(p.uid)} no quedó sobre ningún riel.`;
    const otra = buscarColision(p, piezas, new Set([p.uid]));
    if (otra) return `${nombre(p.uid)} se superpone con ${nombre(otra.uid)}.`;
  }
  return null;
}

/**
 * Reemplaza los rieles y canaletas del tablero por la distribución automática y reubica los aparatos de riel en el
 * riel más cercano de la nueva distribución, conservando su orden relativo (primero por fila de origen, luego por x).
 * Los aparatos de montaje libre se quedan donde están. Todo o nada: si algo no cabe, devuelve el motivo y no cambia nada.
 */
export function distribuirAutomaticamente(elementos: readonly Elemento[], ctx: Contexto): Cambio {
  const planificado = planificarDistribucion(ctx);
  if (!planificado.ok) return planificado;
  const { plan } = planificado;

  // Aparatos de riel, con su riel de origen (antes de tocar nada).
  const rielesViejos = listarRieles(elementos, ctx);
  const aparatos: Aparato[] = [];
  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (!comp) continue;
    if (comp.montaje === 'lineal') continue; // rieles y canaletas: se reemplazan
    if (comp.montaje === 'libre') continue;
    const origen = rielDe(el, comp, rielesViejos);
    aparatos.push({ el, comp, refY: origen?.yCentro ?? el.y_mm + comp.riel_y_mm, refX: origen?.x ?? ctx.caja.area.x });
  }

  const nuevosRieles = plan.rieles.map((r) => elementoLineal(ctx, RIEL_DIN_ID, r.x, r.y, r.largo));
  const topeAncho = ctx.topes ? (ctx.comps.get(TOPE_ID)?.ancho_mm ?? 8) : 0;

  // Cada aparato va al riel nuevo más cercano a su fila de origen.
  const porRiel = plan.rieles.map(() => [] as Aparato[]);
  for (const ap of aparatos) {
    let mejor = 0;
    let dMejor = Infinity;
    plan.rieles.forEach((r, i) => {
      const d = Math.abs(r.yCentro - ap.refY);
      if (d < dMejor) {
        dMejor = d;
        mejor = i;
      }
    });
    porRiel[mejor]?.push(ap);
  }

  const movidos: Elemento[] = [];
  for (let i = 0; i < plan.rieles.length; i++) {
    const riel = plan.rieles[i];
    const fila = porRiel[i];
    if (!riel || !fila || fila.length === 0) continue;
    fila.sort((p, q) => p.refY - q.refY || p.el.x_mm - q.el.x_mm);
    const inicio = riel.x + topeAncho;
    const fin = riel.x + riel.largo - topeAncho;
    const xs = acomodarFila(fila, inicio, fin, true, riel.x) ?? acomodarFila(fila, inicio, fin, false, riel.x);
    if (!xs) {
      const necesario = fila.reduce((s, ap) => s + ap.comp.ancho_mm, 0);
      return fallo(
        `No se pudo distribuir: los aparatos de la fila ${i + 1} necesitan ${redondear(necesario, 1)} mm y en el riel nuevo caben ${redondear(fin - inicio, 1)} mm (descontando los topes). No se cambió nada.`,
      );
    }
    fila.forEach((ap, j) => movidos.push({ ...ap.el, x_mm: xs[j] ?? ap.el.x_mm, y_mm: redondear(riel.yCentro - ap.comp.riel_y_mm) }));
  }

  const movidosPorUid = new Map(movidos.map((m) => [m.uid, m]));
  const resultado: Elemento[] = [...plan.canaletas.map((c) => elementoLineal(ctx, c.componenteId, c.x, c.y, c.largo, c.rotacion)), ...nuevosRieles];
  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (comp && comp.montaje === 'lineal') continue;
    resultado.push(movidosPorUid.get(el.uid) ?? el);
  }

  const problema = validarResultado(resultado, ctx);
  if (problema) return fallo(`No se pudo distribuir: ${problema} No se cambió nada.`);
  return { ok: true, elementos: resultado };
}
