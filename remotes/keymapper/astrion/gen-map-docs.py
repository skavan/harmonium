#!/usr/bin/env python3
"""Regenerate astrion-remote-map.md + "KeyCodes Astrion.xlsx" FROM
data.json — the KeyMapper backup is the truth, these docs are its
rendering (they rotted twice when maintained by hand; v0.83.11).

Run from this folder:  python gen-map-docs.py
Needs openpyxl for the xlsx (pip install openpyxl); without it the
markdown still regenerates. Refresh data.json first when mappings
changed on the remote: extract it from the newest key_mapper.zip
(pull-keymapper.bat keeps that current)."""
import json
from pathlib import Path

HERE = Path(__file__).parent
d = json.loads((HERE / "data.json").read_text(encoding="utf-8"))

# the vocabulary this remote actually uses — extend as keys appear.
# v0.85.7: labels are the PHYSICAL buttons ("what is F2?" — Power),
# per remotes/astrion-facts.md. F-number kept in parentheses.
KEYCODE = {  # Android input keycode -> (constant, physical label)
    4: ("KEYCODE_BACK", "Back"), 24: ("KEYCODE_VOLUME_UP", "Volume Up"),
    25: ("KEYCODE_VOLUME_DOWN", "Volume Down"), 82: ("KEYCODE_MENU", "Menu"),
    131: ("KEYCODE_F1", "Home (F1)"), 132: ("KEYCODE_F2", "Power (F2)"),
    134: ("KEYCODE_F4", "Lightbulb·REW (F4)"),
    135: ("KEYCODE_F5", "Curtains·Play/Pause (F5)"),
    136: ("KEYCODE_F6", "Music·Stop (F6)"),
    137: ("KEYCODE_F7", "Climate·FWD (F7)"),
    138: ("KEYCODE_F8", "Red (F8)"), 139: ("KEYCODE_F9", "Green (F9)"),
    140: ("KEYCODE_F10", "Blue (F10)"), 141: ("KEYCODE_F11", "Yellow (F11)"),
    164: ("KEYCODE_VOLUME_MUTE", "Volume Mute"),
    92: ("KEYCODE_PAGE_UP", "Channel Up"),
    93: ("KEYCODE_PAGE_DOWN", "Channel Down"),
    21: ("KEYCODE_DPAD_LEFT", "D-pad Left"),
    22: ("KEYCODE_DPAD_RIGHT", "D-pad Right"),
}
OUTKEY = {  # KEY_EVENT output keycode -> (constant, printed character)
    68: ("KEYCODE_GRAVE", "`"), 69: ("KEYCODE_MINUS", "-"),
    70: ("KEYCODE_EQUALS", "="), 71: ("KEYCODE_LEFT_BRACKET", "["),
    72: ("KEYCODE_RIGHT_BRACKET", "]"), 74: ("KEYCODE_SEMICOLON", ";"),
    18: ("KEYCODE_POUND", "#"), 81: ("KEYCODE_PLUS", "+"),
    75: ("KEYCODE_APOSTROPHE", "'"), 76: ("KEYCODE_SLASH", "/"),
    55: ("KEYCODE_COMMA", ","), 56: ("KEYCODE_PERIOD", "."),
    77: ("KEYCODE_AT", "@"), 86: ("KEYCODE_MEDIA_STOP", "MediaStop"),
    142: ("KEYCODE_F12", "F12"),
}
APP = {
    "io.github.sds100.keymapper": "Open Key Mapper",
    "de.ozerov.fully": "Open Fully Kiosk Browser",
    "com.mediatek.filemanager": "Open File Manager",
    "com.aiks.HaRemote": "Open HaRemote",
    "com.android.browser": "Open Android Browser",
    "io.homeassistant.companion.android.minimal": "Open Home Assistant Minimal",
}
SYS = {"go_back": "Android Go back", "go_home": "Android Go home"}
CLICK = {0: "press", 1: "long-press", 2: "double-press"}

# every OTHER physical button — raw, no KeyMapper rule; they reach the
# webview directly. Listed so nobody has to deduce them (v0.85.7).
RAW = [
    ("D-pad ▲ ▼ ◀ ▶", "Arrow keys", "move panel focus · drive the device on TV pages"),
    ("OK (center)", "Enter", "activate the focused card · hold = grab the D-pad"),
    ("Home (F1) tap", "`F1`", "Harmonium home — up one level"),
    ("Power (F2) tap", "`F2`", "power — end/start the page's activity (confirm)"),
    ("Channel ▲/▼ tap", "PageUp / PageDown", "jump sections · on TV pages: borrow the D-pad for the panel"),
    ("Lightbulb·REW (F4)", "`F4`", "astrion profile: Lights shortcut · astrion2: ⏮ previous"),
    ("Curtains·Play/Pause (F5)", "`F5`", "astrion: Covers shortcut · astrion2: ⏯"),
    ("Music·Stop (F6)", "`F6`", "astrion: Music shortcut · astrion2: ⏹"),
    ("Climate·FWD (F7)", "`F7`", "astrion: Climate shortcut · astrion2: ⏭ next"),
]

groups = {g["uid"]: g for g in d.get("groups", [])}


