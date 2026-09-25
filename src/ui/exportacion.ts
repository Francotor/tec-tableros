import { generarDxf, svgsNecesarios } from '../core/exportarDxf';
import { formatearMetros, generarLista, lineasTotales } from '../core/lista';
import { nombreSeguro } from '../core/proyectos';
import { calcularVistaFrontal, datosFrontalDeCaja } from '../core/vistaFrontal';
import { useBiblioteca } from '../store/biblioteca';
import { contextoActual, useEditor } from '../store/editor';
import { descargarDataUrl, descargar } from './descarga';
import { textoDeBiblioteca } from './imagenes';
import type { FilaLista } from './pdfLista';
import { dibujarListaPaginada, numerarPaginas } from './pdfLista';
import { dibujarVistaFrontal } from './pdfVistas';

/** El lienzo registra aquí cómo dibujar el tablero limpio (sin rejilla ni selección). */
type GeneradorPng = () => string | null;
let generador: GeneradorPng | null = null;

export function registrarGeneradorPng(g: GeneradorPng | null): void {
  generador = g;
}

export function generarPngTablero(): string | null {
  return generador ? generador() : null;
}

export function exportarPng(): boolean {
  const url = generarPngTablero();
  if (!url) return false;
  const { proyecto } = useEditor.getState();
  descargarDataUrl(`${nombreSeguro(proyecto.nombre)}.png`, url);
  return true;
}

// ---------------------------------------------------------------- PDF

const MARGEN = 12;
const A4_ANCHO = 210;
const A4_ALTO = 297;
/** Espacio al pie de cada página para el número de página. */
const PIE_MM = 8;

