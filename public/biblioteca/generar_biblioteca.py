#!/usr/bin/env python3
"""
Genera la biblioteca de componentes de tableros de TEC.

Salida (junto a este script):
  componentes/*.svg      componentes con medidas reales (1 unidad SVG = 1 mm)
  gabinetes/*.svg        cajas metalicas, inox y plasticas
  lineales/*.svg         ejemplos de riel DIN y canaleta (los genera lineales.js)
  catalogo.json          fichas de cada componente (medidas, montaje, campos, lista de materiales)
  gabinetes.json         cajas y parametros de calculo
  ejemplo_tablero_armado.svg / ejemplo_lista_materiales.csv
  preview.html           hoja de revision visual

Para cambiar una medida: editar las constantes o las llamadas de abajo y volver a ejecutar.
"""
import csv
import json
import os
import subprocess
from math import floor

BASE = os.path.dirname(os.path.abspath(__file__))
DIRS = {k: os.path.join(BASE, k) for k in ("componentes", "gabinetes", "lineales")}
for d in DIRS.values():
    os.makedirs(d, exist_ok=True)

# ---------------------------------------------------------------- parametros
MOD = 18            # ancho de un modulo DIN (mm)
H_MOD = 90          # alto frontal de un aparato modular (mm)
MARGEN_PLACA = 50   # caja exterior - placa interior, por dimension (mm)  [supuesto]
CANALETA = 25       # canaleta del ejemplo armado (mm)

# Regla de armado v1.2 (ver README). Valores propios derivados del RIC N°02 y de practica de fabricantes.
L_MARGEN = 20           # placa -> canaleta o riel (mm). Depende de la placa: las tuercas de fijacion de las esquinas ocupan el borde [supuesto]
L_HOLGURA = 10          # aparato/riel -> canaleta (mm), minimo             [supuesto]
L_TOPE = 8              # ancho de un tope de riel (mm)
L_PASO_COMPACTO = 125   # entre ejes de riel, sin canaletas (mm)            [practica de fabricantes]
L_PASO_MIN = 150        # entre ejes de riel, con canaletas (mm)            [practica de fabricantes]
RESERVA = 0.25          # ampliacion exigida por RIC N°02, 6.1.16.3
CANALETA_DEFECTO = 40   # la seccion mas usada en cajas metalicas segun el usuario
CANALETAS = (25, 40, 60)
# Cajas de fabricante (Eldon ASR): datos en datos_fabricantes/eldon_asr.json
ASR_FIJ_LATERAL = 25    # centro del perno M8 al borde lateral de la placa (plano del catalogo)
ASR_FIJ_VERTICAL = 10   # centro del perno M8 al borde superior o inferior de la placa
ASR_R_LIBRE = 10        # radio libre alrededor de cada perno (tuerca M8 de 13 mm mas holgura) [supuesto]
ASR_MARGEN_LATERAL = 10  # placa -> canaleta lateral en cajas ASR                                [supuesto]
REEMPLAZO_EXCLUYE_SERIES = ("KT",)  # cajas de terminales: el material de la caja no figura en el catalogo entregado
REEMPLAZO_MAX_DIF_FONDO = 30  # una caja real reemplaza a una generica solo si el fondo difiere hasta esto (mm) [supuesto]
EJEMPLO_MODULOS = 22    # el ejemplo armado conserva su medida historica para no romper la prueba de referencia

C = dict(
    body="#F1F2F4", body_s="#B5BBC4", term="#9BA2AD", screw="#6B727D",
    slot="#D3D7DD", lever="#23272E", blue="#2F6FD0", label="#FFFFFF",
    label_s="#D3D7DD", dark="#3B414A", dark_s="#23272E", copper="#C97B3D",
)


# ---------------------------------------------------------------- helpers svg
def n(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def rect(x, y, w, h, fill, stroke=None, sw=0.5, rx=0):
    s = f'<rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}"'
    if rx:
        s += f' rx="{n(rx)}"'
    s += f' fill="{fill}"'
    if stroke:
        s += f' stroke="{stroke}" stroke-width="{n(sw)}"'
    return s + "/>"


def circ(cx, cy, r, fill, stroke=None, sw=0.5):
    s = f'<circle cx="{n(cx)}" cy="{n(cy)}" r="{n(r)}" fill="{fill}"'
    if stroke:
        s += f' stroke="{stroke}" stroke-width="{n(sw)}"'
    return s + "/>"


def line(x1, y1, x2, y2, stroke, sw=0.5):
    return (f'<line x1="{n(x1)}" y1="{n(y1)}" x2="{n(x2)}" y2="{n(y2)}" '
            f'stroke="{stroke}" stroke-width="{n(sw)}" stroke-linecap="round"/>')


def envolver(w, h, inner, titulo, desc):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{n(w)}mm" height="{n(h)}mm" '
            f'viewBox="0 0 {n(w)} {n(h)}" role="img"><title>{titulo}</title>'
            f'<desc>{desc}</desc>{inner}</svg>')


def interior(svg):
    return svg.split("</desc>", 1)[1].rsplit("</svg>", 1)[0]


def escribir(ruta, texto):
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)


# ---------------------------------------------------------------- piezas comunes
def tornillo(cx, cy):
    return circ(cx, cy, 2.6, C["screw"]) + line(cx - 1.6, cy, cx + 1.6, cy, "#D9DCE1", 0.6)


def terminales(W, polos, H=H_MOD):
    s = rect(1.5, 2, W - 3, 9, C["term"]) + rect(1.5, H - 11, W - 3, 9, C["term"])
    for i in range(polos):
        cx = W / polos * (i + 0.5)
        s += tornillo(cx, 6.5) + tornillo(cx, H - 6.5)
    return s


def cuerpo(W, H, polos, oscuro=False):
    fill, st = (C["dark"], C["dark_s"]) if oscuro else (C["body"], C["body_s"])
    return rect(0.25, 0.25, W - 0.5, H - 0.5, fill, st, 0.5, 1.5) + terminales(W, polos, H)


def placa_etiqueta(x, y, w, h):
    return rect(x, y, w, h, C["label"], C["label_s"], 0.4, 1)


def palanca(W):
    sx, sw = (5, 8) if W == MOD else (3, W - 6)
    return rect(sx, 38, sw, 26, C["slot"], None, rx=2) + rect(sx + 1.5, 41, sw - 3, 13, C["lever"], rx=1.5)


def boton_test(W):
    return rect(W / 2 - 4.5, 67.5, 9, 7, C["blue"], rx=1.5)


# ---------------------------------------------------------------- registro
COMPS = []
INNER = {}


def reg(id_, nombre, cat, W, H, inner, montaje, riel_y=None, snap=None, etiqueta=None,
        campos=None, atributos=None, bom=None, notas=None, modulos=None, polos=None):
    escribir(os.path.join(DIRS["componentes"], f"{id_}.svg"),
             envolver(W, H, inner, nombre, f"{nombre}, {n(W)} x {n(H)} mm, dibujo generico sin marca"))
    meta = {
        "id": id_, "nombre": nombre, "categoria": cat,
        "svg": f"componentes/{id_}.svg", "ancho_mm": W, "alto_mm": H,
        "montaje": montaje,
        "riel_y_mm": riel_y,
        "snap": snap or {"tipo": "libre", "paso_mm": 1},
        "modulos": modulos, "polos": polos,
        "etiqueta": etiqueta, "campos": campos or [],
        "atributos": atributos or {}, "bom": bom, "notas": notas,
    }
    COMPS.append(meta)
    INNER[id_] = (inner, W, H)


