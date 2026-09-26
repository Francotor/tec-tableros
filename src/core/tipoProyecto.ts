/** Tipo de proyecto: cada uno trae su propio catálogo de piezas y de cajas. */
export type TipoProyecto = 'tablero' | 'medidor';

export const TIPOS_PROYECTO: readonly TipoProyecto[] = ['tablero', 'medidor'];

const NOMBRE: Record<TipoProyecto, string> = {
  tablero: 'Tablero',
  medidor: 'Medidor / Empalme',
};

const CARPETA: Record<TipoProyecto, string> = {
  tablero: 'biblioteca',
  medidor: 'biblioteca-medidores',
};

export function nombreTipo(tipo: TipoProyecto): string {
  return NOMBRE[tipo];
}

/** Carpeta de `public/` que trae el catálogo y las cajas del tipo. */
export function carpetaBiblioteca(tipo: TipoProyecto): string {
  return CARPETA[tipo];
}

/** Un dato guardado sin tipo (de antes de que existiera) es un tablero. */
export function validarTipo(v: unknown): TipoProyecto {
  return v === 'medidor' ? 'medidor' : 'tablero';
}

/** Reglas propias del riel DIN de los tableros (capacidad por fila, reserva del 25 %, modo compacto/con canaleta). */
export function usaCapacidadDeRiel(tipo: TipoProyecto): boolean {
  return tipo === 'tablero';
}

/** Circuitos ("Circuito", "Alimentado por", agrupar la lista por circuito): un empalme no tiene, solo componentes. */
export function usaCircuitos(tipo: TipoProyecto): boolean {
  return tipo === 'tablero';
}

/** Totales de riel DIN y de canaleta en la lista de materiales: son de los tableros. */
export function muestraTotalesDeRielYCanaleta(tipo: TipoProyecto): boolean {
  return tipo === 'tablero';
}
