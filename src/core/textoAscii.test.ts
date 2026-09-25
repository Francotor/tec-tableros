import { describe, expect, it } from 'vitest';
import { aAscii } from './textoAscii';

describe('texto ASCII para DXF R12', () => {
  it('quita las tildes de las vocales y convierte la ñ en n, en minúscula y mayúscula', () => {
    expect(aAscii('áéíóú ÁÉÍÓÚ')).toBe('aeiou AEIOU');
    expect(aAscii('ñandú Año Ñuñoa')).toBe('nandu Ano Nunoa');
    expect(aAscii('pingüino ç')).toBe('pinguino c');
  });

  it('los símbolos comunes se sustituyen en vez de perderse', () => {
    expect(aAscii('N°2')).toBe('No2');
    expect(aAscii('Tensión — 230 V')).toBe('Tension - 230 V');
    expect(aAscii('3² Ø5 ½ × 2 µF “ok” …')).toBe('32 D5 1/2 x 2 uF "ok" ...');
  });

  it('el texto ASCII queda igual y solo lo realmente desconocido sale como ?', () => {
    expect(aAscii('Curva C 40 A (RC1) 1/2"')).toBe('Curva C 40 A (RC1) 1/2"');
    expect(aAscii('a\u4e2db')).toBe('a?b');
  });

  it('con las palabras que trae el catálogo y los nombres del usuario no aparece ningún ?', () => {
    for (const t of ['Tablero Iluminación N°2', 'Alimentación cocina', 'Protección diferencial — baño', 'Señalización ñ']) {
      expect(aAscii(t), t).not.toContain('?');
    }
  });
});
