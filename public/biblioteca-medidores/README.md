# biblioteca-medidores v1.0

Biblioteca de componentes para el módulo de **medidores/empalmes** del editor
de tableros TEC. Es un catálogo **separado** de `biblioteca-tableros`, pensado
para conectarse al mismo motor de editor mediante el selector
"Tipo de proyecto: Tablero / Medidor".

## Diferencia clave respecto a biblioteca-tableros

**Este módulo NO aplica la reserva de 25% de RIC N°02 6.1.16.3.** Esa norma
regula tableros, no empalmes/medidores. Se verifica explícitamente en
`validar_biblioteca.py` (punto 1) que ningún gabinete de este catálogo tenga
`reserva_ric_25: true` ni campos de `modulos_max_con_reserva`.

## Convención de datos

- 1 unidad SVG = 1 mm. `viewBox="0 0 ancho alto"`.
- Ningún SVG de componente contiene `<text>` — el editor rotula usando la
  zona `etiqueta` + plantilla `lineas` + `tamano_mm`.
- `tamano_mm` siempre en orden **{alto, ancho, fondo}**.
- Cada componente y gabinete trae un campo **`confianza`**:
  - `confirmado` — medida verificada en foto/plano/ficha aportada por el usuario.
  - `probable` — de fuente técnica razonable (catálogo de fabricante
    equivalente), sin confirmación directa del usuario.
  - `referencial` — sin fuente verificada; usar con margen y confirmar en obra
    antes de cotizar con exactitud.
- Todo elemento con `confianza` distinta de `confirmado` trae una `nota`
  explicando qué falta confirmar.

## Contenido — Componentes (7)

| ID | Tamaño (alto×ancho×fondo mm) | Confianza | Fuente |
|---|---|---|---|
| medidor_trifasico_ares8023 | 264×204×98.5 | confirmado | Plano acotado del usuario |
| medidor_trifasico_compacto | 281.5×177×75 | confirmado | Plano acotado del usuario (sin marca fija; se incluye como alternativa más chica al ARES 8023) |
| medidor_monofasico | 136×106×118 | **probable** | Frente y paso de pernos (124mm) confirmados; **fondo de 118mm pendiente de confirmar** — es más profundo de lo típico en un monofásico |
| interruptor_caja_moldeada_30A | 130×111×50 | **referencial** | Catálogo técnico genérico de la familia Fuji NF-C/NF-S, obtenido por búsqueda web — no confirmado por ficha propia |
| interruptor_caja_moldeada_50_63A | 130×111×50 | referencial | ídem |
| interruptor_caja_moldeada_100_125A | 130×111×100 | referencial | ídem |
| interruptor_caja_moldeada_225_250A | 165×144×100 | referencial | ídem |

## Contenido — Gabinetes (4)

| ID | Tamaño (alto×ancho×fondo mm) | Confianza | Nota |
|---|---|---|---|
| caja_trifasica_cge | 550×300×290 | confirmado | Alto confirmado explícitamente por el usuario. La **partición interna medidor/interruptor es editable** — no hay plano acotado que la fije, se deja proporción inicial 55/45 |
| caja_monofasica_policarbonato | 309×204×128 | confirmado | Zona inferior angulada con 8 orificios para amarre por zip-tie del interruptor; sin marca fija (estándar entre proveedores) |
| caja_inox_vialidad_300x200x150 | 200×300×150 | **probable** | Convertida desde catálogo genérico STX/STXI (que usa Ancho×Alto×Fondo) — ver conversión abajo |
| caja_inox_vialidad_400x300x200 | 300×400×200 | probable | ídem |

### Conversión de convención STX/STXI

El catálogo de origen (genérico, sin marca fija) publica sus dimensiones como
**Ancho × Alto × Fondo**. Este proyecto usa **Alto × Ancho × Fondo**. La
conversión se hizo así:

```
STX/STXI: 300 (Ancho) x 200 (Alto) x 150 (Fondo)
proyecto: alto=200, ancho=300, fondo=150

STX/STXI: 400 (Ancho) x 300 (Alto) x 200 (Fondo)
proyecto: alto=300, ancho=400, fondo=200
```

`validar_biblioteca.py` recalcula esta conversión de forma independiente
(sin reutilizar el código del generador) contra los valores de origen citados
en la nota de cada gabinete, para detectar si alguna vez alguien invierte el
orden por error.

## Pendiente de confirmación por el usuario

1. **Fondo del medidor monofásico (118mm)** — inusualmente profundo para un
   medidor monofásico típico (suelen rondar 60-80mm). Se dejó tal como fue
   indicado, marcado `probable`, pendiente de una foto de perfil/lateral.
2. **Dimensiones de los 4 interruptores de caja moldeada** — se obtuvieron de
   un catálogo técnico general de la misma familia (NF-SV/NF-CV), NO de una
   ficha Fuji NF-C/NF-S específica ni de una foto propia del usuario. Quedan
   marcadas `referencial`. Antes de cotizar con exactitud dimensional,
   conviene confirmar con la ficha del interruptor efectivamente comprado.
3. **Partición interna de la caja trifásica CGE** — se dejó como zona
   editable con una proporción de referencia (55% medidor / 45%
   interruptor), ya que no se aportó un plano acotado de esa división
   interna. El usuario puede ajustar la línea divisoria en el editor.
4. **Cajas inoxidables de vialidad** — son genéricas (`referencial`/`probable`),
   sin ficha de perfiles de fijación interior; la placa interior dibujada es
   una aproximación de margen, no una posición de pernos verificada.

## Estructura de archivos

```
biblioteca-medidores/
├── generar_biblioteca.py      # generador (fuente de verdad de los datos)
├── validar_biblioteca.py      # validador independiente (0 errores en v1.0)
├── catalogo.json              # componentes generados
├── gabinetes.json             # gabinetes generados
├── preview.html               # vista de revisión visual
├── preview_screenshot.png     # captura de referencia de la v1.0
├── componentes/*.svg
├── gabinetes/*.svg
└── datos_fabricantes/         # (reservado para fichas futuras transcritas)
```

## Cómo regenerar y validar

```bash
python3 generar_biblioteca.py
python3 validar_biblioteca.py   # debe terminar con "OK — todas las verificaciones pasaron."
```

## Historial de versiones

- **v1.0** (2026-09-26): primera versión. 7 componentes, 4 gabinetes.
  Sin reserva RIC 25% (excluida a propósito). 0 errores en validador.
