// Tipos derivados de la forma real de public/biblioteca/catalogo.json y gabinetes.json.

export type Categoria = 'Protecciones' | 'Comando' | 'Control' | 'Distribucion' | 'Montaje';

export const CATEGORIAS: readonly Categoria[] = [
  'Protecciones',
  'Comando',
  'Control',
  'Distribucion',
  'Montaje',
];

export type ValorCampo = string | number;

export type Campo =
  | { id: string; rotulo: string; tipo: 'select'; opciones: ValorCampo[]; defecto: ValorCampo }
  | { id: string; rotulo: string; tipo: 'entero'; defecto: number }
  | { id: string; rotulo: string; tipo: 'texto'; defecto: string };

export interface Snap {
  tipo: 'modular' | 'libre';
  paso_mm: number;
}

export interface Etiqueta {
  x: number;
  y: number;
  w: number;
  h: number;
  lineas: string[];
  tamano_mm: number;
}

interface ComponenteBase {
  id: string;
  nombre: string;
  categoria: Categoria;
  svg: string;
  alto_mm: number;
  snap: Snap;
  campos: Campo[];
  atributos?: Record<string, ValorCampo>;
  bom: string;
  notas: string | null;
}

/** Aparato que se monta sobre un riel DIN. */
export interface ComponenteRiel extends ComponenteBase {
  montaje: 'riel';
  ancho_mm: number;
  riel_y_mm: number;
  modulos: number | null;
  polos: number | null;
  etiqueta: Etiqueta | null;
}

/** Aparato que se fija directo a la placa o a la caja. */
export interface ComponenteLibre extends ComponenteBase {
  montaje: 'libre';
  ancho_mm: number;
  riel_y_mm: null;
  modulos: number | null;
  polos: number | null;
  etiqueta: Etiqueta | null;
}

/** Pieza de largo variable: riel DIN o canaleta ranurada. */
export interface ComponenteLineal extends ComponenteBase {
  montaje: 'lineal';
  ancho_mm: null;
  generador: string;
  eje: 'x';
  largo_min_mm: number;
  largo_max_mm: number;
  accesorios_auto?: { id: string; cantidad: number }[];
}

export type Componente = ComponenteRiel | ComponenteLibre | ComponenteLineal;

export interface Catalogo {
  version: string;
  unidad: 'mm';
  modulo_din_mm: number;
  alto_modular_mm: number;
  riel_din_ancho_mm: number;
  componentes: Componente[];
}

export type TipoCaja = 'metalica' | 'inox' | 'plastica_sobrepuesta' | 'plastica_embutida';

export interface Placa {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface RielIncluido {
  x: number;
  y_centro: number;
  largo: number;
}

/** Filas/módulos que caben con las fórmulas de capacidad, para un modo (o una sección de canaleta) dados. */
export interface CapacidadModo {
  paso_filas_mm: number;
  largo_riel_mm: number;
  filas: number;
  modulos_por_fila: number;
  modulos_total: number;
  modulos_max_con_reserva: number;
}

/** Cajas metálicas e inox: capacidad precalculada por la biblioteca (vector de prueba; el editor la recalcula). */
export interface CapacidadCaja {
  compacto: CapacidadModo;
  con_canaleta: CapacidadModo;
  por_canaleta: Record<'25' | '40' | '60', CapacidadModo>;
}

/** Cajas plásticas: riel incluido de largo fijo. */
export interface CapacidadCajaPlastica {
  riel_incluido: CapacidadModo;
}

/** Márgenes propios de una caja de fabricante (reemplazan al margen de borde general). */
export interface LayoutCaja {
  margen_lateral_mm: number;
  margen_vertical_mm: number;
}

/** Fijación (perno) de una caja de fabricante: círculo que ningún elemento puede invadir. */
export interface Fijacion {
  x: number;
  y: number;
  r_libre_mm: number;
}

export interface Caja {
  id: string;
  nombre: string;
  tipo: TipoCaja;
  montaje: 'sobrepuesta' | 'embutida';
  alto_mm: number;
  ancho_mm: number;
  fondo_mm: number;
  svg: string;
  placa: Placa | null;
  modulos_por_fila: number;
  filas_max_estimado: number;
  capacidad?: CapacidadCaja | CapacidadCajaPlastica;
  layout?: LayoutCaja;
  fijaciones?: Fijacion[];
  rieles_incluidos: boolean;
  rieles?: RielIncluido[];
  /** Caja de fabricante (Eldon, Lerkenbox…). */
  fabricante?: string;
  serie?: string;
  ref_fabricante?: string;
  ref_puerta_transparente?: string;
  /** Medida genérica sin verificar contra un catálogo de fabricante. */
  referencial?: boolean;
  reemplazo_sugerido?: string | null;
  puertas?: number;
  cierres?: string | number;
  bisagras?: number;
  version?: number;
  profundidad_util_mm?: number;
  notas?: string;
}

export interface ParametrosLayout {
  margen_borde_mm: number;
  holgura_mm: number;
  tope_riel_mm: number;
  paso_compacto_mm: number;
  paso_minimo_con_canaleta_mm: number;
  canaleta_defecto_mm: number;
  canaletas_mm: number[];
  reserva: number;
  reemplazo_max_dif_fondo_mm?: number;
  reemplazo_excluye_series?: string[];
  fijacion_keepout_mm?: number;
}

export interface Gabinetes {
  version: string;
  unidad: 'mm';
  parametros: {
    margen_placa_mm: number;
    modulo_mm: number;
    alto_modular_mm: number;
    layout: ParametrosLayout;
    modos: Record<string, string>;
  };
  cajas: Caja[];
}

export interface Biblioteca {
  catalogo: Catalogo;
  gabinetes: Gabinetes;
}
