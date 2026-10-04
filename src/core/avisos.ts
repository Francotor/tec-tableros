import { calcularTopes, elementosFuera, listarRieles } from './colocacion';
import { filasDeRiel } from './ocupacion';
import type { Contexto } from './colocacion';
import type { Elemento } from './modelo';
import { usaCapacidadDeRiel } from './tipoProyecto';
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

  // Fila que excede los módulos de la caja: metálicas/inox usan la capacidad dinámica
  // (margen, modo y sección de canaleta del proyecto); las plásticas, su valor fijo.
  const limiteModulos = ctx.capacidad ? ctx.capacidad.modulosPorFila : ctx.caja.modulosPorFila;
  // La capacidad por fila es del riel DIN de los tableros: en un medidor no hay filas que comparar.
  const filasConLimite = usaCapacidadDeRiel(ctx.tipo) ? filasDeRiel(elementos, ctx) : [];
  for (const f of filasConLimite) {
    if (f.modulos > limiteModulos + 1e-9) {
      avisos.push({
        id: `fila:${f.uid}`,
        // Metálicas e inox: el límite depende del margen, el modo y la sección de canaleta del proyecto, no es físico. Las plásticas tienen un valor fijo.
        texto: ctx.capacidad
          ? `La fila ${f.numero} ocupa ${Math.ceil(f.modulos)} módulos; con el margen y el modo actuales entran ${limiteModulos} por fila.`
          : `La fila ${f.numero} ocupa ${Math.ceil(f.modulos)} módulos y la caja admite ${limiteModulos} por fila.`,
      });
    }
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
