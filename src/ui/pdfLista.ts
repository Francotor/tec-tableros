import type { jsPDF } from 'jspdf';

export interface FilaLista {
  cant: string;
  texto: string;
  /** Fila de totales (metros): va en negrita y precedida de una línea. */
  total: boolean;
}

export interface OpcionesLista {
  margen: number;
  anchoPagina: number;
  altoPagina: number;
  /** Espacio libre al pie de cada página (para el número de página). */
  pie: number;
  tamano?: number;
  altoLinea?: number;
  /** Título de la primera página de la lista; en las siguientes se agrega "(continuación)". */
  titulo?: string;
}

/** Dónde quedó cada fila: página (1 = primera del documento), posición y alto. */
export interface FilaColocada {
  fila: number;
  pagina: number;
  y: number;
  alto: number;
}

const NAVY: [number, number, number] = [5, 33, 68];
const GRAFITO: [number, number, number] = [42, 42, 42];
const PLATA: [number, number, number] = [183, 184, 188];
const COLUMNA_CANT = 24;
const RELLENO_FILA = 1.6;

/**
 * Dibuja la tabla de la lista de materiales desde la página actual del documento, con paginación automática:
 * si una fila no cabe en lo que queda de la página, pasa entera a la siguiente (nunca se parte a la mitad) y la
 * cabecera de la tabla se repite. Devuelve la posición de cada fila para poder verificarlo.
 */
export function dibujarListaPaginada(doc: jsPDF, filas: readonly FilaLista[], op: OpcionesLista): FilaColocada[] {
  const tamano = op.tamano ?? 9;
  const altoLinea = op.altoLinea ?? 4.4;
  const titulo = op.titulo ?? 'Lista de materiales';
  const anchoUtil = op.anchoPagina - 2 * op.margen;
  const yMax = op.altoPagina - op.margen - op.pie;
  const colocadas: FilaColocada[] = [];

  const cabecera = (y: number, continuacion: boolean): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(continuacion ? `${titulo} (continuación)` : titulo, op.margen, y);
    y += 5;
    doc.setFontSize(tamano);
    doc.text('Cant.', op.margen, y);
    doc.text('Descripción', op.margen + COLUMNA_CANT, y);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.3);
    doc.line(op.margen, y + 1.5, op.margen + anchoUtil, y + 1.5);
    return y + 1.5 + altoLinea;
  };

  // La lista arranca en la página actual (el llamador ya hizo addPage si quiere una hoja propia).
  let y = cabecera(op.margen + 6, false);
  filas.forEach((f, i) => {
    doc.setFontSize(tamano);
    doc.setFont('helvetica', f.total ? 'bold' : 'normal');
    const partes = doc.splitTextToSize(f.texto, anchoUtil - COLUMNA_CANT) as string[];
    const lineas = Math.max(1, partes.length);
    const alto = lineas * altoLinea + RELLENO_FILA;
    const previaEsTotal = i > 0 && filas[i - 1]?.total === true;
    const separador = f.total && !previaEsTotal ? 2 : 0; // aire y línea antes de los totales
    if (y - altoLinea + 1 + separador + alto > yMax) {
      doc.addPage();
      y = cabecera(op.margen + 6, true);
    } else if (separador > 0) {
      doc.setDrawColor(...PLATA);
      doc.setLineWidth(0.3);
      doc.line(op.margen, y - altoLinea + 1, op.margen + anchoUtil, y - altoLinea + 1);
      y += separador;
    }
    doc.setFont('helvetica', f.total ? 'bold' : 'normal');
    doc.setFontSize(tamano);
    doc.setTextColor(...GRAFITO);
    doc.text(f.cant, op.margen, y);
    doc.text(partes, op.margen + COLUMNA_CANT, y);
    colocadas.push({ fila: i, pagina: doc.getCurrentPageInfo().pageNumber, y: y - altoLinea + 1, alto });
    y += alto;
  });
  return colocadas;
}

/** "Nombre — Página n de N" al pie de todas las páginas. */
export function numerarPaginas(doc: jsPDF, texto: string, anchoPagina: number, altoPagina: number, margen: number): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(`${texto} — Página ${p} de ${total}`, anchoPagina / 2, altoPagina - margen + 4, { align: 'center' });
  }
}
