"""Layered catalogs (v0.86.0 — the spread model, Suresh: "My master
list should propagate… a user's list should spread over it, so the
final list is my list (...users list)").

Pure-python tests of catalogs.py against the REAL shipped stock
(starter-config.json) and the REAL generated history
(catalog-history.json). Pins:
  1. merge grain — apps per entry; dialects two-level (sub-catalogs
     per entry, scalars per field); tombstones at every level;
  2. order — stock first, user additions after, forks in place;
  3. subtract — the never-write-merged contract: forks/additions/
     deletions round-trip, untouched dialects vanish from the layer,
     an absent catalog key makes no statement, merge∘subtract stable;
  4. lift-out — shipped shapes lift (any generation), edits stay as
     forks, a key younger than the config ("__absent__" in history)
     writes NO tombstone, a key carried by every generation does;
  5. THE ACCEPTANCE CASE — a pre-+4 firetv config, lifted and
     re-merged, grows hulu/fubo/espn/britbox with a user's edited
     entry preserved verbatim: the reason this design exists.
"""
import copy
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "custom_components/harmonium"))
import catalogs as C  # noqa: E402

STOCK = C.stock_catalogs(HERE / "custom_components/harmonium")
HISTORY = C.load_catalog_history(HERE / "custom_components/harmonium")

fails = []


def check(name, cond):
    print(("ok  " if cond else "FAIL") + " " + name)
    if not cond:
        fails.append(name)


# ---- 1. merge grain -------------------------------------------------
user = {
    "apps": {"netflix": {"name": "My Netflix", "icon": "material:tv"},
             "zzapp": {"name": "Mine"},
             "hulu": None},
    "dialects": {
        "firetv": {"wake_delay": 900,
                   "apps": {"prime": {"source": "EDITED"},
                            "netflix": None,
                            "zz": {"source": "mine"}}},
        "tizen": None,
        "zzdial": {"name": "Mine", "apps": {"a": {"source": "x"}}},
    },
}
apps, dialects = C.merge_catalogs(STOCK, user["apps"], user["dialects"])
check("app fork wins per entry", apps["netflix"]["name"] == "My Netflix")
check("app addition present", "zzapp" in apps)
check("app tombstone drops the stock entry", "hulu" not in apps)
check("untouched apps flow from stock", apps["prime"] == STOCK["apps"]["prime"])
ft = dialects["firetv"]
check("dialect scalar per-field: wake_delay is the user's",
      ft["wake_delay"] == 900)
check("dialect scalar per-field: name still flows from stock",
      ft["name"] == STOCK["dialects"]["firetv"]["name"])
check("dialect entry fork wins", ft["apps"]["prime"] == {"source": "EDITED"})
check("dialect entry tombstone drops", "netflix" not in ft["apps"])
check("dialect entry addition present", "zz" in ft["apps"])
check("newer stock entries flow through a touched dialect",
      all(a in ft["apps"] for a in ("hulu", "fubo", "espn", "britbox")))
check("whole-dialect tombstone drops tizen", "tizen" not in dialects)
check("user's own dialect passes verbatim",
      dialects["zzdial"]["apps"]["a"] == {"source": "x"})
check("untouched stock dialects flow", "googletv" in dialects
      and dialects["googletv"] == STOCK["dialects"]["googletv"])

# ---- 2. order -------------------------------------------------------
order = list(apps.keys())
stock_order = [k for k in STOCK["apps"] if k in apps]
check("stock order first, additions after",
      order[:len(stock_order)] == stock_order and order[-1] == "zzapp")

# ---- 3. subtract (the never-write-merged contract) ------------------
eff = {"screens": {"p": {}},
       "apps": copy.deepcopy(STOCK["apps"]),
       "dialects": copy.deepcopy(STOCK["dialects"])}
del eff["dialects"]["firetv"]["apps"]["netflix"]        # deletion
eff["dialects"]["firetv"]["apps"]["prime"] = {"source": "EDITED"}
eff["dialects"]["firetv"]["apps"]["zz"] = {"source": "mine"}
eff["apps"]["disney"] = {"name": "Disney+", "icon": "material:star"}
layer = C.subtract_config(STOCK, eff)
check("fork kept in the layer",
      layer["dialects"]["firetv"]["apps"]["prime"] == {"source": "EDITED"})
check("addition kept in the layer",
      layer["dialects"]["firetv"]["apps"]["zz"] == {"source": "mine"})
check("deletion becomes a null tombstone",
      layer["dialects"]["firetv"]["apps"]["netflix"] is None)
check("untouched dialects vanish from the layer",
      "tizen" not in layer.get("dialects", {})
      and "googletv" not in layer.get("dialects", {}))
check("app identity fork kept", layer["apps"]["disney"]["icon"] == "material:star")
check("non-catalog keys pass through", layer["screens"] == {"p": {}})
merged_back = C.merge_config(STOCK, layer)
check("merge restores the effective view",
      "netflix" not in merged_back["dialects"]["firetv"]["apps"]
      and merged_back["dialects"]["firetv"]["apps"]["prime"] == {"source": "EDITED"}
      and "hulu" in merged_back["dialects"]["firetv"]["apps"])
check("merge then subtract is stable",
      C.subtract_config(STOCK, merged_back) == layer)
no_stmt = C.subtract_config(STOCK, {"screens": {}})
check("an absent catalog key makes no statement",
      "apps" not in no_stmt and "dialects" not in no_stmt)
