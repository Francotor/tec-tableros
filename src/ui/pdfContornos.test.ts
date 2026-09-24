import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { calcularContornos } from '../core/contornos';
import { armarEjemplo, cargarBiblioteca, crearContextoDe } from '../core/ejemplo.testutil';
import { dibujarContornos, opcionesHoja } from './pdfContornos';

const bib = cargarBiblioteca();
const K = 72 / 25.4; // puntos PDF por mm

function generar() {
  const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
  const plan = calcularContornos(armarEjemplo(ctx), ctx);
  const doc = new jsPDF(opcionesHoja(plan, false));
  dibujarContornos(doc, plan, 'Prueba');
  const texto = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
  return { ctx, plan, texto };
}

describe('PDF de contornos', () => {
  it('es vector puro: sin imágenes y sin operadores de relleno', () => {
    const { texto } = generar();
    expect(texto).not.toMatch(/\/Subtype\s*\/Image/);
    expect(texto).not.toMatch(/^f\*?$/m);
    expect(texto).not.toMatch(/^B\*?$/m);
    expect(texto).toMatch(/^S$/m);
    expect(texto).toMatch(/ re$/m);
  });

  it('dibuja los rectángulos a escala 1:1 (1 mm del tablero = 1 mm de la hoja)', () => {
    const { ctx, texto } = generar();
    const anchos = [...texto.matchAll(/^\S+ \S+ (\S+) \S+ re$/gm)].map((m) => Math.abs(Number(m[1])));
    const cerca = (mm: number) => anchos.some((w) => Math.abs(w - mm * K) < 0.05);
    expect(cerca(ctx.caja.ancho)).toBe(true);
    expect(cerca(ctx.caja.area.w)).toBe(true);
    expect(cerca(396)).toBe(true);
  });

  it('la hoja mide lo que dice el plan y lleva el texto de la cota', () => {
    const { ctx, plan, texto } = generar();
    const caja = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(texto);
    expect(Number(caja?.[1])).toBeCloseTo(plan.hoja.ancho * K, 1);
    expect(Number(caja?.[2])).toBeCloseTo(plan.hoja.alto * K, 1);
    expect(texto).toContain(`Ancho de placa ${ctx.caja.area.w} mm`);
  });
});
