import { describe, expect, it } from 'vitest';
import {
  combinarPlantillas,
  plantillaDesdeProyecto,
  proyectoDesdePlantilla,
  renombrarPlantilla,
  validarPlantilla,
} from './plantillas';
import type { Plantilla } from './plantillas';
import type { Proyecto } from './modelo';

const proyecto = (): Proyecto => ({
  id: 'p1',
  nombre: 'Obra Pérez',
  numeroCotizacion: 'C-2041',
  notas: 'Ojo con el medidor',
  actualizadoEn: '2026-01-01T00:00:00.000Z',
  caja: { id: 'caja_metalica_400x500x200' },
  margenBordeManual: true,
  margenBorde_mm: 25,
  modo: 'con_canaleta',
  seccionCanaleta_mm: 60,
  circuitos: [],
  elementos: [
    { uid: 'a', componenteId: 'riel_din', x_mm: 50, y_mm: 83, largo_mm: 400, valores: {} },
    { uid: 'b', componenteId: 'automatico_1p', x_mm: 50, y_mm: 55.5, valores: { curva: 'C', amperaje: 16 } },
  ],
});

describe('plantillaDesdeProyecto', () => {
  it('copia caja, elementos, margen y modo, pero no la cotización ni las notas', () => {
    const p = plantillaDesdeProyecto(proyecto(), 'Domiciliario tipo A');
    expect(p).toMatchObject({
      nombre: 'Domiciliario tipo A',
      caja: { id: 'caja_metalica_400x500x200' },
      margenBordeManual: true,
      margenBorde_mm: 25,
      modo: 'con_canaleta',
      seccionCanaleta_mm: 60,
    });
    expect(p.elementos).toHaveLength(2);
    expect('numeroCotizacion' in p).toBe(false);
    expect('notas' in p).toBe(false);
  });

  it('la plantilla tiene su propio id y no comparte objetos con el proyecto original', () => {
    const orig = proyecto();
    const p = plantillaDesdeProyecto(orig, 'X');
    expect(p.id).not.toBe(orig.id);
    const valores = p.elementos[1]?.valores;
    if (valores) valores.amperaje = 63;
    expect(orig.elementos[1]?.valores.amperaje).toBe(16);
  });

  it('no copia circuitoId: los circuitos son propios de cada proyecto, la plantilla no los trae', () => {
    const orig = proyecto();
    orig.elementos[1] = { ...(orig.elementos[1] as Proyecto['elementos'][number]), circuitoId: 'c1' };
    const p = plantillaDesdeProyecto(orig, 'X');
    expect(p.elementos[1]?.circuitoId).toBeUndefined();
    expect('circuitoId' in (p.elementos[1] ?? {})).toBe(false);
  });

  it('sí copia alimentadoPor (es una relación interna del dibujo, por uid)', () => {
    const orig = proyecto();
    orig.elementos[1] = { ...(orig.elementos[1] as Proyecto['elementos'][number]), alimentadoPor: 'a' };
    const p = plantillaDesdeProyecto(orig, 'X');
    expect(p.elementos[1]?.alimentadoPor).toBe('a');
  });
});

describe('proyectoDesdePlantilla', () => {
  it('arma un proyecto con el layout de la plantilla, cotización y notas vacías', () => {
    const p = plantillaDesdeProyecto(proyecto(), 'Domiciliario tipo A');
    const nuevo = proyectoDesdePlantilla(p);
    expect(nuevo).toMatchObject({
      nombre: 'Domiciliario tipo A',
      numeroCotizacion: '',
      notas: '',
      caja: { id: 'caja_metalica_400x500x200' },
      margenBordeManual: true,
      margenBorde_mm: 25,
      modo: 'con_canaleta',
      seccionCanaleta_mm: 60,
      circuitos: [],
    });
    expect(nuevo.elementos).toHaveLength(2);
  });

  it('cada "nuevo desde plantilla" tiene su propio id de proyecto, pero conserva los uid de los elementos', () => {
    const p = plantillaDesdeProyecto(proyecto(), 'X');
    const a = proyectoDesdePlantilla(p);
    const b = proyectoDesdePlantilla(p);
    expect(a.id).not.toBe(b.id);
    expect(a.elementos.map((e) => e.uid)).toEqual(p.elementos.map((e) => e.uid));
    expect(b.elementos.map((e) => e.uid)).toEqual(p.elementos.map((e) => e.uid));
    // No comparten los objetos de valores entre las dos copias.
    const va = a.elementos[1]?.valores;
    if (va) va.amperaje = 10;
    expect(b.elementos[1]?.valores.amperaje).toBe(16);
  });
});

describe('renombrarPlantilla', () => {
  it('cambia el nombre, conserva el id, la caja y los elementos', () => {
    const p = plantillaDesdeProyecto(proyecto(), 'Antes');
    const r = renombrarPlantilla(p, 'Después', new Date('2026-02-02T00:00:00.000Z'));
    expect(r).toMatchObject({ id: p.id, nombre: 'Después', caja: p.caja, elementos: p.elementos });
    expect(r.actualizadoEn).toBe('2026-02-02T00:00:00.000Z');
  });
});

describe('validarPlantilla', () => {
  it('acepta una plantilla válida', () => {
    const p = plantillaDesdeProyecto(proyecto(), 'X');
    expect(validarPlantilla(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('rechaza lo que no tiene forma de plantilla', () => {
    expect(() => validarPlantilla(null)).toThrow();
    expect(() => validarPlantilla({})).toThrow(/identificador/);
    expect(() => validarPlantilla({ id: 'x' })).toThrow(/elementos/);
    expect(() => validarPlantilla({ id: 'x', elementos: [] })).toThrow(/caja/);
  });

  it('completa campos que falten con valores razonables', () => {
    const p = validarPlantilla({ id: 'x', elementos: [], caja: { id: 'c' } });
    expect(p).toMatchObject({ nombre: 'Plantilla sin nombre', margenBordeManual: false, margenBorde_mm: null, modo: 'compacto', seccionCanaleta_mm: 40 });
  });
});

describe('combinarPlantillas', () => {
  const a = (): Plantilla => plantillaDesdeProyecto(proyecto(), 'A');

  it('agrega nuevas, omite idénticas y copia las que difieren con el mismo id', () => {
    const p1 = a();
    const p2 = { ...a(), id: 'otra', nombre: 'B' };
    const existentes = [p1];
    const importadas = [p1, { ...p1, nombre: 'A modificada' }, p2];
    const r = combinarPlantillas(existentes, importadas);
    expect(r).toMatchObject({ agregadas: 1, omitidas: 1, copias: 1 });
    expect(r.guardar.some((p) => p.id === 'otra')).toBe(true);
    const copia = r.guardar.find((p) => p.id !== 'otra');
    expect(copia?.id).not.toBe(p1.id);
    expect(copia?.nombre).toBe('A modificada (importada)');
  });
});
