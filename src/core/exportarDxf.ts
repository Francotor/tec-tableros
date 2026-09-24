import { calcularTopes, esRiel, huella, listarPiezas, listarRieles, TOPE_ID } from './colocacion';
import type { Contexto } from './colocacion';
import { lineasEtiqueta, tamanoAjustado } from './etiquetas';
import { leerFormasSvg } from './lectorSvg';
import type { Elemento } from './modelo';
import type { Categoria } from './tipos';

// ---------------------------------------------------------------- escritor DXF R12

export type CapaDxf = Categoria | 'Caja' | 'Texto';

/** Capas del archivo y su color ACI (1 rojo, 2 amarillo, 3 verde, 4 cian, 5 azul, 7 blanco/negro, 8 gris). */
export const CAPAS_DXF: readonly { nombre: CapaDxf; color: number }[] = [
  { nombre: 'Protecciones', color: 1 },
  { nombre: 'Comando', color: 5 },
  { nombre: 'Control', color: 3 },
  { nombre: 'Distribucion', color: 4 },
  { nombre: 'Montaje', color: 8 },
  { nombre: 'Caja', color: 7 },
  { nombre: 'Texto', color: 2 },
];

function num(v: number): string {
  const s = v.toFixed(4).replace(/\.?0+$/, '');
  return s === '-0' || s === '' ? '0' : s;
}

