import { create } from 'zustand';
import { parsearBiblioteca } from '../core/biblioteca';
import type { Biblioteca } from '../core/tipos';

/** URL de un archivo de la biblioteca, respetando la base de Vite (GitHub Pages). */
export function urlBiblioteca(ruta: string): string {
  return `${import.meta.env.BASE_URL}biblioteca/${ruta}`;
}

interface EstadoBiblioteca {
  estado: 'cargando' | 'lista' | 'error';
  biblioteca: Biblioteca | null;
  error: string | null;
  cargar: () => Promise<void>;
}

async function pedirJson(ruta: string): Promise<unknown> {
  const r = await fetch(urlBiblioteca(ruta));
  if (!r.ok) throw new Error(`No se pudo cargar ${ruta} (${r.status})`);
  return r.json();
}

export const useBiblioteca = create<EstadoBiblioteca>((set) => ({
  estado: 'cargando',
  biblioteca: null,
  error: null,
  cargar: async () => {
    try {
      const [catalogo, gabinetes] = await Promise.all([
        pedirJson('catalogo.json'),
        pedirJson('gabinetes.json'),
      ]);
      set({ estado: 'lista', biblioteca: parsearBiblioteca(catalogo, gabinetes), error: null });
    } catch (e) {
      set({ estado: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
