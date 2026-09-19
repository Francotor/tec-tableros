import { nuevoUid } from './modelo';
import type { CajaProyecto, Elemento, Proyecto } from './modelo';

export const FORMATO_RESPALDO = 'tec-tableros';
export const VERSION_RESPALDO = 1;

export interface Respaldo {
  formato: typeof FORMATO_RESPALDO;
  version: number;
  exportadoEn: string;
  proyectos: Proyecto[];
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function exigir(condicion: boolean, mensaje: string): asserts condicion {
  if (!condicion) throw new Error(mensaje);
}

function validarCaja(c: unknown): CajaProyecto {
  exigir(esObjeto(c), 'Proyecto inválido: falta la caja.');
  if (typeof c.id === 'string') return { id: c.id };
  const l = c.libre;
  exigir(
    esObjeto(l) &&
      typeof l.ancho_mm === 'number' &&
      typeof l.alto_mm === 'number' &&
      (l.tipo === 'metalica' || l.tipo === 'inox'),
    'Proyecto inválido: caja de medida libre mal formada.',
  );
  return { libre: { ancho_mm: l.ancho_mm, alto_mm: l.alto_mm, tipo: l.tipo } };
}

function validarElemento(e: unknown): Elemento {
  exigir(esObjeto(e), 'Proyecto inválido: elemento mal formado.');
  exigir(
    typeof e.uid === 'string' &&
      typeof e.componenteId === 'string' &&
      typeof e.x_mm === 'number' &&
      typeof e.y_mm === 'number' &&
      esObjeto(e.valores),
    'Proyecto inválido: elemento con datos incompletos.',
  );
  const el: Elemento = {
    uid: e.uid,
    componenteId: e.componenteId,
    x_mm: e.x_mm,
    y_mm: e.y_mm,
    valores: e.valores as Elemento['valores'],
  };
  if (e.rotacion === 0 || e.rotacion === 90) el.rotacion = e.rotacion;
  if (typeof e.largo_mm === 'number') el.largo_mm = e.largo_mm;
  return el;
}

/** Comprueba la forma de un proyecto leído de disco o de un respaldo. */
export function validarProyecto(p: unknown): Proyecto {
  exigir(esObjeto(p), 'Proyecto inválido.');
  exigir(typeof p.id === 'string' && p.id !== '', 'Proyecto inválido: falta el identificador.');
  exigir(Array.isArray(p.elementos), 'Proyecto inválido: faltan los elementos.');
  return {
    id: p.id,
    nombre: typeof p.nombre === 'string' ? p.nombre : 'Proyecto sin nombre',
    numeroCotizacion: typeof p.numeroCotizacion === 'string' ? p.numeroCotizacion : '',
    notas: typeof p.notas === 'string' ? p.notas : '',
    actualizadoEn: typeof p.actualizadoEn === 'string' ? p.actualizadoEn : new Date().toISOString(),
    caja: validarCaja(p.caja),
    elementos: p.elementos.map(validarElemento),
  };
}

export function crearRespaldo(proyectos: readonly Proyecto[], ahora: Date = new Date()): Respaldo {
  return {
    formato: FORMATO_RESPALDO,
    version: VERSION_RESPALDO,
    exportadoEn: ahora.toISOString(),
    proyectos: [...proyectos],
  };
}

/** Lee un archivo de respaldo (texto JSON). Lanza un Error con mensaje en español si no es válido. */
export function parsearRespaldo(texto: string): Proyecto[] {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  exigir(esObjeto(datos) && datos.formato === FORMATO_RESPALDO, 'El archivo no es un respaldo de TEC Tableros.');
  exigir(typeof datos.version === 'number' && datos.version <= VERSION_RESPALDO, 'El respaldo es de una versión más nueva de la app.');
  exigir(Array.isArray(datos.proyectos), 'El respaldo no contiene proyectos.');
  return datos.proyectos.map(validarProyecto);
}

export function duplicarProyecto(p: Proyecto, ahora: Date = new Date()): Proyecto {
  return {
    ...p,
    id: nuevoUid(),
    nombre: `${p.nombre} (copia)`,
    actualizadoEn: ahora.toISOString(),
    elementos: p.elementos.map((e) => ({ ...e, valores: { ...e.valores } })),
  };
}

export interface Combinacion {
  /** Proyectos que hay que guardar (los nuevos). */
  guardar: Proyecto[];
  agregados: number;
  /** Ya existían idénticos. */
  omitidos: number;
  /** Mismo identificador pero contenido distinto: se guardan como copia, sin pisar el existente. */
  copias: number;
}

/** Une un respaldo con los proyectos existentes sin perder nada de ninguno de los dos lados. */
export function combinarProyectos(existentes: readonly Proyecto[], importados: readonly Proyecto[]): Combinacion {
  const porId = new Map(existentes.map((p) => [p.id, p]));
  const res: Combinacion = { guardar: [], agregados: 0, omitidos: 0, copias: 0 };
  for (const p of importados) {
    const previo = porId.get(p.id);
    if (!previo) {
      res.guardar.push(p);
      res.agregados++;
    } else if (JSON.stringify(previo) === JSON.stringify(p)) {
      res.omitidos++;
    } else {
      res.guardar.push({ ...p, id: nuevoUid(), nombre: `${p.nombre} (importado)` });
      res.copias++;
    }
  }
  return res;
}

/** Nombre de archivo seguro a partir de un texto libre. */
export function nombreSeguro(texto: string, respaldo = 'tablero'): string {
  const limpio = texto
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return limpio || respaldo;
}
