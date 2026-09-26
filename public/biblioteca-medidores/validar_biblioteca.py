#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validador independiente de biblioteca-medidores (v1.1 — esquema real).

Se reescribe por separado de generar_biblioteca.py: vuelve a comprobar cada
dato desde cero contra el esquema real que Code confirmó para su cargador
(campos planos ancho_mm/alto_mm/fondo_mm, clave raíz "cajas", tipo de caja
limitado a 4 valores, snap como objeto, campos como lista de objetos).
"""

import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
errores = []
avisos = []


def err(msg):
    errores.append(msg)


def warn(msg):
    avisos.append(msg)


with open(os.path.join(BASE, "catalogo.json"), encoding="utf-8") as f:
    catalogo = json.load(f)

with open(os.path.join(BASE, "gabinetes.json"), encoding="utf-8") as f:
    gabs = json.load(f)

componentes = catalogo["componentes"]

if "cajas" not in gabs:
    err("gabinetes.json debe tener la clave raíz 'cajas' (no 'gabinetes') — esquema real del "
        "cargador de Code.")
    cajas = []
else:
    cajas = gabs["cajas"]

# ---------------------------------------------------------------------------
# 1. Lo mínimo que exige el cargador real (según lo confirmado por Code)
# ---------------------------------------------------------------------------
TIPOS_CAJA_VALIDOS = {"metalica", "inox", "plastica_sobrepuesta", "plastica_embutida"}
MONTAJES_COMPONENTE_VALIDOS = {"riel", "libre", "lineal"}

for c in componentes:
    for campo in ("id", "nombre", "svg", "montaje", "alto_mm", "ancho_mm", "campos", "bom"):
        if campo not in c:
            err(f"[componente sin id?] falta campo obligatorio '{campo}': {c.get('id', c)}")
    if not isinstance(c.get("id"), str) or not c["id"]:
        err(f"componente con id inválido: {c}")
    if not isinstance(c.get("nombre"), str) or not c["nombre"]:
        err(f"[{c.get('id')}] 'nombre' vacío o no-texto")
    if not isinstance(c.get("categoria"), str) or not c["categoria"]:
        err(f"[{c.get('id')}] 'categoria' vacía — el cargador la rechaza si está vacía")
    if not isinstance(c.get("svg"), str):
        err(f"[{c.get('id')}] 'svg' debe ser texto")
    if c.get("montaje") not in MONTAJES_COMPONENTE_VALIDOS:
        err(f"[{c.get('id')}] 'montaje' inválido: {c.get('montaje')!r} (debe ser riel/libre/lineal)")
    if not isinstance(c.get("ancho_mm"), (int, float)):
        err(f"[{c.get('id')}] 'ancho_mm' debe ser numérico plano (no anidado en tamano_mm)")
    if not isinstance(c.get("alto_mm"), (int, float)):
        err(f"[{c.get('id')}] 'alto_mm' debe ser numérico plano (no anidado en tamano_mm)")
    if "tamano_mm" in c:
        err(f"[{c.get('id')}] contiene 'tamano_mm' anidado — es el esquema viejo v1.0, el "
            f"cargador real no lo lee")
    if not isinstance(c.get("campos"), list):
        err(f"[{c.get('id')}] 'campos' debe ser una lista")
    else:
        for campo_obj in c["campos"]:
            if not isinstance(campo_obj, dict) or "id" not in campo_obj or "rotulo" not in campo_obj:
                err(f"[{c.get('id')}] cada entrada de 'campos' debe ser un objeto "
                    f"{{id, rotulo, tipo, ...}}, no un string: {campo_obj!r}")
    if not isinstance(c.get("bom"), str):
        err(f"[{c.get('id')}] 'bom' debe ser texto")
    snap = c.get("snap")
    if not isinstance(snap, dict) or "tipo" not in snap or "paso_mm" not in snap:
        err(f"[{c.get('id')}] 'snap' debe ser un objeto {{tipo, paso_mm}}, no un string")
    elif snap["tipo"] not in ("modular", "libre"):
        err(f"[{c.get('id')}] snap.tipo inválido: {snap['tipo']!r}")

for g in cajas:
    for campo in ("id", "nombre", "tipo", "ancho_mm", "alto_mm", "svg"):
        if campo not in g:
            err(f"[caja sin id?] falta campo obligatorio '{campo}': {g.get('id', g)}")
    if g.get("tipo") not in TIPOS_CAJA_VALIDOS:
        err(f"[{g.get('id')}] 'tipo' inválido: {g.get('tipo')!r} — debe ser uno de "
            f"{TIPOS_CAJA_VALIDOS} (el cargador rechaza cualquier otro valor)")
    if not isinstance(g.get("ancho_mm"), (int, float)):
        err(f"[{g.get('id')}] 'ancho_mm' debe ser numérico plano")
    if not isinstance(g.get("alto_mm"), (int, float)):
        err(f"[{g.get('id')}] 'alto_mm' debe ser numérico plano")
    if "tamano_mm" in g:
        err(f"[{g.get('id')}] contiene 'tamano_mm' anidado — esquema viejo v1.0")
    if "zonas" in g:
        err(f"[{g.get('id')}] contiene 'zonas' — campo inventado en v1.0 que el cargador real "
            f"no soporta (solo existe 'placa', una única zona)")
    if not isinstance(g.get("svg"), str):
        err(f"[{g.get('id')}] 'svg' debe ser texto")

# ---------------------------------------------------------------------------
# 2. REGLA CRÍTICA: nada de reserva 25% RIC en este módulo
# ---------------------------------------------------------------------------
for g in cajas:
    cap = g.get("capacidad", {})
    for modo in ("con_canaleta", "compacto"):
        m = cap.get(modo, {})
        if m.get("modulos_max_con_reserva", 0) not in (0, None):
            err(f"[{g['id']}] capacidad.{modo}.modulos_max_con_reserva debe ser 0 en este "
                f"módulo (la reserva de 25% de RIC N°02 no aplica a medidores)")

if re.search(r'"reserva_ric_25"\s*:\s*true', json.dumps(gabs)):
    err("Se encontró 'reserva_ric_25: true' en gabinetes.json — no debe existir en este módulo")

# ---------------------------------------------------------------------------
# 3. Existencia de archivos SVG referenciados + viewBox coherente + sin <text>
# ---------------------------------------------------------------------------


def leer_viewbox(ruta_svg):
    with open(ruta_svg, encoding="utf-8") as f:
        contenido = f.read()
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', contenido)
    return (float(m.group(1)), float(m.group(2))) if m else None


def contiene_texto(ruta_svg):
    with open(ruta_svg, encoding="utf-8") as f:
        return "<text" in f.read()


for c in componentes:
    ruta = os.path.join(BASE, c["svg"])
    if not os.path.isfile(ruta):
        err(f"[{c['id']}] archivo SVG no existe: {c['svg']}")
        continue
    vb = leer_viewbox(ruta)
    if vb is None:
        err(f"[{c['id']}] SVG sin viewBox reconocible")
        continue
    vb_ancho, vb_alto = vb
    if abs(vb_ancho - c["ancho_mm"]) > 0.01 or abs(vb_alto - c["alto_mm"]) > 0.01:
        err(f"[{c['id']}] viewBox ({vb_ancho}x{vb_alto}) no coincide con ancho_mm/alto_mm "
            f"({c['ancho_mm']}x{c['alto_mm']})")
    if contiene_texto(ruta):
        err(f"[{c['id']}] el SVG contiene <text>, viola la convención")

for g in cajas:
    ruta = os.path.join(BASE, g["svg"])
    if not os.path.isfile(ruta):
        err(f"[{g['id']}] archivo SVG de caja no existe: {g['svg']}")
        continue
    vb = leer_viewbox(ruta)
    if vb is None:
        err(f"[{g['id']}] caja SVG sin viewBox reconocible")
        continue
    vb_ancho, vb_alto = vb
    if abs(vb_ancho - g["ancho_mm"]) > 0.01 or abs(vb_alto - g["alto_mm"]) > 0.01:
        err(f"[{g['id']}] viewBox de caja no coincide con ancho_mm/alto_mm")

# ---------------------------------------------------------------------------
# 4. Campo "confianza" propio (documentación, no leído por el cargador)
# ---------------------------------------------------------------------------
VALORES_CONFIANZA = {"confirmado", "probable", "referencial"}

for c in componentes + cajas:
    conf = c.get("confianza")
    if conf is not None and conf not in VALORES_CONFIANZA:
        err(f"[{c['id']}] campo 'confianza' con valor inválido: {conf!r}")
    if conf in ("probable", "referencial") and not c.get("notas") and not c.get("nota"):
        err(f"[{c['id']}] confianza={conf!r} pero no tiene 'notas' explicando la limitación")
    if c.get("referencial") and conf == "confirmado":
        err(f"[{c['id']}] referencial=True pero confianza='confirmado' — contradicción")

# ---------------------------------------------------------------------------
# 5. Conversión STX/STXI (Ancho x Alto x Fondo -> alto_mm/ancho_mm/fondo_mm)
#    recalculada de forma independiente contra los valores de origen citados.
# ---------------------------------------------------------------------------
ORIGEN_STX = {
    "caja_inox_vialidad_300x200x150": (300, 200, 150),  # (Ancho, Alto, Fondo) catálogo
    "caja_inox_vialidad_400x300x200": (400, 300, 200),
}

for gid, (ancho_o, alto_o, fondo_o) in ORIGEN_STX.items():
    g = next((x for x in cajas if x["id"] == gid), None)
    if g is None:
        err(f"Caja esperada '{gid}' no encontrada")
        continue
    esperado = (alto_o, ancho_o, fondo_o)
    real = (g["alto_mm"], g["ancho_mm"], g["fondo_mm"])
    if real != esperado:
        err(f"[{gid}] conversión de convención incorrecta: se esperaba "
            f"(alto,ancho,fondo)={esperado}; se encontró {real}")
    if g["tipo"] != "inox":
        err(f"[{gid}] tipo debería ser 'inox', se encontró {g['tipo']!r}")

# ---------------------------------------------------------------------------
# 6. Caja trifásica CGE: 550 de alto (confirmado por el usuario)
# ---------------------------------------------------------------------------
cge = next((x for x in cajas if x["id"] == "caja_trifasica_cge"), None)
if cge is None:
    err("Caja 'caja_trifasica_cge' no encontrada")
else:
    if cge["alto_mm"] != 550:
        err(f"[caja_trifasica_cge] alto_mm debe ser 550 (confirmado por el usuario), "
            f"se encontró {cge['alto_mm']}")
    if cge["confianza"] != "confirmado":
        err("[caja_trifasica_cge] el tamaño exterior fue confirmado; confianza debería ser "
            "'confirmado'")
    if cge["tipo"] not in TIPOS_CAJA_VALIDOS:
        err(f"[caja_trifasica_cge] tipo inválido: {cge['tipo']!r}")

# ---------------------------------------------------------------------------
# 7. Ambos medidores trifásicos deben existir (ARES 8023 + compacto)
# ---------------------------------------------------------------------------
ids_componentes = {c["id"] for c in componentes}
for req in ("medidor_trifasico_ares8023", "medidor_trifasico_compacto"):
    if req not in ids_componentes:
        err(f"Falta componente requerido: {req}")

# ---------------------------------------------------------------------------
# 8. Interruptor de caja moldeada: exactamente 4 tamaños, 30-250A
# ---------------------------------------------------------------------------
interruptores_cm = [c for c in componentes if c["categoria"] == "Interruptor caja moldeada"]
if len(interruptores_cm) != 4:
    err(f"Se esperaban 4 tamaños de interruptor de caja moldeada, se encontraron "
        f"{len(interruptores_cm)}")

rangos_esperados = {"30A", "50-63A", "100-125A", "225-250A"}
rangos_reales = {c["atributos"]["rango"] for c in interruptores_cm if "atributos" in c}
if rangos_reales != rangos_esperados:
    err(f"Rangos de interruptor no coinciden: esperado {rangos_esperados}, "
        f"encontrado {rangos_reales}")

for c in interruptores_cm:
    if c["confianza"] != "referencial":
        err(f"[{c['id']}] dimensiones de catálogo obtenidas por búsqueda web sin confirmación "
            f"del usuario: deben quedar marcadas 'referencial'")

# ---------------------------------------------------------------------------
# 9. IDs únicos
# ---------------------------------------------------------------------------
ids_todos = [c["id"] for c in componentes] + [g["id"] for g in cajas]
duplicados = {x for x in ids_todos if ids_todos.count(x) > 1}
if duplicados:
    err(f"IDs duplicados encontrados: {duplicados}")

# ---------------------------------------------------------------------------
# Resultado
# ---------------------------------------------------------------------------
print(f"Componentes: {len(componentes)}  |  Cajas: {len(cajas)}")
print(f"Errores: {len(errores)}  |  Avisos: {len(avisos)}")
for a in avisos:
    print(f"  [AVISO] {a}")
if errores:
    for e in errores:
        print(f"  [ERROR] {e}")
    sys.exit(1)
print("OK — todas las verificaciones pasaron.")
sys.exit(0)
