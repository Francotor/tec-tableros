import { nombreTipo } from '../core/tipoProyecto';
import type { TipoProyecto } from '../core/tipoProyecto';

/** Marca a qué tipo de proyecto pertenece un proyecto o una plantilla en las listas (Tablero o Medidor). */
export function EtiquetaTipo({ tipo }: { tipo: TipoProyecto }) {
  return <span className={`etiqueta-tipo ${tipo}`}>{nombreTipo(tipo)}</span>;
}
