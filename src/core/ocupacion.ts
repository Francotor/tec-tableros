import { listarPiezas, listarRieles } from './colocacion';
import type { Contexto } from './colocacion';
import type { Elemento } from './modelo';
import { usaCapacidadDeRiel } from './tipoProyecto';

/**
 * ok: dentro del límite con reserva; sin_reserva: cabe pero no deja la reserva exigida; excede: no cabe en la capacidad.
 */
export type EstadoOcupacion = 'ok' | 'sin_reserva' | 'excede';

export interface OcupacionNivel {
  /** Módulos ocupados (el ancho de los aparatos dividido por el módulo; puede ser fraccionario). */
  modulos: number;
  /** Módulos que caben (por fila o en todo el tablero). */
  capacidad: number;
  /** Máximo de módulos que deja la reserva: capacidad × (1 − reserva), redondeado hacia abajo. */
  limite: number;
  /** modulos / capacidad, en %. */
  porcentaje: number;
  estado: EstadoOcupacion;
}

export interface OcupacionFila extends OcupacionNivel {
  uid: string;
  /** 1 = la fila de más arriba. */
  numero: number;
  incluido: boolean;
  x: number;
  yCentro: number;
  largo: number;
}

export interface Ocupacion {
  filas: OcupacionFila[];
  total: OcupacionNivel;
  /** Reserva exigida (0,25) y el tope de ocupación que implica, en % de la capacidad (75 %). */
  reserva: number;
  limitePorcentaje: number;
}

export interface FilaDeRiel {
  uid: string;
  numero: number;
  incluido: boolean;
  x: number;
  yCentro: number;
  largo: number;
  modulos: number;
}

/**
 * Las filas (rieles) del tablero, de arriba hacia abajo, con los módulos que ocupan los aparatos montados en cada una.
 * La numeración es la misma en los avisos y en el indicador de ocupación.
 */
export function filasDeRiel(elementos: readonly Elemento[], ctx: Contexto): FilaDeRiel[] {
  const aparatos = listarPiezas(elementos, ctx).filter((p) => p.clase === 'aparato');
  return listarRieles(elementos, ctx)
    .sort((a, b) => a.yCentro - b.yCentro || a.x - b.x)
    .map((r, i) => ({
      uid: r.uid,
      numero: i + 1,
      incluido: r.incluido,
      x: r.x,
      yCentro: r.yCentro,
      largo: r.largo,
      modulos: aparatos.filter((p) => p.rielUid === r.uid).reduce((s, p) => s + p.rect.w, 0) / ctx.moduloMm,
    }));
}

const EPS = 1e-9;

function nivel(modulos: number, capacidad: number, limite: number): OcupacionNivel {
  const estado: EstadoOcupacion = modulos > capacidad + EPS ? 'excede' : modulos > limite + EPS ? 'sin_reserva' : 'ok';
  return { modulos, capacidad, limite, porcentaje: capacidad > 0 ? (modulos / capacidad) * 100 : 0, estado };
}

/**
 * Ocupación de riel de cada fila y del tablero completo frente a la capacidad y al máximo que deja la reserva del 25 %
 * de la capacidad total (RIC N°02 6.1.16.3): se ocupa como mucho el 75 %. null donde no aplica (un medidor no tiene filas de riel) o si no hay ninguna fila.
 */
export function calcularOcupacion(elementos: readonly Elemento[], ctx: Contexto): Ocupacion | null {
  if (!usaCapacidadDeRiel(ctx.tipo)) return null;
  const filas = filasDeRiel(elementos, ctx);
  if (filas.length === 0) return null;
  const { reserva } = ctx;
  const porFila = ctx.capacidad ? ctx.capacidad.modulosPorFila : ctx.caja.modulosPorFila;
  const limiteFila = Math.floor(porFila * (1 - reserva) + EPS);
  // Total: todas las filas que caben en la caja (metálicas/inox) o las que traen las plásticas.
  const capacidadTotal = ctx.capacidad ? ctx.capacidad.modulosTotal : filas.length * porFila;
  const limiteTotal = ctx.capacidad ? ctx.capacidad.modulosMaxConReserva : Math.floor(capacidadTotal * (1 - reserva) + EPS);
  return {
    filas: filas.map((f) => ({ ...f, ...nivel(f.modulos, porFila, limiteFila) })),
    total: nivel(
      filas.reduce((s, f) => s + f.modulos, 0),
      capacidadTotal,
      limiteTotal,
    ),
    reserva,
    limitePorcentaje: Math.round((1 - reserva) * 100),
  };
}
