import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularAvisos } from './avisos';
import { agregarElemento, resolverColocacion } from './colocacion';
import type { Contexto } from './colocacion';
import { armarEjemplo, cargarBiblioteca, crearContextoDe, RAIZ_BIBLIOTECA } from './ejemplo.testutil';
import { conexionesConIdentificador, formatearMetros, generarConexiones, generarLista, generarListaPorCircuito, listaACsv, listaATexto, NOTA_IDENTIFICADOR } from './lista';
import { agregarCircuito, asignarCircuito, descripcionesDistinguidas, fijarAccionadoPor, fijarAlimentadoPor, identificadorDePieza } from './conexion';
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
    expect(c('Interruptor automatico 1P C10 A, 6kA')).toBe(2);
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

  it('una canaleta agregada en una caja plástica sí suma al total de canaleta (no se confunde con el riel incluido)', () => {
    const ctx = ctxDe({ id: 'caja_plastica_embutida_2f' });
    const els = poner([], ctx, 'canaleta_25', 145, 290, 120);
    const l = generarLista(els, ctx);
    expect(l.metrosRiel).toBe(0); // el riel incluido de la caja no se lista ni se suma
    expect(l.metrosCanaleta).toBeCloseTo(0.12);
    expect(l.lineas).toContainEqual({ descripcion: 'Canaleta ranurada 25 x 25 mm, corte de 120 mm', cantidad: 1, unidad: 'un' });
  });

  it('el total de metros nunca queda por debajo de lo que muestra la línea de la lista (dato sin largo_mm)', () => {
    // Simula un elemento guardado antes de que se fijara siempre el largo (dato viejo/dañado):
    // la línea de la lista usa el mismo largo por defecto de la ficha, así que el total debe coincidir.
    const ctx = ctxDe();
    const sinLargo = { uid: 'x', componenteId: 'canaleta_25', x_mm: 100, y_mm: 50, valores: {} };
    const l = generarLista([sinLargo], ctx);
    const linea = l.lineas.find((x) => x.descripcion.startsWith('Canaleta ranurada 25'));
    const largoEnDescripcion = Number(linea?.descripcion.match(/corte de (\d+) mm/)?.[1]);
    expect(largoEnDescripcion).toBeGreaterThan(0);
    expect(l.metrosCanaleta).toBeCloseTo(largoEnDescripcion / 1000);
  });
});

