import { describe, expect, it } from 'vitest';
import type { Proyecto } from './modelo';
import {
  combinarProyectos,
  crearRespaldo,
  duplicarProyecto,
  nombreSeguro,
  parsearRespaldo,
  validarProyecto,
} from './proyectos';

const proyecto = (id: string, nombre = 'Obra 1'): Proyecto => ({
  id,
  nombre,
  numeroCotizacion: 'C-100',
  notas: 'nota',
  actualizadoEn: '2026-01-01T00:00:00.000Z',
  caja: { id: 'caja_metalica_400x500x200' },
  elementos: [
    { uid: 'a', componenteId: 'riel_din', x_mm: 50, y_mm: 83, largo_mm: 400, valores: {} },
    { uid: 'b', componenteId: 'automatico_1p', x_mm: 50, y_mm: 55.5, valores: { curva: 'C', amperaje: 16 } },
    { uid: 'c', componenteId: 'canaleta_25', x_mm: 60, y_mm: 200, rotacion: 90, largo_mm: 200, valores: {} },
  ],
});

describe('respaldo', () => {
  it('exporta e importa sin pérdida', () => {
    const originales = [proyecto('p1'), { ...proyecto('p2', 'Obra 2'), caja: { libre: { ancho_mm: 600, alto_mm: 500, tipo: 'inox' as const } } }];
    const texto = JSON.stringify(crearRespaldo(originales));
    expect(parsearRespaldo(texto)).toEqual(originales);
  });

  it('rechaza archivos que no son respaldos, con mensajes claros', () => {
    expect(() => parsearRespaldo('no es json')).toThrow(/JSON válido/);
    expect(() => parsearRespaldo('{"hola":1}')).toThrow(/no es un respaldo/);
    expect(() => parsearRespaldo('[]')).toThrow(/no es un respaldo/);
    const nuevo = JSON.stringify({ ...crearRespaldo([]), version: 99 });
    expect(() => parsearRespaldo(nuevo)).toThrow(/versión más nueva/);
    expect(() => parsearRespaldo(JSON.stringify({ ...crearRespaldo([]), proyectos: 3 }))).toThrow(/no contiene proyectos/);
  });

  it('rechaza proyectos mal formados', () => {
    expect(() => validarProyecto(null)).toThrow();
    expect(() => validarProyecto({ id: 'x', elementos: 1 })).toThrow(/elementos/);
    expect(() => validarProyecto({ id: 'x', elementos: [], caja: {} })).toThrow(/caja/);
    expect(() => validarProyecto({ id: 'x', elementos: [{ uid: 1 }], caja: { id: 'c' } })).toThrow(/elemento/);
  });

  it('completa campos opcionales que falten', () => {
    const p = validarProyecto({ id: 'x', elementos: [], caja: { id: 'c' } });
    expect(p).toMatchObject({ nombre: 'Proyecto sin nombre', numeroCotizacion: '', notas: '' });
  });
});

describe('duplicar y combinar', () => {
  it('duplicar da un id nuevo, otro nombre y no comparte objetos con el original', () => {
    const p = proyecto('p1');
    const d = duplicarProyecto(p);
    expect(d.id).not.toBe(p.id);
    expect(d.nombre).toBe('Obra 1 (copia)');
    expect(d.elementos).toEqual(p.elementos);
    const e0 = d.elementos[1];
    if (e0) e0.valores.amperaje = 63;
    expect(p.elementos[1]?.valores.amperaje).toBe(16);
  });

  it('combinar agrega nuevos, omite idénticos y conserva ambos si difieren', () => {
    const existentes = [proyecto('p1'), proyecto('p2')];
    const importados = [proyecto('p1'), { ...proyecto('p2'), nombre: 'Distinto' }, proyecto('p3')];
    const r = combinarProyectos(existentes, importados);
    expect(r).toMatchObject({ agregados: 1, omitidos: 1, copias: 1 });
    expect(r.guardar).toHaveLength(2);
    expect(r.guardar.some((p) => p.id === 'p3')).toBe(true);
    const copia = r.guardar.find((p) => p.id !== 'p3');
    expect(copia?.id).not.toBe('p2');
    expect(copia?.nombre).toBe('Distinto (importado)');
  });
});

describe('nombreSeguro', () => {
  it('deja letras, números y guiones; el resto pasa a guion', () => {
    expect(nombreSeguro('Cotización 123/A')).toBe('Cotización-123-A');
    expect(nombreSeguro('   ')).toBe('tablero');
    expect(nombreSeguro('///')).toBe('tablero');
  });
});
