import { create } from 'zustand';
import { parsearBiblioteca } from '../core/biblioteca';
import { carpetaBiblioteca } from '../core/tipoProyecto';
import type { TipoProyecto } from '../core/tipoProyecto';
import type { Biblioteca } from '../core/tipos';

interface EstadoBiblioteca {
  /** Tipo de proyecto cuya biblioteca está activa (la que se muestra y con la que se dibuja). */
  tipo: TipoProyecto;
  estado: 'cargando' | 'lista' | 'error';
  biblioteca: Biblioteca | null;
  error: string | null;
  /** Activa la biblioteca de ese tipo; si ya se leyó antes, no se vuelve a pedir. */
  cargar: (tipo?: TipoProyecto) => Promise<void>;
}

/** URL de un archivo de la biblioteca del tipo activo, respetando la base de Vite (GitHub Pages). */
export function urlBiblioteca(ruta: string, tipo: TipoProyecto = useBiblioteca.getState().tipo): string {
  return `${import.meta.env.BASE_URL}${carpetaBiblioteca(tipo)}/${ruta}`;
}

async function pedirJson(ruta: string, tipo: TipoProyecto): Promise<unknown> {
  const r = await fetch(urlBiblioteca(ruta, tipo));
  if (!r.ok) throw new Error(`No se pudo cargar ${carpetaBiblioteca(tipo)}/${ruta} (${r.status})`);
  return r.json();
}

const leidas = new Map<TipoProyecto, Biblioteca>();
let pedido: TipoProyecto = 'tablero';

export const useBiblioteca = create<EstadoBiblioteca>((set) => ({
  tipo: 'tablero',
  estado: 'cargando',
  biblioteca: null,
  error: null,
  cargar: async (tipo = 'tablero') => {
    pedido = tipo;
    const yaLeida = leidas.get(tipo);
    if (yaLeida) {
      set({ tipo, estado: 'lista', biblioteca: yaLeida, error: null });
      return;
    }
    // Mientras llega, no queda a la vista la biblioteca del otro tipo (sus piezas no existen en esta).
    set({ tipo, estado: 'cargando', biblioteca: null, error: null });
    try {
      const [catalogo, gabinetes] = await Promise.all([pedirJson('catalogo.json', tipo), pedirJson('gabinetes.json', tipo)]);
      const biblioteca = parsearBiblioteca(catalogo, gabinetes);
      leidas.set(tipo, biblioteca);
      if (pedido === tipo) set({ tipo, estado: 'lista', biblioteca, error: null });
    } catch (e) {
      if (pedido === tipo) set({ tipo, estado: 'error', biblioteca: null, error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