def campo_select(id_, opciones, defecto, rotulo):
    return {"id": id_, "rotulo": rotulo, "tipo": "select", "opciones": opciones, "defecto": defecto}


SNAP_MOD = {"tipo": "modular", "paso_mm": MOD}

# ---------------------------------------------------------------- protecciones
DEF_AUTO = {1: 16, 2: 40, 3: 25, 4: 63}
for p in (1, 2, 3, 4):
    W = MOD * p
    inner = cuerpo(W, H_MOD, p) + placa_etiqueta(2.5, 15, W - 5, 17) + palanca(W)
    lineas = ["Q{indice}", "{curva}{amperaje}"] if p == 1 else ["{polos}P Q{indice}", "{curva}{amperaje}"]
    reg(f"automatico_{p}p", f"Interruptor automatico {p}P", "Protecciones", W, H_MOD, inner,
        "riel", 45, SNAP_MOD,
        {"x": 2.5, "y": 15, "w": W - 5, "h": 17, "lineas": lineas, "tamano_mm": 4.4},
        [{"id": "indice", "rotulo": "N° de automático", "tipo": "entero", "defecto": 1},
         campo_select("curva", ["B", "C", "D"], "C", "Curva"),
         campo_select("amperaje", [6, 10, 16, 20, 25, 32, 40, 50, 63], DEF_AUTO[p], "Corriente (A)")],
        {"polos": p}, "Interruptor automatico {polos}P {curva}{amperaje} A", modulos=p, polos=p)

for p, defa, defs in ((2, 40, "30 mA"), (4, 63, "300 mA")):
    W = MOD * p
    inner = cuerpo(W, H_MOD, p) + placa_etiqueta(2.5, 15, W - 5, 17) + palanca(W) + boton_test(W)
    reg(f"diferencial_{p}p", f"Interruptor diferencial {p}P", "Protecciones", W, H_MOD, inner,
        "riel", 45, SNAP_MOD,
        {"x": 2.5, "y": 15, "w": W - 5, "h": 17, "lineas": ["QD{indice} {amperaje}A", "{sensibilidad}"], "tamano_mm": 4.2},
        [{"id": "indice", "rotulo": "N° de diferencial", "tipo": "entero", "defecto": 1},
         campo_select("amperaje", [25, 40, 63, 80], defa, "Corriente (A)"),
         campo_select("sensibilidad", ["30 mA", "300 mA"], defs, "Sensibilidad")],
        {"polos": p}, "Interruptor diferencial {polos}P {amperaje} A {sensibilidad}", modulos=p, polos=p)

# ---------------------------------------------------------------- comando
W = 2 * MOD
inner = (cuerpo(W, H_MOD, 2, oscuro=True) + rect(3, 15, W - 6, 30, "#E6E8EC", None, rx=1)
         + rect(W / 2 - 6, 58, 12, 8, "#D0D4DA", rx=1.5))
CONTACTOR_CAMPOS = [
    {"id": "indice", "rotulo": "N° de contactor", "tipo": "entero", "defecto": 1},
    campo_select("corriente", [20, 25, 40, 63], 25, "Corriente (A)"),
    campo_select("bobina", ["24 V", "230 V"], "230 V", "Bobina"),
]
reg("contactor_2p_modular", "Contactor modular 2P", "Comando", W, H_MOD, inner, "riel", 45, SNAP_MOD,
    {"x": 3, "y": 15, "w": W - 6, "h": 30, "lineas": ["K{indice}", "{corriente}A"], "tamano_mm": 4.4},
    CONTACTOR_CAMPOS, {"polos": 2}, "Contactor modular {polos}P {corriente} A, bobina {bobina}",
    modulos=2, polos=2)

W, H = 45, 85
inner = (cuerpo(W, H, 3, oscuro=True) + rect(3, 24, W - 6, 26, "#E6E8EC", None, rx=1)
         + rect(W / 2 - 6, 56, 12, 6, "#D0D4DA", rx=1.5))
CONT3 = [
    {"id": "indice", "rotulo": "N° de contactor", "tipo": "entero", "defecto": 1},
    campo_select("corriente", [9, 12, 18, 25, 32], 25, "Corriente (A)"),
    campo_select("bobina", ["24 V", "230 V"], "230 V", "Bobina"),
]
reg("contactor_3p", "Contactor 3P (industrial)", "Comando", W, H, inner, "riel", H / 2,
    {"tipo": "libre", "paso_mm": 1},
    {"x": 3, "y": 24, "w": W - 6, "h": 26, "lineas": ["K{indice}", "{corriente}A"], "tamano_mm": 4.4},
    CONT3, {"polos": 3}, "Contactor {polos}P {corriente} A, bobina {bobina}", polos=3,
    notas="Ancho de 45 mm no es multiplo de 18: se ajusta por borde con los vecinos.")

# ---------------------------------------------------------------- control
W = 2 * MOD
lcd = rect(3, 14, 30, 14, "#8FA394", "#6F7F73", 0.4, 1)
for x in (6, 12, 21, 27):
    lcd += rect(x, 17, 3.5, 8, "#3D4A40")
lcd += circ(18, 19.5, 0.8, "#3D4A40") + circ(18, 23.5, 0.8, "#3D4A40")
botones = "".join(circ(cx, 36, 3, C["slot"], "#9BA2AD", 0.4) for cx in (9, 18, 27))
inner = cuerpo(W, H_MOD, 2) + lcd + botones + placa_etiqueta(2.5, 46, W - 5, 17)
reg("reloj_control", "Reloj control horario", "Control", W, H_MOD, inner, "riel", 45, SNAP_MOD,
    {"x": 2.5, "y": 46, "w": W - 5, "h": 17, "lineas": ["{etiqueta}"], "tamano_mm": 4.4},
    [{"id": "etiqueta", "rotulo": "Rotulo", "tipo": "texto", "defecto": "RC1"}],
    {}, "Reloj control horario programable 2 modulos", modulos=2, polos=2,
    notas="Ancho de 2 modulos [supuesto]: los hay de 1 a 3, medir el que se instala.")

inner = (cuerpo(W, H_MOD, 2) + circ(27, 18, 1.8, "#4CAF50")
         + circ(18, 40, 10, C["slot"], "#9BA2AD", 0.5) + line(18, 40, 18, 32, C["lever"], 1.4)
         + placa_etiqueta(2.5, 56, W - 5, 17))
reg("rele_crepuscular", "Rele crepuscular (riel)", "Control", W, H_MOD, inner, "riel", 45, SNAP_MOD,
    {"x": 2.5, "y": 56, "w": W - 5, "h": 17, "lineas": ["{etiqueta}"], "tamano_mm": 4.4},
    [{"id": "etiqueta", "rotulo": "Rotulo", "tipo": "texto", "defecto": "FC1"}],
    {}, "Rele crepuscular de riel 2 modulos", modulos=2, polos=2)

inner = (circ(20, 20, 19.5, "#E9E9E4", C["body_s"], 0.5) + circ(20, 20, 14, "none", "#C9CDD3", 0.5)
         + circ(20, 20, 9, "#E7B84A", "#B8912F", 0.5))
