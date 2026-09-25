import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { dibujarListaPaginada, numerarPaginas } from './pdfLista';
import type { FilaLista } from './pdfLista';

const A4 = { ancho: 210, alto: 297 };
const OP = { margen: 12, anchoPagina: A4.ancho, altoPagina: A4.alto, pie: 8 };
const LIMITE_INFERIOR = A4.alto - OP.margen - OP.pie;

const larga = 'Caja metalica sobrepuesta Lerkenbox ARES 1150 x 800 x 280 con placa de montaje, puerta transparente, cierre de doble paleta y accesorios de fijacion para pared';
function filas(n: number, conLargas = 0): FilaLista[] {
  const normales: FilaLista[] = Array.from({ length: n }, (_, i) => ({
    cant: `${i + 1} un`,
    texto: i < conLargas ? `${larga} (${i + 1})` : `Interruptor automatico 1P C${10 + i} A (${i + 1})`,
    total: false,
  }));
  return [...normales, { cant: '1,2 m', texto: 'Total riel DIN', total: true }, { cant: '0 m', texto: 'Total canaleta', total: true }];
}
const nuevoDoc = () => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: false });
  doc.addPage(); // la lista parte en la página 2, como en el PDF real
  return doc;
};
const contenidoPdf = (doc: jsPDF): string => new TextDecoder('latin1').decode(doc.output('arraybuffer'));

describe('lista de materiales paginada en el PDF', () => {
  it('una lista corta cabe en una sola hoja (la página de la lista)', () => {
    const doc = nuevoDoc();
    const puestas = dibujarListaPaginada(doc, filas(12), OP);
    expect(doc.getNumberOfPages()).toBe(2);
    expect(puestas.every((p) => p.pagina === 2)).toBe(true);
  });

  it('con más de 20 líneas (60) pagina en varias hojas, sin partir ninguna fila entre dos páginas', () => {
    const doc = nuevoDoc();
    const puestas = dibujarListaPaginada(doc, filas(60, 10), OP);
    expect(puestas).toHaveLength(62);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    for (const p of puestas) {
      // Cada fila queda entera dentro de los márgenes de su página.
      expect(p.y, `fila ${p.fila} arriba`).toBeGreaterThanOrEqual(OP.margen - 0.01);
      expect(p.y + p.alto, `fila ${p.fila} abajo`).toBeLessThanOrEqual(LIMITE_INFERIOR + 0.01);
    }
    // El orden se conserva: páginas no decrecientes y, dentro de una página, y creciente sin solaparse.
    for (let i = 1; i < puestas.length; i++) {
      const a = puestas[i - 1]!;
      const b = puestas[i]!;
      expect(b.pagina).toBeGreaterThanOrEqual(a.pagina);
      if (b.pagina === a.pagina) expect(b.y).toBeGreaterThanOrEqual(a.y + a.alto - 0.01);
    }
  });

  it('una fila de varias líneas que no cabe al pie pasa completa a la página siguiente', () => {
    const doc = nuevoDoc();
    const puestas = dibujarListaPaginada(doc, filas(80, 80), OP);
    const porPagina = new Map<number, number[]>();
    for (const p of puestas) porPagina.set(p.pagina, [...(porPagina.get(p.pagina) ?? []), p.fila]);
    expect([...porPagina.keys()].length).toBeGreaterThan(2);
    // Cada fila aparece una sola vez y todas caben (ninguna quedó cortada por el pie).
    expect(new Set(puestas.map((p) => p.fila)).size).toBe(puestas.length);
    for (const p of puestas) expect(p.y + p.alto).toBeLessThanOrEqual(LIMITE_INFERIOR + 0.01);
  });

  it('la cabecera de la tabla se repite en cada página de la lista y las continuaciones lo dicen', () => {
    const doc = nuevoDoc();
    const puestas = dibujarListaPaginada(doc, filas(60, 10), OP);
    const paginasLista = new Set(puestas.map((p) => p.pagina)).size;
    const texto = contenidoPdf(doc);
    expect(texto.match(/\(Cant\.\) Tj/g)).toHaveLength(paginasLista);
    // Dentro del PDF los paréntesis del título van escapados con una barra invertida.
    const continuaciones = texto.split('continuaci').length - 1;
    expect(continuaciones).toBe(paginasLista - 1);
  });

  it('los totales van al final, después de todos los materiales', () => {
    const doc = nuevoDoc();
    const puestas = dibujarListaPaginada(doc, filas(60), OP);
    const [antepenultima, penultima, ultima] = puestas.slice(-3);
    expect(ultima!.fila).toBe(61);
    expect(penultima!.fila).toBe(60);
    expect(antepenultima!.fila).toBe(59);
  });

  it('numera todas las páginas del documento', () => {
    const doc = nuevoDoc();
    dibujarListaPaginada(doc, filas(60, 10), OP);
    numerarPaginas(doc, 'Obra', A4.ancho, A4.alto, OP.margen);
    const total = doc.getNumberOfPages();
    const texto = contenidoPdf(doc);
    for (let p = 1; p <= total; p++) expect(texto).toContain(`gina ${p} de ${total}`);
  });
});
