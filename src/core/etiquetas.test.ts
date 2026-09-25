import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsearCatalogo } from './biblioteca';
import { validarLargo } from './colocacion';
import { descripcionElemento, expandirPlantilla, interpretarValor, lineasEtiqueta, tamanoAjustado, valoresEfectivos } from './etiquetas';
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
  it('automático 1P: número, y curva con amperaje en una línea', () => {
    expect(lineasEtiqueta(comp('automatico_1p'), elemento('automatico_1p'))).toEqual(['Q1', 'C16']);
  });

  it('cambiar amperaje o curva actualiza la etiqueta', () => {
    const c = comp('automatico_2p');
    expect(lineasEtiqueta(c, elemento('automatico_2p', { amperaje: 40 }))).toEqual(['2P Q1', 'C40']);
    expect(lineasEtiqueta(c, elemento('automatico_2p', { curva: 'D', amperaje: 25 }))).toEqual(['2P Q1', 'D25']);
  });

  it('diferencial: amperaje y sensibilidad', () => {
    const c = comp('diferencial_2p');
    const sens = c.campos.find((f) => f.id === 'sensibilidad');
    expect(sens?.tipo).toBe('select');
    if (sens?.tipo !== 'select') return;
    const otra = sens.opciones.find((o) => o !== sens.defecto) ?? sens.defecto;
    expect(lineasEtiqueta(c, elemento('diferencial_2p', { amperaje: 63, sensibilidad: otra }))).toEqual(['QD1 63A', String(otra)]);
  });

  it('un campo faltante en el elemento usa el defecto de la ficha', () => {
    expect(lineasEtiqueta(comp('automatico_1p'), { valores: {} })).toEqual(['Q1', 'C16']);
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

describe('numeración de automáticos y diferenciales', () => {
  it('cada automático y diferencial tiene el campo "N° de ..." (entero, por defecto 1), como el contactor', () => {
    for (const id of ['automatico_1p', 'automatico_2p', 'automatico_3p', 'automatico_4p']) {
      expect(comp(id).campos[0], id).toMatchObject({ id: 'indice', rotulo: 'N° de automático', tipo: 'entero', defecto: 1 });
    }
    for (const id of ['diferencial_2p', 'diferencial_4p']) {
      expect(comp(id).campos[0], id).toMatchObject({ id: 'indice', rotulo: 'N° de diferencial', tipo: 'entero', defecto: 1 });
    }
    expect(comp('contactor_3p').campos[0]).toMatchObject({ id: 'indice', rotulo: 'N° de contactor' });
  });

  it('el número entra en el rótulo dibujado sobre el componente', () => {
    const rotulo = (id: string, valores: Record<string, string | number>) => {
      const c = comp(id);
      return lineasEtiqueta(c, { valores });
    };
    expect(rotulo('automatico_1p', { indice: 3, curva: 'C', amperaje: 16 })).toEqual(['Q3', 'C16']);
    expect(rotulo('automatico_2p', { indice: 12 })).toEqual(['2P Q12', 'C40']);
    expect(rotulo('diferencial_2p', { indice: 2 })).toEqual(['QD2 40A', '30 mA']);
    expect(rotulo('contactor_3p', { indice: 4 })[0]).toBe('K4');
  });

  it('dos automáticos iguales se distinguen por su número en el selector "Alimentado por"', () => {
    const c = comp('automatico_1p');
    expect(descripcionElemento(c, { valores: { indice: 3, curva: 'C', amperaje: 16 } })).toBe('Interruptor automatico 1P N°3 (C16)');
    expect(descripcionElemento(c, { valores: { indice: 4, curva: 'C', amperaje: 16 } })).toBe('Interruptor automatico 1P N°4 (C16)');
    expect(descripcionElemento(comp('automatico_2p'), { valores: { indice: 1 } })).toBe('Interruptor automatico 2P N°1 (C40)');
    expect(descripcionElemento(comp('diferencial_2p'), { valores: { indice: 2, amperaje: 25 } })).toBe('Interruptor diferencial 2P N°2 (25A, 30 mA)');
    expect(descripcionElemento(comp('contactor_3p'), { valores: { indice: 1 } })).toBe('Contactor 3P (industrial) N°1 (25A)');
  });

  it('una pieza sin numeración conserva su nombre y su rótulo', () => {
    expect(descripcionElemento(comp('reloj_control'), { valores: {} })).toBe('Reloj control horario (RC1)');
    expect(descripcionElemento(comp('fotocelda'), { valores: {} })).toBe('Fotocelda (sensor exterior)');
  });

  it('los datos guardados antes de este cambio (sin indice) se ven con el valor por defecto', () => {
    expect(lineasEtiqueta(comp('automatico_1p'), { valores: { curva: 'B', amperaje: 10 } })).toEqual(['Q1', 'B10']);
  });
});
