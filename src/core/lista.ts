import { calcularTopes, esCanaleta, esRiel, listarRieles, TOPE_ID } from './colocacion';
import type { Contexto } from './colocacion';
import { expandirPlantilla, valoresEfectivos } from './etiquetas';
import type { Circuito, Elemento } from './modelo';

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
    const valores = valoresEfectivos(comp, el);
    sumar(expandirPlantilla(comp.bom, valores).trim());
    if (comp.montaje === 'lineal') {
      // Mismo largo que se muestra en la descripción ("corte de {largo} mm"): si el elemento no
      // trae largo_mm (dato viejo o dañado), se usa el mismo valor que ya cae ahí por defecto,
      // en vez de sumar 0 y desentonar con la línea de la lista.
      const largo = typeof valores.largo === 'number' ? valores.largo : (el.largo_mm ?? 0);
      if (esRiel(comp)) mmRiel += largo;
      else if (esCanaleta(comp)) mmCanaleta += largo;
    }
  }

  const tope = ctx.comps.get(TOPE_ID);
  const topes = calcularTopes(elementos, ctx).length;
  if (tope && topes > 0) sumar(expandirPlantilla(tope.bom, {}).trim(), topes);

  return { lineas: ordenarLineas(cuenta), metrosRiel: mmRiel / 1000, metrosCanaleta: mmCanaleta / 1000 };
}

function ordenarLineas(cuenta: ReadonlyMap<string, number>): LineaLista[] {
  return [...cuenta.entries()]
    .map(([descripcion, cantidad]) => ({ descripcion, cantidad, unidad: UNIDAD }))
    .sort((a, b) => (a.descripcion < b.descripcion ? -1 : a.descripcion > b.descripcion ? 1 : 0));
}

export interface GrupoLista {
  /** null = elementos sin circuito asignado. */
  circuito: Circuito | null;
  lineas: LineaLista[];
}

/**
 * La misma lista, repartida por el circuito de cada elemento ("Agrupar por circuito"). La caja no
 * tiene circuito: va en el grupo "Sin circuito". Los topes (no son un Elemento propio) van al
 * circuito del riel al que pertenecen; si ese riel no tiene circuito, también van a "Sin circuito".
 * Las líneas iguales solo se agrupan dentro de un mismo circuito (dos aparatos iguales en
 * circuitos distintos aparecen en dos líneas, una por grupo).
 */
export function generarListaPorCircuito(elementos: readonly Elemento[], ctx: Contexto, circuitos: readonly Circuito[]): GrupoLista[] {
  const SIN_CIRCUITO = '';
  const porGrupo = new Map<string, Map<string, number>>();
  const sumarEn = (clave: string, descripcion: string, cantidad = 1): void => {
    let m = porGrupo.get(clave);
    if (!m) {
      m = new Map();
      porGrupo.set(clave, m);
    }
    m.set(descripcion, (m.get(descripcion) ?? 0) + cantidad);
  };

  sumarEn(SIN_CIRCUITO, descripcionCaja(ctx));
  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (!comp) continue;
    const valores = valoresEfectivos(comp, el);
    sumarEn(el.circuitoId ?? SIN_CIRCUITO, expandirPlantilla(comp.bom, valores).trim());
  }

  const tope = ctx.comps.get(TOPE_ID);
  if (tope) {
    const rieles = listarRieles(elementos, ctx);
    for (const t of calcularTopes(elementos, ctx)) {
      const riel = rieles.find((r) => r.uid === t.rielUid);
      const elRiel = riel && !riel.incluido ? elementos.find((e) => e.uid === riel.uid) : undefined;
      sumarEn(elRiel?.circuitoId ?? SIN_CIRCUITO, expandirPlantilla(tope.bom, {}).trim());
    }
  }

  const clavesOrdenadas = [...circuitos.map((c) => c.id), SIN_CIRCUITO].filter((clave) => porGrupo.has(clave));
  return clavesOrdenadas.map((clave) => ({
    circuito: clave === SIN_CIRCUITO ? null : (circuitos.find((c) => c.id === clave) ?? null),
    lineas: ordenarLineas(porGrupo.get(clave) ?? new Map()),
  }));
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
