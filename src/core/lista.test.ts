import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularAvisos } from './avisos';
import { agregarElemento, resolverColocacion } from './colocacion';
import type { Contexto } from './colocacion';
import { armarEjemplo, cargarBiblioteca, crearContextoDe, RAIZ_BIBLIOTECA } from './ejemplo.testutil';
import { formatearMetros, generarLista, listaACsv, listaATexto } from './lista';
import { nuevoUid, valoresPorDefecto } from './modelo';
import type { CajaProyecto, Elemento } from './modelo';
import { extensionDelDibujo, sugerirCaja, trasladar } from './sugerencia';

const bib = cargarBiblioteca();
const ctxDe = (caja: CajaProyecto = { id: 'caja_metalica_400x500x200' }): Contexto => crearContextoDe(bib, caja);

/** Agrega en (x, y); con `largo` (lineales), fija ese largo desde el principio en vez del por defecto. */
const poner = (els: Elemento[], ctx: Contexto, id: string, x: number, y: number, largo?: number): Elemento[] => {
  const comp = ctx.comps.get(id);
  if (!comp) throw new Error(`falta ${id}`);
  if (largo !== undefined) {
    const r = resolverColocacion(els, ctx, { comp, punto: { x, y }, largo_mm: largo, sinSnap: true });
    if (!r.ok) throw new Error(r.motivo);
    return [...els, { uid: nuevoUid(), componenteId: id, x_mm: r.x_mm, y_mm: r.y_mm, largo_mm: r.largo_mm, valores: valoresPorDefecto(comp) }];
  }
  const r = agregarElemento(els, ctx, id, { x, y }, valoresPorDefecto(comp));
  if (!r.ok) throw new Error(r.motivo);
  return r.elementos;
};

const normalizar = (s: string): string[] => s.replace(/\r\n/g, '\n').trim().split('\n');

describe('lista de materiales: referencia ejemplo_lista_materiales.csv', () => {
  const ctx = ctxDe();
  const lista = generarLista(armarEjemplo(ctx), ctx);
  const esperado = normalizar(readFileSync(join(RAIZ_BIBLIOTECA, 'ejemplo_lista_materiales.csv'), 'utf8'));

  it('coincide línea por línea, con las mismas cantidades', () => {
    expect(normalizar(listaACsv(lista, { conTotales: false }))).toEqual(esperado);
  });

  it('tiene tantas líneas como el CSV de referencia', () => {
    expect(lista.lineas).toHaveLength(esperado.length - 1);
  });

  it('agrupa líneas iguales (dos automáticos 1P C10 A, tres canaletas, cuatro topes)', () => {
    const c = (d: string) => lista.lineas.find((l) => l.descripcion === d)?.cantidad;
    expect(c('Interruptor automatico 1P C10 A')).toBe(2);
    expect(c('Canaleta ranurada 25 x 25 mm, corte de 396 mm')).toBe(3);
    expect(c('Tope de riel DIN')).toBe(4);
  });

  it('agrega los metros totales de riel y canaleta', () => {
    expect(lista.metrosRiel).toBeCloseTo(0.792);
    expect(lista.metrosCanaleta).toBeCloseTo(1.188);
    const csv = normalizar(listaACsv(lista));
    expect(csv.slice(-2)).toEqual(['Total riel DIN,0.792,m', 'Total canaleta,1.188,m']);
    expect(listaATexto(lista)).toContain('Total riel DIN: 0,792 m');
    expect(listaATexto(lista)).toContain('2 x Riel DIN 35 mm, corte de 396 mm');
  });
});

describe('lista de materiales: un corte por pieza, con su largo real', () => {
  it('dos rieles de largo distinto salen como dos líneas separadas, cada una con su largo', () => {
    const ctx = ctxDe();
    let els = poner([], ctx, 'riel_din', 250, 100.5, 200);
    els = poner(els, ctx, 'riel_din', 250, 250.5, 300);
    const l = generarLista(els, ctx);
    const corte200 = l.lineas.find((x) => x.descripcion.includes('200 mm'));
    const corte300 = l.lineas.find((x) => x.descripcion.includes('300 mm'));
    expect(corte200).toMatchObject({ descripcion: 'Riel DIN 35 mm, corte de 200 mm', cantidad: 1 });
    expect(corte300).toMatchObject({ descripcion: 'Riel DIN 35 mm, corte de 300 mm', cantidad: 1 });
    expect(l.metrosRiel).toBeCloseTo(0.5);
  });

  it('dos cortes del mismo largo sí se agrupan en una sola línea', () => {
    const ctx = ctxDe();
    let els = poner([], ctx, 'riel_din', 250, 100.5, 200);
    els = poner(els, ctx, 'riel_din', 250, 250.5, 200);
    const l = generarLista(els, ctx);
    expect(l.lineas.filter((x) => x.descripcion.includes('corte de 200 mm'))).toHaveLength(1);
    expect(l.lineas.find((x) => x.descripcion.includes('corte de 200 mm'))?.cantidad).toBe(2);
  });
});

