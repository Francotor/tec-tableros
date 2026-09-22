import { describe, expect, it } from 'vitest';
import { calcularAreaUtil, calcularCapacidad, margenesPorDefecto, SECCIONES_CANALETA } from './capacidad';
import type { Capacidad } from './capacidad';
import { cargarBiblioteca } from './ejemplo.testutil';
import type { CapacidadCaja } from './tipos';

const { gabinetes } = cargarBiblioteca();
const { parametros } = gabinetes;
const metalicaEInox = gabinetes.cajas.filter((c) => c.tipo === 'metalica' || c.tipo === 'inox');

function comoCapacidad(m: CapacidadCaja['compacto']): Capacidad {
  return {
    pasoFilasMm: m.paso_filas_mm,
    largoRielMm: m.largo_riel_mm,
    filas: m.filas,
    modulosPorFila: m.modulos_por_fila,
    modulosTotal: m.modulos_total,
    modulosMaxConReserva: m.modulos_max_con_reserva,
  };
}

describe('calcularCapacidad: reproduce exactamente capacidad.* de la biblioteca', () => {
  it('hay al menos una caja metálica y una inox, y todas traen capacidad.compacto/con_canaleta/por_canaleta', () => {
    expect(metalicaEInox.filter((c) => c.tipo === 'metalica').length).toBeGreaterThan(0);
    expect(metalicaEInox.filter((c) => c.tipo === 'inox').length).toBeGreaterThan(0);
    for (const c of metalicaEInox) {
      const cap = c.capacidad as CapacidadCaja | undefined;
      expect(cap?.compacto, c.id).toBeDefined();
      expect(cap?.con_canaleta, c.id).toBeDefined();
      expect(cap?.por_canaleta, c.id).toBeDefined();
    }
  });

  for (const c of metalicaEInox) {
    const cap = c.capacidad as CapacidadCaja;
    const placa = c.placa;
    if (!placa) continue;
    const margenes = margenesPorDefecto(c.layout, parametros.layout);

    it(`${c.id}: compacto`, () => {
      const r = calcularCapacidad(
        placa.ancho,
        placa.alto,
        margenes,
        'compacto',
        parametros.layout.canaleta_defecto_mm as (typeof SECCIONES_CANALETA)[number],
        parametros.layout,
        parametros.modulo_mm,
        parametros.alto_modular_mm,
      );
      expect(r).toEqual(comoCapacidad(cap.compacto));
    });

    it(`${c.id}: con_canaleta (sección por defecto)`, () => {
      const r = calcularCapacidad(
        placa.ancho,
        placa.alto,
        margenes,
        'con_canaleta',
        parametros.layout.canaleta_defecto_mm as (typeof SECCIONES_CANALETA)[number],
        parametros.layout,
        parametros.modulo_mm,
        parametros.alto_modular_mm,
      );
      expect(r).toEqual(comoCapacidad(cap.con_canaleta));
    });

    for (const seccion of SECCIONES_CANALETA) {
      it(`${c.id}: por_canaleta ${seccion} mm`, () => {
        const r = calcularCapacidad(
          placa.ancho,
          placa.alto,
          margenes,
          'con_canaleta',
          seccion,
          parametros.layout,
          parametros.modulo_mm,
          parametros.alto_modular_mm,
        );
        expect(r).toEqual(comoCapacidad(cap.por_canaleta[String(seccion) as '25' | '40' | '60']));
      });
    }
  }
});

describe('calcularCapacidad: margen distinto al por defecto', () => {
  const placa = { ancho: 450, alto: 350 };

  it('un margen mayor reduce el largo del riel y, con él, los módulos por fila', () => {
    const chico = calcularCapacidad(placa.ancho, placa.alto, { lateral: 10, vertical: 10 }, 'compacto', 40, parametros.layout, parametros.modulo_mm, parametros.alto_modular_mm);
    const grande = calcularCapacidad(placa.ancho, placa.alto, { lateral: 40, vertical: 40 }, 'compacto', 40, parametros.layout, parametros.modulo_mm, parametros.alto_modular_mm);
    expect(grande.largoRielMm).toBeLessThan(chico.largoRielMm);
    expect(grande.modulosPorFila).toBeLessThanOrEqual(chico.modulosPorFila);
  });

  it('márgenes lateral y vertical asimétricos se aplican por separado', () => {
    const r = calcularCapacidad(placa.ancho, placa.alto, { lateral: 10, vertical: 60 }, 'compacto', 40, parametros.layout, parametros.modulo_mm, parametros.alto_modular_mm);
    const soloLateral = calcularCapacidad(placa.ancho, placa.alto, { lateral: 10, vertical: 10 }, 'compacto', 40, parametros.layout, parametros.modulo_mm, parametros.alto_modular_mm);
    // El margen vertical no afecta el largo del riel (ancho), solo las filas.
    expect(r.largoRielMm).toBe(soloLateral.largoRielMm);
    expect(r.filas).toBeLessThanOrEqual(soloLateral.filas);
  });

  it('un margen que deja el riel sin espacio da 0 módulos, nunca negativo', () => {
    const r = calcularCapacidad(100, 100, { lateral: 60, vertical: 60 }, 'con_canaleta', 60, parametros.layout, parametros.modulo_mm, parametros.alto_modular_mm);
    expect(r.modulosPorFila).toBe(0);
    expect(r.filas).toBeGreaterThanOrEqual(0);
    expect(r.modulosMaxConReserva).toBe(0);
  });
});

describe('margenesPorDefecto', () => {
  it('usa el margen general cuando la caja no trae layout propio', () => {
    expect(margenesPorDefecto(undefined, parametros.layout)).toEqual({
      lateral: parametros.layout.margen_borde_mm,
      vertical: parametros.layout.margen_borde_mm,
    });
  });

  it('usa el layout de la caja (asimétrico) cuando lo trae', () => {
    const asr = gabinetes.cajas.find((c) => c.layout);
    if (!asr?.layout) throw new Error('se esperaba al menos una caja con layout propio (Eldon ASR)');
    expect(margenesPorDefecto(asr.layout, parametros.layout)).toEqual({
      lateral: asr.layout.margen_lateral_mm,
      vertical: asr.layout.margen_vertical_mm,
    });
  });
});

describe('calcularAreaUtil', () => {
  it('reduce el área por el margen a cada lado', () => {
    expect(calcularAreaUtil({ x: 25, y: 25, w: 450, h: 350 }, { lateral: 20, vertical: 10 })).toEqual({
      x: 45,
      y: 35,
      w: 410,
      h: 330,
    });
  });

  it('no da un área negativa si el margen es mayor que la mitad del área', () => {
    expect(calcularAreaUtil({ x: 0, y: 0, w: 50, h: 50 }, { lateral: 40, vertical: 40 })).toEqual({
      x: 40,
      y: 40,
      w: 0,
      h: 0,
    });
  });
});
