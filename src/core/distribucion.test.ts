import { describe, expect, it } from 'vitest';
import { agregarElemento, cambiarLargo, listarPiezas, moverElemento, resolverColocacion } from './colocacion';
import type { Contexto } from './colocacion';
import { distribuirAutomaticamente, planificarDistribucion, puedeDistribuir } from './distribucion';
import { armarEjemplo, cargarBiblioteca, crearContextoDe } from './ejemplo.testutil';
import { solapan } from './geometria';
import { valoresPorDefecto } from './modelo';
import type { Elemento } from './modelo';

const bib = cargarBiblioteca();
const AJUSTES = [
  { nombre: 'compacto', modo: 'compacto' as const, seccionCanaleta: 40 as const },
  { nombre: 'con canaleta 25', modo: 'con_canaleta' as const, seccionCanaleta: 25 as const },
  { nombre: 'con canaleta 40', modo: 'con_canaleta' as const, seccionCanaleta: 40 as const },
  { nombre: 'con canaleta 60', modo: 'con_canaleta' as const, seccionCanaleta: 60 as const },
];
const CAJAS = [
  { nombre: 'genérica 400x500x200', caja: { id: 'caja_metalica_400x500x200' } },
  { nombre: 'Lerkenbox ARES 400x400x200', caja: { id: 'caja_metalica_ares_400x400x200' } },
  { nombre: 'Eldon ASR 600x600x210 (inox)', caja: { id: 'caja_inox_asr_600x600x210' } },
  { nombre: 'medida libre 800x1000 metálica', caja: { libre: { ancho_mm: 800, alto_mm: 1000, tipo: 'metalica' as const } } },
];

/** Todas las piezas están dentro de la placa y ningún par se superpone (salvo un aparato con su propio riel). */
function sinSuperposiciones(elementos: readonly Elemento[], ctx: Contexto): void {
  const piezas = listarPiezas(elementos, ctx);
  for (const p of piezas) {
    expect(p.rect.x, p.uid).toBeGreaterThanOrEqual(ctx.caja.area.x - 0.01);
    expect(p.rect.y, p.uid).toBeGreaterThanOrEqual(ctx.caja.area.y - 0.01);
    expect(p.rect.x + p.rect.w, p.uid).toBeLessThanOrEqual(ctx.caja.area.x + ctx.caja.area.w + 0.01);
    expect(p.rect.y + p.rect.h, p.uid).toBeLessThanOrEqual(ctx.caja.area.y + ctx.caja.area.h + 0.01);
  }
  for (let i = 0; i < piezas.length; i++) {
    for (let j = i + 1; j < piezas.length; j++) {
      const a = piezas[i]!;
      const b = piezas[j]!;
      const permitido = (x: typeof a, y: typeof b) => x.clase === 'aparato' && y.clase === 'riel' && x.rielUid === y.uid;
      if (permitido(a, b) || permitido(b, a)) continue;
      expect(solapan(a.rect, b.rect), `${a.clase} ${a.uid} vs ${b.clase} ${b.uid}`).toBe(false);
    }
  }
}

