import { describe, expect, it } from 'vitest';
import { cargarBiblioteca } from './ejemplo.testutil';
import { margenBordePorDefecto, margenesEfectivos } from './margenes';

const bib = cargarBiblioteca();
const CAJA_SIN_LAYOUT = { id: 'caja_metalica_400x500x200' };
const CAJA_CON_LAYOUT = { id: 'caja_inox_asr_180x240x150' }; // margen_lateral 10, margen_vertical 20

describe('margenesEfectivos', () => {
  it('sin edición manual, usa el margen general si la caja no trae layout propio', () => {
    const m = margenesEfectivos({ margenBordeManual: false, margenBorde_mm: null }, CAJA_SIN_LAYOUT, bib.gabinetes);
    expect(m).toEqual({ lateral: bib.gabinetes.parametros.layout.margen_borde_mm, vertical: bib.gabinetes.parametros.layout.margen_borde_mm });
  });

  it('sin edición manual, usa el layout propio (asimétrico) si la caja lo trae', () => {
    const m = margenesEfectivos({ margenBordeManual: false, margenBorde_mm: null }, CAJA_CON_LAYOUT, bib.gabinetes);
    expect(m).toEqual({ lateral: 10, vertical: 20 });
  });

  it('con edición manual, el mismo valor se aplica a ambos lados sin importar la caja', () => {
    const m = margenesEfectivos({ margenBordeManual: true, margenBorde_mm: 15 }, CAJA_CON_LAYOUT, bib.gabinetes);
    expect(m).toEqual({ lateral: 15, vertical: 15 });
  });

  it('medida libre: siempre usa el margen general (no tiene layout propio)', () => {
    const libre = { libre: { ancho_mm: 600, alto_mm: 500, tipo: 'inox' as const } };
    const m = margenesEfectivos({ margenBordeManual: false, margenBorde_mm: null }, libre, bib.gabinetes);
    expect(m).toEqual({ lateral: bib.gabinetes.parametros.layout.margen_borde_mm, vertical: bib.gabinetes.parametros.layout.margen_borde_mm });
  });
});

describe('margenBordePorDefecto', () => {
  it('con caja.layout, muestra el valor lateral como número único', () => {
    expect(margenBordePorDefecto(CAJA_CON_LAYOUT, bib.gabinetes)).toBe(10);
  });

  it('sin caja.layout, muestra el margen general', () => {
    expect(margenBordePorDefecto(CAJA_SIN_LAYOUT, bib.gabinetes)).toBe(bib.gabinetes.parametros.layout.margen_borde_mm);
  });
});

describe('cambio de caja: el margen "sigue" a la caja salvo edición manual', () => {
  it('sin edición manual, el margen efectivo cambia solo con la caja', () => {
    const proyecto = { margenBordeManual: false, margenBorde_mm: null };
    const antes = margenesEfectivos(proyecto, CAJA_SIN_LAYOUT, bib.gabinetes);
    const despues = margenesEfectivos(proyecto, CAJA_CON_LAYOUT, bib.gabinetes);
    expect(antes).not.toEqual(despues);
  });

  it('con edición manual, el margen efectivo no cambia al cambiar de caja', () => {
    const proyecto = { margenBordeManual: true, margenBorde_mm: 33 };
    const antes = margenesEfectivos(proyecto, CAJA_SIN_LAYOUT, bib.gabinetes);
    const despues = margenesEfectivos(proyecto, CAJA_CON_LAYOUT, bib.gabinetes);
    expect(antes).toEqual(despues);
    expect(despues).toEqual({ lateral: 33, vertical: 33 });
  });
});
