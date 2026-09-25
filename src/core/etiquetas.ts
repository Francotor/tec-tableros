import type { Elemento } from './modelo';
import type { Campo, Componente, ValorCampo } from './tipos';

/** Valores con los que se completan las plantillas: atributos, defectos de los campos y lo editado. */
export function valoresEfectivos(comp: Componente, el: Pick<Elemento, 'valores' | 'largo_mm'>): Record<string, ValorCampo> {
  const v: Record<string, ValorCampo> = { ...comp.atributos };
  for (const c of comp.campos) v[c.id] = c.defecto;
  Object.assign(v, el.valores);
  if (el.largo_mm !== undefined) v.largo = el.largo_mm;
  return v;
}

/** Reemplaza cada {campo} por su valor. Un campo que no existe queda vacío; nunca lanza. */
export function expandirPlantilla(plantilla: string, valores: Record<string, ValorCampo>): string {
  return plantilla.replace(/\{([^{}]*)\}/g, (_, id: string) => {
    const v = valores[id.trim()];
    return v === undefined ? '' : String(v);
  });
}

/** Líneas de la etiqueta de un elemento, sin las que quedan vacías. */
export function lineasEtiqueta(comp: Componente, el: Pick<Elemento, 'valores' | 'largo_mm'>): string[] {
  if (!('etiqueta' in comp) || !comp.etiqueta) return [];
  const v = valoresEfectivos(comp, el);
  return comp.etiqueta.lineas.map((l) => expandirPlantilla(l, v).trim()).filter((l) => l !== '');
}

/**
 * Texto que identifica a un elemento entre otros iguales: nombre, "N°" si su ficha tiene numeración (campo
 * "indice") y, entre paréntesis, el resto de su rótulo. Ej.: "Interruptor automatico 1P N°3 (C16)".
 */
export function descripcionElemento(comp: Componente, el: Pick<Elemento, 'valores' | 'largo_mm'>): string {
  const v = valoresEfectivos(comp, el);
  const numerado = comp.campos.some((c) => c.id === 'indice');
  const base = numerado && v.indice !== undefined ? `${comp.nombre} N°${v.indice}` : comp.nombre;
  const etiqueta = 'etiqueta' in comp ? comp.etiqueta : null;
  // El número ya va en el nombre (se quita la palabra del rótulo que lo lleva, p. ej. "Q{indice}") y la cantidad
  // de polos ("2P") también: el nombre ya la dice.
  const detalle = (etiqueta?.lineas ?? [])
    .map((l) => expandirPlantilla(l.replace(/\S*\{indice\}\S*/g, ''), v).trim())
    .filter((l) => l !== '' && !/^\d+P$/.test(l));
  return detalle.length > 0 ? `${base} (${detalle.join(', ')})` : base;
}

/** Convierte lo escrito en un campo al valor que guarda el elemento; null si no es válido. */
export function interpretarValor(campo: Campo, texto: string): ValorCampo | null {
  if (campo.tipo === 'texto') return texto;
  if (campo.tipo === 'entero') {
    const n = Number(texto);
    return texto.trim() !== '' && Number.isInteger(n) ? n : null;
  }
  return campo.opciones.find((o) => String(o) === texto) ?? null;
}

const ANCHO_CARACTER = 0.62; // ancho medio de un carácter en negrita, en múltiplos del tamaño de letra

/** Tamaño de letra que hace caber la línea en el ancho de la zona (nunca mayor al de la ficha). */
export function tamanoAjustado(linea: string, anchoZona: number, tamano: number): number {
  const ancho = linea.length * ANCHO_CARACTER * tamano;
  return ancho <= anchoZona || ancho === 0 ? tamano : (anchoZona / ancho) * tamano;
}
