import type { EstadoOcupacion, Ocupacion } from '../core/ocupacion';

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

/** Una fila de la tabla "Ocupación de riel" del PDF: todo texto (el color es un complemento) para que se lea impresa en blanco y negro. */
export interface FilaOcupacionPdf {
  fila: string;
  modulos: string;
  maximo: string;
  porcentaje: string;
  estado: string;
  color: [number, number, number];
  /** El tablero completo: va primero y en negrita. */
  total: boolean;
}

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Filas del PDF: el tablero completo y luego cada fila de riel de arriba hacia abajo. */
export function filasOcupacionPdf(o: Ocupacion): FilaOcupacionPdf[] {
  const fila = (nombre: string, n: Ocupacion['total'], textos: Record<EstadoOcupacion, string>, total: boolean): FilaOcupacionPdf => ({
    fila: nombre,
    modulos: `${formatearModulos(n.modulos)} de ${n.capacidad}`,
    maximo: String(n.limite),
    porcentaje: formatearPorcentaje(n.porcentaje),
    estado: textos[n.estado],
    color: rgb(COLOR_OCUPACION[n.estado]),
    total,
  });
  return [fila('Tablero completo', o.total, TEXTO_TOTAL, true), ...o.filas.map((f) => fila(`Fila ${f.numero}`, f, TEXTO_FILA, false))];
}

/** Leyenda de la tabla: de dónde sale el máximo. */
export function notaOcupacion(o: Ocupacion): string {
  return `Reserva del 25 % de la capacidad total (RIC N°02 6.1.16.3): se ocupa como máximo el ${o.limitePorcentaje} %. Un módulo equivale a 18 mm de ancho de aparato.`;
}
