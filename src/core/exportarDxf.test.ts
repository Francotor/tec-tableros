import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolverColocacion, calcularTopes } from './colocacion';
import type { Contexto } from './colocacion';
import { leerDxf, nums } from './dxf.testutil';
import { cargarBiblioteca, cargarLinealesDeBiblioteca, crearContextoDe, RAIZ_BIBLIOTECA } from './ejemplo.testutil';
import { lineasEtiqueta, tamanoAjustado } from './etiquetas';
import { CAPAS_DXF, EscritorDxf, generarDxf, SEPARACION_FRONTAL_MM, svgsNecesarios, tramosLibres } from './exportarDxf';
import { leerFormasSvg } from './lectorSvg';
import { valoresPorDefecto } from './modelo';
import type { Elemento } from './modelo';
import { calcularVistaFrontal, datosFrontalDeCaja } from './vistaFrontal';

const bib = cargarBiblioteca();
const lineales = await cargarLinealesDeBiblioteca();
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
    expect(d.capas.map((c) => c.nombre)).toEqual(['Protecciones', 'Comando', 'Control', 'Distribucion', 'Montaje', 'Caja', 'Caja_Frontal', 'Texto']);
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
  const texto = generarDxf(elementos, ctx, svgs, lineales);
  const d = leerDxf(texto);
  const alto = ctx.caja.alto;

  const formasDe = (ruta: string) => leerFormasSvg(svgs.get(ruta) ?? '');
  const compsColocados = elementos.map((e) => ctx.comps.get(e.componenteId)).filter((c) => c !== undefined && c.montaje !== 'lineal');
  const tope = ctx.comps.get('tope_riel');
  const nTopes = calcularTopes(elementos, ctx).length;
  const ocupadoRiel = [
    ...elementos.filter((e) => e.uid !== riel.uid).map((e) => [e.x_mm, e.x_mm + (ctx.comps.get(e.componenteId)?.ancho_mm ?? 0)] as [number, number]),
    ...calcularTopes(elementos, ctx).map((t) => [t.rect.x, t.rect.x + t.rect.w] as [number, number]),
  ];
  const tramos = tramosLibres(riel.x_mm, riel.x_mm + (riel.largo_mm ?? 0), ocupadoRiel);
  const formasRiel = leerFormasSvg(lineales.rielSVG(riel.largo_mm ?? 0));
  const ranurasRiel = formasRiel.filter((f) => f.tipo === 'rect' && f.width < 100);
  /** Ranuras del riel que caben enteras en algún tramo libre (una tapada por un aparato no se dibuja). */
  const ranurasVisibles = ranurasRiel.filter((f) => f.tipo === 'rect' && tramos.some(([a, b]) => riel.x_mm + f.x >= a - 0.01 && riel.x_mm + f.x + f.width <= b + 0.01)).length;
  const lineasRielPorTramo = formasRiel.filter((f) => f.tipo === 'line').length;

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
    // Más las 2 líneas de riel de cada tramo libre.
    expect(d.entidades.filter((e) => e.tipo === 'LINE')).toHaveLength(esperados + deTopes + tramos.length * lineasRielPorTramo);
  });

  it('cada rect del SVG sale como POLYLINE cerrada de 4 vértices (más caja, placa, riel y topes)', () => {
    const polis = d.entidades.filter((e) => e.tipo === 'POLYLINE');
    expect(polis.every((p) => p.cerrada && p.vertices.length === 4)).toBe(true);
    const deSvg = compsColocados.reduce((s, c) => s + formasDe(c!.svg).filter((f) => f.tipo === 'rect').length, 0);
    const deTopes = nTopes * (tope ? formasDe(tope.svg).filter((f) => f.tipo === 'rect').length : 0);
    const cajaYPlaca = ctx.caja.permiteRieles ? 2 : 1;
    // Riel: el cuerpo de cada tramo libre (uno a cada lado del grupo de aparatos) más sus ranuras visibles.
    expect(tramos).toHaveLength(2);
    expect(polis).toHaveLength(deSvg + deTopes + cajaYPlaca + tramos.length + ranurasVisibles);
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

  it('el riel se dibuja con su geometría real (cuerpo, 2 líneas y ranuras) y solo donde no hay aparatos ni topes encima', () => {
    const rectangulos = d.entidades.filter((e) => e.tipo === 'POLYLINE' && e.capa === 'Montaje');
    // El cuerpo del riel en el SVG va de y=0.25 a y=34.75.
    const yTop = alto - (riel.y_mm + 0.25);
    const yBot = alto - (riel.y_mm + 34.75);
    const cuerpos = rectangulos.filter((p) => {
      const ys = p.vertices.map((v) => v[1]);
      return Math.abs(Math.min(...ys) - yBot) < 1e-6 && Math.abs(Math.max(...ys) - yTop) < 1e-6;
    });
    expect(cuerpos).toHaveLength(2);
    for (const p of cuerpos) {
      const xs = p.vertices.map((v) => v[0]);
      const [x1, x2] = [Math.min(...xs), Math.max(...xs)];
      for (const [oa, ob] of ocupadoRiel) expect(x2 <= oa + 1e-6 || x1 >= ob - 1e-6, `tramo ${x1}-${x2} vs ${oa}-${ob}`).toBe(true);
    }
    // Los dos cuerpos más lo cubierto suman el cuerpo completo del riel (largo − 2 × 0,25 de borde).
    const largoTramos = cuerpos.reduce((sum, p) => {
      const xs = p.vertices.map((v) => v[0]);
      return sum + Math.max(...xs) - Math.min(...xs);
    }, 0);
    const cubierto = Math.max(...ocupadoRiel.map((o) => o[1])) - Math.min(...ocupadoRiel.map((o) => o[0]));
    expect(largoTramos + cubierto).toBeCloseTo((riel.largo_mm ?? 0) - 0.5, 6);
    // Ranuras: rectángulos de 15 × 5,2 mm dentro de los tramos libres; y 2 líneas por tramo.
    const ranuras = rectangulos.filter((p) => {
      const xs = p.vertices.map((v) => v[0]);
      const ys = p.vertices.map((v) => v[1]);
      return Math.abs(Math.max(...xs) - Math.min(...xs) - 15) < 1e-6 && Math.abs(Math.max(...ys) - Math.min(...ys) - 5.2) < 1e-6;
    });
    expect(ranuras).toHaveLength(ranurasVisibles);
    expect(ranurasVisibles).toBeGreaterThan(0);
    const lineasRiel = d.entidades.filter((e) => e.tipo === 'LINE' && e.capa === 'Montaje');
    expect(lineasRiel.length).toBeGreaterThanOrEqual(tramos.length * lineasRielPorTramo);
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
    expect(() => generarDxf(elementos, ctx, new Map(), lineales)).toThrow(/Falta el SVG/);
  });
});

