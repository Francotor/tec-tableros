import { describe, expect, it } from 'vitest';
import { resolverCaja } from './caja';
import { cargarBiblioteca } from './ejemplo.testutil';
import { solapan } from './geometria';
import type { Rect } from './geometria';
import { calcularVistaFrontal, contarCierres, datosFrontalDeCaja, MARCO_MM } from './vistaFrontal';
import type { DatosCajaFrontal, VistaFrontal } from './vistaFrontal';

const bib = cargarBiblioteca();
const datosDe = (id: string): DatosCajaFrontal => {
  const caja = resolverCaja({ id }, bib.gabinetes);
  if (!caja) throw new Error(`falta ${id}`);
  return datosFrontalDeCaja(caja, bib.gabinetes);
};
const cajaCatalogo = (id: string) => bib.gabinetes.cajas.find((c) => c.id === id)!;

const rectsDe = (v: VistaFrontal, capa: string): Rect[] => v.rects.filter((r) => r.capa === capa);
const contenido = (ext: Rect, r: Rect): boolean => r.x >= ext.x - 1e-9 && r.y >= ext.y - 1e-9 && r.x + r.w <= ext.x + ext.w + 1e-9 && r.y + r.h <= ext.y + ext.h + 1e-9;

/** El marco mide exactamente la caja, la puerta queda dentro y todo lo demás dentro de la puerta o del marco. */
function verificarMedidas(v: VistaFrontal, datos: DatosCajaFrontal): void {
  const marco = rectsDe(v, 'marco');
  expect(marco).toHaveLength(1);
  expect(marco[0]).toMatchObject({ x: 0, y: 0, w: datos.ancho_mm, h: datos.alto_mm });
  expect([v.ancho, v.alto]).toEqual([datos.ancho_mm, datos.alto_mm]);
  const hojas = rectsDe(v, 'puerta');
  expect(hojas.length).toBe(datos.puertas === 2 ? 2 : 1);
  const anchoHojas = hojas.reduce((s, h) => s + h.w, 0);
  expect(anchoHojas).toBeCloseTo(datos.ancho_mm - 2 * MARCO_MM, 9);
  for (const h of hojas) {
    expect(h.h).toBeCloseTo(datos.alto_mm - 2 * MARCO_MM, 9);
    expect(contenido(marco[0]!, h)).toBe(true);
  }
  for (const r of v.rects) expect(contenido(marco[0]!, r), `${r.capa} dentro del marco`).toBe(true);
  for (const c of v.circulos) expect(contenido(marco[0]!, { x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r })).toBe(true);
}

/** La placa de identificación no pisa ninguna bisagra ni cierre. */
function placaLibre(v: VistaFrontal): void {
  const placa = rectsDe(v, 'placa')[0]!;
  for (const b of rectsDe(v, 'bisagra')) expect(solapan(placa, b), 'placa vs bisagra').toBe(false);
  for (const c of v.circulos) expect(solapan(placa, { x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r }), 'placa vs cierre').toBe(false);
}

