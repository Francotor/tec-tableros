# Notas de decisiones

- La carpeta del proyecto se llama `tableros` (no `tablero`); el proyecto Vite está en su raíz.
- `biblioteca-tableros/` y `logo_tec.PNG` originales quedan intactos y fuera de git (`.gitignore`); la copia de trabajo está en `public/`.
- Node.js LTS no estaba instalado; se instaló con winget (Node 24).
- Python no está instalado (solo el atajo de la Store), por lo que `validar_biblioteca.py` no se ejecutó. Las comprobaciones de tamaño SVG/ficha se cubren con pruebas de vitest.
- `base` de Vite: `/tec-tableros/`, sobrescribible con `VITE_BASE`.
- Los SVG y catálogos se cargan por `fetch` en tiempo de ejecución (no se importan al bundle), para poder actualizar la biblioteca sin tocar el código.
- Las cajas `plastica_sobrepuesta` / `plastica_embutida` son tipos distintos en `gabinetes.json`; el modelo de proyecto del documento solo distingue `metalica | inox` para medida libre.
