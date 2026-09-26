import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { calcularAvisos } from './avisos';
import { agregarElemento } from './colocacion';
import { puedeDistribuir, distribuirAutomaticamente } from './distribucion';
import { cargarBiblioteca, cargarLinealesDeBiblioteca, crearContextoDe, raizBiblioteca } from './ejemplo.testutil';
import { generarDxf, svgsNecesarios } from './exportarDxf';
import { leerFormasSvg } from './lectorSvg';
import { generarLista, lineasTotales, listaACsv, listaATexto } from './lista';
import { proyectoNuevo, valoresPorDefecto } from './modelo';
import { plantillaDesdeProyecto, proyectoDesdePlantilla, validarPlantilla } from './plantillas';
import { validarProyecto } from './proyectos';
import { carpetaBiblioteca, muestraTotalesDeRielYCanaleta, nombreTipo, usaCapacidadDeRiel, usaCircuitos, validarTipo } from './tipoProyecto';
import { calcularVistaFrontal, datosFrontalDeCaja } from './vistaFrontal';
import { useEditor } from '../store/editor';

describe('tipo de proyecto', () => {
  it('nombres, carpetas y validación', () => {
    expect(nombreTipo('tablero')).toBe('Tablero');
    expect(nombreTipo('medidor')).toBe('Medidor / Empalme');
    expect(carpetaBiblioteca('tablero')).toBe('biblioteca');
    expect(carpetaBiblioteca('medidor')).toBe('biblioteca-medidores');
    expect(validarTipo('medidor')).toBe('medidor');
    expect(validarTipo('tablero')).toBe('tablero');
    expect(validarTipo(undefined)).toBe('tablero');
    expect(validarTipo('otra cosa')).toBe('tablero');
  });

  it('un proyecto o plantilla guardado sin tipo (de antes) es un tablero; uno con tipo lo conserva', () => {
    const p = proyectoNuevo('caja_metalica_400x500x200');
    expect(p.tipo).toBe('tablero');
    const { tipo: _t, ...sin } = p;
    void _t;
    expect(validarProyecto(sin).tipo).toBe('tablero');
    expect(validarProyecto({ ...p, tipo: 'medidor' }).tipo).toBe('medidor');
    const pl = plantillaDesdeProyecto({ ...p, tipo: 'medidor' }, 'Empalme');
    expect(pl.tipo).toBe('medidor');
    expect(validarPlantilla(JSON.parse(JSON.stringify(pl))).tipo).toBe('medidor');
    const { tipo: _u, ...plSin } = pl;
    void _u;
    expect(validarPlantilla(plSin).tipo).toBe('tablero');
    expect(proyectoDesdePlantilla(pl).tipo).toBe('medidor');
  });

  it('solo los tableros usan la capacidad por fila de riel (con su reserva del 25 %) y el modo compacto/con canaleta', () => {
    expect(usaCapacidadDeRiel('tablero')).toBe(true);
    expect(usaCapacidadDeRiel('medidor')).toBe(false);
  });
});

