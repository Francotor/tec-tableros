import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leerFormasSvg } from './lectorSvg';
import { cargarBiblioteca, RAIZ_BIBLIOTECA } from './ejemplo.testutil';

const cuenta = (texto: string, etiqueta: string): number => (texto.match(new RegExp(`<${etiqueta}[\\s/>]`, 'g')) ?? []).length;

describe('lector de SVG', () => {
  it('extrae rect, circle y line como datos y descarta fill, stroke y estilos', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18mm" height="90mm" viewBox="0 0 18 90"><title>t</title><desc>d</desc>' +
      '<rect x="0.25" y="1" width="17.5" height="89.5" rx="1.5" fill="#F1F2F4" stroke="#B5BBC4" stroke-width="0.5"/>' +
      '<circle cx="9" cy="6.5" r="2.6" fill="#6B727D"/>' +
      '<line x1="7.4" y1="6.5" x2="10.6" y2="6.5" stroke="#D9DCE1" stroke-width="0.6"/></svg>';
    expect(leerFormasSvg(svg)).toEqual([
      { tipo: 'rect', x: 0.25, y: 1, width: 17.5, height: 89.5, rx: 1.5 },
      { tipo: 'circle', cx: 9, cy: 6.5, r: 2.6 },
      { tipo: 'line', x1: 7.4, y1: 6.5, x2: 10.6, y2: 6.5 },
    ]);
  });

  it('un rect sin x, y ni rx los toma como 0', () => {
    expect(leerFormasSvg('<svg><rect width="5" height="6"/></svg>')).toEqual([{ tipo: 'rect', x: 0, y: 0, width: 5, height: 6, rx: 0 }]);
  });

  it.each(['path', 'polygon', 'polyline', 'ellipse', 'text', 'image', 'use'])('lanza un error explícito ante <%s>', (tag) => {
    expect(() => leerFormasSvg(`<svg><rect width="1" height="1"/><${tag} d="M0 0"/></svg>`)).toThrow(new RegExp(`<${tag}>`));
  });

  it('lanza ante transform en una forma o en un grupo, y ante valores que no son números', () => {
    expect(() => leerFormasSvg('<svg><rect width="1" height="1" transform="rotate(90)"/></svg>')).toThrow(/transform/);
    expect(() => leerFormasSvg('<svg><g transform="translate(1 2)"><rect width="1" height="1"/></g></svg>')).toThrow(/transform/);
    expect(() => leerFormasSvg('<svg><circle cx="1" cy="1" r="2mm"/></svg>')).toThrow(/r="2mm"/);
    expect(() => leerFormasSvg('<svg><circle cx="1" cy="1"/></svg>')).toThrow(/"r"/);
  });

  it('lee todos los SVG de componentes de la biblioteca sin errores, y sin perder ninguna forma', () => {
    const carpeta = join(RAIZ_BIBLIOTECA, 'componentes');
    const archivos = readdirSync(carpeta).filter((f) => f.endsWith('.svg'));
    expect(archivos.length).toBeGreaterThan(30);
    for (const f of archivos) {
      const texto = readFileSync(join(carpeta, f), 'utf8');
      const formas = leerFormasSvg(texto);
      expect(formas.filter((x) => x.tipo === 'rect'), f).toHaveLength(cuenta(texto, 'rect'));
      expect(formas.filter((x) => x.tipo === 'circle'), f).toHaveLength(cuenta(texto, 'circle'));
      expect(formas.filter((x) => x.tipo === 'line'), f).toHaveLength(cuenta(texto, 'line'));
    }
  });

  it('las unidades del viewBox de cada componente son milímetros (viewBox = width/height en mm de la ficha)', () => {
    const bib = cargarBiblioteca();
    for (const c of bib.catalogo.componentes) {
      if (c.montaje === 'lineal') continue;
      const texto = readFileSync(join(RAIZ_BIBLIOTECA, c.svg), 'utf8');
      const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(texto);
      expect(Number(vb?.[1]), c.id).toBeCloseTo(c.ancho_mm, 3);
      expect(Number(vb?.[2]), c.id).toBeCloseTo(c.alto_mm, 3);
    }
  });
});