describe('vista frontal exterior', () => {
  it('caja con todos los datos: puerta, marco, bisagras, cierres, segunda hoja y placa', () => {
    const datos: DatosCajaFrontal = { ancho_mm: 800, alto_mm: 600, cierres: 3, bisagras: 3, puertas: 2 };
    const v = calcularVistaFrontal(datos, 'Tablero general');
    verificarMedidas(v, datos);
    expect(rectsDe(v, 'puerta')).toHaveLength(2);
    // Con dos hojas: 3 bisagras en cada costado exterior y 3 cierres en el centro.
    expect(rectsDe(v, 'bisagra')).toHaveLength(6);
    expect(v.circulos.filter((c) => c.capa === 'cierre')).toHaveLength(3);
    const seam = MARCO_MM + (800 - 2 * MARCO_MM) / 2;
    for (const c of v.circulos) expect(c.cx).toBeCloseTo(seam, 9);
    expect(v.placa.texto).toBe('Tablero general');
    expect(rectsDe(v, 'placa')).toHaveLength(1);
    placaLibre(v);
  });

  it('caja sin ningún dato: solo el marco, la puerta y la placa', () => {
    const datos = datosDe('caja_metalica_400x500x200');
    expect(datos).toEqual({ ancho_mm: cajaCatalogo('caja_metalica_400x500x200').ancho_mm, alto_mm: cajaCatalogo('caja_metalica_400x500x200').alto_mm });
    const v = calcularVistaFrontal(datos, 'Obra 1');
    verificarMedidas(v, datos);
    expect(v.rects.map((r) => r.capa).sort()).toEqual(['marco', 'placa', 'puerta']);
    expect(v.circulos).toHaveLength(0);
    expect(v.lineas).toHaveLength(0);
  });

  it('caja plástica embutida: medidas de la caja y sin detalles', () => {
    const c = cajaCatalogo('caja_plastica_embutida_2f');
    const datos = datosDe('caja_plastica_embutida_2f');
    expect([datos.ancho_mm, datos.alto_mm]).toEqual([c.ancho_mm, c.alto_mm]);
    const v = calcularVistaFrontal(datos, 'Casa');
    verificarMedidas(v, datos);
    expect(v.rects.map((r) => r.capa).sort()).toEqual(['marco', 'placa', 'puerta']);
  });

  it('cajas de catálogo con datos: bisagras y cierres numéricos', () => {
    const conDatos = bib.gabinetes.cajas.find((c) => typeof c.cierres === 'number' && c.bisagras !== undefined)!;
    const datos = datosDe(conDatos.id);
    const v = calcularVistaFrontal(datos, 'X');
    verificarMedidas(v, datos);
    expect(rectsDe(v, 'bisagra')).toHaveLength(conDatos.bisagras ?? 0);
    expect(v.circulos).toHaveLength(Number(conDatos.cierres));
    placaLibre(v);
  });

  it('caja de catálogo con dos puertas: segunda hoja y bisagras a ambos lados', () => {
    const dos = bib.gabinetes.cajas.find((c) => c.puertas === 2 && contarCierres(c.cierres) > 0)!;
    const datos = datosDe(dos.id);
    const v = calcularVistaFrontal(datos, 'X');
    verificarMedidas(v, datos);
    expect(rectsDe(v, 'puerta')).toHaveLength(2);
    expect(v.circulos).toHaveLength(contarCierres(dos.cierres));
    placaLibre(v);
  });

  it('todas las cajas del catálogo: medidas exactas y placa sin pisar nada', () => {
    for (const c of bib.gabinetes.cajas) {
      const datos = datosDe(c.id);
      expect([datos.ancho_mm, datos.alto_mm], c.id).toEqual([c.ancho_mm, c.alto_mm]);
      for (const lado of ['izquierda', 'derecha'] as const) {
        const v = calcularVistaFrontal(datos, 'Tablero', lado);
        verificarMedidas(v, datos);
        placaLibre(v);
      }
    }
  });

  it('caja de medida libre: usa el ancho y alto del proyecto', () => {
    const caja = resolverCaja({ libre: { ancho_mm: 700, alto_mm: 900, tipo: 'metalica' } }, bib.gabinetes)!;
    const datos = datosFrontalDeCaja(caja, bib.gabinetes);
    expect(datos).toEqual({ ancho_mm: 700, alto_mm: 900 });
    verificarMedidas(calcularVistaFrontal(datos, 'Libre'), datos);
  });

  it('las bisagras van a la izquierda por defecto y a la derecha si se pide; los cierres, en el lado contrario', () => {
    const datos: DatosCajaFrontal = { ancho_mm: 600, alto_mm: 800, cierres: 2, bisagras: 2 };
    const centro = (r: Rect) => r.x + r.w / 2;
    const izq = calcularVistaFrontal(datos, 'A');
    const der = calcularVistaFrontal(datos, 'A', 'derecha');
    const mitad = 600 / 2;
    for (const b of rectsDe(izq, 'bisagra')) expect(centro(b)).toBeLessThan(mitad);
    for (const c of izq.circulos) expect(c.cx).toBeGreaterThan(mitad);
    for (const b of rectsDe(der, 'bisagra')) expect(centro(b)).toBeGreaterThan(mitad);
    for (const c of der.circulos) expect(c.cx).toBeLessThan(mitad);
    // La placa queda en la esquina superior del lado de las bisagras.
    expect(centro(rectsDe(izq, 'placa')[0]!)).toBeLessThan(mitad);
    expect(centro(rectsDe(der, 'placa')[0]!)).toBeGreaterThan(mitad);
    expect(rectsDe(izq, 'placa')[0]!.y).toBeLessThan(800 * 0.1);
  });

  it('el dato de cierres se interpreta: "2" y "1*" cuentan; "M.O." no dice cuántos, así que no se dibuja', () => {
    expect(contarCierres(2)).toBe(2);
    expect(contarCierres('2')).toBe(2);
    expect(contarCierres('1*')).toBe(1);
    expect(contarCierres('M.O.')).toBe(0);
    expect(contarCierres(undefined)).toBe(0);
    expect(contarCierres(0)).toBe(0);
    const v = calcularVistaFrontal({ ancho_mm: 500, alto_mm: 500, cierres: 'M.O.' }, 'X');
    expect(v.circulos).toHaveLength(0);
  });

  it('un nombre vacío deja la placa con un texto de respaldo', () => {
    expect(calcularVistaFrontal({ ancho_mm: 300, alto_mm: 300 }, '   ').placa.texto).toBe('Tablero');
  });
});