describe('biblioteca de medidores (datos de prueba)', () => {
  const bib = cargarBiblioteca('medidor');

  it('tiene el mismo formato de fichas y una caja y una pieza de prueba', () => {
    expect(bib.gabinetes.cajas).toHaveLength(1);
    expect(bib.catalogo.componentes).toHaveLength(1);
    expect(bib.gabinetes.cajas[0]?.tipo).toBe('metalica');
    expect(bib.catalogo.componentes[0]?.montaje).toBe('libre');
  });

  it('sus SVG existen y el lector de SVG los entiende (rect, circle y line)', () => {
    const raiz = raizBiblioteca('medidor');
    for (const ruta of [...bib.catalogo.componentes.map((c) => c.svg), ...bib.gabinetes.cajas.map((c) => c.svg)]) {
      const formas = leerFormasSvg(readFileSync(join(raiz, ruta), 'utf8'));
      expect(formas.length, ruta).toBeGreaterThan(0);
    }
  });

  it('el contexto de un medidor no trae capacidad de riel ni reserva; el de un tablero sí', () => {
    const cajaMed = { id: bib.gabinetes.cajas[0]!.id };
    const ctxMed = crearContextoDe(bib, cajaMed, { tipo: 'medidor' });
    expect(ctxMed.tipo).toBe('medidor');
    expect(ctxMed.capacidad).toBeNull();
    expect(puedeDistribuir(ctxMed)).toBe(false);
    const tab = cargarBiblioteca('tablero');
    const ctxTab = crearContextoDe(tab, { id: 'caja_metalica_400x500x200' });
    expect(ctxTab.tipo).toBe('tablero');
    expect(ctxTab.capacidad?.modulosMaxConReserva).toBeGreaterThan(0);
  });

  it('se puede colocar la pieza, listar, avisar, exportar a DXF y dibujar la vista frontal con el motor de siempre', async () => {
    const ctx = crearContextoDe(bib, { id: bib.gabinetes.cajas[0]!.id }, { tipo: 'medidor' });
    const comp = bib.catalogo.componentes[0]!;
    const c = agregarElemento([], ctx, comp.id, { x: 200, y: 300 }, valoresPorDefecto(comp));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    // Lista de materiales
    const lista = generarLista(c.elementos, ctx);
    expect(lista.lineas.map((l) => l.descripcion)).toContain('Medidor monofásico (dato de prueba)');
    // Avisos: sin comparación de módulos por fila
    expect(calcularAvisos(c.elementos, ctx, null).filter((a) => a.id.startsWith('fila'))).toEqual([]);
    // "Distribuir" se rechaza con motivo
    expect(distribuirAutomaticamente(c.elementos, ctx).ok).toBe(false);
    // DXF
    const raiz = raizBiblioteca('medidor');
    const svgs = new Map(svgsNecesarios(c.elementos, ctx).map((r) => [r, readFileSync(join(raiz, r), 'utf8')]));
    const gabinete = bib.gabinetes.cajas[0]!;
    const vista = calcularVistaFrontal(datosFrontalDeCaja(ctx.caja, bib.gabinetes), 'Empalme', 'izquierda');
    const dxf = generarDxf(c.elementos, ctx, svgs, await cargarLinealesDeBiblioteca(), vista);
    expect(dxf).toContain('Caja_Frontal');
    expect(dxf.startsWith('0\r\nSECTION')).toBe(true);
    // Vista frontal con los datos de la caja de prueba (2 cierres, 2 bisagras, 1 puerta)
    expect(vista.circulos).toHaveLength(gabinete.cierres as number);
    expect(vista.rects.filter((r) => r.capa === 'bisagra')).toHaveLength(gabinete.bisagras ?? 0);
    expect([vista.ancho, vista.alto]).toEqual([gabinete.ancho_mm, gabinete.alto_mm]);
  });
});

describe('cambio de tipo en el editor (solo con el proyecto vacío)', () => {
  beforeEach(() => useEditor.getState().nuevoProyecto());

  it('un proyecto nuevo es un tablero y se puede pedir uno de medidor', () => {
    expect(useEditor.getState().proyecto.tipo).toBe('tablero');
    useEditor.getState().nuevoProyecto('medidor');
    expect(useEditor.getState().proyecto.tipo).toBe('medidor');
  });

  it('vacío, el tipo se cambia; con una pieza colocada, se rechaza y no cambia nada', () => {
    const e = useEditor.getState();
    expect(e.setTipoProyecto('medidor')).toBe(true);
    expect(useEditor.getState().proyecto.tipo).toBe('medidor');
    expect(useEditor.getState().setTipoProyecto('tablero')).toBe(true);
    useEditor.setState((s) => ({
      proyecto: { ...s.proyecto, elementos: [{ uid: 'a', componenteId: 'riel_din', x_mm: 0, y_mm: 0, largo_mm: 100, valores: {} }] },
    }));
    expect(useEditor.getState().setTipoProyecto('medidor')).toBe(false);
    expect(useEditor.getState().proyecto.tipo).toBe('tablero');
    expect(useEditor.getState().aviso?.texto).toMatch(/no se puede cambiar/);
  });

  it('al cambiar de tipo, la caja que no existe en la otra biblioteca se reemplaza por la primera de ella', () => {
    const med = cargarBiblioteca('medidor');
    const e = useEditor.getState();
    e.setTipoProyecto('medidor');
    expect(useEditor.getState().proyecto.caja).toEqual({ id: 'caja_metalica_400x500x200' });
    useEditor.getState().reconciliarCaja(med.gabinetes);
    expect(useEditor.getState().proyecto.caja).toEqual({ id: med.gabinetes.cajas[0]!.id });
    // Idempotente, y no toca una caja que sí existe.
    useEditor.getState().reconciliarCaja(med.gabinetes);
    expect(useEditor.getState().proyecto.caja).toEqual({ id: med.gabinetes.cajas[0]!.id });
  });

  it('con piezas colocadas no se cambia la caja aunque no exista (no se reescribe un proyecto con contenido)', () => {
    useEditor.setState((s) => ({
      proyecto: { ...s.proyecto, elementos: [{ uid: 'a', componenteId: 'riel_din', x_mm: 0, y_mm: 0, largo_mm: 100, valores: {} }] },
    }));
    useEditor.getState().reconciliarCaja(cargarBiblioteca('medidor').gabinetes);
    expect(useEditor.getState().proyecto.caja).toEqual({ id: 'caja_metalica_400x500x200' });
  });
});