reg("fotocelda", "Fotocelda (sensor exterior)", "Control", 40, 40, inner, "libre", None,
    {"tipo": "libre", "paso_mm": 1}, None, [], {}, "Fotocelda (sensor crepuscular exterior)",
    notas="No va sobre riel: se fija a la caja o a la placa.")

# ---------------------------------------------------------------- distribucion
for vias in (6, 12):
    W, H = 9 * vias, 60
    inner = rect(0.25, 0.25, W - 0.5, H - 0.5, "#F4F4F2", C["body_s"], 0.5, 1.5)
    inner += rect(1.5, 18, W - 3, 24, C["copper"], "#9E5A25", 0.5, 1)
    inner += "".join(tornillo(4.5 + 9 * i, 30) for i in range(vias))
    inner += placa_etiqueta(2, 3, W - 4, 10)
    reg(f"barra_repartidora_{vias}v", f"Barra repartidora {vias} vias", "Distribucion", W, H, inner,
        "riel", 30, SNAP_MOD,
        {"x": 2, "y": 3, "w": W - 4, "h": 10, "lineas": ["{funcion}"], "tamano_mm": 4},
        [campo_select("funcion", ["N", "T", "F"], "N", "Funcion")],
        {"vias": vias}, "Barra repartidora {vias} vias", modulos=vias // 2,
        notas="Ancho de 9 mm por via [supuesto]; ajustar al modelo real.")

COLORES = {
    "gris": ("#B9BEC7", "#8E96A2", "Fase (gris)"),
    "azul": ("#4C86D6", "#2F5FA5", "Neutro (azul)"),
    "tierra": ("#D6DE3E", "#9AA02A", "Tierra (verde-amarillo)"),
}
for mm2, W, H in ((4, 6, 45), (16, 12, 50), (35, 16, 55)):
    for clave, (fill, st, rot) in COLORES.items():
        inner = rect(0.25, 0.25, W - 0.5, H - 0.5, fill, st, 0.5, 1)
        if clave == "tierra":
            inner += rect(W / 3, 0.25, W / 3, H - 0.5, "#2E9B4B")
        r = min(2.4, W / 2 - 1.2)
        inner += circ(W / 2, 9, r, C["screw"]) + circ(W / 2, H - 9, r, C["screw"])
        reg(f"borne_{mm2}_{clave}", f"Borne de paso {mm2} mm2 {clave}", "Distribucion", W, H, inner,
            "riel", H / 2, {"tipo": "libre", "paso_mm": 1}, None, [],
            {"seccion_mm2": mm2, "color": clave, "funcion": rot},
            "Borne de paso {seccion_mm2} mm2 {color}",
            notas="Ancho segun seccion; medidas aproximadas [supuesto], ajustar a la marca usada.")

# ---------------------------------------------------------------- ampliacion v1.1
# Portafusibles de riel 10 x 38 (18 mm por polo)
for p in (1, 2, 3, 4):
    W = MOD * p
    tapas = ""
    for i in range(p):
        x0 = MOD * i
        tapas += rect(x0 + 3, 33, MOD - 6, 31, "#E6E8EC", C["body_s"], 0.4, 1.5)
        tapas += line(x0 + 3, 37, x0 + MOD - 3, 37, C["body_s"], 0.5)
        tapas += "".join(line(x0 + 5, y, x0 + MOD - 5, y, C["body_s"], 0.5) for y in (56, 59, 62))
    inner = cuerpo(W, H_MOD, p) + placa_etiqueta(2.5, 15, W - 5, 14) + tapas
    reg(f"portafusible_10x38_{p}p", f"Portafusible de riel 10 x 38 {p}P", "Protecciones", W, H_MOD, inner,
        "riel", 45, SNAP_MOD,
        {"x": 2.5, "y": 15, "w": W - 5, "h": 14, "lineas": ["{calibre}A"], "tamano_mm": 4.4},
        [campo_select("tipo", ["gG", "aM"], "gG", "Tipo de fusible"),
         campo_select("calibre", [2, 4, 6, 10, 16, 20, 25, 32], 10, "Calibre (A)")],
        {"polos": p, "formato": "10x38"},
        "Portafusible de riel 10 x 38 mm {polos}P, fusibles {tipo} {calibre} A", modulos=p, polos=p,
        notas="18 mm por polo [supuesto tipico del formato 10 x 38]. Para 14 x 51 o 22 x 58 se necesitan fichas propias.")

# Luces piloto de riel (1 modulo), una ficha por color
LUCES = {
    "rojo": ("#D64545", "#9E2A2A"), "verde": ("#3FA34D", "#2A7535"), "ambar": ("#F2A900", "#B57C00"),
    "azul": ("#2F6FD0", "#1F4E99"), "blanco": ("#F5F5F5", "#B5BBC4"),
}
for color, (fill, st) in LUCES.items():
    inner = (cuerpo(MOD, H_MOD, 1) + placa_etiqueta(2.5, 15, MOD - 5, 14)
             + circ(9, 48, 8, "#DDE1E6", "#9BA2AD", 0.5) + circ(9, 48, 6.3, fill, st, 0.5)
             + '<circle cx="7" cy="45.5" r="1.8" fill="#FFFFFF" fill-opacity="0.55"/>')
    reg(f"luz_piloto_{color}", f"Luz piloto de riel {color}", "Control", MOD, H_MOD, inner,
        "riel", 45, SNAP_MOD,
        {"x": 2.5, "y": 15, "w": MOD - 5, "h": 14, "lineas": ["{etiqueta}"], "tamano_mm": 4.4},
        [{"id": "etiqueta", "rotulo": "Rotulo", "tipo": "texto", "defecto": "H1"},
         campo_select("tension", ["12 V", "24 V", "230 V"], "230 V", "Tension")],
        {"color": color}, "Luz piloto de riel {color} {tension}", modulos=1, polos=1,
        notas="El color se elige con la ficha, no con un campo, para que el dibujo cambie.")

# Bloque de distribucion tetrapolar (4 modulos)
W, H = 4 * MOD, 60
inner = rect(0.25, 0.25, W - 0.5, H - 0.5, "#F4F4F2", C["body_s"], 0.5, 1.5)
for i, cap in enumerate(("#7A4A2E", "#23272E", "#8C8C8C", "#2F6FD0")):
    x0 = MOD * i
    inner += rect(x0 + 3, 4, 12, 8, cap, None, rx=1)
    inner += rect(x0 + 3, 15, 12, 38, C["copper"], "#9E5A25", 0.5, 1)
    inner += "".join(tornillo(x0 + 9, y) for y in (23, 34, 45))
    if i:
        inner += line(x0, 3, x0, H - 3, C["body_s"], 0.5)
reg("barra_tetrapolar_4p", "Bloque de distribucion tetrapolar 4P", "Distribucion", W, H, inner,
    "riel", 30, SNAP_MOD, None,
    [campo_select("corriente", [63, 100, 125], 100, "Corriente (A)")],
    {"polos": 4}, "Bloque de distribucion tetrapolar 4P {corriente} A", modulos=4, polos=4,
    notas="Ancho de 4 modulos y alto de 60 mm [supuesto]; L1, L2, L3 y N (marron, negro, gris, azul).")

