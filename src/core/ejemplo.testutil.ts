import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsearBiblioteca } from './biblioteca';
import { resolverCaja } from './caja';
import type { Margenes, Modo, SeccionCanaleta } from './capacidad';
import { crearContexto, resolverColocacion } from './colocacion';
import type { AjustesCapacidad, Contexto } from './colocacion';
import { margenesEfectivos } from './margenes';
import { valoresPorDefecto } from './modelo';
import type { CajaProyecto, Elemento } from './modelo';
import type { Biblioteca } from './tipos';

export const RAIZ_BIBLIOTECA = join(process.cwd(), 'public', 'biblioteca');

const leer = (f: string): unknown => JSON.parse(readFileSync(join(RAIZ_BIBLIOTECA, f), 'utf8'));

export function cargarBiblioteca(): Biblioteca {
  return parsearBiblioteca(leer('catalogo.json'), leer('gabinetes.json'));
}

/**
 * Contexto con los ajustes de capacidad por defecto (margen de la caja, modo 'compacto',
 * sección de canaleta 40 mm), salvo que se pasen `ajustes` explícitos.
 */
export function crearContextoDe(bib: Biblioteca, caja: CajaProyecto, ajustes?: Partial<AjustesCapacidad>): Contexto {
  const c = resolverCaja(caja, bib.gabinetes);
  if (!c) throw new Error('caja inexistente');
  const margenes: Margenes = ajustes?.margenes ?? margenesEfectivos({ margenBordeManual: false, margenBorde_mm: null }, caja, bib.gabinetes);
  return crearContexto(bib.catalogo, c, {
    margenes,
    modo: ajustes?.modo ?? ('compacto' as Modo),
    seccionCanaleta: ajustes?.seccionCanaleta ?? (bib.gabinetes.parametros.layout.canaleta_defecto_mm as SeccionCanaleta),
    parametrosLayout: bib.gabinetes.parametros.layout,
    moduloMm: bib.gabinetes.parametros.modulo_mm,
    altoModularMm: bib.gabinetes.parametros.alto_modular_mm,
    topes: ajustes?.topes,
  });
}

/**
 * Arma por código el mismo tablero de ejemplo_tablero_armado.svg (caja 400 x 500 x 200, dos filas),
 * con las mismas coordenadas que usa generar_biblioteca.py.
 */
export function armarEjemplo(ctx: Contexto): Elemento[] {
  let els: Elemento[] = [];
  const agregar = (id: string, x: number, y: number, extra: Elemento['valores'], largo?: number): void => {
    const comp = ctx.comps.get(id);
    if (!comp) throw new Error(`falta ${id}`);
    const ancho = comp.ancho_mm ?? largo ?? 0;
    const r = resolverColocacion(els, ctx, { comp, punto: { x: x + ancho / 2, y }, largo_mm: largo, sinSnap: true });
    if (!r.ok) throw new Error(`${id} en x=${x}: ${r.motivo}`);
    els = [
      ...els,
      {
        uid: `${id}@${x},${y}`,
        componenteId: id,
        x_mm: r.x_mm,
        y_mm: r.y_mm,
        largo_mm: r.largo_mm,
        valores: { ...valoresPorDefecto(comp), ...extra },
      },
    ];
  };

  // Canaletas y rieles de 396 mm desde x = 52.
  for (const y of [33, 164, 295]) agregar('canaleta_25', 52, y + 12.5, {}, 396);
  for (const yc of [111, 242]) agregar('riel_din', 52, yc, {}, 396);

  const fila = (yc: number, x0: number, items: [string, Elemento['valores']?, number?][]): void => {
    let x = x0;
    for (const [id, extra, hueco] of items) {
      if (hueco) x += hueco;
      agregar(id, x, yc, extra ?? {});
      x += ctx.comps.get(id)?.ancho_mm ?? 0;
    }
  };
  fila(111, 61, [
    ['automatico_2p', { amperaje: 40 }],
    ['diferencial_2p'],
    ['automatico_1p', { amperaje: 10 }],
    ['automatico_1p', { amperaje: 10 }],
    ['automatico_1p', { amperaje: 16 }],
    ['automatico_1p', { amperaje: 16 }],
    ['automatico_1p', { amperaje: 20 }],
    ['automatico_1p', { amperaje: 25 }],
    ['reloj_control', {}, 18],
    ['rele_crepuscular'],
  ]);
  fila(242, 61, [
    ['automatico_3p', { amperaje: 63 }],
    ['diferencial_4p'],
    ['contactor_3p'],
    ['automatico_3p', { amperaje: 25 }],
    ['borne_16_gris', {}, 5],
    ['borne_16_azul'],
    ['borne_16_tierra'],
    ['barra_repartidora_12v', { funcion: 'N' }, 5],
  ]);
  return els;
}
