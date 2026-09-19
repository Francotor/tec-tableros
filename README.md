# TEC Tableros

Editor visual para armar un tablero eléctrico y obtener su lista de materiales. Uso interno de TEC Ingeniería Eléctrica y Construcción: una sola persona, sin cuentas ni servidor. Todo se guarda en el navegador.

- React + Vite + TypeScript, dibujo con `react-konva`.
- PWA: se puede instalar y funciona sin conexión después de la primera carga.
- Los proyectos se guardan en IndexedDB (con guardado automático 1 s después de cada cambio) y se pueden respaldar en un archivo JSON.
- La lógica de negocio está en `src/core/` (funciones puras, sin React ni Konva) y tiene pruebas con `vitest`.

## Cómo ejecutar

Requisitos: Node.js 22 o superior.

```bash
npm install
npm run dev
```

Se abre en `http://localhost:5173/tec-tableros/`.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas unitarias (`vitest`) |
| `npm run lint` | ESLint (prohíbe `any` y que `src/core` importe React o Konva) |
| `npm run build` | Compila para producción en `dist/` (incluye el service worker de la PWA) |
| `npm run preview` | Sirve `dist/` para probar la versión de producción y la PWA |

> El service worker solo se genera en `npm run build`; con `npm run dev` la app no funciona sin conexión.

## Cómo publicar (GitHub Pages)

1. Sube el proyecto a un repositorio de GitHub (rama `master` o `main`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada `git push` a `master`/`main` ejecuta `.github/workflows/deploy.yml`, que instala, corre las pruebas, compila y publica.
4. La app queda en `https://<usuario>.github.io/<repositorio>/`.

La ruta base (`base` de Vite) es `/tec-tableros/` por defecto. En el workflow se ajusta sola al nombre del repositorio (`VITE_BASE`). Para compilar a mano con otra ruta:

```bash
VITE_BASE=/otro-nombre/ npm run build
```

En Windows (PowerShell):

```powershell
$env:VITE_BASE = "/otro-nombre/"; npm run build
```

Si el repositorio no se llama `tec-tableros`, no hace falta cambiar código: basta el workflow.

## Cómo actualizar la biblioteca de componentes

La biblioteca (catálogo, cajas y SVG) vive en `public/biblioteca/` y la app la lee en tiempo de ejecución, así que **se actualiza sin tocar el código**:

1. Descomprime la biblioteca nueva.
2. Copia su contenido (`catalogo.json`, `gabinetes.json`, `componentes/`, `gabinetes/`, `lineales.js`, `lineales/`, etc.) dentro de `public/biblioteca/`, reemplazando lo anterior. Debe quedar `public/biblioteca/catalogo.json`.
3. Corre `npm test`: las pruebas comprueban que cada SVG existe y que su tamaño coincide con `ancho_mm` y `alto_mm` de su ficha.
4. Publica como siempre (`git push`).

No edites los SVG ni las medidas a mano: si una medida está mal, se corrige en `generar_biblioteca.py` de la biblioteca y se regenera.

Nota: para que la PWA sin conexión tome la biblioteca nueva, la app debe abrirse una vez con internet después de publicar (el service worker se actualiza solo).

## Uso rápido

- **Armar:** arrastra una pieza del panel izquierdo al tablero, o tócala y luego toca el tablero. Un aparato de riel solo se suelta cerca de un riel; agrega primero un riel DIN.
- **Editar:** selecciona un elemento para mover (arrastre o flechas: 1 mm; con Shift, 18 mm), duplicar (Ctrl+D), girar canaletas (R) o borrar (Supr). Ctrl+Z / Ctrl+Y deshacen y rehacen.
- **Propiedades y etiquetas:** panel derecho, pestaña *Propiedades*.
- **Lista de materiales:** pestaña *Lista de materiales*: copiar como texto (para el cotizador), descargar CSV, sugerencia de caja y avisos.
- **Proyectos:** botón *Proyectos* (abrir, duplicar, borrar, proyecto nuevo, exportar e importar respaldo).
- **Exportar:** botones *PNG* (imagen del tablero sin rejilla) y *PDF* (una hoja A4 con logo, título, N° de cotización, imagen y lista de materiales).

## Respaldo de proyectos

Los datos viven solo en el navegador de este equipo. Si se borran los datos del sitio o se cambia de equipo, se pierden. Usa **Proyectos → Exportar respaldo** de vez en cuando y guarda el archivo `.json` en otro lugar; **Importar respaldo** lo vuelve a cargar (sin pisar proyectos existentes: si un proyecto tiene el mismo identificador pero contenido distinto, se guarda como copia).

## Iconos de la PWA

`node scripts/iconos.mjs` regenera `public/icons/` a partir de `public/logo_tec.png`.

## Estructura

```
public/biblioteca/   catálogo, cajas y SVG (se reemplaza sin tocar código)
public/logo_tec.png  logo de TEC (único elemento de marca permitido)
src/core/            reglas y cálculos puros, con pruebas
src/store/           estado (zustand), persistencia y autoguardado
src/ui/              componentes React y canvas Konva
src/theme.ts         paleta de marca como variables CSS
NOTAS.md             decisiones tomadas en cada fase
```