/** R12 es ASCII puro: se quitan tildes y cualquier carácter fuera de ASCII imprimible. */
function ascii(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

/**
 * Escritor mínimo de DXF R12 (AC1009), texto ASCII. Solo lo que necesita el exportador: LINE, CIRCLE, TEXT y un
 * rectángulo cerrado. R12 no tiene LWPOLYLINE (llegó en R13/R14): el rectángulo es un POLYLINE clásico cerrado
 * (POLYLINE + 4 VERTEX + SEQEND), que es su equivalente en este formato.
 */
export class EscritorDxf {
  private readonly entidades: string[] = [];
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  private grupo(codigo: number, valor: string | number): void {
    this.entidades.push(String(codigo), typeof valor === 'number' ? num(valor) : valor);
  }

  private extender(x: number, y: number): void {
    this.minX = Math.min(this.minX, x);
    this.minY = Math.min(this.minY, y);
    this.maxX = Math.max(this.maxX, x);
    this.maxY = Math.max(this.maxY, y);
  }

  linea(capa: CapaDxf, x1: number, y1: number, x2: number, y2: number): void {
    this.grupo(0, 'LINE');
    this.grupo(8, capa);
    this.grupo(10, x1);
    this.grupo(20, y1);
    this.grupo(30, 0);
    this.grupo(11, x2);
    this.grupo(21, y2);
    this.grupo(31, 0);
    this.extender(x1, y1);
    this.extender(x2, y2);
  }

  circulo(capa: CapaDxf, cx: number, cy: number, r: number): void {
    this.grupo(0, 'CIRCLE');
    this.grupo(8, capa);
    this.grupo(10, cx);
    this.grupo(20, cy);
    this.grupo(30, 0);
    this.grupo(40, r);
    this.extender(cx - r, cy - r);
    this.extender(cx + r, cy + r);
  }

  /** Rectángulo cerrado; (x, y) es la esquina inferior izquierda en el eje Y hacia arriba de DXF. */
  rectangulo(capa: CapaDxf, x: number, y: number, w: number, h: number): void {
    this.grupo(0, 'POLYLINE');
    this.grupo(8, capa);
    this.grupo(66, 1);
    this.grupo(70, 1);
    for (const [vx, vy] of [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ] as const) {
      this.grupo(0, 'VERTEX');
      this.grupo(8, capa);
      this.grupo(10, vx);
      this.grupo(20, vy);
      this.grupo(30, 0);
      this.extender(vx, vy);
    }
    this.grupo(0, 'SEQEND');
    this.grupo(8, capa);
  }

  /** Texto centrado en (x, y), tanto horizontal como verticalmente. `altura` en mm. */
  texto(capa: CapaDxf, x: number, y: number, altura: number, contenido: string): void {
    this.grupo(0, 'TEXT');
    this.grupo(8, capa);
    this.grupo(10, x);
    this.grupo(20, y);
    this.grupo(30, 0);
    this.grupo(40, altura);
    this.grupo(1, ascii(contenido));
    this.grupo(72, 1);
    this.grupo(11, x);
    this.grupo(21, y);
    this.grupo(31, 0);
    this.grupo(73, 2);
    this.extender(x, y);
  }

  toString(): string {
    const l: (string | number)[] = [];
    const g = (codigo: number, valor: string | number): void => {
      l.push(String(codigo), typeof valor === 'number' ? num(valor) : valor);
    };
    const hayDatos = Number.isFinite(this.minX);
    g(0, 'SECTION');
    g(2, 'HEADER');
    g(9, '$ACADVER');
    g(1, 'AC1009');
    g(9, '$INSUNITS');
    g(70, 4); // milímetros
    g(9, '$EXTMIN');
    g(10, hayDatos ? this.minX : 0);
    g(20, hayDatos ? this.minY : 0);
    g(30, 0);
    g(9, '$EXTMAX');
    g(10, hayDatos ? this.maxX : 0);
    g(20, hayDatos ? this.maxY : 0);
    g(30, 0);
    g(0, 'ENDSEC');

    g(0, 'SECTION');
    g(2, 'TABLES');
    g(0, 'TABLE');
    g(2, 'LTYPE');
    g(70, 1);
    g(0, 'LTYPE');
    g(2, 'CONTINUOUS');
    g(70, 0);
    g(3, 'Solid line');
    g(72, 65);
    g(73, 0);
    g(40, 0);
    g(0, 'ENDTAB');
    g(0, 'TABLE');
    g(2, 'LAYER');
    g(70, CAPAS_DXF.length);
    for (const c of CAPAS_DXF) {
      g(0, 'LAYER');
      g(2, c.nombre);
      g(70, 0);
      g(62, c.color);
      g(6, 'CONTINUOUS');
    }
    g(0, 'ENDTAB');
    g(0, 'TABLE');
    g(2, 'STYLE');
    g(70, 1);
    g(0, 'STYLE');
    g(2, 'STANDARD');
    g(70, 0);
    g(40, 0);
    g(41, 1);
    g(50, 0);
    g(71, 0);
    g(42, 2.5);
    g(3, 'txt');
    g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');

    g(0, 'SECTION');
    g(2, 'BLOCKS');
    g(0, 'ENDSEC');
    g(0, 'SECTION');
    g(2, 'ENTITIES');
    const cuerpo = this.entidades.join('\r\n');
    const cabecera = l.join('\r\n');
    const pie = ['0', 'ENDSEC', '0', 'EOF'].join('\r\n');
    return `${cabecera}\r\n${cuerpo}${cuerpo ? '\r\n' : ''}${pie}\r\n`;
  }
}

// ---------------------------------------------------------------- tramos libres del riel

/** Partes de [inicio, fin] que no cubre ningún intervalo ocupado (todo en mm, sobre el eje del riel). */
export function tramosLibres(inicio: number, fin: number, ocupados: readonly [number, number][]): [number, number][] {
  const ordenados = [...ocupados].sort((a, b) => a[0] - b[0]);
  const libres: [number, number][] = [];
  let cursor = inicio;
  for (const [a, b] of ordenados) {
    if (a > cursor + 0.01) libres.push([cursor, Math.min(a, fin)]);
    cursor = Math.max(cursor, b);
    if (cursor >= fin) break;
  }
  if (cursor < fin - 0.01) libres.push([cursor, fin]);
  return libres.filter(([a, b]) => b - a > 0.01);
}

// ---------------------------------------------------------------- exportador del tablero

/** Contenido de cada SVG de la biblioteca, por la ruta que trae la ficha (`comp.svg`). */
export type SvgsPorRuta = ReadonlyMap<string, string>;

/** Rutas de SVG que hace falta cargar para exportar estos elementos (aparatos y topes; los lineales no usan SVG). */
export function svgsNecesarios(elementos: readonly Elemento[], ctx: Contexto): string[] {
  const rutas = new Set<string>();
  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (comp && comp.montaje !== 'lineal') rutas.add(comp.svg);
  }
  if (calcularTopes(elementos, ctx).length > 0) {
    const tope = ctx.comps.get(TOPE_ID);
    if (tope) rutas.add(tope.svg);
  }
  return [...rutas];
}

