import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolverColocacion, calcularTopes } from './colocacion';
import type { Contexto } from './colocacion';
import { leerDxf, nums } from './dxf.testutil';
import { cargarBiblioteca, crearContextoDe, RAIZ_BIBLIOTECA } from './ejemplo.testutil';
import { lineasEtiqueta, tamanoAjustado } from './etiquetas';
import { CAPAS_DXF, EscritorDxf, generarDxf, svgsNecesarios, tramosLibres } from './exportarDxf';
import { leerFormasSvg } from './lectorSvg';
import { valoresPorDefecto } from './modelo';
import type { Elemento } from './modelo';

const bib = cargarBiblioteca();
const esAscii = (t: string): boolean => [...t].every((c) => c === "\r" || c === "\n" || (c >= " " && c <= "~"));
const sinTildes = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '');

// ---------------------------------------------------------------- 1. DXF mínimo con formas conocidas

describe('DXF mínimo: un círculo, una línea y un rectángulo conocidos', () => {
  const w = new EscritorDxf();
  w.circulo('Caja', 100, 50, 7.5);
  w.linea('Control', 1, 2, 30.25, 4);
  w.rectangulo('Comando', 10, 20, 30, 40);
  const texto = w.toString();
  const d = leerDxf(texto);

  it('cabecera R12 en milímetros, capas declaradas y cierre con EOF', () => {
    expect(d.version).toBe('AC1009');
    expect(d.insunits).toBe(4);
    expect(d.terminaEnEof).toBe(true);
    expect(d.capas.map((c) => c.nombre)).toEqual(['Protecciones', 'Comando', 'Control', 'Distribucion', 'Montaje', 'Caja', 'Texto']);
    expect(d.capas.every((c) => Number.isInteger(c.color) && c.color > 0)).toBe(true);
  });

  it('es ASCII puro, con pares código/valor bien formados', () => {
    expect(esAscii(texto)).toBe(true);
    expect(texto.split('\r\n').length % 2).toBe(1); // termina en salto de línea → última cadena vacía
  });

  it('el círculo es una entidad CIRCLE con su centro y radio', () => {
    const e = d.entidades.filter((x) => x.tipo === 'CIRCLE');
    expect(e).toHaveLength(1);
    expect(e[0]?.capa).toBe('Caja');
    expect([nums(e[0]!, 10), nums(e[0]!, 20), nums(e[0]!, 30), nums(e[0]!, 40)]).toEqual([100, 50, 0, 7.5]);
  });

  it('la línea es una entidad LINE con sus dos extremos', () => {
    const e = d.entidades.filter((x) => x.tipo === 'LINE');
    expect(e).toHaveLength(1);
    expect(e[0]?.capa).toBe('Control');
    expect([nums(e[0]!, 10), nums(e[0]!, 20), nums(e[0]!, 11), nums(e[0]!, 21)]).toEqual([1, 2, 30.25, 4]);
  });

  it('el rectángulo es una POLYLINE cerrada de 4 vértices en el orden esperado', () => {
    const e = d.entidades.filter((x) => x.tipo === 'POLYLINE');
    expect(e).toHaveLength(1);
    expect(e[0]?.capa).toBe('Comando');
    expect(e[0]?.cerrada).toBe(true);
    expect(e[0]?.vertices).toEqual([
      [10, 20],
      [40, 20],
      [40, 60],
      [10, 60],
    ]);
    expect(texto).toContain('\r\nSEQEND\r\n');
  });

  it('un TEXT lleva altura, contenido y alineación centrada; las tildes salen sin acento', () => {
    const t = new EscritorDxf();
    t.texto('Texto', 5, 6, 3.5, 'Curva C 40 A — Tensión');
    const e = leerDxf(t.toString()).entidades.find((x) => x.tipo === 'TEXT');
    expect(e?.capa).toBe('Texto');
    expect([nums(e!, 10), nums(e!, 20), nums(e!, 40)]).toEqual([5, 6, 3.5]);
    expect(e?.g.get(1)?.[0]).toBe('Curva C 40 A - Tension');
    expect([nums(e!, 72), nums(e!, 73), nums(e!, 11), nums(e!, 21)]).toEqual([1, 2, 5, 6]);
  });

  it('nombre de proyecto y de circuito con tildes, ñ y ° salen sin signos de interrogación', () => {
    const t = new EscritorDxf();
    t.texto('Texto', 0, 0, 3.5, 'Tablero Iluminación N°2');
    t.texto('Texto', 0, 10, 3.5, 'Alimentación cocina');
    const d1 = leerDxf(t.toString());
    expect(d1.entidades.map((e) => e.g.get(1)?.[0])).toEqual(['Tablero Iluminacion No2', 'Alimentacion cocina']);
    expect(t.toString()).not.toContain('?');
  });

  it('un archivo vacío también es un DXF válido', () => {
    const d0 = leerDxf(new EscritorDxf().toString());
    expect(d0.entidades).toEqual([]);
    expect(d0.terminaEnEof).toBe(true);
  });
});

