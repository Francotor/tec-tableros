import { describe, expect, it } from 'vitest';
import { calcularOcupacion, filasDeRiel } from './ocupacion';
import { armarEjemplo, cargarBiblioteca, crearContextoDe } from './ejemplo.testutil';
import { agregarElemento } from './colocacion';
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

  it('por fila: módulos, capacidad (20 en compacto), límite (15) y estado', () => {
    const ctx = ctxDe();
    const o = calcularOcupacion(armarEjemplo(ctx), ctx)!;
    const [f1, f2] = o.filas;
    expect(f1!.capacidad).toBe(20);
    expect(f1!.limite).toBe(15);
    // fila 1: ~13,8 módulos -> dentro del límite; fila 2: ~19 módulos -> cabe pero sin reserva
    expect(f1!.modulos).toBeGreaterThan(12);
    expect(f1!.modulos).toBeLessThanOrEqual(15);
    expect(f1!.estado).toBe('ok');
    expect(f2!.modulos).toBeGreaterThan(15);
    expect(f2!.modulos).toBeLessThanOrEqual(20);
    expect(f2!.estado).toBe('sin_reserva');
    expect(f2!.porcentaje).toBeCloseTo((f2!.modulos / 20) * 100, 6);
  });

  it('del tablero completo: suma de las filas contra la capacidad total y su máximo (los de la biblioteca)', () => {
    const ctx = ctxDe();
    const o = calcularOcupacion(armarEjemplo(ctx), ctx)!;
    const suma = o.filas.reduce((s, f) => s + f.modulos, 0);
    expect(o.total.modulos).toBeCloseTo(suma, 9);
    expect(o.total.capacidad).toBe(ctx.capacidad!.modulosTotal);
    expect(o.total.capacidad).toBe(40);
    expect(o.total.limite).toBe(ctx.capacidad!.modulosMaxConReserva);
    expect(o.total.limite).toBe(30); // coincide con modulos_max_con_reserva de la caja 400x500x200 en la biblioteca
    // El ejemplo ocupa más del 75 % del total (pasa de 30 módulos) pero cabe en los 40: sin la reserva.
    expect(o.total.modulos).toBeGreaterThan(30);
    expect(o.total.modulos).toBeLessThanOrEqual(40);
    expect(o.total.estado).toBe('sin_reserva');
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

  it('en modo con canaleta cambia la capacidad y el límite', () => {
    const ctx = ctxDe('caja_metalica_400x500x200', { modo: 'con_canaleta' });
    const o = calcularOcupacion(armarEjemplo(ctx), ctx)!;
    expect(o.filas[0]!.capacidad).toBe(16);
    expect(o.filas[0]!.limite).toBe(12);
    expect(o.filas[1]!.estado).toBe('excede'); // ~19 módulos en una fila de 16
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
