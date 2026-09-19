import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsearBiblioteca } from './biblioteca';
import { resolverCaja } from './caja';
import {
  agregarElemento,
  ajustarEnRiel,
  borrarElemento,
  calcularTopes,
  cambiarLargo,
  crearContexto,
  duplicarElemento,
  elementosFuera,
  listarPiezas,
  listarRieles,
  moverElemento,
  MOTIVOS,
  resolverColocacion,
  rielMasCercano,
  rotarElemento,
} from './colocacion';
import type { Contexto } from './colocacion';
import { deshacer, historialVacio, LIMITE_HISTORIAL, rehacer, registrar } from './historial';
import { armarEjemplo } from './ejemplo.testutil';
import { valoresPorDefecto } from './modelo';
import type { CajaProyecto, Elemento } from './modelo';

const RAIZ = join(process.cwd(), 'public', 'biblioteca');
const leer = (f: string): unknown => JSON.parse(readFileSync(join(RAIZ, f), 'utf8'));
const { catalogo, gabinetes } = parsearBiblioteca(leer('catalogo.json'), leer('gabinetes.json'));

function contexto(caja: CajaProyecto = { id: 'caja_metalica_400x500x200' }): Contexto {
  const c = resolverCaja(caja, gabinetes);
  if (!c) throw new Error('caja de prueba inexistente');
  return crearContexto(catalogo, c);
}

/** Agrega y falla la prueba si el cambio es rechazado. */
function poner(els: Elemento[], ctx: Contexto, id: string, x: number, y: number): Elemento[] {
  const comp = ctx.comps.get(id);
  if (!comp) throw new Error(`falta ${id}`);
  const r = agregarElemento(els, ctx, id, { x, y }, valoresPorDefecto(comp));
  if (!r.ok) throw new Error(`${id} en (${x},${y}): ${r.motivo}`);
  return r.elementos;
}

const soltar = (els: Elemento[], ctx: Contexto, id: string, x: number, y: number) => {
  const comp = ctx.comps.get(id);
  if (!comp) throw new Error(`falta ${id}`);
  return resolverColocacion(els, ctx, { comp, punto: { x, y } });
};

const uidDe = (els: Elemento[], i: number): string => els[i]?.uid ?? '';

// Caja 400x500: placa x 25..475, y 25..375. Riel de 400 mm centrado en (250; 100,5) -> x 50..450.
const conRiel = (ctx = contexto()) => poner([], ctx, 'riel_din', 250, 100.5);

describe('selección de riel', () => {
  it('sin rieles rechaza el aparato con un aviso', () => {
    const r = soltar([], contexto(), 'automatico_1p', 100, 100);
    expect(r).toEqual({ ok: false, motivo: MOTIVOS.sinRiel });
  });

  it('elige el riel más cercano al punto de soltar', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'riel_din', 250, 250.5);
    const rieles = listarRieles(els, ctx);
    expect(rieles).toHaveLength(2);
    expect(rielMasCercano({ x: 250, y: 90 }, rieles)?.yCentro).toBe(100.5);
    expect(rielMasCercano({ x: 250, y: 200 }, rieles)?.yCentro).toBe(250.5);
    const r = soltar(els, ctx, 'automatico_1p', 250, 200);
    expect(r).toMatchObject({ ok: true, y_mm: 250.5 - 45 });
  });

  it('la línea riel_y_mm del aparato queda sobre el centro del riel', () => {
    const ctx = contexto();
    const r = soltar(conRiel(ctx), ctx, 'contactor_3p', 200, 100);
    const comp = ctx.comps.get('contactor_3p');
    if (!r.ok || comp?.montaje !== 'riel') throw new Error('debía colocarse');
    expect(r.y_mm + comp.riel_y_mm).toBeCloseTo(100.5);
  });
});

describe('snap', () => {
  it('modular: de 18 en 18 mm desde el inicio del riel', () => {
    const ctx = contexto();
    const r = soltar(conRiel(ctx), ctx, 'automatico_1p', 81, 100); // x0 = 72 -> rel 22 -> 1 módulo
    expect(r).toMatchObject({ ok: true, x_mm: 68 });
  });

  it('libre: de 1 en 1 mm', () => {
    const ctx = contexto();
    const r = soltar(conRiel(ctx), ctx, 'tope_riel', 64.4, 100); // x0 = 60,4 -> 60
    expect(r).toMatchObject({ ok: true, x_mm: 60 });
  });

  it('ajustarEnRiel redondea a la rejilla cuando no hay vecinos', () => {
    expect(ajustarEnRiel(23, 18, 0, 18, [])).toBe(18);
    expect(ajustarEnRiel(8, 18, 0, 18, [])).toBe(0);
  });
});

