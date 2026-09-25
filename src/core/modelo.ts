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
  /** uid del elemento que lo alimenta. Ni el padre ni el hijo pueden ser un riel, una canaleta o un tope. */
  alimentadoPor?: string;
  /** Circuito al que pertenece (ver Circuito, en este mismo archivo). */
  circuitoId?: string;
  valores: Record<string, ValorCampo>;
}

/** Circuito del tablero: agrupa elementos para el rotulado y la lista de materiales. */
export interface Circuito {
  id: string;
  /** Texto libre (p. ej. "C1", "3"), no necesariamente numérico. */
  numero: string;
  nombre: string;
}

export type LadoBisagras = 'izquierda' | 'derecha';

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
  /** Topes de riel automáticos (2 por riel con aparatos). Apagado por defecto: se activan cuando hacen falta. */
  topesAutomaticos: boolean;
  /** Lado de las bisagras de la puerta en la vista frontal (con dos hojas, las bisagras van a ambos lados). */
  ladoBisagras: LadoBisagras;
  circuitos: Circuito[];
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
    topesAutomaticos: false,
    ladoBisagras: 'izquierda',
    circuitos: [],
    elementos: [],
  };
}
