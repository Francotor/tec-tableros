import { calcularTopes, huella } from './colocacion';
import type { Contexto } from './colocacion';
import type { Rect } from './geometria';
import type { Elemento } from './modelo';

/** Capas lógicas del dibujo (todas salen en negro; sirven para las pruebas y para ordenar el trazado). */
export type CapaContorno = 'caja' | 'placa' | 'fijacion' | 'riel' | 'aparato' | 'canaleta' | 'tope';

export interface RectContorno extends Rect {
  capa: CapaContorno;
}

export interface CirculoContorno {
  cx: number;
  cy: number;
  r: number;
  capa: CapaContorno;
}

/** Cota lineal: mide `valor` mm entre dos puntos alineados con un eje. */
export interface CotaContorno {
  orientacion: 'horizontal' | 'vertical';
  /** Extremos de lo que se mide, en mm del tablero. */
  desde: number;
  hasta: number;
  /** Posición (mm del tablero) de la línea de cota en el eje perpendicular. */
  linea: number;
  /** Posición (mm del tablero) donde parten las líneas de referencia, en el eje perpendicular. */
  referencia: number;
  texto: string;
}

export interface PlanContornos {
  /** Origen del tablero (esquina superior izquierda de la caja) dentro de la hoja, en mm. */
  origen: { x: number; y: number };
  hoja: { ancho: number; alto: number };
  rects: RectContorno[];
  circulos: CirculoContorno[];
  cotas: CotaContorno[];
}

/** Espacio libre alrededor del dibujo y reservado a las cotas. */
export const MARGEN_HOJA_MM = 20;
const SEPARACION_COTA_MM = 12;

function formatearMedida(mm: number): string {
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(mm)} mm`;
}

/**
 * Vista interior del tablero como contornos puros, a escala real (1 mm del tablero = 1 mm de la hoja):
 * caja, placa, fijaciones, rieles (incluidos y agregados), aparatos, canaletas y topes. Sin relleno.
 * Incluye dos cotas de referencia (ancho y alto de la placa/área de trabajo) para comprobar la escala.
 */
export function calcularContornos(elementos: readonly Elemento[], ctx: Contexto): PlanContornos {
  const { caja } = ctx;
  const rects: RectContorno[] = [{ x: 0, y: 0, w: caja.ancho, h: caja.alto, capa: 'caja' }];
  if (caja.permiteRieles) rects.push({ ...caja.area, capa: 'placa' });

  const circulos: CirculoContorno[] = caja.fijaciones.map((f) => ({ cx: f.x, cy: f.y, r: f.r, capa: 'fijacion' }));

  for (const r of caja.rielesIncluidos) rects.push({ x: r.x, y: r.yCentro - ctx.rielAlto / 2, w: r.largo, h: ctx.rielAlto, capa: 'riel' });

  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (!comp) continue;
    const capa: CapaContorno = comp.montaje === 'lineal' ? (comp.id === 'riel_din' ? 'riel' : 'canaleta') : 'aparato';
    rects.push({ ...huella(el, comp), capa });
  }
  for (const t of calcularTopes(elementos, ctx)) rects.push({ ...t.rect, capa: 'tope' });

  // Las cotas cuelgan de la placa (o de la caja plástica, cuyo área es la caja completa).
  const a = caja.area;
  const cotas: CotaContorno[] = [
    {
      orientacion: 'horizontal',
      desde: a.x,
      hasta: a.x + a.w,
      linea: -SEPARACION_COTA_MM,
      referencia: caja.permiteRieles ? a.y : 0,
      texto: `Ancho de placa ${formatearMedida(a.w)}`,
    },
    {
      orientacion: 'vertical',
      desde: a.y,
      hasta: a.y + a.h,
      linea: -SEPARACION_COTA_MM,
      referencia: caja.permiteRieles ? a.x : 0,
      texto: `Alto de placa ${formatearMedida(a.h)}`,
    },
  ];

  const origen = { x: MARGEN_HOJA_MM + SEPARACION_COTA_MM, y: MARGEN_HOJA_MM + SEPARACION_COTA_MM };
  return {
    origen,
    hoja: { ancho: origen.x + caja.ancho + MARGEN_HOJA_MM, alto: origen.y + caja.alto + MARGEN_HOJA_MM + 8 },
    rects,
    circulos,
    cotas,
  };
}
