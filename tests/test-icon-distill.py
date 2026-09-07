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
    distill_icons, iter_icon_refs, _mdi_source, _phu_source,
    list_icons,
    mint_icon_paths,
    resolve_icons,
)

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
    # THE CHUNK LAW (round 6 — stock-HA comparison: "Missing a
    # lot"): mdi ships SPLIT across many hash-named files; the table
    # is their UNION, and the index/metadata files beside them are
    # not icons
    (fe / "static" / "mdi" / "def456.json").write_text(
        json.dumps({"projector": "M4 4h4v4z"}), encoding="utf-8")
    (fe / "static" / "mdi" / "iconList.json").write_text(
        json.dumps([{"name": "sofa", "keywords": ["couch"]}]),
        encoding="utf-8")
    (fe / "static" / "mdi" / "iconMetadata.json").write_text(
        json.dumps({"version": "7.4.47", "parts": []}), encoding="utf-8")
    mtab2 = _mdi_source(www, fe)
    check("mdi: every CHUNK merges (not just the biggest file)",
          mtab2 and mtab2["sofa"][1] == "M2 2h2v2z"
          and mtab2["projector"][1] == "M4 4h4v4z")
    check("mdi: the index and metadata files are not icons",
          "version" not in mtab2 and "parts" not in mtab2)

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

    # ---- 6. THE RESOLVER + MINT (2026-09-01 — Suresh: "live preview
    # in the studio and then mint into the deployed artifacts") ----
    rr = resolve_icons(["phu:sonos", "phu:nope", "hue:bulb",
                        "mdi:sofa", "material:tv", "junk"],
                       www, frontend=fe)
    check("resolve: found entries carry viewBox + path",
          rr["found"]["phu:sonos"] == {"viewBox": "0 0 24 24",
                                       "path": "M9 9h9v9z"}
          and rr["found"]["mdi:sofa"]["path"] == "M2 2h2v2z")
    check("resolve: a pack without the name reports missing",
          rr["missing"] == ["phu:nope"])
    check("resolve: an uninstalled set reports no_source",
          rr["no_source"] == ["hue"])
    check("resolve: the font and non-refs are ignored",
          "material:tv" not in rr["found"] and "junk" not in rr["found"])
    mm = mint_icon_paths(cfg, www, frontend=fe)
    check("mint: every referenced, resolvable icon is in the map",
          sorted(mm["found"]) == ["mdi:sofa", "phu:plex_2", "phu:sonos"])
    check("mint: unresolvable refs report, never raise",
          mm["no_source"] == ["hue"] and mm["missing"] == [])

    # ---- 7. AUTOCOMPLETE (2026-09-01 — "when I start typing phu: I
    # get the same dropdown … material:" — names + path data, prefix
    # matches ranked first) ----
    ls = list_icons("phu", "s", www, frontend=fe)
    check("list: the fragment filters the pack",
          [i["name"] for i in ls["icons"]] == ["sonos"])
    check("list: every row carries its path data for the preview",
          ls["icons"][0]["path"] == "M9 9h9v9z"
          and ls["icons"][0]["viewBox"] == "0 0 24 24")
    check("list: an uninstalled set says no_source",
          list_icons("hue", "", www, frontend=fe)["no_source"] is True)
    check("list: empty fragment lists the pack (capped)",
          len(list_icons("phu", "", www, frontend=fe)["icons"]) == 2)

# ---- 8. CROSS-SET SEARCH + THE CUSTOM-SET BRIDGE (2026-09-02 —
# his HA tile-card screenshot: "The search starts from the first key
# across multiple icon sets") ----
from harmonium.icons import save_resolved, search_icons  # noqa: E402

