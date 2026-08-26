"""Harmonium's services — run, reseed, restore_backup, set_activity.

register_services() closes the four handlers over the store, the
entry's select registry, and the select-minting hook exactly as
async_setup_entry used to — the bodies are unchanged (split out of
__init__.py, v0.83.11)."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.script import Script

from .api import validate_config
from .const import DEPLOY_PATH, DOMAIN
from .store import BACKUP_FILE, HarmoniumStore, read_json, write_json
from .workspaces import MAIN, merge3

_LOGGER = logging.getLogger(__name__)


SERVICE_RUN_SCHEMA = vol.Schema({
    vol.Required("sequence"): cv.string,
    vol.Optional("workspace", default=MAIN): cv.string,
})
SERVICE_SET_ACTIVITY_SCHEMA = vol.Schema({
    vol.Required("activity"): cv.string,
    # start: True also RUNS the activity's Start action (v0.85.7 — the
    # wall-switch request: "the button press should activate the
    # listen-to-music activity instead of a script doing the wiring
    # manually"). For activity: "off" it runs the ending activity's
    # Stop action first. Default False keeps the old routing-only
    # behaviour for every existing caller.
    vol.Optional("start", default=False): cv.boolean,
    vol.Optional("room"): cv.string,
    # NO default (v0.47.9): an unnamed workspace means "find the
    # owner" — generated sequences and user automations shouldn't
    # have to know which workspace an activity lives in.
    vol.Optional("workspace"): cv.string,
})


def _bind_ws(node, ws: str) -> None:
    """Walk a sequence's action tree and stamp the running workspace
    onto any nested harmonium.set_activity / harmonium.run step that
    doesn't name one. The remote injects `workspace` at its socket,
    but steps executed HA-SIDE by the script engine never pass
    through that socket — so a generated Start action's set_activity
    used to default to main and 500 from any other workspace
    (v0.47.9, the deck Watch-Projector bug). Recurses into if/then/
    choose/repeat/parallel shapes via the generic dict/list walk."""
    if isinstance(node, list):
        for item in node:
            _bind_ws(item, ws)
    elif isinstance(node, dict):
        svc = node.get("action") or node.get("service")
        if svc in ("harmonium.set_activity", "harmonium.run"):
            data = node.setdefault("data", {})
            if isinstance(data, dict):
                data.setdefault("workspace", ws)
        for v in node.values():
            _bind_ws(v, ws)


def register_services(hass: HomeAssistant, hstore: HarmoniumStore,
                      entry_data: dict, mint) -> None:
    """Register the four harmonium.* services. `entry_data` is the
    entry's live dict (its selects registry); `mint` mints any missing
    activity selects for a workspace."""

    async def _run_sequence(ws: str, seq_id: str, context) -> None:
        """Execute one stored sequence with HA's script engine — the
        single runner behind harmonium.run AND set_activity's
        start/stop (v0.85.7: one orchestrator, never two)."""
        config = await hstore.get_ws(ws) or {}
        seq = (config.get("sequences") or {}).get(seq_id)
        if seq is None:
            raise HomeAssistantError(
                f"Harmonium workspace '{ws}' has no sequence '{seq_id}' — "
                "if you just created it in the Studio, Save & Deploy first: "
                "the remote, the preview's taps, and ▶ Test all run the "
                "SAVED copy (check Building blocks otherwise)"
            )
        # deep-copy before stamping — the stored config must never
        # grow baked-in workspace keys (that would break duplication)
        actions = json.loads(json.dumps(seq.get("actions") or []))
        _bind_ws(actions, ws)
        try:
            validated = cv.SCRIPT_SCHEMA(actions)
        except vol.Invalid as err:
            raise HomeAssistantError(
                f"sequence '{seq_id}' has invalid actions: {err}"
            ) from err
        script = Script(
            hass,
            validated,
            f"Harmonium: {seq.get('name', seq_id)}",
            DOMAIN,
            script_mode="restart",
        )
        _LOGGER.info("Running Harmonium sequence '%s' (ws=%s, %d actions)",
                     seq_id, ws, len(actions))
        await script.async_run(context=context)

    async def _run_action_ref(ws: str, ref: str, context) -> None:
        """An activity's start/stop ACTION REF, exactly as the engine
        resolves it (src/core/activities.js runActionRef):
        sequence:<id> → the stored sequence; anything else → a plain
        HA script entity."""
        if not ref:
            return
        if ref.startswith("sequence:"):
            await _run_sequence(ws, ref[len("sequence:"):], context)
        else:
            await hass.services.async_call(
                "script", "turn_on", {"entity_id": ref},
                blocking=False, context=context)

    async def handle_run(call: ServiceCall) -> None:
        """harmonium.run — execute a building-block SEQUENCE from the
        stored config, HA-side, with HA's own script engine (full
        delay/wait/choose semantics; remotes never run orchestration).
        `workspace` routes to the calling remote's world (default main)."""
        await _run_sequence(call.data["workspace"], call.data["sequence"],
                            call.context)

    hass.services.async_register(DOMAIN, "run", handle_run, schema=SERVICE_RUN_SCHEMA)

    async def handle_reseed(call: ServiceCall) -> None:
        """harmonium.reseed — integrate a fresh repo build (the
        DEPLOYED config.json, pushed by file copy) into the MAIN
        workspace. NON-DESTRUCTIVE (v0.37): a three-way merge against
        the repo build last integrated (the base) keeps Studio-side
        changes; repo deletions still propagate; conflicts → repo
        wins, logged. The outgoing main is snapshotted to
        config.main.backup.json first (harmonium.restore_backup =
        one-deep undo). Also re-deploys every other workspace's file
        from the store — self-healing."""
        deployed = Path(hass.config.path(DEPLOY_PATH))
        if not deployed.exists():
            raise HomeAssistantError(f"{deployed} does not exist")
        fresh = await hass.async_add_executor_job(read_json, deployed)
        data = await hstore.load()
        current = data["workspaces"].get(MAIN)
        base = data.get("base_main")

        if current is not None:
            await hass.async_add_executor_job(
                write_json, hstore.deploy_path(MAIN).with_name(BACKUP_FILE),
                current)

        if current is not None and base is not None:
            merged, conflicts = merge3(base, fresh, current)
            problems = validate_config(merged)
            if problems:
                _LOGGER.warning(
                    "Harmonium reseed: merged config invalid (%s) — "
                    "falling back to the repo build; recover Studio-side "
                    "work with harmonium.restore_backup", "; ".join(problems))
                merged = fresh
            elif conflicts:
                _LOGGER.warning(
                    "Harmonium reseed: repo won %d conflict(s): %s",
                    len(conflicts), ", ".join(conflicts))
        else:
            # first integration (no base yet): repo replaces, as before
            merged = fresh

        data["workspaces"][MAIN] = merged
        data["base_main"] = fresh            # the baseline for next time
        data["meta"].setdefault(MAIN, {"name": "Main"})
        if MAIN not in data["order"]:
            data["order"].insert(0, MAIN)
        await hstore.save(data)
        # the LIVE file must match the store — remotes get the merge too
        await hstore.deploy(MAIN, merged)
        for ws, cfg in data["workspaces"].items():
            if ws != MAIN:
                await hstore.deploy(ws, cfg)
        # MINT WHAT THE MERGE BROUGHT IN (2026-08-06). A reseed can add a
        # whole ROOM — the Games Room did — and every page that owns
        # activities needs its select.harmonium_<page>_activity. Save &
        # Deploy has always minted (the POST view calls it); reseed never
        # did, so a room arriving by file copy had no select until the
        # next restart or reload. The engine reads that select to know
        # what is running in the room, so this is not cosmetic.
        for ws, cfg in data["workspaces"].items():
            await mint(ws, cfg)
        _LOGGER.info("Harmonium main reseeded from %s (three-way merge: %s; "
                     "+%d workspace file(s) re-deployed)", deployed,
                     "yes" if base is not None and current is not None else
                     "first integration", len(data["workspaces"]) - 1)

    hass.services.async_register(DOMAIN, "reseed", handle_reseed)

    async def handle_restore_backup(call: ServiceCall) -> None:
        """harmonium.restore_backup — undo the last reseed: put the
        pre-reseed MAIN config back (store + deployed file)."""
        backup = hstore.deploy_path(MAIN).with_name(BACKUP_FILE)
        if not backup.exists():
            raise HomeAssistantError(f"{backup} does not exist — nothing to restore")
        saved = await hass.async_add_executor_job(read_json, backup)
        data = await hstore.load()
        data["workspaces"][MAIN] = saved
        await hstore.save(data)
        await hstore.deploy(MAIN, saved)
        _LOGGER.info("Harmonium main restored from %s", backup)

    hass.services.async_register(DOMAIN, "restore_backup", handle_restore_backup)

    async def handle_set_activity(call: ServiceCall) -> None:
        """harmonium.set_activity — flip the owning hub's routing select
        to an activity id ("off" ends the room). The room is inferred
        from the activity's owner (room_view) in the stored config."""
        aid = call.data["activity"]
        ws = call.data.get("workspace")
        # "OFF" ENDS THE ROOM (v0.47.6 — the docstring always promised
        # it; the activity lookup rejected it since off stopped being an
        # activity in v0.28). Optional `room` targets one hub; without
        # it every select in the workspace goes off (All-Off semantics).
        if aid == "off":
            ws = ws or MAIN
            room = call.data.get("room")
            pairs = ([((ws, room), entry_data["selects"].get((ws, room)))] if room
                     else [(k, e) for k, e in entry_data["selects"].items()
                           if k[0] == ws])
            pairs = [(k, e) for k, e in pairs if e is not None]
            if not pairs:
                raise HomeAssistantError(
                    f"no Harmonium selects for workspace '{ws}'"
                    + (f" room '{room}'" if room else "")
                    + " — reload the integration")
            # start: True on "off" = a REAL end (v0.85.7): run each
            # ending activity's Stop action, then flip its select —
            # the wall-switch toggle's other half. Without the flag,
            # routing-only as before.
            if call.data.get("start"):
                config = await hstore.get_ws(ws) or {}
                acts = config.get("activities") or {}
                for _k, ent in pairs:
                    cur = getattr(ent, "current_option", None)
                    a = acts.get(cur)
                    if a and a.get("stop"):
                        await _run_action_ref(ws, a["stop"], call.context)
            for _k, ent in pairs:
                await ent.async_select_option("off")
            return
        if ws is None:
            # FIND THE OWNER (v0.47.9): no workspace named — search
            # them all. Callers (generated sequences, user automations)
            # shouldn't need to know where an activity lives; only an
            # ambiguous id (duplicated workspaces) demands the key.
            data = await hstore.load()
            owners = [w for w, cfg in data["workspaces"].items()
                      if aid in ((cfg or {}).get("activities") or {})]
            if not owners:
                raise HomeAssistantError(
                    f"no Harmonium workspace has an activity '{aid}'")
            if len(owners) > 1:
                raise HomeAssistantError(
                    f"activity '{aid}' exists in workspaces "
                    f"{', '.join(sorted(owners))} — pass workspace: to "
                    "disambiguate")
            ws = owners[0]
        config = await hstore.get_ws(ws) or {}
        act = (config.get("activities") or {}).get(aid)
        if act is None:
            raise HomeAssistantError(
                f"Harmonium workspace '{ws}' has no activity '{aid}'")
        room = act.get("room_view")
        ent = entry_data["selects"].get((ws, room))
        if ent is None:
            raise HomeAssistantError(
                f"no Harmonium select for room '{room}' (workspace '{ws}') — "
                "reload the integration"
            )
        # THE SELECT FLIPS FIRST, start or not — engine parity ("the
        # tap IS the intent"): the room shows the activity immediately
        # and the warm start follows. The activity's own Start sequence
        # usually contains a set_activity step; by then it is a no-op.
        await ent.async_select_option(aid)
        if call.data.get("start"):
            # start: True runs the SAME wiring the remote's tap runs —
            # the activity's Start action ref, through the one shared
            # runner. A wall switch, the HA app and the panel are now
            # the same button (v0.85.7, the beta wall-switch request).
            await _run_action_ref(ws, act.get("start"), call.context)

    hass.services.async_register(
        DOMAIN, "set_activity", handle_set_activity, schema=SERVICE_SET_ACTIVITY_SCHEMA
    )


def remove_services(hass: HomeAssistant) -> None:
    """Unregister the four services — unload's mirror."""
    for svc in ("run", "reseed", "restore_backup", "set_activity"):
        hass.services.async_remove(DOMAIN, svc)