# Contactor modular de 1 modulo (mismo ancho que un automatico 1P)
W = MOD
inner = rect(0.25, 0.25, W - 0.5, H_MOD - 0.5, C["body"], C["body_s"], 0.5, 1.5)
inner += (rect(1.5, 2, 15, 9, C["term"]) + rect(1.5, 12.5, 15, 8, C["term"])
          + rect(1.5, 69.5, 15, 8, C["term"]) + rect(1.5, 79, 15, 9, C["term"]))
inner += rect(1, 23, 16, 45, "#F8F9FA", "#D0D4DA", 0.4, 1.5) + placa_etiqueta(2.5, 26, 13, 20)
inner += rect(6.5, 50, 5, 8, "#4A3B3B", C["dark_s"], 0.4, 1)
inner += "".join(circ(cx, cy, 2.2, C["screw"]) + line(cx - 1.4, cy, cx + 1.4, cy, "#D9DCE1", 0.6)
                 for cx, cy in ((4.5, 6.5), (13.5, 6.5), (9, 16.5), (9, 73.5), (4.5, 83.5), (13.5, 83.5)))
reg("contactor_1m", "Contactor modular 1 modulo", "Comando", W, H_MOD, inner, "riel", 45, SNAP_MOD,
    {"x": 2.5, "y": 26, "w": 13, "h": 20, "lineas": ["K{indice}", "{corriente}A"], "tamano_mm": 4.2},
    [{"id": "indice", "rotulo": "N° de contactor", "tipo": "entero", "defecto": 1},
     campo_select("corriente", [16, 20, 25], 20, "Corriente (A)"),
     campo_select("bobina", ["24 V", "230 V"], "230 V", "Bobina"),
     campo_select("contactos", ["1NA", "2NA", "1NA+1NC"], "1NA", "Contactos")],
    {"polos": 1}, "Contactor modular 1 modulo {contactos} {corriente} A, bobina {bobina}",
    modulos=1, polos=1,
    notas="Dibujo con 2 bornes de potencia por lado y bornes de bobina A1/A2, como los modulares de 1 modulo. Ancho de un automatico 1P.")


# ---------------------------------------------------------------- montaje
inner = rect(0.25, 0.25, 7.5, 44.5, "#3A3F47", "#23272E", 0.5, 1) + circ(4, 12, 2.2, C["term"]) + circ(4, 33, 2.2, C["term"])
reg("tope_riel", "Tope de riel DIN", "Montaje", 8, 45, inner, "riel", 22.5,
    {"tipo": "libre", "paso_mm": 1}, None, [], {}, "Tope de riel DIN",
    notas="Van 2 por riel, uno a cada extremo del grupo de aparatos.")


# ---------------------------------------------------------------- lineales (paridad con lineales.js)
def riel_svg(largo):
    ran = ""
    x = 5
    while x + 15 <= largo - 5:
        ran += f'<rect x="{n(x)}" y="14.9" width="15" height="5.2" rx="2.6"/>'
        x += 25
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{n(largo)}mm" height="35mm" viewBox="0 0 {n(largo)} 35" role="img">'
            f'<title>Riel DIN 35 mm</title><desc>Riel DIN de {n(largo)} mm de largo</desc>'
            f'<rect x="0.25" y="0.25" width="{n(largo - 0.5)}" height="34.5" fill="#B4BAC3" stroke="#949BA6" stroke-width="0.5"/>'
            f'<line x1="0" y1="4" x2="{n(largo)}" y2="4" stroke="#949BA6" stroke-width="0.5"/>'
            f'<line x1="0" y1="31" x2="{n(largo)}" y2="31" stroke="#949BA6" stroke-width="0.5"/>'
            f'<g fill="#7C8490">{ran}</g></svg>')


def canaleta_svg(largo, ancho):
    ran = ""
    x = 2.5
    while x + 4 <= largo - 2.5:
        ran += f'<rect x="{n(x)}" y="2.5" width="4" height="{n(ancho - 5)}" rx="0.8"/>'
        x += 9
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{n(largo)}mm" height="{n(ancho)}mm" viewBox="0 0 {n(largo)} {n(ancho)}" role="img">'
            f'<title>Canaleta ranurada {n(ancho)} mm</title><desc>Canaleta ranurada de {n(largo)} mm de largo y {n(ancho)} mm de ancho</desc>'
            f'<rect x="0.25" y="0.25" width="{n(largo - 0.5)}" height="{n(ancho - 0.5)}" rx="1" fill="#C3C9D2" stroke="#A2AAB5" stroke-width="0.5"/>'
            f'<g fill="#8E97A3">{ran}</g></svg>')


def node_svg(expr):
    js = f"import('./lineales.js').then(m=>process.stdout.write({expr}))"
    return subprocess.run(["node", "-e", js], cwd=BASE, capture_output=True, text=True, check=True).stdout


LARGO_MUESTRA = 180
escribir(os.path.join(DIRS["lineales"], "riel_din_muestra_180mm.svg"), node_svg(f"m.rielSVG({LARGO_MUESTRA})"))
COMPS.append({
    "id": "riel_din", "nombre": "Riel DIN 35 x 7,5", "categoria": "Montaje",
    "svg": "lineales/riel_din_muestra_180mm.svg", "generador": "lineales.js -> rielSVG(largo_mm)",
    "ancho_mm": None, "alto_mm": 35, "montaje": "lineal", "eje": "x",
    "largo_min_mm": 50, "largo_max_mm": 2000,
    "snap": {"tipo": "libre", "paso_mm": 1}, "campos": [
        {"id": "largo", "rotulo": "Largo (mm)", "tipo": "entero", "defecto": 400}],
    "accesorios_auto": [{"id": "tope_riel", "cantidad": 2}],
    "bom": "Riel DIN 35 mm, corte de {largo} mm", "notas": "Largo comercial habitual: 2 m.",
})
for anc in (25, 40, 60):
    escribir(os.path.join(DIRS["lineales"], f"canaleta_{anc}_muestra_180mm.svg"),
             node_svg(f"m.canaletaSVG({LARGO_MUESTRA}, {anc})"))
    prof = 25 if anc == 25 else 40
    COMPS.append({
        "id": f"canaleta_{anc}", "nombre": f"Canaleta ranurada {anc} x {prof}", "categoria": "Montaje",
        "svg": f"lineales/canaleta_{anc}_muestra_180mm.svg",
        "generador": f"lineales.js -> canaletaSVG(largo_mm, {anc})",
        "ancho_mm": None, "alto_mm": anc, "montaje": "lineal", "eje": "x",
        "largo_min_mm": 50, "largo_max_mm": 2000,
        "snap": {"tipo": "libre", "paso_mm": 1}, "campos": [
            {"id": "largo", "rotulo": "Largo (mm)", "tipo": "entero", "defecto": 400}],
        "atributos": {"ancho": anc, "profundidad": prof},
        "bom": "Canaleta ranurada " + f"{anc} x {prof}" + " mm, corte de {largo} mm",
        "notas": "Se ve de frente: alto en pantalla = ancho de la canaleta. Ranuras cada 9 mm.",
    })


