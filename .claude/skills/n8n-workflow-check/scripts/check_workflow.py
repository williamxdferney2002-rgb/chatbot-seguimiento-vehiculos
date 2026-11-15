#!/usr/bin/env python3
"""Static checks for n8n workflow exports (without executing them).

Usage:
  python3 check_workflow.py FLUJO.json [--base EXPORT_ANTERIOR.json] [--modo entrega|produccion] [--json]

  --base        Compare node IDs, webhookId, credentials, and errorWorkflow against the previous export.
  --modo        'entrega' (default) requires active:false and timezone; 'produccion' only reports them
                (useful when auditing running exports).
  --json        Print machine-readable JSON for the audit skill.

Exit with code 1 when any error is found.
"""
import argparse
import json
import os
import re
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))

VERSIONES = {
    "n8n-nodes-base.code": 2,
    "n8n-nodes-base.if": 2.3,
    "n8n-nodes-base.switch": 3.4,
    "n8n-nodes-base.set": 3.4,
    "n8n-nodes-base.googleSheets": 4.7,
    "n8n-nodes-base.httpRequest": 4.5,
    "n8n-nodes-base.telegram": 1.2,
    "n8n-nodes-base.telegramTrigger": 1.2,
    "@n8n/n8n-nodes-langchain.googleGemini": 1.2,
    "n8n-nodes-base.googleDrive": 3,
    "n8n-nodes-base.scheduleTrigger": 1.2,
    "n8n-nodes-base.wait": 1.1,
}

SIN_ENTRADA_OK = ("trigger", "Trigger", "webhook", "stickyNote", "manualTrigger", "errorTrigger")

SECRETOS = [
    ("Telegram bot token", re.compile(r"\b\d{8,10}:AA[A-Za-z0-9_-]{30,40}\b|\b\d{8,10}:[A-Za-z0-9_-]{35,40}\b")),
    ("Google API key (AIza…)", re.compile(r"AIza[0-9A-Za-z_-]{35}")),
    ("Groq API key (gsk_…)", re.compile(r"gsk_[A-Za-z0-9]{20,}")),
    ("API key matching sk-…", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}")),
    ("Google OAuth token (ya29.)", re.compile(r"ya29\.[0-9A-Za-z_-]{20,}")),
    ("literal Bearer value", re.compile(r"Bearer\s+[A-Za-z0-9._-]{20,}")),
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("WhatsApp/Meta access token (EAA…)", re.compile(r"\bEAA[A-Za-z0-9]{50,}")),
]

PROHIBIDOS = [
    ("N8N_CONCURRENCY_PRODUCTION_LIMIT (caused triplicate executions)", re.compile(r"N8N_CONCURRENCY_PRODUCTION_LIMIT")),
    ("Gemini 3.8 Flash model (historically limited daily quota)", re.compile(r"gemini-3\.8-flash(?!-lite)", re.I)),
]


class Informe:
    def __init__(self):
        self.items = []  # (level, group, message)

    def add(self, nivel, grupo, msg):
        self.items.append((nivel, grupo, msg))

    def err(self, g, m):
        self.add("ERROR", g, m)

    def warn(self, g, m):
        self.add("AVISO", g, m)

    def ok(self, g, m):
        self.add("OK", g, m)

    def info(self, g, m):
        self.add("INFO", g, m)

    @property
    def errores(self):
        return [i for i in self.items if i[0] == "ERROR"]


def enmascarar(s):
    return s[:6] + "…" + s[-3:] if len(s) > 12 else "…"


def es_trigger(n):
    return any(k in n["type"] for k in SIN_ENTRADA_OK)


