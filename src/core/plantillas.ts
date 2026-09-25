import { SECCIONES_CANALETA } from './capacidad';
import type { Modo, SeccionCanaleta } from './capacidad';
import { nuevoUid } from './modelo';
import type { CajaProyecto, Elemento, Proyecto } from './modelo';

/**
 * Plantilla de tablero: el mismo layout que un proyecto (caja, elementos, margen y modo),
 * sin el número de cotización ni las notas, que son propios de cada obra.
 */
export interface Plantilla {
  id: string;
  nombre: string;
  actualizadoEn: string;
  caja: CajaProyecto;
  margenBordeManual: boolean;
  margenBorde_mm: number | null;
  modo: Modo;
  seccionCanaleta_mm: SeccionCanaleta;
  topesAutomaticos: boolean;
  elementos: Elemento[];
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function exigir(condicion: boolean, mensaje: string): asserts condicion {
  if (!condicion) throw new Error(mensaje);
}

// Reutiliza la misma validación de caja y de elemento que un proyecto (misma forma exacta).
function validarCaja(c: unknown): CajaProyecto {
  exigir(esObjeto(c), 'Plantilla inválida: falta la caja.');
  if (typeof c.id === 'string') return { id: c.id };
  const l = c.libre;
  exigir(
    esObjeto(l) &&
      typeof l.ancho_mm === 'number' &&
      typeof l.alto_mm === 'number' &&
      (l.tipo === 'metalica' || l.tipo === 'inox'),
    'Plantilla inválida: caja de medida libre mal formada.',
  );
  return { libre: { ancho_mm: l.ancho_mm, alto_mm: l.alto_mm, tipo: l.tipo } };
}

function validarElemento(e: unknown): Elemento {
  exigir(esObjeto(e), 'Plantilla inválida: elemento mal formado.');
  exigir(
    typeof e.uid === 'string' &&
      typeof e.componenteId === 'string' &&
      typeof e.x_mm === 'number' &&
      typeof e.y_mm === 'number' &&
      esObjeto(e.valores),
    'Plantilla inválida: elemento con datos incompletos.',
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
  // alimentadoPor es una relación interna del dibujo (por uid, que se conserva al instanciar la
  // plantilla) y sí se guarda; circuitoId no, porque los circuitos son propios de cada proyecto
  // (la plantilla no trae circuitos) y se perdería la referencia.
  if (typeof e.alimentadoPor === 'string') el.alimentadoPor = e.alimentadoPor;
  return el;
}

/** Comprueba la forma de una plantilla leída de IndexedDB o de un respaldo. */
export function validarPlantilla(p: unknown): Plantilla {
  exigir(esObjeto(p), 'Plantilla inválida.');
  exigir(typeof p.id === 'string' && p.id !== '', 'Plantilla inválida: falta el identificador.');
  exigir(Array.isArray(p.elementos), 'Plantilla inválida: faltan los elementos.');
  return {
    id: p.id,
    nombre: typeof p.nombre === 'string' && p.nombre.trim() !== '' ? p.nombre : 'Plantilla sin nombre',
    actualizadoEn: typeof p.actualizadoEn === 'string' ? p.actualizadoEn : new Date().toISOString(),
    caja: validarCaja(p.caja),
    margenBordeManual: p.margenBordeManual === true,
    margenBorde_mm: typeof p.margenBorde_mm === 'number' ? p.margenBorde_mm : null,
    modo: p.modo === 'con_canaleta' ? 'con_canaleta' : 'compacto',
    seccionCanaleta_mm: SECCIONES_CANALETA.includes(p.seccionCanaleta_mm as 25 | 40 | 60) ? (p.seccionCanaleta_mm as 25 | 40 | 60) : 40,
    topesAutomaticos: p.topesAutomaticos === true,
    elementos: p.elementos.map(validarElemento),
  };
}

/** "Guardar como plantilla": copia el layout actual, sin N° de cotización ni notas. */
export function plantillaDesdeProyecto(proyecto: Proyecto, nombre: string, ahora: Date = new Date()): Plantilla {
  return {
    id: nuevoUid(),
    nombre,
    actualizadoEn: ahora.toISOString(),
    caja: proyecto.caja,
    margenBordeManual: proyecto.margenBordeManual,
    margenBorde_mm: proyecto.margenBorde_mm,
    modo: proyecto.modo,
    seccionCanaleta_mm: proyecto.seccionCanaleta_mm,
    topesAutomaticos: proyecto.topesAutomaticos,
    // circuitoId no se copia: los circuitos son propios de cada proyecto, la plantilla no los trae.
    elementos: proyecto.elementos.map((e) => {
      const { circuitoId: _circuitoId, ...resto } = e;
      void _circuitoId;
      return { ...resto, valores: { ...e.valores } };
    }),
  };
}

/**
 * "Nuevo desde plantilla": arma un proyecto nuevo con ese layout. Los `uid` de los elementos se
 * conservan tal cual (igual que al duplicar un proyecto): son únicos dentro de sus propios
 * `elementos`, no entre proyectos, así que no hace falta remapearlos, y las referencias que un
 * elemento tenga a otro (`alimentadoPor`) siguen apuntando adonde corresponde sin tocarlas.
 */
export function proyectoDesdePlantilla(plantilla: Plantilla, ahora: Date = new Date()): Proyecto {
  return {
    id: nuevoUid(),
    nombre: plantilla.nombre,
    numeroCotizacion: '',
    notas: '',
    actualizadoEn: ahora.toISOString(),
    caja: plantilla.caja,
    margenBordeManual: plantilla.margenBordeManual,
    margenBorde_mm: plantilla.margenBorde_mm,
    modo: plantilla.modo,
    seccionCanaleta_mm: plantilla.seccionCanaleta_mm,
    topesAutomaticos: plantilla.topesAutomaticos,
    ladoBisagras: 'izquierda',
    circuitos: [],
    elementos: plantilla.elementos.map((e) => ({ ...e, valores: { ...e.valores } })),
  };
}

export function renombrarPlantilla(p: Plantilla, nombre: string, ahora: Date = new Date()): Plantilla {
  return { ...p, nombre, actualizadoEn: ahora.toISOString() };
}

export interface CombinacionPlantillas {
  guardar: Plantilla[];
  agregadas: number;
  omitidas: number;
  copias: number;
}

/** Igual criterio que combinarProyectos: no pisa nada de ninguno de los dos lados. */
export function combinarPlantillas(existentes: readonly Plantilla[], importadas: readonly Plantilla[]): CombinacionPlantillas {
  const porId = new Map(existentes.map((p) => [p.id, p]));
  const res: CombinacionPlantillas = { guardar: [], agregadas: 0, omitidas: 0, copias: 0 };
  for (const p of importadas) {
    const previa = porId.get(p.id);
    if (!previa) {
      res.guardar.push(p);
      res.agregadas++;
    } else if (JSON.stringify(previa) === JSON.stringify(p)) {
      res.omitidas++;
    } else {
      res.guardar.push({ ...p, id: nuevoUid(), nombre: `${p.nombre} (importada)` });
      res.copias++;
    }
  }
  return res;
}
