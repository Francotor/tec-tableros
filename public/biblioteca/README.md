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
| `datos_fabricantes/` | Tablas transcritas de catalogos de fabricantes (hoy, Eldon ASR) que usa el generador y contrasta el validador |
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
6. **Sugerir caja:** la mas chica cuya capacidad del modo elegido (`modulos_max_con_reserva`) contenga el dibujo; permitir medida libre.

## Modos de armado y reserva (desde 1.2)

Cada caja metalica o inox trae `capacidad` con dos modos, calculados con la regla de `gabinetes.json` (`parametros.layout`):

| Modo | Cuando | Que incluye |
|---|---|---|
| `compacto` | Menos de 8 circuitos (excepcion del RIC N°02, 6.1.16.1) | Sin canaletas. Paso entre ejes de riel de 125 mm |
| `con_canaleta` | 8 circuitos o mas | Canaleta no metalica en ambos costados y sobre y bajo cada fila. Seccion por defecto 40 mm. Paso de 150 mm o mas |

- **Reserva:** el RIC N°02, 6.1.16.3, exige prever una ampliacion del 25 % por tipo de servicio, con espacio en riel y barras. `modulos_max_con_reserva` es el maximo de modulos que se pueden instalar hoy: `floor(filas x modulos_por_fila / 1,25)`.
- **Canaleta:** `capacidad.con_canaleta` usa la seccion por defecto (40 mm). `capacidad.por_canaleta` trae los valores para 25, 40 y 60 mm, para cuando el usuario cambie de canaleta.
- **Compatibilidad:** `modulos_por_fila` y `filas_max_estimado` se mantienen y ahora valen lo del modo `con_canaleta` (el mas conservador).
- **Cajas plasticas:** traen `capacidad.riel_incluido`, con la misma reserva. Una caja de 12 modulos y una fila admite 9 modulos instalados.
- **El ejemplo armado** conserva su medida historica (riel de 22 modulos) para no romper pruebas de referencia. No sigue esta regla.

## Cajas de fabricante (desde 1.5)

Las 22 medidas del catalogo **Eldon ASR** (armarios de acero inoxidable de una puerta) estan en `gabinetes.json` como `caja_inox_asr_{alto}x{ancho}x{fondo}`, con la referencia del fabricante (`ref_fabricante`; en 316L se agrega el sufijo `-316`). Del catalogo salen:

- **Placa de montaje:** alto = A - 30 y ancho = An - 50 (placa centrada en la caja).
- **Pernos M8:** distancia entre pernos = ancho de placa - 50 en horizontal y alto de placa - 20 en vertical, es decir 25 mm a los lados y 10 mm arriba y abajo del borde de la placa. `fijaciones` los trae con un radio libre de 10 mm.
- **Profundidad util** = fondo - 20.
- **Margenes de armado:** `layout.margen_vertical_mm` = 20 (10 de perno + 10 de radio libre) y `layout.margen_lateral_mm` = 10. Con esos margenes, ninguna canaleta ni riel pisa los pernos. Las cajas sin `layout` usan `parametros.layout.margen_borde_mm` para ambos.
- **Cajas genericas:** las anteriores llevan `referencial: true` (medida sin verificar). Las inox con equivalente real traen `reemplazo_sugerido`. "Sugerir caja" debe preferir las de fabricante.
- **Placas plegadas:** en armarios de 800 mm o mas de alto o ancho la placa va plegada en los cuatro lados; el catalogo no da el pliegue, asi que el area util real puede ser menor.

### Lerkenbox: KT, DM y ARES (desde 1.6)

66 cajas de acero de `datos_fabricantes/lerkenbox.json`: `caja_metalica_{serie}_{alto}x{ancho}x{fondo}` (KT 17, DM 30, ARES 19), con su referencia. La placa de montaje **no sigue una regla comun**: cada serie descuenta distinto (ver tabla). Se asume la placa centrada en la caja. No hay datos de pernos en las paginas entregadas, asi que usan los margenes por defecto. ARES con puerta transparente comparte medidas (`ref_puerta_transparente`).

| Serie | Alto de placa | Ancho de placa |
|---|---|---|
| Eldon ASR (inox) | alto - 30 | ancho - 50 |
| Lerkenbox DM | alto - 60 | ancho - 50 |
| Lerkenbox ARES | alto - 66 | ancho - 51 |
| Lerkenbox KT | alto - 35 | ancho - 20 |
| Genericas (`referencial`) | alto - 50 | ancho - 50 |

- **Sin modelar:** las cajas plasticas ABS de Lerkenbox (puerta ciega, transparente y con chasis) quedan guardadas en el archivo de datos pero sin caja, porque faltan las medidas de la placa o la posicion de los rieles.
- **Reemplazo sugerido:** una caja generica apunta a una de fabricante solo si coinciden tipo, alto y ancho y el fondo difiere hasta 30 mm. Se excluye KT (cajas de terminales, material no indicado).
- **Pendiente:** ARES remite a "Planos tecnicos pag. 136", con pernos y muescas de la placa.

## Supuestos sin validar (corregir con medidas reales)

- Cajas genericas (`referencial: true`): placa interior = caja exterior - 50 mm por dimension. Es un valor propio; en las cajas Eldon ASR el alto de placa es A - 30, no A - 50.
- Margen de borde de 20 mm (depende de la placa: las tuercas de fijacion de las esquinas ocupan el borde, y el editor debe permitir cambiarlo por proyecto), holgura de 10 mm a canaletas, paso entre filas de 125 mm (compacto) y 150 mm o mas (con canaleta, segun la seccion) y canaleta de 40 mm por defecto. Los pasos salen de practica de fabricantes; el resto son valores propios.
- Ancho del reloj control (2 modulos), de las borneras segun seccion y de la barra repartidora (9 mm por via).
- Cajas plasticas: medidas aproximadas.

Para corregirlos: editar las constantes al inicio de `generar_biblioteca.py`, ejecutarlo y luego `validar_biblioteca.py`.

## Fuera de esta version

Cableado entre aparatos, rotulado de circuitos y protector de sobretensiones para tableros viales.

## Historial

- **1.6:** 66 cajas Lerkenbox (KT, DM y ARES) con placa y referencia del catalogo. La placa depende de la serie: ninguna regla generica sirve. Reemplazos sugeridos limitados a fondo similar.
- **1.5:** 22 cajas de acero inoxidable Eldon ASR con placa, pernos, profundidad util y referencia del catalogo. Margenes lateral y vertical por caja. Las cajas genericas quedan marcadas como referenciales.
- **1.4:** margen de borde por defecto de 20 mm (antes 10) para librar las tuercas de fijacion de la placa. Las capacidades bajan 1 a 2 modulos por fila.
- **1.3:** canaleta por defecto de 40 mm (la mas usada) y capacidades por seccion de canaleta (25, 40 y 60 mm).
- **1.2:** capacidades de cajas recalculadas con canaletas laterales, holguras y reserva del 25 % del RIC N°02. Dos modos de armado (compacto y con canaleta). Las capacidades de 1.0 y 1.1 estaban infladas.
- **1.1:** portafusibles de riel 10 x 38 (1P a 4P), luces piloto de riel (rojo, verde, ambar, azul, blanco), bloque de distribucion tetrapolar 4P y contactor modular de 1 modulo. Sin cambios de formato: el editor los toma solo con reemplazar la carpeta `public/biblioteca/`.
- **1.0:** biblioteca inicial (27 componentes, 28 cajas).