// ---------------------------------------------------------------- tramos libres

describe('tramos libres del riel', () => {
  it('sin nada encima queda entero', () => {
    expect(tramosLibres(0, 100, [])).toEqual([[0, 100]]);
  });
  it('un aparato en el medio parte el riel en dos', () => {
    expect(tramosLibres(0, 100, [[30, 50]])).toEqual([
      [0, 30],
      [50, 100],
    ]);
  });
  it('aparatos pegados a un extremo no dejan tramo vacío; los solapados se unen', () => {
    expect(tramosLibres(0, 100, [[0, 20], [20, 40], [35, 60]])).toEqual([[60, 100]]);
  });
  it('cubierto por completo no deja tramos', () => {
    expect(tramosLibres(10, 50, [[0, 60]])).toEqual([]);
  });
});

// ---------------------------------------------------------------- 2. tablero completo

const leerSvg = (ruta: string): string => readFileSync(join(RAIZ_BIBLIOTECA, ruta), 'utf8');

function svgsDe(elementos: readonly Elemento[], ctx: Contexto): Map<string, string> {
  return new Map(svgsNecesarios(elementos, ctx).map((r) => [r, leerSvg(r)]));
}

/** Pone un riel y luego los aparatos en fila, todo dentro del área útil de la caja; falla si algo no cabe. */
function armar(ctx: Contexto, aparatos: string[]): { elementos: Elemento[]; riel: Elemento } {
  let elementos: Elemento[] = [];
  const agregar = (id: string, xIzq: number, y: number, largo?: number): Elemento => {
    const comp = ctx.comps.get(id);
    if (!comp) throw new Error(`falta ${id}`);
    const ancho = comp.ancho_mm ?? largo ?? 0;
    const r = resolverColocacion(elementos, ctx, { comp, punto: { x: xIzq + ancho / 2, y }, largo_mm: largo, sinSnap: true });
    if (!r.ok) throw new Error(`${id} en x=${xIzq}, y=${y}: ${r.motivo}`);
    const el: Elemento = { uid: `${id}@${xIzq}`, componenteId: id, x_mm: r.x_mm, y_mm: r.y_mm, largo_mm: r.largo_mm, valores: valoresPorDefecto(comp) };
    elementos = [...elementos, el];
    return el;
  };
  const a = ctx.areaUtil;
  const yc = a.y + a.h / 2;
  const riel = agregar('riel_din', a.x, yc, Math.min(a.w, 300));
  // Los aparatos van dejando un hueco de 20 mm al inicio para que el riel tenga un tramo libre a cada lado.
  let x = a.x + 20;
  for (const id of aparatos) {
    agregar(id, x, yc);
    x += ctx.comps.get(id)?.ancho_mm ?? 0;
  }
  return { elementos, riel };
}

const CAJAS = [
  { nombre: 'Eldon ASR (inox, con fijaciones)', id: 'caja_inox_asr_600x600x210' },
  { nombre: 'Lerkenbox ARES', id: 'caja_metalica_ares_400x400x200' },
  { nombre: 'genérica', id: 'caja_metalica_400x500x200' },
];
const APARATOS = ['automatico_1p', 'diferencial_2p', 'luz_piloto_rojo'];