describe('lista de materiales: agrupar por circuito', () => {
  it('la caja va en "Sin circuito"; cada aparato va al circuito que tiene asignado', () => {
    const ctx = ctxDe();
    const circuitos = agregarCircuito([], 'C1', 'Iluminación');
    const c1 = circuitos[0]!.id;
    let els = poner([], ctx, 'riel_din', 250, 100.5, 400);
    els = poner(els, ctx, 'automatico_1p', 60, 100);
    els = asignarCircuito(els, els[1]!.uid, c1);

    const grupos = generarListaPorCircuito(els, ctx, circuitos);
    const sinCircuito = grupos.find((g) => g.circuito === null);
    const grupoC1 = grupos.find((g) => g.circuito?.id === c1);

    expect(sinCircuito?.lineas.map((l) => l.descripcion)).toContain('Caja metalica sobrepuesta 400 x 500 x 200 (placa 450 x 350 mm)');
    expect(sinCircuito?.lineas.some((l) => l.descripcion.startsWith('Riel DIN'))).toBe(true);
    expect(grupoC1?.lineas).toEqual([{ descripcion: 'Interruptor automatico 1P C16 A, 6kA', cantidad: 1, unidad: 'un' }]);
  });

  it('los topes van al circuito del riel al que pertenecen', () => {
    const ctx = ctxDe();
    const circuitos = agregarCircuito([], 'C1', 'Iluminación');
    const c1 = circuitos[0]!.id;
    let els = poner([], ctx, 'riel_din', 250, 100.5, 400);
    const riel = els[0]!;
    els = poner(els, ctx, 'automatico_1p', 60, 100);
    els = asignarCircuito(els, riel.uid, c1); // el riel (no el aparato) queda en C1

    const grupos = generarListaPorCircuito(els, ctx, circuitos);
    const grupoC1 = grupos.find((g) => g.circuito?.id === c1);
    const sinCircuito = grupos.find((g) => g.circuito === null);
    expect(grupoC1?.lineas.filter((l) => l.descripcion === 'Tope de riel DIN')[0]?.cantidad).toBe(2);
    expect(sinCircuito?.lineas.some((l) => l.descripcion === 'Tope de riel DIN')).toBe(false);
  });

  it('dos aparatos iguales en circuitos distintos no se agrupan entre sí', () => {
    const ctx = ctxDe();
    let circuitos = agregarCircuito([], 'C1', 'Iluminación');
    circuitos = agregarCircuito(circuitos, 'C2', 'Enchufes');
    const c1 = circuitos[0]!.id;
    const c2 = circuitos[1]!.id;
    let els = poner([], ctx, 'riel_din', 250, 100.5, 400);
    els = poner(els, ctx, 'automatico_1p', 60, 100);
    els = poner(els, ctx, 'automatico_1p', 100, 100);
    els = asignarCircuito(els, els[1]!.uid, c1);
    els = asignarCircuito(els, els[2]!.uid, c2);

    const grupos = generarListaPorCircuito(els, ctx, circuitos);
    expect(grupos.find((g) => g.circuito?.id === c1)?.lineas).toEqual([
      { descripcion: 'Interruptor automatico 1P C16 A, 6kA', cantidad: 1, unidad: 'un' },
    ]);
    expect(grupos.find((g) => g.circuito?.id === c2)?.lineas).toEqual([
      { descripcion: 'Interruptor automatico 1P C16 A, 6kA', cantidad: 1, unidad: 'un' },
    ]);
    // La suma de la lista sin agrupar sí los junta en una línea con cantidad 2.
    const sinAgrupar = generarLista(els, ctx);
    expect(sinAgrupar.lineas.find((l) => l.descripcion === 'Interruptor automatico 1P C16 A, 6kA')?.cantidad).toBe(2);
  });

  it('un circuito sin ningún elemento no aparece en los grupos', () => {
    const ctx = ctxDe();
    const circuitos = agregarCircuito([], 'C9', 'Vacío');
    const grupos = generarListaPorCircuito([], ctx, circuitos);
    expect(grupos.some((g) => g.circuito?.numero === 'C9')).toBe(false);
    expect(grupos).toHaveLength(1); // solo "Sin circuito", por la caja
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
    expect(generarLista(els, ctx).lineas.map((l) => l.descripcion)).toContain('Interruptor automatico 1P C16 A, 6kA');
  });

  it('escapa comas y comillas en el CSV', () => {
    const lista = { lineas: [{ descripcion: 'a, "b"', cantidad: 1, unidad: 'un' }], metrosRiel: 0, metrosCanaleta: 0, conTotales: true, conexiones: [] };
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

  it('la caja referencial 400x500x200 avisa cuando una fila supera su capacidad (modo con canaleta: 16 módulos por fila)', () => {
    // El ejemplo de la biblioteca deja la fila 2 justo bajo el límite del modo compacto (20): en con canaleta la pasa.
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' }, { modo: 'con_canaleta' });
    const avisos = calcularAvisos(armarEjemplo(ctx), ctx, null);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.texto).toMatch(/La fila 2 ocupa 19 módulos; con el margen y el modo actuales entran 16 por fila/);
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

describe('tabla de conexiones (Accionado por / Alimentado por)', () => {
  const ctx = ctxDe();
  const porId = (els: Elemento[], id: string): Elemento => {
    const el = els.find((e) => e.componenteId === id);
    if (!el) throw new Error(`no hay ${id}`);
    return el;
  };
  const conectar = (els: Elemento[], hijo: string, padre: string, rel: 'alimentado' | 'accionado'): Elemento[] => {
    const r = (rel === 'alimentado' ? fijarAlimentadoPor : fijarAccionadoPor)(els, ctx, hijo, padre);
    if (!r.ok) throw new Error(r.motivo);
    return r.elementos;
  };

  it('el ejemplo sin relaciones no tiene filas (las piezas con las dos en "sin definir" no salen)', () => {
    expect(generarConexiones(armarEjemplo(ctx), ctx)).toEqual([]);
    expect(generarLista(armarEjemplo(ctx), ctx).conexiones).toEqual([]);
  });

  it('solo salen las piezas con al menos una relación, con la descripción del selector de Propiedades', () => {
    let els = armarEjemplo(ctx);
    const contactor = porId(els, 'contactor_3p');
    const reloj = porId(els, 'reloj_control');
    const diferencial = porId(els, 'diferencial_4p');
    els = conectar(els, contactor.uid, reloj.uid, 'accionado');
    els = conectar(els, contactor.uid, diferencial.uid, 'alimentado');
    const sola = porId(els, 'rele_crepuscular');
    els = conectar(els, sola.uid, reloj.uid, 'accionado');
    const filas = generarConexiones(els, ctx);
    expect(filas).toHaveLength(2);
    const fila = filas.find((f) => f.pieza.startsWith('Contactor'));
    expect(fila?.accionadoPor).toMatch(/^Reloj/);
    expect(fila?.alimentadoPor).toMatch(/^Interruptor diferencial/);
    // Solo una de las dos relaciones: la otra queda null (se muestra como "—").
    const soloMando = filas.find((f) => f.pieza.startsWith('Rel'));
    expect(soloMando).toMatchObject({ alimentadoPor: null });
    expect(soloMando?.accionadoPor).toMatch(/^Reloj/);
  });

  it('una referencia a una pieza que ya no existe cuenta como sin definir', () => {
    const els = armarEjemplo(ctx);
    const a = porId(els, 'automatico_3p');
    const huerfano = els.map((e) => (e.uid === a.uid ? { ...e, alimentadoPor: 'borrado', accionadoPor: 'borrado' } : e));
    expect(generarConexiones(huerfano, ctx)).toEqual([]);
  });

  it('las piezas de montaje no salen y un medidor no tiene tabla', () => {
    const els = armarEjemplo(ctx);
    const riel = porId(els, 'riel_din');
    const forzado = els.map((e) => (e.uid === riel.uid ? { ...e, alimentadoPor: porId(els, 'contactor_3p').uid } : e));
    expect(generarConexiones(forzado, ctx)).toEqual([]);
    expect(generarConexiones(forzado, { ...ctx, tipo: 'medidor' })).toEqual([]);
  });

  it('va al final del texto y del CSV, y sin filas ni el texto ni el CSV cambian', () => {
    const base = generarLista(armarEjemplo(ctx), ctx);
    expect(listaATexto(base)).not.toContain('Conexiones');
    expect(listaACsv(base)).not.toContain('accionado_por');
    let els = armarEjemplo(ctx);
    els = conectar(els, porId(els, 'contactor_3p').uid, porId(els, 'reloj_control').uid, 'accionado');
    const lista = generarLista(els, ctx);
    const texto = listaATexto(lista);
    expect(texto).toMatch(/\nConexiones:\nContactor .* \| Accionado por: Reloj .* \| Alimentado por: —$/);
    expect(texto.indexOf('Total canaleta')).toBeLessThan(texto.indexOf('Conexiones:'));
    const csv = listaACsv(lista);
    expect(csv).toMatch(/\r\n\r\npieza,accionado_por,alimentado_por\r\n/);
    expect(csv.split('\r\n').at(-2)).toMatch(/^"?Contactor .*,"?Reloj .*,$/);
  });
});

describe('piezas con la misma descripción en la tabla de conexiones', () => {
  const ctx = ctxDe();
  const dosContactores = (): { els: Elemento[]; a: Elemento; b: Elemento; reloj: Elemento } => {
    let els = armarEjemplo(ctx);
    els = poner(els, ctx, 'contactor_3p', 363, 111 + 16);
    const contactores = els.filter((e) => e.componenteId === 'contactor_3p');
    const [a, b] = contactores;
    const reloj = els.find((e) => e.componenteId === 'reloj_control');
    if (!a || !b || !reloj) throw new Error('faltan piezas');
    return { els, a, b, reloj };
  };

  it('solo las piezas que chocan llevan identificador (el ejemplo repite dos automáticos 1P C10 y dos C16; el resto queda limpio)', () => {
    const els = armarEjemplo(ctx);
    const nombres = descripcionesDistinguidas(els, ctx);
    const conId = [...nombres.values()].filter((n) => n.includes('#'));
    expect(conId).toHaveLength(4);
    expect(conId.every((n) => n.startsWith('Interruptor automatico 1P'))).toBe(true);
    const reloj = els.find((e) => e.componenteId === 'reloj_control')!;
    expect(nombres.get(reloj.uid)).not.toContain('#');
    expect(identificadorDePieza(els, ctx, reloj.uid)).toBeNull();
  });

  it('dos contactores iguales (mismo N° por defecto) se distinguen con #1 y #2, en el orden de colocación', () => {
    const { els, a, b } = dosContactores();
    expect(a.valores.indice).toBe(b.valores.indice);
    const nombres = descripcionesDistinguidas(els, ctx);
    expect(nombres.get(a.uid)).toMatch(/ · #1$/);
    expect(nombres.get(b.uid)).toMatch(/ · #2$/);
    expect(identificadorDePieza(els, ctx, b.uid)).toEqual({ n: 2, de: 2 });
  });

  it('la tabla los separa y el padre que choca también lleva su identificador; las demás piezas no', () => {
    const { els, a, b, reloj } = dosContactores();
    const r1 = fijarAccionadoPor(els, ctx, a.uid, reloj.uid);
    if (!r1.ok) throw new Error(r1.motivo);
    const r2 = fijarAccionadoPor(r1.elementos, ctx, b.uid, reloj.uid);
    if (!r2.ok) throw new Error(r2.motivo);
    const r3 = fijarAlimentadoPor(r2.elementos, ctx, reloj.uid, b.uid);
    if (!r3.ok) throw new Error(r3.motivo);
    const filas = generarConexiones(r3.elementos, ctx);
    const contactores = filas.filter((f) => f.pieza.startsWith('Contactor'));
    expect(contactores.map((f) => f.pieza.split(' · ').at(-1))).toEqual(['#1', '#2']);
    expect(new Set(filas.map((f) => f.pieza)).size).toBe(filas.length);
    const delReloj = filas.find((f) => f.pieza.startsWith('Reloj'));
    expect(delReloj?.pieza).not.toContain('#');
    expect(delReloj?.alimentadoPor).toMatch(/ · #2$/);
  });

  it('numerar una de las dos quita el choque y el identificador desaparece', () => {
    const { els, a, b } = dosContactores();
    const numerado = els.map((e) => (e.uid === b.uid ? { ...e, valores: { ...e.valores, indice: 2 } } : e));
    const nombres = descripcionesDistinguidas(numerado, ctx);
    expect(nombres.get(a.uid)).not.toContain('#');
    expect(nombres.get(b.uid)).not.toContain('#');
    expect(identificadorDePieza(numerado, ctx, a.uid)).toBeNull();
  });
});

describe('advertencia sobre los identificadores #n', () => {
  const fila = (pieza: string, a: string | null = null, b: string | null = null) => ({ pieza, accionadoPor: a, alimentadoPor: b });

  it('solo se muestra si alguna fila lleva un #n (en la pieza o en un padre)', () => {
    expect(conexionesConIdentificador([fila('Contactor 3P N°1 (25A)', 'Reloj control horario (RC1)')])).toBe(false);
    expect(conexionesConIdentificador([fila('Contactor 3P N°1 (25A) · #2', 'Reloj control horario (RC1)')])).toBe(true);
    expect(conexionesConIdentificador([fila('Reloj control horario (RC1)', null, 'Contactor 3P N°1 (25A) · #1')])).toBe(true);
    expect(conexionesConIdentificador([])).toBe(false);
  });

  it('una descripción que solo menciona "#" en el medio no cuenta, y el texto copiable la lleva solo cuando corresponde', () => {
    expect(conexionesConIdentificador([fila('Pieza #3 especial')])).toBe(false);
    const ctx = ctxDe();
    let els = armarEjemplo(ctx);
    const reloj = els.find((e) => e.componenteId === 'reloj_control')!;
    const cont = els.find((e) => e.componenteId === 'contactor_3p')!;
    const r = fijarAccionadoPor(els, ctx, cont.uid, reloj.uid);
    if (!r.ok) throw new Error(r.motivo);
    els = r.elementos;
    expect(listaATexto(generarLista(els, ctx))).not.toContain(NOTA_IDENTIFICADOR);
    els = poner(els, ctx, 'contactor_3p', 363, 111 + 16);
    const doble = els.filter((e) => e.componenteId === 'contactor_3p')[1]!;
    const r2 = fijarAccionadoPor(els, ctx, doble.uid, reloj.uid);
    if (!r2.ok) throw new Error(r2.motivo);
    expect(listaATexto(generarLista(r2.elementos, ctx))).toContain(NOTA_IDENTIFICADOR);
  });
});

describe('regletas de conexión (montaje en riel, de pie sobre un tramo corto)', () => {
  const ctx = ctxDe();
  const ids = ['regleta_conexion_4v', 'regleta_conexion_6v', 'regleta_conexion_8v', 'regleta_conexion_10v', 'regleta_conexion_12v'];

  it('son piezas de riel como las demás: 10,5 mm de ancho, alto de modular o menos y centro en la mitad del alto', () => {
    for (const id of ids) {
      const comp = ctx.comps.get(id);
      expect(comp?.montaje, id).toBe('riel');
      if (comp?.montaje !== 'riel') continue;
      expect(comp.ancho_mm, id).toBe(10.5);
      expect(comp.alto_mm, id).toBeLessThanOrEqual(90);
      expect(comp.riel_y_mm, id).toBe(comp.alto_mm / 2);
    }
  });

  it('necesitan un riel y se colocan sobre él, sin pisar a un aparato', () => {
    const base = armarEjemplo(ctx);
    expect(() => poner([], ctx, 'regleta_conexion_12v', 200, 250)).toThrow(/riel/i);
    // Fila 1: riel centrado en y = 111, con espacio libre al final.
    const con = poner(base, ctx, 'regleta_conexion_12v', 400, 111);
    const regleta = con.find((e) => e.componenteId === 'regleta_conexion_12v')!;
    expect(regleta.y_mm + (ctx.comps.get('regleta_conexion_12v') as { riel_y_mm: number }).riel_y_mm).toBeCloseTo(111, 1);
    expect(() => poner(con, ctx, 'automatico_1p', 400, 111)).toThrow(/superpone/i);
  });

  it('como cualquier aparato de riel, cuentan en la capacidad de la fila (10,5 mm de riel cada una)', () => {
    const ctxCanaleta = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' }, { modo: 'con_canaleta' });
    const base = armarEjemplo(ctxCanaleta);
    const antes = calcularAvisos(base, ctxCanaleta, null)[0]?.texto ?? '';
    // Fila 2: hueco de 33 mm entre las borneras y la barra.
    const con = poner(base, ctxCanaleta, 'regleta_conexion_12v', 343, 242);
    const despues = calcularAvisos(con, ctxCanaleta, null)[0]?.texto ?? '';
    expect(antes).toMatch(/La fila 2 ocupa 19 módulos/);
    expect(despues).toMatch(/La fila 2 ocupa 20 módulos/);
  });
});
