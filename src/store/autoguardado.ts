import { create } from 'zustand';
import { duplicarProyecto } from '../core/proyectos';
import type { Proyecto } from '../core/modelo';
import { plantillaDesdeProyecto, proyectoDesdePlantilla, renombrarPlantilla } from '../core/plantillas';
import { useEditor } from './editor';
import {
  borrarPlantilla,
  borrarProyecto,
  fijarIdActual,
  guardarPlantilla,
  guardarProyecto,
  leerIdActual,
  leerPlantilla,
  leerProyecto,
  pedirAlmacenamientoPersistente,
} from './persistencia';

/** Espera tras el último cambio antes de guardar. */
export const ESPERA_AUTOGUARDADO_MS = 1000;

interface EstadoGuardado {
  estado: 'guardado' | 'pendiente' | 'error';
  /** Cambia cada vez que la lista de proyectos guardados puede haber cambiado. */
  version: number;
}

export const useEstadoGuardado = create<EstadoGuardado>(() => ({ estado: 'guardado', version: 0 }));

const marcarVersion = (): void => useEstadoGuardado.setState((s) => ({ version: s.version + 1 }));

let temporizador: ReturnType<typeof setTimeout> | null = null;
// Última versión del proyecto que ya está en disco (o que se cargó desde disco / es nueva y vacía).
let idGuardado = '';
let marcaGuardada = '';

function marcar(p: Proyecto): void {
  idGuardado = p.id;
  marcaGuardada = p.actualizadoEn;
}

const hayCambios = (p: Proyecto): boolean => p.id !== idGuardado || p.actualizadoEn !== marcaGuardada;

/** Guarda ya el proyecto abierto si tiene cambios sin guardar. */
export async function guardarAhora(): Promise<void> {
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  const p = useEditor.getState().proyecto;
  if (!hayCambios(p)) {
    useEstadoGuardado.setState({ estado: 'guardado' });
    return;
  }
  try {
    await guardarProyecto(p);
    await fijarIdActual(p.id);
    marcar(p);
    useEstadoGuardado.setState({ estado: 'guardado' });
    marcarVersion();
  } catch (e) {
    console.error('No se pudo guardar el proyecto', e);
    useEstadoGuardado.setState({ estado: 'error' });
  }
}

/** Guarda automáticamente 1 s después del último cambio. Devuelve la función que lo detiene. */
export function iniciarAutoguardado(): () => void {
  const alCambiar = (): void => {
    if (!hayCambios(useEditor.getState().proyecto)) return;
    useEstadoGuardado.setState({ estado: 'pendiente' });
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => void guardarAhora(), ESPERA_AUTOGUARDADO_MS);
  };
  const desuscribir = useEditor.subscribe((estado, previo) => {
    if (estado.proyecto !== previo.proyecto) alCambiar();
  });
  // Si se cierra o se oculta la pestaña dentro de la espera, se guarda de inmediato.
  const alOcultar = (): void => {
    if (document.visibilityState === 'hidden') void guardarAhora();
  };
  const alSalir = (): void => void guardarAhora();
  document.addEventListener('visibilitychange', alOcultar);
  window.addEventListener('pagehide', alSalir);
  return () => {
    desuscribir();
    document.removeEventListener('visibilitychange', alOcultar);
    window.removeEventListener('pagehide', alSalir);
  };
}

/** Recupera el último proyecto abierto (si existe) y pide almacenamiento persistente. */
export async function iniciarSesion(): Promise<void> {
  void pedirAlmacenamientoPersistente();
  const editor = useEditor.getState();
  marcar(editor.proyecto); // el proyecto vacío inicial no se guarda hasta que se edite
  try {
    const id = await leerIdActual();
    const p = id ? await leerProyecto(id) : null;
    if (p) {
      editor.cargarProyecto(p);
      marcar(p);
    }
  } catch (e) {
    console.error('No se pudo recuperar el proyecto anterior', e);
  }
}

export async function abrirProyecto(id: string): Promise<boolean> {
  await guardarAhora();
  const p = await leerProyecto(id);
  if (!p) return false;
  useEditor.getState().cargarProyecto(p);
  marcar(p);
  await fijarIdActual(p.id);
  useEstadoGuardado.setState({ estado: 'guardado' });
  return true;
}

export async function crearProyectoNuevo(): Promise<void> {
  await guardarAhora();
  useEditor.getState().nuevoProyecto();
  marcar(useEditor.getState().proyecto); // vacío: se guarda al primer cambio
  useEstadoGuardado.setState({ estado: 'guardado' });
}

export async function duplicarProyectoGuardado(id: string): Promise<void> {
  await guardarAhora();
  const p = await leerProyecto(id);
  if (!p) return;
  await guardarProyecto(duplicarProyecto(p));
  marcarVersion();
}

/** "Guardar como plantilla": copia el layout actual (sin N° de cotización ni notas) con un nombre. */
export async function guardarComoPlantilla(nombre: string): Promise<void> {
  const plantilla = plantillaDesdeProyecto(useEditor.getState().proyecto, nombre);
  await guardarPlantilla(plantilla);
  marcarVersion();
}

export async function renombrarPlantillaGuardada(id: string, nombre: string): Promise<boolean> {
  const p = await leerPlantilla(id);
  if (!p) return false;
  await guardarPlantilla(renombrarPlantilla(p, nombre));
  marcarVersion();
  return true;
}

export async function eliminarPlantilla(id: string): Promise<void> {
  await borrarPlantilla(id);
  marcarVersion();
}

/** "Nuevo desde plantilla": abre un proyecto nuevo con el layout de la plantilla. */
export async function crearProyectoDesdePlantilla(plantillaId: string): Promise<boolean> {
  await guardarAhora();
  const plantilla = await leerPlantilla(plantillaId);
  if (!plantilla) return false;
  const nuevo = proyectoDesdePlantilla(plantilla);
  // A diferencia de abrirProyecto, este proyecto no existe todavía en IndexedDB: hay que
  // guardarlo ya (no basta con "marcarlo" como guardado) para no perderlo si no se edita nada.
  await guardarProyecto(nuevo);
  await fijarIdActual(nuevo.id);
  useEditor.getState().cargarProyecto(nuevo);
  marcar(nuevo);
  useEstadoGuardado.setState({ estado: 'guardado' });
  marcarVersion();
  return true;
}

export async function eliminarProyecto(id: string): Promise<void> {
  const eraElActual = useEditor.getState().proyecto.id === id;
  if (temporizador && eraElActual) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  await borrarProyecto(id);
  if (eraElActual) {
    useEditor.getState().nuevoProyecto();
    marcar(useEditor.getState().proyecto);
    useEstadoGuardado.setState({ estado: 'guardado' });
  }
  marcarVersion();
}
