import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agruparPorCategoria, parsearBiblioteca, parsearCatalogo, rotuloCategoria } from './biblioteca';
import { agregarElemento } from './colocacion';
import { puedeConectarse } from './conexion';
import { cargarBiblioteca, cargarLinealesDeBiblioteca, crearContextoDe, raizBiblioteca } from './ejemplo.testutil';
import { CAPAS_DXF, capasDxf, generarDxf, nombreCapa, svgsNecesarios } from './exportarDxf';
import { leerDxf } from './dxf.testutil';
import { valoresPorDefecto } from './modelo';
import type { Biblioteca, Componente } from './tipos';

const tablero = cargarBiblioteca('tablero');
const medidor = cargarBiblioteca('medidor');

/** Catálogo de prueba con las categorías reales de medidores: "medidor" e "interruptor_caja_moldeada". */
function bibliotecaConDosCategorias(): Biblioteca {
  const base = medidor.catalogo.componentes[0]!;
  const interruptor: Componente = { ...base, id: 'interruptor_prueba', nombre: 'Interruptor de caja moldeada (prueba)', categoria: 'interruptor_caja_moldeada', ancho_mm: 111, alto_mm: 130 } as Componente;
  const catalogo = { ...medidor.catalogo, componentes: [{ ...base, categoria: 'medidor' }, interruptor] };
  return parsearBiblioteca(JSON.parse(JSON.stringify(catalogo)), JSON.parse(JSON.stringify(medidor.gabinetes)));
}

describe('categorías leídas del catálogo', () => {
  it('un catálogo con categorías propias (medidor, interruptor_caja_moldeada) se carga sin error', () => {
    const bib = bibliotecaConDosCategorias();
    expect(bib.catalogo.componentes.map((c) => c.categoria)).toEqual(['medidor', 'interruptor_caja_moldeada']);
  });

  it('una categoría vacía o ausente sí se rechaza', () => {
    const c = JSON.parse(JSON.stringify(medidor.catalogo));
    c.componentes[0].categoria = '';
    expect(() => parsearCatalogo(c)).toThrow(/sin categoría/);
    delete c.componentes[0].categoria;
    expect(() => parsearCatalogo(c)).toThrow(/sin categoría/);
  });

  it('agrupa por las categorías que hay, en orden de aparición, y omite las vacías', () => {
    const bib = bibliotecaConDosCategorias();
    const grupos = agruparPorCategoria(bib.catalogo.componentes);
    expect(grupos.map((g) => g.categoria)).toEqual(['medidor', 'interruptor_caja_moldeada']);
    expect(grupos.map((g) => g.componentes.length)).toEqual([1, 1]);
  });

  it('el campo opcional "categorias" del catálogo fija el orden (y una categoría sin piezas no aparece)', () => {
    const bib = bibliotecaConDosCategorias();
    const grupos = agruparPorCategoria(bib.catalogo.componentes, ['interruptor_caja_moldeada', 'medidor', 'vacia']);
    expect(grupos.map((g) => g.categoria)).toEqual(['interruptor_caja_moldeada', 'medidor']);
  });

  it('el catálogo de tableros sigue mostrando sus 5 categorías en el orden de siempre', () => {
    expect(agruparPorCategoria(tablero.catalogo.componentes).map((g) => g.categoria)).toEqual(['Protecciones', 'Comando', 'Control', 'Distribucion', 'Montaje']);
    expect(agruparPorCategoria(tablero.catalogo.componentes).map((g) => g.componentes.length)).toEqual([10, 3, 8, 12, 5]);
  });

  it('el nombre para mostrar se arma del identificador', () => {
    expect(rotuloCategoria('interruptor_caja_moldeada')).toBe('Interruptor caja moldeada');
    expect(rotuloCategoria('medidor')).toBe('Medidor');
    expect(rotuloCategoria('Protecciones')).toBe('Protecciones');
  });

  it('una pieza de cualquier categoría (salvo Montaje) se puede conectar', () => {
    for (const c of bibliotecaConDosCategorias().catalogo.componentes) expect(puedeConectarse(c)).toBe(true);
  });
});

