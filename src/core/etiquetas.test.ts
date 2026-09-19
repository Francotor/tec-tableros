import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsearCatalogo } from './biblioteca';
import { validarLargo } from './colocacion';
import { expandirPlantilla, interpretarValor, lineasEtiqueta, tamanoAjustado, valoresEfectivos } from './etiquetas';
import { valoresPorDefecto } from './modelo';
import type { Elemento } from './modelo';
import type { Componente } from './tipos';

const catalogo = parsearCatalogo(JSON.parse(readFileSync(join(process.cwd(), 'public', 'biblioteca', 'catalogo.json'), 'utf8')));
const comp = (id: string): Componente => {
  const c = catalogo.componentes.find((x) => x.id === id);
  if (!c) throw new Error(`falta ${id}`);
  return c;
};
const elemento = (id: string, valores: Elemento['valores'] = {}): Pick<Elemento, 'valores' | 'largo_mm'> => ({
  valores: { ...valoresPorDefecto(comp(id)), ...valores },
});

describe('expandirPlantilla', () => {
  it('reemplaza varios campos', () => {
    expect(expandirPlantilla('{curva}{amperaje}', { curva: 'C', amperaje: 16 })).toBe('C16');
  });

  it('un campo faltante queda vacío y no rompe', () => {
    expect(expandirPlantilla('K{indice} {corriente}A', { corriente: 25 })).toBe('K 25A');
    expect(expandirPlantilla('{nada}', {})).toBe('');
  });

  it('acepta plantillas sin campos y llaves mal formadas', () => {
    expect(expandirPlantilla('fijo', {})).toBe('fijo');
    expect(expandirPlantilla('{', {})).toBe('{');
    expect(expandirPlantilla('', {})).toBe('');
  });
});

describe('lineasEtiqueta', () => {
  it('automático 1P: curva y amperaje en una línea', () => {
    expect(lineasEtiqueta(comp('automatico_1p'), elemento('automatico_1p'))).toEqual(['C16']);
  });

  it('cambiar amperaje o curva actualiza la etiqueta', () => {
    const c = comp('automatico_2p');
    expect(lineasEtiqueta(c, elemento('automatico_2p', { amperaje: 40 }))).toEqual(['2P', 'C40']);
    expect(lineasEtiqueta(c, elemento('automatico_2p', { curva: 'D', amperaje: 25 }))).toEqual(['2P', 'D25']);
  });

  it('diferencial: amperaje y sensibilidad', () => {
    const c = comp('diferencial_2p');
    const sens = c.campos.find((f) => f.id === 'sensibilidad');
    expect(sens?.tipo).toBe('select');
    if (sens?.tipo !== 'select') return;
    const otra = sens.opciones.find((o) => o !== sens.defecto) ?? sens.defecto;
    expect(lineasEtiqueta(c, elemento('diferencial_2p', { amperaje: 63, sensibilidad: otra }))).toEqual(['63A', String(otra)]);
  });

  it('un campo faltante en el elemento usa el defecto de la ficha', () => {
    expect(lineasEtiqueta(comp('automatico_1p'), { valores: {} })).toEqual(['C16']);
  });

  it('texto libre vacío no deja líneas vacías', () => {
    expect(lineasEtiqueta(comp('reloj_control'), elemento('reloj_control', { etiqueta: '   ' }))).toEqual([]);
    expect(lineasEtiqueta(comp('reloj_control'), elemento('reloj_control', { etiqueta: 'Riego' }))).toEqual(['Riego']);
  });

  it('piezas sin etiqueta devuelven una lista vacía', () => {
    expect(lineasEtiqueta(comp('fotocelda'), elemento('fotocelda'))).toEqual([]);
    expect(lineasEtiqueta(comp('riel_din'), elemento('riel_din'))).toEqual([]);
  });

  it('cada plantilla de la biblioteca se expande sin lanzar y sin llaves sobrantes', () => {
    for (const c of catalogo.componentes) {
      const l = lineasEtiqueta(c, { valores: valoresPorDefecto(c) });
      for (const linea of l) expect(linea).not.toMatch(/[{}]/);
    }
  });
});

describe('valores y campos', () => {
  it('los atributos de la ficha completan la plantilla ({polos})', () => {
    expect(valoresEfectivos(comp('automatico_3p'), { valores: {} }).polos).toBe(3);
  });

  it('interpreta lo escrito en cada tipo de campo', () => {
    const curva = comp('automatico_1p').campos.find((c) => c.id === 'curva');
    const amperaje = comp('automatico_1p').campos.find((c) => c.id === 'amperaje');
    const indice = comp('contactor_3p').campos.find((c) => c.id === 'indice');
    const texto = comp('reloj_control').campos[0];
    if (!curva || !amperaje || !indice || !texto) throw new Error('faltan campos');
    expect(interpretarValor(curva, 'B')).toBe('B');
    expect(interpretarValor(curva, 'Z')).toBeNull();
    expect(interpretarValor(amperaje, '20')).toBe(20); // devuelve el número de la opción
    expect(interpretarValor(indice, '3')).toBe(3);
    expect(interpretarValor(indice, '')).toBeNull();
    expect(interpretarValor(indice, '2,5')).toBeNull();
    expect(interpretarValor(texto, 'Bomba')).toBe('Bomba');
  });
});

describe('tamanoAjustado', () => {
  it('mantiene el tamaño si cabe y lo reduce si no', () => {
    expect(tamanoAjustado('C16', 13, 4.4)).toBe(4.4);
    const t = tamanoAjustado('MUY LARGO', 13, 4.4);
    expect(t).toBeLessThan(4.4);
    expect(9 * 0.62 * t).toBeCloseTo(13);
    expect(tamanoAjustado('', 13, 4.4)).toBe(4.4);
  });
});

describe('validarLargo', () => {
  it('acepta el rango de la ficha y rechaza lo demás', () => {
    const riel = comp('riel_din');
    expect(validarLargo(riel, 400)).toBeNull();
    expect(validarLargo(riel, 50)).toBeNull();
    expect(validarLargo(riel, 2000)).toBeNull();
    expect(validarLargo(riel, 49)).toMatch(/entre 50 y 2000/);
    expect(validarLargo(riel, 2001)).toMatch(/entre 50 y 2000/);
    expect(validarLargo(riel, 100.5)).toMatch(/entero/);
    expect(validarLargo(riel, Number.NaN)).toMatch(/entero/);
    expect(validarLargo(comp('automatico_1p'), 100)).not.toBeNull();
  });
});
