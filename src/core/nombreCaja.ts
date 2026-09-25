import type { CajaProyecto } from './modelo';
import type { Gabinetes, TipoCaja } from './tipos';

const TIPO: Record<TipoCaja, string> = {
  metalica: 'Metálica',
  inox: 'Inox',
  plastica_sobrepuesta: 'Plástica sobrepuesta',
  plastica_embutida: 'Plástica embutida',
};

/**
 * Nombre corto de la caja del proyecto para el botón del panel plegado: la serie del fabricante y sus medidas
 * ("DM 700×500×260"), "Genérica 400×500×200" para las medidas genéricas, "Plástica embutida 12 mód. × 2 filas" para
 * las plásticas y "Libre 800×1000" para una medida libre.
 */
export function nombreCortoCaja(caja: CajaProyecto, gabinetes: Gabinetes): string {
  if ('libre' in caja) return `Libre ${caja.libre.ancho_mm}×${caja.libre.alto_mm}`;
  const c = gabinetes.cajas.find((x) => x.id === caja.id);
  if (!c) return 'sin caja';
  const medidas = /(\d+) x (\d+) x (\d+)/.exec(c.nombre);
  if (medidas) {
    const dims = `${medidas[1]}×${medidas[2]}×${medidas[3]}`;
    return `${c.serie ?? (c.referencial ? 'Genérica' : TIPO[c.tipo])} ${dims}`;
  }
  const modulos = /(\d+) modulos x (\d+) fila/.exec(c.nombre);
  if (modulos) return `${TIPO[c.tipo]} ${modulos[1]} mód. × ${modulos[2]} fila${modulos[2] === '1' ? '' : 's'}`;
  return c.nombre;
}