describe('lista de materiales: otros casos', () => {
  it('sin elementos solo lista la caja', () => {
    const l = generarLista([], ctxDe());
    expect(l.lineas).toEqual([
      { descripcion: 'Caja metalica sobrepuesta 400 x 500 x 200 (placa 450 x 350 mm)', cantidad: 1, unidad: 'un' },
    ]);
  });

  it('caja plástica: el riel incluido no aparece en la lista', () => {
    const ctx = ctxDe({ id: 'caja_plastica_sobrepuesta_1f' });
    const els = poner([], ctx, 'automatico_1p', 60, 92);
    const l = generarLista(els, ctx);
    expect(l.lineas.some((x) => /riel din 35/i.test(x.descripcion))).toBe(false);
    expect(l.metrosRiel).toBe(0);
    expect(l.lineas.map((x) => x.descripcion)).toContain('Tope de riel DIN');
    expect(l.lineas.find((x) => /^Caja/.test(x.descripcion))?.descripcion).not.toMatch(/placa/);
  });

  it('un elemento con campos faltantes usa los defectos de la ficha', () => {
    const ctx = ctxDe();
    let els = poner([], ctx, 'riel_din', 250, 100.5);
    els = poner(els, ctx, 'automatico_1p', 100, 100).map((e) => (e.componenteId === 'automatico_1p' ? { ...e, valores: {} } : e));
    expect(generarLista(els, ctx).lineas.map((l) => l.descripcion)).toContain('Interruptor automatico 1P C16 A');
  });

  it('escapa comas y comillas en el CSV', () => {
    const lista = { lineas: [{ descripcion: 'a, "b"', cantidad: 1, unidad: 'un' }], metrosRiel: 0, metrosCanaleta: 0 };
    expect(listaACsv(lista, { conTotales: false })).toContain('"a, ""b""",1,un');
  });

  it('formatea metros con coma decimal', () => {
    expect(formatearMetros(1.188)).toBe('1,188');
    expect(formatearMetros(0)).toBe('0');
  });
});

describe('sugerir caja', () => {
  it('elige la placa más chica del mismo tipo que contiene el dibujo', () => {
    const ctx = ctxDe({ id: 'caja_metalica_600x600x250' });
    const els = armarEjemplo(ctxDe());
    const ext = extensionDelDibujo(els, ctx);
    if (!ext) throw new Error('sin dibujo');
    const s = sugerirCaja(els, ctx, bib.gabinetes);
    expect(s?.caja.tipo).toBe('metalica');
    const placa = s?.caja.placa;
    expect(placa && placa.ancho >= ext.w && placa.alto >= ext.h).toBe(true);
    // Ninguna otra caja metálica con placa menor también contiene el dibujo.
    const area = (placa?.ancho ?? 0) * (placa?.alto ?? 0);
    for (const c of bib.gabinetes.cajas.filter((x) => x.tipo === 'metalica' && x.placa)) {
      const p = c.placa;
      if (p && p.ancho * p.alto < area) expect(p.ancho >= ext.w && p.alto >= ext.h).toBe(false);
    }
  });

  it('respeta el tipo: una caja inox solo sugiere inox', () => {
    const ctx = ctxDe({ id: 'caja_inox_400x500x200' });
    const els = armarEjemplo(ctxDe());
    expect(sugerirCaja(els, ctx, bib.gabinetes)?.caja.tipo).toBe('inox');
  });

  it('al aplicar la sugerencia todo el dibujo cabe en la placa', () => {
    const ctx = ctxDe();
    const els = armarEjemplo(ctx);
    const s = sugerirCaja(els, ctx, bib.gabinetes);
    if (!s) throw new Error('debía sugerir');
    const nuevoCtx = ctxDe({ id: s.caja.id });
    expect(calcularAvisos(trasladar(els, s.dx, s.dy), nuevoCtx, null).some((a) => a.id === 'fuera')).toBe(false);
  });

  it('sin dibujo, o con caja plástica, no sugiere', () => {
    expect(sugerirCaja([], ctxDe(), bib.gabinetes)).toBeNull();
    const plastica = ctxDe({ id: 'caja_plastica_sobrepuesta_1f' });
    expect(sugerirCaja(poner([], plastica, 'automatico_1p', 60, 92), plastica, bib.gabinetes)).toBeNull();
  });

  it('si el dibujo no cabe en ninguna caja, no sugiere', () => {
    const ctx = ctxDe({ libre: { ancho_mm: 2000, alto_mm: 2000, tipo: 'metalica' } });
    const els = poner([], ctx, 'riel_din', 1000, 500, 1900);
    expect(sugerirCaja(els, ctx, bib.gabinetes)).toBeNull();
  });

  it('medida libre inox sugiere una caja inox', () => {
    const ctx = ctxDe({ libre: { ancho_mm: 900, alto_mm: 700, tipo: 'inox' } });
    const els = poner([], ctx, 'riel_din', 450, 100.5, 300);
    expect(sugerirCaja(els, ctx, bib.gabinetes)?.caja.tipo).toBe('inox');
  });
});

