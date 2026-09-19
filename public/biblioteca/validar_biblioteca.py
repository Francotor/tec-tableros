#!/usr/bin/env python3
"""Valida la biblioteca: archivos, medidas, etiquetas, paridad de lineales.js y calculo de cajas."""
import json
import os
import subprocess
import sys
from math import floor
from lxml import etree

BASE = os.path.dirname(os.path.abspath(__file__))
errores, avisos, ok = [], [], 0


def cargar(nombre):
    with open(os.path.join(BASE, nombre), encoding="utf-8") as f:
        return json.load(f)


def viewbox(ruta):
    raiz = etree.parse(os.path.join(BASE, ruta)).getroot()
    vb = [float(v) for v in raiz.get("viewBox").split()]
    return raiz, vb


def chequear(cond, msg):
    global ok
    if cond:
        ok += 1
    else:
        errores.append(msg)


cat = cargar("catalogo.json")
gab = cargar("gabinetes.json")

# 1. ids unicos y archivos existentes, medidas coherentes
ids = [c["id"] for c in cat["componentes"]] + [c["id"] for c in gab["cajas"]]
chequear(len(ids) == len(set(ids)), "Hay ids repetidos")

for c in cat["componentes"]:
    ruta = c["svg"]
    chequear(os.path.exists(os.path.join(BASE, ruta)), f"Falta {ruta}")
    raiz, vb = viewbox(ruta)
    if c["montaje"] != "lineal":
        chequear(abs(vb[2] - c["ancho_mm"]) < 1e-6 and abs(vb[3] - c["alto_mm"]) < 1e-6,
                 f"{c['id']}: viewBox {vb[2:]} no coincide con ficha {c['ancho_mm']}x{c['alto_mm']}")
        chequear(raiz.get("width") == f"{vb[2]:g}mm", f"{c['id']}: width no esta en mm")
        chequear(c["riel_y_mm"] is None or 0 < c["riel_y_mm"] < c["alto_mm"], f"{c['id']}: riel_y_mm fuera de rango")
        # el svg no debe llevar texto (las etiquetas las escribe el editor)
        chequear(len(raiz.findall(".//{http://www.w3.org/2000/svg}text")) == 0, f"{c['id']}: el SVG trae texto")
    et = c.get("etiqueta")
    if et:
        chequear(et["x"] >= 0 and et["y"] >= 0 and et["x"] + et["w"] <= c["ancho_mm"] and et["y"] + et["h"] <= c["alto_mm"],
                 f"{c['id']}: zona de etiqueta fuera del componente")
        chequear(et["tamano_mm"] * len(et["lineas"]) <= et["h"] * 1.1, f"{c['id']}: texto no cabe en alto de la zona")
        v = {f["id"]: f["defecto"] for f in c["campos"]}
        v.update(c.get("atributos", {}))
        try:
            largo = max(len(p.format(**v)) for p in et["lineas"])
            chequear(largo * et["tamano_mm"] * 0.62 <= et["w"], f"{c['id']}: texto por defecto mas ancho que la zona")
        except KeyError as e:
            errores.append(f"{c['id']}: plantilla usa campo inexistente {e}")
    if c.get("bom") and c["montaje"] != "lineal":
        v = {f["id"]: f["defecto"] for f in c["campos"]}
        v.update(c.get("atributos", {}))
        try:
            c["bom"].format(**v)
            ok += 1
        except KeyError as e:
            errores.append(f"{c['id']}: plantilla bom usa campo inexistente {e}")
    if c["montaje"] == "riel":
        chequear(c["alto_mm"] <= 90, f"{c['id']}: alto mayor al de un modular")
        if c["snap"]["tipo"] == "modular":
            chequear(abs(c["ancho_mm"] / 18 - round(c["ancho_mm"] / 18)) < 1e-9 or c["id"].startswith("barra"),
                     f"{c['id']}: ancho no es multiplo de 18")

# 2. paridad lineales.js <-> Python (mismo dibujo en el editor y en las muestras)
sys.path.insert(0, BASE)
import generar_biblioteca as g  # noqa: E402

for largo, ancho in ((180, 25), (396, 40), (123.5, 60)):
    js = subprocess.run(["node", "-e", f"import('./lineales.js').then(m=>process.stdout.write(m.canaletaSVG({largo},{ancho})))"],
                        cwd=BASE, capture_output=True, text=True, check=True).stdout
    chequear(js == g.canaleta_svg(largo, ancho), f"canaleta {largo}x{ancho}: JS y Python difieren")
for largo in (180, 396, 1000):
    js = subprocess.run(["node", "-e", f"import('./lineales.js').then(m=>process.stdout.write(m.rielSVG({largo})))"],
                        cwd=BASE, capture_output=True, text=True, check=True).stdout
    chequear(js == g.riel_svg(largo), f"riel {largo}: JS y Python difieren")

# 3. cajas: recalculo independiente de capacidades y consistencia de placa
p = gab["parametros"]
for c in gab["cajas"]:
    chequear(os.path.exists(os.path.join(BASE, c["svg"])), f"Falta {c['svg']}")
    _, vb = viewbox(c["svg"])
    chequear(abs(vb[2] - c["ancho_mm"]) < 1e-6 and abs(vb[3] - c["alto_mm"]) < 1e-6, f"{c['id']}: medidas no coinciden con el SVG")
    if c["placa"]:
        chequear(c["placa"]["ancho"] == c["ancho_mm"] - p["margen_placa_mm"], f"{c['id']}: ancho de placa incorrecto")
        chequear(c["placa"]["alto"] == c["alto_mm"] - p["margen_placa_mm"], f"{c['id']}: alto de placa incorrecto")
        esperado = floor((c["placa"]["ancho"] - p["margen_lateral_riel_mm"]) / p["modulo_mm"])
        chequear(c["modulos_por_fila"] == esperado, f"{c['id']}: modulos_por_fila {c['modulos_por_fila']} != {esperado}")
        if c["filas_max_estimado"] == 0:
            avisos.append(f"{c['id']}: no cabe ni una fila completa con canaleta")
    else:
        for r in c["rieles"]:
            chequear(r["x"] + r["largo"] <= c["ancho_mm"], f"{c['id']}: riel se sale de la caja")

# 4. el ejemplo armado existe y su lista de materiales no esta vacia
chequear(os.path.getsize(os.path.join(BASE, "ejemplo_lista_materiales.csv")) > 100, "Lista de materiales vacia")

print(f"Chequeos correctos: {ok}")
for a in avisos:
    print("AVISO:", a)
for e in errores:
    print("ERROR:", e)
print("RESULTADO:", "FALLO" if errores else "TODO CORRECTO")
sys.exit(1 if errores else 0)