describe('imán a bordes vecinos', () => {
  it('se imanta al borde derecho de un vecino a menos de 3 mm', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'tope_riel', 57, 100); // tope en x 53..61
    const r = soltar(els, ctx, 'automatico_1p', 73, 100); // x0 = 64, rejilla = 68
    expect(r).toMatchObject({ ok: true, x_mm: 61 });
  });

  it('se imanta al borde izquierdo de un vecino', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'tope_riel', 157, 100); // tope en x 153..161
    const r = soltar(els, ctx, 'automatico_1p', 143, 100); // x0 = 134, pegado: 153 - 18 = 135
    expect(r).toMatchObject({ ok: true, x_mm: 135 });
  });

  it('no se imanta si el vecino está a más de 3 mm', () => {
    expect(ajustarEnRiel(68, 18, 50, 18, [{ x: 40, y: 0, w: 14, h: 1 }])).toBe(68);
    expect(ajustarEnRiel(68, 18, 50, 18, [{ x: 100, y: 0, w: 14, h: 1 }])).toBe(68);
  });
});

describe('colisión', () => {
  it('no permite dos aparatos superpuestos en el mismo riel', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'automatico_1p', 60, 100);
    expect(soltar(els, ctx, 'automatico_1p', 60, 100)).toEqual({ ok: false, motivo: MOTIVOS.colision });
  });

  it('un aparato sí puede solaparse con su propio riel', () => {
    const ctx = contexto();
    expect(soltar(conRiel(ctx), ctx, 'automatico_1p', 60, 100).ok).toBe(true);
  });

  it('aparatos contiguos (que solo se tocan) son válidos', () => {
    const ctx = contexto();
    let els = poner(conRiel(ctx), ctx, 'automatico_1p', 60, 100);
    els = poner(els, ctx, 'automatico_1p', 78, 100);
    expect(els.filter((e) => e.componenteId === 'automatico_1p')).toHaveLength(2);
  });

  it('una canaleta no puede solaparse con aparatos, rieles ni otras canaletas', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'automatico_1p', 60, 100); // ocupa y 55,5..145,5
    expect(soltar(els, ctx, 'canaleta_25', 250, 120).ok).toBe(false); // sobre el aparato
    expect(soltar(els, ctx, 'canaleta_25', 250, 100).ok).toBe(false); // sobre el riel
    const con = poner(els, ctx, 'canaleta_25', 250, 200);
    expect(soltar(con, ctx, 'canaleta_25', 250, 210)).toEqual({ ok: false, motivo: MOTIVOS.colision });
  });
});

describe('límites', () => {
  it('rechaza un aparato que sobrepasa el final del riel', () => {
    const ctx = contexto();
    expect(soltar(conRiel(ctx), ctx, 'automatico_1p', 460, 100)).toEqual({ ok: false, motivo: MOTIVOS.fueraRiel });
  });

  it('rechaza lo que queda fuera de la placa', () => {
    const ctx = contexto();
    const els = poner([], ctx, 'riel_din', 250, 60.5); // riel y 43..78, dentro
    // el aparato (90 mm) sube hasta y = 15,5: fuera de la placa (y >= 25)
    expect(soltar(els, ctx, 'automatico_1p', 60, 60)).toEqual({ ok: false, motivo: MOTIVOS.fueraArea });
    expect(soltar([], ctx, 'riel_din', 250, 10).ok).toBe(false);
    expect(soltar([], ctx, 'fotocelda', 5, 5).ok).toBe(false);
  });

  it('el riel por defecto se acorta para caber en la placa', () => {
    const ctx = contexto({ id: 'caja_metalica_200x300x150' }); // placa de 250 mm de ancho
    expect(soltar([], ctx, 'riel_din', 150, 100)).toMatchObject({ ok: true, largo_mm: 250 });
  });

  it('valida el largo entre largo_min_mm y largo_max_mm', () => {
    const ctx = contexto();
    const els = conRiel(ctx);
    const id = uidDe(els, 0);
    expect(cambiarLargo(els, ctx, id, 49).ok).toBe(false);
    expect(cambiarLargo(els, ctx, id, 2001).ok).toBe(false);
    expect(cambiarLargo(els, ctx, id, 300).ok).toBe(true);
  });

  it('acortar o alargar un riel con aparatos montados es válido si siguen dentro', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'automatico_1p', 100, 100);
    const corto = cambiarLargo(els, ctx, uidDe(els, 0), 300);
    expect(corto.ok).toBe(true);
    const largo = cambiarLargo(els, ctx, uidDe(els, 0), 420);
    expect(largo.ok).toBe(true);
  });

  it('no deja acortar un riel dejando aparatos fuera', () => {
    const ctx = contexto();
    let els = conRiel(ctx);
    els = poner(els, ctx, 'automatico_1p', 300, 100);
    expect(cambiarLargo(els, ctx, uidDe(els, 0), 100).ok).toBe(false);
  });
});

