export const LIMITE_HISTORIAL = 200;

export interface Historial<T> {
  pasado: T[];
  futuro: T[];
}

export function historialVacio<T>(): Historial<T> {
  return { pasado: [], futuro: [] };
}

/** Guarda `anterior` (el estado antes del cambio) y descarta el futuro. */
export function registrar<T>(h: Historial<T>, anterior: T, limite = LIMITE_HISTORIAL): Historial<T> {
  const pasado = [...h.pasado, anterior];
  return { pasado: pasado.length > limite ? pasado.slice(pasado.length - limite) : pasado, futuro: [] };
}

export function deshacer<T>(h: Historial<T>, actual: T): { historial: Historial<T>; estado: T } | null {
  const estado = h.pasado[h.pasado.length - 1];
  if (estado === undefined) return null;
  return {
    estado,
    historial: { pasado: h.pasado.slice(0, -1), futuro: [...h.futuro, actual] },
  };
}

export function rehacer<T>(h: Historial<T>, actual: T): { historial: Historial<T>; estado: T } | null {
  const estado = h.futuro[h.futuro.length - 1];
  if (estado === undefined) return null;
  return {
    estado,
    historial: { pasado: [...h.pasado, actual], futuro: h.futuro.slice(0, -1) },
  };
}
