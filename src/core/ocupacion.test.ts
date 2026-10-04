import { describe, expect, it } from 'vitest';
import { calcularOcupacion, filasDeRiel, nivelDeOcupacion } from './ocupacion';
import { armarEjemplo, cargarBiblioteca, crearContextoDe } from './ejemplo.testutil';
import { agregarElemento, cambiarLargo } from './colocacion';
import { valoresPorDefecto } from './modelo';
import type { Elemento } from './modelo';

const bib = cargarBiblioteca();
const ctxDe = (id = 'caja_metalica_400x500x200', ajustes?: Parameters<typeof crearContextoDe>[2]) => crearContextoDe(bib, { id }, ajustes);

describe('ocupación de riel frente al máximo de la reserva del 25 % (75 % de la capacidad)', () => {
  it('hay una fila por riel, de arriba hacia abajo, y la reserva es del 25 % (se ocupa hasta el 75 %)', () => {
    const ctx = ctxDe();
    const o = calcularOcupacion(armarEjemplo(ctx), ctx)!;
    expect(o.filas.map((f) => f.numero)).toEqual([1, 2]);
    expect(o.filas[0]!.yCentro).toBeLessThan(o.filas[1]!.yCentro);
    expect(o.reserva).toBe(0.25);
    expect(o.limitePorcentaje).toBe(75);
  });

  it('por fila: módulos, capacidad (el riel de 396 mm del ejemplo = 22 módulos), límite (16) y estado', () => {
    const ctx = ctxDe();
    const o = calcularOcupacion(armarEjemplo(ctx), ctx)!;
    const [f1, f2] = o.filas;
    expect(f1!.capacidad).toBeCloseTo(396 / 18, 9);
    expect(f1!.limite).toBe(16);
    // fila 1: 14 módulos (64 %) -> dentro del 75 %; fila 2: ~19 módulos (86 %) -> cabe pero sin reserva
    expect(f1!.modulos).toBeCloseTo(14, 6);
    expect(f1!.estado).toBe('ok');
    expect(f2!.modulos).toBeGreaterThan(16);
    expect(f2!.modulos).toBeLessThanOrEqual(22);
    expect(f2!.estado).toBe('sin_reserva');
    expect(f2!.porcentaje).toBeCloseTo((f2!.modulos / (396 / 18)) * 100, 6);
  });

  it('del tablero completo: suma de las filas contra la capacidad total y su máximo (los de la biblioteca)', () => {
    const ctx = ctxDe();
    const o = calcularOcupacion(armarEjemplo(ctx), ctx)!;
    const suma = o.filas.reduce((s, f) => s + f.modulos, 0);
    expect(o.total.modulos).toBeCloseTo(suma, 9);
    // Dos rieles de 396 mm = 2 x 22 módulos; la caja tiene sitio para 2 filas, así que no falta ninguna.
    expect(o.total.capacidad).toBeCloseTo(44, 9);
    expect(o.total.limite).toBe(33);
    // ~32,9 de 44 módulos: 74,9 %, justo dentro del 75 % (aunque pase de los 32 módulos enteros).
    expect(o.total.modulos).toBeGreaterThan(32);
    expect(o.total.porcentaje).toBeLessThan(75);
    expect(o.total.estado).toBe('ok');
  });

  it('un riel sin aparatos está en 0 % y sin avisos de estado', () => {
    const ctx = ctxDe();
    const base = armarEjemplo(ctx).filter((e) => e.componenteId === 'riel_din');
    const o = calcularOcupacion(base, ctx)!;
    expect(o.filas.every((f) => f.modulos === 0 && f.porcentaje === 0 && f.estado === 'ok')).toBe(true);
    expect(o.total.estado).toBe('ok');
  });

  it('sin rieles no hay indicador, y un medidor no tiene filas de riel', () => {
    const ctx = ctxDe();
    expect(calcularOcupacion([], ctx)).toBeNull();
    expect(calcularOcupacion(armarEjemplo(ctx), { ...ctx, tipo: 'medidor' })).toBeNull();
  });

  it('la capacidad sigue al largo real del riel, no al supuesto por la caja', () => {
    const ctx = ctxDe();
    const comp = ctx.comps.get('riel_din')!;
    const r0 = agregarElemento([], ctx, 'riel_din', { x: 250, y: 100 }, valoresPorDefecto(comp));
    if (!r0.ok) throw new Error(r0.motivo);
    const riel = r0.elementos[0]!;
    const porDefecto = calcularOcupacion(r0.elementos, ctx)!;
    // Un riel del largo por defecto (módulos por fila x módulo) da exactamente los módulos por fila de la caja.
    expect(riel.largo_mm).toBe(ctx.capacidad!.modulosPorFila * ctx.moduloMm);
    expect(porDefecto.filas[0]!.capacidad).toBeCloseTo(ctx.capacidad!.modulosPorFila, 9);
    // Con aparatos encima, alargar el riel baja el % de esa fila y el del tablero; acortarlo lo sube.
    let conAparatos: Elemento[] = r0.elementos;
    for (let i = 0; i < 10; i++) {
      const a = agregarElemento(conAparatos, ctx, 'automatico_1p', { x: riel.x_mm + 9 + i * 18, y: riel.y_mm + 3.75 }, valoresPorDefecto(ctx.comps.get('automatico_1p')!));
      if (!a.ok) throw new Error(a.motivo);
      conAparatos = a.elementos;
    }
    const antes = calcularOcupacion(conAparatos, ctx)!;
    const largo = cambiarLargo(conAparatos, ctx, riel.uid, 400);
    if (!largo.ok) throw new Error(largo.motivo);
    const mas = calcularOcupacion(largo.elementos, ctx)!;
    expect(mas.filas[0]!.modulos).toBeCloseTo(antes.filas[0]!.modulos, 9);
    expect(mas.filas[0]!.capacidad).toBeCloseTo(400 / 18, 9);
    expect(mas.filas[0]!.porcentaje).toBeLessThan(antes.filas[0]!.porcentaje);
    expect(mas.total.porcentaje).toBeLessThan(antes.total.porcentaje);
    const corto = cambiarLargo(conAparatos, ctx, riel.uid, 250);
    if (!corto.ok) throw new Error(corto.motivo);
    expect(calcularOcupacion(corto.elementos, ctx)!.filas[0]!.porcentaje).toBeGreaterThan(antes.filas[0]!.porcentaje);
  });

  it('el total cuenta con la capacidad por defecto de las filas que la caja admite y todavía no tienen riel', () => {
    const ctx = ctxDe();
    const comp = ctx.comps.get('riel_din')!;
    const r0 = agregarElemento([], ctx, 'riel_din', { x: 250, y: 100 }, valoresPorDefecto(comp));
    if (!r0.ok) throw new Error(r0.motivo);
    const o = calcularOcupacion(r0.elementos, ctx)!;
    expect(ctx.capacidad!.filas).toBe(2);
    expect(o.total.capacidad).toBeCloseTo(ctx.capacidad!.modulosTotal, 9); // 20 de su riel + 20 de la fila que falta
  });

  it('en modo con canaleta el riel por defecto es más corto y la capacidad de la fila baja con él', () => {
    const ctx = ctxDe('caja_metalica_400x500x200', { modo: 'con_canaleta' });
    const comp = ctx.comps.get('riel_din')!;
    const r0 = agregarElemento([], ctx, 'riel_din', { x: 250, y: 100 }, valoresPorDefecto(comp));
    if (!r0.ok) throw new Error(r0.motivo);
    const o = calcularOcupacion(r0.elementos, ctx)!;
    expect(o.filas[0]!.capacidad).toBeCloseTo(16, 9);
    expect(o.filas[0]!.limite).toBe(12);
  });

  it('agregar un aparato sube la ocupación de su fila en su ancho en módulos', () => {
    const ctx = ctxDe();
    const base = armarEjemplo(ctx);
    const antes = calcularOcupacion(base, ctx)!;
    const comp = ctx.comps.get('automatico_1p')!;
    const r = agregarElemento(base, ctx, 'automatico_1p', { x: 400, y: 111 }, valoresPorDefecto(comp));
    if (!r.ok) throw new Error(r.motivo);
    const despues = calcularOcupacion(r.elementos, ctx)!;
    expect(despues.filas[0]!.modulos - antes.filas[0]!.modulos).toBeCloseTo(1, 9);
    expect(despues.filas[1]!.modulos).toBeCloseTo(antes.filas[1]!.modulos, 9);
    expect(despues.total.modulos - antes.total.modulos).toBeCloseTo(1, 9);
  });

  it('filasDeRiel numera por posición vertical aunque el riel de abajo se haya agregado primero', () => {
    const ctx = ctxDe();
    const base = armarEjemplo(ctx);
    const rieles = base.filter((e) => e.componenteId === 'riel_din');
    const invertido: Elemento[] = [...base.filter((e) => e.uid !== rieles[0]!.uid), rieles[0]!];
    const filas = filasDeRiel(invertido, ctx);
    expect(filas.map((f) => f.numero)).toEqual([1, 2]);
    expect(filas[0]!.yCentro).toBeLessThan(filas[1]!.yCentro);
  });
});