describe('distribuir automáticamente: caja vacía', () => {
  describe.each(CAJAS)('$nombre', ({ caja }) => {
    it.each(AJUSTES)('$nombre: sin superposiciones y con las filas y módulos de la capacidad', ({ modo, seccionCanaleta }) => {
      const ctx = crearContextoDe(bib, caja, { modo, seccionCanaleta });
      const r = distribuirAutomaticamente([], ctx);
      if (!r.ok) {
        // Con fijaciones de fábrica puede chocar: debe rechazar con un motivo claro, no dejar algo a medias.
        expect(r.motivo).toMatch(/No se pudo distribuir|no cabe/);
        expect(ctx.caja.fijaciones.length > 0 || (ctx.capacidad?.filas ?? 0) < 1).toBe(true);
        return;
      }
      sinSuperposiciones(r.elementos, ctx);
      const cap = ctx.capacidad!;
      const rieles = r.elementos.filter((e) => e.componenteId === 'riel_din');
      const canaletas = r.elementos.filter((e) => e.componenteId.startsWith('canaleta_'));
      expect(rieles).toHaveLength(cap.filas);
      expect(canaletas).toHaveLength(modo === 'compacto' ? 0 : cap.filas + 1 + 2);
      for (const riel of rieles) expect(riel.largo_mm).toBe(Math.floor(cap.largoRielMm));
      // Caben exactamente los módulos por fila más dos topes dentro del riel.
      expect(cap.modulosPorFila * ctx.moduloMm + 16).toBeLessThanOrEqual(Math.floor(cap.largoRielMm));
    });
  });

  it('en modo con canaleta hay una vertical a cada costado, una horizontal sobre y bajo cada fila, y ninguna pisa a otra', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' }, { modo: 'con_canaleta', seccionCanaleta: 40 });
    const r = distribuirAutomaticamente([], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const verticales = r.elementos.filter((e) => e.rotacion === 90);
    const horizontales = r.elementos.filter((e) => e.componenteId.startsWith('canaleta_') && e.rotacion !== 90);
    expect(verticales).toHaveLength(2);
    expect(horizontales).toHaveLength(ctx.capacidad!.filas + 1);
    const a = ctx.caja.area;
    const xs = verticales.map((v) => v.x_mm).sort((p, q) => p - q);
    expect(xs[0]).toBe(a.x + ctx.margenes.lateral);
    expect(xs[1]! + 40).toBe(a.x + a.w - ctx.margenes.lateral);
    // Cada riel queda entre dos horizontales.
    for (const riel of r.elementos.filter((e) => e.componenteId === 'riel_din')) {
      expect(horizontales.some((h) => h.y_mm + 40 <= riel.y_mm + 0.01)).toBe(true);
      expect(horizontales.some((h) => h.y_mm >= riel.y_mm + 35 - 0.01)).toBe(true);
    }
    sinSuperposiciones(r.elementos, ctx);
  });

  it('todas las cajas metálicas e inox: o se distribuye sin superposiciones o se rechaza con motivo', () => {
    let ok = 0;
    for (const c of bib.gabinetes.cajas) {
      if (c.tipo !== 'metalica' && c.tipo !== 'inox') continue;
      for (const aj of AJUSTES) {
        const ctx = crearContextoDe(bib, { id: c.id }, { modo: aj.modo, seccionCanaleta: aj.seccionCanaleta });
        const r = distribuirAutomaticamente([], ctx);
        if (r.ok) {
          sinSuperposiciones(r.elementos, ctx);
          ok++;
        } else {
          expect(r.motivo.length, c.id).toBeGreaterThan(10);
        }
      }
    }
    expect(ok).toBeGreaterThan(100);
  });

  it('no aplica a las cajas plásticas', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_plastica_embutida_2f' });
    expect(puedeDistribuir(ctx)).toBe(false);
    expect(distribuirAutomaticamente([], ctx).ok).toBe(false);
    expect(planificarDistribucion(ctx).ok).toBe(false);
  });

  it('lo que resulta se puede editar a mano como cualquier otro elemento', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' }, { modo: 'con_canaleta', seccionCanaleta: 40 });
    const r = distribuirAutomaticamente([], ctx);
    if (!r.ok) throw new Error(r.motivo);
    const riel = r.elementos.find((e) => e.componenteId === 'riel_din')!;
    expect(cambiarLargo(r.elementos, ctx, riel.uid, (riel.largo_mm ?? 0) - 50).ok).toBe(true);
    const nuevo = agregarElemento(r.elementos, ctx, 'automatico_1p', { x: riel.x_mm + 60, y: riel.y_mm + 17 }, valoresPorDefecto(ctx.comps.get('automatico_1p')!));
    expect(nuevo.ok).toBe(true);
  });
});