with tempfile.TemporaryDirectory() as td:
    www = Path(td) / "www"
    mod = www / "community" / "custom-brand-icons"
    mod.mkdir(parents=True)
    (mod / "pack.js").write_text(
        'var i={"door_open":[0,0,24,24,"M1 1h1z"],'
        '"panel_door_open":[0,0,24,24,"M2 2h2z"],'
        '"sonos":[0,0,24,24,"M3 3h3z"]};', encoding="utf-8")
    fe = Path(td) / "hass_frontend"
    (fe / "static" / "mdi").mkdir(parents=True)
    (fe / "static" / "mdi" / "a.json").write_text(
        json.dumps({"door-open": "M4 4h4z", "door-closed": "M5 5h5z",
                    "sofa": "M6 6h6z"}), encoding="utf-8")

    sr = search_icons("door", www, frontend=fe)
    got = [(i["set"], i["name"]) for i in sr["icons"]]
    check("search: one query hits every installed set",
          ("mdi", "door-open") in got and ("phu", "door_open") in got)
    check("search: sets interleave — the small pack is not drowned",
          {s for s, _ in got[:2]} == {"mdi", "phu"})
    check("search: prefix matches lead inside each set",
          got.index(("phu", "door_open")) < got.index(("phu", "panel_door_open")))
    check("search: rows carry path data for the preview",
          all(i["path"] and i["viewBox"] for i in sr["icons"]))
    check("search: hyphen/underscore agnostic (mdi habit finds phu names)",
          ("phu", "door_open") in
          [(i["set"], i["name"]) for i in
           search_icons("door-o", www, frontend=fe)["icons"]])
    check("search: empty query = just the installed-set roster",
          search_icons("", www, frontend=fe)["icons"] == []
          and search_icons("", www, frontend=fe)["sets"] == ["mdi", "phu"])

    # the bridge: studio-resolved custom-set icons persist as files…
    sv = save_resolved({
        "fa6-solid:door-open": {"viewBox": "0 0 512 512", "path": "M7 7h7z"},
        "fa6-solid:bad": {"viewBox": "0 0 24 24",
                          "path": 'M1<script>"onload'},
        "material:tv": {"viewBox": "0 0 24 24", "path": "M8 8h8z"},
    }, www)
    f = www / "harmonium" / "icons" / "fa6-solid" / "door-open.svg"
    check("save: a resolved custom icon lands as a distilled file",
          sv["written"] == ["fa6-solid:door-open"] and f.is_file()
          and 'viewBox="0 0 512 512"' in f.read_text("utf-8"))
    check("save: junk path data and the font are rejected, never written",
          sorted(sv["rejected"]) == ["fa6-solid:bad", "material:tv"]
          and not (www / "harmonium" / "icons" / "material").exists())

    # …then resolve, mint, autocomplete, and search server-side
    cfg2 = {"screens": {"p": {"sections": [{"tiles": [
        {"id": "t", "icon": "fa6-solid:door-open"}]}]}}}
    rr2 = resolve_icons(["fa6-solid:door-open"], www, frontend=fe)
    check("saved set resolves from disk (no python source needed)",
          rr2["found"]["fa6-solid:door-open"]["path"] == "M7 7h7z"
          and rr2["no_source"] == [])
    mm2 = mint_icon_paths(cfg2, www, frontend=fe)
    check("saved set MINTS into the deployed config",
          mm2["found"]["fa6-solid:door-open"]["viewBox"] == "0 0 512 512")
    ls2 = list_icons("fa6-solid", "door", www, frontend=fe)
    check("saved set autocompletes when its prefix is typed",
          [i["name"] for i in ls2["icons"]] == ["door-open"]
          and ls2["no_source"] is False)
    sr2 = search_icons("door", www, frontend=fe)
    check("saved set joins the cross-set search",
          ("fa6-solid", "door-open") in
          [(i["set"], i["name"]) for i in sr2["icons"]])

    # ownership: a hand-replaced file in the saved set is FROZEN
    f.write_text("<svg>users own art</svg>", encoding="utf-8")
    sv2 = save_resolved({"fa6-solid:door-open":
                         {"viewBox": "0 0 512 512", "path": "M9 9h9z"}}, www)
    check("save: a hand-replaced SVG is never overwritten",
          sv2["written"] == [] and "users own art" in f.read_text("utf-8"))

# ---- 9. THE custom_icons NORMALIZER (round 4 — his fa6-solid:
# icons come from thomasloven's hass-custom_icons, a python service
# in the same process; api.py asks it directly and this function
# turns its IconData into our (viewBox, path) or an honest None) ----
from harmonium.icons import ci_icon_to_path  # noqa: E402

check("ci: fapro shape (viewBox + path)",
      ci_icon_to_path({"viewBox": "0 0 512 512", "path": "M1 1h1z"})
      == ("0 0 512 512", "M1 1h1z"))
check("ci: a duotone path2 concatenates as subpaths",
      ci_icon_to_path({"viewBox": "0 0 512 512", "path": "M1 1h1z",
                       "path2": "M2 2h2z"})
      == ("0 0 512 512", "M1 1h1z M2 2h2z"))
check("ci: iconify body of pure paths extracts, box from l/t/w/h",
      ci_icon_to_path({"left": 0, "top": 0, "width": 24, "height": 24,
                       "body": '<path fill="currentColor" d="M3 3h3z"/>'})
      == ("0 0 24 24", "M3 3h3z"))
check("ci: multiple body paths concatenate",
      ci_icon_to_path({"width": 16, "height": 16,
                       "body": '<path d="M1 1z"/><path d="M2 2z"/>'})
      == ("0 0 16 16", "M1 1z M2 2z"))
check("ci: a body with non-path elements is honestly None",
      ci_icon_to_path({"width": 16, "height": 16,
                       "body": '<g><path d="M1 1z"/></g>'}) is None)
check("ci: a transformed icon is honestly None (would render wrong)",
      ci_icon_to_path({"viewBox": "0 0 24 24", "path": "M1 1z",
                       "rotate": 2}) is None)
check("ci: junk path data is refused",
      ci_icon_to_path({"body": '<path d="M1<script>z"/>'}) is None)
check("ci: not-a-dict is None", ci_icon_to_path(None) is None)

print(("\nicon-distill: FAIL " + str(fails)) if fails
      else "\nicon-distill: ALL PASS")
raise SystemExit(1 if fails else 0)
