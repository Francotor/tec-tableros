/** Forma geométrica de un SVG de la biblioteca, como datos (en unidades del viewBox, que son mm). */
export type FormaSvg =
  | { tipo: 'rect'; x: number; y: number; width: number; height: number; rx: number }
  | { tipo: 'circle'; cx: number; cy: number; r: number }
  | { tipo: 'line'; x1: number; y1: number; x2: number; y2: number };

/** Elementos que no dibujan nada: se aceptan y se ignoran. */
const ESTRUCTURALES = new Set(['svg', 'title', 'desc', 'g']);

function atributos(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of texto.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) mapa.set(m[1] ?? '', m[2] ?? m[3] ?? '');
  return mapa;
}

function numero(attrs: Map<string, string>, nombre: string, etiqueta: string, porDefecto?: number): number {
  const bruto = attrs.get(nombre);
  if (bruto === undefined) {
    if (porDefecto !== undefined) return porDefecto;
    throw new Error(`SVG no soportado: <${etiqueta}> sin el atributo "${nombre}".`);
  }
  const v = Number(bruto.trim());
  if (bruto.trim() === '' || !Number.isFinite(v)) {
    throw new Error(`SVG no soportado: <${etiqueta}> con ${nombre}="${bruto}" (se esperaba un número en mm, sin unidades).`);
  }
  return v;
}

/**
 * Extrae los rect, circle y line de un SVG de la biblioteca, en orden de aparición. Ignora fill, stroke y todo
 * estilo. Lanza un error explícito ante cualquier otra forma (path, polygon, text…) o ante un `transform`, en vez de
 * omitirlos en silencio: así se detecta si la biblioteca agrega algo que este lector no sabe leer.
 */
export function leerFormasSvg(contenido: string): FormaSvg[] {
  const sinComentarios = contenido.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const formas: FormaSvg[] = [];
  for (const m of sinComentarios.matchAll(/<\s*([a-zA-Z][\w:.-]*)([^>]*)>/g)) {
    const etiqueta = (m[1] ?? '').toLowerCase();
    const attrs = atributos(m[2] ?? '');
    if (ESTRUCTURALES.has(etiqueta)) {
      if (etiqueta === 'g' && attrs.has('transform')) {
        throw new Error('SVG no soportado: <g> con transform (no se aplica al leer las formas).');
      }
      continue;
    }
    if (etiqueta !== 'rect' && etiqueta !== 'circle' && etiqueta !== 'line') {
      throw new Error(`SVG no soportado: elemento <${etiqueta}>. Este lector solo entiende rect, circle y line.`);
    }
    if (attrs.has('transform')) throw new Error(`SVG no soportado: <${etiqueta}> con transform.`);
    if (etiqueta === 'rect') {
      formas.push({
        tipo: 'rect',
        x: numero(attrs, 'x', etiqueta, 0),
        y: numero(attrs, 'y', etiqueta, 0),
        width: numero(attrs, 'width', etiqueta),
        height: numero(attrs, 'height', etiqueta),
        rx: numero(attrs, 'rx', etiqueta, 0),
      });
    } else if (etiqueta === 'circle') {
      formas.push({ tipo: 'circle', cx: numero(attrs, 'cx', etiqueta, 0), cy: numero(attrs, 'cy', etiqueta, 0), r: numero(attrs, 'r', etiqueta) });
    } else {
      formas.push({
        tipo: 'line',
        x1: numero(attrs, 'x1', etiqueta, 0),
        y1: numero(attrs, 'y1', etiqueta, 0),
        x2: numero(attrs, 'x2', etiqueta, 0),
        y2: numero(attrs, 'y2', etiqueta, 0),
      });
    }
  }
  return formas;
}
