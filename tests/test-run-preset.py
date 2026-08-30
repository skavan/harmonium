"""harmonium.run_preset (v0.85.8 — the beta ask: "a service to call
the preset directly… The nice thing about the preset is the
`Belongs to activity` association").

Pure-python test with a stubbed homeassistant, same harness as
test-set-activity-start.py: services.py is imported with
homeassistant.* replaced by minimal fakes, then the registered
run_preset handler is driven directly. Pins:
  1. activity NOT running → select flips FIRST, the activity's Start
     ref runs through the one shared runner, then the preset's action
     fires with its data passed VERBATIM (nested `media:` included);
  2. activity ALREADY running → no flip, no Start — the action still
     fires (skip-if-running: engine parity, and the documented
     difference from set_activity start:true);
  3. a script.* Start ref goes to script.turn_on (shared wiring);
  4. `$context.*` targets resolve from the activity's context map;
     an unwired key errors loudly, naming the key;
  5. workspace omitted = owner search — single owner resolves,
     unknown id errors, an id in two workspaces demands workspace:;
  6. browse/empty presets (no service, no sequence) error — they can
     only be tapped on a remote;
  7. a sequence action runs through the shared sequence runner;
  8. tiles inside sections[].tiles are found (not just flat tiles),
     and a preset with no activity fires without touching selects.
"""
import asyncio
import importlib.util
import json
import sys
import types
from pathlib import Path

# ---- minimal homeassistant stubs ----------------------------------
def _module(name):
    m = types.ModuleType(name)
    sys.modules[name] = m
    return m

ha = _module("homeassistant")
core = _module("homeassistant.core")
exc = _module("homeassistant.exceptions")
helpers = _module("homeassistant.helpers")
cv_mod = _module("homeassistant.helpers.config_validation")
script_mod = _module("homeassistant.helpers.script")
import voluptuous as vol  # real, tiny, already a HA dep on dev boxes


class HomeAssistantError(Exception):
    pass


exc.HomeAssistantError = HomeAssistantError
core.HomeAssistant = object
core.ServiceCall = object
core.callback = lambda f: f
cv_mod.string = str
cv_mod.boolean = bool
cv_mod.SCRIPT_SCHEMA = lambda x: x

RUN_LOG = []


class Script:  # records instead of executing
    def __init__(self, hass, actions, name, domain, script_mode=None):
        self.actions, self.name = actions, name

    async def async_run(self, context=None):
        RUN_LOG.append(("script_engine", self.name, self.actions))


script_mod.Script = Script

# ---- stub the sibling modules (they drag the rest of HA) ----------
pkg = _module("custom_components")
pkg.__path__ = []
hpkg = _module("custom_components.harmonium")
# catalogs.py is PURE (no HA imports) — resolve it from the real
# package dir; the HA-touching siblings are stubbed above and
# sys.modules wins over the path search
hpkg.__path__ = [str(Path(__file__).resolve().parents[1]
                     / "custom_components/harmonium")]
api_stub = _module("custom_components.harmonium.api")
api_stub.validate_config = lambda cfg: []
const_stub = _module("custom_components.harmonium.const")
const_stub.DEPLOY_PATH = "www/harmonium"
const_stub.DOMAIN = "harmonium"
store_stub = _module("custom_components.harmonium.store")
store_stub.BACKUP_FILE = "backup.json"
store_stub.HarmoniumStore = object
store_stub.read_json = lambda *a: {}
store_stub.write_json = lambda *a: None
ws_stub = _module("custom_components.harmonium.workspaces")
ws_stub.MAIN = "main"
ws_stub.merge3 = lambda *a: {}

# ---- load services.py against the stubs ---------------------------
here = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "custom_components.harmonium.services",
    str(here / "custom_components/harmonium/services.py"))
svc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(svc)

fails = []


def check(name, cond):
    print(("ok  " if cond else "FAIL") + " " + name)
    if not cond:
        fails.append(name)


# ---- fixtures ------------------------------------------------------
# The three presets are the beta user's real ones (egoFM radio,
# Mix der Woche playlist, Das Erste TV channel) — the acceptance
# cases the service was built against.
EGOFM_DATA = {"media_id": "library://radio/3", "media_type": "radio"}
ERSTE_DATA = {"media": {"media_content_id": "allsat/10006",
                        "media_content_type": "channel"}}
