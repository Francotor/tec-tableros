import { describe, expect, it } from 'vitest';
import { calcularContornos, MARGEN_HOJA_MM } from './contornos';
import { armarEjemplo, cargarBiblioteca, crearContextoDe } from './ejemplo.testutil';

const bib = cargarBiblioteca();

describe('contornos (vista interior en vector)', () => {
  it('incluye caja, placa, rieles, aparatos, canaletas y topes, todo a medidas reales', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
    const plan = calcularContornos(armarEjemplo(ctx), ctx);
    const capas = new Set(plan.rects.map((r) => r.capa));
    for (const c of ['caja', 'placa', 'riel', 'aparato', 'canaleta', 'tope'] as const) expect(capas.has(c)).toBe(true);

    const caja = plan.rects.find((r) => r.capa === 'caja');
    expect(caja).toMatchObject({ x: 0, y: 0, w: ctx.caja.ancho, h: ctx.caja.alto });
    const placa = plan.rects.find((r) => r.capa === 'placa');
    expect(placa).toMatchObject(ctx.caja.area);
    // El riel del ejemplo mide 396 mm de largo.
    expect(plan.rects.filter((r) => r.capa === 'riel').every((r) => r.w === 396)).toBe(true);
  });

  it('la hoja tiene el tamaño de la caja más los márgenes de cota', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
    const plan = calcularContornos([], ctx);
    expect(plan.hoja.ancho).toBeGreaterThanOrEqual(ctx.caja.ancho + 2 * MARGEN_HOJA_MM);
    expect(plan.hoja.alto).toBeGreaterThanOrEqual(ctx.caja.alto + 2 * MARGEN_HOJA_MM);
    expect(plan.origen.x + ctx.caja.ancho).toBeLessThanOrEqual(plan.hoja.ancho);
  });

  it('la cota de ancho mide exactamente el ancho de la placa', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
    const plan = calcularContornos([], ctx);
    const h = plan.cotas.find((c) => c.orientacion === 'horizontal');
    expect(h && h.hasta - h.desde).toBe(ctx.caja.area.w);
    expect(h?.texto).toContain(String(ctx.caja.area.w));
  });

  it('en una caja plástica no hay placa aparte y se dibujan sus rieles incluidos', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_plastica_sobrepuesta_2f' });
    const plan = calcularContornos([], ctx);
    expect(plan.rects.some((r) => r.capa === 'placa')).toBe(false);
    expect(plan.rects.filter((r) => r.capa === 'riel')).toHaveLength(ctx.caja.rielesIncluidos.length);
  });

  it('dibuja las fijaciones como círculos cuando la caja las trae', () => {
    const conFij = bib.gabinetes.cajas.find((c) => (c.fijaciones?.length ?? 0) > 0);
    if (!conFij) return;
    const ctx = crearContextoDe(bib, { id: conFij.id });
    const plan = calcularContornos([], ctx);
    expect(plan.circulos).toHaveLength(conFij.fijaciones?.length ?? 0);
  });
});
