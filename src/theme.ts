// Paleta de marca TEC, medida por muestreo de píxeles del logo. No inventar otros colores de marca.
export const PALETA = {
  '--tec-navy': '#052144',
  '--tec-navy-oscuro': '#081933',
  '--tec-azul-acero': '#314A69',
  '--tec-azul-brillo': '#296099',
  '--tec-grafito': '#2A2A2A',
  '--tec-gris-texto': '#5A5A5A',
  '--tec-gris-metal': '#8F9196',
  '--tec-plata': '#B7B8BC',
  '--tec-plata-clara': '#D9DADC',
} as const;

export const BLANCO = '#FFFFFF';

export function aplicarTema(raiz: HTMLElement = document.documentElement): void {
  for (const [nombre, valor] of Object.entries(PALETA)) raiz.style.setProperty(nombre, valor);
}
