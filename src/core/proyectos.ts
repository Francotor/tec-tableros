import { SECCIONES_CANALETA } from './capacidad';
import { nuevoUid } from './modelo';
import type { CajaProyecto, Circuito, Elemento, Proyecto } from './modelo';
import { validarPlantilla } from './plantillas';
import type { Plantilla } from './plantillas';

export const FORMATO_RESPALDO = 'tec-tableros';
// v2 agrega las plantillas; un respaldo v1 (sin plantillas) se sigue leyendo igual.
export const VERSION_RESPALDO = 2;

export interface Respaldo {
  formato: typeof FORMATO_RESPALDO;
  version: number;
  exportadoEn: string;
  proyectos: Proyecto[];
  plantillas: Plantilla[];
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
  if (typeof e.alimentadoPor === 'string') el.alimentadoPor = e.alimentadoPor;
  if (typeof e.circuitoId === 'string') el.circuitoId = e.circuitoId;
  return el;
}

function validarCircuito(c: unknown): Circuito | null {
  if (!esObjeto(c) || typeof c.id !== 'string' || typeof c.numero !== 'string' || typeof c.nombre !== 'string') return null;
  return { id: c.id, numero: c.numero, nombre: c.nombre };
}

/** Comprueba la forma de un proyecto leído de disco o de un respaldo. */
export function validarProyecto(p: unknown): Proyecto {
  exigir(esObjeto(p), 'Proyecto inválido.');
  exigir(typeof p.id === 'string' && p.id !== '', 'Proyecto inválido: falta el identificador.');
  exigir(Array.isArray(p.elementos), 'Proyecto inválido: faltan los elementos.');
  // margenBorde_mm/modo/seccionCanaleta_mm/circuitos no existían antes de esta versión: un proyecto
  // guardado antes se abre igual, con el margen automático de su caja y sin circuitos.
  return {
    id: p.id,
    nombre: typeof p.nombre === 'string' ? p.nombre : 'Proyecto sin nombre',
    numeroCotizacion: typeof p.numeroCotizacion === 'string' ? p.numeroCotizacion : '',
    notas: typeof p.notas === 'string' ? p.notas : '',
    actualizadoEn: typeof p.actualizadoEn === 'string' ? p.actualizadoEn : new Date().toISOString(),
    caja: validarCaja(p.caja),
    margenBordeManual: p.margenBordeManual === true,
    margenBorde_mm: typeof p.margenBorde_mm === 'number' ? p.margenBorde_mm : null,
    modo: p.modo === 'con_canaleta' ? 'con_canaleta' : 'compacto',
    seccionCanaleta_mm: SECCIONES_CANALETA.includes(p.seccionCanaleta_mm as 25 | 40 | 60) ? (p.seccionCanaleta_mm as 25 | 40 | 60) : 40,
    circuitos: Array.isArray(p.circuitos) ? p.circuitos.flatMap((c) => validarCircuito(c) ?? []) : [],
    elementos: p.elementos.map(validarElemento),
  };
}

export function crearRespaldo(proyectos: readonly Proyecto[], plantillas: readonly Plantilla[] = [], ahora: Date = new Date()): Respaldo {
  return {
    formato: FORMATO_RESPALDO,
    version: VERSION_RESPALDO,
    exportadoEn: ahora.toISOString(),
    proyectos: [...proyectos],
    plantillas: [...plantillas],
  };
}

export interface RespaldoLeido {
  proyectos: Proyecto[];
  plantillas: Plantilla[];
}

/** Lee un archivo de respaldo (texto JSON). Lanza un Error con mensaje en español si no es válido. */
export function parsearRespaldo(texto: string): RespaldoLeido {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  exigir(esObjeto(datos) && datos.formato === FORMATO_RESPALDO, 'El archivo no es un respaldo de TEC Tableros.');
  exigir(typeof datos.version === 'number' && datos.version <= VERSION_RESPALDO, 'El respaldo es de una versión más nueva de la app.');
  exigir(Array.isArray(datos.proyectos), 'El respaldo no contiene proyectos.');
  // Un respaldo v1 no trae "plantillas": se importa igual, sin ninguna.
  exigir(datos.plantillas === undefined || Array.isArray(datos.plantillas), 'El respaldo tiene las plantillas mal formadas.');
  return {
    proyectos: datos.proyectos.map(validarProyecto),
    plantillas: Array.isArray(datos.plantillas) ? datos.plantillas.map(validarPlantilla) : [],
  };
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
