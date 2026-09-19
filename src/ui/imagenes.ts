import { useEffect, useRef, useState } from 'react';
import { urlBiblioteca } from '../store/biblioteca';

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
  const k = `${clave}|${anchoMm}x${altoMm}`;
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

let lineales: Promise<Lineales> | null = null;

/** Carga lineales.js de la biblioteca en tiempo de ejecución, para actualizarla sin tocar el código. */
export function cargarLineales(): Promise<Lineales> {
  lineales ??= textoDeBiblioteca('lineales.js').then(
    (js) => import(/* @vite-ignore */ URL.createObjectURL(new Blob([js], { type: 'text/javascript' }))) as Promise<Lineales>,
  );
  return lineales;
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
