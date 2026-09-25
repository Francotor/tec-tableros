import { describe, expect, it } from 'vitest';
import { agregarElemento, calcularTopes } from './colocacion';
import { cargarBiblioteca, crearContextoDe } from './ejemplo.testutil';
import { valoresPorDefecto } from './modelo';
import type { Elemento } from './modelo';

const bib = cargarBiblioteca();
const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });

function rielConAparatos(xs: number[]): Elemento[] {
  const r = agregarElemento([], ctx, 'riel_din', { x: 250, y: 100 }, {});
  if (!r.ok) throw new Error(r.motivo);
  let els = r.elementos;
  const riel = els[0]!;
  const comp = ctx.comps.get('automatico_1p')!;
  for (const x of xs) {
    const c = agregarElemento(els, ctx, 'automatico_1p', { x: riel.x_mm + x + 9, y: riel.y_mm + ctx.rielAlto / 2 }, valoresPorDefecto(comp));
    if (!c.ok) throw new Error(c.motivo);
    els = c.elementos;
  }
  return els;
}

describe('topes de riel: dos por riel con aparatos, no uno por aparato', () => {
  it.each([1, 2, 10, 20])('%i aparatos seguidos en un riel llevan 2 topes', (n) => {
    const els = rielConAparatos(Array.from({ length: n }, (_, i) => i * 18));
    expect(calcularTopes(els, ctx)).toHaveLength(2);
  });

  it('uno queda al inicio del grupo y otro al final', () => {
    const els = rielConAparatos([36, 54, 72]);
    const aparatos = els.slice(1);
    const minX = Math.min(...aparatos.map((a) => a.x_mm));
    const maxX = Math.max(...aparatos.map((a) => a.x_mm + 18));
    const topes = calcularTopes(els, ctx).map((t) => t.rect);
    expect(topes[0]!.x + topes[0]!.w).toBe(minX);
    expect(topes[1]!.x).toBe(maxX);
  });

  it('un riel sin aparatos no lleva topes', () => {
    expect(calcularTopes(rielConAparatos([]), ctx)).toHaveLength(0);
  });

  it('con un hueco en medio siguen siendo 2 topes por riel (los extremos del grupo)', () => {
    expect(calcularTopes(rielConAparatos([18, 36, 180, 198]), ctx)).toHaveLength(2);
  });
});
