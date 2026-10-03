import type { Cambio, Contexto } from './colocacion';
import { nuevoUid } from './modelo';
import type { Circuito, Elemento } from './modelo';
import type { Componente } from './tipos';

const fallo = (motivo: string): { ok: false; motivo: string } => ({ ok: false, motivo });

/**
 * Un elemento de la categoría "Montaje" (riel DIN, canaleta o tope) no participa de la conexión
 * eléctrica: no puede alimentar a otro ni ser alimentado (son piezas de montaje, no aparatos).
 */
/** Las dos relaciones entre piezas: la de potencia (quién las alimenta) y la de mando (quién las acciona). */
export type Relacion = 'alimentadoPor' | 'accionadoPor';

export function puedeConectarse(comp: Componente): boolean {
  return comp.categoria !== 'Montaje';
}

/**
 * Cadena de padres de un elemento hasta la raíz (sin incluirlo a él mismo): [padre, abuelo, ...].
 * Se corta si encuentra un ciclo ya presente en los datos, en vez de colgarse.
 */
export function cadenaDePadres(elementos: readonly Elemento[], uid: string, relacion: Relacion = 'alimentadoPor'): Elemento[] {
  const porUid = new Map(elementos.map((e) => [e.uid, e]));
  const cadena: Elemento[] = [];
  const visitados = new Set<string>([uid]);
  let actual = porUid.get(uid);
  while (actual?.[relacion]) {
    const padre = porUid.get(actual[relacion] as string);
    if (!padre || visitados.has(padre.uid)) break;
    cadena.push(padre);
    visitados.add(padre.uid);
    actual = padre;
  }
  return cadena;
}

export const MOTIVOS_CONEXION = {
  simismo: 'Un elemento no puede alimentarse a sí mismo.',
  montaje: 'Un riel, una canaleta o un tope no pueden alimentar ni ser alimentados.',
  ciclo: 'Esa asignación crearía un ciclo (el elemento ya alimenta, directa o indirectamente, al que se quiere poner como padre).',
  noEncontrado: 'Elemento no encontrado.',
};

/** Cambia a quién alimenta un elemento (`alimentadoPor`); `null` lo deja sin padre. Valida ciclos y montaje. */
export function fijarAlimentadoPor(elementos: readonly Elemento[], ctx: Contexto, hijoUid: string, padreUid: string | null): Cambio {
  return fijarRelacion(elementos, ctx, hijoUid, padreUid, 'alimentadoPor');
}

/** Cambia quién acciona a un elemento (`accionadoPor`); `null` lo deja sin padre. Mismas validaciones, sobre su propia cadena. */
export function fijarAccionadoPor(elementos: readonly Elemento[], ctx: Contexto, hijoUid: string, padreUid: string | null): Cambio {
  return fijarRelacion(elementos, ctx, hijoUid, padreUid, 'accionadoPor');
}

function fijarRelacion(elementos: readonly Elemento[], ctx: Contexto, hijoUid: string, padreUid: string | null, relacion: Relacion): Cambio {
  const hijo = elementos.find((e) => e.uid === hijoUid);
  if (!hijo) return fallo(MOTIVOS_CONEXION.noEncontrado);
  if (padreUid === null) {
    if (hijo[relacion] === undefined) return { ok: true, elementos: [...elementos], uid: hijoUid };
    return {
      ok: true,
      elementos: elementos.map((e) => (e.uid === hijoUid ? quitarRelacion(e, relacion) : e)),
      uid: hijoUid,
    };
  }
  if (padreUid === hijoUid) return fallo(MOTIVOS_CONEXION.simismo);
  const padre = elementos.find((e) => e.uid === padreUid);
  if (!padre) return fallo(MOTIVOS_CONEXION.noEncontrado);
  const compHijo = ctx.comps.get(hijo.componenteId);
  const compPadre = ctx.comps.get(padre.componenteId);
  if (!compHijo || !compPadre) return fallo(MOTIVOS_CONEXION.noEncontrado);
  if (!puedeConectarse(compHijo) || !puedeConectarse(compPadre)) return fallo(MOTIVOS_CONEXION.montaje);
  if (cadenaDePadres(elementos, padreUid, relacion).some((a) => a.uid === hijoUid)) return fallo(MOTIVOS_CONEXION.ciclo);
  return {
    ok: true,
    elementos: elementos.map((e) => (e.uid === hijoUid ? { ...e, [relacion]: padreUid } : e)),
    uid: hijoUid,
  };
}

function quitarRelacion(e: Elemento, relacion: Relacion): Elemento {
  const resto = { ...e };
  delete resto[relacion];
  return resto;
}

/** Elementos que podrían alimentar (o accionar, según `relacion`) a `hijoUid`: cualquier otro que pueda conectarse y no genere un ciclo. */
export function candidatosPadre(elementos: readonly Elemento[], ctx: Contexto, hijoUid: string, relacion: Relacion = 'alimentadoPor'): Elemento[] {
  const hijo = elementos.find((e) => e.uid === hijoUid);
  const compHijo = hijo && ctx.comps.get(hijo.componenteId);
  if (!hijo || !compHijo || !puedeConectarse(compHijo)) return [];
  return elementos.filter((e) => {
    if (e.uid === hijoUid) return false;
    const comp = ctx.comps.get(e.componenteId);
    if (!comp || !puedeConectarse(comp)) return false;
    return !cadenaDePadres(elementos, e.uid, relacion).some((a) => a.uid === hijoUid);
  });
}

// ---------------------------------------------------------------- circuitos

export function agregarCircuito(circuitos: readonly Circuito[], numero: string, nombre: string): Circuito[] {
  return [...circuitos, { id: nuevoUid(), numero, nombre }];
}

export function renombrarCircuito(
  circuitos: readonly Circuito[],
  id: string,
  cambios: Partial<Pick<Circuito, 'numero' | 'nombre'>>,
): Circuito[] {
  return circuitos.map((c) => (c.id === id ? { ...c, ...cambios } : c));
}

/** Borra un circuito; los elementos que lo tenían asignado quedan sin circuito (no se borran). */
export function borrarCircuito(
  circuitos: readonly Circuito[],
  elementos: readonly Elemento[],
  id: string,
): { circuitos: Circuito[]; elementos: Elemento[] } {
  return {
    circuitos: circuitos.filter((c) => c.id !== id),
    elementos: elementos.map((e) => (e.circuitoId === id ? quitarCircuito(e) : e)),
  };
}

function quitarCircuito(e: Elemento): Elemento {
  const { circuitoId: _circuitoId, ...resto } = e;
  void _circuitoId;
  return resto;
}

/** Asigna (o reasigna) el circuito de un elemento; `null` lo deja sin circuito. */
export function asignarCircuito(elementos: readonly Elemento[], uid: string, circuitoId: string | null): Elemento[] {
  return elementos.map((e) => {
    if (e.uid !== uid) return e;
    return circuitoId === null ? quitarCircuito(e) : { ...e, circuitoId };
  });
}
