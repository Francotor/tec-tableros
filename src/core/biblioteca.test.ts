import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agruparCajasSelector, agruparPorCategoria, formatearMm, leerViewBox, parsearBiblioteca } from './biblioteca';
import { AA_TEXTO_NORMAL, contraste } from './contraste';
import { BLANCO, PALETA } from '../theme';

const RAIZ = join(process.cwd(), 'public', 'biblioteca');
const leerJson = (f: string): unknown => JSON.parse(readFileSync(join(RAIZ, f), 'utf8'));
const { catalogo, gabinetes } = parsearBiblioteca(leerJson('catalogo.json'), leerJson('gabinetes.json'));

describe('biblioteca: SVG de las fichas', () => {
  for (const c of catalogo.componentes) {
    it(`${c.id}: el svg carga y su tamaño coincide con la ficha`, () => {
      const ruta = join(RAIZ, c.svg);
      expect(existsSync(ruta), `falta ${c.svg}`).toBe(true);
      const vb = leerViewBox(readFileSync(ruta, 'utf8'));
      expect(vb, `${c.svg} sin viewBox`).not.toBeNull();
      // Los lineales tienen largo variable: su svg es solo una muestra, se valida el alto.
      if (c.ancho_mm !== null) expect(vb?.ancho).toBeCloseTo(c.ancho_mm, 2);
      expect(vb?.alto).toBeCloseTo(c.alto_mm, 2);
    });
  }
});

describe('biblioteca: SVG de las cajas', () => {
  for (const c of gabinetes.cajas) {
    it(`${c.id}: el svg carga y coincide con ancho_mm x alto_mm`, () => {
      const ruta = join(RAIZ, c.svg);
      expect(existsSync(ruta), `falta ${c.svg}`).toBe(true);
      const vb = leerViewBox(readFileSync(ruta, 'utf8'));
      expect(vb?.ancho).toBeCloseTo(c.ancho_mm, 2);
      expect(vb?.alto).toBeCloseTo(c.alto_mm, 2);
    });
  }
});

describe('biblioteca: estructura', () => {
  it('agrupa por categoría en el orden pedido', () => {
    const grupos = agruparPorCategoria(catalogo.componentes).map((g) => g.categoria);
    expect(grupos).toEqual(['Protecciones', 'Comando', 'Control', 'Distribucion', 'Montaje']);
  });

  it('las cajas plásticas traen rieles y las metálicas/inox una placa', () => {
    for (const c of gabinetes.cajas) {
      if (c.tipo.startsWith('plastica')) expect(c.rieles?.length).toBeGreaterThan(0);
      else expect(c.placa).not.toBeNull();
    }
  });

  it('rechaza un catálogo mal formado', () => {
    expect(() => parsearBiblioteca({}, {})).toThrow(/inválida/);
  });

  it('formatea milímetros con coma decimal', () => {
    expect(formatearMm(12.5)).toBe('12,5');
    expect(formatearMm(400)).toBe('400');
  });
});

describe('agruparCajasSelector', () => {
  it('sin medidas genéricas, incluye exactamente las cajas de fabricante (110) más las plásticas (6)', () => {
    const grupos = agruparCajasSelector(gabinetes.cajas, false);
    const total = grupos.reduce((n, g) => n + g.cajas.length, 0);
    expect(total).toBe(gabinetes.cajas.filter((c) => !c.referencial).length);
    for (const g of grupos) for (const c of g.cajas) expect(c.referencial).not.toBe(true);
  });

  it('con medidas genéricas, incluye las 116 cajas', () => {
    const grupos = agruparCajasSelector(gabinetes.cajas, true);
    const total = grupos.reduce((n, g) => n + g.cajas.length, 0);
    expect(total).toBe(gabinetes.cajas.length);
    expect(total).toBe(116);
  });

  it('agrupa por tipo (metálica/inox/plástica), luego por fabricante y serie, o por Genéricas', () => {
    const grupos = agruparCajasSelector(gabinetes.cajas, true);
    const etiquetas = grupos.map((g) => g.etiqueta);
    expect(etiquetas).toContain('Metálica · Lerkenbox DM');
    expect(etiquetas).toContain('Metálica · Lerkenbox KT');
    expect(etiquetas).toContain('Metálica · Lerkenbox ARES');
    expect(etiquetas).toContain('Metálica · Genéricas');
    expect(etiquetas).toContain('Inox · Eldon ASR');
    expect(etiquetas).toContain('Inox · Genéricas');
    // Las dos tipo-caja plásticas del catálogo se agrupan bajo un solo tipo "Plástica".
    expect(etiquetas).toContain('Plástica · Sobrepuesta');
    expect(etiquetas).toContain('Plástica · Embutida');
    expect(etiquetas.every((e) => !e.startsWith('Plastica'))).toBe(true);
  });

  it('cada grupo tiene un único tipo y un único fabricante/serie', () => {
    for (const g of agruparCajasSelector(gabinetes.cajas, true)) {
      const tipos = new Set(g.cajas.map((c) => (c.tipo.startsWith('plastica') ? 'plastica' : c.tipo)));
      expect(tipos.size).toBe(1);
      const subs = new Set(g.cajas.map((c) => (c.fabricante ? `${c.fabricante} ${c.serie ?? ''}` : g.etiqueta)));
      expect(subs.size).toBe(1);
    }
  });

  it('ordena las cajas de cada grupo por alto y luego por ancho', () => {
    for (const g of agruparCajasSelector(gabinetes.cajas, true)) {
      for (let i = 1; i < g.cajas.length; i++) {
        const a = g.cajas[i - 1];
        const b = g.cajas[i];
        if (!a || !b) continue;
        expect(a.alto_mm < b.alto_mm || (a.alto_mm === b.alto_mm && a.ancho_mm <= b.ancho_mm)).toBe(true);
      }
    }
  });

  it('los grupos de fabricante van antes que "Genéricas" dentro de su tipo', () => {
    const etiquetas = agruparCajasSelector(gabinetes.cajas, true)
      .map((g) => g.etiqueta)
      .filter((e) => e.startsWith('Metálica'));
    expect(etiquetas.at(-1)).toBe('Metálica · Genéricas');
  });
});

describe('tema: contraste AA', () => {
  const combos: [string, string][] = [
    [BLANCO, PALETA['--tec-navy']],
    [BLANCO, PALETA['--tec-azul-acero']],
    [BLANCO, PALETA['--tec-azul-brillo']],
    [PALETA['--tec-grafito'], BLANCO],
    [PALETA['--tec-grafito'], PALETA['--tec-plata-clara']],
    [PALETA['--tec-gris-texto'], BLANCO],
    [PALETA['--tec-gris-texto'], PALETA['--tec-plata-clara']],
    [PALETA['--tec-navy'], PALETA['--tec-plata-clara']],
  ];
  for (const [fg, bg] of combos) {
    it(`${fg} sobre ${bg}`, () => {
      expect(contraste(fg, bg)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL);
    });
  }
});
