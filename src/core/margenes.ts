import { margenesPorDefecto } from './capacidad';
import type { Margenes } from './capacidad';
import type { CajaProyecto, Proyecto } from './modelo';
import type { Caja, Gabinetes } from './tipos';

export function cajaJsonDe(caja: CajaProyecto, gabinetes: Gabinetes): Caja | null {
  return 'id' in caja ? (gabinetes.cajas.find((c) => c.id === caja.id) ?? null) : null;
}

/**
 * Márgenes efectivos para el proyecto: el que el usuario fijó a mano si lo hay, si no el de la
 * caja actual (caja.layout o el general). Se recalcula solo; no hace falta "resetear" al cambiar
 * de caja, porque cuando no está fijado a mano siempre se deriva de la caja de turno.
 */
export function margenesEfectivos(
  proyecto: Pick<Proyecto, 'margenBordeManual' | 'margenBorde_mm'>,
  caja: CajaProyecto,
  gabinetes: Gabinetes,
): Margenes {
  if (proyecto.margenBordeManual && proyecto.margenBorde_mm !== null) {
    return { lateral: proyecto.margenBorde_mm, vertical: proyecto.margenBorde_mm };
  }
  return margenesPorDefecto(cajaJsonDe(caja, gabinetes)?.layout, gabinetes.parametros.layout);
}

/** Valor único que se muestra en el campo "Margen de borde (mm)" cuando no ha sido editado a mano. */
export function margenBordePorDefecto(caja: CajaProyecto, gabinetes: Gabinetes): number {
  return margenesPorDefecto(cajaJsonDe(caja, gabinetes)?.layout, gabinetes.parametros.layout).lateral;
}
