export interface EntidadDxf {
  tipo: string;
  capa: string;
  /** Todos los grupos de la entidad: código → valores en orden. */
  g: Map<number, string[]>;
  /** Solo POLYLINE: vértices (x, y) y si está cerrada (bit 1 del grupo 70). */
  vertices: [number, number][];
  cerrada: boolean;
}

export interface DxfLeido {
  version: string;
  insunits: number;
  capas: { nombre: string; color: number }[];
  entidades: EntidadDxf[];
  terminaEnEof: boolean;
}

/** Lector mínimo de DXF (pares código/valor) para verificar lo que escribe el exportador. */
export function leerDxf(texto: string): DxfLeido {
  const lineas = texto.split(/\r?\n/);
  if (lineas[lineas.length - 1] === '') lineas.pop();
  if (lineas.length % 2 !== 0) throw new Error('DXF mal formado: cantidad impar de líneas');
  const pares: [number, string][] = [];
  for (let i = 0; i < lineas.length; i += 2) {
    const codigo = Number((lineas[i] ?? '').trim());
    if (!Number.isInteger(codigo)) throw new Error(`Código de grupo inválido: "${lineas[i]}"`);
    pares.push([codigo, (lineas[i + 1] ?? '').trim()]);
  }

  const res: DxfLeido = { version: '', insunits: NaN, capas: [], entidades: [], terminaEnEof: false };
  let seccion = '';
  let tabla = '';
  let actual: EntidadDxf | null = null;
  let polilinea: EntidadDxf | null = null;
  for (let i = 0; i < pares.length; i++) {
    const [c, v] = pares[i] ?? [0, ''];
    if (c === 0 && v === 'EOF') {
      res.terminaEnEof = i === pares.length - 1;
      continue;
    }
    if (c === 0 && v === 'SECTION') {
      seccion = pares[i + 1]?.[1] ?? '';
      i++; // salta el grupo 2 con el nombre de la sección
      continue;
    }
    if (c === 0 && v === 'ENDSEC') {
      seccion = '';
      actual = null;
      continue;
    }
    if (seccion === 'HEADER') {
      if (c === 9 && v === '$ACADVER') res.version = pares[i + 1]?.[1] ?? '';
      if (c === 9 && v === '$INSUNITS') res.insunits = Number(pares[i + 1]?.[1]);
    } else if (seccion === 'TABLES') {
      if (c === 0 && v === 'TABLE') tabla = pares[i + 1]?.[1] ?? '';
      if (c === 0 && v === 'LAYER' && tabla === 'LAYER') {
        let nombre = '';
        let color = NaN;
        for (let j = i + 1; j < pares.length && pares[j]?.[0] !== 0; j++) {
          if (pares[j]?.[0] === 2) nombre = pares[j]?.[1] ?? '';
          if (pares[j]?.[0] === 62) color = Number(pares[j]?.[1]);
        }
        res.capas.push({ nombre, color });
      }
    } else if (seccion === 'ENTITIES') {
      if (c === 0) {
        if (v === 'VERTEX' && polilinea) {
          actual = { tipo: v, capa: '', g: new Map(), vertices: [], cerrada: false };
          continue;
        }
        if (v === 'SEQEND') {
          polilinea = null;
          actual = { tipo: v, capa: '', g: new Map(), vertices: [], cerrada: false }; // recibe su grupo 8; no se registra
          continue;
        }
        actual = { tipo: v, capa: '', g: new Map(), vertices: [], cerrada: false };
        res.entidades.push(actual);
        if (v === 'POLYLINE') polilinea = actual;
        continue;
      }
      if (!actual) throw new Error(`Grupo ${c} fuera de una entidad`);
      if (actual.tipo === 'VERTEX' && polilinea) {
        if (c === 10) polilinea.vertices.push([Number(v), NaN]);
        if (c === 20) {
          const ult = polilinea.vertices[polilinea.vertices.length - 1];
          if (ult) ult[1] = Number(v);
        }
        continue;
      }
      if (c === 8) actual.capa = v;
      actual.g.set(c, [...(actual.g.get(c) ?? []), v]);
      if (actual.tipo === 'POLYLINE' && c === 70) actual.cerrada = (Number(v) & 1) === 1;
    }
  }
  return res;
}

export const nums = (e: EntidadDxf, codigo: number): number => Number(e.g.get(codigo)?.[0]);