# ---------------------------------------------------------------- gabinetes
def caja_metal(alto, ancho, inox, mx=None, my=None, fijaciones=None):
    if inox:
        marco, marco_s, cav, plc, plc_s = "#C6CCD4", "#9AA2AD", "#8A929C", "#E9ECEF", "#B9BFC8"
    else:
        marco, marco_s, cav, plc, plc_s = "#8C95A2", "#6E7784", "#5F6875", "#DDE1E6", "#B9BFC8"
    s = rect(0.25, 0.25, ancho - 0.5, alto - 0.5, marco, marco_s, 0.5, 3)
    s += rect(8, 8, ancho - 16, alto - 16, cav, None, rx=1.5)
    mx = MARGEN_PLACA / 2 if mx is None else mx
    my = MARGEN_PLACA / 2 if my is None else my
    s += rect(mx, my, ancho - 2 * mx, alto - 2 * my, plc, plc_s, 0.5)
    if fijaciones:
        for cx, cy in fijaciones:
            s += circ(cx, cy, 6.5, "#A7ADB6", "#8B929C", 0.5) + circ(cx, cy, 3.2, "#8B929C")
    else:
        for cx, cy in ((mx + 7, my + 7), (ancho - mx - 7, my + 7), (mx + 7, alto - my - 7), (ancho - mx - 7, alto - my - 7)):
            s += circ(cx, cy, 3, "#A7ADB6", "#8B929C", 0.5)
    return s


def rieles_plastica(filas, mod=12):
    W = mod * MOD + 44
    return [{"x": 22, "y_centro": 92.5 + 125 * i, "largo": mod * MOD} for i in range(filas)], W


def caja_plastica(filas, embutida, mod=12):
    rieles, W = rieles_plastica(filas, mod)
    H = 60 + 125 * filas
    s = rect(0.25, 0.25, W - 0.5, H - 0.5, "#E4E7EB", C["body_s"], 0.5, 4)
    s += rect(10, 10, W - 20, H - 20, "#F5F6F7", "#D3D7DD", 0.5, 2)
    for r in rieles:
        s += f'<g transform="translate({n(r["x"])} {n(r["y_centro"] - 17.5)})">{interior(riel_svg(r["largo"]))}</g>'
    if not embutida:
        return s, W, H, rieles, 0
    off = 15
    marco = rect(0.25, 0.25, W + 2 * off - 0.5, H + 2 * off - 0.5, "#F0F1F3", C["body_s"], 0.5, 3)
    marco += "".join(circ(cx, cy, 2, "#B5BBC4") for cx, cy in
                     ((7.5, 7.5), (W + 2 * off - 7.5, 7.5), (7.5, H + 2 * off - 7.5), (W + 2 * off - 7.5, H + 2 * off - 7.5)))
    return marco + f'<g transform="translate({off} {off})">{s}</g>', W + 2 * off, H + 2 * off, rieles, off


def capacidad(placa_alto, placa_ancho, modo, canaleta=CANALETA_DEFECTO, m_lat=L_MARGEN, m_vert=L_MARGEN):
    """Filas y modulos por fila de una placa, segun el modo de armado y los margenes lateral y vertical."""
    if modo == "compacto":
        largo = placa_ancho - 2 * (m_lat + L_HOLGURA)
        paso = L_PASO_COMPACTO
        filas = floor((placa_alto - 2 * m_vert + (paso - H_MOD)) / paso) if placa_alto >= 2 * m_vert + H_MOD else 0
    else:
        largo = placa_ancho - 2 * (m_lat + canaleta + L_HOLGURA)
        paso = max(L_PASO_MIN, H_MOD + canaleta + 2 * L_HOLGURA)
        bloque = m_vert + canaleta + (paso - H_MOD - canaleta) / 2
        altura_1 = 2 * bloque + H_MOD
        filas = floor((placa_alto - altura_1) / paso) + 1 if placa_alto >= altura_1 else 0
    modulos = max(0, floor((largo - 2 * L_TOPE) / MOD))
    total = filas * modulos
    return {"paso_filas_mm": paso, "largo_riel_mm": largo, "filas": filas, "modulos_por_fila": modulos,
            "modulos_total": total, "modulos_max_con_reserva": floor(total / (1 + RESERVA))}


CAJAS = []
METAL = [(200, 300, 150), (300, 300, 150), (300, 400, 200), (400, 400, 200), (400, 500, 200),
         (400, 600, 200), (500, 500, 200), (600, 600, 250), (800, 600, 250), (800, 800, 300),
         (1000, 600, 300)]
for inox in (False, True):
    tag = "inox" if inox else "metalica"
    for alto, ancho, fondo in METAL:
        pa, pw = alto - MARGEN_PLACA, ancho - MARGEN_PLACA
        cid = f"caja_{tag}_{alto}x{ancho}x{fondo}"
        nombre = f"Caja {'de acero inoxidable' if inox else 'metalica'} sobrepuesta {alto} x {ancho} x {fondo}"
        escribir(os.path.join(DIRS["gabinetes"], f"{cid}.svg"),
                 envolver(ancho, alto, caja_metal(alto, ancho, inox), nombre, "Vista frontal sin tapa, con placa interior"))
        CAJAS.append({
            "id": cid, "nombre": nombre, "tipo": tag, "montaje": "sobrepuesta",
            "alto_mm": alto, "ancho_mm": ancho, "fondo_mm": fondo, "svg": f"gabinetes/{cid}.svg",
            "placa": {"x": MARGEN_PLACA / 2, "y": MARGEN_PLACA / 2, "ancho": pw, "alto": pa},
            "modulos_por_fila": capacidad(pa, pw, "con_canaleta")["modulos_por_fila"],
            "filas_max_estimado": capacidad(pa, pw, "con_canaleta")["filas"],
            "capacidad": {
                "con_canaleta": capacidad(pa, pw, "con_canaleta"),
                "compacto": capacidad(pa, pw, "compacto"),
                "por_canaleta": {str(d): capacidad(pa, pw, "con_canaleta", d) for d in CANALETAS},
            },
            "rieles_incluidos": False,
            "referencial": True,
            "reemplazo_sugerido": None,
            "notas": "Medida referencial: no verificada con un catalogo de fabricante.",
        })
for emb in (False, True):
    for filas in (1, 2, 3):
        inner, W, H, rieles, off = caja_plastica(filas, emb)
        tag = "embutida" if emb else "sobrepuesta"
        cid = f"caja_plastica_{tag}_{filas}f"
        nombre = f"Caja plastica {tag} 12 modulos x {filas} fila{'s' if filas > 1 else ''}"
        escribir(os.path.join(DIRS["gabinetes"], f"{cid}.svg"), envolver(W, H, inner, nombre, "Vista frontal sin tapa, con rieles incluidos"))
        CAJAS.append({
            "id": cid, "nombre": nombre, "tipo": f"plastica_{tag}", "montaje": tag,
            "alto_mm": H, "ancho_mm": W, "fondo_mm": 100, "svg": f"gabinetes/{cid}.svg",
            "placa": None, "modulos_por_fila": 12, "filas_max_estimado": filas,
            "capacidad": {"riel_incluido": {"filas": filas, "modulos_por_fila": 12, "modulos_total": 12 * filas,
                                            "modulos_max_con_reserva": floor(12 * filas / (1 + RESERVA))}},
            "rieles_incluidos": True,
            "rieles": [{"x": r["x"] + off, "y_centro": r["y_centro"] + off, "largo": r["largo"]} for r in rieles],
            "notas": "Medidas aproximadas [supuesto]; ajustar a la caja real.",
        })


