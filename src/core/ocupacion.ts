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
  /** Módulos que caben: el largo del riel dividido por el módulo (por fila) o la suma de las filas (tablero). Puede ser fraccionario. */
  capacidad: number;
  /** Cuántos módulos enteros caben dentro de la reserva: capacidad × (1 − reserva) hacia abajo. Es informativo: el estado sale del porcentaje. */
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

/**
 * Estado y porcentaje de un nivel. El estado compara el porcentaje real contra el máximo de la reserva (75 %), no los módulos
 * decimales contra el `limite` entero: ese límite está redondeado hacia abajo (sirve para decir cuántos módulos enteros
 * caben) y marcaría "sin reserva" a quien está bajo el 75 % por una fracción de módulo (12,2 de 17 es 71,8 %, no 75 %).
 */
export function nivelDeOcupacion(modulos: number, capacidad: number, reserva: number): OcupacionNivel {
  const limite = Math.floor(capacidad * (1 - reserva) + EPS);
  const estado: EstadoOcupacion =
    modulos > capacidad + EPS ? 'excede' : capacidad > 0 && modulos / capacidad > 1 - reserva + EPS ? 'sin_reserva' : 'ok';
  return { modulos, capacidad, limite, porcentaje: capacidad > 0 ? (modulos / capacidad) * 100 : 0, estado };
}

/**
 * Ocupación de riel de cada fila y del tablero completo frente a la capacidad y al máximo que deja la reserva del 25 %
 * de la capacidad total (RIC N°02 6.1.16.3): se ocupa como mucho el 75 %. null donde no aplica (un medidor no tiene
 * filas de riel) o si no hay ninguna fila.
 *
 * La capacidad de cada fila sale del **largo real de su riel** (largo / módulo): si se alarga o se acorta el riel, cambia.
 * Un riel del largo por defecto (módulos por fila × módulo) da exactamente los módulos por fila de la caja. Las cajas
 * plásticas, con rieles fijos, usan los módulos por fila de la biblioteca. La capacidad del tablero completo suma la de
 * los rieles que hay y, mientras haya menos rieles que filas posibles en la caja, las filas que faltan con su capacidad
 * por defecto.
 */
export function calcularOcupacion(elementos: readonly Elemento[], ctx: Contexto): Ocupacion | null {
  if (!usaCapacidadDeRiel(ctx.tipo)) return null;
  const filas = filasDeRiel(elementos, ctx);
  if (filas.length === 0) return null;
  const { reserva } = ctx;
  const porFilaPorDefecto = ctx.capacidad ? ctx.capacidad.modulosPorFila : ctx.caja.modulosPorFila;
  const capacidadDe = (f: FilaDeRiel): number => (ctx.capacidad ? f.largo / ctx.moduloMm : porFilaPorDefecto);
  const capacidades = filas.map(capacidadDe);
  const filasQueFaltan = ctx.capacidad ? Math.max(0, ctx.capacidad.filas - filas.length) : 0;
  const capacidadTotal = capacidades.reduce((s, c) => s + c, 0) + filasQueFaltan * porFilaPorDefecto;
  return {
    filas: filas.map((f, i) => ({ ...f, ...nivelDeOcupacion(f.modulos, capacidades[i] ?? porFilaPorDefecto, reserva) })),
    total: nivelDeOcupacion(
      filas.reduce((s, f) => s + f.modulos, 0),
      capacidadTotal,
      reserva,
    ),
    reserva,
    limitePorcentaje: Math.round((1 - reserva) * 100),
  };
}
