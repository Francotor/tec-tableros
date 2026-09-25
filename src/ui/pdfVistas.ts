import type { jsPDF } from 'jspdf';
import type { VistaFrontal } from '../core/vistaFrontal';

const NAVY: [number, number, number] = [5, 33, 68]; // --tec-navy
const GRAFITO: [number, number, number] = [42, 42, 42]; // --tec-grafito
const PLATA: [number, number, number] = [183, 184, 188]; // --tec-plata
const MARCO: [number, number, number] = [221, 224, 229];
const PUERTA: [number, number, number] = [244, 245, 247];
const HERRAJE: [number, number, number] = [155, 162, 173];
const GROSOR_MM = 0.3;

/** Tamaño (mm) que ocupa una vista de `ancho` × `alto` al ajustarla, sin deformar, a una celda. */
export function ajustarACelda(ancho: number, alto: number, celdaAncho: number, celdaAlto: number): { w: number; h: number; escala: number } {
  const escala = Math.min(celdaAncho / ancho, celdaAlto / alto);
  return { w: ancho * escala, h: alto * escala, escala };
}

/**
 * Dibuja la vista frontal exterior en el PDF, centrada en la celda (x, y, celdaAncho × celdaAlto) y a escala uniforme.
 * Devuelve el rectángulo que ocupó, para poner el pie debajo.
 */
export function dibujarVistaFrontal(
  doc: jsPDF,
  vista: VistaFrontal,
  x: number,
  y: number,
  celdaAncho: number,
  celdaAlto: number,
): { x: number; y: number; w: number; h: number } {
  const { w, h, escala } = ajustarACelda(vista.ancho, vista.alto, celdaAncho, celdaAlto);
  const ox = x + (celdaAncho - w) / 2;
  const oy = y;
  doc.setLineWidth(GROSOR_MM);
  doc.setDrawColor(...NAVY);

  for (const r of vista.rects) {
    const relleno = r.capa === 'marco' ? MARCO : r.capa === 'puerta' ? PUERTA : r.capa === 'bisagra' ? HERRAJE : ([255, 255, 255] as [number, number, number]);
    doc.setFillColor(...relleno);
    doc.rect(ox + r.x * escala, oy + r.y * escala, r.w * escala, r.h * escala, 'FD');
  }
  doc.setFillColor(255, 255, 255);
  for (const c of vista.circulos) doc.circle(ox + c.cx * escala, oy + c.cy * escala, c.r * escala, 'FD');
  for (const l of vista.lineas) doc.line(ox + l.x1 * escala, oy + l.y1 * escala, ox + l.x2 * escala, oy + l.y2 * escala);

  // Nombre del tablero en la placa: el tamaño baja hasta que el texto cabe en la zona.
  const z = vista.placa.zona;
  const zw = z.w * escala;
  const zh = z.h * escala;
  let tamano = Math.min(11, zh * 2.83 * 0.55);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRAFITO);
  doc.setFontSize(tamano);
  const ancho = doc.getTextWidth(vista.placa.texto);
  const disponible = zw - 2;
  if (ancho > disponible && ancho > 0) {
    tamano = Math.max(3, (tamano * disponible) / ancho);
    doc.setFontSize(tamano);
  }
  doc.text(vista.placa.texto, ox + z.x * escala + zw / 2, oy + z.y * escala + zh / 2 + tamano * 0.35 * 0.3528, { align: 'center' });
  doc.setDrawColor(...PLATA);
  return { x: ox, y: oy, w, h };
}
