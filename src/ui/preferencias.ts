import { useCallback, useState } from 'react';

function leer(clave: string, defecto: boolean): boolean {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? defecto : v === '1';
  } catch {
    return defecto;
  }
}

/** Preferencia de interfaz (panel plegado o desplegado) que se recuerda en este navegador; sin almacenamiento, vale el defecto. */
export function usePreferencia(clave: string, defecto: boolean): [boolean, (v: boolean) => void] {
  const [valor, setValor] = useState(() => leer(clave, defecto));
  const cambiar = useCallback(
    (v: boolean) => {
      setValor(v);
      try {
        localStorage.setItem(clave, v ? '1' : '0');
      } catch {
        // Sin almacenamiento (ventana privada): la preferencia dura solo esta sesión.
      }
    },
    [clave],
  );
  return [valor, cambiar];
}
