import { describe, expect, it } from 'vitest';
import { cargarBiblioteca } from './ejemplo.testutil';
import { nombreCortoCaja } from './nombreCaja';

const { gabinetes } = cargarBiblioteca();

describe('nombre corto de la caja', () => {
  it('serie del fabricante y medidas', () => {
    expect(nombreCortoCaja({ id: 'caja_metalica_dm_700x500x260' }, gabinetes)).toMatch(/^DM \d+×\d+×\d+$/);
    expect(nombreCortoCaja({ id: 'caja_metalica_ares_400x400x200' }, gabinetes)).toBe('ARES 400×400×200');
    expect(nombreCortoCaja({ id: 'caja_inox_asr_600x600x210' }, gabinetes)).toBe('ASR 600×600×210');
  });

  it('las medidas genéricas se llaman Genérica', () => {
    expect(nombreCortoCaja({ id: 'caja_metalica_400x500x200' }, gabinetes)).toBe('Genérica 400×500×200');
    expect(nombreCortoCaja({ id: 'caja_inox_400x500x200' }, gabinetes)).toBe('Genérica 400×500×200');
  });

  it('plásticas y medida libre', () => {
    expect(nombreCortoCaja({ id: 'caja_plastica_embutida_2f' }, gabinetes)).toBe('Plástica embutida 12 mód. × 2 filas');
    expect(nombreCortoCaja({ id: 'caja_plastica_sobrepuesta_1f' }, gabinetes)).toBe('Plástica sobrepuesta 12 mód. × 1 fila');
    expect(nombreCortoCaja({ libre: { ancho_mm: 800, alto_mm: 1000, tipo: 'metalica' } }, gabinetes)).toBe('Libre 800×1000');
  });

  it('una caja que ya no existe no rompe', () => {
    expect(nombreCortoCaja({ id: 'no_existe' }, gabinetes)).toBe('sin caja');
  });

  it('todas las cajas del catálogo tienen un nombre corto legible (corto y sin "undefined")', () => {
    for (const c of gabinetes.cajas) {
      const n = nombreCortoCaja({ id: c.id }, gabinetes);
      expect(n, c.id).not.toContain('undefined');
      expect(n.length, c.id).toBeLessThanOrEqual(40);
    }
  });
});
