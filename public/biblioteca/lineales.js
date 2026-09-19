// Componentes lineales (largo variable): riel DIN y canaleta ranurada.
// Devuelven un string SVG en mm (1 unidad = 1 mm), igual que el resto de la biblioteca.
// Uso en el editor: rielSVG(396) o canaletaSVG(396, 25) -> data URL o <image>.

const fmt = (v) => String(Math.round(v * 100) / 100);
const NS = 'xmlns="http://www.w3.org/2000/svg"';

export const RIEL_ALTO_MM = 35;
export const CANALETA_PASO_MM = 9;

export function rielSVG(largo) {
  const L = fmt(largo);
  let ranuras = "";
  for (let x = 5; x + 15 <= largo - 5; x += 25) {
    ranuras += `<rect x="${fmt(x)}" y="14.9" width="15" height="5.2" rx="2.6"/>`;
  }
  return (
    `<svg ${NS} width="${L}mm" height="35mm" viewBox="0 0 ${L} 35" role="img">` +
    `<title>Riel DIN 35 mm</title><desc>Riel DIN de ${L} mm de largo</desc>` +
    `<rect x="0.25" y="0.25" width="${fmt(largo - 0.5)}" height="34.5" fill="#B4BAC3" stroke="#949BA6" stroke-width="0.5"/>` +
    `<line x1="0" y1="4" x2="${L}" y2="4" stroke="#949BA6" stroke-width="0.5"/>` +
    `<line x1="0" y1="31" x2="${L}" y2="31" stroke="#949BA6" stroke-width="0.5"/>` +
    `<g fill="#7C8490">${ranuras}</g></svg>`
  );
}

export function canaletaSVG(largo, ancho) {
  const L = fmt(largo);
  const A = fmt(ancho);
  let ranuras = "";
  for (let x = 2.5; x + 4 <= largo - 2.5; x += CANALETA_PASO_MM) {
    ranuras += `<rect x="${fmt(x)}" y="2.5" width="4" height="${fmt(ancho - 5)}" rx="0.8"/>`;
  }
  return (
    `<svg ${NS} width="${L}mm" height="${A}mm" viewBox="0 0 ${L} ${A}" role="img">` +
    `<title>Canaleta ranurada ${A} mm</title><desc>Canaleta ranurada de ${L} mm de largo y ${A} mm de ancho</desc>` +
    `<rect x="0.25" y="0.25" width="${fmt(largo - 0.5)}" height="${fmt(ancho - 0.5)}" rx="1" fill="#C3C9D2" stroke="#A2AAB5" stroke-width="0.5"/>` +
    `<g fill="#8E97A3">${ranuras}</g></svg>`
  );
}