describe('distribuir automáticamente: con aparatos ya colocados', () => {
  it('reubica los aparatos del ejemplo en los rieles nuevos, sin superposiciones y conservando su orden', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
    const antes = armarEjemplo(ctx);
    const aparatos = (e: readonly Elemento[]) => e.filter((x) => ctx.comps.get(x.componenteId)?.montaje === 'riel');
    const ordenAntes = aparatos(antes)
      .sort((p, q) => p.y_mm - q.y_mm || p.x_mm - q.x_mm)
      .map((e) => e.uid);
    const r = distribuirAutomaticamente(antes, ctx);
    if (!r.ok) throw new Error(r.motivo);
    sinSuperposiciones(r.elementos, ctx);
    const despues = aparatos(r.elementos);
    expect(despues).toHaveLength(ordenAntes.length);
    for (const p of listarPiezas(r.elementos, ctx).filter((q) => q.clase === 'aparato')) expect(p.rielUid).toBeDefined();
    // Orden relativo: leyendo fila por fila y de izquierda a derecha, la secuencia no cambia.
    const ordenDespues = [...despues].sort((p, q) => p.y_mm - q.y_mm || p.x_mm - q.x_mm).map((e) => e.uid);
    expect(ordenDespues).toEqual(ordenAntes);
    for (const e of despues) expect(e.valores).toEqual(antes.find((a) => a.uid === e.uid)?.valores);
    // Los rieles y canaletas viejos ya no están.
    const viejos = new Set(antes.filter((a) => ctx.comps.get(a.componenteId)?.montaje === 'lineal').map((a) => a.uid));
    expect(r.elementos.some((e) => viejos.has(e.uid))).toBe(false);
  });

  it('conserva alimentadoPor y circuitoId de los aparatos', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
    const base = armarEjemplo(ctx);
    const i = base.findIndex((e) => ctx.comps.get(e.componenteId)?.montaje === 'riel');
    const antes = base.map((e, k) => (k === i ? { ...e, alimentadoPor: 'otro', circuitoId: 'c1' } : e));
    const r = distribuirAutomaticamente(antes, ctx);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.elementos.find((e) => e.uid === base[i]!.uid)).toMatchObject({ alimentadoPor: 'otro', circuitoId: 'c1' });
  });

  it('rechaza todo, sin cambiar nada, si un aparato no cabe en la nueva distribución', () => {
    // Una fila llena en modo compacto no cabe cuando el modo con canaleta de 60 mm acorta el riel.
    const ctxCompacto = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
    const riel = resolverColocacion([], ctxCompacto, { comp: ctxCompacto.comps.get('riel_din')!, punto: { x: 225, y: 100 } });
    if (!riel.ok) throw new Error(riel.motivo);
    let elementos: Elemento[] = [{ uid: 'r1', componenteId: 'riel_din', x_mm: riel.x_mm, y_mm: riel.y_mm, largo_mm: riel.largo_mm, valores: {} }];
    const comp = ctxCompacto.comps.get('automatico_1p')!;
    const yc = riel.y_mm + ctxCompacto.rielAlto / 2;
    for (let i = 0; i < ctxCompacto.capacidad!.modulosPorFila; i++) {
      const c = agregarElemento(elementos, ctxCompacto, 'automatico_1p', { x: riel.x_mm + 9 + 18 * i, y: yc }, valoresPorDefecto(comp));
      if (!c.ok) throw new Error(c.motivo);
      elementos = c.elementos;
    }
    const copia = JSON.parse(JSON.stringify(elementos)) as Elemento[];
    const ctxNuevo = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' }, { modo: 'con_canaleta', seccionCanaleta: 60 });
    expect(ctxNuevo.capacidad!.modulosPorFila).toBeLessThan(ctxCompacto.capacidad!.modulosPorFila);
    const r = distribuirAutomaticamente(elementos, ctxNuevo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/No se pudo distribuir.*No se cambió nada/);
    expect(elementos).toEqual(copia); // la entrada no se tocó
  });

  it('un aparato de montaje libre se queda donde está; si choca con la nueva distribución, se rechaza todo', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' }); // compacto: dos filas y espacio libre abajo
    const foto = ctx.comps.get('fotocelda')!;
    const libre: Elemento = { uid: 'f', componenteId: 'fotocelda', x_mm: 100, y_mm: 320, valores: valoresPorDefecto(foto) };
    const r = distribuirAutomaticamente([libre], ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.elementos.find((e) => e.uid === 'f')).toMatchObject({ x_mm: 100, y_mm: 320 });
    const encima = distribuirAutomaticamente([{ ...libre, y_mm: ctx.caja.area.y + ctx.margenes.vertical + 20 }], ctx);
    expect(encima.ok).toBe(false);
    if (!encima.ok) expect(encima.motivo).toMatch(/No se pudo distribuir.*No se cambió nada/);
  });
});

