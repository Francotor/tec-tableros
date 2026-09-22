import type { Rect } from './geometria';
import type { LayoutCaja, ParametrosLayout } from './tipos';

export type Modo = 'compacto' | 'con_canaleta';
export const SECCIONES_CANALETA = [25, 40, 60] as const;
export type SeccionCanaleta = (typeof SECCIONES_CANALETA)[number];

export interface Margenes {
  lateral: number;
  vertical: number;
}

export interface Capacidad {
  pasoFilasMm: number;
  largoRielMm: number;
  filas: number;
  modulosPorFila: number;
  modulosTotal: number;
  modulosMaxConReserva: number;
}

/**
 * Traduce las fórmulas de gabinetes.json (parametros.formulas), que son solo texto descriptivo en el JSON.
 * Validada línea a línea contra capacidad.compacto / con_canaleta / por_canaleta de varias cajas reales
 * (con margen general y con caja.layout propio) antes de usarla; ver capacidad.test.ts.
 */
export function calcularCapacidad(
  anchoPlacaMm: number,
  altoPlacaMm: number,
  margenes: Margenes,
  modo: Modo,
  seccionCanaletaMm: SeccionCanaleta,
  parametrosLayout: ParametrosLayout,
  moduloMm: number,
  altoModularMm: number,
): Capacidad {
  const { holgura_mm: holgura, tope_riel_mm: topeRiel, paso_compacto_mm: pasoCompacto, paso_minimo_con_canaleta_mm: pasoMinCanaleta, reserva } =
    parametrosLayout;

  let pasoFilas: number;
  let largoRiel: number;
  let filas: number;

  if (modo === 'compacto') {
    largoRiel = anchoPlacaMm - 2 * (margenes.lateral + holgura);
    pasoFilas = pasoCompacto;
    filas = Math.floor((altoPlacaMm - 2 * margenes.vertical + (pasoCompacto - altoModularMm)) / pasoCompacto);
  } else {
    largoRiel = anchoPlacaMm - 2 * (margenes.lateral + seccionCanaletaMm + holgura);
    pasoFilas = Math.max(pasoMinCanaleta, altoModularMm + seccionCanaletaMm + 2 * holgura);
    const altura1 =
      2 * (margenes.vertical + seccionCanaletaMm + (pasoFilas - altoModularMm - seccionCanaletaMm) / 2) + altoModularMm;
    filas = Math.floor((altoPlacaMm - altura1) / pasoFilas) + 1;
  }
  filas = Math.max(0, filas);
  const modulosPorFila = Math.max(0, Math.floor((largoRiel - 2 * topeRiel) / moduloMm));
  const modulosTotal = filas * modulosPorFila;
  const modulosMaxConReserva = Math.floor(modulosTotal / (1 + reserva));

  return { pasoFilasMm: pasoFilas, largoRielMm: largoRiel, filas, modulosPorFila, modulosTotal, modulosMaxConReserva };
}

/** Margen de borde por defecto: el de la caja (layout propio de fabricante) o, si no trae, el general. */
export function margenesPorDefecto(layoutCaja: LayoutCaja | null | undefined, parametrosLayout: ParametrosLayout): Margenes {
  if (layoutCaja) return { lateral: layoutCaja.margen_lateral_mm, vertical: layoutCaja.margen_vertical_mm };
  return { lateral: parametrosLayout.margen_borde_mm, vertical: parametrosLayout.margen_borde_mm };
}

/**
 * Área de trabajo reducida por el margen de borde (referencia visual/de cálculo, no un límite duro:
 * lo único que limita dónde se puede soltar un elemento sigue siendo la placa completa).
 */
export function calcularAreaUtil(area: Rect, margenes: Margenes): Rect {
  return {
    x: area.x + margenes.lateral,
    y: area.y + margenes.vertical,
    w: Math.max(0, area.w - 2 * margenes.lateral),
    h: Math.max(0, area.h - 2 * margenes.vertical),
  };
}
