import { useMemo } from 'react';
import { create } from 'zustand';
import { resolverCaja } from '../core/caja';
import type { CajaResuelta } from '../core/caja';
import {
  agregarElemento,
  borrarElemento,
  cambiarLargo as cambiarLargoCore,
  crearContexto,
  duplicarElemento,
  moverElemento,
  rotarElemento,
} from '../core/colocacion';
import type { Cambio, Contexto } from '../core/colocacion';
import type { Punto } from '../core/geometria';
import { trasladar } from '../core/sugerencia';
import { deshacer as deshacerH, historialVacio, rehacer as rehacerH, registrar } from '../core/historial';
import type { Historial } from '../core/historial';
import { proyectoNuevo, valoresPorDefecto } from '../core/modelo';
import type { CajaProyecto, Elemento, Proyecto } from '../core/modelo';
import type { Biblioteca, ValorCampo } from '../core/tipos';
import { useBiblioteca } from './biblioteca';

const CAJA_INICIAL = 'caja_metalica_400x500x200';

interface Instantanea {
  caja: CajaProyecto;
  elementos: Elemento[];
}

export interface Aviso {
  id: number;
  texto: string;
  tipo: 'error' | 'info';
}

interface EstadoEditor {
  proyecto: Proyecto;
  historial: Historial<Instantanea>;
  seleccion: string | null;
  aviso: Aviso | null;
  /** Ficha elegida en el panel para colocarla con un toque en el canvas (tabletas). */
  fichaActiva: string | null;
  cuadricula: boolean;

  seleccionar: (uid: string | null) => void;
  setFichaActiva: (id: string | null) => void;
  alternarCuadricula: () => void;
  avisar: (texto: string, tipo?: Aviso['tipo']) => void;
  cerrarAviso: () => void;

  cambiarCaja: (caja: CajaProyecto) => void;
  /** Reemplaza el proyecto abierto (historial y selección se reinician). */
  cargarProyecto: (p: Proyecto) => void;
  nuevoProyecto: () => void;
  setMeta: (meta: Partial<Pick<Proyecto, 'nombre' | 'numeroCotizacion' | 'notas'>>) => void;
  /** Cambia a una caja de la lista y traslada el dibujo a su placa, en un solo paso de historial. */
  aplicarSugerencia: (cajaId: string, dx: number, dy: number) => void;
  agregar: (componenteId: string, punto: Punto) => boolean;
  mover: (uid: string, punto: Punto, sinSnap?: boolean) => boolean;
  borrar: (uid: string) => void;
  duplicar: (uid: string) => void;
  rotar: (uid: string) => void;
  cambiarLargo: (uid: string, largo: number) => boolean;
  cambiarValor: (uid: string, campoId: string, valor: ValorCampo) => void;
  deshacer: () => void;
  rehacer: () => void;
}

/** Contexto de reglas para el proyecto actual; null si la biblioteca aún no carga. */
export function contextoDe(biblioteca: Biblioteca | null, caja: CajaProyecto): Contexto | null {
  if (!biblioteca) return null;
  const resuelta: CajaResuelta | null =
    resolverCaja(caja, biblioteca.gabinetes) ??
    (biblioteca.gabinetes.cajas[0] ? resolverCaja({ id: biblioteca.gabinetes.cajas[0].id }, biblioteca.gabinetes) : null);
  return resuelta ? crearContexto(biblioteca.catalogo, resuelta) : null;
}

/** Contexto del proyecto actual, leído fuera de React (manejadores de eventos). */
export function contextoActual(): Contexto | null {
  return contextoDe(useBiblioteca.getState().biblioteca, useEditor.getState().proyecto.caja);
}

export function useContexto(): Contexto | null {
  const biblioteca = useBiblioteca((s) => s.biblioteca);
  const caja = useEditor((s) => s.proyecto.caja);
  return useMemo(() => contextoDe(biblioteca, caja), [biblioteca, caja]);
}

let contadorAvisos = 0;
/** Campo que se está editando: las ediciones seguidas del mismo campo son un solo paso de historial. */
let edicionActual: string | null = null;

