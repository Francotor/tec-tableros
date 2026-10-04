import { describe, expect, it } from 'vitest';
import {
  agregarElemento,
  borrarElemento,
  buscarColision,
  cambiarLargo,
  cambiarLargoDesdeExtremo,
  duplicarElemento,
  extenderAAreaUtil,
  huella,
  listarPiezas,
  listarRieles,
  moverElemento,
  moverX,
  rotarElemento,
} from './colocacion';
import type { Cambio, Contexto } from './colocacion';
import { distribuirAutomaticamente } from './distribucion';
import { armarEjemplo, cargarBiblioteca, crearContextoDe } from './ejemplo.testutil';
import { contiene } from './geometria';
import { valoresPorDefecto } from './modelo';
import type { Elemento } from './modelo';
import { calcularOcupacion } from './ocupacion';

/** PRNG determinista (mulberry32): las secuencias son reproducibles. */
function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bib = cargarBiblioteca();
const COMPONENTES = bib.catalogo.componentes.filter((c) => c.id !== 'tope_riel').map((c) => c.id);

/**
 * Invariantes que el editor debe sostener después de CUALQUIER operación aceptada:
 *  1. ninguna pieza se superpone con otra (salvo un aparato sobre su propio riel),
 *  2. todo aparato de riel está sobre algún riel,
 *  3. ninguna fila de riel tiene más módulos que la capacidad de su riel (nada "inexplicable" en el indicador).
 */
function verificar(elementos: readonly Elemento[], ctx: Contexto, contexto: string): void {
  const piezas = listarPiezas(elementos, ctx);
  for (const p of piezas) {
    const choca = buscarColision(p, piezas, new Set([p.uid]));
    expect(choca, `${contexto}: ${p.uid} (${p.clase}) choca con ${choca?.uid} (${choca?.clase})`).toBeUndefined();
    if (p.clase === 'aparato') expect(p.rielUid, `${contexto}: aparato ${p.uid} fuera de todo riel`).toBeDefined();
  }
  const o = calcularOcupacion(elementos, ctx);
  for (const f of o?.filas ?? []) expect(f.estado, `${contexto}: fila ${f.numero} excedida (${f.modulos} de ${f.capacidad})`).not.toBe('excede');
}

interface Caso {
  nombre: string;
  caja: { id: string };
  conEjemplo: boolean;
}

const CASOS: Caso[] = [
  { nombre: 'metálica 400x500', caja: { id: 'caja_metalica_400x500x200' }, conEjemplo: false },
  { nombre: 'metálica 400x500 desde el ejemplo', caja: { id: 'caja_metalica_400x500x200' }, conEjemplo: true },
  { nombre: 'inox con pernos (ASR)', caja: { id: 'caja_inox_asr_600x600x210' }, conEjemplo: false },
  { nombre: 'plástica 2 filas', caja: { id: 'caja_plastica_sobrepuesta_2f' }, conEjemplo: false },
];

let totalAceptadas = 0;

describe('el editor nunca acepta un estado con piezas superpuestas ni filas excedidas (fuzz con semillas fijas)', () => {
  for (const caso of CASOS) {
    for (const semilla of Array.from({ length: Number(process.env.FUZZ_SEMILLAS ?? 6) }, (_, k) => k + 1)) {
      it(`${caso.nombre}, semilla ${semilla}: 250 operaciones al azar`, () => {
        const ctx = crearContextoDe(bib, caso.caja);
        const rnd = aleatorio(semilla * 7919 + caso.caja.id.length);
        const area = ctx.caja.area;
        let els: Elemento[] = caso.conEjemplo ? armarEjemplo(ctx) : [];
        // Dos rieles para que haya donde montar (las plásticas ya traen los suyos).
        if (!caso.conEjemplo && ctx.caja.permiteRieles) {
          for (const fy of [0.25, 0.65]) {
            const riel = agregarElemento(els, ctx, 'riel_din', { x: area.x + area.w / 2, y: area.y + area.h * fy }, valoresPorDefecto(ctx.comps.get('riel_din')!));
            if (riel.ok) els = riel.elementos;
          }
        }
        // Mitad de los puntos al azar en toda la placa y mitad cerca de un riel (donde se montan los aparatos).
        const punto = () => {
          const rieles = listarRieles(els, ctx);
          const cerca = rieles.length > 0 && rnd() < 0.5 ? rieles[Math.floor(rnd() * rieles.length)] : undefined;
          return cerca ? { x: cerca.x + rnd() * cerca.largo, y: cerca.yCentro + (rnd() - 0.5) * 10 } : { x: area.x + rnd() * area.w, y: area.y + rnd() * area.h };
        };
        const elegir = (): Elemento | undefined => (els.length === 0 ? undefined : els[Math.floor(rnd() * els.length)]);
        let aceptadas = 0;

        for (let i = 0; i < 250; i++) {
          const op = Math.floor(rnd() * 11);
          let r: Cambio;
          const el = elegir();
          if (op <= 3 || !el) {
            const id = COMPONENTES[Math.floor(rnd() * COMPONENTES.length)]!;
            r = agregarElemento(els, ctx, id, punto(), valoresPorDefecto(ctx.comps.get(id)!));
          } else if (op === 4 || op === 5) {
            r = moverElemento(els, ctx, el.uid, punto(), { sinSnap: rnd() < 0.5 });
          } else if (op === 6) {
            r = moverX(els, ctx, el.uid, area.x + rnd() * area.w);
          } else if (op === 7) {
            r = cambiarLargo(els, ctx, el.uid, 50 + Math.floor(rnd() * 500));
          } else if (op === 8) {
            r = cambiarLargoDesdeExtremo(els, ctx, el.uid, rnd() < 0.5 ? 'inicio' : 'fin', area.x + rnd() * area.w);
          } else if (op === 9) {
            r = rnd() < 0.5 ? duplicarElemento(els, ctx, el.uid) : rotarElemento(els, ctx, el.uid);
          } else {
            r = rnd() < 0.3 ? extenderAAreaUtil(els, ctx, el.uid) : rnd() < 0.5 ? borrarElemento(els, ctx, el.uid) : distribuirAutomaticamente(els, ctx);
          }
          if (r.ok) {
            els = r.elementos;
            aceptadas++;
            for (const e of els) {
              const comp = ctx.comps.get(e.componenteId);
              if (comp) expect(contiene(area, huella(e, comp)), `${caso.nombre}#${semilla} op ${i}: ${e.componenteId} fuera de la placa`).toBe(true);
            }
            verificar(els, ctx, `${caso.nombre}#${semilla} op ${i} (tipo ${op})`);
          }
        }
        totalAceptadas += aceptadas;
      });
    }
  }
});

describe('el fuzz no es vacuo', () => {
  it('el azar tuvo operaciones aceptadas de sobra que verificar (de todo tipo, en todas las cajas)', () => {
    expect(totalAceptadas).toBeGreaterThan(CASOS.length * 6 * 40);
  });
});
