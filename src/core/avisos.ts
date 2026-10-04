import { buscarColision, calcularTopes, elementosFuera, listarPiezas, listarRieles } from './colocacion';
import { calcularOcupacion } from './ocupacion';
import type { Contexto } from './colocacion';
import type { Elemento } from './modelo';
import type { Sugerencia } from './sugerencia';

/** La caja se considera "mucho más grande" si su placa es al menos el doble (en área) que la sugerida. */
export const FACTOR_CAJA_GRANDE = 2;

export interface AvisoLista {
  id: string;
  texto: string;
}

/** Avisos no bloqueantes sobre el dibujo. */
export function calcularAvisos(elementos: readonly Elemento[], ctx: Contexto, sugerencia: Sugerencia | null): AvisoLista[] {
  const avisos: AvisoLista[] = [];

  const fuera = elementosFuera(elementos, ctx).size;
  if (fuera > 0) {
    avisos.push({
      id: 'fuera',
      texto: fuera === 1 ? '1 elemento queda fuera de la caja.' : `${fuera} elementos quedan fuera de la caja.`,
    });
  }

  // El editor no deja soltar una pieza sobre otra, pero un proyecto, plantilla o respaldo guardado puede traer piezas
  // superpuestas (p. ej. si el catálogo cambió una medida después de guardarlo): sin este aviso, la ocupación de riel
  // marcaría un porcentaje que no se explica con lo que se ve.
  const piezas = listarPiezas(elementos, ctx);
  const superpuestas = piezas.filter((p) => buscarColision(p, piezas, new Set([p.uid])) !== undefined).length;
  if (superpuestas > 0) {
    avisos.push({
      id: 'superpuestas',
      texto: `${superpuestas} ${superpuestas === 1 ? 'pieza se superpone' : 'piezas se superponen'} con otra. Si el proyecto se guardó antes de un cambio del catálogo, las medidas pueden haber cambiado: mueve o borra las piezas que chocan.`,
    });
  }
  const sinRiel = piezas.filter((p) => p.clase === 'aparato' && p.rielUid === undefined).length;
  if (sinRiel > 0) {
    avisos.push({
      id: 'sin-riel',
      texto: `${sinRiel} ${sinRiel === 1 ? 'aparato no está' : 'aparatos no están'} sobre ningún riel, así que no ${sinRiel === 1 ? 'cuenta' : 'cuentan'} en la ocupación. Muévelo${sinRiel === 1 ? '' : 's'} sobre un riel.`,
    });
  }

  // Fila que no cabe: mismos números que el indicador de ocupación (calcularOcupacion). En metálicas e inox la capacidad es el
  // largo real del riel; en las plásticas, los módulos por fila de la biblioteca. En un medidor no hay filas de riel.
  const numero = (n: number): string => String(Number(n.toFixed(1))).replace('.', ',');
  for (const f of calcularOcupacion(elementos, ctx)?.filas ?? []) {
    if (f.estado !== 'excede') continue;
    avisos.push({
      id: `fila:${f.uid}`,
      texto: ctx.capacidad
        ? `La fila ${f.numero} ocupa ${numero(f.modulos)} módulos y su riel de ${Math.round(f.largo)} mm admite ${numero(f.capacidad)}.`
        : `La fila ${f.numero} ocupa ${numero(f.modulos)} módulos y la caja admite ${numero(f.capacidad)} por fila.`,
    });
  }

  // Topes que no caben dentro del riel.
  const rieles = listarRieles(elementos, ctx);
  const topesFuera = calcularTopes(elementos, ctx).filter((t) => {
    const r = rieles.find((x) => x.uid === t.rielUid);
    return r ? t.rect.x < r.x - 0.01 || t.rect.x + t.rect.w > r.x + r.largo + 0.01 : false;
  }).length;
  if (topesFuera > 0) avisos.push({ id: 'topes', texto: 'Falta espacio en el riel para los topes de uno o más extremos.' });

  // Caja mucho más grande de lo necesario.
  if (sugerencia && !sugerencia.esLaActual && ctx.caja.permiteRieles) {
    const actual = ctx.caja.area.w * ctx.caja.area.h;
    const p = sugerencia.caja.placa;
    if (p && actual >= FACTOR_CAJA_GRANDE * p.ancho * p.alto) {
      avisos.push({ id: 'grande', texto: `La caja es mucho más grande de lo necesario: bastaría "${sugerencia.caja.nombre}".` });
    }
  }
  return avisos;
}
