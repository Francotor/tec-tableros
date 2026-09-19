import { calcularTopes, huella } from './colocacion';
import type { Contexto } from './colocacion';
import type { Rect } from './geometria';
import type { Elemento } from './modelo';
import type { Caja, Gabinetes } from './tipos';

/** Rectángulo mínimo que contiene todo el dibujo (aparatos, rieles, canaletas y topes); null si no hay nada. */
export function extensionDelDibujo(elementos: readonly Elemento[], ctx: Contexto): Rect | null {
  const rects: Rect[] = elementos.flatMap((el) => {
    const comp = ctx.comps.get(el.componenteId);
    return comp ? [huella(el, comp)] : [];
  });
  rects.push(...calcularTopes(elementos, ctx).map((t) => t.rect));
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface Sugerencia {
  caja: Caja;
  /** Desplazamiento que lleva el dibujo a la esquina de la placa de la caja sugerida. */
  dx: number;
  dy: number;
  /** true si la caja actual ya es la sugerida. */
  esLaActual: boolean;
}

/**
 * La caja de la lista, del mismo tipo (metálica o inox), con la placa más chica que contiene todo el dibujo.
 * Solo aplica a cajas metálicas e inox: las plásticas traen sus rieles fijos.
 */
export function sugerirCaja(elementos: readonly Elemento[], ctx: Contexto, gabinetes: Gabinetes): Sugerencia | null {
  const tipo = ctx.caja.tipo;
  if (tipo !== 'metalica' && tipo !== 'inox') return null;
  const ext = extensionDelDibujo(elementos, ctx);
  if (!ext) return null;
  const candidatas = gabinetes.cajas
    .filter((c) => c.tipo === tipo && c.placa && c.placa.ancho >= ext.w - 0.01 && c.placa.alto >= ext.h - 0.01)
    .sort((a, b) => (a.placa?.ancho ?? 0) * (a.placa?.alto ?? 0) - (b.placa?.ancho ?? 0) * (b.placa?.alto ?? 0) || a.ancho_mm - b.ancho_mm);
  const mejor = candidatas[0];
  if (!mejor?.placa) return null;
  return {
    caja: mejor,
    dx: mejor.placa.x - ext.x,
    dy: mejor.placa.y - ext.y,
    esLaActual: ctx.caja.id === mejor.id,
  };
}

/** Traslada todos los elementos (el dibujo conserva su forma). */
export function trasladar(elementos: readonly Elemento[], dx: number, dy: number): Elemento[] {
  return elementos.map((e) => ({ ...e, x_mm: Math.round((e.x_mm + dx) * 100) / 100, y_mm: Math.round((e.y_mm + dy) * 100) / 100 }));
}