describe('DXF del tablero con textos del usuario con tildes, ñ y °', () => {
  it('el rótulo escrito por el usuario sale legible y el archivo completo no contiene ningún "?"', () => {
    const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
    const { elementos } = armar(ctx, ['reloj_control']);
    const conTexto = elementos.map((e) => (e.componenteId === 'reloj_control' ? { ...e, valores: { ...e.valores, etiqueta: 'Iluminación N°2 ñ' } } : e));
    const texto = generarDxf(conTexto, ctx, svgsDe(conTexto, ctx), lineales);
    const rotulo = leerDxf(texto).entidades.find((e) => e.tipo === 'TEXT');
    expect(rotulo?.g.get(1)?.[0]).toBe('Iluminacion No2 n');
    expect(texto).not.toContain('?');
  });
});

describe('riel y canaleta se distinguen por su geometría, sin depender del color', () => {
  const ctx = crearContextoDe(bib, { id: 'caja_metalica_400x500x200' });
  const canaleta = ctx.comps.get('canaleta_40')!;

  function tableroConRielYCanaletas() {
    const { elementos, riel } = armar(ctx, []);
    const horizontal = resolverColocacion(elementos, ctx, { comp: canaleta, punto: { x: 250, y: 300 }, largo_mm: 200, sinSnap: true });
    if (!horizontal.ok) throw new Error(horizontal.motivo);
    const conHoriz: Elemento[] = [...elementos, { uid: 'ch', componenteId: 'canaleta_40', x_mm: horizontal.x_mm, y_mm: horizontal.y_mm, largo_mm: 200, rotacion: 0, valores: {} }];
    const vertical = resolverColocacion(conHoriz, ctx, { comp: canaleta, punto: { x: 440, y: 200 }, largo_mm: 150, rotacion: 90, sinSnap: true });
    if (!vertical.ok) throw new Error(vertical.motivo);
    const todos: Elemento[] = [...conHoriz, { uid: 'cv', componenteId: 'canaleta_40', x_mm: vertical.x_mm, y_mm: vertical.y_mm, largo_mm: 150, rotacion: 90, valores: {} }];
    return { todos, riel, horizontal, vertical };
  }

  it('la canaleta trae sus costillas como rectángulos verticales y ninguna línea; el riel, ranuras y líneas', () => {
    const { todos, riel } = tableroConRielYCanaletas();
    const d = leerDxf(generarDxf(todos, ctx, new Map(), lineales));
    const alto = ctx.caja.alto;
    const dims = (p: { vertices: [number, number][] }) => {
      const xs = p.vertices.map((v) => v[0]);
      const ys = p.vertices.map((v) => v[1]);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), x: Math.min(...xs), y: Math.min(...ys) };
    };
    const rects = d.entidades.filter((e) => e.tipo === 'POLYLINE' && e.capa === 'Montaje').map(dims);

    // Costillas de la canaleta horizontal (SVG: 4 × (ancho − 5), ancho 40 → 4 × 35), contadas en el SVG real.
    const svgCanaleta = leerFormasSvg(lineales.canaletaSVG(200, 40));
    const costillasEsperadas = svgCanaleta.filter((f) => f.tipo === 'rect' && f.width < 10).length;
    expect(costillasEsperadas).toBeGreaterThan(10);
    const costillasH = rects.filter((r) => Math.abs(r.w - 4) < 1e-6 && Math.abs(r.h - 35) < 1e-6);
    expect(costillasH).toHaveLength(costillasEsperadas);

    // La canaleta vertical, girada 90°: las costillas quedan horizontales (35 × 4).
    const costillasVerticalEsperadas = leerFormasSvg(lineales.canaletaSVG(150, 40)).filter((f) => f.tipo === 'rect' && f.width < 10).length;
    const costillasV = rects.filter((r) => Math.abs(r.w - 35) < 1e-6 && Math.abs(r.h - 4) < 1e-6);
    expect(costillasV).toHaveLength(costillasVerticalEsperadas);

    // Ninguna línea de canaleta: las 2 líneas por tramo son del riel (y solo caen sobre su franja).
    const lineas = d.entidades.filter((e) => e.tipo === 'LINE' && e.capa === 'Montaje');
    expect(lineas.length).toBeGreaterThan(0);
    for (const l of lineas) {
      const y = nums(l, 20);
      const yRielArriba = alto - (riel.y_mm + 4);
      const yRielAbajo = alto - (riel.y_mm + 31);
      expect(Math.abs(y - yRielArriba) < 1e-6 || Math.abs(y - yRielAbajo) < 1e-6, 'línea fuera de la franja del riel').toBe(true);
    }
    // Y el riel trae ranuras de 15 × 5,2 que la canaleta no tiene.
    expect(rects.filter((r) => Math.abs(r.w - 15) < 1e-6 && Math.abs(r.h - 5.2) < 1e-6).length).toBeGreaterThan(0);
  });

  it('la canaleta vertical ocupa exactamente su huella girada (ancho de la ficha × largo)', () => {
    const { todos, vertical } = tableroConRielYCanaletas();
    const d = leerDxf(generarDxf(todos, ctx, new Map(), lineales));
    const alto = ctx.caja.alto;
    const puntos = d.entidades
      .filter((e) => e.tipo === 'POLYLINE' && e.capa === 'Montaje')
      .flatMap((e) => e.vertices)
      .filter(([x, y]) => x >= vertical.x_mm - 1e-6 && x <= vertical.x_mm + 40 + 1e-6 && y >= alto - (vertical.y_mm + 150) - 1e-6 && y <= alto - vertical.y_mm + 1e-6);
    expect(puntos.length).toBeGreaterThan(20);
    const xs = puntos.map((p) => p[0]);
    const ys = puntos.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(vertical.x_mm + 0.25, 6);
    expect(Math.max(...xs)).toBeCloseTo(vertical.x_mm + 39.75, 6);
    expect(Math.min(...ys)).toBeCloseTo(alto - (vertical.y_mm + 149.75), 6);
    expect(Math.max(...ys)).toBeCloseTo(alto - (vertical.y_mm + 0.25), 6);
  });

  it('con largos distintos, cada elemento trae la cantidad de ranuras o costillas de su propio largo', () => {
    for (const largo of [100, 250, 400]) {
      const e: Elemento[] = [{ uid: 'c', componenteId: 'canaleta_40', x_mm: 60, y_mm: 60, largo_mm: largo, rotacion: 0, valores: {} }];
      const d = leerDxf(generarDxf(e, ctx, new Map(), lineales));
      const esperadas = leerFormasSvg(lineales.canaletaSVG(largo, 40)).filter((f) => f.tipo === 'rect' && f.width < 10).length;
      const costillas = d.entidades.filter((x) => x.tipo === 'POLYLINE' && x.capa === 'Montaje' && Math.abs(Math.max(...x.vertices.map((v) => v[0])) - Math.min(...x.vertices.map((v) => v[0])) - 4) < 1e-6);
      expect(costillas, `largo ${largo}`).toHaveLength(esperadas);
    }
  });
});

