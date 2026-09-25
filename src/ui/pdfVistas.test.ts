import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { cargarBiblioteca } from '../core/ejemplo.testutil';
import { resolverCaja } from '../core/caja';
import { calcularVistaFrontal, datosFrontalDeCaja } from '../core/vistaFrontal';
import { ajustarACelda, dibujarVistaFrontal } from './pdfVistas';

const bib = cargarBiblioteca();
const nuevoDoc = () => new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: false });
const textoPdf = (doc: jsPDF): string => new TextDecoder('latin1').decode(doc.output('arraybuffer'));

describe('vista frontal en el PDF', () => {
  it('se ajusta a la celda sin deformar', () => {
    const { w, h, escala } = ajustarACelda(800, 600, 90, 175);
    expect(w).toBeLessThanOrEqual(90 + 1e-9);
    expect(h).toBeLessThanOrEqual(175 + 1e-9);
    expect(w / h).toBeCloseTo(800 / 600, 9);
    expect(escala).toBeCloseTo(90 / 800, 9);
    // Caja alta: manda el alto de la celda.
    const alta = ajustarACelda(300, 1000, 90, 175);
    expect(alta.h).toBeCloseTo(175, 9);
    expect(alta.w / alta.h).toBeCloseTo(0.3, 9);
  });

  it.each(['caja_metalica_400x500x200', 'caja_metalica_ares_400x400x200', 'caja_plastica_embutida_2f', 'caja_inox_asr_600x600x210'])(
    'dibuja %s dentro de su celda, centrada, con el nombre del tablero como texto',
    (id) => {
      const caja = resolverCaja({ id }, bib.gabinetes)!;
      const vista = calcularVistaFrontal(datosFrontalDeCaja(caja, bib.gabinetes), 'Tablero de prueba');
      const doc = nuevoDoc();
      const r = dibujarVistaFrontal(doc, vista, 12, 40, 90, 175);
      expect(r.x).toBeGreaterThanOrEqual(12 - 1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(12 + 90 + 1e-9);
      expect(r.y).toBe(40);
      expect(r.y + r.h).toBeLessThanOrEqual(40 + 175 + 1e-9);
      expect(r.w / r.h).toBeCloseTo(caja.ancho / caja.alto, 6);
      expect(textoPdf(doc)).toContain('(Tablero de prueba) Tj');
    },
  );
});
