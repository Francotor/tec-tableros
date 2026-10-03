import { calcularTopes, esCanaleta, esRiel, listarRieles, TOPE_ID } from './colocacion';
import type { Contexto } from './colocacion';
import { descripcionesDistinguidas, puedeConectarse } from './conexion';
import { expandirPlantilla, valoresEfectivos } from './etiquetas';
import type { Circuito, Elemento } from './modelo';
import { muestraTotalesDeRielYCanaleta, usaCircuitos } from './tipoProyecto';

export interface LineaLista {
  descripcion: string;
  cantidad: number;
  unidad: string;
}

/** Una fila de la tabla de conexiones: una pieza y de quién recibe mando y potencia (null = sin definir). */
export interface FilaConexion {
  pieza: string;
  accionadoPor: string | null;
  alimentadoPor: string | null;
}

export interface ListaMateriales {
  /** Caja, aparatos, rieles, canaletas y topes; líneas iguales agrupadas y ordenadas. */
  lineas: LineaLista[];
  /** Suma de cortes, en metros. */
  metrosRiel: number;
  metrosCanaleta: number;
  /** false en un medidor: no hay riel ni canaleta, así que no se agregan las líneas "Total riel DIN" y "Total canaleta". */
  conTotales: boolean;
  /** Piezas con "Accionado por" o "Alimentado por" definido (las que no tienen ninguno no salen). Vacía en un medidor. */
  conexiones: FilaConexion[];
}

const UNIDAD = 'un';
/** Lo que se escribe en la tabla de conexiones cuando una de las dos relaciones no está definida. */
export const SIN_DEFINIR = '—';

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

  return {
    lineas: ordenarLineas(cuenta),
    metrosRiel: mmRiel / 1000,
    metrosCanaleta: mmCanaleta / 1000,
    conTotales: muestraTotalesDeRielYCanaleta(ctx.tipo),
    conexiones: generarConexiones(elementos, ctx),
  };
}

/**
 * Tabla de conexiones: cada pieza que tenga "Accionado por" o "Alimentado por", con la misma descripción que el selector de
 * Propiedades. Una referencia a una pieza que ya no existe cuenta como sin definir. En el orden de la lista (por descripción).
 */
export function generarConexiones(elementos: readonly Elemento[], ctx: Contexto): FilaConexion[] {
  if (!usaCircuitos(ctx.tipo)) return [];
  const nombres = descripcionesDistinguidas(elementos, ctx);
  const de = (uid: string | undefined): string | null => (uid ? (nombres.get(uid) ?? null) : null);
  const filas: FilaConexion[] = [];
  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (!comp || !puedeConectarse(comp)) continue;
    const accionadoPor = de(el.accionadoPor);
    const alimentadoPor = de(el.alimentadoPor);
    if (accionadoPor === null && alimentadoPor === null) continue;
    filas.push({ pieza: nombres.get(el.uid) ?? comp.nombre, accionadoPor, alimentadoPor });
  }
  return filas.sort((a, b) => (a.pieza < b.pieza ? -1 : a.pieza > b.pieza ? 1 : 0));
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
  if (!lista.conTotales) return [];
  return [
    { descripcion: 'Total riel DIN', cantidad: lista.metrosRiel, unidad: 'm' },
    { descripcion: 'Total canaleta', cantidad: lista.metrosCanaleta, unidad: 'm' },
  ];
}

/** Texto para pegar en el cotizador: una línea por material. */
export function listaATexto(lista: ListaMateriales): string {
  const materiales = lista.lineas.map((l) => `${l.cantidad} x ${l.descripcion}`);
  const totales = lineasTotales(lista).map((t) => `${t.descripcion}: ${formatearMetros(t.cantidad)} m`);
  const conexiones = lista.conexiones.length > 0 ? ['', 'Conexiones:', ...lista.conexiones.map((c) => `${c.pieza} | Accionado por: ${c.accionadoPor ?? SIN_DEFINIR} | Alimentado por: ${c.alimentadoPor ?? SIN_DEFINIR}`)] : [];
  return [...materiales, ...(totales.length > 0 ? ['', ...totales] : []), ...conexiones].join('\n');
}

function campoCsv(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV con cabecera descripcion,cantidad,unidad (mismo formato que ejemplo_lista_materiales.csv). */
export function listaACsv(lista: ListaMateriales, opciones: { conTotales?: boolean } = {}): string {
  const filas: LineaLista[] = [...lista.lineas];
  if (opciones.conTotales ?? true) filas.push(...lineasTotales(lista));
  const cuerpo = filas.map((l) => `${campoCsv(l.descripcion)},${String(l.cantidad).replace(',', '.')},${l.unidad}`);
  // Las conexiones van en un segundo bloque (otra cabecera) después de una línea en blanco; sin conexiones el CSV es el de siempre.
  const conexiones =
    lista.conexiones.length > 0
      ? ['', 'pieza,accionado_por,alimentado_por', ...lista.conexiones.map((c) => [c.pieza, c.accionadoPor ?? '', c.alimentadoPor ?? ''].map(campoCsv).join(','))]
      : [];
  return ['descripcion,cantidad,unidad', ...cuerpo, ...conexiones].join('\r\n') + '\r\n';
}
