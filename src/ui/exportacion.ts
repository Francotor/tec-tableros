import { generarDxf, svgsNecesarios } from '../core/exportarDxf';
import { formatearMetros, generarLista, lineasTotales } from '../core/lista';
import { nombreSeguro } from '../core/proyectos';
import { contextoActual, useEditor } from '../store/editor';
import { descargarDataUrl, descargar } from './descarga';
import { textoDeBiblioteca } from './imagenes';

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

/** Genera el PDF (una página A4) con título, N° de cotización, imagen del tablero y lista de materiales. */
export async function generarPdf(): Promise<Blob> {
  const { proyecto } = useEditor.getState();
  const ctx = contextoActual();
  const png = generarPngTablero();
  if (!ctx || !png) throw new Error('El tablero aún no está listo para exportar.');
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

  // Filas de la tabla (las descripciones largas se parten en varias líneas).
  const totales = lineasTotales(lista);
  const filas = [
    ...lista.lineas.map((l) => ({ cant: `${l.cantidad} ${l.unidad}`, texto: l.descripcion, total: false })),
    ...totales.map((t) => ({ cant: `${formatearMetros(t.cantidad)} m`, texto: t.descripcion, total: true })),
  ];
  const medirTabla = (tamano: number, alto: number): { lineas: string[][]; alto: number } => {
    doc.setFontSize(tamano);
    const partidas = filas.map((f) => doc.splitTextToSize(f.texto, anchoUtil - 24) as string[]);
    const nLineas = partidas.reduce((s, p) => s + p.length, 0);
    return { lineas: partidas, alto: nLineas * alto + 8 };
  };
  let tamano = 9;
  let alto = 4.4;
  let tabla = medirTabla(tamano, alto);
  const yImagen = yLinea + 5;
  const espacioMin = 70;
  while (A4_ALTO - MARGEN - yImagen - tabla.alto - 14 < espacioMin && tamano > 6) {
    tamano -= 0.5;
    alto -= 0.25;
    tabla = medirTabla(tamano, alto);
  }
  const altoImagen = Math.max(35, Math.min(150, A4_ALTO - MARGEN - yImagen - tabla.alto - 14));

  // Imagen del tablero, centrada y sin deformar.
  const escala = Math.min(anchoUtil / dim.ancho, altoImagen / dim.alto);
  const w = dim.ancho * escala;
  const h = dim.alto * escala;
  doc.addImage(dim.url, 'JPEG', MARGEN + (anchoUtil - w) / 2, yImagen, w, h);
  doc.setDrawColor(183, 184, 188);
  doc.rect(MARGEN + (anchoUtil - w) / 2, yImagen, w, h);

  // Lista de materiales.
  let y = yImagen + h + 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(5, 33, 68);
  doc.text('Lista de materiales', MARGEN, y);
  y += 5;
  doc.setFontSize(tamano);
  filas.forEach((f, i) => {
    const partes = tabla.lineas[i] ?? [];
    if (f.total && (i === lista.lineas.length)) {
      doc.setDrawColor(183, 184, 188);
      doc.line(MARGEN, y - alto + 1, A4_ANCHO - MARGEN, y - alto + 1);
    }
    doc.setFont('helvetica', f.total ? 'bold' : 'normal');
    doc.setTextColor(42, 42, 42);
    doc.text(f.cant, MARGEN, y);
    doc.text(partes, MARGEN + 24, y);
    y += Math.max(1, partes.length) * alto;
  });

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
