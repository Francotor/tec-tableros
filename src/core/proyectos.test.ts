import { describe, expect, it } from 'vitest';
import type { Proyecto } from './modelo';
import { plantillaDesdeProyecto } from './plantillas';
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
  margenBordeManual: false,
  margenBorde_mm: null,
  modo: 'compacto',
  seccionCanaleta_mm: 40,
  topesAutomaticos: true,
  circuitos: [],
  elementos: [
    { uid: 'a', componenteId: 'riel_din', x_mm: 50, y_mm: 83, largo_mm: 400, valores: {} },
    { uid: 'b', componenteId: 'automatico_1p', x_mm: 50, y_mm: 55.5, valores: { curva: 'C', amperaje: 16 } },
    { uid: 'c', componenteId: 'canaleta_25', x_mm: 60, y_mm: 200, rotacion: 90, largo_mm: 200, valores: {} },
  ],
});

describe('respaldo', () => {
  it('exporta e importa proyectos sin pérdida', () => {
    const originales = [proyecto('p1'), { ...proyecto('p2', 'Obra 2'), caja: { libre: { ancho_mm: 600, alto_mm: 500, tipo: 'inox' as const } } }];
    const texto = JSON.stringify(crearRespaldo(originales));
    expect(parsearRespaldo(texto)).toEqual({ proyectos: originales, plantillas: [] });
  });

  it('incluye las plantillas en el mismo respaldo', () => {
    const plantillas = [plantillaDesdeProyecto(proyecto('p1'), 'Domiciliario tipo A')];
    const texto = JSON.stringify(crearRespaldo([proyecto('p1')], plantillas));
    expect(parsearRespaldo(texto)).toEqual({ proyectos: [proyecto('p1')], plantillas });
  });

  it('un respaldo sin "plantillas" (de antes de esta versión) se importa igual, sin ninguna', () => {
    const { plantillas: _plantillas, ...sinPlantillas } = crearRespaldo([proyecto('p1')]);
    void _plantillas;
    expect(parsearRespaldo(JSON.stringify(sinPlantillas))).toEqual({ proyectos: [proyecto('p1')], plantillas: [] });
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

  it('abre un proyecto guardado antes de esta versión (sin margen/modo/sección), con el margen automático', () => {
    const p = validarProyecto({ id: 'x', elementos: [], caja: { id: 'c' } });
    expect(p).toMatchObject({ margenBordeManual: false, margenBorde_mm: null, modo: 'compacto', seccionCanaleta_mm: 40 });
  });

  it('conserva un margen editado a mano guardado antes de esta versión', () => {
    const p = validarProyecto({ id: 'x', elementos: [], caja: { id: 'c' }, margenBordeManual: true, margenBorde_mm: 25, modo: 'con_canaleta', seccionCanaleta_mm: 60 });
    expect(p).toMatchObject({ margenBordeManual: true, margenBorde_mm: 25, modo: 'con_canaleta', seccionCanaleta_mm: 60 });
  });

  it('ignora un modo o una sección de canaleta inválidos', () => {
    const p = validarProyecto({ id: 'x', elementos: [], caja: { id: 'c' }, modo: 'otro', seccionCanaleta_mm: 99 });
    expect(p).toMatchObject({ modo: 'compacto', seccionCanaleta_mm: 40 });
  });
});

describe('topes automáticos del proyecto', () => {
  it('un proyecto guardado antes de este ajuste se abre con los topes activados', () => {
    const { topesAutomaticos: _t, ...sinCampo } = proyecto('a');
    void _t;
    expect(validarProyecto(sinCampo).topesAutomaticos).toBe(true);
  });

  it('conserva el ajuste apagado al guardar y abrir', () => {
    expect(validarProyecto({ ...proyecto('a'), topesAutomaticos: false }).topesAutomaticos).toBe(false);
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
