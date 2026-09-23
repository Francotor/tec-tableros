import { describe, expect, it } from 'vitest';
import {
  agregarCircuito,
  asignarCircuito,
  borrarCircuito,
  cadenaDePadres,
  candidatosPadre,
  fijarAlimentadoPor,
  MOTIVOS_CONEXION,
  puedeConectarse,
  renombrarCircuito,
} from './conexion';
import type { Contexto } from './colocacion';
import { armarEjemplo, cargarBiblioteca, crearContextoDe } from './ejemplo.testutil';
import type { Elemento } from './modelo';

const bib = cargarBiblioteca();
const ctx: Contexto = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });

/** El ejemplo trae aparatos de sobra (automáticos, diferenciales, un contactor) y rieles/canaletas. */
const base = (): Elemento[] => armarEjemplo(ctx);

function porComponente(els: Elemento[], id: string): Elemento {
  const el = els.find((e) => e.componenteId === id);
  if (!el) throw new Error(`no hay ${id} en el ejemplo`);
  return el;
}

describe('puedeConectarse', () => {
  it('un aparato sí puede conectarse; riel, canaleta y tope no', () => {
    expect(puedeConectarse(ctx.comps.get('automatico_1p')!)).toBe(true);
    expect(puedeConectarse(ctx.comps.get('contactor_3p')!)).toBe(true);
    expect(puedeConectarse(ctx.comps.get('riel_din')!)).toBe(false);
    expect(puedeConectarse(ctx.comps.get('canaleta_25')!)).toBe(false);
    expect(puedeConectarse(ctx.comps.get('tope_riel')!)).toBe(false);
  });
});

describe('fijarAlimentadoPor', () => {
  it('asigna un padre válido', () => {
    const els = base();
    const hijo = porComponente(els, 'automatico_1p');
    const padre = porComponente(els, 'contactor_3p');
    const r = fijarAlimentadoPor(els, ctx, hijo.uid, padre.uid);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.elementos.find((e) => e.uid === hijo.uid)?.alimentadoPor).toBe(padre.uid);
  });

  it('reasigna a un padre distinto', () => {
    const els = base();
    const hijo = porComponente(els, 'automatico_1p');
    const padre1 = porComponente(els, 'contactor_3p');
    const padre2 = porComponente(els, 'diferencial_2p');
    const r1 = fijarAlimentadoPor(els, ctx, hijo.uid, padre1.uid);
    if (!r1.ok) throw new Error(r1.motivo);
    const r2 = fijarAlimentadoPor(r1.elementos, ctx, hijo.uid, padre2.uid);
    if (!r2.ok) throw new Error(r2.motivo);
    expect(r2.elementos.find((e) => e.uid === hijo.uid)?.alimentadoPor).toBe(padre2.uid);
  });

  it('null quita el padre', () => {
    const els = base();
    const hijo = porComponente(els, 'automatico_1p');
    const padre = porComponente(els, 'contactor_3p');
    const r1 = fijarAlimentadoPor(els, ctx, hijo.uid, padre.uid);
    if (!r1.ok) throw new Error(r1.motivo);
    const r2 = fijarAlimentadoPor(r1.elementos, ctx, hijo.uid, null);
    if (!r2.ok) throw new Error(r2.motivo);
    const final = r2.elementos.find((e) => e.uid === hijo.uid);
    expect(final?.alimentadoPor).toBeUndefined();
    expect('alimentadoPor' in (final ?? {})).toBe(false);
  });

  it('rechaza que un elemento se alimente a sí mismo', () => {
    const els = base();
    const a = porComponente(els, 'automatico_1p');
    expect(fijarAlimentadoPor(els, ctx, a.uid, a.uid)).toEqual({ ok: false, motivo: MOTIVOS_CONEXION.simismo });
  });

  it('rechaza un riel, una canaleta o un tope como padre o como hijo', () => {
    const els = base();
    const riel = porComponente(els, 'riel_din');
    const canaleta = porComponente(els, 'canaleta_25');
    const aparato = porComponente(els, 'automatico_1p');
    expect(fijarAlimentadoPor(els, ctx, aparato.uid, riel.uid)).toEqual({ ok: false, motivo: MOTIVOS_CONEXION.montaje });
    expect(fijarAlimentadoPor(els, ctx, riel.uid, aparato.uid)).toEqual({ ok: false, motivo: MOTIVOS_CONEXION.montaje });
    expect(fijarAlimentadoPor(els, ctx, canaleta.uid, aparato.uid)).toEqual({ ok: false, motivo: MOTIVOS_CONEXION.montaje });
  });

  it('detecta y rechaza un ciclo directo (A alimenta a B, B no puede alimentar a A)', () => {
    const els = base();
    const a = porComponente(els, 'automatico_1p');
    const b = porComponente(els, 'contactor_3p');
    const r1 = fijarAlimentadoPor(els, ctx, a.uid, b.uid); // a <- b (b alimenta a a)
    if (!r1.ok) throw new Error(r1.motivo);
    const r2 = fijarAlimentadoPor(r1.elementos, ctx, b.uid, a.uid); // ciclo: b <- a <- b
    expect(r2).toEqual({ ok: false, motivo: MOTIVOS_CONEXION.ciclo });
  });

  it('detecta y rechaza un ciclo indirecto (A <- B <- C, C no puede terminar alimentado por A)', () => {
    const els = base();
    const a = porComponente(els, 'automatico_1p');
    const b = porComponente(els, 'contactor_3p');
    const c = porComponente(els, 'diferencial_2p');
    const r1 = fijarAlimentadoPor(els, ctx, a.uid, b.uid); // a <- b
    if (!r1.ok) throw new Error(r1.motivo);
    const r2 = fijarAlimentadoPor(r1.elementos, ctx, b.uid, c.uid); // b <- c  (cadena: a <- b <- c)
    if (!r2.ok) throw new Error(r2.motivo);
    const r3 = fijarAlimentadoPor(r2.elementos, ctx, c.uid, a.uid); // c <- a cerraría el ciclo
    expect(r3).toEqual({ ok: false, motivo: MOTIVOS_CONEXION.ciclo });
  });

  it('rechaza un padre o un hijo que no existen', () => {
    const els = base();
    const a = porComponente(els, 'automatico_1p');
    expect(fijarAlimentadoPor(els, ctx, 'no-existe', a.uid).ok).toBe(false);
    expect(fijarAlimentadoPor(els, ctx, a.uid, 'no-existe').ok).toBe(false);
  });
});