# ---------------------------------------------------------------- cajas de fabricante: Eldon ASR (inox)
with open(os.path.join(BASE, "datos_fabricantes", "eldon_asr.json"), encoding="utf-8") as fh:
    ASR = json.load(fh)
M_VERT_ASR = ASR_FIJ_VERTICAL + ASR_R_LIBRE
for fila in ASR["filas"]:
    A, An, P = fila["alto_A"], fila["ancho_An"], fila["fondo_P"]
    pa, pw = fila["placa_alto_a"], fila["placa_ancho_an"]
    mx, my = (An - pw) / 2, (A - pa) / 2
    fij = [(mx + ASR_FIJ_LATERAL, my + ASR_FIJ_VERTICAL), (An - mx - ASR_FIJ_LATERAL, my + ASR_FIJ_VERTICAL),
           (mx + ASR_FIJ_LATERAL, A - my - ASR_FIJ_VERTICAL), (An - mx - ASR_FIJ_LATERAL, A - my - ASR_FIJ_VERTICAL)]
    cid = f"caja_inox_asr_{A}x{An}x{P}"
    nombre = f"Armario inox Eldon ASR {A} x {An} x {P}"
    escribir(os.path.join(DIRS["gabinetes"], f"{cid}.svg"),
             envolver(An, A, caja_metal(A, An, True, mx, my, fij), nombre, "Vista frontal sin puerta, con placa de montaje y pernos M8"))
    cap = lambda modo, d=CANALETA_DEFECTO: capacidad(pa, pw, modo, d, ASR_MARGEN_LATERAL, M_VERT_ASR)
    notas = "Datos del catalogo del fabricante. Tambien disponible en 316L (sufijo -316 en la referencia)."
    if A >= 800 or An >= 800:
        notas += " Con altura o ancho de 800 mm o mas la placa va plegada en los cuatro lados: el area util real puede ser menor que la indicada [sin dato de pliegue]."
    CAJAS.append({
        "id": cid, "nombre": nombre, "tipo": "inox", "montaje": "sobrepuesta",
        "fabricante": ASR["fabricante"], "serie": ASR["serie"], "ref_fabricante": fila["ref"],
        "alto_mm": A, "ancho_mm": An, "fondo_mm": P, "profundidad_util_mm": fila["profundidad_util"],
        "cierres": fila["cierres"], "svg": f"gabinetes/{cid}.svg",
        "placa": {"x": mx, "y": my, "ancho": pw, "alto": pa},
        "fijaciones": [{"x": x, "y": y, "r_libre_mm": ASR_R_LIBRE} for x, y in fij],
        "layout": {"margen_lateral_mm": ASR_MARGEN_LATERAL, "margen_vertical_mm": M_VERT_ASR},
        "modulos_por_fila": cap("con_canaleta")["modulos_por_fila"],
        "filas_max_estimado": cap("con_canaleta")["filas"],
        "capacidad": {
            "con_canaleta": cap("con_canaleta"), "compacto": cap("compacto"),
            "por_canaleta": {str(d): cap("con_canaleta", d) for d in CANALETAS},
        },
        "rieles_incluidos": False, "referencial": False, "reemplazo_sugerido": None, "notas": notas,
    })

# ---------------------------------------------------------------- cajas de fabricante: Lerkenbox (acero pintado)
with open(os.path.join(BASE, "datos_fabricantes", "lerkenbox.json"), encoding="utf-8") as fh:
    LERK = json.load(fh)
for serie, sd in LERK["series"].items():
    for f in sd["cajas"]:
        A, An, P = f["alto"], f["ancho"], f["fondo"]
        pa, pw = f["placa_alto"], f["placa_ancho"]
        mx, my = (An - pw) / 2, (A - pa) / 2
        cid = f"caja_metalica_{serie.lower()}_{A}x{An}x{P}"
        nombre = f"Caja metalica Lerkenbox {serie} {A} x {An} x {P}"
        escribir(os.path.join(DIRS["gabinetes"], f"{cid}.svg"),
                 envolver(An, A, caja_metal(A, An, False, mx, my), nombre, "Vista frontal sin puerta, con placa de montaje"))
        cap = lambda modo, d=CANALETA_DEFECTO: capacidad(pa, pw, modo, d)
        caja = {
            "id": cid, "nombre": nombre, "tipo": "metalica", "montaje": "sobrepuesta",
            "fabricante": LERK["fabricante"], "serie": serie, "ref_fabricante": f["ref"],
            "alto_mm": A, "ancho_mm": An, "fondo_mm": P, "svg": f"gabinetes/{cid}.svg",
            "placa": {"x": mx, "y": my, "ancho": pw, "alto": pa},
            "modulos_por_fila": cap("con_canaleta")["modulos_por_fila"],
            "filas_max_estimado": cap("con_canaleta")["filas"],
            "capacidad": {
                "con_canaleta": cap("con_canaleta"), "compacto": cap("compacto"),
                "por_canaleta": {str(d): cap("con_canaleta", d) for d in CANALETAS},
            },
            "rieles_incluidos": False, "referencial": False, "reemplazo_sugerido": None,
            "notas": "Datos del catalogo del fabricante. Se asume la placa centrada en la caja y sin datos de pernos: margenes por defecto.",
        }
        for k_json, k_caja in (("placa_ref", "placa_ref_fabricante"), ("ref_puerta_transparente", "ref_puerta_transparente"),
                               ("version", "version"), ("cierres", "cierres"), ("bisagras", "bisagras"), ("puertas", "puertas")):
            if k_json in f:
                caja[k_caja] = f[k_json]
        CAJAS.append(caja)

# las cajas genericas apuntan a la real del catalogo con el mismo tipo, alto y ancho y un fondo parecido, si existe
for c in CAJAS:
    if c.get("referencial") and c["tipo"] in ("inox", "metalica"):
        mismas = [r for r in CAJAS if r.get("fabricante") and r["tipo"] == c["tipo"] and r["serie"] not in REEMPLAZO_EXCLUYE_SERIES
                  and r["alto_mm"] == c["alto_mm"] and r["ancho_mm"] == c["ancho_mm"]]
        candidatas = [r for r in mismas if abs(r["fondo_mm"] - c["fondo_mm"]) <= REEMPLAZO_MAX_DIF_FONDO]
        if candidatas:
            orden = {"ASR": 0, "ARES": 1, "DM": 2, "KT": 3}
            mejor = min(candidatas, key=lambda r: (abs(r["fondo_mm"] - c["fondo_mm"]), orden.get(r["serie"], 9)))
            c["reemplazo_sugerido"] = mejor["id"]
            c["notas"] = (f"Medida referencial. En el catalogo {mejor['fabricante']} {mejor['serie']} existe "
                          f"{mejor['alto_mm']} x {mejor['ancho_mm']} x {mejor['fondo_mm']} ({mejor['ref_fabricante']}).")
        elif mismas:
            fondos = sorted({r["fondo_mm"] for r in mismas})
            c["notas"] = f"Medida referencial: el catalogo trae {c['alto_mm']} x {c['ancho_mm']} pero con fondos de {', '.join(map(str, fondos))} mm."
        else:
            c["notas"] = "Medida referencial: no figura en los catalogos de fabricante cargados."


