# Biblioteca de tableros TEC

Componentes de tableros electricos dibujados en SVG semirrealista, sin marcas, con medidas reales.
Pensada para el editor visual de tableros (PWA React + Vite + Konva, sin backend).

## Convenciones

- **Unidad:** 1 unidad SVG = 1 mm. El `viewBox` de cada archivo es su tamano real (`0 0 ancho alto`).
- **Origen:** arriba a la izquierda, eje y hacia abajo.
- **Sin texto en los SVG.** Las etiquetas (C16, 30 mA, K1...) las escribe el editor sobre la zona `etiqueta` de cada ficha, con la plantilla `lineas` y el tamano `tamano_mm`. Asi el amperaje y la curva son editables sin dibujar 15 variantes.
- **Dibujo generico:** no lleva logos ni marcas. Si algun dia se reemplaza por una foto PNG, se cambia el archivo y se conserva la ficha.

## Archivos

| Archivo | Contenido |
|---|---|
| `catalogo.json` | Ficha de cada componente: medidas, montaje, ajuste al riel, campos editables, zona de etiqueta, plantilla de lista de materiales |
| `gabinetes.json` | Cajas metalicas, inox y plasticas, con placa interior, capacidad y parametros de calculo |
| `componentes/` | SVG de aparatos (protecciones, comando, control, distribucion, montaje) |
| `gabinetes/` | SVG de cajas |
| `lineales.js` | `rielSVG(largo)` y `canaletaSVG(largo, ancho)`: piezas de largo variable |
| `lineales/` | Muestras de riel y canaleta |
| `ejemplo_tablero_armado.svg` | Tablero armado solo con esta biblioteca (prueba de que las piezas componen) |
| `ejemplo_lista_materiales.csv` | Lista de materiales generada de ese ejemplo |
| `preview.html` | Hoja de revision visual, abrir en el navegador |
| `generar_biblioteca.py` | Regenera todo. Cambiar medidas ahi y volver a ejecutar |
| `validar_biblioteca.py` | Comprueba archivos, medidas, etiquetas, paridad JS/Python y calculo de cajas |

## Reglas de armado

1. **Montaje `riel`:** el aparato se ubica con su linea `riel_y_mm` sobre el centro del riel.
2. **Ajuste (`snap`):** `modular` va de 18 en 18 mm desde el inicio del riel; `libre` de 1 en 1 mm. En ambos, imantar al borde del vecino si esta a menos de 3 mm.
3. **Riel DIN y canaleta** son lineales: el usuario fija el largo en mm y `lineales.js` dibuja la pieza. Cada riel agrega 2 topes (`accesorios_auto`).
4. **Cajas metalicas e inox:** la placa interior es el area de trabajo y el riel se instala encima. **Cajas plasticas:** traen `rieles` incluidos, sin duplicarlos en la lista.
5. **Lista de materiales:** cada ficha trae una plantilla `bom`; se completa con `campos` y `atributos`, y se agrupan lineas iguales.
6. **Sugerir caja:** la mas chica cuya capacidad (`modulos_por_fila` y `filas_max_estimado`) contenga el dibujo; permitir medida libre.

## Supuestos sin validar (corregir con medidas reales)

- Placa interior = caja exterior - 50 mm por dimension.
- Margen lateral no usable del riel = 40 mm; canaleta de 25 mm para estimar filas.
- Ancho del reloj control (2 modulos), de las borneras segun seccion y de la barra repartidora (9 mm por via).
- Cajas plasticas: medidas aproximadas.

Para corregirlos: editar las constantes al inicio de `generar_biblioteca.py`, ejecutarlo y luego `validar_biblioteca.py`.

## Fuera de esta version

Cableado entre aparatos, rotulado de circuitos y protector de sobretensiones para tableros viales.
