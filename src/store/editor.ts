import { useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { resolverCaja } from '../core/caja';
import type { CajaResuelta } from '../core/caja';
import type { Modo, SeccionCanaleta } from '../core/capacidad';
import {
  agregarElemento,
  borrarElemento,
  cambiarLargo as cambiarLargoCore,
  cambiarLargoDesdeExtremo,
  crearContexto,
  duplicarElemento,
  extenderAAreaUtil,
  moverElemento,
  moverX as moverXCore,
  rotarElemento,
} from '../core/colocacion';
import type { Cambio, Contexto, Extremo } from '../core/colocacion';
import {
  agregarCircuito as agregarCircuitoCore,
  asignarCircuito as asignarCircuitoCore,
  borrarCircuito as borrarCircuitoCore,
  fijarAlimentadoPor,
  renombrarCircuito as renombrarCircuitoCore,
} from '../core/conexion';
import type { Punto } from '../core/geometria';
import { margenesEfectivos } from '../core/margenes';
import { distribuirAutomaticamente as distribuirCore } from '../core/distribucion';
import { trasladar } from '../core/sugerencia';
import { deshacer as deshacerH, historialVacio, rehacer as rehacerH, registrar } from '../core/historial';
import type { Historial } from '../core/historial';
import { proyectoNuevo, valoresPorDefecto } from '../core/modelo';
import type { CajaProyecto, Circuito, Elemento, Proyecto } from '../core/modelo';
import type { Biblioteca, ValorCampo } from '../core/tipos';
import { useBiblioteca } from './biblioteca';

/** Subconjunto del proyecto del que depende el contexto de reglas (caja, margen, modo, sección de canaleta). */
type AjustesProyecto = Pick<Proyecto, 'caja' | 'margenBordeManual' | 'margenBorde_mm' | 'modo' | 'seccionCanaleta_mm' | 'topesAutomaticos'>;

const CAJA_INICIAL = 'caja_metalica_400x500x200';

interface Instantanea {
  caja: CajaProyecto;
  elementos: Elemento[];
  circuitos: Circuito[];
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
  /** Fija el margen de borde a mano; deja de seguir al de la caja hasta que se cambie de caja. */
  setMargenBorde: (mm: number) => void;
  setModo: (modo: Modo) => void;
  setSeccionCanaleta: (mm: SeccionCanaleta) => void;
  /** Activa o desactiva los topes de riel automáticos del proyecto (ajuste del proyecto, no entra en el historial). */
  setTopes: (activos: boolean) => void;
  /** Cambia a una caja de la lista y traslada el dibujo a su placa, en un solo paso de historial. */
  aplicarSugerencia: (cajaId: string, dx: number, dy: number) => void;
  agregar: (componenteId: string, punto: Punto) => boolean;
  mover: (uid: string, punto: Punto, sinSnap?: boolean) => boolean;
  borrar: (uid: string) => void;
  duplicar: (uid: string) => void;
  rotar: (uid: string) => void;
  cambiarLargo: (uid: string, largo: number) => boolean;
  /** Cambia el largo moviendo un solo extremo del lineal; el otro queda fijo. */
  cambiarLargoDesdeExtremo: (uid: string, extremo: Extremo, coordenada: number) => boolean;
  /** Extiende un lineal hasta el obstáculo más cercano a cada lado (borde de la placa con margen, o canaleta perpendicular). */
  extender: (uid: string) => boolean;
  /** Mueve un lineal a una nueva X, conservando su Y. */
  moverX: (uid: string, nuevoX: number) => boolean;
  /** Reemplaza rieles y canaletas por la distribución automática y reubica los aparatos; todo o nada. */
  distribuirAutomaticamente: () => boolean;
  cambiarValor: (uid: string, campoId: string, valor: ValorCampo) => void;
  /** Fija (o, con null, quita) quién alimenta a un elemento. Valida ciclos y montaje. */
  alimentarDesde: (hijoUid: string, padreUid: string | null) => boolean;
  /** Crea un circuito y devuelve su id. */
  crearCircuito: (numero: string, nombre: string) => string;
  renombrarCircuito: (id: string, cambios: Partial<Pick<Circuito, 'numero' | 'nombre'>>) => void;
  /** Borra un circuito; los elementos que lo tenían asignado quedan sin circuito. */
  borrarCircuito: (id: string) => void;
  asignarCircuito: (uid: string, circuitoId: string | null) => void;
  deshacer: () => void;
  rehacer: () => void;
}

/** Contexto de reglas para el proyecto actual; null si la biblioteca aún no carga. */
export function contextoDe(biblioteca: Biblioteca | null, ajustes: AjustesProyecto): Contexto | null {
  if (!biblioteca) return null;
  const resuelta: CajaResuelta | null =
    resolverCaja(ajustes.caja, biblioteca.gabinetes) ??
    (biblioteca.gabinetes.cajas[0] ? resolverCaja({ id: biblioteca.gabinetes.cajas[0].id }, biblioteca.gabinetes) : null);
  if (!resuelta) return null;
  const { parametros } = biblioteca.gabinetes;
  return crearContexto(biblioteca.catalogo, resuelta, {
    margenes: margenesEfectivos(ajustes, ajustes.caja, biblioteca.gabinetes),
    modo: ajustes.modo,
    seccionCanaleta: ajustes.seccionCanaleta_mm,
    parametrosLayout: parametros.layout,
    moduloMm: parametros.modulo_mm,
    altoModularMm: parametros.alto_modular_mm,
    topes: ajustes.topesAutomaticos,
  });
}

/** Contexto del proyecto actual, leído fuera de React (manejadores de eventos). */
export function contextoActual(): Contexto | null {
  return contextoDe(useBiblioteca.getState().biblioteca, useEditor.getState().proyecto);
}

export function useContexto(): Contexto | null {
  const biblioteca = useBiblioteca((s) => s.biblioteca);
  const ajustes = useEditor(
    useShallow((s): AjustesProyecto => ({
      caja: s.proyecto.caja,
      margenBordeManual: s.proyecto.margenBordeManual,
      margenBorde_mm: s.proyecto.margenBorde_mm,
      modo: s.proyecto.modo,
      seccionCanaleta_mm: s.proyecto.seccionCanaleta_mm,
      topesAutomaticos: s.proyecto.topesAutomaticos,
    })),
  );
  return useMemo(() => contextoDe(biblioteca, ajustes), [biblioteca, ajustes]);
}

let contadorAvisos = 0;
/** Campo que se está editando: las ediciones seguidas del mismo campo son un solo paso de historial. */
let edicionActual: string | null = null;

export const useEditor = create<EstadoEditor>((set, get) => {
  const contexto = (): Contexto | null => contextoDe(useBiblioteca.getState().biblioteca, get().proyecto);

  const instantanea = (): Instantanea => ({
    caja: get().proyecto.caja,
    elementos: get().proyecto.elementos,
    circuitos: get().proyecto.circuitos,
  });

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
      proyecto: { ...proyecto, caja: i.caja, elementos: i.elementos, circuitos: i.circuitos, actualizadoEn: new Date().toISOString() },
      seleccion: i.elementos.some((e) => e.uid === seleccion) ? seleccion : null,
    });
  };

  /** Igual que `aplicar`, pero para cambios que tocan `elementos` y `circuitos` a la vez. */
  const aplicarConCircuitos = (elementos: Elemento[], circuitos: Circuito[]): void => {
    edicionActual = null;
    const { proyecto, historial } = get();
    set({
      historial: registrar(historial, instantanea()),
      proyecto: { ...proyecto, elementos, circuitos, actualizadoEn: new Date().toISOString() },
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

    // El margen, el modo y la sección de canaleta son ajustes del proyecto, no pasos del dibujo:
    // igual que setMeta, no entran en el historial de deshacer/rehacer.
    setMargenBorde: (mm) => {
      const { proyecto } = get();
      if (proyecto.margenBordeManual && proyecto.margenBorde_mm === mm) return;
      set({ proyecto: { ...proyecto, margenBordeManual: true, margenBorde_mm: mm, actualizadoEn: new Date().toISOString() } });
    },

    setModo: (modo) => {
      const { proyecto } = get();
      if (proyecto.modo === modo) return;
      set({ proyecto: { ...proyecto, modo, actualizadoEn: new Date().toISOString() } });
    },

    setSeccionCanaleta: (mm) => {
      const { proyecto } = get();
      if (proyecto.seccionCanaleta_mm === mm) return;
      set({ proyecto: { ...proyecto, seccionCanaleta_mm: mm, actualizadoEn: new Date().toISOString() } });
    },

    setTopes: (activos) => {
      const { proyecto } = get();
      if (proyecto.topesAutomaticos === activos) return;
      set({ proyecto: { ...proyecto, topesAutomaticos: activos, actualizadoEn: new Date().toISOString() } });
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

    cambiarLargoDesdeExtremo: (uid, extremo, coordenada) => {
      const ctx = contexto();
      return ctx ? aplicar(cambiarLargoDesdeExtremo(get().proyecto.elementos, ctx, uid, extremo, coordenada)) : false;
    },

    distribuirAutomaticamente: () => {
      const ctx = contexto();
      return ctx ? aplicar(distribuirCore(get().proyecto.elementos, ctx), null) : false;
    },

    extender: (uid) => {
      const ctx = contexto();
      return ctx ? aplicar(extenderAAreaUtil(get().proyecto.elementos, ctx, uid)) : false;
    },

    moverX: (uid, nuevoX) => {
      const ctx = contexto();
      return ctx ? aplicar(moverXCore(get().proyecto.elementos, ctx, uid, nuevoX)) : false;
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

    alimentarDesde: (hijoUid, padreUid) => {
      const ctx = contexto();
      return ctx ? aplicar(fijarAlimentadoPor(get().proyecto.elementos, ctx, hijoUid, padreUid)) : false;
    },

    crearCircuito: (numero, nombre) => {
      const { proyecto } = get();
      const circuitos = agregarCircuitoCore(proyecto.circuitos, numero, nombre);
      aplicarConCircuitos(proyecto.elementos, circuitos);
      return circuitos[circuitos.length - 1]!.id;
    },

    renombrarCircuito: (id, cambios) => {
      const { proyecto } = get();
      aplicarConCircuitos(proyecto.elementos, renombrarCircuitoCore(proyecto.circuitos, id, cambios));
    },

    borrarCircuito: (id) => {
      const { proyecto } = get();
      const r = borrarCircuitoCore(proyecto.circuitos, proyecto.elementos, id);
      aplicarConCircuitos(r.elementos, r.circuitos);
    },

    asignarCircuito: (uid, circuitoId) => {
      const { proyecto } = get();
      aplicarConCircuitos(asignarCircuitoCore(proyecto.elementos, uid, circuitoId), proyecto.circuitos);
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