describe('largo por defecto de una canaleta o riel nuevo con canaletas verticales ya instaladas', () => {
  const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
  const canaleta = ctx.comps.get('canaleta_40')!;
  const a = ctx.areaUtil;
  const vertical = (x: number, largo = 300): Elemento => ({ uid: `v${x}`, componenteId: 'canaleta_40', x_mm: x, y_mm: a.y, largo_mm: largo, rotacion: 90, valores: {} });
  const izq = vertical(a.x);
  const der = vertical(a.x + a.w - 40);

  it('la canaleta horizontal nueva ocupa solo el tramo entre las verticales, sin pisarlas', () => {
    const r = resolverColocacion([izq, der], ctx, { comp: canaleta, punto: { x: 250, y: 150 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.x_mm).toBe(Math.ceil(a.x + 40));
    expect(r.x_mm + (r.largo_mm ?? 0)).toBeLessThanOrEqual(a.x + a.w - 40 + 0.01);
    expect(r.largo_mm).toBeGreaterThan(300);
  });

  it('sin verticales el comportamiento no cambia: ancho útil completo', () => {
    const r = resolverColocacion([], ctx, { comp: canaleta, punto: { x: 250, y: 150 } });
    expect(r.ok && r.largo_mm).toBe(Math.floor(a.w));
  });

  it('una vertical que no cruza la fila del elemento nuevo no lo recorta', () => {
    const r = resolverColocacion([vertical(a.x, 100)], ctx, { comp: canaleta, punto: { x: 250, y: 250 } });
    expect(r.ok && r.largo_mm).toBe(Math.floor(a.w));
  });

  it('el riel nuevo también se acorta para no pisar las verticales', () => {
    const r = resolverColocacion([izq, der], ctx, { comp: ctx.comps.get('riel_din')!, punto: { x: 250, y: 150 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.x_mm).toBeGreaterThanOrEqual(a.x + 40 - 0.01);
    expect(r.x_mm + (r.largo_mm ?? 0)).toBeLessThanOrEqual(a.x + a.w - 40 + 0.01);
  });

  it('agregada por la vía normal no queda superpuesta con las verticales', () => {
    const c = agregarElemento([izq, der], ctx, 'canaleta_40', { x: 250, y: 150 }, {});
    expect(c.ok).toBe(true);
    if (c.ok) sinSuperposiciones(c.elementos, ctx);
  });

  it('un elemento con largo ya fijado se mueve como siempre (la regla es solo para lo recién agregado)', () => {
    const c = agregarElemento([izq, der], ctx, 'canaleta_40', { x: 250, y: 150 }, {});
    if (!c.ok) throw new Error(c.motivo);
    const nuevo = c.elementos[c.elementos.length - 1]!;
    const largoAntes = nuevo.largo_mm;
    const m = moverElemento(c.elementos, ctx, nuevo.uid, { x: nuevo.x_mm + (nuevo.largo_mm ?? 0) / 2, y: 200 });
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.elementos.find((e) => e.uid === nuevo.uid)?.largo_mm).toBe(largoAntes);
  });
});
