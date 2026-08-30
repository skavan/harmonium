#!/usr/bin/env python3
"""Integration split smoke (v0.83.11): __init__.py became
store.py / api.py / services.py / wiring. Home Assistant isn't
importable outside HA, so this stubs the handful of HA modules the
package touches, imports every module for real, and then exercises
the pure seams: validate_config against the real fixture (and a
broken config), _bind_ws's workspace stamping, and the
register/remove service wiring. Run: python3 tests/test-integration-split.py
"""
import json
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def stub(name, **attrs):
    m = sys.modules.get(name) or types.ModuleType(name)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m
    return m


class _View:            # HomeAssistantView stand-in
    def json(self, *a, **k): ...
    def json_message(self, *a, **k): ...


ha = stub("homeassistant")
stub("homeassistant.core", HomeAssistant=object, ServiceCall=object)
stub("homeassistant.config_entries", ConfigEntry=object)
stub("homeassistant.exceptions", HomeAssistantError=Exception)
comp = stub("homeassistant.components", frontend=stub("homeassistant.components.frontend"),
            persistent_notification=stub("homeassistant.components.persistent_notification",
                                         async_create=lambda *a, **k: None,
                                         async_dismiss=lambda *a, **k: None))
stub("homeassistant.components.http", HomeAssistantView=_View, StaticPathConfig=object)
helpers = stub("homeassistant.helpers")
stub("homeassistant.helpers.config_validation", string=str, boolean=bool,
     SCRIPT_SCHEMA=lambda x: x)
stub("homeassistant.helpers.script", Script=object)
stub("homeassistant.helpers.storage", Store=object)
stub("homeassistant.helpers.entity", Entity=object)
stub("homeassistant.helpers.restore_state", RestoreEntity=object)


class _Schema:
    def __init__(self, *a, **k): ...


vol = stub("voluptuous", Schema=_Schema, Required=lambda *a, **k: None,
           Optional=lambda *a, **k: None, Invalid=Exception)
stub("aiohttp", web=stub("aiohttp.web", Request=object, Response=object,
                         json_response=lambda *a, **k: None))

sys.path.insert(0, str(ROOT / "custom_components"))
ok, fail = [], []


def check(name, cond):
    (ok if cond else fail).append(name)


# ---- every module imports for real ----
import harmonium                      # noqa: E402
from harmonium import api, services, store   # noqa: E402

check("setup entry exists", callable(getattr(harmonium, "async_setup_entry", None)))
check("unload entry exists", callable(getattr(harmonium, "async_unload_entry", None)))
check("views live in api", all(hasattr(api, v) for v in (
    "HarmoniumConfigView", "HarmoniumWorkspacesView",
    "HarmoniumUploadView", "HarmoniumEngineVersionView")))
check("one validator, shared", harmonium.validate_config is api.validate_config
      and services.validate_config is api.validate_config)
check("store owns the fingerprint", api.engine_fingerprint is store.engine_fingerprint)

# ---- validate_config: the real fixture must pass, a broken one must not ----
fixture = json.loads((ROOT / "dist" / "config.json").read_text())
check("fixture validates clean", api.validate_config(fixture) == [])
broken = json.loads(json.dumps(fixture))
broken["home_screen"] = "no_such_screen"
broken["activities"]["watch_firetv"]["screen"] = "also_missing"
probs = api.validate_config(broken)
check("broken config caught", len(probs) >= 2
      and any("home_screen" in p for p in probs)
      and any("watch_firetv" in p for p in probs))

# ---- _bind_ws: stamps ws onto nested harmonium steps, leaves named ones ----
actions = [
    {"action": "harmonium.set_activity", "data": {"activity": "x"}},
    {"if": [], "then": [{"service": "harmonium.run",
                         "data": {"sequence": "s", "workspace": "deck"}}]},
    {"action": "light.turn_on"},
]
services._bind_ws(actions, "porch")
check("bind_ws stamps unnamed", actions[0]["data"]["workspace"] == "porch")
check("bind_ws honors named", actions[1]["then"][0]["data"]["workspace"] == "deck")
check("bind_ws skips others", "data" not in actions[2])

# ---- wire_activity_selects (v0.86 — the Deck/Porch wrong-room bug):
# every activity-owning room page gets its minted select on the DEPLOY
# copy, so the engine's roomActivitySelect() never falls through to the
# global select for another room's controller ----
from harmonium.workspaces import wire_activity_selects  # noqa: E402

_wcfg = {
    "home_screen": "porch",
    "global": {"activity_select": "select.harmonium_porch_activity",
               "main_home": "home"},
    "screens": {"porch": {"type": "hub", "room": True},
                "deck": {"type": "hub", "room": True},
                "home": {"type": "hub"},
                "lonely": {"type": "hub", "room": True}},
    "activities": {"pw": {"room_view": "porch"},
                   "dw": {"room_view": "deck"},
                   "dm": {"room_view": "deck"}},
}
_w = wire_activity_selects(json.loads(json.dumps(_wcfg)), "main")
check("wire: porch gets its legacy-id select",
      _w["screens"]["porch"]["activity_select"]
      == "select.harmonium_porch_activity")
check("wire: deck gets its minted select",
      _w["screens"]["deck"]["activity_select"]
      == "select.harmonium_deck_activity")
check("wire: main_home is never wired",
      "activity_select" not in _w["screens"]["home"])
check("wire: activity-less sticky host is never wired",
      "activity_select" not in _w["screens"]["lonely"])
_w2 = wire_activity_selects(json.loads(json.dumps(_wcfg)), "scratch")
check("wire: non-main workspace ids carry the prefix",
      _w2["screens"]["deck"]["activity_select"]
      == "select.harmonium_scratch_deck_activity")
_wcfg["screens"]["deck"]["activity_select"] = "input_select.legacy"
_w3 = wire_activity_selects(json.loads(json.dumps(_wcfg)), "main")
check("wire: an explicit select is never overridden",
      _w3["screens"]["deck"]["activity_select"] == "input_select.legacy")

# ---- service wiring: register 4, remove 4 ----
class FakeServices:
    def __init__(self): self.reg = {}
    def async_register(self, domain, name, fn, schema=None): self.reg[name] = fn
    def async_remove(self, domain, name): self.reg.pop(name, None)


class FakeHass:
    def __init__(self): self.services = FakeServices()


h = FakeHass()
services.register_services(h, hstore=None, entry_data={}, mint=None)
check("five services registered",
      set(h.services.reg)
      == {"run", "reseed", "restore_backup", "set_activity", "run_preset"})
services.remove_services(h)
check("remove mirrors register", h.services.reg == {})

print(f"integration-split: {len(ok)} ok / {len(fail)} FAIL"
      + (" — " + "; ".join(fail) if fail else ""))
sys.exit(1 if fail else 0)
