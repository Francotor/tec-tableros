import type { CajaResuelta } from './caja';
import type { Rect } from './geometria';
import type { LadoBisagras } from './modelo';
import type { Gabinetes } from './tipos';

/** Datos de la caja que usa la vista frontal. Los opcionales solo se dibujan si existen. */
export interface DatosCajaFrontal {
  ancho_mm: number;
  alto_mm: number;
  cierres?: string | number;
  bisagras?: number;
  puertas?: number;
}

export type CapaFrontal = 'marco' | 'puerta' | 'bisagra' | 'cierre' | 'placa';

export interface RectFrontal extends Rect {
  capa: CapaFrontal;
}
export interface CirculoFrontal {
  cx: number;
  cy: number;
  r: number;
  capa: CapaFrontal;
}
export interface LineaFrontal {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  capa: CapaFrontal;
}
export interface TextoFrontal {
  /** Zona donde va el texto (la placa de identificación). */
  zona: Rect;
  texto: string;
}

/** Vista frontal exterior (puerta cerrada), en mm con el origen en la esquina superior izquierda de la caja. */
export interface VistaFrontal {
  ancho: number;
  alto: number;
  rects: RectFrontal[];
  circulos: CirculoFrontal[];
  lineas: LineaFrontal[];
  placa: TextoFrontal;
}

/** Separación entre el borde de la caja (marco) y el borde de la puerta. */
export const MARCO_MM = 6;
const BISAGRA = { w: 6, h: 26 };
const CIERRE_RADIO = 6;
/** Distancia del borde de la puerta al centro de un cierre. */
const CIERRE_INSET = 22;
const PLACA = { maxW: 70, h: 14, inset: 12, arriba: 10 };

/** Datos de la caja del proyecto para la vista frontal: sus medidas y, si la caja de catálogo los trae, cierres, bisagras y puertas. */
export function datosFrontalDeCaja(caja: CajaResuelta, gabinetes: Gabinetes): DatosCajaFrontal {
  const c = caja.id === null ? undefined : gabinetes.cajas.find((x) => x.id === caja.id);
  const datos: DatosCajaFrontal = { ancho_mm: caja.ancho, alto_mm: caja.alto };
  if (c?.cierres !== undefined) datos.cierres = c.cierres;
  if (c?.bisagras !== undefined) datos.bisagras = c.bisagras;
  if (c?.puertas !== undefined) datos.puertas = c.puertas;
  return datos;
}

/**
 * Cantidad de cierres que dice el dato: un número, o un texto que empieza con uno ("2", "1*"). Un texto sin número
 * ("M.O.") no dice cuántos son, así que no se dibuja ningún símbolo.
 */
export function contarCierres(cierres: string | number | undefined): number {
  if (typeof cierres === 'number') return Number.isInteger(cierres) && cierres > 0 ? cierres : 0;
  const m = /^\s*(\d+)/.exec(cierres ?? '');
  return m ? Number(m[1]) : 0;
}

/** N posiciones repartidas entre las fracciones `desde` y `hasta` del alto (una sola queda al centro). */
function repartir(n: number, desde: number, hasta: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0.5];
  return Array.from({ length: n }, (_, i) => desde + ((hasta - desde) * i) / (n - 1));
}

/**
 * Vista frontal exterior simple: marco (la caja), puerta cerrada dentro del marco y placa de identificación con el
 * nombre del tablero. Además, solo si el dato existe: línea y símbolos de bisagras, símbolos de cierre y segunda hoja
 * de puerta. No lleva componentes internos. Con dos hojas, las bisagras van en los dos costados y los cierres en el
 * centro; con una, las bisagras en el lado indicado y los cierres en el opuesto.
 */
export function calcularVistaFrontal(datos: DatosCajaFrontal, nombre: string, lado: LadoBisagras = 'izquierda'): VistaFrontal {
  const { ancho_mm: ancho, alto_mm: alto } = datos;
  const rects: RectFrontal[] = [{ x: 0, y: 0, w: ancho, h: alto, capa: 'marco' }];
  const circulos: CirculoFrontal[] = [];
  const lineas: LineaFrontal[] = [];

  const puerta: Rect = { x: MARCO_MM, y: MARCO_MM, w: ancho - 2 * MARCO_MM, h: alto - 2 * MARCO_MM };
  const dosHojas = datos.puertas === 2;
  const hojas: Rect[] = dosHojas
    ? [
        { ...puerta, w: puerta.w / 2 },
        { ...puerta, x: puerta.x + puerta.w / 2, w: puerta.w / 2 },
      ]
    : [puerta];
  for (const h of hojas) rects.push({ ...h, capa: 'puerta' });

  // Bisagras: x del canto de la puerta donde van (izquierdo o derecho); con dos hojas, ambos cantos exteriores.
  const izquierda = puerta.x;
  const derecha = puerta.x + puerta.w;
  const cantosBisagra = dosHojas ? [izquierda, derecha] : [lado === 'derecha' ? derecha : izquierda];
  const nBisagras = Number.isInteger(datos.bisagras) && (datos.bisagras ?? 0) > 0 ? (datos.bisagras as number) : 0;
  if (nBisagras > 0) {
    const alturaBisagra = Math.min(BISAGRA.h, puerta.h * 0.2);
    for (const x of cantosBisagra) {
      const sentido = x === izquierda ? 1 : -1; // hacia dentro de la puerta
      lineas.push({ x1: x + sentido * 4, y1: puerta.y + puerta.h * 0.08, x2: x + sentido * 4, y2: puerta.y + puerta.h * 0.92, capa: 'bisagra' });
      for (const f of repartir(nBisagras, 0.12, 0.88)) {
        const cy = puerta.y + puerta.h * f;
        rects.push({ x: x - BISAGRA.w / 2, y: cy - alturaBisagra / 2, w: BISAGRA.w, h: alturaBisagra, capa: 'bisagra' });
      }
    }
  }

  // Cierres: en el canto opuesto a las bisagras, o en la unión de las dos hojas.
  const nCierres = contarCierres(datos.cierres);
  if (nCierres > 0) {
    const xCierre = dosHojas ? puerta.x + puerta.w / 2 : lado === 'derecha' ? izquierda + CIERRE_INSET : derecha - CIERRE_INSET;
    for (const f of repartir(nCierres, 0.15, 0.85)) {
      const cy = puerta.y + puerta.h * f;
      circulos.push({ cx: xCierre, cy, r: CIERRE_RADIO, capa: 'cierre' });
      lineas.push({ x1: xCierre - CIERRE_RADIO * 0.7, y1: cy, x2: xCierre + CIERRE_RADIO * 0.7, y2: cy, capa: 'cierre' });
    }
  }

  // Placa de identificación: esquina superior del lado de las bisagras (o izquierda si hay dos hojas).
  const w = Math.min(PLACA.maxW, puerta.w * 0.4);
  const enDerecha = !dosHojas && lado === 'derecha';
  const zona: Rect = {
    x: enDerecha ? derecha - PLACA.inset - w : izquierda + PLACA.inset,
    y: puerta.y + PLACA.arriba,
    w,
    h: PLACA.h,
  };
  rects.push({ ...zona, capa: 'placa' });

  return { ancho, alto, rects, circulos, lineas, placa: { zona, texto: nombre.trim() || 'Tablero' } };
}