export const useEditor = create<EstadoEditor>((set, get) => {
  const contexto = (): Contexto | null => contextoDe(useBiblioteca.getState().biblioteca, get().proyecto.caja);

  const instantanea = (): Instantanea => ({ caja: get().proyecto.caja, elementos: get().proyecto.elementos });

  const avisar = (texto: string, tipo: Aviso['tipo'] = 'error'): void => set({ aviso: { id: ++contadorAvisos, texto, tipo } });

  /** Aplica un cambio de elementos al proyecto, registrando el paso en el historial. */
  const aplicar = (c: Cambio, seleccion?: string | null): boolean => {
    if (!c.ok) {
      avisar(c.motivo);
      return false;
    }
    edicionActual = null;
    const { proyecto, historial } = get();
    if (JSON.stringify(c.elementos) === JSON.stringify(proyecto.elementos)) return true;
    set({
      historial: registrar(historial, instantanea()),
      proyecto: { ...proyecto, elementos: c.elementos, actualizadoEn: new Date().toISOString() },
      seleccion: seleccion === undefined ? get().seleccion : seleccion,
    });
    return true;
  };

  const restaurar = (i: Instantanea, historial: Historial<Instantanea>): void => {
    edicionActual = null;
    const { proyecto, seleccion } = get();
    set({
      historial,
      proyecto: { ...proyecto, caja: i.caja, elementos: i.elementos, actualizadoEn: new Date().toISOString() },
      seleccion: i.elementos.some((e) => e.uid === seleccion) ? seleccion : null,
    });
  };

  return {
    proyecto: proyectoNuevo(CAJA_INICIAL),
    historial: historialVacio(),
    seleccion: null,
    aviso: null,
    fichaActiva: null,
    cuadricula: true,

    seleccionar: (uid) => {
      edicionActual = null;
      set({ seleccion: uid });
    },
    setFichaActiva: (id) => set({ fichaActiva: id }),
    alternarCuadricula: () => set((s) => ({ cuadricula: !s.cuadricula })),
    avisar,
    cerrarAviso: () => set({ aviso: null }),

    cambiarCaja: (caja) => {
      const { proyecto, historial } = get();
      if (JSON.stringify(caja) === JSON.stringify(proyecto.caja)) return;
      edicionActual = null;
      // Se conservan todos los elementos: los que ya no caben se marcan en rojo, no se borran.
      set({
        historial: registrar(historial, instantanea()),
        proyecto: { ...proyecto, caja, actualizadoEn: new Date().toISOString() },
      });
    },

    cargarProyecto: (p) => {
      edicionActual = null;
      set({ proyecto: p, historial: historialVacio(), seleccion: null, fichaActiva: null, aviso: null });
    },

    nuevoProyecto: () => {
      edicionActual = null;
      set({ proyecto: proyectoNuevo(CAJA_INICIAL), historial: historialVacio(), seleccion: null, fichaActiva: null, aviso: null });
    },

    setMeta: (meta) => {
      const { proyecto } = get();
      set({ proyecto: { ...proyecto, ...meta, actualizadoEn: new Date().toISOString() } });
    },

    aplicarSugerencia: (cajaId, dx, dy) => {
      const { proyecto, historial } = get();
      edicionActual = null;
      set({
        historial: registrar(historial, instantanea()),
        proyecto: { ...proyecto, caja: { id: cajaId }, elementos: trasladar(proyecto.elementos, dx, dy), actualizadoEn: new Date().toISOString() },
      });
    },

    agregar: (componenteId, punto) => {
      const ctx = contexto();
      const comp = ctx?.comps.get(componenteId);
      if (!ctx || !comp) return false;
      const c = agregarElemento(get().proyecto.elementos, ctx, componenteId, punto, valoresPorDefecto(comp));
      return aplicar(c, c.ok ? (c.uid ?? null) : undefined);
    },

    mover: (uid, punto, sinSnap = false) => {
      const ctx = contexto();
      return ctx ? aplicar(moverElemento(get().proyecto.elementos, ctx, uid, punto, { sinSnap })) : false;
    },

    borrar: (uid) => {
      const ctx = contexto();
      if (ctx) aplicar(borrarElemento(get().proyecto.elementos, ctx, uid), null);
    },

    duplicar: (uid) => {
      const ctx = contexto();
      if (!ctx) return;
      const c = duplicarElemento(get().proyecto.elementos, ctx, uid);
      aplicar(c, c.ok ? (c.uid ?? null) : undefined);
    },

    rotar: (uid) => {
      const ctx = contexto();
      if (ctx) aplicar(rotarElemento(get().proyecto.elementos, ctx, uid));
    },

    cambiarLargo: (uid, largo) => {
      const ctx = contexto();
      return ctx ? aplicar(cambiarLargoCore(get().proyecto.elementos, ctx, uid, largo)) : false;
    },

    cambiarValor: (uid, campoId, valor) => {
      const { proyecto, historial } = get();
      const el = proyecto.elementos.find((e) => e.uid === uid);
      if (!el || el.valores[campoId] === valor) return;
      const clave = `${uid}:${campoId}`;
      const seguida = edicionActual === clave;
      edicionActual = clave;
      set({
        historial: seguida ? historial : registrar(historial, instantanea()),
        proyecto: {
          ...proyecto,
          elementos: proyecto.elementos.map((e) => (e.uid === uid ? { ...e, valores: { ...e.valores, [campoId]: valor } } : e)),
          actualizadoEn: new Date().toISOString(),
        },
      });
    },

    deshacer: () => {
      const r = deshacerH(get().historial, instantanea());
      if (r) restaurar(r.estado, r.historial);
    },

    rehacer: () => {
      const r = rehacerH(get().historial, instantanea());
      if (r) restaurar(r.estado, r.historial);
    },
  };
});