# ---------------------------------------------------------------- catalogo.json / gabinetes.json
def guardar_json():
    catalogo = {
        "version": "1.6", "unidad": "mm", "origen": "arriba-izquierda, eje y hacia abajo",
        "modulo_din_mm": MOD, "alto_modular_mm": H_MOD, "riel_din_ancho_mm": 35,
        "reglas": {
            "riel": "El aparato con montaje 'riel' se ubica con su eje y (riel_y_mm) sobre la linea central del riel.",
            "snap": "modular: paso de 18 mm desde el inicio del riel; libre: paso 1 mm. En ambos, imantar al borde del vecino si esta a menos de 3 mm.",
            "etiqueta": "El SVG no lleva texto. El editor escribe 'lineas' (plantilla con campos) centradas en la zona 'etiqueta' con 'tamano_mm'.",
            "bom": "Cada ficha trae una plantilla 'bom'; se completa con campos y atributos y se agrupan lineas iguales.",
        },
        "componentes": COMPS,
    }
    escribir(os.path.join(BASE, "catalogo.json"), json.dumps(catalogo, ensure_ascii=False, indent=1))
    gab = {
        "version": "1.6", "unidad": "mm",
        "parametros": {
            "margen_placa_mm": MARGEN_PLACA, "modulo_mm": MOD, "alto_modular_mm": H_MOD,
            "layout": {
                "margen_borde_mm": L_MARGEN, "holgura_mm": L_HOLGURA, "tope_riel_mm": L_TOPE,
                "paso_compacto_mm": L_PASO_COMPACTO, "paso_minimo_con_canaleta_mm": L_PASO_MIN,
                "canaleta_defecto_mm": CANALETA_DEFECTO, "canaletas_mm": list(CANALETAS), "reserva": RESERVA,
                "reemplazo_max_dif_fondo_mm": REEMPLAZO_MAX_DIF_FONDO, "reemplazo_excluye_series": list(REEMPLAZO_EXCLUYE_SERIES),
                "fijacion_keepout_mm": ASR_R_LIBRE,
            },
            "modos": {
                "compacto": "Menos de 8 circuitos: sin canaletas (excepcion del RIC N°02, 6.1.16.1). Paso entre filas de 125 mm.",
                "con_canaleta": "8 circuitos o mas: canaletas no metalicas en ambos costados y sobre y bajo cada fila. Seccion por defecto 40 mm; capacidad.por_canaleta trae 25, 40 y 60.",
            },
            "formulas": {
                "placa": "caja exterior - margen_placa por dimension",
                "compacto": {
                    "largo_riel": "ancho_placa - 2 * (margen_lateral + holgura)",
                    "filas": "floor((alto_placa - 2 * margen_vertical + (paso_compacto - alto_modular)) / paso_compacto)",
                },
                "con_canaleta": {
                    "largo_riel": "ancho_placa - 2 * (margen_lateral + canaleta + holgura)",
                    "paso": "max(paso_minimo_con_canaleta, alto_modular + canaleta + 2 * holgura)",
                    "filas": "floor((alto_placa - altura_1) / paso) + 1, con altura_1 = 2 * (margen_vertical + canaleta + (paso - alto_modular - canaleta) / 2) + alto_modular",
                },
                "modulos_por_fila": "floor((largo_riel - 2 * tope_riel) / modulo)",
                "modulos_max_con_reserva": "floor(filas * modulos_por_fila / (1 + reserva))",
                "margenes": "margen_lateral y margen_vertical valen margen_borde_mm salvo que la caja traiga layout (cajas de fabricante): entonces se usa caja.layout",
            },
            "fuentes": [
                "RIC N°02 (SEC), 6.1.16.1: cableado interno por bandejas no metalicas, maximo 50 % de ocupacion, salvo tableros de menos de 8 circuitos",
                "RIC N°02 (SEC), 6.1.16.3: prever ampliacion del 25 % por tipo de servicio, con espacio en riel y barras",
                "Paso entre filas de riel: 125 mm (modulos residenciales) y 150 mm (cuatro filas) en fabricantes de cuadros modulares",
            ],
            "estado": "Cajas con fabricante (Eldon ASR, Lerkenbox KT, DM y ARES): la placa sale del catalogo; los pernos solo en ASR. Cajas con referencial=true: medidas genericas sin verificar; margen, holgura y paso son propios. Los margenes dependen de la placa: el editor debe permitir cambiarlos por proyecto. Los valores por defecto sirven de referencia y de vectores de prueba.",
        },
        "regla_sugerencia": "Elegir la caja mas chica cuya capacidad del modo elegido (modulos_max_con_reserva) contenga el dibujo, prefiriendo las de fabricante (referencial=false); permitir medida libre.",
        "cajas": CAJAS,
    }
    escribir(os.path.join(BASE, "gabinetes.json"), json.dumps(gab, ensure_ascii=False, indent=1))


# ---------------------------------------------------------------- ejemplo armado + lista de materiales
def por_id(id_):
    return next(c for c in COMPS if c["id"] == id_)


def valores(comp, extra):
    v = {c["id"]: c["defecto"] for c in comp["campos"]}
    v.update(comp.get("atributos", {}))
    v.update(extra or {})
    return v


def texto_etiqueta(comp, extra):
    et = comp.get("etiqueta")
    if not et:
        return ""
    v = valores(comp, extra)
    k = len(et["lineas"])
    s = ""
    for i, plantilla in enumerate(et["lineas"]):
        lh = et["h"] / k
        y = et["y"] + lh * (i + 0.5) + et["tamano_mm"] * 0.35
        s += (f'<text x="{n(et["x"] + et["w"] / 2)}" y="{n(y)}" font-size="{n(et["tamano_mm"])}" '
              f'text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" '
              f'fill="#2B2F36">{plantilla.format(**v)}</text>')
    return s