describe('cadenaDePadres', () => {
  it('devuelve [padre, abuelo, ...] hasta la raíz, sin incluir al propio elemento', () => {
    const els = base();
    const a = porComponente(els, 'automatico_1p');
    const b = porComponente(els, 'contactor_3p');
    const c = porComponente(els, 'diferencial_2p');
    let actuales = els;
    for (const [hijo, padre] of [
      [a, b],
      [b, c],
    ] as const) {
      const r = fijarAlimentadoPor(actuales, ctx, hijo.uid, padre.uid);
      if (!r.ok) throw new Error(r.motivo);
      actuales = r.elementos;
    }
    const cadena = cadenaDePadres(actuales, a.uid).map((e) => e.uid);
    expect(cadena).toEqual([b.uid, c.uid]);
  });

  it('un elemento sin padre tiene la cadena vacía', () => {
    const els = base();
    const a = porComponente(els, 'automatico_1p');
    expect(cadenaDePadres(els, a.uid)).toEqual([]);
  });

  it('no se cuelga si los datos ya traían un ciclo (defensivo)', () => {
    const els = base();
    const a = porComponente(els, 'automatico_1p');
    const b = porComponente(els, 'contactor_3p');
    const dañados = els.map((e) => {
      if (e.uid === a.uid) return { ...e, alimentadoPor: b.uid };
      if (e.uid === b.uid) return { ...e, alimentadoPor: a.uid };
      return e;
    });
    expect(cadenaDePadres(dañados, a.uid).length).toBeLessThanOrEqual(2);
  });
});

describe('candidatosPadre', () => {
  it('excluye al propio elemento, los de montaje y los que crearían un ciclo', () => {
    const els = base();
    const a = porComponente(els, 'automatico_1p');
    const b = porComponente(els, 'contactor_3p');
    const r = fijarAlimentadoPor(els, ctx, a.uid, b.uid);
    if (!r.ok) throw new Error(r.motivo);
    const candidatos = candidatosPadre(r.elementos, ctx, b.uid).map((e) => e.uid);
    expect(candidatos).not.toContain(b.uid); // a sí mismo
    expect(candidatos).not.toContain(a.uid); // crearía un ciclo (a ya depende de b)
    expect(candidatos.some((uid) => ctx.comps.get(r.elementos.find((e) => e.uid === uid)!.componenteId)!.categoria === 'Montaje')).toBe(
      false,
    );
  });

  it('un elemento de montaje no tiene candidatos (no puede tener padre)', () => {
    const els = base();
    const riel = porComponente(els, 'riel_din');
    expect(candidatosPadre(els, ctx, riel.uid)).toEqual([]);
  });
});

describe('circuitos', () => {
  it('agregar, renombrar y borrar', () => {
    let circuitos = agregarCircuito([], 'C1', 'Iluminación');
    expect(circuitos).toMatchObject([{ numero: 'C1', nombre: 'Iluminación' }]);
    const id = circuitos[0]!.id;
    circuitos = renombrarCircuito(circuitos, id, { nombre: 'Iluminación living' });
    expect(circuitos[0]?.nombre).toBe('Iluminación living');
    expect(circuitos[0]?.numero).toBe('C1');

    const els: Elemento[] = [{ uid: 'x', componenteId: 'automatico_1p', x_mm: 0, y_mm: 0, valores: {}, circuitoId: id }];
    const r = borrarCircuito(circuitos, els, id);
    expect(r.circuitos).toHaveLength(0);
    expect(r.elementos[0]?.circuitoId).toBeUndefined();
  });

  it('asignar y reasignar el circuito de un elemento', () => {
    const els = base();
    const a = porComponente(els, 'automatico_1p');
    const c1 = agregarCircuito([], 'C1', 'Iluminación')[0]!;
    const c2 = agregarCircuito([], 'C2', 'Enchufes')[0]!;
    let actuales = asignarCircuito(els, a.uid, c1.id);
    expect(actuales.find((e) => e.uid === a.uid)?.circuitoId).toBe(c1.id);
    actuales = asignarCircuito(actuales, a.uid, c2.id);
    expect(actuales.find((e) => e.uid === a.uid)?.circuitoId).toBe(c2.id);
    actuales = asignarCircuito(actuales, a.uid, null);
    const final = actuales.find((e) => e.uid === a.uid);
    expect(final?.circuitoId).toBeUndefined();
    expect('circuitoId' in (final ?? {})).toBe(false);
  });
});
