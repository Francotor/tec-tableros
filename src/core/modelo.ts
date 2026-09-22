import type { Modo, SeccionCanaleta } from './capacidad';
import type { Componente, ValorCampo } from './tipos';

export type CajaProyecto =
  | { id: string }
  | { libre: { ancho_mm: number; alto_mm: number; tipo: 'metalica' | 'inox' } };

export interface Elemento {
  uid: string;
  componenteId: string;
  /** Esquina superior izquierda, en coordenadas de la caja (mm). */
  x_mm: number;
  y_mm: number;
  /** Solo canaletas. */
  rotacion?: 0 | 90;
  /** Solo lineales. */
  largo_mm?: number;
  valores: Record<string, ValorCampo>;
}

export interface Proyecto {
  id: string;
  nombre: string;
  numeroCotizacion: string;
  notas: string;
  actualizadoEn: string;
  caja: CajaProyecto;
  /** true si el margen de borde fue editado a mano para este proyecto (si no, sigue al de la caja actual). */
  margenBordeManual: boolean;
  /** Solo tiene valor mientras margenBordeManual es true. */
  margenBorde_mm: number | null;
  modo: Modo;
  seccionCanaleta_mm: SeccionCanaleta;
  elementos: Elemento[];
}

export function nuevoUid(): string {
  return globalThis.crypto.randomUUID();
}

/** Valores iniciales de los campos editables de una ficha (el largo de los lineales va aparte). */
export function valoresPorDefecto(comp: Componente): Record<string, ValorCampo> {
  const v: Record<string, ValorCampo> = {};
  for (const c of comp.campos) {
    if (comp.montaje === 'lineal' && c.id === 'largo') continue;
    v[c.id] = c.defecto;
  }
  return v;
}

export function largoPorDefecto(comp: Componente): number {
  const campo = comp.campos.find((c) => c.id === 'largo');
  return campo && campo.tipo === 'entero' ? campo.defecto : 400;
}

export function proyectoNuevo(cajaId: string): Proyecto {
  return {
    id: nuevoUid(),
    nombre: 'Proyecto sin nombre',
    numeroCotizacion: '',
    notas: '',
    actualizadoEn: new Date().toISOString(),
    caja: { id: cajaId },
    margenBordeManual: false,
    margenBorde_mm: null,
    modo: 'compacto',
    // Coincide con parametros.layout.canaleta_defecto_mm de la biblioteca actual (40 mm).
    seccionCanaleta_mm: 40,
    elementos: [],
  };
}
