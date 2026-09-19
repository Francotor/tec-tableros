import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agruparPorCategoria, formatearMm, leerViewBox, parsearBiblioteca } from './biblioteca';
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