describe('canaletas', () => {
  it('se giran 0 y 90 grados y se valida el resultado', () => {
    const ctx = contexto();
    let els = poner([], ctx, 'canaleta_25', 250, 200);
    const uid = uidDe(els, 0);
    const c = cambiarLargo(els, ctx, uid, 200);
    if (!c.ok) throw new Error(c.motivo);
    els = c.elementos;
    const g = rotarElemento(els, ctx, uid);
    if (!g.ok) throw new Error(g.motivo);
    expect(g.elementos[0]?.rotacion).toBe(90);
    expect(listarPiezas(g.elementos, ctx)[0]?.rect).toMatchObject({ w: 25, h: 200 });
    const otra = rotarElemento(g.elementos, ctx, uid);
    expect(otra.ok && otra.elementos[0]?.rotacion).toBe(0);
  });

  it('rechaza girar si no cabe', () => {
    const ctx = contexto();
    const els = poner([], ctx, 'canaleta_25', 250, 200); // 400 mm: girada excede el alto de la placa (350)
    expect(rotarElemento(els, ctx, uidDe(els, 0)).ok).toBe(false);
  });
});

describe('mover, duplicar y borrar', () => {
  it('mover un aparato con rejilla lo deja en un múltiplo de 18 desde el riel', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'automatico_1p', 60, 100);
    const r = moverElemento(els, ctx, uidDe(els, 1), { x: 140, y: 100 });
    if (!r.ok) throw new Error(r.motivo);
    expect(((r.elementos[1]?.x_mm ?? 0) - 50) % 18).toBe(0);
  });

  it('las flechas mueven exactamente 1 mm (sin rejilla)', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'automatico_1p', 60, 100);
    const a = els[1];
    if (!a) throw new Error('falta aparato');
    const r = moverElemento(els, ctx, a.uid, { x: a.x_mm + 9 + 1, y: a.y_mm + 45 }, { sinSnap: true });
    expect(r.ok && r.elementos[1]?.x_mm).toBe(a.x_mm + 1);
  });

  it('mover un riel arrastra a sus aparatos', () => {
    const ctx = contexto();
    let els = conRiel(ctx);
    els = poner(els, ctx, 'automatico_1p', 60, 100);
    const r = moverElemento(els, ctx, uidDe(els, 0), { x: 250, y: 200.5 });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.elementos[0]?.y_mm).toBe(183);
    expect(r.elementos[1]?.y_mm).toBe(200.5 - 45);
    expect(elementosFuera(r.elementos, ctx).size).toBe(0);
  });

  it('mover a un lugar inválido se rechaza', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'automatico_1p', 60, 100);
    expect(moverElemento(els, ctx, uidDe(els, 1), { x: 600, y: 100 }).ok).toBe(false);
  });

  it('borrar un riel borra sus aparatos', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'automatico_1p', 60, 100);
    const r = borrarElemento(els, ctx, uidDe(els, 0));
    expect(r.ok && r.elementos).toHaveLength(0);
  });

  it('duplicar un aparato lo deja pegado a su derecha', () => {
    const ctx = contexto();
    const els = poner(conRiel(ctx), ctx, 'automatico_1p', 60, 100);
    const r = duplicarElemento(els, ctx, uidDe(els, 1));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.elementos).toHaveLength(3);
    expect(r.elementos[2]?.x_mm).toBe((els[1]?.x_mm ?? 0) + 18);
    expect(r.elementos[2]?.uid).not.toBe(els[1]?.uid);
  });
});