byte_identical = {"apps": copy.deepcopy(STOCK["apps"]),
                  "dialects": copy.deepcopy(STOCK["dialects"])}
clean = C.subtract_config(STOCK, byte_identical)
check("a byte-identical effective config subtracts to nothing",
      "apps" not in clean and "dialects" not in clean)

# ---- 4. lift-out ----------------------------------------------------
# a pre-+4 config: seeded stock minus the four newer firetv entries,
# minus the firetv wake field (younger than the seed), with one edit
# and one curated deletion (netflix identity removed from apps)
pre = {"screens": {"p": {}},
       "apps": copy.deepcopy(STOCK["apps"]),
       "dialects": copy.deepcopy(STOCK["dialects"])}
del pre["apps"]["netflix"]                               # curated deletion
for a in ("hulu", "fubo", "espn", "britbox"):
    del pre["dialects"]["firetv"]["apps"][a]             # pre-+4
pre["dialects"]["firetv"].pop("wake", None)              # younger field
pre["dialects"]["firetv"]["apps"]["prime"] = {"source": "EDITED"}
lifted, report = C.lift_out(STOCK, HISTORY, pre)
check("pristine entries lift out of the layer",
      "youtube" not in (lifted.get("dialects", {})
                        .get("firetv", {}).get("apps", {})))
check("the edit stays as a fork",
      lifted["dialects"]["firetv"]["apps"]["prime"] == {"source": "EDITED"})
check("no tombstones for keys younger than the config (+4, wake)",
      all("tombstone" not in r or not any(a in r for a in
          ("hulu", "fubo", "espn", "britbox", "wake")) for r in report))
check("curated deletion of an always-shipped key tombstones",
      lifted["apps"]["netflix"] is None)
check("untouched dialects vanish entirely",
      "tizen" not in lifted.get("dialects", {}))

# ---- 5. THE ACCEPTANCE CASE ----------------------------------------
final = C.merge_config(STOCK, lifted)
fapps = final["dialects"]["firetv"]["apps"]
check("ACCEPTANCE: the four newer stock apps arrive after lift-out",
      all(a in fapps for a in ("hulu", "fubo", "espn", "britbox")))
check("ACCEPTANCE: the user's fork survives verbatim",
      fapps["prime"] == {"source": "EDITED"})
check("ACCEPTANCE: the curated deletion stays deleted",
      "netflix" not in final["apps"])
check("ACCEPTANCE: the younger wake field flows from stock",
      final["dialects"]["firetv"].get("wake")
      == STOCK["dialects"]["firetv"].get("wake"))

# ---- fingerprint parity guard --------------------------------------
ok = all(C.unit_fp(STOCK["dialects"]["firetv"]["apps"][a])
         in (HISTORY.get("dialect_apps", {}).get("firetv", {}).get(a) or [])
         for a in STOCK["dialects"]["firetv"]["apps"])
check("python fingerprints appear in the JS-generated history "
      "(stringify parity)", ok)

# ---- FP-NORM v1 (entity-controls Phase 1, the respelling ruling) ----
# Every spelling of one volume tile hashes as one form, and the three
# hexes are PINNED against ownership.js (probe-entity-phase1 asserts
# the same values from the JS twin — a drift on either side breaks
# exactly one suite, which names the twin).
# FP-NORM v2 (2026-08-31): bare volume = SLIDER (the v0.83.1 fat
# default); only an explicit slider: False is Compact.
_fpv = [
    ({"tiles": [{"id": "v", "type": "stepper", "kind": "volume",
                 "entity": "media_player.x",
                 "level_entity": "media_player.y"}]},
     {"tiles": [{"id": "v", "type": "volume", "variant": "stepper",
                 "entity": "media_player.x",
                 "level_entity": "media_player.y"}]},
     "14ba7ecd8115"),
    ({"tiles": [{"id": "v", "type": "volume", "slider": True,
                 "entity": "media_player.x"}]},
     {"tiles": [{"id": "v", "type": "volume", "variant": "slider",
                 "entity": "media_player.x"}]},
     "00ca0fa8af46"),
    ({"tiles": [{"id": "v", "type": "volume",
                 "entity": "media_player.x"}]},
     {"tiles": [{"id": "v", "type": "volume", "variant": "slider",
                 "entity": "media_player.x"}]},
     "00ca0fa8af46"),
    ({"tiles": [{"id": "v", "type": "volume", "slider": False,
                 "entity": "media_player.x"}]},
     {"tiles": [{"id": "v", "type": "volume", "variant": "compact",
                 "entity": "media_player.x"}]},
     "b6970da5a428"),
]
check("FP-NORM: legacy and canonical spellings fingerprint identically",
      all(C.controller_fp(a) == C.controller_fp(b) for a, b, _ in _fpv))
check("FP-NORM: python controller_fp matches the JS pins",
      all(C.controller_fp(a) == pin for a, _, pin in _fpv))
check("FP-NORM: non-volume tiles are untouched by the canonicalizer",
      C.fp_canon_tile({"type": "stepper", "kind": "temperature"})
      == {"type": "stepper", "kind": "temperature"})

print(("\nlayered-catalogs: FAIL " + str(fails)) if fails
      else "\nlayered-catalogs: ALL PASS")
raise SystemExit(1 if fails else 0)