CONFIG = {
    "activities": {
        "wohnzimmer_musik_hoeren": {
            "name": "Musik hören", "room_view": "room",
            "start": "sequence:music_on"},
        "wohnzimmer_fernsehen": {
            "name": "Fernsehen", "room_view": "room",
            "start": "script.tv_on",
            "context": {"player": "media_player.philips_tv"}},
    },
    "sequences": {
        "music_on": {"name": "Music on", "actions": [
            {"action": "media_player.turn_on",
             "data": {"entity_id": "media_player.audio_wohnzimmer"}}]},
        "surprise": {"name": "Surprise mix", "actions": [
            {"action": "media_player.shuffle_set",
             "data": {"entity_id": "media_player.audio_wohnzimmer"}}]},
    },
    "screens": {
        "home": {"tiles": [
            {"id": "tile_egofm", "type": "preset", "label": "egoFM",
             "activity": "wohnzimmer_musik_hoeren",
             "action": {"service": "music_assistant.play_media",
                        "entity": "media_player.audio_wohnzimmer",
                        "data": EGOFM_DATA}},
            {"id": "tile_erste", "type": "preset", "label": "Das Erste",
             "activity": "wohnzimmer_fernsehen",
             "action": {"service": "media_player.play_media",
                        "entity": "media_player.philips_tv",
                        "data": ERSTE_DATA}},
            {"id": "tile_ctx", "type": "preset", "label": "Context TV",
             "activity": "wohnzimmer_fernsehen",
             "action": {"service": "media_player.play_media",
                        "target": "$context.player",
                        "data": ERSTE_DATA}},
            {"id": "tile_unwired", "type": "preset",
             "activity": "wohnzimmer_fernsehen",
             "action": {"service": "media_player.play_media",
                        "target": "$context.projector",
                        "data": {}}},
            {"id": "tile_browse", "type": "preset", "label": "Browse",
             "activity": "wohnzimmer_musik_hoeren",
             "action": {"browse": "library://"}},
            {"id": "tile_dup", "type": "preset",
             "action": {"service": "light.turn_on",
                        "entity": "light.duplicated"}},
        ]},
        "music": {"sections": [{"name": "Mixes", "tiles": [
            {"id": "tile_mix", "type": "preset", "label": "Mix der Woche",
             "activity": "wohnzimmer_musik_hoeren",
             "action": {"service": "music_assistant.play_media",
                        "entity": "media_player.audio_wohnzimmer",
                        "data": {"media_id": "library://playlist/235",
                                 "media_type": "playlist"}}},
            {"id": "tile_seq", "type": "preset", "label": "Surprise",
             "action": {"sequence": "surprise"}},
        ]}]},
    },
}
GUEST = {
    "activities": {},
    "screens": {"home": {"tiles": [
        {"id": "tile_dup", "type": "preset",
         "action": {"service": "light.turn_on",
                    "entity": "light.guest"}},
    ]}},
}


class Store:
    async def get_ws(self, ws):
        return {"main": CONFIG, "guest": GUEST}.get(ws)

    async def load(self):
        return {"workspaces": {"main": CONFIG, "guest": GUEST}}


class Select:
    def __init__(self):
        self.current_option = "off"
        self.flips = []

    async def async_select_option(self, opt):
        self.flips.append(opt)
        self.current_option = opt


class Services:
    def __init__(self):
        self.registered, self.calls = {}, []

    def async_register(self, domain, name, handler, schema=None):
        self.registered[name] = (handler, schema)

    async def async_call(self, domain, service, data,
                         blocking=False, target=None, context=None):
        self.calls.append((domain + "." + service, data, target))

    def async_remove(self, *a):
        pass


class Hass:
    def __init__(self):
        self.services = Services()


class Call:
    def __init__(self, **data):
        self.data = data
        self.context = None


def boom(coro):
    """Run a coroutine expected to raise; return the error message."""
    try:
        go(coro)
        return None
    except HomeAssistantError as e:
        return str(e)


hass = Hass()
select = Select()
entry_data = {"selects": {("main", "room"): select}}
svc.register_services(hass, Store(), entry_data, mint=None)
run_preset = hass.services.registered["run_preset"][0]
loop = asyncio.new_event_loop()
go = lambda coro: loop.run_until_complete(coro)

# ---- 1. activity not running: flip → Start → fire, data verbatim ---
RUN_LOG.clear()
go(run_preset(Call(preset="tile_egofm", workspace="main")))
check("select flipped to the preset's activity",
      select.flips == ["wohnzimmer_musik_hoeren"])
check("activity Start sequence ran through the shared runner",
      len(RUN_LOG) == 1 and RUN_LOG[0][1] == "Harmonium: Music on")