describe('el estado compara el porcentaje real contra el 75 %, no los módulos decimales contra el máximo entero', () => {
  it('12,2 de 17 módulos (71,8 %) está dentro del máximo aunque pase de los 12 enteros', () => {
    const n = nivelDeOcupacion(12.2, 17, 0.25);
    expect(n.limite).toBe(12);
    expect(n.porcentaje).toBeCloseTo(71.76, 1);
    expect(n.estado).toBe('ok');
  });

  it('72 % y 71 % caen del mismo lado; 76 % ya es sin reserva; justo el 75 % cuenta como dentro', () => {
    expect(nivelDeOcupacion(0.72 * 25, 25, 0.25).estado).toBe('ok');
    expect(nivelDeOcupacion(0.71 * 25, 25, 0.25).estado).toBe('ok');
    expect(nivelDeOcupacion(0.76 * 25, 25, 0.25).estado).toBe('sin_reserva');
    expect(nivelDeOcupacion(15, 20, 0.25).estado).toBe('ok');
    expect(nivelDeOcupacion(15.5, 20, 0.25).estado).toBe('sin_reserva');
  });

  it('más de la capacidad es "excede"; capacidad 0 no divide por cero', () => {
    expect(nivelDeOcupacion(20.5, 20, 0.25).estado).toBe('excede');
    expect(nivelDeOcupacion(3, 0, 0.25)).toMatchObject({ porcentaje: 0, estado: 'excede' });
  });

  it('el estado de una fila y el del total siguen el mismo criterio con fracciones de módulo', () => {
    const ctx = ctxDe();
    const base = armarEjemplo(ctx);
    const o = calcularOcupacion(base, ctx)!;
    for (const f of [...o.filas, o.total]) {
      const esperado = f.modulos > f.capacidad + 1e-9 ? 'excede' : f.porcentaje > 75 + 1e-6 ? 'sin_reserva' : 'ok';
      expect(f.estado).toBe(esperado);
    }
  });
});