describe('vista frontal exterior en el DXF', () => {
  const casos = [
    { nombre: 'genérica', id: 'caja_metalica_400x500x200' },
    { nombre: 'Lerkenbox ARES', id: 'caja_metalica_ares_400x400x200' },
    { nombre: 'Eldon ASR (inox)', id: 'caja_inox_asr_600x600x210' },
  ];
  describe.each(casos)('caja $nombre', ({ id }) => {
    const ctx = crearContextoDe(bib, { id });
    const { elementos } = armar(ctx, ['automatico_1p', 'diferencial_2p']);
    const vista = calcularVistaFrontal(datosFrontalDeCaja(ctx.caja, bib.gabinetes), 'Tablero Iluminación N°2', 'izquierda');
    const d = leerDxf(generarDxf(elementos, ctx, svgsDe(elementos, ctx), lineales, vista));
    const dx = ctx.caja.ancho + SEPARACION_FRONTAL_MM;
    const frontales = d.entidades.filter((e) => e.capa === 'Caja_Frontal');
    const otras = d.entidades.filter((e) => e.capa !== 'Caja_Frontal');

    const xsDe = (e: (typeof d.entidades)[number]): number[] => {
      if (e.tipo === 'POLYLINE') return e.vertices.map((v) => v[0]);
      if (e.tipo === 'CIRCLE') return [nums(e, 10) - nums(e, 40), nums(e, 10) + nums(e, 40)];
      if (e.tipo === 'LINE') return [nums(e, 10), nums(e, 11)];
      return [nums(e, 10)];
    };
    const ysDe = (e: (typeof d.entidades)[number]): number[] => {
      if (e.tipo === 'POLYLINE') return e.vertices.map((v) => v[1]);
      if (e.tipo === 'CIRCLE') return [nums(e, 20) - nums(e, 40), nums(e, 20) + nums(e, 40)];
      if (e.tipo === 'LINE') return [nums(e, 20), nums(e, 21)];
      return [nums(e, 20)];
    };

    it('la capa Caja_Frontal existe y tiene la vista completa: marco, puerta, placa y su texto', () => {
      expect(d.capas.map((c) => c.nombre)).toContain('Caja_Frontal');
      expect(frontales.filter((e) => e.tipo === 'POLYLINE').length).toBe(vista.rects.length);
      expect(frontales.filter((e) => e.tipo === 'CIRCLE').length).toBe(vista.circulos.length);
      expect(frontales.filter((e) => e.tipo === 'LINE').length).toBe(vista.lineas.length);
      const texto = frontales.find((e) => e.tipo === 'TEXT');
      expect(texto?.g.get(1)?.[0]).toBe('Tablero Iluminacion No2');
    });

    it('el marco mide exactamente la caja y va a 200 mm a la derecha de la vista interior', () => {
      const marco = frontales.filter((e) => e.tipo === 'POLYLINE').find((e) => {
        const xs = e.vertices.map((v) => v[0]);
        return Math.abs(Math.max(...xs) - Math.min(...xs) - ctx.caja.ancho) < 1e-6;
      });
      expect(marco?.vertices).toEqual([
        [dx, 0],
        [dx + ctx.caja.ancho, 0],
        [dx + ctx.caja.ancho, ctx.caja.alto],
        [dx, ctx.caja.alto],
      ]);
      expect(SEPARACION_FRONTAL_MM).toBe(200);
    });

    it('no se superpone con la vista interior: todo lo frontal queda a la derecha de todo lo demás', () => {
      const maxOtras = Math.max(...otras.flatMap(xsDe));
      const minFrontal = Math.min(...frontales.flatMap(xsDe));
      expect(maxOtras).toBeLessThanOrEqual(ctx.caja.ancho + 1e-6);
      expect(minFrontal).toBeGreaterThanOrEqual(dx - 1e-6);
      expect(minFrontal - maxOtras).toBeGreaterThanOrEqual(SEPARACION_FRONTAL_MM - 1e-6);
      // Misma altura que la interior: ambas ocupan de y = 0 a y = alto.
      const ysF = frontales.flatMap(ysDe);
      expect(Math.min(...ysF)).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.max(...ysF)).toBeLessThanOrEqual(ctx.caja.alto + 1e-6);
    });

    it('sin vista frontal el archivo no trae nada en esa capa', () => {
      const sin = leerDxf(generarDxf(elementos, ctx, svgsDe(elementos, ctx), lineales));
      expect(sin.entidades.some((e) => e.capa === 'Caja_Frontal')).toBe(false);
    });
  });
});