check("preset action fired with entity as target",
      hass.services.calls and hass.services.calls[-1][0]
      == "music_assistant.play_media"
      and hass.services.calls[-1][2]
      == {"entity_id": "media_player.audio_wohnzimmer"})
check("data passed verbatim", hass.services.calls[-1][1] == EGOFM_DATA)
check("data is a copy, not the stored tile's dict",
      hass.services.calls[-1][1] is not EGOFM_DATA)

# ---- 2. activity already running: no flip, no Start, still fires ---
RUN_LOG.clear()
select.flips.clear()
hass.services.calls.clear()
go(run_preset(Call(preset="tile_egofm", workspace="main")))
check("running activity skipped: no flip", select.flips == [])
check("running activity skipped: no Start", RUN_LOG == [])
check("action still fired",
      [c[0] for c in hass.services.calls] == ["music_assistant.play_media"])

# ---- 3. script Start ref + nested media data verbatim --------------
RUN_LOG.clear()
select.flips.clear()
hass.services.calls.clear()
select.current_option = "wohnzimmer_musik_hoeren"
go(run_preset(Call(preset="tile_erste", workspace="main")))
check("switching activities: select flipped",
      select.flips == ["wohnzimmer_fernsehen"])
check("script Start ref called as script.turn_on",
      ("script.turn_on", {"entity_id": "script.tv_on"}, None)
      in hass.services.calls)
check("nested media: payload verbatim",
      hass.services.calls[-1][0] == "media_player.play_media"
      and hass.services.calls[-1][1] == ERSTE_DATA)
check("Start ran before the preset fired",
      [c[0] for c in hass.services.calls]
      == ["script.turn_on", "media_player.play_media"])

# ---- 4. $context resolution + loud unwired error -------------------
hass.services.calls.clear()
select.current_option = "wohnzimmer_fernsehen"
go(run_preset(Call(preset="tile_ctx", workspace="main")))
check("$context.player resolved from the activity's context",
      hass.services.calls[-1][2] == {"entity_id": "media_player.philips_tv"})
err = boom(run_preset(Call(preset="tile_unwired", workspace="main")))
check("unwired $context key errors, naming the key",
      err is not None and "projector" in err)

# ---- 5. owner search: resolve, unknown, ambiguous ------------------
hass.services.calls.clear()
select.current_option = "wohnzimmer_musik_hoeren"
go(run_preset(Call(preset="tile_erste")))  # no workspace: single owner
check("workspace omitted: single owner found and fired",
      "media_player.play_media" in [c[0] for c in hass.services.calls])
err = boom(run_preset(Call(preset="tile_nope")))
check("unknown preset id errors", err is not None and "tile_nope" in err)
err = boom(run_preset(Call(preset="tile_dup")))
check("id in two workspaces demands workspace:",
      err is not None and "workspace" in err and "guest" in err)
hass.services.calls.clear()
go(run_preset(Call(preset="tile_dup", workspace="guest")))
check("workspace: disambiguates the duplicate",
      hass.services.calls[-1] == ("light.turn_on", {},
                                  {"entity_id": "light.guest"}))

# ---- 6. browse/empty presets error ---------------------------------
err = boom(run_preset(Call(preset="tile_browse", workspace="main")))
check("browse preset errors (no runnable action)",
      err is not None and "tapped" in err)

# ---- 7. sequence action runs through the shared runner -------------
RUN_LOG.clear()
go(run_preset(Call(preset="tile_seq", workspace="main")))
check("sequence preset ran the sequence",
      len(RUN_LOG) == 1 and RUN_LOG[0][1] == "Harmonium: Surprise mix")

# ---- 8. sections[].tiles found; no-activity preset touches nothing -
select.flips.clear()
RUN_LOG.clear()
hass.services.calls.clear()
select.current_option = "off"
go(run_preset(Call(preset="tile_mix", workspace="main")))
check("preset inside sections[].tiles found (and started its activity)",
      select.flips == ["wohnzimmer_musik_hoeren"]
      and hass.services.calls[-1][1]["media_id"] == "library://playlist/235")
select.flips.clear()
RUN_LOG.clear()
go(run_preset(Call(preset="tile_seq", workspace="main")))
check("preset without an activity leaves selects alone",
      select.flips == [] and len(RUN_LOG) == 1)

print(("\nrun-preset: FAIL " + str(fails)) if fails
      else "\nrun-preset: ALL PASS")
raise SystemExit(1 if fails else 0)