def recorrer_strings(obj, ruta=""):
    if isinstance(obj, str):
        yield ruta, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from recorrer_strings(v, f"{ruta}.{k}" if ruta else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from recorrer_strings(v, f"{ruta}[{i}]")


# ---------------------------------------------------------------- structure
def revisar_estructura(w, inf):
    G = "Structure"
    nodos = w.get("nodes")
    if not isinstance(nodos, list) or not nodos:
        inf.err(G, "JSON has no 'nodes' list. Is this an n8n export?")
        return
    nombres, ids = {}, {}
    for n in nodos:
        nombres[n.get("name")] = nombres.get(n.get("name"), 0) + 1
        ids[n.get("id")] = ids.get(n.get("id"), 0) + 1
    for k, c in nombres.items():
        if c > 1:
            inf.err(G, f"Duplicate node name: '{k}' ({c} occurrences).")
    for k, c in ids.items():
        if c > 1:
            inf.err(G, f"Duplicate node ID: '{k}' ({c} occurrences).")
        if not k:
            inf.err(G, "Some nodes have no 'id'.")

    existentes = set(nombres)
    con = w.get("connections", {})
    con_entrada = set()
    for origen, salidas in con.items():
        if origen not in existentes:
            inf.err(G, f"Connection from a missing node: '{origen}'.")
        for tipo, ramas in salidas.items():
            for rama in ramas or []:
                for d in rama or []:
                    if d.get("node") not in existentes:
                        inf.err(G, f"'{origen}' points to a missing node: '{d.get('node')}'.")
                    else:
                        con_entrada.add(d["node"])
    sueltos = [n["name"] for n in nodos
               if n["name"] not in con_entrada and not es_trigger(n) and "stickyNote" not in n["type"]]
    for s in sueltos:
        inf.warn(G, f"Node without input (never executes): '{s}'.")
    for n in nodos:
        if n.get("disabled"):
            inf.warn(G, f"Disabled node: '{n['name']}'.")
    if not [i for i in inf.items if i[1] == G and i[0] == "ERROR"]:
        inf.ok(G, f"{len(nodos)} nodes, unique names and IDs, valid connections.")


# ---------------------------------------------------------------- delivery
def revisar_entrega(w, inf, modo):
    G = "Delivery"
    f = inf.err if modo == "entrega" else inf.info
    s = w.get("settings") or {}
    if w.get("active") is not False:
        f(G, f"'active' is {w.get('active')!r}; deliver with active: false.")
    else:
        inf.ok(G, "active: false.")
    if s.get("timezone") != "America/Bogota":
        f(G, f"settings.timezone is {s.get('timezone')!r}; expected 'America/Bogota'.")
    else:
        inf.ok(G, "settings.timezone = America/Bogota.")
    es_flujo_errores = any(n["type"] == "n8n-nodes-base.errorTrigger" for n in w["nodes"])
    if not s.get("errorWorkflow") and not es_flujo_errores:
        inf.warn(G, "Missing settings.errorWorkflow: failures may go unnoticed.")
    if w.get("pinData"):
        inf.warn(G, f"pinData contains pinned data in: {', '.join(w['pinData'].keys())}.")


# ---------------------------------------------------------------- baseline comparison
def revisar_base(w, b, inf):
    G = "Previous export comparison"
    nb = {n["name"]: n for n in b["nodes"]}
    nw = {n["name"]: n for n in w["nodes"]}
    ids_w = {n["id"]: n for n in w["nodes"]}
    errores_previos = len(inf.errores)
    for nombre, viejo in nb.items():
        nuevo = nw.get(nombre)
        if nuevo is None:
            mismo = ids_w.get(viejo["id"])
            if mismo:
                inf.info(G, f"Renamed: '{nombre}' → '{mismo['name']}' (ID preserved).")
                nuevo = mismo
            else:
                inf.warn(G, f"Removed or recreated node: '{nombre}' (its ID is absent).")
                continue
        if nuevo["id"] != viejo["id"]:
            inf.err(G, f"'{nombre}' changed ID ({viejo['id']} → {nuevo['id']}).")
        if viejo.get("webhookId") and nuevo.get("webhookId") != viejo.get("webhookId"):
            grave = "trigger" in viejo["type"].lower()
            (inf.err if grave else inf.warn)(
                G, f"'{nombre}' changed webhookId ({viejo['webhookId']} → {nuevo.get('webhookId')})"
                + (" — breaks the Telegram webhook." if grave else "."))
        cv, cn = viejo.get("credentials") or {}, nuevo.get("credentials") or {}
        for tipo, c in cv.items():
            if tipo not in cn:
                inf.err(G, f"'{nombre}' lost credential {tipo} ({c.get('name')}).")
            elif cn[tipo].get("id") != c.get("id"):
                inf.err(G, f"'{nombre}' changed credential {tipo}: {c.get('id')} → {cn[tipo].get('id')}.")
    sb, sw = b.get("settings") or {}, w.get("settings") or {}
    if sb.get("errorWorkflow") and sw.get("errorWorkflow") != sb.get("errorWorkflow"):
        inf.err(G, f"settings.errorWorkflow changed: {sb.get('errorWorkflow')} → {sw.get('errorWorkflow')}.")
    if b.get("id") and w.get("id") and b["id"] != w["id"]:
        inf.info(G, f"Workflow ID changed ({b['id']} → {w['id']}); expected when importing as a new workflow.")
    nuevos = [n for n in nw if n not in nb and nw[n]["id"] not in {x["id"] for x in b["nodes"]}]
    if nuevos:
        inf.info(G, f"{len(nuevos)} new nodes: {', '.join(nuevos[:15])}{'…' if len(nuevos) > 15 else ''}.")
    if len(inf.errores) == errores_previos:
        inf.ok(G, "IDs, webhookId, credentials, and errorWorkflow preserved.")


# ---------------------------------------------------------------- node versions
def revisar_versiones(w, inf):
    G = "Node versions"
    malos = []
    for n in w["nodes"]:
        esp = VERSIONES.get(n["type"])
        if esp is not None and n.get("typeVersion") != esp:
            malos.append(f"'{n['name']}' {n['type'].split('.')[-1]} {n.get('typeVersion')} (reference {esp})")
    for m in malos:
        inf.warn(G, m)
    if not malos:
        inf.ok(G, "All node versions match the configured reference versions.")


# ---------------------------------------------------------------- telegram
def escapado_en_code_previo(w, nombre, texto):
    """Accept a direct $json field expression only when ALL upstream producers are Code nodes escaping ampersands."""
    if not re.fullmatch(r"=\{\{\s*\$json\.\w+\s*\}\}", texto.strip()):
        return False
    tipos = {n["name"]: n for n in w["nodes"]}

    def antes(nom):  # Direct predecessors through Switch/IF nodes (which do not transform text).
        r = []
        for o, c in (w.get("connections") or {}).items():
            if any(d.get("node") == nom for salida in c.get("main", []) for d in (salida or [])):
                if tipos.get(o, {}).get("type") in ("n8n-nodes-base.switch", "n8n-nodes-base.if"):
                    r += antes(o)
                else:
                    r.append(o)
        return r
    previos = antes(nombre)
    return bool(previos) and all(
        tipos.get(o, {}).get("type") == "n8n-nodes-base.code"
        and "&amp;" in (tipos[o].get("parameters") or {}).get("jsCode", "") for o in previos)


def revisar_telegram(w, inf):
    G = "Telegram"
    hubo = False
    for n in w["nodes"]:
        if n["type"] != "n8n-nodes-base.telegram":
            continue
        p = n.get("parameters") or {}
        recurso = p.get("resource", "message")
        op = p.get("operation", "sendMessage")
        af = p.get("additionalFields") or {}
        nombre = n["name"]
        if recurso != "message":
            continue
        hubo = True
        if op in ("sendMessage", "editMessageText"):
            if af.get("parse_mode") != "HTML":
                inf.err(G, f"'{nombre}' ({op}) missing parse_mode HTML: Markdown may break delivery on '_' or '*'.")
            texto = p.get("text", "")
            if isinstance(texto, str) and "{{" in texto and "&amp;" not in texto:
                if escapado_en_code_previo(w, nombre, texto):
                    inf.ok(G, f"'{nombre}': text comes from a Code node escaping & < > (intentional HTML is preserved).")
                else:
                    inf.err(G, f"'{nombre}': dynamic text does not escape & < > (use .replace(/&/g,'&amp;')…).")
            if isinstance(texto, str) and "{{" not in texto and re.search(r"&(?!amp;|lt;|gt;|quot;)|<(?!/?(b|i|u|s|code|pre|a)\b)", texto):
                inf.err(G, f"'{nombre}': static text contains unescaped '&' or '<'; Telegram rejects it as HTML.")
            if op == "sendMessage" and af.get("appendAttribution") is not False:
                inf.warn(G, f"'{nombre}' missing appendAttribution: false (adds 'This message was sent automatically with n8n').")
        elif op in ("sendPhoto", "sendDocument", "sendAudio", "sendVideo", "sendAnimation"):
            if af.get("caption") and af.get("parse_mode") != "HTML":
                inf.warn(G, f"'{nombre}' ({op}) has a caption without parse_mode HTML.")
        # Buttons
        kb = p.get("inlineKeyboard") or {}
        if not isinstance(kb, dict):  # Dynamic keyboard expression: cannot validate without execution.
            kb = {}
        botones = []
        for fila in kb.get("rows", []):
            botones += (fila.get("row") or {}).get("buttons", [])
        if botones:
            for bt in botones:
                cd = (bt.get("additionalFields") or {}).get("callback_data", "")
                if isinstance(cd, str) and cd:
                    if cd.startswith("="):
                        lit = "".join(a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", cd))
                        if len(lit.encode()) > 40:
                            inf.warn(G, f"'{nombre}': callback_data with {len(lit.encode())} fixed bytes; total must not exceed 64.")
                    elif len(cd.encode()) > 64:
                        inf.err(G, f"'{nombre}': callback_data of {len(cd.encode())} bytes (maximum 64).")
            textos = " ".join(str(b.get("text", "")) for b in botones)
            if len(botones) % 2:
                inf.warn(G, f"'{nombre}': {len(botones)} buttons; the convention uses pairs (2/4/6).")
            if "❌" not in textos and "Cancelar" not in textos and "botones" not in textos:
                inf.warn(G, f"'{nombre}': no cancel button (❌ Cancelar).")
    if hubo and not [i for i in inf.items if i[1] == G and i[0] in ("ERROR", "AVISO")]:
        inf.ok(G, "HTML mode, escaping, and buttons pass all delivery checks.")


# ---------------------------------------------------------------- sheets
def revisar_hoja(w, inf):
    G = "Sheets (reads and writes)"
    batch_get = [n["name"] for n in w["nodes"] if n["type"] == "n8n-nodes-base.httpRequest"
                 and "values:batchGet" in str((n.get("parameters") or {}).get("url", ""))]
    lecturas = [n["name"] for n in w["nodes"] if n["type"] == "n8n-nodes-base.googleSheets"
                and (n.get("parameters") or {}).get("operation", "read") in ("read", "lookup", "getAll")]
    if len(batch_get) > 1:
        inf.warn(G, f"{len(batch_get)} batchGet reads ({', '.join(batch_get)}); the rule allows one per execution.")
    for l in lecturas:
        inf.warn(G, f"Individual Google Sheets read: '{l}'. The rule requires one snapshot read (batchGet → Tablas).")
    borrados = [n["name"] for n in w["nodes"] if n["type"] == "n8n-nodes-base.googleSheets"
                and (n.get("parameters") or {}).get("operation") == "delete"]
    for bnode in borrados:
        inf.info(G, f"Physical row deletion: '{bnode}' (legacy behavior: prefer voiding ledger records).")
    if batch_get and not lecturas and len(batch_get) == 1:
        inf.ok(G, f"One snapshot read: '{batch_get[0]}'.")


# ---------------------------------------------------------------- security
def revisar_seguridad(w, inf):
    G = "Security"
    hallados = 0
    for n in w["nodes"]:
        for ruta, s in recorrer_strings(n.get("parameters") or {}):
            for nombre, rx in SECRETOS:
                for m in rx.finditer(s):
                    hallados += 1
                    inf.err(G, f"'{n['name']}' ({ruta}): possible {nombre}: {enmascarar(m.group(0))}. Use credentials.")
        p = n.get("parameters") or {}
        for h in ((p.get("headerParameters") or {}).get("parameters") or []):
            if str(h.get("name", "")).lower() in ("authorization", "x-api-key", "api-key") and h.get("value") and "{{" not in str(h.get("value")):
                hallados += 1
                inf.err(G, f"'{n['name']}': header {h['name']} has a literal value. Use credentials.")
    for ruta, s in recorrer_strings({k: v for k, v in w.items() if k != "nodes"}):
        for nombre, rx in SECRETOS:
            for m in rx.finditer(s):
                hallados += 1
                inf.err(G, f"({ruta}): possible {nombre}: {enmascarar(m.group(0))}.")
    if not hallados:
        inf.ok(G, "No embedded tokens or keys; credentials are referenced by ID.")


def revisar_prohibidos(w, inf, texto):
    G = "Prohibited patterns"
    hubo = False
    for nombre, rx in PROHIBIDOS:
        if rx.search(texto):
            hubo = True
            inf.err(G, f"Found {nombre}.")
    if not hubo:
        inf.ok(G, "No N8N_CONCURRENCY_PRODUCTION_LIMIT or Gemini 3.8 Flash.")


# ---------------------------------------------------------------- code
def revisar_code(w, inf):
    G = "Code nodes"
    codigos = [(n["name"], (n.get("parameters") or {}).get("jsCode", ""))
               for n in w["nodes"] if n["type"] == "n8n-nodes-base.code"
               and (n.get("parameters") or {}).get("language", "javaScript") == "javaScript"]
    if not codigos:
        return
    try:
        r = subprocess.run(["node", os.path.join(AQUI, "sintaxis_code.js")],
                           input=json.dumps(codigos), capture_output=True, text=True, timeout=60)
        fallos = json.loads(r.stdout or "[]")
    except FileNotFoundError:
        inf.warn(G, "Node is unavailable: Code syntax was not checked.")
        fallos = None
    except Exception as e:  # noqa: BLE001
        inf.warn(G, f"Could not check syntax: {e}")
        fallos = None
    if fallos:
        for f in fallos:
            inf.err(G, f"'{f['nodo']}': syntax error: {f['error']}")
    for nombre, code in codigos:
        if re.search(r"\bsello\s*=", code) and "$execution.id" not in code:
            inf.warn(G, f"'{nombre}': 'sello' lacks $execution.id; messages in the same second can collide.")
        if "$env." in code:
            inf.warn(G, f"'{nombre}': uses $env (blocked by default in n8n).")
        if re.search(r"\bnew Date\(\)\.toLocale|toLocaleString\(", code):
            inf.warn(G, f"'{nombre}': toLocaleString depends on server ICU; use pesos()/Luxon.")
    if fallos == []:
        inf.ok(G, f"{len(codigos)} Code nodes compile without syntax errors.")


# ---------------------------------------------------------------- main
def revisar(ruta, base=None, modo="entrega"):
    inf = Informe()
    try:
        texto = open(ruta, encoding="utf-8").read()
        w = json.loads(texto)
    except Exception as e:  # noqa: BLE001
        inf.err("Structure", f"Invalid JSON: {e}")
        return inf, None
    revisar_estructura(w, inf)
    if not w.get("nodes"):
        return inf, w
    revisar_entrega(w, inf, modo)
    if base:
        revisar_base(w, json.load(open(base, encoding="utf-8")), inf)
    revisar_versiones(w, inf)
    revisar_telegram(w, inf)
    revisar_hoja(w, inf)
    revisar_seguridad(w, inf)
    revisar_prohibidos(w, inf, texto)
    revisar_code(w, inf)
    return inf, w


ICONO = {"ERROR": "❌", "AVISO": "⚠️ ", "OK": "✅", "INFO": "ℹ️ "}


def imprimir(ruta, inf, w):
    print(f"\n=== {os.path.basename(ruta)}" + (f" — {w.get('name')} ({len(w.get('nodes', []))} nodes)" if w else ""))
    grupos = []
    for _, g, _ in inf.items:
        if g not in grupos:
            grupos.append(g)
    for g in grupos:
        print(f"\n[{g}]")
        for nivel, gg, m in inf.items:
            if gg == g:
                print(f"  {ICONO[nivel]} {m}")
    e = len(inf.errores)
    a = len([i for i in inf.items if i[0] == "AVISO"])
    print(f"\nResult: {e} errors, {a} warnings → {'DO NOT DELIVER' if e else 'Ready for handoff' if not a else 'Review warnings before handoff'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("flujos", nargs="+")
    ap.add_argument("--base")
    ap.add_argument("--modo", choices=["entrega", "produccion"], default="entrega")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if a.base and len(a.flujos) > 1:
        ap.error("--base accepts one workflow only.")
    total_err = 0
    salida = []
    for f in a.flujos:
        inf, w = revisar(f, a.base, a.modo)
        total_err += len(inf.errores)
        if a.json:
            salida.append({"archivo": f, "flujo": w.get("name") if w else None,
                           "hallazgos": [{"nivel": n, "grupo": g, "mensaje": m} for n, g, m in inf.items]})
        else:
            imprimir(f, inf, w)
    if a.json:
        print(json.dumps(salida, ensure_ascii=False, indent=1))
    sys.exit(1 if total_err else 0)


if __name__ == "__main__":
    main()
