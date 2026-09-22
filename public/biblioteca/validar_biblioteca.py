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

def capacidad_independiente(alto, ancho, modo, p, canaleta=None, caja=None):
    """Segunda implementacion de la regla, escrita aparte para contrastar la del generador."""
    lay, mod, hmod = p["layout"], p["modulo_mm"], p["alto_modular_mm"]
    canaleta = canaleta or lay["canaleta_defecto_mm"]
    h, tope = lay["holgura_mm"], lay["tope_riel_mm"]
    propio = (caja or {}).get("layout", {})
    m_lat = propio.get("margen_lateral_mm", lay["margen_borde_mm"])
    m_vert = propio.get("margen_vertical_mm", lay["margen_borde_mm"])
    if modo == "compacto":
        largo = ancho - 2 * (m_lat + h)
        paso = lay["paso_compacto_mm"]
        filas = 0
        usado = 2 * m_vert + hmod
        while usado <= alto:
            filas += 1
            usado += paso
    else:
        largo = ancho - 2 * (m_lat + canaleta + h)
        paso = max(lay["paso_minimo_con_canaleta_mm"], hmod + canaleta + 2 * h)
        gap = (paso - hmod - canaleta) / 2
        filas = 0
        usado = 2 * (m_vert + canaleta + gap) + hmod
        while usado <= alto:
            filas += 1
            usado += paso
    modulos = max(0, int((largo - 2 * tope) // mod))
    total = filas * modulos
    return {"paso_filas_mm": paso, "largo_riel_mm": largo, "filas": filas, "modulos_por_fila": modulos,
            "modulos_total": total, "modulos_max_con_reserva": int(total // (1 + lay["reserva"]))}


# 3. cajas: recalculo independiente de capacidades y consistencia de placa
p = gab["parametros"]
for c in gab["cajas"]:
    chequear(os.path.exists(os.path.join(BASE, c["svg"])), f"Falta {c['svg']}")
    _, vb = viewbox(c["svg"])
    chequear(abs(vb[2] - c["ancho_mm"]) < 1e-6 and abs(vb[3] - c["alto_mm"]) < 1e-6, f"{c['id']}: medidas no coinciden con el SVG")
    if c["placa"]:
        if not c.get("fabricante"):
            chequear(c["placa"]["ancho"] == c["ancho_mm"] - p["margen_placa_mm"], f"{c['id']}: ancho de placa incorrecto")
            chequear(c["placa"]["alto"] == c["alto_mm"] - p["margen_placa_mm"], f"{c['id']}: alto de placa incorrecto")
            chequear(c.get("referencial") is True, f"{c['id']}: una caja generica debe marcarse referencial")
        for modo in ("con_canaleta", "compacto"):
            esperado = capacidad_independiente(c["placa"]["alto"], c["placa"]["ancho"], modo, p, None, c)
            chequear(c["capacidad"][modo] == esperado, f"{c['id']}: capacidad {modo} {c['capacidad'][modo]} != {esperado}")
        for d in p["layout"]["canaletas_mm"]:
            esperado = capacidad_independiente(c["placa"]["alto"], c["placa"]["ancho"], "con_canaleta", p, d, c)
            chequear(c["capacidad"]["por_canaleta"][str(d)] == esperado, f"{c['id']}: capacidad por canaleta {d} incorrecta")
        chequear(c["capacidad"]["con_canaleta"] == c["capacidad"]["por_canaleta"][str(p["layout"]["canaleta_defecto_mm"])],
                 f"{c['id']}: con_canaleta no coincide con la canaleta por defecto")
        cc = c["capacidad"]["con_canaleta"]
        chequear(c["modulos_por_fila"] == cc["modulos_por_fila"] and c["filas_max_estimado"] == cc["filas"],
                 f"{c['id']}: los campos heredados no coinciden con el modo con canaleta")
        chequear(c["capacidad"]["compacto"]["modulos_total"] >= cc["modulos_total"], f"{c['id']}: el modo compacto rinde menos que con canaleta")
        for modo in ("con_canaleta", "compacto"):
            k = c["capacidad"][modo]
            chequear(k["modulos_max_con_reserva"] * (1 + p["layout"]["reserva"]) <= k["modulos_total"] + 1e-9,
                     f"{c['id']}: la reserva de {modo} supera la capacidad")
        if cc["filas"] == 0:
            avisos.append(f"{c['id']}: no cabe una fila con canaleta (solo modo compacto)")
        elif cc["modulos_por_fila"] == 0:
            avisos.append(f"{c['id']}: con canaleta cabe la fila pero no cabe ningun modulo (ancho insuficiente)")
    else:
        for r in c["rieles"]:
            chequear(r["x"] + r["largo"] <= c["ancho_mm"], f"{c['id']}: riel se sale de la caja")
        r0 = c["capacidad"]["riel_incluido"]
        chequear(r0["modulos_total"] == r0["filas"] * r0["modulos_por_fila"] and r0["filas"] == len(c["rieles"]),
                 f"{c['id']}: capacidad de caja plastica inconsistente")

# 3b. cajas del fabricante (Eldon ASR) contra la tabla transcrita del catalogo
with open(os.path.join(BASE, "datos_fabricantes", "eldon_asr.json"), encoding="utf-8") as fh:
    asr = json.load(fh)
reglas_ok = 0
for f in asr["filas"]:
    # la tabla del catalogo debe cumplir las reglas que el propio catalogo declara
    chequear(f["placa_alto_a"] == f["alto_A"] - 30, f"ASR {f['ref']}: a != A - 30")
    chequear(f["placa_ancho_an"] == f["ancho_An"] - 50, f"ASR {f['ref']}: an != An - 50")
    chequear(f["profundidad_util"] == f["fondo_P"] - 20, f"ASR {f['ref']}: profundidad util != P - 20")
    cid = f"caja_inox_asr_{f['alto_A']}x{f['ancho_An']}x{f['fondo_P']}"
    caja = next((c for c in gab["cajas"] if c["id"] == cid), None)
    chequear(caja is not None, f"Falta la caja {cid}")
    if not caja:
        continue
    chequear(caja["ref_fabricante"] == f["ref"] and caja["profundidad_util_mm"] == f["profundidad_util"], f"{cid}: referencia o profundidad util distintas del catalogo")
    chequear(caja["placa"]["alto"] == f["placa_alto_a"] and caja["placa"]["ancho"] == f["placa_ancho_an"], f"{cid}: placa distinta del catalogo")
    pl = caja["placa"]
    # simetria de la placa dentro de la caja
    chequear(abs(pl["x"] * 2 + pl["ancho"] - caja["ancho_mm"]) < 1e-9 and abs(pl["y"] * 2 + pl["alto"] - caja["alto_mm"]) < 1e-9, f"{cid}: placa descentrada")
    # pernos: distancia entre pernos = an - 50 (horizontal) y a - 20 (vertical), como en el plano
    xs = sorted({round(q["x"], 6) for q in caja["fijaciones"]})
    ys = sorted({round(q["y"], 6) for q in caja["fijaciones"]})
    chequear(len(caja["fijaciones"]) == 4 and len(xs) == 2 and len(ys) == 2, f"{cid}: deben ser 4 pernos")
    chequear(abs((xs[1] - xs[0]) - (f["placa_ancho_an"] - 50)) < 1e-9, f"{cid}: distancia horizontal entre pernos != an - 50")
    chequear(abs((ys[1] - ys[0]) - (f["placa_alto_a"] - 20)) < 1e-9, f"{cid}: distancia vertical entre pernos != a - 20")
    # los margenes por defecto de la caja no deben pisar los pernos: margen vertical >= inset vertical + radio libre
    r = caja["fijaciones"][0]["r_libre_mm"]
    chequear(caja["layout"]["margen_vertical_mm"] >= 10 + r, f"{cid}: el margen vertical pisa los pernos")
    reglas_ok += 1
chequear(reglas_ok == len(asr["filas"]) == 22, "No estan las 22 cajas del catalogo")

# 3c. cajas Lerkenbox (KT, DM, ARES) contra la tabla transcrita
with open(os.path.join(BASE, "datos_fabricantes", "lerkenbox.json"), encoding="utf-8") as fh:
    lerk = json.load(fh)
total_lerk = 0
refs_vistas = set()
for serie, sd in lerk["series"].items():
    ra, rn = sd["regla_placa"]["alto"], sd["regla_placa"]["ancho"]
    for f in sd["cajas"]:
        total_lerk += 1
        chequear(f["placa_alto"] == f["alto"] + ra, f"{serie} {f['ref']}: placa alto != alto {ra:+d}")
        chequear(f["placa_ancho"] == f["ancho"] + rn, f"{serie} {f['ref']}: placa ancho != ancho {rn:+d}")
        chequear((serie, f["ref"]) not in refs_vistas, f"{serie} {f['ref']}: referencia repetida")
        refs_vistas.add((serie, f["ref"]))
        cid = f"caja_metalica_{serie.lower()}_{f['alto']}x{f['ancho']}x{f['fondo']}"
        caja = next((c for c in gab["cajas"] if c["id"] == cid), None)
        chequear(caja is not None, f"Falta la caja {cid}")
        if not caja:
            continue
        pl = caja["placa"]
        chequear(caja["ref_fabricante"] == f["ref"] and caja["serie"] == serie and caja["fabricante"] == "Lerkenbox", f"{cid}: datos de fabricante distintos")
        chequear(pl["alto"] == f["placa_alto"] and pl["ancho"] == f["placa_ancho"], f"{cid}: placa distinta del catalogo")
        chequear(abs(pl["x"] * 2 + pl["ancho"] - caja["ancho_mm"]) < 1e-9 and abs(pl["y"] * 2 + pl["alto"] - caja["alto_mm"]) < 1e-9, f"{cid}: placa descentrada")
        chequear("layout" not in caja, f"{cid}: no debe traer margenes propios (sin datos de pernos)")
chequear(total_lerk == 66 == sum(len(sd["cajas"]) for sd in lerk["series"].values()), "No estan las 66 cajas de Lerkenbox")
chequear([len(sd["cajas"]) for sd in lerk["series"].values()] == [17, 30, 19], "Cantidades por serie distintas de 17, 30 y 19")

n_fab = sum(1 for c in gab["cajas"] if c.get("fabricante"))
chequear(n_fab == len(asr["filas"]) + total_lerk, f"Hay cajas de fabricante fuera de los catalogos transcritos ({n_fab})")
ids_todas = [c["id"] for c in gab["cajas"]]
chequear(len(ids_todas) == len(set(ids_todas)), "Hay ids de caja repetidos")

# cada caja generica debe apuntar a una real solo si existe con el mismo tipo, alto y ancho
for c in gab["cajas"]:
    if c.get("referencial") and c["tipo"] in ("inox", "metalica"):
        tol = p["layout"]["reemplazo_max_dif_fondo_mm"]
        existe = any(r.get("fabricante") and r["tipo"] == c["tipo"] and r["serie"] not in p["layout"]["reemplazo_excluye_series"] and r["alto_mm"] == c["alto_mm"] and r["ancho_mm"] == c["ancho_mm"]
                     and abs(r["fondo_mm"] - c["fondo_mm"]) <= tol for r in gab["cajas"])
        chequear((c["reemplazo_sugerido"] is not None) == existe, f"{c['id']}: reemplazo sugerido inconsistente")
        if c["reemplazo_sugerido"]:
            real = next(r for r in gab["cajas"] if r["id"] == c["reemplazo_sugerido"])
            chequear(real["alto_mm"] == c["alto_mm"] and real["ancho_mm"] == c["ancho_mm"] and not real.get("referencial")
                     and abs(real["fondo_mm"] - c["fondo_mm"]) <= tol, f"{c['id']}: reemplazo apunta a una caja distinta")

# 4. el ejemplo armado existe y su lista de materiales no esta vacia
chequear(os.path.getsize(os.path.join(BASE, "ejemplo_lista_materiales.csv")) > 100, "Lista de materiales vacia")

print(f"Chequeos correctos: {ok}")
for a in avisos:
    print("AVISO:", a)
for e in errores:
    print("ERROR:", e)
print("RESULTADO:", "FALLO" if errores else "TODO CORRECTO")
sys.exit(1 if errores else 0)
