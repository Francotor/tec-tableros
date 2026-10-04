import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { armarEjemplo, cargarBiblioteca, crearContextoDe } from '../core/ejemplo.testutil';
import { calcularOcupacion } from '../core/ocupacion';
import { filasOcupacionPdf, notaOcupacion } from './ocupacionUi';
import { dibujarListaPaginada, dibujarOcupacionPaginada } from './pdfLista';
import type { FilaLista, FilaOcupacionTabla } from './pdfLista';

const A4 = { ancho: 210, alto: 297 };
const OP = { margen: 12, anchoPagina: A4.ancho, altoPagina: A4.alto, pie: 8 };
const LIMITE_INFERIOR = A4.alto - OP.margen - OP.pie;

const nuevoDoc = () => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: false });
  doc.addPage();
  return doc;
};
const contenidoPdf = (doc: jsPDF): string => new TextDecoder('latin1').decode(doc.output('arraybuffer'));
const lista = (n: number): FilaLista[] => Array.from({ length: n }, (_, i) => ({ cant: `${i + 1} un`, texto: `Interruptor automatico 1P C${10 + i} A`, total: false }));
const finDeLista = (doc: jsPDF, n: number) => {
  const puestas = dibujarListaPaginada(doc, lista(n), OP);
  const u = puestas[puestas.length - 1]!;
  return { pagina: u.pagina, y: u.y + u.alto };
};
const fila = (nombre: string, estado = 'Dentro del máximo', total = false): FilaOcupacionTabla => ({
  fila: nombre,
  modulos: '12 de 20',
  maximo: '15',
  porcentaje: '60 %',
  estado,
  color: [46, 125, 50],
  total,
});

describe('filas de la tabla "Ocupación de riel" del PDF', () => {
  const bib = cargarBiblioteca();
  const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
  const o = calcularOcupacion(armarEjemplo(ctx), ctx)!;
  const filas = filasOcupacionPdf(o);

  it('primero el tablero completo y luego cada fila, todo escrito (el estado no depende del color)', () => {
    expect(filas.map((f) => f.fila)).toEqual(['Tablero completo', 'Fila 1', 'Fila 2']);
    expect(filas[0]!.total).toBe(true);
    expect(filas.slice(1).every((f) => !f.total)).toBe(true);
    for (const f of filas) {
      expect(f.estado).toMatch(/^(Dentro del máximo|Sin reserva del 25 %|Excede la (fila|caja))$/);
      expect(f.porcentaje).toMatch(/^\d+ %$/);
      expect(f.modulos).toMatch(/^[\d,]+ de \d+$/);
    }
  });

  it('los números son los del panel: el ejemplo ocupa 40 módulos de capacidad con un máximo de 30', () => {
    expect(filas[0]!.modulos.endsWith(' de 40')).toBe(true);
    expect(filas[0]!.maximo).toBe('30');
    expect(filas[1]!.maximo).toBe('15');
    expect(filas[0]!.estado).toBe('Sin reserva del 25 %');
  });

  it('la leyenda dice de dónde sale el máximo', () => {
    expect(notaOcupacion(o)).toContain('25 %');
    expect(notaOcupacion(o)).toContain('75 %');
    expect(notaOcupacion(o)).toContain('RIC');
  });
});

describe('tabla "Ocupación de riel" en el PDF', () => {
  const LEYENDA = 'Reserva del 25 % de la capacidad total (RIC N°02 6.1.16.3): se ocupa como máximo el 75 %.';

  it('con una lista corta parte debajo de ella, en la misma página, con título, leyenda y el estado escrito', () => {
    const doc = nuevoDoc();
    const desde = finDeLista(doc, 6);
    const puestas = dibujarOcupacionPaginada(doc, [fila('Tablero completo', 'Sin reserva del 25 %', true), fila('Fila 1'), fila('Fila 2', 'Excede la fila')], OP, desde, LEYENDA);
    expect(puestas).toHaveLength(3);
    expect(doc.getNumberOfPages()).toBe(2);
    expect(puestas.every((p) => p.pagina === desde.pagina && p.y > desde.y)).toBe(true);
    const pdf = contenidoPdf(doc);
    expect(pdf).toContain('Ocupaci');
    expect(pdf).toContain('Sin reserva del 25 %');
    expect(pdf).toContain('Excede la fila');
    expect(pdf).toContain('Dentro del m');
  });

  it('si la lista llegó al pie, empieza en una página nueva', () => {
    const doc = nuevoDoc();
    const desde = { pagina: 2, y: LIMITE_INFERIOR - 10 }; // la lista terminó casi al pie
    const puestas = dibujarOcupacionPaginada(doc, [fila('Tablero completo', 'Dentro del máximo', true), fila('Fila 1')], OP, desde, LEYENDA);
    expect(doc.getNumberOfPages()).toBe(3);
    expect(puestas[0]!.pagina).toBeGreaterThan(desde.pagina);
    for (const p of puestas) expect(p.y + p.alto).toBeLessThanOrEqual(LIMITE_INFERIOR + 0.01);
  });

  it('con muchas filas pagina sin salirse del margen y repite la cabecera', () => {
    const doc = nuevoDoc();
    const desde = finDeLista(doc, 10);
    const muchas = [fila('Tablero completo', 'Dentro del máximo', true), ...Array.from({ length: 70 }, (_, i) => fila(`Fila ${i + 1}`))];
    const puestas = dibujarOcupacionPaginada(doc, muchas, OP, desde, LEYENDA);
    expect(puestas).toHaveLength(71);
    expect(new Set(puestas.map((p) => p.pagina)).size).toBeGreaterThan(1);
    for (const p of puestas) {
      expect(p.y).toBeGreaterThanOrEqual(OP.margen - 0.01);
      expect(p.y + p.alto).toBeLessThanOrEqual(LIMITE_INFERIOR + 0.01);
    }
    expect(contenidoPdf(doc).split('continuaci').length - 1).toBeGreaterThan(0);
  });
});
