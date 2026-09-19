# Notas de decisiones

- La carpeta del proyecto se llama `tableros` (no `tablero`); el proyecto Vite está en su raíz.
- `biblioteca-tableros/` y `logo_tec.PNG` originales quedan intactos y fuera de git (`.gitignore`); la copia de trabajo está en `public/`.
- Node.js LTS no estaba instalado; se instaló con winget (Node 24).
- Python no está instalado (solo el atajo de la Store), por lo que `validar_biblioteca.py` no se ejecutó. Las comprobaciones de tamaño SVG/ficha se cubren con pruebas de vitest.
- `base` de Vite: `/tec-tableros/`, sobrescribible con `VITE_BASE`.
- Los SVG y catálogos se cargan por `fetch` en tiempo de ejecución (no se importan al bundle), para poder actualizar la biblioteca sin tocar el código.
- Las cajas `plastica_sobrepuesta` / `plastica_embutida` son tipos distintos en `gabinetes.json`; el modelo de proyecto del documento solo distingue `metalica | inox` para medida libre.

## Fase 1
- Coordenadas: origen en la esquina superior izquierda de la caja. Área de trabajo = placa (metálica/inox) o la caja completa (plástica). Medida libre: placa con 25 mm de margen por lado (mismo criterio que la biblioteca).
- Aparato de riel: se asigna al riel más cercano (distancia al rectángulo del riel) y debe quedar dentro de su largo. Un aparato pertenece a un riel si su línea riel_y_mm coincide con el centro del riel; no se guarda un vínculo en el modelo.
- Imán: se compara contra la posición ajustada a la rejilla y contra la posición del puntero; gana el borde vecino más cercano si está a ≤ 3 mm.
- Topes: son automáticos (no elementos); se dibujan pegados a cada extremo del grupo de aparatos. No se exige espacio para ellos dentro del riel (el ejemplo de la biblioteca deja 9 mm al inicio, pero la rejilla modular parte en 0 mm). Un aviso por topes que sobresalen queda para la Fase 3.
- Un riel arrastra a sus aparatos al moverse (se aplican en el soltar, no durante el arrastre). Borrar un riel borra sus aparatos (se puede deshacer).
- Canaletas no pueden solaparse con rieles (además de aparatos y otras canaletas). Los aparatos de montaje libre (fotocelda) no pueden solaparse con nada.
- Cajas plásticas: no se pueden agregar rieles (traen los suyos). Si el proyecto venía de una caja metálica, los rieles ya agregados se conservan y se marcan en rojo si quedan fuera.
- Riel y canaleta por defecto: 400 mm, acortado al ancho de la placa si no cabe.
- Flechas mueven 1 mm (Shift: 18 mm) sin rejilla ni imán; en aparatos de riel solo se desplaza en horizontal.
- Solo hay selección simple (un elemento a la vez).
- Atajos: Supr borra, R gira canaleta, Ctrl+D duplica, Ctrl+Z / Ctrl+Y (o Ctrl+Shift+Z) deshacer/rehacer. Historial de 200 pasos.
- En pantallas táctiles el arrastre HTML5 desde el panel no funciona: se toca la ficha y luego el tablero.
- El proyecto vive solo en memoria hasta la Fase 4 (persistencia).
- lineales.js se carga en tiempo de ejecución desde public/biblioteca/ (Blob + import dinámico) para que actualizar la biblioteca no exija tocar código.

## Fase 2
- Panel de propiedades a la derecha (bajo el canvas en pantallas de menos de 900 px), generado desde los `campos` de la ficha. Los selectores y el texto aplican en vivo; los enteros aplican al ser válidos.
- Ediciones seguidas del mismo campo (por ejemplo, escribir en un texto) cuentan como un solo paso de deshacer.
- Largo de rieles y canaletas: se aplica al pulsar Enter o al salir del campo; el error de rango se muestra bajo el campo. Si el largo choca con algo, se rechaza con el aviso del canvas.
- Plantillas: un `{campo}` inexistente queda vacío (no rompe); las líneas que quedan vacías se omiten y el resto se reparte en la altura de la zona `etiqueta`. Los valores se toman de `atributos`, luego los defectos de los campos y luego lo editado.
- Si una línea es más ancha que la zona, se reduce el tamaño de letra para que quepa (estimación de 0,62 × tamaño por carácter). Texto libre limitado a 12 caracteres.
- Se corrigió un error de Fase 1: acortar un riel con aparatos montados era rechazado por colisión con sus propios aparatos.
