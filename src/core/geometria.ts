export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Punto {
  x: number;
  y: number;
}

const EPS = 0.01;

/** Solapamiento real: dos rectángulos que solo se tocan por el borde no se solapan. */
export function solapan(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS
  );
}

export function contiene(exterior: Rect, r: Rect): boolean {
  return (
    r.x >= exterior.x - EPS &&
    r.y >= exterior.y - EPS &&
    r.x + r.w <= exterior.x + exterior.w + EPS &&
    r.y + r.h <= exterior.y + exterior.h + EPS
  );
}

/** Distancia del punto al rectángulo (0 si está dentro). */
export function distanciaARect(p: Punto, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

export function redondear(v: number, decimales = 2): number {
  const f = 10 ** decimales;
  return Math.round(v * f) / f;
}
