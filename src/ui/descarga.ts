/** Descarga un contenido como archivo. `conBom` hace que Excel reconozca UTF-8 en textos. */
export function descargar(nombre: string, contenido: string | Blob, tipo: string, conBom = false): void {
  const partes: BlobPart[] = conBom ? ['﻿', contenido] : [contenido];
  const blob = contenido instanceof Blob && !conBom ? contenido : new Blob(partes, { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function descargarDataUrl(nombre: string, dataUrl: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
