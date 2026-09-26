#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de biblioteca-medidores (v1.1 — esquema real del editor)
====================================================================

v1.0 usaba una convención "de memoria" (tamano_mm anidado {alto,ancho,fondo},
clave raíz "gabinetes", campos como lista de nombres, tipo "policarbonato").
Code confirmó el esquema REAL de su cargador (ver catalogo.json/gabinetes.json
de biblioteca-tableros) y no coincidía en varios puntos. v1.1 regenera todo
contra ese esquema real, campo por campo:

  Componente (catalogo.json):
    id, nombre, categoria (texto libre), svg, ancho_mm, alto_mm (planos),
    montaje ("riel"|"libre"|"lineal"), riel_y_mm, snap {tipo, paso_mm},
    modulos, polos, etiqueta {x,y,w,h,lineas,tamano_mm} | null,
    campos [{id,rotulo,tipo,opciones?,defecto}], atributos {}, bom (string),
    notas.

  Caja (gabinetes.json, clave raíz "cajas"):
    id, nombre, tipo (uno de: metalica | inox | plastica_sobrepuesta |
    plastica_embutida — SOLO esos 4), montaje, fabricante, serie,
    ref_fabricante, alto_mm, ancho_mm, fondo_mm, profundidad_util_mm,
    cierres, svg, placa {x,y,ancho,alto}, fijaciones [{x,y,r_libre_mm}],
    layout {margen_lateral_mm, margen_vertical_mm}, modulos_por_fila,
    filas_max_estimado, capacidad {...}, rieles_incluidos, referencial,
    reemplazo_sugerido, notas.

DIFERENCIA CLAVE respecto a biblioteca-tableros (sin cambios en v1.1):
  Este módulo NO aplica la reserva de 25% de RIC N°02 6.1.16.3. Como el
  editor solo calcula esa reserva dentro de la lógica de riel/canaleta de
  tablero (oculta por completo en modo Medidor), aquí ni siquiera se
  completa "capacidad" con valores realistas de riel: se deja en cero,
  documentado como "no aplica en este módulo" — nunca se usa una reserva
  del 25% en ningún cálculo de esta biblioteca.

LIMITACIÓN DESCUBIERTA EN v1.1 (aviso, no error):
  El esquema real de "caja" solo tiene UNA zona de montaje (`placa`), no
  admite una partición interna editable (por ejemplo, medidor arriba /
  interruptor abajo en la caja trifásica CGE). Esa idea de v1.0 no es
  soportable con el cargador actual. Se deja una sola `placa` cubriendo el
  área útil, con una nota indicando la disposición esperada. Una partición
  interactiva real requeriría una función nueva en el editor.

Marcado de confianza (campo propio nuestro, "confianza" / "notas" — el
cargador de Code no lo valida ni lo usa, es documentación para el usuario):
  - "confirmado"  -> medida verificada en foto/plano/ficha aportada por el usuario.
  - "probable"    -> de catálogo técnico razonable, sin confirmación directa.
  - "referencial" -> sin fuente verificada; confirmar en obra antes de cotizar.