describe.each(CAJAS)('DXF del tablero — caja $nombre', ({ id }) => {
  const ctx = crearContextoDe(bib, { id });
  const { elementos, riel } = armar(ctx, APARATOS);
  const svgs = svgsDe(elementos, ctx);
  const texto = generarDxf(elementos, ctx, svgs);
  const d = leerDxf(texto);
  const alto = ctx.caja.alto;

  const formasDe = (ruta: string) => leerFormasSvg(svgs.get(ruta) ?? '');
  const compsColocados = elementos.map((e) => ctx.comps.get(e.componenteId)).filter((c) => c !== undefined && c.montaje !== 'lineal');
  const tope = ctx.comps.get('tope_riel');
  const nTopes = calcularTopes(elementos, ctx).length;

  it('es un DXF R12 en mm, ASCII, con todas las capas y cierre correcto', () => {
    expect(d.version).toBe('AC1009');
    expect(d.insunits).toBe(4);
    expect(d.terminaEnEof).toBe(true);
    expect(d.capas.map((c) => c.nombre)).toEqual(CAPAS_DXF.map((c) => c.nombre));
    expect(esAscii(texto)).toBe(true);
  });

  it('cada círculo del SVG de cada pieza sale como CIRCLE, y las fijaciones también', () => {
    const esperados = compsColocados.reduce((s, c) => s + formasDe(c!.svg).filter((f) => f.tipo === 'circle').length, 0);
    const deTopes = nTopes * (tope ? formasDe(tope.svg).filter((f) => f.tipo === 'circle').length : 0);
    const circulos = d.entidades.filter((e) => e.tipo === 'CIRCLE');
    expect(circulos).toHaveLength(esperados + deTopes + ctx.caja.fijaciones.length);
    const enCaja = circulos.filter((e) => e.capa === 'Caja');
    expect(enCaja).toHaveLength(ctx.caja.fijaciones.length);
    for (const f of ctx.caja.fijaciones) {
      const hay = enCaja.some((e) => nums(e, 10) === f.x && Math.abs(nums(e, 20) - (alto - f.y)) < 1e-6 && nums(e, 40) === f.r);
      expect(hay, `fijación ${f.x},${f.y}`).toBe(true);
    }
  });

  it('cada line del SVG sale como LINE', () => {
    const esperados = compsColocados.reduce((s, c) => s + formasDe(c!.svg).filter((f) => f.tipo === 'line').length, 0);
    const deTopes = nTopes * (tope ? formasDe(tope.svg).filter((f) => f.tipo === 'line').length : 0);
    expect(d.entidades.filter((e) => e.tipo === 'LINE')).toHaveLength(esperados + deTopes);
  });

  it('cada rect del SVG sale como POLYLINE cerrada de 4 vértices (más caja, placa, riel y topes)', () => {
    const polis = d.entidades.filter((e) => e.tipo === 'POLYLINE');
    expect(polis.every((p) => p.cerrada && p.vertices.length === 4)).toBe(true);
    const deSvg = compsColocados.reduce((s, c) => s + formasDe(c!.svg).filter((f) => f.tipo === 'rect').length, 0);
    const deTopes = nTopes * (tope ? formasDe(tope.svg).filter((f) => f.tipo === 'rect').length : 0);
    const cajaYPlaca = ctx.caja.permiteRieles ? 2 : 1;
    const tramos = 2; // el riel tiene un tramo libre a cada lado del grupo de aparatos
    expect(polis).toHaveLength(deSvg + deTopes + cajaYPlaca + tramos);
  });

  it('las piezas van en la capa de su categoría', () => {
    const porCapa = (capa: string) => d.entidades.filter((e) => e.capa === capa).length;
    expect(porCapa('Protecciones')).toBeGreaterThan(0); // automático y diferencial
    expect(porCapa('Control')).toBeGreaterThan(0); // luz piloto
    expect(porCapa('Comando')).toBe(0);
    expect(porCapa('Montaje')).toBeGreaterThan(0); // riel (tramos libres) y topes
    expect(porCapa('Caja')).toBeGreaterThan(0);
    const capasUsadas = new Set(d.entidades.map((e) => e.capa));
    for (const c of capasUsadas) expect(CAPAS_DXF.map((x) => x.nombre)).toContain(c);
  });

  it('los rótulos son TEXT en la capa Texto, con las mismas líneas y el tamano_mm de la ficha', () => {
    const textos = d.entidades.filter((e) => e.tipo === 'TEXT');
    expect(textos.every((t) => t.capa === 'Texto')).toBe(true);
    const esperados = elementos.flatMap((e) => {
      const c = ctx.comps.get(e.componenteId);
      if (!c || c.montaje === 'lineal' || !c.etiqueta) return [];
      const zona = c.etiqueta;
      return lineasEtiqueta(c, e).map((linea) => ({ linea: sinTildes(linea), altura: tamanoAjustado(linea, zona.w, zona.tamano_mm), tamano: zona.tamano_mm }));
    });
    expect(esperados.length).toBeGreaterThan(0);
    const leidos = textos.map((t) => ({ linea: t.g.get(1)?.[0] ?? '', altura: nums(t, 40) })).sort((x, y) => x.linea.localeCompare(y.linea));
    const previstos = esperados.map(({ linea, altura }) => ({ linea, altura })).sort((x, y) => x.linea.localeCompare(y.linea));
    expect(leidos).toHaveLength(previstos.length);
    leidos.forEach((t, i) => {
      expect(t.linea).toBe(previstos[i]?.linea);
      expect(t.altura).toBeCloseTo(previstos[i]?.altura ?? NaN, 3);
    });
    // Ningún texto supera el tamano_mm de su ficha.
    const maximo = Math.max(...esperados.map((x) => x.tamano));
    for (const t of leidos) expect(t.altura).toBeLessThanOrEqual(maximo + 1e-9);
  });

  it('el riel solo se dibuja donde no hay aparatos ni topes encima', () => {
    const rectangulos = d.entidades.filter((e) => e.tipo === 'POLYLINE' && e.capa === 'Montaje');
    const yTop = alto - riel.y_mm;
    const yBot = alto - (riel.y_mm + ctx.rielAlto);
    const delRiel = rectangulos.filter((p) => {
      const ys = p.vertices.map((v) => v[1]);
      return Math.abs(Math.min(...ys) - yBot) < 1e-6 && Math.abs(Math.max(...ys) - yTop) < 1e-6;
    });
    expect(delRiel).toHaveLength(2);
    const ocupado = [
      ...elementos.filter((e) => e.uid !== riel.uid).map((e) => [e.x_mm, e.x_mm + (ctx.comps.get(e.componenteId)?.ancho_mm ?? 0)] as const),
      ...calcularTopes(elementos, ctx).map((t) => [t.rect.x, t.rect.x + t.rect.w] as const),
    ];
    for (const p of delRiel) {
      const xs = p.vertices.map((v) => v[0]);
      const [x1, x2] = [Math.min(...xs), Math.max(...xs)];
      for (const [a, b] of ocupado) expect(x2 <= a + 1e-6 || x1 >= b - 1e-6, `tramo ${x1}-${x2} vs ${a}-${b}`).toBe(true);
    }
    // Los dos tramos más el hueco cubierto suman el largo del riel.
    const largoTramos = delRiel.reduce((s, p) => {
      const xs = p.vertices.map((v) => v[0]);
      return s + Math.max(...xs) - Math.min(...xs);
    }, 0);
    const cubierto = Math.max(...ocupado.map((o) => o[1])) - Math.min(...ocupado.map((o) => o[0]));
    expect(largoTramos + cubierto).toBeCloseTo(riel.largo_mm ?? 0, 6);
  });

  it('las coordenadas son las reales del proyecto, con Y hacia arriba (y = alto − y del editor)', () => {
    const cajaExt = d.entidades.find((e) => e.tipo === 'POLYLINE' && e.capa === 'Caja');
    expect(cajaExt?.vertices).toEqual([
      [0, 0],
      [ctx.caja.ancho, 0],
      [ctx.caja.ancho, alto],
      [0, alto],
    ]);
    // El primer círculo del automático 1P: cx=9, cy=6.5 en su SVG.
    const auto = elementos.find((e) => e.componenteId === 'automatico_1p');
    const buscado = { x: (auto?.x_mm ?? 0) + 9, y: alto - ((auto?.y_mm ?? 0) + 6.5) };
    const hay = d.entidades.some((e) => e.tipo === 'CIRCLE' && Math.abs(nums(e, 10) - buscado.x) < 1e-3 && Math.abs(nums(e, 20) - buscado.y) < 1e-3 && Math.abs(nums(e, 40) - 2.6) < 1e-6);
    expect(hay).toBe(true);
  });

  it('falla con un mensaje claro si falta el SVG de una pieza', () => {
    expect(() => generarDxf(elementos, ctx, new Map())).toThrow(/Falta el SVG/);
  });
});

describe('DXF del tablero con textos del usuario con tildes, ñ y °', () => {
  it('el rótulo escrito por el usuario sale legible y el archivo completo no contiene ningún "?"', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
    const { elementos } = armar(ctx, ['reloj_control']);
    const conTexto = elementos.map((e) => (e.componenteId === 'reloj_control' ? { ...e, valores: { ...e.valores, etiqueta: 'Iluminación N°2 ñ' } } : e));
    const texto = generarDxf(conTexto, ctx, svgsDe(conTexto, ctx));
    const rotulo = leerDxf(texto).entidades.find((e) => e.tipo === 'TEXT');
    expect(rotulo?.g.get(1)?.[0]).toBe('Iluminacion No2 n');
    expect(texto).not.toContain('?');
  });
});
