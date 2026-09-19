import { CATEGORIAS } from './tipos';
import type { Biblioteca, Caja, Catalogo, Categoria, Componente, Gabinetes } from './tipos';

const MONTAJES = ['riel', 'libre', 'lineal'];
const TIPOS_CAJA = ['metalica', 'inox', 'plastica_sobrepuesta', 'plastica_embutida'];

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function exigir(condicion: boolean, mensaje: string): asserts condicion {
  if (!condicion) throw new Error(`Biblioteca inválida: ${mensaje}`);
}

/** Valida la forma esencial de catalogo.json y lo devuelve tipado. */
export function parsearCatalogo(datos: unknown): Catalogo {
  exigir(esObjeto(datos) && Array.isArray(datos.componentes), 'catalogo.json sin "componentes"');
  for (const c of datos.componentes) {
    exigir(esObjeto(c), 'componente que no es objeto');
    const id = String(c.id);
    exigir(typeof c.id === 'string' && typeof c.nombre === 'string', `componente sin id/nombre (${id})`);
    exigir(CATEGORIAS.includes(c.categoria as Categoria), `categoría desconocida en ${id}`);
    exigir(typeof c.svg === 'string', `${id} sin svg`);
    exigir(MONTAJES.includes(String(c.montaje)), `${id} con montaje desconocido`);
    exigir(typeof c.alto_mm === 'number', `${id} sin alto_mm`);
    exigir(Array.isArray(c.campos), `${id} sin campos`);
    exigir(typeof c.bom === 'string', `${id} sin plantilla bom`);
  }
  return datos as unknown as Catalogo;
}

/** Valida la forma esencial de gabinetes.json y lo devuelve tipado. */
export function parsearGabinetes(datos: unknown): Gabinetes {
  exigir(esObjeto(datos) && Array.isArray(datos.cajas), 'gabinetes.json sin "cajas"');
  for (const c of datos.cajas) {
    exigir(esObjeto(c), 'caja que no es objeto');
    const id = String(c.id);
    exigir(typeof c.id === 'string' && typeof c.nombre === 'string', `caja sin id/nombre (${id})`);
    exigir(TIPOS_CAJA.includes(String(c.tipo)), `${id} con tipo desconocido`);
    exigir(typeof c.ancho_mm === 'number' && typeof c.alto_mm === 'number', `${id} sin medidas`);
    exigir(typeof c.svg === 'string', `${id} sin svg`);
  }
  return datos as unknown as Gabinetes;
}

export function parsearBiblioteca(catalogo: unknown, gabinetes: unknown): Biblioteca {
  return { catalogo: parsearCatalogo(catalogo), gabinetes: parsearGabinetes(gabinetes) };
}

/** Agrupa los componentes por categoría respetando el orden de CATEGORIAS. */
export function agruparPorCategoria(
  componentes: Componente[],
): { categoria: Categoria; componentes: Componente[] }[] {
  return CATEGORIAS.map((categoria) => ({
    categoria,
    componentes: componentes.filter((c) => c.categoria === categoria),
  })).filter((g) => g.componentes.length > 0);
}

export function buscarCaja(gabinetes: Gabinetes, id: string): Caja | undefined {
  return gabinetes.cajas.find((c) => c.id === id);
}

/** Lee ancho y alto del viewBox de un SVG (1 unidad = 1 mm). */
export function leerViewBox(svg: string): { ancho: number; alto: number } | null {
  const m = /viewBox\s*=\s*"([^"]+)"/.exec(svg);
  if (!m?.[1]) return null;
  const n = m[1].trim().split(/[\s,]+/).map(Number);
  if (n.length !== 4 || n.some((v) => Number.isNaN(v))) return null;
  return { ancho: n[2] as number, alto: n[3] as number };
}

/** Formato chileno: coma decimal, sin ceros sobrantes. */
export function formatearMm(v: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(v);
}