"""

import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
DIR_COMPONENTES = os.path.join(BASE, "componentes")
DIR_GABINETES = os.path.join(BASE, "gabinetes")
DIR_DATOS = os.path.join(BASE, "datos_fabricantes")

os.makedirs(DIR_COMPONENTES, exist_ok=True)
os.makedirs(DIR_GABINETES, exist_ok=True)
os.makedirs(DIR_DATOS, exist_ok=True)


def svg_header(ancho, alto):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {ancho} {alto}" width="{ancho}mm" height="{alto}mm">\n'
    )


def svg_footer():
    return "</svg>\n"


def guardar_svg(dir_destino, nombre_archivo, contenido):
    ruta = os.path.join(dir_destino, nombre_archivo)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(contenido)
    return ruta


def rect(x, y, w, h, **attrs):
    a = " ".join(f'{k.replace("_","-")}="{v}"' for k, v in attrs.items())
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" {a}/>\n'


def circle(cx, cy, r, **attrs):
    a = " ".join(f'{k.replace("_","-")}="{v}"' for k, v in attrs.items())
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" {a}/>\n'


def line(x1, y1, x2, y2, **attrs):
    a = " ".join(f'{k.replace("_","-")}="{v}"' for k, v in attrs.items())
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" {a}/>\n'


ESTILO_CUERPO = dict(fill="#E8E9EA", stroke="#3A3A3A", stroke_width="1")
ESTILO_VENTANA = dict(fill="#CFEFEF", stroke="#3A3A3A", stroke_width="0.8")
ESTILO_PERNO = dict(fill="none", stroke="#3A3A3A", stroke_width="0.8")
ESTILO_PALANCA = dict(fill="#2A2A2A", stroke="none")

SNAP_LIBRE = {"tipo": "libre", "paso_mm": 1}

# ---------------------------------------------------------------------------
# 1. COMPONENTES
# ---------------------------------------------------------------------------

componentes = []


def etiqueta_simple(ancho, alto, lineas, tamano_mm=4.0, y_frac=0.78, h_frac=0.16):
    return {
        "x": ancho * 0.5,
        "y": alto * y_frac,
        "w": ancho * 0.85,
        "h": alto * h_frac,
        "lineas": lineas,
        "tamano_mm": tamano_mm,
    }


# --- 1.1 Medidor trifásico ARES 8023 ---------------------------------------
# Fuente: plano acotado del fabricante subido por el usuario.
# Orden de catálogo: Ancho x Alto x Fondo -> 204 x 264 x 98.5 mm
ancho, alto, fondo = 204, 264, 98.5
svg = svg_header(ancho, alto)
svg += rect(2, 2, ancho - 4, alto - 4, rx=8, **ESTILO_CUERPO)
svg += rect(ancho * 0.18, alto * 0.12, ancho * 0.64, alto * 0.5, rx=4, **ESTILO_VENTANA)
for cx, cy in [(14, 14), (ancho - 14, 14), (14, alto - 14), (ancho - 14, alto - 14)]:
    svg += circle(cx, cy, 3, **ESTILO_PERNO)
svg += svg_footer()
guardar_svg(DIR_COMPONENTES, "medidor_trifasico_ares8023.svg", svg)

componentes.append({
    "id": "medidor_trifasico_ares8023",
    "nombre": "Medidor trifásico (ARES 8023)",
    "categoria": "Medidores",
    "svg": "componentes/medidor_trifasico_ares8023.svg",
    "ancho_mm": ancho,
    "alto_mm": alto,
    "fondo_mm": fondo,
    "montaje": "libre",
    "riel_y_mm": None,
    "snap": SNAP_LIBRE,
    "modulos": None,
    "polos": 3,
    "etiqueta": etiqueta_simple(ancho, alto, ["Medidor trifásico ARES 8023"]),
    "campos": [],
    "atributos": {"fases": 3, "fabricante": "ARES", "serie": "8023"},
    "bom": "Medidor trifásico ARES 8023",
    "notas": None,
    "confianza": "confirmado",
    "fuente": "Plano acotado de fabricante aportado por el usuario",
})

# --- 1.2 Medidor trifásico compacto (sin marca) -----------------------------
# Fuente: plano acotado subido por el usuario. Orden: Ancho x Alto x Fondo
# -> 177 x 281.5 x 75 mm. Se incluye COMO OPCIÓN ADICIONAL junto al ARES 8023
# (el usuario pidió mantener ambos para elegir después).
ancho, alto, fondo = 177, 281.5, 75
svg = svg_header(ancho, alto)
svg += rect(2, 2, ancho - 4, alto - 4, rx=8, **ESTILO_CUERPO)
svg += rect(ancho * 0.15, alto * 0.10, ancho * 0.70, alto * 0.55, rx=4, **ESTILO_VENTANA)
for cx, cy in [(14, 14), (ancho - 14, 14), (14, alto - 14), (ancho - 14, alto - 14)]:
    svg += circle(cx, cy, 3, **ESTILO_PERNO)
svg += svg_footer()
guardar_svg(DIR_COMPONENTES, "medidor_trifasico_compacto.svg", svg)

componentes.append({
    "id": "medidor_trifasico_compacto",
    "nombre": "Medidor trifásico compacto (genérico)",
    "categoria": "Medidores",
    "svg": "componentes/medidor_trifasico_compacto.svg",
    "ancho_mm": ancho,
    "alto_mm": alto,
    "fondo_mm": fondo,
    "montaje": "libre",
    "riel_y_mm": None,
    "snap": SNAP_LIBRE,
    "modulos": None,
    "polos": 3,
    "etiqueta": etiqueta_simple(ancho, alto, ["Medidor trifásico (compacto)"]),
    "campos": [],
    "atributos": {"fases": 3},
    "bom": "Medidor trifásico compacto (genérico)",
    "notas": "Sin marca fija (el usuario compra según mejor oferta). Medidas de plano acotado "
             "confirmadas dimensionalmente.",
    "confianza": "confirmado",
    "fuente": "Plano acotado aportado por el usuario",
})

# --- 1.3 Medidor monofásico --------------------------------------------------
# Fuente: fotos + ficha aportadas por el usuario. Frente 106x136mm, paso de
# pernos 124mm confirmados. Fondo de 118mm indicado por el usuario pero
# inusualmente profundo para un monofásico típico (60-80mm) -> "probable".
ancho, alto, fondo = 106, 136, 118
perno_paso = 124
svg = svg_header(ancho, alto)
svg += rect(2, 2, ancho - 4, alto - 4, rx=6, **ESTILO_CUERPO)
svg += rect(ancho * 0.15, alto * 0.10, ancho * 0.70, alto * 0.45, rx=3, **ESTILO_VENTANA)
cy1 = max((alto - perno_paso) / 2, 4)
cy2 = min(cy1 + perno_paso, alto - 4)
svg += circle(ancho / 2, cy1, 2.5, **ESTILO_PERNO)
svg += circle(ancho / 2, cy2, 2.5, **ESTILO_PERNO)
svg += svg_footer()
guardar_svg(DIR_COMPONENTES, "medidor_monofasico.svg", svg)

componentes.append({
    "id": "medidor_monofasico",
    "nombre": "Medidor monofásico",
    "categoria": "Medidores",
    "svg": "componentes/medidor_monofasico.svg",
    "ancho_mm": ancho,
    "alto_mm": alto,
    "fondo_mm": fondo,
    "montaje": "libre",
    "riel_y_mm": None,
    "snap": SNAP_LIBRE,
    "modulos": None,
    "polos": 1,
    "etiqueta": etiqueta_simple(ancho, alto, ["Medidor monofásico"]),
    "campos": [],
    "atributos": {"fases": 1, "perno_paso_mm": perno_paso},
    "bom": "Medidor monofásico",
    "notas": "Frente (106x136mm) y paso de pernos (124mm) confirmados por foto/ficha. Fondo de "
             "118mm indicado por el usuario; PENDIENTE confirmar con foto de perfil, ya que es "
             "más profundo de lo habitual en un medidor monofásico.",
    "confianza": "probable",
    "referencial": True,
    "fuente": "Fotos y ficha aportadas por el usuario",
})

# --- 1.4 Interruptores de caja moldeada (4 tamaños de marco) ---------------
# Fuente: catálogo técnico general de la familia Fuji NF-C/NF-S / Mitsubishi
# NF-SV (misma familia técnica), obtenido por búsqueda web — NO por ficha
# Fuji específica ni foto propia del usuario. CONFIANZA: "referencial".
CAJA_MOLDEADA = [
    {"rango": "30A", "corriente_max": 30, "ancho": 111, "alto": 130, "fondo": 50},
    {"rango": "50-63A", "corriente_max": 63, "ancho": 111, "alto": 130, "fondo": 50},
    {"rango": "100-125A", "corriente_max": 125, "ancho": 111, "alto": 130, "fondo": 100},
    {"rango": "225-250A", "corriente_max": 250, "ancho": 144, "alto": 165, "fondo": 100},
]

for item in CAJA_MOLDEADA:
    ancho, alto, fondo = item["ancho"], item["alto"], item["fondo"]
    rango_id = item["rango"].replace("-", "_")
    svg = svg_header(ancho, alto)
    svg += rect(1, 1, ancho - 2, alto - 2, rx=4, **ESTILO_CUERPO)
    palanca_w = ancho * 0.18
    svg += rect((ancho - palanca_w) / 2, alto * 0.25, palanca_w, alto * 0.5, rx=3, **ESTILO_PALANCA)
    for i in range(3):
        bx = ancho * (0.22 + 0.28 * i)
        svg += rect(bx, 4, 8, 6, fill="#8F9196", stroke="#3A3A3A", stroke_width="0.5")
        svg += rect(bx, alto - 10, 8, 6, fill="#8F9196", stroke="#3A3A3A", stroke_width="0.5")
    svg += svg_footer()
    fname = f"interruptor_caja_moldeada_{rango_id}.svg"
    guardar_svg(DIR_COMPONENTES, fname, svg)

    componentes.append({
        "id": f"interruptor_caja_moldeada_{rango_id}",
        "nombre": f"Interruptor caja moldeada {item['rango']}",
        "categoria": "Interruptor caja moldeada",
        "svg": f"componentes/{fname}",
        "ancho_mm": ancho,
        "alto_mm": alto,
        "fondo_mm": fondo,
        "montaje": "libre",
        "riel_y_mm": None,
        "snap": SNAP_LIBRE,
        "modulos": None,
        "polos": None,
        "etiqueta": etiqueta_simple(ancho, alto, [f"Int. caja moldeada {item['rango']}", "{polos}P"]),
        "campos": [
            {"id": "polos", "rotulo": "N° de polos", "tipo": "select",
             "opciones": [1, 2, 3, 4], "defecto": 3},
        ],
        "atributos": {"corriente_max_A": item["corriente_max"], "rango": item["rango"]},
        "bom": "Interruptor caja moldeada {rango} {polos}P",
        "notas": "Dimensiones de catálogo técnico general de la familia Fuji NF-C/NF-S / "
                 "Mitsubishi NF-SV (no ficha Fuji específica ni foto propia). Confirmar con la "
                 "ficha del interruptor efectivamente comprado antes de cotizar con exactitud "
                 "dimensional.",
        "confianza": "referencial",
        "referencial": True,
        "fuente": "Búsqueda de catálogo técnico (no verificado por el usuario)",
    })

catalogo = {
    "version": "1.1",
    "unidad": "mm",
    "modulo": "medidores",
    "nota_reserva": "Este módulo NO aplica la reserva de 25% de RIC N°02 6.1.16.3 (esa norma "
                     "aplica solo a tableros). No se usa en ningún cálculo de esta biblioteca.",
    "componentes": componentes,
}

with open(os.path.join(BASE, "catalogo.json"), "w", encoding="utf-8") as f:
    json.dump(catalogo, f, ensure_ascii=False, indent=2)

print(f"Componentes generados: {len(componentes)}")


# ---------------------------------------------------------------------------
# 2. CAJAS (gabinetes.json, clave raíz "cajas")
# ---------------------------------------------------------------------------

cajas = []

CAPACIDAD_NO_APLICA = {
    "con_canaleta": {"paso_filas_mm": 0, "largo_riel_mm": 0, "filas": 0,
                      "modulos_por_fila": 0, "modulos_total": 0, "modulos_max_con_reserva": 0},
    "compacto": {"paso_filas_mm": 0, "largo_riel_mm": 0, "filas": 0,
                 "modulos_por_fila": 0, "modulos_total": 0, "modulos_max_con_reserva": 0},
    "por_canaleta": {},
    "nota": "No aplica en este módulo: los gabinetes de medidor no usan riel/canaleta ni la "
            "reserva de 25% de RIC N°02 (esa reserva es exclusiva de tableros).",
}


def caja_svg(nombre_archivo, ancho, alto, placa, angulo_inferior=False, huecos=None):
    svg = svg_header(ancho, alto)
    svg += rect(0, 0, ancho, alto, rx=6, fill="#F2F3F4", stroke="#2A2A2A", stroke_width="1.5")
    svg += rect(placa["x"], placa["y"], placa["ancho"], placa["alto"], rx=2,
                fill="none", stroke="#8F9196", stroke_width="1", stroke_dasharray="4,3")
    if angulo_inferior:
        y0 = alto * 0.68
        svg += (f'<polygon points="0,{y0} {ancho},{y0} {ancho},{alto} 0,{alto}" '
                f'fill="#E4E6E7" stroke="#8F9196" stroke-width="0.8"/>\n')
        if huecos:
            for hx, hy in huecos:
                svg += circle(hx, hy, 2, fill="none", stroke="#3A3A3A", stroke_width="0.6")
    svg += svg_footer()
    return guardar_svg(DIR_GABINETES, nombre_archivo, svg), f"gabinetes/{nombre_archivo}"


# --- 2.1 Caja trifásica CGE (empalme trifásico con medidor + interruptor) --
# Confirmado por el usuario: "deja la caja como dice 550 de alto".
# 550 alto x 300 ancho x 290 fondo.
# LIMITACIÓN (ver docstring del módulo): el esquema real de "caja" no admite
# dos zonas (medidor + interruptor) con partición editable. Se deja UNA sola
# placa cubriendo el área útil; la disposición esperada (medidor arriba,
# interruptor abajo) queda documentada en "notas", no como campo funcional.
alto, ancho, fondo = 550, 300, 290
placa = {"x": ancho * 0.1, "y": alto * 0.05, "ancho": ancho * 0.8, "alto": alto * 0.90}
_, svg_path = caja_svg("caja_trifasica_cge.svg", ancho, alto, placa)

cajas.append({
    "id": "caja_trifasica_cge",
    "nombre": "Caja trifásica para empalme (tipo CGE)",
    "tipo": "metalica",
    "montaje": "sobrepuesta",
    "fabricante": None,
    "serie": None,
    "ref_fabricante": None,
    "alto_mm": alto,
    "ancho_mm": ancho,
    "fondo_mm": fondo,
    "profundidad_util_mm": None,
    "cierres": "2",
    "svg": svg_path,
    "placa": placa,
    "fijaciones": [],
    "layout": {"margen_lateral_mm": ancho * 0.1, "margen_vertical_mm": alto * 0.05},
    "modulos_por_fila": 0,
    "filas_max_estimado": 0,
    "capacidad": CAPACIDAD_NO_APLICA,
    "rieles_incluidos": False,
    "referencial": False,
    "confianza": "confirmado",
    "reemplazo_sugerido": None,
    "notas": "Tamaño exterior (550 alto x 300 ancho x 290 fondo) confirmado por el usuario. "
             "Disposición esperada: medidor en el tercio/mitad superior, interruptor en la "
             "mitad inferior — sin plano acotado que fije la partición exacta, así que aquí se "
             "modela como una sola placa de montaje; la posición relativa de medidor e "
             "interruptor dentro de ella queda a criterio de quien arma el proyecto. 'tipo' "
             "fijado como 'metalica' (SUPUESTO: confirmar si es acero galvanizado o inoxidable, "
             "ya que el esquema del editor no distingue 'metalica_inox' como tipo válido).",
})

# --- 2.2 Caja monofásica de policarbonato ----------------------------------
# Medidas confirmadas por el usuario (204 x 309 x 128mm).
# 'tipo' no tiene valor "policarbonato" en el editor real; se mapea a
# "plastica_sobrepuesta" (SUPUESTO: se monta expuesta en muro/poste).
ancho, alto, fondo = 204, 309, 128
placa = {"x": ancho * 0.12, "y": alto * 0.05, "ancho": ancho * 0.76, "alto": alto * 0.55}
huecos = [(ancho * 0.5 + dx, alto * 0.85) for dx in (-60, -35, -10, 10, 35, 60, -85, 85)]
_, svg_path = caja_svg("caja_monofasica_policarbonato.svg", ancho, alto, placa,
                        angulo_inferior=True, huecos=huecos)

cajas.append({
    "id": "caja_monofasica_policarbonato",
    "nombre": "Caja monofásica de policarbonato (empalme domiciliario)",
    "tipo": "plastica_sobrepuesta",
    "montaje": "sobrepuesta",
    "fabricante": None,
    "serie": None,
    "ref_fabricante": None,
    "alto_mm": alto,
    "ancho_mm": ancho,
    "fondo_mm": fondo,
    "profundidad_util_mm": None,
    "cierres": "1",
    "svg": svg_path,
    "placa": placa,
    "fijaciones": [],
    "layout": {"margen_lateral_mm": ancho * 0.12, "margen_vertical_mm": alto * 0.05},
    "modulos_por_fila": 0,
    "filas_max_estimado": 0,
    "capacidad": CAPACIDAD_NO_APLICA,
    "rieles_incluidos": False,
    "referencial": False,
    "confianza": "confirmado",
    "reemplazo_sugerido": None,
    "notas": "Medidas confirmadas por el usuario a partir de la ficha de policarbonato "
             "aportada. Zona inferior angulada con 8 orificios para amarre por zip-tie del "
             "interruptor (no un campo funcional, solo referencia visual). Sin marca fija: son "
             "estándar entre proveedores según indicó el usuario. 'tipo' fijado como "
             "'plastica_sobrepuesta' (SUPUESTO: el editor no tiene un tipo 'policarbonato'; se "
             "eligió sobrepuesta porque se monta expuesta en muro o poste, no empotrada).",
})

# --- 2.3 Cajas inoxidables genéricas para empalme en vialidad ---------------
# Origen: catálogo genérico STX/STXI, que publica Ancho x Alto x Fondo.
# Este proyecto usa alto_mm/ancho_mm/fondo_mm planos -> conversión explícita.
CAJAS_VIALIDAD = [
    {"id": "caja_inox_vialidad_300x200x150", "origen_axhxf": (300, 200, 150)},
    {"id": "caja_inox_vialidad_400x300x200", "origen_axhxf": (400, 300, 200)},
]

for item in CAJAS_VIALIDAD:
    ancho_o, alto_o, fondo_o = item["origen_axhxf"]
    alto, ancho, fondo = alto_o, ancho_o, fondo_o  # conversión Ancho×Alto×Fondo -> alto/ancho/fondo
    placa = {"x": ancho * 0.08, "y": alto * 0.06, "ancho": ancho * 0.84, "alto": alto * 0.88}
    _, svg_path = caja_svg(f"{item['id']}.svg", ancho, alto, placa)
    cajas.append({
        "id": item["id"],
        "nombre": f"Caja inoxidable genérica {ancho_o}x{alto_o}x{fondo_o} (empalme en vialidad)",
        "tipo": "inox",
        "montaje": "sobrepuesta",
        "fabricante": None,
        "serie": None,
        "ref_fabricante": None,
        "alto_mm": alto,
        "ancho_mm": ancho,
        "fondo_mm": fondo,
        "profundidad_util_mm": None,
        "cierres": "1",
        "svg": svg_path,
        "placa": placa,
        "fijaciones": [],
        "layout": {"margen_lateral_mm": ancho * 0.08, "margen_vertical_mm": alto * 0.06},
        "modulos_por_fila": 0,
        "filas_max_estimado": 0,
        "capacidad": CAPACIDAD_NO_APLICA,
        "rieles_incluidos": False,
        "referencial": True,
        "confianza": "probable",
        "reemplazo_sugerido": None,
        "notas": f"Origen catálogo genérico STX/STXI en convención Ancho x Alto x Fondo "
                 f"({ancho_o} x {alto_o} x {fondo_o} mm), convertida aquí a la convención plana "
                 f"del proyecto (alto_mm={alto}, ancho_mm={ancho}, fondo_mm={fondo}). Sin marca "
                 f"fija ni ficha de pernos de fijación específica: la placa interior es "
                 f"referencial (margen aproximado, no posición de pernos verificada).",
    })

with open(os.path.join(BASE, "gabinetes.json"), "w", encoding="utf-8") as f:
    json.dump({
        "version": "1.1",
        "unidad": "mm",
        "modulo": "medidores",
        "cajas": cajas,
    }, f, ensure_ascii=False, indent=2)

print(f"Cajas generadas: {len(cajas)}")
print("Listo.")