/**
 * DXF R12 del tablero, en mm y con el eje Y hacia arriba (el editor lo tiene hacia abajo: y_dxf = alto de la caja − y).
 * - Caja, placa, fijaciones (CIRCLE) y rieles incluidos van en la capa Caja.
 * - Cada aparato: sus rect (POLYLINE cerrado), circle (CIRCLE) y line (LINE) reales, en la capa de su categoría.
 * - Rótulos: TEXT en la capa Texto, con las mismas líneas y el mismo tamaño que la vista a color.
 * - Riel DIN: solo los tramos que no cubre un aparato montado ni un tope.
 * Los `rx` (esquinas redondeadas) de los SVG no se reproducen: el rectángulo sale con esquinas vivas.
 */
export function generarDxf(elementos: readonly Elemento[], ctx: Contexto, svgs: SvgsPorRuta): string {
  const dxf = new EscritorDxf();
  const alto = ctx.caja.alto;
  const rectangulo = (capa: CapaDxf, x: number, y: number, w: number, h: number): void => dxf.rectangulo(capa, x, alto - y - h, w, h);
  const formas = (capa: CapaDxf, ruta: string, ox: number, oy: number): void => {
    const contenido = svgs.get(ruta);
    if (contenido === undefined) throw new Error(`Falta el SVG "${ruta}" para exportar.`);
    for (const f of leerFormasSvg(contenido)) {
      if (f.tipo === 'rect') rectangulo(capa, ox + f.x, oy + f.y, f.width, f.height);
      else if (f.tipo === 'circle') dxf.circulo(capa, ox + f.cx, alto - (oy + f.cy), f.r);
      else dxf.linea(capa, ox + f.x1, alto - (oy + f.y1), ox + f.x2, alto - (oy + f.y2));
    }
  };

  // Caja
  const { caja } = ctx;
  rectangulo('Caja', 0, 0, caja.ancho, caja.alto);
  if (caja.permiteRieles) rectangulo('Caja', caja.area.x, caja.area.y, caja.area.w, caja.area.h);
  for (const f of caja.fijaciones) dxf.circulo('Caja', f.x, alto - f.y, f.r);

  // Rieles (incluidos de la caja y agregados): solo los tramos libres.
  const piezas = listarPiezas(elementos, ctx);
  const topes = calcularTopes(elementos, ctx);
  for (const r of listarRieles(elementos, ctx)) {
    const el = r.incluido ? undefined : elementos.find((e) => e.uid === r.uid);
    const vertical = (el?.rotacion ?? 0) === 90;
    const capa: CapaDxf = r.incluido ? 'Caja' : 'Montaje';
    if (vertical) {
      rectangulo(capa, r.rect.x, r.rect.y, r.rect.w, r.rect.h);
      continue;
    }
    const ocupados: [number, number][] = [
      ...piezas.filter((p) => p.clase === 'aparato' && p.rielUid === r.uid).map((p): [number, number] => [p.rect.x, p.rect.x + p.rect.w]),
      ...topes.filter((t) => t.rielUid === r.uid).map((t): [number, number] => [t.rect.x, t.rect.x + t.rect.w]),
    ];
    for (const [a, b] of tramosLibres(r.x, r.x + r.largo, ocupados)) rectangulo(capa, a, r.rect.y, b - a, r.rect.h);
  }

  // Elementos del proyecto
  for (const el of elementos) {
    const comp = ctx.comps.get(el.componenteId);
    if (!comp) continue;
    if (comp.montaje === 'lineal') {
      if (esRiel(comp)) continue; // los rieles se dibujan aparte, por tramos libres
      const r = huella(el, comp);
      rectangulo(comp.categoria, r.x, r.y, r.w, r.h);
      continue;
    }
    formas(comp.categoria, comp.svg, el.x_mm, el.y_mm);
    const etiqueta = comp.etiqueta;
    if (etiqueta) {
      const lineas = lineasEtiqueta(comp, el);
      const banda = etiqueta.h / Math.max(1, lineas.length);
      lineas.forEach((linea, i) => {
        const cy = el.y_mm + etiqueta.y + banda * i + banda / 2;
        dxf.texto('Texto', el.x_mm + etiqueta.x + etiqueta.w / 2, alto - cy, tamanoAjustado(linea, etiqueta.w, etiqueta.tamano_mm), linea);
      });
    }
  }

  // Topes automáticos
  const tope = ctx.comps.get(TOPE_ID);
  if (tope) for (const t of topes) formas(tope.categoria, tope.svg, t.rect.x, t.rect.y);

  return dxf.toString();
}
