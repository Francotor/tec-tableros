import type { EstadoOcupacion } from '../core/ocupacion';

export const COLOR_OCUPACION: Record<EstadoOcupacion, string> = {
  ok: '#2E7D32',
  sin_reserva: '#B26A00',
  excede: '#B3261E',
};

export const TEXTO_FILA: Record<EstadoOcupacion, string> = {
  ok: 'Dentro del máximo',
  sin_reserva: 'Sin reserva del 25 %',
  excede: 'Excede la fila',
};

export const TEXTO_TOTAL: Record<EstadoOcupacion, string> = {
  ok: 'Dentro del máximo',
  sin_reserva: 'Sin reserva del 25 %',
  excede: 'Excede la caja',
};

const formato = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

/** Módulos con un decimal como máximo y coma decimal ("13,8"). */
export function formatearModulos(n: number): string {
  return formato.format(n);
}

/** Porcentaje entero ("84 %"). */
export function formatearPorcentaje(p: number): string {
  return `${Math.round(p)} %`;
}
