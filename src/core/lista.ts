import { calcularTopes, esCanaleta, esRiel, TOPE_ID } from './colocacion';
import type { Contexto } from './colocacion';
import { expandirPlantilla, valoresEfectivos } from './etiquetas';
import type { Elemento } from './modelo';

export interface LineaLista {
  descripcion: string;
  cantidad: number;
  unidad: string;
}

export interface ListaMateriales {
  /** Caja, aparatos, rieles, canaletas y topes; líneas iguales agrupadas y ordenadas. */
  lineas: LineaLista[];
  /** Suma de cortes, en metros. */
  metrosRiel: number;
  metrosCanaleta: number;
}

const UNIDAD = 'un';

function descripcionCaja(ctx: Contexto): string {
  const { caja } = ctx;
  return caja.permiteRieles ? `${caja.nombre} (placa ${caja.area.w} x ${caja.area.h} mm)` : caja.nombre;
}

/** Lista de materiales del dibujo. La caja plástica no lista su riel incluido. */
export function generarLista(elementos: readonly Elemento[], ctx: Contexto): ListaMateriales {
  const cuenta = new Map<string, number>();
  const sumar = (descripcion: string, cantidad = 1): void => {
    cuenta.set(descripcion, (cuenta.get(descripcion) ?? 0) + cantidad);
  };

  sumar(descripcionCaja(ctx));
  let mmRiel = 0;
  let mmCanaleta = 0;
  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (!comp) continue;
    sumar(expandirPlantilla(comp.bom, valoresEfectivos(comp, el)).trim());
    if (comp.montaje === 'lineal') {
      const largo = el.largo_mm ?? 0;
      if (esRiel(comp)) mmRiel += largo;
      else if (esCanaleta(comp)) mmCanaleta += largo;
    }
  }

  const tope = ctx.comps.get(TOPE_ID);
  const topes = calcularTopes(elementos, ctx).length;
  if (tope && topes > 0) sumar(expandirPlantilla(tope.bom, {}).trim(), topes);

  const lineas = [...cuenta.entries()]
    .map(([descripcion, cantidad]) => ({ descripcion, cantidad, unidad: UNIDAD }))
    .sort((a, b) => (a.descripcion < b.descripcion ? -1 : a.descripcion > b.descripcion ? 1 : 0));
  return { lineas, metrosRiel: mmRiel / 1000, metrosCanaleta: mmCanaleta / 1000 };
}

export function formatearMetros(m: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(m);
}

/** Líneas de total que se agregan al final de la lista. */
export function lineasTotales(lista: ListaMateriales): LineaLista[] {
  return [
    { descripcion: 'Total riel DIN', cantidad: lista.metrosRiel, unidad: 'm' },
    { descripcion: 'Total canaleta', cantidad: lista.metrosCanaleta, unidad: 'm' },
  ];
}

/** Texto para pegar en el cotizador: una línea por material. */
export function listaATexto(lista: ListaMateriales): string {
  const materiales = lista.lineas.map((l) => `${l.cantidad} x ${l.descripcion}`);
  const totales = lineasTotales(lista).map((t) => `${t.descripcion}: ${formatearMetros(t.cantidad)} m`);
  return [...materiales, '', ...totales].join('\n');
}

function campoCsv(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV con cabecera descripcion,cantidad,unidad (mismo formato que ejemplo_lista_materiales.csv). */
export function listaACsv(lista: ListaMateriales, opciones: { conTotales?: boolean } = {}): string {
  const filas: LineaLista[] = [...lista.lineas];
  if (opciones.conTotales ?? true) filas.push(...lineasTotales(lista));
  const cuerpo = filas.map((l) => `${campoCsv(l.descripcion)},${String(l.cantidad).replace(',', '.')},${l.unidad}`);
  return ['descripcion,cantidad,unidad', ...cuerpo].join('\r\n') + '\r\n';
}