describe('un empalme (medidor) no tiene circuitos ni totales de riel y canaleta', () => {
  const bib = cargarBiblioteca('medidor');
  const cajaId = bib.gabinetes.cajas[0]!.id;
  const comp = bib.catalogo.componentes[0]!;

  function empalme() {
    const ctx = crearContextoDe(bib, { id: cajaId }, { tipo: 'medidor' });
    const c = agregarElemento([], ctx, comp.id, { x: 200, y: 300 }, valoresPorDefecto(comp));
    if (!c.ok) throw new Error(c.motivo);
    return { ctx, elementos: c.elementos };
  }

  it('las reglas por tipo', () => {
    expect(usaCircuitos('tablero')).toBe(true);
    expect(usaCircuitos('medidor')).toBe(false);
    expect(muestraTotalesDeRielYCanaleta('tablero')).toBe(true);
    expect(muestraTotalesDeRielYCanaleta('medidor')).toBe(false);
  });

  it('la lista de materiales de un medidor trae solo nombres de componentes, sin "Total riel DIN" ni "Total canaleta"', () => {
    const { ctx, elementos } = empalme();
    const lista = generarLista(elementos, ctx);
    expect(lista.conTotales).toBe(false);
    expect(lineasTotales(lista)).toEqual([]);
    expect(lista.lineas.map((l) => l.descripcion).join('\n')).not.toMatch(/riel|canaleta|circuito|reserva/i);
    const texto = listaATexto(lista);
    expect(texto).not.toMatch(/Total|riel|canaleta|circuito|reserva/i);
    expect(texto.endsWith('\n')).toBe(false);
    expect(listaACsv(lista)).not.toMatch(/Total|riel|canaleta|circuito|reserva/i);
  });

  it('la lista de un tablero sigue igual: con sus totales de riel y canaleta', () => {
    const tab = cargarBiblioteca('tablero');
    const ctx = crearContextoDe(tab, { id: 'caja_metalica_400x500x200' });
    const lista = generarLista([], ctx);
    expect(lista.conTotales).toBe(true);
    expect(lineasTotales(lista).map((t) => t.descripcion)).toEqual(['Total riel DIN', 'Total canaleta']);
    expect(listaATexto(lista)).toContain('Total riel DIN: 0 m');
  });

  it('el DXF de un empalme no lleva ningún texto de circuito ni de reserva', async () => {
    const { ctx, elementos } = empalme();
    const raiz = raizBiblioteca('medidor');
    const svgs = new Map(svgsNecesarios(elementos, ctx).map((r) => [r, readFileSync(join(raiz, r), 'utf8')]));
    const dxf = generarDxf(elementos, ctx, svgs, await cargarLinealesDeBiblioteca());
    expect(dxf).not.toMatch(/circuito|reserva|riel/i);
  });
});