describe('avisos', () => {
  it('el ejemplo en una caja con capacidad de sobra no genera avisos', () => {
    // caja_metalica_400x500x200 es una medida referencial y, con el margen de borde de la Fase 5,
    // su fila más cargada (21 módulos) ya no entra en ningún modo (20 en compacto, 16 con canaleta):
    // se usa una caja real (Lerkenbox DM) con capacidad de sobra para probar el caso "todo bien".
    const ctx = ctxDe({ id: 'caja_metalica_dm_600x600x210' });
    const els = armarEjemplo(ctx);
    expect(calcularAvisos(els, ctx, sugerirCaja(els, ctx, bib.gabinetes))).toEqual([]);
  });

  it('con el margen por defecto, la caja referencial 400x500x200 sí avisa (fila muy justa)', () => {
    const ctx = ctxDe();
    const els = armarEjemplo(ctx);
    const avisos = calcularAvisos(els, ctx, null);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.texto).toMatch(/La fila 2 ocupa 21 módulos/);
  });

  it('avisa de elementos fuera de la caja', () => {
    const els = armarEjemplo(ctxDe());
    const chica = ctxDe({ id: 'caja_metalica_200x300x150' });
    expect(calcularAvisos(els, chica, null).find((a) => a.id === 'fuera')?.texto).toMatch(/quedan fuera/);
  });

  it('avisa cuando una fila excede los módulos de la caja', () => {
    const ctx = ctxDe({ id: 'caja_plastica_sobrepuesta_1f' }); // 12 módulos por fila
    const cuatroP = ctx.comps.get('automatico_4p');
    if (!cuatroP) throw new Error('falta automatico_4p');
    let els: Elemento[] = [];
    for (const x of [40, 94, 148, 202]) els = poner(els, ctx, 'automatico_3p', x, 92); // 4 x 3 módulos = 12: cabe
    expect(calcularAvisos(els, ctx, null).some((a) => a.id.startsWith('fila'))).toBe(false);
    // Un 4P en lugar del primero: 13 módulos.
    els = els.map((e, i) => (i === 0 ? { ...e, componenteId: 'automatico_4p', valores: valoresPorDefecto(cuatroP) } : e));
    expect(calcularAvisos(els, ctx, null).some((a) => a.id.startsWith('fila'))).toBe(true);
  });

  it('avisa si la caja es mucho más grande de lo necesario', () => {
    const ctx = ctxDe({ id: 'caja_metalica_800x800x300' });
    let els = poner([], ctx, 'riel_din', 400, 100.5, 200);
    els = poner(els, ctx, 'automatico_1p', 300, 100);
    const s = sugerirCaja(els, ctx, bib.gabinetes);
    expect(calcularAvisos(els, ctx, s).some((a) => a.id === 'grande')).toBe(true);
    expect(calcularAvisos(els, ctx, null).some((a) => a.id === 'grande')).toBe(false);
  });

  it('avisa si un extremo del riel no deja espacio para el tope', () => {
    const ctx = ctxDe();
    let els = poner([], ctx, 'riel_din', 250, 100.5, 400); // riel de 400 mm: x 50..450
    els = poner(els, ctx, 'automatico_1p', 60, 100); // pegado al inicio del riel: el tope queda fuera
    expect(calcularAvisos(els, ctx, null).some((a) => a.id === 'topes')).toBe(true);
  });
});