def armar_ejemplo():
    caja = next(c for c in CAJAS if c["id"] == "caja_metalica_400x500x200")
    W, H = caja["ancho_mm"], caja["alto_mm"]
    pl = caja["placa"]
    capacidad_riel = EJEMPLO_MODULOS * MOD
    x_riel = pl["x"] + (pl["ancho"] - capacidad_riel) / 2
    partes = [interior(envolver(W, H, caja_metal(H, W, False), "", ""))]
    bom = {}

    def sumar(desc, cant=1, unidad="un"):
        k = (desc, unidad)
        bom[k] = bom.get(k, 0) + cant

    sumar(f"{caja['nombre']} (placa {pl['ancho']} x {pl['alto']} mm)")

    filas = [
        [("automatico_2p", {"amperaje": 40}), ("diferencial_2p", {}),
         ("automatico_1p", {"amperaje": 10}), ("automatico_1p", {"amperaje": 10}),
         ("automatico_1p", {"amperaje": 16}), ("automatico_1p", {"amperaje": 16}),
         ("automatico_1p", {"amperaje": 20}), ("automatico_1p", {"amperaje": 25}),
         ("_gap", 18), ("reloj_control", {}), ("rele_crepuscular", {})],
        [("automatico_3p", {"amperaje": 63}), ("diferencial_4p", {}), ("contactor_3p", {}),
         ("automatico_3p", {"amperaje": 25}), ("_gap", 5),
         ("borne_16_gris", {}), ("borne_16_azul", {}), ("borne_16_tierra", {}), ("_gap", 5),
         ("barra_repartidora_12v", {"funcion": "N"})],
    ]
    y_centros = [pl["y"] + 8 + CANALETA + 8 + 45]
    y_centros.append(y_centros[0] + 45 + 8 + CANALETA + 8 + 45)
    l_riel = capacidad_riel
    # canaletas
    y_ducto = [y_centros[0] - 45 - 8 - CANALETA, y_centros[0] + 45 + 8, y_centros[1] + 45 + 8]
    for y in y_ducto:
        partes.append(f'<g transform="translate({n(x_riel)} {n(y)})">{interior(canaleta_svg(l_riel, CANALETA))}</g>')
        sumar(f"Canaleta ranurada 25 x 25 mm, corte de {l_riel} mm")
    for yc in y_centros:
        partes.append(f'<g transform="translate({n(x_riel)} {n(yc - 17.5)})">{interior(riel_svg(l_riel))}</g>')
        sumar(f"Riel DIN 35 mm, corte de {l_riel} mm")
    topes = por_id("tope_riel")
    for fila, yc in zip(filas, y_centros):
        x = x_riel + topes["ancho_mm"] + 1
        partes.append(f'<svg x="{n(x_riel)}" y="{n(yc - 22.5)}" width="8" height="45" viewBox="0 0 8 45">{INNER["tope_riel"][0]}</svg>')
        sumar("Tope de riel DIN")
        for item in fila:
            if item[0] == "_gap":
                x += item[1]
                continue
            comp = por_id(item[0])
            iw, ih = comp["ancho_mm"], comp["alto_mm"]
            y = yc - comp["riel_y_mm"]
            partes.append(f'<svg x="{n(x)}" y="{n(y)}" width="{n(iw)}" height="{n(ih)}" viewBox="0 0 {n(iw)} {n(ih)}">'
                          f'{INNER[item[0]][0]}{texto_etiqueta(comp, item[1])}</svg>')
            sumar(comp["bom"].format(**valores(comp, item[1])))
            x += iw
        assert x + 8 <= x_riel + l_riel + 0.01, f"La fila no cabe en el riel: {x + 8} > {x_riel + l_riel}"
        partes.append(f'<svg x="{n(x)}" y="{n(yc - 22.5)}" width="8" height="45" viewBox="0 0 8 45">{INNER["tope_riel"][0]}</svg>')
        sumar("Tope de riel DIN")
    svg = envolver(W, H, "".join(partes), "Ejemplo de tablero armado con la biblioteca",
                   "Caja metalica 400 x 500 x 200 con dos filas de aparatos")
    escribir(os.path.join(BASE, "ejemplo_tablero_armado.svg"), svg)
    filas_bom = sorted(bom.items(), key=lambda kv: kv[0][0])
    with open(os.path.join(BASE, "ejemplo_lista_materiales.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["descripcion", "cantidad", "unidad"])
        for (d, u), c in filas_bom:
            w.writerow([d, c, u])
    return svg, W, H, filas_bom


# ---------------------------------------------------------------- preview.html
def escalar(svg, k):
    import re
    m = re.search(r'width="([\d.]+)mm" height="([\d.]+)mm"', svg)
    w, h = float(m.group(1)), float(m.group(2))
    return svg.replace(m.group(0), f'width="{n(w * k)}" height="{n(h * k)}"', 1)


def escribir_preview(svg_ej, W, H, filas_bom):
    def leer(ruta):
        with open(os.path.join(BASE, ruta), encoding="utf-8") as f:
            return f.read()

    css = ("body{font-family:Arial,Helvetica,sans-serif;background:#F6F7F8;color:#23272E;margin:0;padding:24px;color-scheme:light}"
           "h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px;border-bottom:1px solid #D3D7DD;padding-bottom:6px}"
           "p.s{margin:0;color:#5F6875;font-size:13px}.grid{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}"
           ".c{background:#fff;border:1px solid #D3D7DD;border-radius:8px;padding:10px;font-size:11.5px;line-height:1.35}"
           ".c b{display:block;font-size:12px}.c span{color:#5F6875}.svg{background:#E9EBEE;border-radius:4px;padding:6px;margin-bottom:6px;display:inline-block}"
           "table{border-collapse:collapse;font-size:13px;background:#fff}td,th{border:1px solid #D3D7DD;padding:5px 10px;text-align:left}"
           "th{background:#EEF0F2}td.n{text-align:right}")
    h = ['<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Biblioteca de tableros TEC</title>'
         f'<meta name="viewport" content="width=device-width,initial-scale=1"><style>{css}</style></head><body>',
         "<h1>Biblioteca de tableros TEC</h1>",
         '<p class="s">Dibujos genericos sin marca, con medidas reales (1 unidad SVG = 1 mm). Cada tarjeta se ve a la misma escala (2,4 px por mm).</p>',
         "<h2>Ejemplo armado solo con la biblioteca</h2>",
         f'<div class="svg">{escalar(svg_ej, 1.2)}</div>',
         "<h2>Lista de materiales generada del ejemplo</h2><table><tr><th>Descripcion</th><th>Cant.</th><th>Unidad</th></tr>"]
    for (d, u), c in filas_bom:
        h.append(f'<tr><td>{d}</td><td class="n">{c}</td><td>{u}</td></tr>')
    h.append("</table>")
    for cat in ("Protecciones", "Comando", "Control", "Distribucion", "Montaje"):
        h.append(f"<h2>{cat}</h2><div class='grid'>")
        for c in [c for c in COMPS if c["categoria"] == cat]:
            svg = leer(c["svg"])
            dim = (f"{n(c['ancho_mm'])} x {n(c['alto_mm'])} mm" if c["ancho_mm"] else f"largo variable x {n(c['alto_mm'])} mm")
            h.append(f"<div class='c'><div class='svg'>{escalar(svg, 2.4)}</div><b>{c['nombre']}</b><span>{c['id']}<br>{dim}</span></div>")
        h.append("</div>")
    h.append("<h2>Cajas (escala 0,5 px por mm)</h2><div class='grid'>")
    for c in CAJAS:
        svg = leer(c["svg"])
        k = c["capacidad"]
        if "con_canaleta" in k:
            cap = (f"con canaleta: {k['con_canaleta']['filas']} f x {k['con_canaleta']['modulos_por_fila']} mod "
                   f"({k['con_canaleta']['modulos_max_con_reserva']} con reserva)<br>"
                   f"compacto: {k['compacto']['filas']} f x {k['compacto']['modulos_por_fila']} mod "
                   f"({k['compacto']['modulos_max_con_reserva']} con reserva)")
        else:
            r = k["riel_incluido"]
            cap = f"{r['filas']} f x {r['modulos_por_fila']} mod ({r['modulos_max_con_reserva']} con reserva)"
        extra = (f"<br>{c['ref_fabricante']}" if c.get("ref_fabricante") else "") + ("<br><i>referencial</i>" if c.get("referencial") else "")
        h.append(f"<div class='c'><div class='svg'>{escalar(svg, 0.5)}</div><b>{c['nombre']}</b><span>{c['id']}<br>{cap}{extra}</span></div>")
    h.append("</div></body></html>")
    escribir(os.path.join(BASE, "preview.html"), "".join(h))


if __name__ == "__main__":
    guardar_json()
    svg_ej, W, H, filas_bom = armar_ejemplo()
    escribir_preview(svg_ej, W, H, filas_bom)
    print(f"componentes: {len(COMPS)}  cajas: {len(CAJAS)}")
