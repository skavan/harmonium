#!/usr/bin/env python3
"""Regenerate rs90-remote-map.md + "KeyCodes RS90.xlsx" FROM
data.json — the KeyMapper backup is the truth, these docs are its
rendering (they rotted twice when maintained by hand; v0.83.11).

Run from this folder:  python gen-map-docs.py
Needs openpyxl for the xlsx (pip install openpyxl); without it the
markdown still regenerates. Refresh data.json first when mappings
changed on the remote: extract it from the newest key_mapper.zip
(pull-keymapper.bat keeps that current)."""
import json
import zipfile
from pathlib import Path

HERE = Path(__file__).parent
d = json.loads((HERE / "data.json").read_text(encoding="utf-8"))

# the vocabulary this remote actually uses — extend as keys appear
KEYCODE = {  # Android input keycode -> (constant, physical label)
    4: ("KEYCODE_BACK", "Back"), 24: ("KEYCODE_VOLUME_UP", "Volume Up"),
    25: ("KEYCODE_VOLUME_DOWN", "Volume Down"), 82: ("KEYCODE_MENU", "Menu"),
    131: ("KEYCODE_F1", "Power (F1)"), 132: ("KEYCODE_F2", "Home (F2)"),
    85: ("KEYCODE_MEDIA_PLAY_PAUSE", "Play/Pause"),
    89: ("KEYCODE_MEDIA_REWIND", "Rewind"),
    90: ("KEYCODE_MEDIA_FAST_FORWARD", "Fast Forward"),
    134: ("KEYCODE_F4", "F4"), 135: ("KEYCODE_F5", "Mic (F5)"),
    136: ("KEYCODE_F6", "ScreenCast (F6)"), 137: ("KEYCODE_F7", "Source (F7)"),
    138: ("KEYCODE_F8", "Settings (F8)"), 139: ("KEYCODE_F9", "Dot • (F9)"),
    140: ("KEYCODE_F10", "Dot •• (F10)"), 141: ("KEYCODE_F11", "Dot ••• (F11)"),
    164: ("KEYCODE_VOLUME_MUTE", "Volume Mute"),
    92: ("KEYCODE_PAGE_UP", "Channel Up"),
    93: ("KEYCODE_PAGE_DOWN", "Channel Down"),
    21: ("KEYCODE_DPAD_LEFT", "D-pad Left"),
    22: ("KEYCODE_DPAD_RIGHT", "D-pad Right"),
}
OUTKEY = {  # KEY_EVENT output keycode -> (constant, printed character)
    86: ("KEYCODE_MEDIA_STOP", "MediaStop"),
    68: ("KEYCODE_GRAVE", "`"), 69: ("KEYCODE_MINUS", "-"),
    70: ("KEYCODE_EQUALS", "="), 71: ("KEYCODE_LEFT_BRACKET", "["),
    72: ("KEYCODE_RIGHT_BRACKET", "]"), 74: ("KEYCODE_SEMICOLON", ";"),
    18: ("KEYCODE_POUND", "#"), 81: ("KEYCODE_PLUS", "+"),
    75: ("KEYCODE_APOSTROPHE", "'"), 76: ("KEYCODE_SLASH", "/"),
    55: ("KEYCODE_COMMA", ","), 56: ("KEYCODE_PERIOD", "."),
    73: ("KEYCODE_BACKSLASH", "\\"), 77: ("KEYCODE_AT", "@"),
}
APP = {
    "com.skavan.imefix": "Run Harmonium IME-Fix",
    "fr.neamar.kiss": "Open KISS Launcher",
    "io.github.sds100.keymapper": "Open Key Mapper",
    "de.ozerov.fully": "Open Fully Kiosk Browser",
    "com.mediatek.filemanager": "Open File Manager",
    "com.aiks.HaRemote": "Open HaRemote",
    "com.android.browser": "Open Android Browser",
    "com.cantata.remote": "Open Haptique stock remote UI",
    "io.homeassistant.companion.android.minimal": "Open Home Assistant Minimal",
}
SYS = {"go_back": "Android Go back", "go_home": "Android Go home"}
CLICK = {0: "press", 1: "long-press", 2: "double-press"}

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
md = ["# RS90 Remote Key Map", "",
      "GENERATED from `data.json` — do not hand-edit; rerun",
      "`python gen-map-docs.py` after mappings change (refresh",
      "`data.json` from the newest `key_mapper.zip` first).", "",
      "| Physical key/action | Input keycode | Input Android constant | Scancode | Output/action | Output keycode / package | Output Android constant | Scope |",
      "|---|---:|---|---:|---|---|---|---|"]
for r in rows:
    md.append(f"| {r['phys']} | {r['ikc']} | `{r['icon']}` | {r['scan']} | "
              f"{r['out']} | `{r['okc']}` | `{r['ocon']}` | {r['scope']} |"
              .replace("`—`", "—"))
md += ["", "## Notes", "",
       "- `press` is `clickType: 0`; `long-press` is `clickType: 1` — the "
       f"configured long-press delay is {d.get('default_long_press_delay', 600)} ms.",
       "- Scope “global” = the mapping fires everywhere (the app-launcher "
       "keys — they are the road back to Fully from any other app). "
       "Grouped mappings inherit their group's constraints.",
       "- Raw F-keys reach the webview untouched (NOT KeyMapper): "
       "Power `F1`, Home `F2`, Mic `F5`, ScreenCast `F6`, Source "
       "`F7`, Settings `F8`. D-pad, OK (Enter) and CH up/down "
       "(PageUp/Down) are raw too; the transport row is raw on "
       "TAP (MediaRewind/PlayPause/FastForward -> prev / play-pause "
       "/ next in the engine).",
      "- KeyMapper (Fully-scoped) adds: volume +/- and mute; Back "
       "tap `[` = UI back, long `]` = device back; Menu tap `#`, "
       "long `@` = Apps drawer; CH up/down long = `'`/`/` (section "
       "jumps); Power long `=` = All Off; and the transport HOLDS "
       "-- Rewind long `,` = seek back, Fast Forward long `.` = "
       "seek forward, Play/Pause long = MediaStop.",
      "- The dot row is global (fires anywhere -- the road back to "
       "Fully): • F9 -> Fully, •• F10 -> KISS launcher, ••• F11 -> "
       "KeyMapper; ••• LONG -> Harmonium IME-Fix (manual re-bounce "
       "of the input method if a boot ever leaves keys dead).",
       "- Physical labels derive from the Android `KeyEvent` constants; the "
       "labels printed on the remote may differ. Scancodes are lower-level "
       "input-device codes.", ""]
(HERE / "rs90-remote-map.md").write_text("\n".join(md), encoding="utf-8")
print("rs90-remote-map.md:", len(rows), "rows")

# --------------------------------- xlsx ---------------------------------
try:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "RS90"
    ws.append(["Physical key/action", "Input keycode", "Input Android constant",
               "Scancode", "Output/action", "Output keycode/package",
               "Output Android constant", "Scope"])
    strip = lambda s: str(s).replace("`", "").strip() or "—"
    for r in rows:
        ws.append([r["phys"], r["ikc"], r["icon"], r["scan"],
                   strip(r["out"]) if r["out"] != "`` ` ``" else "`",
                   r["okc"], r["ocon"], r["scope"]])
    wb.save(HERE / "KeyCodes RS90.xlsx")
    print("KeyCodes RS90.xlsx: written")
except ImportError:
    print("openpyxl missing — xlsx NOT regenerated (pip install openpyxl)")
