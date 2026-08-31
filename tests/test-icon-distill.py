"""Icon-set distiller (0.87 — docs/design-icon-sets.md + Suresh's
ruling: support anything HA has installed). Pins:
  1. ref scan — every '<set>:<name>' under any `icon` key, material:
     and paths excluded;
  2. phu source — name→path extraction from the installed HACS
     module's "name":[x,y,w,h,"path"] table;
  3. mdi source — HA's own frontend JSON ({name: path});
  4. distill — referenced icons materialize as SVGs; a missing name
     and an uninstalled set report without failing; nothing is
     written for sets nobody references;
  5. OWNERSHIP — a user's hand-replaced SVG is never overwritten;
     a distilled file we recognise as ours refreshes when the
     source changes; stamps persist per set dir.
Follows test-integration-split's stub-then-import pattern."""
import json
import sys
import tempfile
import types
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]

# ---- stub the HA surface the package touches (the proven block
# from test-integration-split — keep the two in step) ----


def stub(name, **attrs):
    m = sys.modules.get(name) or types.ModuleType(name)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m
    return m


class _View:
    def json(self, *a, **k): ...
    def json_message(self, *a, **k): ...


stub("homeassistant")
stub("homeassistant.core", HomeAssistant=object, ServiceCall=object)
stub("homeassistant.config_entries", ConfigEntry=object)
stub("homeassistant.exceptions", HomeAssistantError=Exception)
stub("homeassistant.components", frontend=stub("homeassistant.components.frontend"),
     persistent_notification=stub("homeassistant.components.persistent_notification",
                                  async_create=lambda *a, **k: None,
                                  async_dismiss=lambda *a, **k: None))
stub("homeassistant.components.http", HomeAssistantView=_View, StaticPathConfig=object)
stub("homeassistant.helpers")
stub("homeassistant.helpers.config_validation", string=str, boolean=bool,
     SCRIPT_SCHEMA=lambda x: x)
stub("homeassistant.helpers.script", Script=object)
stub("homeassistant.helpers.storage", Store=object)
stub("homeassistant.helpers.entity", Entity=object)
stub("homeassistant.helpers.restore_state", RestoreEntity=object)


class _Schema:
    def __init__(self, *a, **k): ...


stub("voluptuous", Schema=_Schema, Required=lambda *a, **k: None,
     Optional=lambda *a, **k: None, Invalid=Exception)
stub("aiohttp", web=stub("aiohttp.web", Request=object, Response=object,
                         json_response=lambda *a, **k: None))
sys.path.insert(0, str(HERE / "custom_components"))

fails = 0


def check(name, cond):
    global fails
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        fails += 1


from harmonium.icons import (  # noqa: E402
    distill_icons, iter_icon_refs, _mdi_source, _phu_source)

# ---- 1. ref scan ----------------------------------------------------
cfg = {
    "screens": {"porch": {"sections": [{"tiles": [
        {"id": "a", "icon": "phu:sonos"},
        {"id": "b", "icon": "material:tv"},
        {"id": "c", "icon": "mdi:sofa"},
        {"id": "d", "icon": "skins/photo.jpg"},
        {"id": "e", "icon": "phu:sonos"},
    ]}]}},
    "activities": {"m": {"present": {"x": {"icon": "phu:plex_2"}}}},
    "devices": {"d1": {"icon": "hue:bulb"}},
}
refs = sorted(set(iter_icon_refs(cfg)))
check("scan finds set refs everywhere, deduped; font + paths excluded",
      refs == [("hue", "bulb"), ("mdi", "sofa"),
               ("phu", "plex_2"), ("phu", "sonos")])

with tempfile.TemporaryDirectory() as td:
    www = Path(td) / "www"

    # ---- 2. the phu source (installed HACS module) ----
    mod = www / "community" / "custom-brand-icons"
    mod.mkdir(parents=True)
    (mod / "custom-brand-icons.js").write_text(
        'var icons={"sonos":[0,0,24,24,"M1 2h3v4z"],'
        '"plex_2":[0,0,50,50,"M9 9h1v1z"]};', encoding="utf-8")
    tab = _phu_source(www, None)
    check("phu: names and viewBoxes extract from the module",
          tab and tab["sonos"] == ("0 0 24 24", "M1 2h3v4z")
          and tab["plex_2"][0] == "0 0 50 50")

    # ---- 3. the mdi source (HA's frontend JSON) ----
    fe = Path(td) / "hass_frontend"
    (fe / "static" / "mdi").mkdir(parents=True)
    (fe / "static" / "mdi" / "abc123.json").write_text(
        json.dumps({"sofa": "M2 2h2v2z", "lamp": "M3 3h1v1z"}),
        encoding="utf-8")
    mtab = _mdi_source(www, fe)
    check("mdi: HA's bundled path JSON serves every name",
          mtab and mtab["sofa"] == ("0 0 24 24", "M2 2h2v2z"))

    # ---- 4. distill ----
    rep = distill_icons(www, cfg, frontend=fe)
    sonos = www / "harmonium" / "icons" / "phu" / "sonos.svg"
    check("referenced icons materialize as SVGs",
          sonos.is_file()
          and (www / "harmonium" / "icons" / "mdi" / "sofa.svg").is_file()
          and 'viewBox="0 0 24 24"' in sonos.read_text("utf-8")
          and 'd="M1 2h3v4z"' in sonos.read_text("utf-8"))
    check("report: written names that landed",
          sorted(rep["written"]) == ["mdi:sofa", "phu:plex_2", "phu:sonos"])
    check("report: an uninstalled set is no_source, not a failure",
          rep["no_source"] == ["hue"])
    check("nothing is written for the uninstalled set",
          not (www / "harmonium" / "icons" / "hue").exists())

    # a name the installed set lacks
    cfg2 = json.loads(json.dumps(cfg))
    cfg2["screens"]["porch"]["sections"][0]["tiles"][0]["icon"] = "phu:nope"
    rep2 = distill_icons(www, cfg2, frontend=fe)
    check("report: a name the set lacks is `missing`, not a failure",
          "phu:nope" in rep2["missing"])

    # ---- 5. ownership ----
    sonos.write_text("<svg>USERS OWN ART</svg>", encoding="utf-8")
    distill_icons(www, cfg, frontend=fe)
    check("a hand-replaced SVG is never overwritten",
          sonos.read_text("utf-8") == "<svg>USERS OWN ART</svg>")
    # source changes → OUR files refresh, the user's stays frozen
    (mod / "custom-brand-icons.js").write_text(
        'var icons={"sonos":[0,0,24,24,"M9 9h9v9z"],'
        '"plex_2":[0,0,50,50,"M7 7h7v7z"]};', encoding="utf-8")
    rep3 = distill_icons(www, cfg, frontend=fe)
    plex = www / "harmonium" / "icons" / "phu" / "plex_2.svg"
    check("a distilled file WE stamped refreshes with its source",
          'd="M7 7h7v7z"' in plex.read_text("utf-8")
          and "phu:plex_2" in rep3["written"])
    check("the user's file still stays frozen through the refresh",
          sonos.read_text("utf-8") == "<svg>USERS OWN ART</svg>")
    # idempotence: a second pass writes nothing
    rep4 = distill_icons(www, cfg, frontend=fe)
    check("a settled pass writes nothing", rep4["written"] == [])

print(("\nicon-distill: FAIL " + str(fails)) if fails
      else "\nicon-distill: ALL PASS")
raise SystemExit(1 if fails else 0)
