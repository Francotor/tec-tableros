import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Proyecto } from '../core/modelo';
import type { Plantilla } from '../core/plantillas';
import { validarPlantilla } from '../core/plantillas';
import { validarProyecto } from '../core/proyectos';

// Bases separadas: idb-keyval no permite varios almacenes en una misma base ya creada.
const proyectos = createStore('tec-tableros', 'proyectos');
const ajustes = createStore('tec-tableros-ajustes', 'ajustes');
const plantillasDB = createStore('tec-tableros-plantillas', 'plantillas');
const CLAVE_ACTUAL = 'proyecto-actual';

export async function guardarProyecto(p: Proyecto): Promise<void> {
  await set(p.id, p, proyectos);
}

export async function leerProyecto(id: string): Promise<Proyecto | null> {
  const dato = await get<unknown>(id, proyectos);
  if (dato === undefined) return null;
  try {
    return validarProyecto(dato);
  } catch {
    return null;
  }
}

/** Todos los proyectos guardados, del más reciente al más antiguo. Los dañados se omiten. */
export async function listarProyectos(): Promise<Proyecto[]> {
  const ids = await keys<string>(proyectos);
  const lista: Proyecto[] = [];
  for (const id of ids) {
    const p = await leerProyecto(id);
    if (p) lista.push(p);
  }
  return lista.sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
}

export async function borrarProyecto(id: string): Promise<void> {
  await del(id, proyectos);
}

export async function leerIdActual(): Promise<string | null> {
  return (await get<string>(CLAVE_ACTUAL, ajustes)) ?? null;
}

export async function fijarIdActual(id: string): Promise<void> {
  await set(CLAVE_ACTUAL, id, ajustes);
}

export async function guardarPlantilla(p: Plantilla): Promise<void> {
  await set(p.id, p, plantillasDB);
}

export async function leerPlantilla(id: string): Promise<Plantilla | null> {
  const dato = await get<unknown>(id, plantillasDB);
  if (dato === undefined) return null;
  try {
    return validarPlantilla(dato);
  } catch {
    return null;
  }
}

/** Todas las plantillas guardadas, de la más reciente a la más antigua. Las dañadas se omiten. */
export async function listarPlantillas(): Promise<Plantilla[]> {
  const ids = await keys<string>(plantillasDB);
  const lista: Plantilla[] = [];
  for (const id of ids) {
    const p = await leerPlantilla(id);
    if (p) lista.push(p);
  }
  return lista.sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
}

export async function borrarPlantilla(id: string): Promise<void> {
  await del(id, plantillasDB);
}

/** Pide al navegador que no borre los datos del sitio por falta de espacio (mejor esfuerzo). */
export async function pedirAlmacenamientoPersistente(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* sin soporte: no pasa nada */
  }
}
