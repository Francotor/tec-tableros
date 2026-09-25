/**
 * Sustituciones para pasar a ASCII lo que la descomposición Unicode (NFD) no resuelve sola: los símbolos que no son
 * letra + tilde. Vocales acentuadas, ñ, ü y ç ya quedan bien con NFD (á→a, ñ→n…); esto cubre el resto.
 */
const SUSTITUCIONES: Readonly<Record<string, string>> = {
  '°': 'o', // ° (N°2 → No2)
  'º': 'o', // º
  'ª': 'a', // ª
  '–': '-', // –
  '—': '-', // —
  '−': '-', // −
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...', // …
  '×': 'x', // ×
  'µ': 'u', // µ
  '²': '2', // ²
  '³': '3', // ³
  '¹': '1', // ¹
  '½': '1/2', // ½
  '¼': '1/4', // ¼
  '¾': '3/4', // ¾
  '€': 'EUR', // €
  'Ø': 'D', // Ø
  'ø': 'd', // ø
  'Ð': 'D',
  'ð': 'd',
  'ß': 'ss', // ß
  'Æ': 'AE',
  'æ': 'ae',
  'Œ': 'OE',
  'œ': 'oe',
  ' ': ' ', // espacio de no separación
  '≥': '>=',
  '≤': '<=',
  '±': '+/-',
  '¡': '!',
  '¿': '?', // ¿ (signo real de interrogación, no un carácter perdido)
};

/**
 * Texto ASCII para DXF R12: sin tildes (á→a, ñ→n…), con los símbolos comunes sustituidos por su equivalente
 * (° → o, — → -, ² → 2…). Solo un carácter realmente desconocido (otro alfabeto, emoji) sale como "?".
 */
export function aAscii(texto: string): string {
  let salida = '';
  for (const ch of texto) {
    const reemplazo = SUSTITUCIONES[ch];
    salida += reemplazo ?? ch.normalize('NFD').replace(/\p{M}/gu, '');
  }
  return salida.replace(/[^\x20-\x7e]/g, '?');
}
