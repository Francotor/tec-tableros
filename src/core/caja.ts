import { calcularCapacidad, margenesPorDefecto } from './capacidad';
import type { Rect } from './geometria';
import type { CajaProyecto } from './modelo';
import type { Gabinetes, TipoCaja } from './tipos';

export interface RielIncluidoMm {
  x: number;
  yCentro: number;
  largo: number;
}

/** Fijación (perno) de una caja de fabricante, en las mismas coordenadas que el área. */
export interface FijacionMm {
  x: number;
  y: number;
  r: number;
}

/** Caja lista para usar en el editor: medidas, área de trabajo y rieles que ya trae. */
export interface CajaResuelta {
  id: string | null;
  nombre: string;
  tipo: TipoCaja;
  ancho: number;
  alto: number;
  /** Placa interior (metálica/inox) o la caja completa (plástica). */
  area: Rect;
  rielesIncluidos: RielIncluidoMm[];
  /** Módulos por fila con el margen y la sección de canaleta por defecto (referencia; ver ctx.capacidad para el valor vigente). */
  modulosPorFila: number;
  /** Pernos u otras fijaciones que ningún elemento puede invadir (solo algunas cajas de fabricante). */
  fijaciones: FijacionMm[];
  /** Ruta del SVG dentro de la biblioteca; null en medida libre. */
  svg: string | null;
  /** Metálicas e inox: el usuario agrega sus propios rieles. */
  permiteRieles: boolean;
}

export const ANCHO_MIN_LIBRE_MM = 100;
export const ANCHO_MAX_LIBRE_MM = 2000;

export function resolverCaja(caja: CajaProyecto, gabinetes: Gabinetes): CajaResuelta | null {
  const { layout: parametrosLayout, modulo_mm: modulo, alto_modular_mm: altoModular } = gabinetes.parametros;
  if ('libre' in caja) {
    const { ancho_mm, alto_mm, tipo } = caja.libre;
    const margen = gabinetes.parametros.margen_placa_mm / 2;
    const area: Rect = {
      x: margen,
      y: margen,
      w: Math.max(0, ancho_mm - 2 * margen),
      h: Math.max(0, alto_mm - 2 * margen),
    };
    const capacidad = calcularCapacidad(
      area.w,
      area.h,
      margenesPorDefecto(undefined, parametrosLayout),
      'con_canaleta',
      parametrosLayout.canaleta_defecto_mm as 25 | 40 | 60,
      parametrosLayout,
      modulo,
      altoModular,
    );
    return {
      id: null,
      nombre: `Caja ${tipo === 'inox' ? 'inox' : 'metálica'} de medida libre ${ancho_mm} × ${alto_mm} mm`,
      tipo,
      ancho: ancho_mm,
      alto: alto_mm,
      area,
      rielesIncluidos: [],
      modulosPorFila: capacidad.modulosPorFila,
      fijaciones: [],
      svg: null,
      permiteRieles: true,
    };
  }
  const c = gabinetes.cajas.find((x) => x.id === caja.id);
  if (!c) return null;
  const area: Rect = c.placa
    ? { x: c.placa.x, y: c.placa.y, w: c.placa.ancho, h: c.placa.alto }
    : { x: 0, y: 0, w: c.ancho_mm, h: c.alto_mm };
  return {
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    ancho: c.ancho_mm,
    alto: c.alto_mm,
    area,
    modulosPorFila: c.modulos_por_fila,
    fijaciones: (c.fijaciones ?? []).map((f) => ({ x: f.x, y: f.y, r: f.r_libre_mm })),
    rielesIncluidos: (c.rieles ?? []).map((r) => ({ x: r.x, yCentro: r.y_centro, largo: r.largo })),
    svg: c.svg,
    permiteRieles: c.tipo === 'metalica' || c.tipo === 'inox',
  };
}
