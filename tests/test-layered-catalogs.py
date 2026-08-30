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

# ---- 6. DERIVED dialects (2026-08-30 — "clone the FireTV, edit the
# dpad stuff, call it FireTV-SE") — deltas over the SHIPPED parent ----
duser = {
    "dialects": {
        "firetv_se": {
            "derived_from": "firetv",
            "name": "FireTV-SE",
            "dpad_commands": {"up": {"service": "androidtv.adb_command",
                                     "entity": "$context.media_player",
                                     "data": {"command": "sendevent ..."}}},
            "apps": {"prime": {"source": "SE-EDITED"}, "netflix": None,
                     "sky": {"source": "uk.sky"}},
        },
        # user ALSO tombstones the parent — must not affect the derivative
        "firetv": None,
    },
}
_, ddial = C.merge_catalogs(STOCK, None, duser["dialects"])
se = ddial.get("firetv_se") or {}
check("derived: resolves against the shipped parent",
      "firetv_se" in ddial and se.get("wake")
      == STOCK["dialects"]["firetv"].get("wake"))
check("derived: parent's untouched apps flow through",
      (se.get("apps") or {}).get("hulu")
      == STOCK["dialects"]["firetv"]["apps"]["hulu"])
check("derived: the delta wins", se["apps"]["prime"] == {"source": "SE-EDITED"})
check("derived: its tombstone holds", "netflix" not in se["apps"])
check("derived: its addition present", se["apps"]["sky"] == {"source": "uk.sky"})
check("derived: dpad delta (action object) wins whole",
      se["dpad_commands"]["up"]["service"] == "androidtv.adb_command")
check("derived: the marker survives the merge",
      se.get("derived_from") == "firetv")
check("derived: name delta wins", se.get("name") == "FireTV-SE")
check("derived: tombstoning the PARENT hides the parent only",
      "firetv" not in ddial and "firetv_se" in ddial)

# unknown / non-stock parent → the entry is the user's own, untouched
_, udial = C.merge_catalogs(STOCK, None, {
    "solo": {"derived_from": "no_such_platform", "name": "Solo"}})
check("derived: unknown parent passes through unchanged (one level deep)",
      udial["solo"] == {"derived_from": "no_such_platform", "name": "Solo"})

# subtract: an effective derivative reduces to deltas + marker
eff_cfg = {"dialects": dict(ddial)}
layer = C.subtract_config(STOCK, copy.deepcopy(eff_cfg))
lse = (layer.get("dialects") or {}).get("firetv_se") or {}
check("derived subtract: marker kept", lse.get("derived_from") == "firetv")
check("derived subtract: equal fields drop (wake follows the parent)",
      "wake" not in lse and "wake_delay" not in lse)
check("derived subtract: only the deltas remain in apps",
      set((lse.get("apps") or {})) == {"prime", "netflix", "sky"}
      and lse["apps"]["netflix"] is None)
check("derived subtract: dpad delta kept",
      "up" in (lse.get("dpad_commands") or {}))
# round-trip stability: merge(subtract(effective)) == effective
_, ddial2 = C.merge_catalogs(STOCK, None, layer["dialects"])
check("derived round-trip is stable",
      C.unit_fp(ddial2.get("firetv_se")) == C.unit_fp(se))

# ---- fingerprint parity guard --------------------------------------
ok = all(C.unit_fp(STOCK["dialects"]["firetv"]["apps"][a])
         in (HISTORY.get("dialect_apps", {}).get("firetv", {}).get(a) or [])
         for a in STOCK["dialects"]["firetv"]["apps"])
check("python fingerprints appear in the JS-generated history "
      "(stringify parity)", ok)

print(("\nlayered-catalogs: FAIL " + str(fails)) if fails
      else "\nlayered-catalogs: ALL PASS")
raise SystemExit(1 if fails else 0)