def scope_of(m):
    g = groups.get(m.get("group_uid"))
    if not g:
        return "global"
    cons = []
    for c in g.get("constraints", []):
        if c.get("type") == "constraint_app_foreground":
            pkg = next((x["data"] for x in c.get("extras", [])
                        if x.get("id") == "extra_package_name"), "?")
            cons.append(APP.get(pkg, pkg).replace("Open ", "") + " in foreground")
        else:
            cons.append(c.get("type", "?"))
    return "group “" + g.get("name", "?") + "”" + \
        (" — " + "; ".join(cons) if cons else "")


rows = []
for m in sorted(d["keymap_list"],
                key=lambda m: (m["trigger"]["keys"][0]["clickType"],
                               m["trigger"]["keys"][0]["keyCode"])):
    t = m["trigger"]["keys"][0]
    const, label = KEYCODE.get(t["keyCode"], (f"keycode {t['keyCode']}", f"key {t['keyCode']}"))
    phys = f"{label} {CLICK.get(t['clickType'], t['clickType'])}"
    acts = []
    for a in m["actionList"]:
        if a["type"] == "APP":
            acts.append((APP.get(a["data"], "Open " + a["data"]), a["data"], "—"))
        elif a["type"] == "KEY_EVENT":
            oc, ch = OUTKEY.get(int(a["data"]), (f"keycode {a['data']}", "?"))
            acts.append((f"`{ch}`" if ch != "`" else "`` ` ``", a["data"], oc))
        elif a["type"] == "SYSTEM_ACTION":
            acts.append((SYS.get(a["data"], a["data"]), "—", "—"))
        else:
            acts.append((f"{a['type']}: {a.get('data', '')}", "—", "—"))
    for out, okc, ocon in acts:
        rows.append({
            "phys": phys + ("" if m["isEnabled"] else " (disabled)"),
            "ikc": t["keyCode"], "icon": const, "scan": t.get("scanCode", "—"),
            "out": out, "okc": okc, "ocon": ocon, "scope": scope_of(m),
        })

# ------------------------------- markdown -------------------------------
md = ["# Astrion Remote Key Map", "",
      "GENERATED from `data.json` — do not hand-edit; rerun",
      "`python gen-map-docs.py` after mappings change (refresh",
      "`data.json` from the newest `key_mapper.zip` first).", "",
      "## KeyMapper rules (what the buttons are remapped to)", "",
      "| Physical key/action | Input keycode | Input Android constant | Scancode | Output/action | Output keycode / package | Output Android constant | Scope |",
      "|---|---:|---|---:|---|---|---|---|"]
for r in rows:
    md.append(f"| {r['phys']} | {r['ikc']} | `{r['icon']}` | {r['scan']} | "
              f"{r['out']} | `{r['okc']}` | `{r['ocon']}` | {r['scope']} |"
              .replace("`—`", "—"))
md += ["", "## Raw keys (no KeyMapper rule — they reach Harmonium directly)", ""]
md += ["| Physical key | Emits | What Harmonium does |", "|---|---|---|"]
for name, emits, does in RAW:
    md.append(f"| {name} | {emits} | {does} |")
md += ["", "## Notes", "",
       "- `press` is `clickType: 0`; `long-press` is `clickType: 1` — the "
       f"configured long-press delay is {d.get('default_long_press_delay', 600)} ms.",
       "- Scope “global” = the mapping fires everywhere (the app-launcher "
       "keys — they are the road back to Fully from any other app). "
       "Grouped mappings inherit their group's constraints.",
       "- **The color keys are app launchers, not Harmonium keys**: Red "
       "opens Fully (the road home), Green the File Manager, Blue HaRemote, "
       "Yellow Key Mapper (long-press: the Android browser). KeyMapper "
       "consumes them, so they never reach the webview — delete those rules "
       "if you want them bindable in the Studio instead.",
       "- The F4–F7 glyph row is deliberately NOT KeyMapper-mapped — those "
       "F-keys reach the webview raw; the astrion profile names them "
       "`light` / `cover` / `music` / `climate`, astrion2 names them "
       "transport. Bind what they do in the Studio: Page settings → Keys. "
       "See docs/cookbook/hardware-keys.md.",
       "- The hold gestures land on: `]` = hold-Back, `=` = hold-Home, "
       "`F12` = hold-Power (All Off) — the engine's hold vocabulary, "
       "chosen so no typeable character carries a gesture.",
       "- Physical labels derive from the Android `KeyEvent` constants; the "
       "labels printed on the remote may differ. Scancodes are lower-level "
       "input-device codes.", ""]
(HERE / "astrion-remote-map.md").write_text("\n".join(md), encoding="utf-8")
print("astrion-remote-map.md:", len(rows), "rows +", len(RAW), "raw")

# --------------------------------- xlsx ---------------------------------
try:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Astrion"
    ws.append(["Physical key/action", "Input keycode", "Input Android constant",
               "Scancode", "Output/action", "Output keycode/package",
               "Output Android constant", "Scope"])
    strip = lambda s: str(s).replace("`", "").strip() or "—"
    for r in rows:
        ws.append([r["phys"], r["ikc"], r["icon"], r["scan"],
                   strip(r["out"]) if r["out"] != "`` ` ``" else "`",
                   r["okc"], r["ocon"], r["scope"]])
    ws2 = wb.create_sheet("Raw keys")
    ws2.append(["Physical key", "Emits", "What Harmonium does"])
    for name, emits, does in RAW:
        ws2.append([name, strip(emits), does])
    wb.save(HERE / "KeyCodes Astrion.xlsx")
    print("KeyCodes Astrion.xlsx: written")
except ImportError:
    print("openpyxl missing — xlsx NOT regenerated (pip install openpyxl)")
