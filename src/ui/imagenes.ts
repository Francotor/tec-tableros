import { useEffect, useRef, useState } from 'react';
import { urlBiblioteca, useBiblioteca } from '../store/biblioteca';
import type { TipoProyecto } from '../core/tipoProyecto';

const MAX_LADO_PX = 4096;
const MAX_PX_POR_MM = 10;

const cache = new Map<string, Promise<HTMLImageElement>>();

/** Reescribe width/height del <svg> raíz para rasterizarlo con buena resolución (1 mm = k px). */
export function escalarSvg(svg: string, anchoMm: number, altoMm: number): string {
  const k = Math.min(MAX_PX_POR_MM, MAX_LADO_PX / Math.max(anchoMm, altoMm));
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\s(?:width|height)="[^"]*"/g, '')
      .replace('<svg', `<svg width="${Math.round(anchoMm * k)}" height="${Math.round(altoMm * k)}"`),
  );
}

function imagenDesdeSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('No se pudo dibujar el SVG'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export function cargarImagen(
  clave: string,
  obtenerSvg: () => Promise<string>,
  anchoMm: number,
  altoMm: number,
): Promise<HTMLImageElement> {
  // Dos bibliotecas pueden tener el mismo nombre de archivo: la clave incluye el tipo activo.
  const k = `${useBiblioteca.getState().tipo}|${clave}|${anchoMm}x${altoMm}`;
  let p = cache.get(k);
  if (!p) {
    p = obtenerSvg().then((s) => imagenDesdeSvg(escalarSvg(s, anchoMm, altoMm)));
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}

export async function textoDeBiblioteca(ruta: string): Promise<string> {
  const r = await fetch(urlBiblioteca(ruta));
  if (!r.ok) throw new Error(`No se pudo cargar ${ruta}`);
  return r.text();
}

interface Lineales {
  rielSVG: (largo: number) => string;
  canaletaSVG: (largo: number, ancho: number) => string;
}

const lineales = new Map<TipoProyecto, Promise<Lineales>>();

/** Importa un lineales.js (texto) como módulo y comprueba que trae las dos funciones. */
async function importarLineales(js: string): Promise<Lineales> {
  const url = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
  try {
    const m = (await import(/* @vite-ignore */ url)) as Partial<Lineales>;
    if (typeof m.rielSVG !== 'function' || typeof m.canaletaSVG !== 'function') throw new Error('lineales.js sin rielSVG o canaletaSVG');
    return m as Lineales;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Carga lineales.js de la biblioteca del tipo activo en tiempo de ejecución, para actualizarla sin tocar el código.
 * Si esa carpeta no trae uno propio (el de medidores) o lo que devuelve el servidor no es un módulo válido (un sitio
 * de una sola página responde con su index.html en vez de un 404), usa el de tableros.
 */
export function cargarLineales(): Promise<Lineales> {
  const tipo = useBiblioteca.getState().tipo;
  let p = lineales.get(tipo);
  if (!p) {
    const deTablero = async (): Promise<Lineales> => {
      const r = await fetch(urlBiblioteca('lineales.js', 'tablero'));
      if (!r.ok) throw new Error('No se pudo cargar lineales.js');
      return importarLineales(await r.text());
    };
    p = tipo === 'tablero' ? textoDeBiblioteca('lineales.js').then(importarLineales) : textoDeBiblioteca('lineales.js').then(importarLineales).catch(deTablero);
    p.catch(() => lineales.delete(tipo));
    lineales.set(tipo, p);
  }
  return p;
}

/** Imagen (rasterizada desde un SVG) lista para pasar a Konva; null mientras carga. */
export function useImagen(
  clave: string,
  obtenerSvg: () => Promise<string>,
  anchoMm: number,
  altoMm: number,
): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const obtener = useRef(obtenerSvg);
  useEffect(() => {
    obtener.current = obtenerSvg;
  });
  useEffect(() => {
    let vigente = true;
    cargarImagen(clave, () => obtener.current(), anchoMm, altoMm)
      .then((i) => vigente && setImg(i))
      .catch(() => vigente && setImg(null));
    return () => {
      vigente = false;
    };
  }, [clave, anchoMm, altoMm]);
  return img;
}
