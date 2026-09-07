"""harmonium.set_activity start: True (v0.85.7 — the wall-switch
request: "the button press should activate the listen-to-music
activity instead of an HA script doing the wiring manually").

Pure-python test with a stubbed homeassistant: services.py is imported
with homeassistant.* replaced by minimal fakes, then the registered
handlers are driven directly. Pins:
  1. start: True flips the select FIRST, then runs the activity's
     Start action ref through the ONE shared sequence runner;
  2. a script.* start ref goes to script.turn_on;
  3. start omitted/False = routing-only (every existing caller
     unchanged);
  4. activity: "off" + start: True runs the ending activity's Stop
     ref before flipping the select; without the flag, routing-only;
  5. the runner stamps workspace onto nested harmonium steps
     (_bind_ws, unchanged contract).
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


# ---- fakes ---------------------------------------------------------
CONFIG = {
    "activities": {
        "music": {"name": "Musik hören", "room_view": "room",
                  "start": "sequence:music_on", "stop": "sequence:music_stop"},
        "tv": {"name": "Fernsehen", "room_view": "room",
               "start": "script.tv_on"},
    },
    "sequences": {
        "music_on": {"name": "Music on", "actions": [
            {"action": "harmonium.set_activity", "data": {"activity": "music"}},
            {"action": "media_player.turn_on",
             "data": {"entity_id": "media_player.mp"}}]},
        "music_stop": {"name": "Music stop", "actions": [
            {"action": "media_player.turn_off",
             "data": {"entity_id": "media_player.mp"}}]},
    },
}


class Store:
    async def get_ws(self, ws):
        return CONFIG if ws == "main" else None

    async def load(self):
        return {"workspaces": {"main": CONFIG}}


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

    async def async_call(self, domain, service, data, blocking=False, context=None):
        self.calls.append((domain + "." + service, data))

    def async_remove(self, *a):
        pass


class Hass:
    def __init__(self):
        self.services = Services()


class Call:
    def __init__(self, **data):
        self.data = data
        self.context = None


hass = Hass()
select = Select()
entry_data = {"selects": {("main", "room"): select}}
svc.register_services(hass, Store(), entry_data, mint=None)
set_activity = hass.services.registered["set_activity"][0]
run = hass.services.registered["run"][0]
loop = asyncio.new_event_loop()
go = lambda coro: loop.run_until_complete(coro)

# ---- 1. start: True — select first, then the Start sequence --------
RUN_LOG.clear()
go(set_activity(Call(activity="music", start=True)))
check("select flipped to the activity", select.flips == ["music"])
check("start sequence ran through the shared runner",
      len(RUN_LOG) == 1 and RUN_LOG[0][1] == "Harmonium: Music on")
check("workspace stamped onto nested harmonium step (_bind_ws)",
      RUN_LOG[0][2][0]["data"].get("workspace") == "main")

# ---- 2. a script.* start ref goes to script.turn_on ----------------
RUN_LOG.clear()
select.flips.clear()
hass.services.calls.clear()
go(set_activity(Call(activity="tv", start=True)))
check("script start ref called as script.turn_on",
      ("script.turn_on", {"entity_id": "script.tv_on"}) in hass.services.calls)
check("no sequence ran for a script ref", RUN_LOG == [])

# ---- 3. default stays routing-only ---------------------------------
RUN_LOG.clear()
select.flips.clear()
go(set_activity(Call(activity="music")))
check("no start flag → select only", select.flips == ["music"] and RUN_LOG == [])

# ---- 4. off + start: True runs the current activity's Stop ---------
RUN_LOG.clear()
select.flips.clear()
select.current_option = "music"
go(set_activity(Call(activity="off", start=True)))
check("off+start ran the ending activity's Stop",
      len(RUN_LOG) == 1 and RUN_LOG[0][1] == "Harmonium: Music stop")
check("off+start then flipped the select off", select.flips == ["off"])

RUN_LOG.clear()
select.flips.clear()
select.current_option = "music"
go(set_activity(Call(activity="off")))
check("plain off stays routing-only", RUN_LOG == [] and select.flips == ["off"])

# ---- 5. harmonium.run still works through the same runner ----------
RUN_LOG.clear()
go(run(Call(sequence="music_on", workspace="main")))
check("harmonium.run unchanged", len(RUN_LOG) == 1 and
      RUN_LOG[0][1] == "Harmonium: Music on")

# ---- 6. run with ACTIONS = the Studio's ▶ Test (2026-09-02 ruling:
# "logically, Test should run the unsaved version which is why
# someone wants to test it in the first place") — the editor's copy
# runs verbatim, the stored one is NOT consulted, _bind_ws still
# stamps, and the id is only a label ----
RUN_LOG.clear()
DRAFT = [{"action": "harmonium.set_activity", "data": {"activity": "music"}},
         {"action": "cover.open_cover",
          "data": {"entity_id": "cover.screen"}}]
go(run(Call(sequence="music_on", workspace="main", actions=DRAFT)))
check("draft actions run verbatim (not the stored copy)",
      len(RUN_LOG) == 1 and RUN_LOG[0][2][1]["action"] == "cover.open_cover")
check("draft run stamps workspace onto nested harmonium steps",
      RUN_LOG[0][2][0]["data"].get("workspace") == "main")
check("the id labels the run", RUN_LOG[0][1] == "Harmonium: music_on")
check("the caller's draft list is NOT mutated by the stamping",
      "workspace" not in DRAFT[0]["data"])

# a brand-new draft (id not stored yet) tests fine too
RUN_LOG.clear()
go(run(Call(sequence="brand_new", workspace="main",
            actions=[{"action": "light.turn_on",
                      "data": {"entity_id": "light.x"}}])))
check("an unsaved-new sequence tests before it exists in the store",
      len(RUN_LOG) == 1 and RUN_LOG[0][1] == "Harmonium: brand_new")

# neither id nor actions = a clear error
err = None
try:
    go(run(Call(workspace="main")))
except Exception as e:
    err = str(e)
check("run with neither id nor actions raises the honest error",
      err is not None and "sequence id or an actions list" in err)

# ---- 7. AUTOMAGIC ROUTING (2026-09-02 GO: "If its an activity,
# shouldn't start and stop just be automagic? Always?") — the runner
# flips the room's select around any activity start/stop it
# executes, whoever called it ----
RUN_LOG.clear()
select.flips.clear()
select.current_option = "off"
go(run(Call(sequence="music_on", workspace="main")))
check("running a START sequence directly flips the room's select first",
      select.flips == ["music"] and len(RUN_LOG) == 1)

# already routed = no double flip
RUN_LOG.clear()
select.flips.clear()
select.current_option = "music"
go(run(Call(sequence="music_on", workspace="main")))
check("a start on an already-routed room does not re-flip",
      select.flips == [])

# stop clears the routing afterwards — guarded on still-owner
RUN_LOG.clear()
select.flips.clear()
select.current_option = "music"
go(run(Call(sequence="music_stop", workspace="main")))
check("running a STOP sequence directly clears the routing after",
      select.flips == ["off"] and len(RUN_LOG) == 1)

# the handoff law: another activity took the room — stop leaves it
RUN_LOG.clear()
select.flips.clear()
select.current_option = "tv"
go(run(Call(sequence="music_stop", workspace="main")))
check("a stop never clears a room another activity now owns",
      select.flips == [])

# the draft test gets the same automagic (ownership via the label id)
RUN_LOG.clear()
select.flips.clear()
select.current_option = "off"
go(run(Call(sequence="music_on", workspace="main",
            actions=[{"action": "light.turn_on",
                      "data": {"entity_id": "light.x"}}])))
check("testing a start DRAFT routes too", select.flips == ["music"])

# a plain sequence (no owner) routes nothing
RUN_LOG.clear()
select.flips.clear()
select.current_option = "off"
go(run(Call(sequence="brand_new", workspace="main",
            actions=[{"action": "light.turn_on",
                      "data": {"entity_id": "light.x"}}])))
check("a sequence no activity owns gets no routing", select.flips == [])

# ambiguity: two activities share one start ref → no routing, honest
CONFIG["activities"]["music2"] = {"name": "M2", "room_view": "room",
                                  "start": "sequence:music_on"}
RUN_LOG.clear()
select.flips.clear()
select.current_option = "off"
go(run(Call(sequence="music_on", workspace="main")))
check("a start shared by two activities routes neither (ambiguous)",
      select.flips == [] and len(RUN_LOG) == 1)
del CONFIG["activities"]["music2"]

# set_activity off+start still ends with ONE off flip (the runner
# cleared; the handler's flip is idempotent now)
RUN_LOG.clear()
select.flips.clear()
select.current_option = "music"
go(set_activity(Call(activity="off", start=True)))
check("off+start: the room ends with a single off flip",
      select.flips == ["off"])

print(("\nset-activity-start: FAIL " + str(fails)) if fails
      else "\nset-activity-start: ALL PASS")
raise SystemExit(1 if fails else 0)