describe('cambio de caja', () => {
  it('marca como fuera lo que no cabe, sin borrar nada', () => {
    const grande = contexto();
    let els = poner([], grande, 'riel_din', 250, 300.5);
    els = poner(els, grande, 'automatico_1p', 100, 300);
    const chica = contexto({ id: 'caja_metalica_200x300x150' }); // placa 250 x 150
    expect(els).toHaveLength(2);
    expect(elementosFuera(els, chica).size).toBe(2);
    expect(elementosFuera(els, grande).size).toBe(0);
  });

  it('medida libre: la placa deja 25 mm de margen por lado', () => {
    const ctx = contexto({ libre: { ancho_mm: 600, alto_mm: 500, tipo: 'inox' } });
    expect(ctx.caja.area).toEqual({ x: 25, y: 25, w: 550, h: 450 });
    expect(ctx.caja.permiteRieles).toBe(true);
  });
});

describe('cajas plásticas', () => {
  it('traen rieles incluidos que aceptan aparatos, pero no admiten rieles nuevos', () => {
    const ctx = contexto({ id: 'caja_plastica_sobrepuesta_1f' });
    expect(listarRieles([], ctx)).toMatchObject([{ incluido: true, yCentro: 92.5 }]);
    expect(soltar([], ctx, 'riel_din', 130, 60)).toEqual({ ok: false, motivo: MOTIVOS.cajaConRieles });
    expect(soltar([], ctx, 'automatico_1p', 60, 92)).toMatchObject({ ok: true, y_mm: 47.5 });
  });
});

describe('topes automáticos', () => {
  it('pone 2 por riel con aparatos, a cada extremo del grupo', () => {
    const ctx = contexto();
    let els = conRiel(ctx);
    expect(calcularTopes(els, ctx)).toHaveLength(0);
    els = poner(els, ctx, 'automatico_1p', 100, 100);
    els = poner(els, ctx, 'automatico_2p', 200, 100);
    const topes = calcularTopes(els, ctx);
    expect(topes).toHaveLength(2);
    const rects = listarPiezas(els, ctx)
      .filter((p) => p.clase === 'aparato')
      .map((p) => p.rect);
    expect(topes[0]?.rect.x).toBe(Math.min(...rects.map((r) => r.x)) - 8);
    expect(topes[1]?.rect.x).toBe(Math.max(...rects.map((r) => r.x + r.w)));
    expect(topes[0]?.rect.y).toBeCloseTo(100.5 - 22.5);
  });
});

describe('historial', () => {
  it('deshace y rehace', () => {
    let h = historialVacio<number>();
    h = registrar(h, 1);
    h = registrar(h, 2);
    const d = deshacer(h, 3);
    expect(d?.estado).toBe(2);
    if (!d) throw new Error('sin historial');
    expect(rehacer(d.historial, 2)?.estado).toBe(3);
  });

  it('un cambio nuevo descarta el futuro', () => {
    let h = registrar(historialVacio<number>(), 1);
    const d = deshacer(h, 2);
    h = registrar(d?.historial ?? h, 5);
    expect(h.futuro).toHaveLength(0);
  });

  it('guarda al menos 100 pasos', () => {
    let h = historialVacio<number>();
    for (let i = 0; i < 300; i++) h = registrar(h, i);
    expect(LIMITE_HISTORIAL).toBeGreaterThanOrEqual(100);
    expect(h.pasado).toHaveLength(LIMITE_HISTORIAL);
    expect(h.pasado[h.pasado.length - 1]).toBe(299);
  });

  it('deshacer sin pasado devuelve null', () => {
    expect(deshacer(historialVacio<number>(), 0)).toBeNull();
  });
});

describe('reconstrucción del tablero de ejemplo (caja 400 x 500, dos filas)', () => {
  it('todas las piezas de ejemplo_tablero_armado.svg son válidas con estas reglas', () => {
    const ctx = contexto();
    const els = armarEjemplo(ctx);
    expect(elementosFuera(els, ctx).size).toBe(0);
    expect(calcularTopes(els, ctx)).toHaveLength(4);
    expect(els.filter((e) => e.componenteId === 'canaleta_25')).toHaveLength(3);
    expect(els.filter((e) => e.componenteId === 'riel_din')).toHaveLength(2);
  });
});
