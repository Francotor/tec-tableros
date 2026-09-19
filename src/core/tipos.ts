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
  rieles_incluidos: boolean;
  rieles?: RielIncluido[];
  notas?: string;
}

export interface Gabinetes {
  version: string;
  unidad: 'mm';
  parametros: {
    margen_placa_mm: number;
    margen_lateral_riel_mm: number;
    canaleta_mm: number;
    margen_vertical_mm: number;
    modulo_mm: number;
    alto_modular_mm: number;
  };
  cajas: Caja[];
}

export interface Biblioteca {
  catalogo: Catalogo;
  gabinetes: Gabinetes;
}
