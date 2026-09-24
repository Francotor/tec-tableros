import type { jsPDF } from 'jspdf';
import type { CotaContorno, PlanContornos } from '../core/contornos';

/** Opciones de jsPDF para una hoja del tamaño exacto del plan (la orientación debe coincidir con las medidas o jsPDF las intercambia). */
export function opcionesHoja(plan: PlanContornos, compress = true) {
  const { ancho, alto } = plan.hoja;
  return { unit: 'mm' as const, format: [ancho, alto] as [number, number], orientation: ancho > alto ? ('landscape' as const) : ('portrait' as const), compress };
}

const GROSOR_MM = 0.25;
const TICK_MM = 2;
const TEXTO_PT = 9;

function dibujarCota(doc: jsPDF, c: CotaContorno, ox: number, oy: number): void {
  if (c.orientacion === 'horizontal') {
    const x1 = ox + c.desde;
    const x2 = ox + c.hasta;
    const y = oy + c.linea;
    const yRef = oy + c.referencia;
    doc.line(x1, yRef, x1, y - TICK_MM);
    doc.line(x2, yRef, x2, y - TICK_MM);
    doc.line(x1, y, x2, y);
    doc.line(x1, y - TICK_MM, x1, y + TICK_MM);
    doc.line(x2, y - TICK_MM, x2, y + TICK_MM);
    doc.text(c.texto, (x1 + x2) / 2, y - TICK_MM - 1, { align: 'center' });
  } else {
    const y1 = oy + c.desde;
    const y2 = oy + c.hasta;
    const x = ox + c.linea;
    const xRef = ox + c.referencia;
    doc.line(xRef, y1, x - TICK_MM, y1);
    doc.line(xRef, y2, x - TICK_MM, y2);
    doc.line(x, y1, x, y2);
    doc.line(x - TICK_MM, y1, x + TICK_MM, y1);
    doc.line(x - TICK_MM, y2, x + TICK_MM, y2);
    // Con angle 90 el texto sube desde el punto dado: se centra a mano.
    doc.text(c.texto, x - TICK_MM - 1, (y1 + y2) / 2 + doc.getTextWidth(c.texto) / 2, { angle: 90 });
  }
}

/**
 * Traza el plan en el documento: solo líneas negras (rectángulos y círculos en modo contorno 'S',
 * sin relleno), a escala 1:1 con el documento en milímetros.
 */
export function dibujarContornos(doc: jsPDF, plan: PlanContornos, titulo: string): void {
  const { x: ox, y: oy } = plan.origen;
  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(GROSOR_MM);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(TEXTO_PT);

  for (const r of plan.rects) doc.rect(ox + r.x, oy + r.y, r.w, r.h, 'S');
  for (const c of plan.circulos) doc.circle(ox + c.cx, oy + c.cy, c.r, 'S');
  for (const c of plan.cotas) dibujarCota(doc, c, ox, oy);

  doc.text(`${titulo} — vista interior, escala 1:1, unidades en mm`, ox, plan.hoja.alto - 6);
}
