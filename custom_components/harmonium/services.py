"""Harmonium's services — run, reseed, restore_backup, set_activity,
run_preset.

register_services() closes the handlers over the store, the
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
from .catalogs import merge_config, subtract_config
from .const import DEPLOY_PATH, DOMAIN
from .store import BACKUP_FILE, HarmoniumStore, read_json, write_json
from .workspaces import MAIN, merge3

_LOGGER = logging.getLogger(__name__)


SERVICE_RUN_SCHEMA = vol.Schema({
    vol.Required("sequence"): cv.string,
    vol.Optional("workspace", default=MAIN): cv.string,
})
SERVICE_RUN_PRESET_SCHEMA = vol.Schema({
    # the preset TILE's id (Studio → the preset card → Advanced)
    vol.Required("preset"): cv.string,
    # NO default: an unnamed workspace means "find the owner" — same
    # doctrine as set_activity (v0.47.9)
    vol.Optional("workspace"): cv.string,
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
        # LAYERED CATALOGS (v0.86.0): the store holds the user LAYER;
        # the deployed file, the base, and the merge all live in
        # EFFECTIVE space — make current effective for the merge, and
        # subtract the result before it goes back into the store. The
        # backup file is written EFFECTIVE too, so restore_backup
        # always holds a complete standalone config.
        stock = hstore.stock()
        current = data["workspaces"].get(MAIN)
        if current is not None:
            current = merge_config(stock, current)
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

        data["workspaces"][MAIN] = subtract_config(stock, merged)
        data["base_main"] = fresh            # the baseline for next time
        data["meta"].setdefault(MAIN, {"name": "Main"})
        if MAIN not in data["order"]:
            data["order"].insert(0, MAIN)
        await hstore.save(data)
        # the LIVE file must match the store — remotes get the merge too
        await hstore.deploy(MAIN, merged)
        for ws, cfg in data["workspaces"].items():
            if ws != MAIN:
                await hstore.deploy(ws, merge_config(stock, cfg))
        # MINT WHAT THE MERGE BROUGHT IN (2026-08-06). A reseed can add a
        # whole ROOM — the Games Room did — and every page that owns
        # activities needs its select.harmonium_<page>_activity. Save &
        # Deploy has always minted (the POST view calls it); reseed never
        # did, so a room arriving by file copy had no select until the
        # next restart or reload. The engine reads that select to know
        # what is running in the room, so this is not cosmetic.
        for ws, cfg in data["workspaces"].items():
            await mint(ws, merge_config(stock, cfg))
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
        # the backup holds an EFFECTIVE config (see reseed) — subtract
        # at the boundary; the deployed file stays effective
        data["workspaces"][MAIN] = subtract_config(hstore.stock(), saved)
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

    def _find_preset(config: dict, pid: str):
        """The preset tile with this id, wherever it was authored —
        screens and controllers, flat `tiles` and `sections[].tiles`.
        Generated presets (favorites via presets_from) are minted by
        the ENGINE at render time and never live in the stored
        config, so they are not addressable here — by design."""
        for coll in ("screens", "controllers"):
            for scr in (config.get(coll) or {}).values():
                groups = [scr.get("tiles") or []]
                for sec in (scr.get("sections") or []):
                    groups.append(sec.get("tiles") or [])
                for g in groups:
                    for t in g:
                        if (isinstance(t, dict) and t.get("id") == pid
                                and t.get("type") == "preset"):
                            return t
        return None

    async def handle_run_preset(call: ServiceCall) -> None:
        """harmonium.run_preset — fire a preset exactly as a tap on
        its tile does (v0.85.8, the beta ask: "a service to call the
        preset directly… The nice thing about the preset is the
        `Belongs to activity` association"). In order: ensure the
        preset's activity (start it ONLY if it isn't already running —
        engine parity, and unlike set_activity start:true, which runs
        Start unconditionally), then fire the preset's action with its
        data passed VERBATIM (the nested `media:` shape included).
        Engine features that need a panel — navigate landings, the
        two-step confirm, wake-the-screen — don't apply here."""
        pid = call.data["preset"]
        ws = call.data.get("workspace")
        if ws is None:
            data = await hstore.load()
            owners = [w for w, cfg in data["workspaces"].items()
                      if _find_preset(cfg or {}, pid)]
            if not owners:
                raise HomeAssistantError(
                    f"no Harmonium workspace has a preset tile '{pid}' — "
                    "the id is on the preset card's Advanced tab; generated "
                    "favorites tiles can't be called this way")
            if len(owners) > 1:
                raise HomeAssistantError(
                    f"preset '{pid}' exists in workspaces "
                    f"{', '.join(sorted(owners))} — pass workspace: to "
                    "disambiguate")
            ws = owners[0]
        config = await hstore.get_ws(ws) or {}
        tile = _find_preset(config, pid)
        if tile is None:
            raise HomeAssistantError(
                f"Harmonium workspace '{ws}' has no preset tile '{pid}'")
        action = tile.get("action") or {}
        aid = tile.get("activity")
        act = (config.get("activities") or {}).get(aid) if aid else None
        if aid and act is None:
            raise HomeAssistantError(
                f"preset '{pid}' belongs to activity '{aid}', which "
                f"workspace '{ws}' does not have")
        # ── ensure the activity: skip when already running ─────────
        if act is not None:
            room = act.get("room_view")
            ent = entry_data["selects"].get((ws, room))
            if ent is None:
                raise HomeAssistantError(
                    f"no Harmonium select for room '{room}' (workspace "
                    f"'{ws}') — reload the integration")
            if getattr(ent, "current_option", None) != aid:
                # select flips first — engine parity ("the tap IS the
                # intent"); the Start action follows, awaited, so the
                # preset fires into a started world
                await ent.async_select_option(aid)
                await _run_action_ref(ws, act.get("start"), call.context)
        # ── fire the preset's own action ───────────────────────────
        if action.get("sequence"):
            await _run_sequence(ws, action["sequence"], call.context)
            return
        svc = str(action.get("service") or "")
        parts = svc.split(".")
        if len(parts) != 2:
            raise HomeAssistantError(
                f"preset '{pid}' has no runnable action (browse shortcuts "
                "and empty presets can only be tapped on a remote)")
        ref = action.get("target") or action.get("entity")
        target = ref
        if isinstance(ref, str) and ref.startswith("$context."):
            key = ref[len("$context."):]
            target = ((act or {}).get("context") or {}).get(key)
            if not target:
                raise HomeAssistantError(
                    f"preset '{pid}' targets {ref}, but activity "
                    f"'{aid}' wires no '{key}' in its context")
        payload = json.loads(json.dumps(action.get("data") or {}))
        await hass.services.async_call(
            parts[0], parts[1], payload, blocking=True,
            target={"entity_id": target} if target else None,
            context=call.context)
        _LOGGER.info("Harmonium preset '%s' fired (ws=%s, activity=%s, "
                     "%s → %s)", pid, ws, aid or "none", svc, target or "—")

    hass.services.async_register(
        DOMAIN, "run_preset", handle_run_preset, schema=SERVICE_RUN_PRESET_SCHEMA
    )


def remove_services(hass: HomeAssistant) -> None:
    """Unregister the five services — unload's mirror."""
    for svc in ("run", "reseed", "restore_backup", "set_activity", "run_preset"):
        hass.services.async_remove(DOMAIN, svc)
