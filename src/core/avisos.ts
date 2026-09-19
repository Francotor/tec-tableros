import { calcularTopes, elementosFuera, listarPiezas, listarRieles } from './colocacion';
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

  // Fila que excede los módulos de la caja.
  const modulo = ctx.comps.get('automatico_1p')?.ancho_mm ?? 18;
  const piezas = listarPiezas(elementos, ctx).filter((p) => p.clase === 'aparato');
  const rieles = listarRieles(elementos, ctx);
  rieles.forEach((r, i) => {
    const mm = piezas.filter((p) => p.rielUid === r.uid).reduce((s, p) => s + p.rect.w, 0);
    const modulos = mm / modulo;
    if (modulos > ctx.caja.modulosPorFila + 1e-9) {
      avisos.push({
        id: `fila:${r.uid}`,
        texto: `La fila ${i + 1} ocupa ${Math.ceil(modulos)} módulos y la caja admite ${ctx.caja.modulosPorFila} por fila.`,
      });
    }
  });

  // Topes que no caben dentro del riel.
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