async function cargarLogo(): Promise<{ url: string; ancho: number; alto: number }> {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}logo_tec.png`;
  await img.decode();
  // Se reduce para no inflar el PDF con el logo a tamaño original.
  const ancho = Math.min(600, img.naturalWidth);
  const alto = Math.round((img.naturalHeight * ancho) / img.naturalWidth);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext('2d')?.drawImage(img, 0, 0, ancho, alto);
  return { url: lienzo.toDataURL('image/png'), ancho, alto };
}

const MAX_LADO_PDF_PX = 1800;

/** Reduce el PNG del tablero y lo pasa a JPEG sobre fondo blanco: el PDF pesa unos cientos de KB, no decenas de MB. */
function imagenParaPdf(url: string): Promise<{ url: string; ancho: number; alto: number }> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_LADO_PDF_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const ancho = Math.round(img.naturalWidth * k);
      const alto = Math.round(img.naturalHeight * k);
      const lienzo = document.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      const c = lienzo.getContext('2d');
      if (!c) {
        rechazar(new Error('No se pudo preparar la imagen del tablero'));
        return;
      }
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, ancho, alto);
      c.drawImage(img, 0, 0, ancho, alto);
      resolver({ url: lienzo.toDataURL('image/jpeg', 0.92), ancho, alto });
    };
    img.onerror = () => rechazar(new Error('No se pudo leer la imagen del tablero'));
    img.src = url;
  });
}

function fechaLarga(d: Date): string {
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function medida(mm: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(mm);
}

/**
 * Genera el PDF. Página 1: encabezado (logo, título, cotización, fecha) y, lado a lado, la vista frontal exterior
 * (dibujada en vector) y la vista interior (imagen del tablero), cada una con su título y sus medidas. Desde la
 * página 2: la lista de materiales completa, con paginación automática (una fila nunca se parte entre páginas).
 */
export async function generarPdf(): Promise<Blob> {
  const { proyecto } = useEditor.getState();
  const ctx = contextoActual();
  const gabinetes = useBiblioteca.getState().biblioteca?.gabinetes;
  const png = generarPngTablero();
  if (!ctx || !png || !gabinetes) throw new Error('El tablero aún no está listo para exportar.');
  const lista = generarLista(proyecto.elementos, ctx);
  const [{ jsPDF }, logo, dim] = await Promise.all([import('jspdf'), cargarLogo(), imagenParaPdf(png)]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const anchoUtil = A4_ANCHO - 2 * MARGEN;

  // Encabezado: logo a la izquierda, título y cotización a la derecha.
  const logoAncho = 48;
  const logoAlto = (logoAncho * logo.alto) / logo.ancho;
  doc.addImage(logo.url, 'PNG', MARGEN, MARGEN, logoAncho, logoAlto);
  doc.setTextColor(5, 33, 68); // --tec-navy
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const titulo = doc.splitTextToSize(proyecto.nombre || 'Tablero eléctrico', anchoUtil - logoAncho - 6) as string[];
  doc.text(titulo.slice(0, 2), A4_ANCHO - MARGEN, MARGEN + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(42, 42, 42); // --tec-grafito
  const linea2 = proyecto.numeroCotizacion ? `Cotización N° ${proyecto.numeroCotizacion}` : 'Sin N° de cotización';
  const yTexto = MARGEN + 6 + 6.5 * Math.min(titulo.length, 2);
  doc.text(linea2, A4_ANCHO - MARGEN, yTexto, { align: 'right' });
  doc.setTextColor(90, 90, 90); // --tec-gris-texto
  doc.text(fechaLarga(new Date()), A4_ANCHO - MARGEN, yTexto + 5, { align: 'right' });
  const yLinea = MARGEN + Math.max(logoAlto, yTexto + 5 - MARGEN) + 3;
  doc.setDrawColor(183, 184, 188); // --tec-plata
  doc.setLineWidth(0.4);
  doc.line(MARGEN, yLinea, A4_ANCHO - MARGEN, yLinea);

  // Página 1: vista frontal exterior e interior, lado a lado.
  const separacion = 8;
  const celdaAncho = (anchoUtil - separacion) / 2;
  const yTitulos = yLinea + 9;
  const yVistas = yTitulos + 4;
  const celdaAlto = A4_ALTO - MARGEN - PIE_MM - 22 - yVistas;
  const xIzq = MARGEN;
  const xDer = MARGEN + celdaAncho + separacion;
  const cajaDatos = gabinetes.cajas.find((c) => c.id === ctx.caja.id);
  const vista = calcularVistaFrontal(datosFrontalDeCaja(ctx.caja, gabinetes), proyecto.nombre, proyecto.ladoBisagras);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(5, 33, 68);
  doc.text('Vista frontal exterior', xIzq + celdaAncho / 2, yTitulos, { align: 'center' });
  doc.text('Vista interior', xDer + celdaAncho / 2, yTitulos, { align: 'center' });

  const frontal = dibujarVistaFrontal(doc, vista, xIzq, yVistas, celdaAncho, celdaAlto);
  const escalaInterior = Math.min(celdaAncho / dim.ancho, celdaAlto / dim.alto);
  const wi = dim.ancho * escalaInterior;
  const hi = dim.alto * escalaInterior;
  const xi = xDer + (celdaAncho - wi) / 2;
  doc.addImage(dim.url, 'JPEG', xi, yVistas, wi, hi);
  doc.setDrawColor(183, 184, 188);
  doc.setLineWidth(0.3);
  doc.rect(xi, yVistas, wi, hi);

  const yPie = Math.max(frontal.y + frontal.h, yVistas + hi) + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(42, 42, 42);
  const fondo = cajaDatos?.fondo_mm;
  const medidasCaja = `${medida(ctx.caja.ancho)} × ${medida(ctx.caja.alto)}${fondo ? ` × ${medida(fondo)}` : ''} mm`;
  doc.text(`Caja: ${medidasCaja}`, xIzq + celdaAncho / 2, yPie, { align: 'center' });
  doc.text(fondo ? '(ancho × alto × fondo)' : '(ancho × alto)', xIzq + celdaAncho / 2, yPie + 4.2, { align: 'center' });
  const nombreCaja = doc.splitTextToSize(ctx.caja.nombre, celdaAncho) as string[];
  doc.setTextColor(90, 90, 90);
  doc.text(nombreCaja.slice(0, 2), xIzq + celdaAncho / 2, yPie + 8.4, { align: 'center' });
  doc.setTextColor(42, 42, 42);
  const interior = ctx.caja.permiteRieles
    ? `Placa de montaje: ${medida(ctx.caja.area.w)} × ${medida(ctx.caja.area.h)} mm`
    : `Interior: ${medida(ctx.caja.area.w)} × ${medida(ctx.caja.area.h)} mm`;
  doc.text(interior, xDer + celdaAncho / 2, yPie, { align: 'center' });

  // Página 2 en adelante: lista de materiales.
  doc.addPage();
  const totales = lineasTotales(lista);
  const filas: FilaLista[] = [
    ...lista.lineas.map((l) => ({ cant: `${l.cantidad} ${l.unidad}`, texto: l.descripcion, total: false })),
    ...totales.map((t) => ({ cant: `${formatearMetros(t.cantidad)} m`, texto: t.descripcion, total: true })),
  ];
  dibujarListaPaginada(doc, filas, { margen: MARGEN, anchoPagina: A4_ANCHO, altoPagina: A4_ALTO, pie: PIE_MM });
  numerarPaginas(doc, proyecto.nombre || 'Tablero eléctrico', A4_ANCHO, A4_ALTO, MARGEN);

  return doc.output('blob');
}

/** DXF R12 del tablero (mm, capas por categoría, formas reales de cada SVG, rótulos como TEXT). */
export async function exportarDxf(): Promise<void> {
  const { proyecto } = useEditor.getState();
  const ctx = contextoActual();
  if (!ctx) throw new Error('El tablero aún no está listo para exportar.');
  const rutas = svgsNecesarios(proyecto.elementos, ctx);
  const svgs = new Map(await Promise.all(rutas.map(async (r): Promise<[string, string]> => [r, await textoDeBiblioteca(r)])));
  descargar(`${nombreSeguro(proyecto.numeroCotizacion || proyecto.nombre)}.dxf`, generarDxf(proyecto.elementos, ctx, svgs), 'application/dxf');
}

export async function exportarPdf(): Promise<void> {
  const { proyecto } = useEditor.getState();
  const blob = await generarPdf();
  descargar(`${nombreSeguro(proyecto.numeroCotizacion || proyecto.nombre)}.pdf`, blob, 'application/pdf');
}