describe('capas del DXF por categoría', () => {
  it('nombres válidos en R12: sin tildes ni espacios, y sin chocar con las capas propias', () => {
    expect(nombreCapa('medidor')).toBe('medidor');
    expect(nombreCapa('interruptor_caja_moldeada')).toBe('interruptor_caja_moldeada');
    expect(nombreCapa('Protección eléctrica')).toBe('Proteccion_electrica');
    expect(nombreCapa('caja')).toBe('Cat_caja');
    expect(nombreCapa('Texto')).toBe('Cat_Texto');
    expect(nombreCapa('a/b*c')).toBe('a_b_c');
  });

  it('una capa por categoría, sin repetir, más Caja, Caja_Frontal y Texto; los colores de tablero no cambian', () => {
    const capas = capasDxf(['medidor', 'interruptor_caja_moldeada', 'medidor']);
    expect(capas.map((c) => c.nombre)).toEqual(['medidor', 'interruptor_caja_moldeada', 'Caja', 'Caja_Frontal', 'Texto']);
    expect(new Set(capas.map((c) => c.color)).size).toBe(capas.length);
    expect(CAPAS_DXF.map((c) => c.nombre)).toEqual(['Protecciones', 'Comando', 'Control', 'Distribucion', 'Montaje', 'Caja', 'Caja_Frontal', 'Texto']);
    expect(CAPAS_DXF.slice(0, 5).map((c) => c.color)).toEqual([1, 5, 3, 4, 8]);
  });

  it('el DXF de un proyecto con las dos categorías trae una capa por cada una y cada pieza en la suya', async () => {
    const bib = bibliotecaConDosCategorias();
    const ctx = crearContextoDe(bib, { id: bib.gabinetes.cajas[0]!.id }, { tipo: 'medidor' });
    let elementos: import('./modelo').Elemento[] = [];
    for (const [i, comp] of bib.catalogo.componentes.entries()) {
      const c = agregarElemento(elementos, ctx, comp.id, { x: 100 + i * 200, y: 150 }, valoresPorDefecto(comp));
      if (!c.ok) throw new Error(c.motivo);
      elementos = c.elementos;
    }
    const raiz = raizBiblioteca('medidor');
    const svgs = new Map(svgsNecesarios(elementos, ctx).map((r) => [r, readFileSync(join(raiz, r), 'utf8')]));
    const d = leerDxf(generarDxf(elementos, ctx, svgs, await cargarLinealesDeBiblioteca()));
    expect(d.capas.map((c) => c.nombre)).toEqual(['medidor', 'interruptor_caja_moldeada', 'Caja', 'Caja_Frontal', 'Texto']);
    expect(d.entidades.some((e) => e.capa === 'medidor')).toBe(true);
    expect(d.entidades.some((e) => e.capa === 'interruptor_caja_moldeada')).toBe(true);
    for (const e of d.entidades) expect(d.capas.map((c) => c.nombre)).toContain(e.capa);
  });
});

describe('gabinetes.json sin "parametros" (el de medidores no los trae)', () => {
  it('se carga con los parámetros de diseño por defecto y el editor puede armar su contexto', () => {
    const gab = JSON.parse(JSON.stringify(medidor.gabinetes));
    delete gab.parametros;
    const bib = parsearBiblioteca(JSON.parse(JSON.stringify(medidor.catalogo)), gab);
    expect(bib.gabinetes.parametros.layout.margen_borde_mm).toBe(20);
    expect(bib.gabinetes.parametros.modulo_mm).toBe(18);
    const ctx = crearContextoDe(bib, { id: bib.gabinetes.cajas[0]!.id }, { tipo: 'medidor' });
    expect(ctx.capacidad).toBeNull();
    expect(ctx.caja.area.w).toBeGreaterThan(0);
  });

  it('si trae parametros, se respetan', () => {
    expect(tablero.gabinetes.parametros.layout.holgura_mm).toBe(10);
  });
});
