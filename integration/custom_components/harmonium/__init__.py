"""Harmonium — instant-on remote frontend for Home Assistant.

The integration is the third leg of the Harmonium stack:

    yaml/ authoring model  →  compiled runtime config  →  engine (kiosk)

It owns the runtime config in HA storage, serves it over an
authenticated API, deploys it to the path the remotes read
(/local/remote-proto/config.json), and registers the Harmonium Studio
sidebar panel — the editor whose live preview is the engine itself in
#preview=1 mode.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import voluptuous as vol
from aiohttp import web

from homeassistant.components import frontend
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.script import Script
from homeassistant.helpers.storage import Store

from .const import (
    DEPLOY_PATH,
    DOMAIN,
    PANEL_URL_PATH,
    STATIC_URL,
    STORAGE_KEY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)


def _read_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


class HarmoniumConfigView(HomeAssistantView):
    """Authenticated runtime-config endpoint for the Studio.

    GET  /api/harmonium/config          -> the stored runtime config
    POST /api/harmonium/config          -> validate, store, deploy
    """

    url = "/api/harmonium/config"
    name = "api:harmonium:config"
    requires_auth = True

    def __init__(self, hass: HomeAssistant, store: Store) -> None:
        self.hass = hass
        self.store = store

    async def get(self, request: web.Request) -> web.Response:
        data = await self.store.async_load()
        if data is None:
            return self.json_message("no config stored yet", status_code=404)
        return self.json(data)

    async def post(self, request: web.Request) -> web.Response:
        try:
            config = await request.json()
        except ValueError:
            return self.json_message("body is not valid JSON", status_code=400)

        problems = _validate(config)
        if problems:
            return self.json({"ok": False, "problems": problems}, status_code=422)

        await self.store.async_save(config)
        deploy = Path(self.hass.config.path(DEPLOY_PATH))
        await self.hass.async_add_executor_job(_write_json, deploy, config)
        _LOGGER.info("Harmonium config saved and deployed to %s", deploy)
        return self.json({"ok": True, "deployed": str(deploy)})


def _validate(config) -> list[str]:
    """Structural checks mirroring yaml/build_config.py's validate()."""
    problems: list[str] = []
    if not isinstance(config, dict):
        return ["config must be a JSON object"]
    screens = config.get("screens")
    if not isinstance(screens, dict) or not screens:
        return ["config.screens must be a non-empty object"]
    controllers = config.get("controllers") or {}
    # navigable = screens + library controllers ("controller:<id>")
    navigable = set(screens) | {"controller:" + c for c in controllers}
    home = config.get("home_screen")
    if home not in screens:
        problems.append(f"home_screen '{home}' is not a screen")
    main_home = (config.get("global") or {}).get("main_home")
    if main_home and main_home not in screens:
        problems.append(f"global.main_home '{main_home}' is not a screen")
    for sid in config.get("screen_order") or []:
        if sid not in navigable:
            problems.append(f"screen_order contains unknown screen '{sid}'")
    activities = config.get("activities") or {}
    sequences = config.get("sequences") or {}
    for sid, seq in sequences.items():
        if not isinstance((seq or {}).get("actions"), list) or not seq["actions"]:
            problems.append(f"sequence '{sid}' must have a non-empty actions list")
    for aid, activity in activities.items():
        target = (activity or {}).get("screen")
        if target and target not in navigable:
            problems.append(f"activity '{aid}' references unknown screen '{target}'")
        for slot in ("start", "stop"):
            ref = (activity or {}).get(slot)
            if isinstance(ref, str) and ref.startswith("sequence:") and ref[9:] not in sequences:
                problems.append(f"activity '{aid}' {slot} references unknown sequence '{ref[9:]}'")
    for sid, screen in {**screens, **controllers}.items():
        parent = (screen or {}).get("parent")
        if parent and parent not in navigable:
            problems.append(f"screen '{sid}' has unknown parent '{parent}'")
        groups = [screen.get("tiles") or []]
        groups += [s.get("tiles") or [] for s in screen.get("sections") or []]
        ids = [t.get("id") for g in groups for t in g]
        if any(i is None for i in ids):
            problems.append(f"screen '{sid}' has a tile without an id")
        if len(ids) != len(set(ids)):
            problems.append(f"screen '{sid}' has duplicate tile ids")
        for g in groups:
            for t in g:
                act = t.get("activity")
                if act and act not in activities:
                    problems.append(
                        f"screen '{sid}' tile '{t.get('id')}' references "
                        f"unknown activity '{act}'"
                    )
    return problems


SERVICE_RUN_SCHEMA = vol.Schema({vol.Required("sequence"): cv.string})
SERVICE_SET_ACTIVITY_SCHEMA = vol.Schema({vol.Required("activity"): cv.string})
PLATFORMS = ["select"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    async def handle_run(call: ServiceCall) -> None:
        """harmonium.run — execute a building-block SEQUENCE from the
        stored config, HA-side, with HA's own script engine (full
        delay/wait/choose semantics; remotes never run orchestration)."""
        seq_id = call.data["sequence"]
        config = await store.async_load() or {}
        seq = (config.get("sequences") or {}).get(seq_id)
        if seq is None:
            raise HomeAssistantError(
                f"Harmonium has no sequence '{seq_id}' — check Building blocks in the Studio"
            )
        actions = seq.get("actions") or []
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
        _LOGGER.info("Running Harmonium sequence '%s' (%d actions)", seq_id, len(actions))
        await script.async_run(context=call.context)

    hass.services.async_register(DOMAIN, "run", handle_run, schema=SERVICE_RUN_SCHEMA)

    async def handle_reseed(call: ServiceCall) -> None:
        """harmonium.reseed — reload the store from the DEPLOYED
        config.json (for when the repo build was pushed by file copy,
        bypassing the Studio's save path)."""
        deployed = Path(hass.config.path(DEPLOY_PATH))
        if not deployed.exists():
            raise HomeAssistantError(f"{deployed} does not exist")
        data = await hass.async_add_executor_job(_read_json, deployed)
        await store.async_save(data)
        _LOGGER.info("Harmonium store reseeded from %s", deployed)

    hass.services.async_register(DOMAIN, "reseed", handle_reseed)

    # First run: seed the store from the currently deployed config so the
    # Studio opens showing exactly what the remotes are running.
    if await store.async_load() is None:
        deployed = Path(hass.config.path(DEPLOY_PATH))
        if deployed.exists():
            try:
                seeded = await hass.async_add_executor_job(_read_json, deployed)
                await store.async_save(seeded)
                _LOGGER.info("Seeded Harmonium store from %s", deployed)
            except (OSError, ValueError) as err:
                _LOGGER.warning("Could not seed from %s: %s", deployed, err)

    hass.http.register_view(HarmoniumConfigView(hass, store))

    studio = Path(__file__).parent / "studio"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(studio), cache_headers=False)]
    )

    frontend.async_register_built_in_panel(
        hass,
        component_name="iframe",
        sidebar_title="Harmonium Studio",
        sidebar_icon="mdi:movie-edit-outline",
        frontend_url_path=PANEL_URL_PATH,
        config={"url": f"{STATIC_URL}/studio.html"},
        require_admin=True,
    )

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {"store": store, "selects": {}}

    async def handle_set_activity(call: ServiceCall) -> None:
        """harmonium.set_activity — flip the owning hub's routing select
        to an activity id ("off" ends the room). The room is inferred
        from the activity's owner (room_view) in the stored config."""
        aid = call.data["activity"]
        config = await store.async_load() or {}
        act = (config.get("activities") or {}).get(aid)
        if act is None:
            raise HomeAssistantError(f"Harmonium has no activity '{aid}'")
        room = act.get("room_view")
        ent = hass.data[DOMAIN][entry.entry_id]["selects"].get(room)
        if ent is None:
            raise HomeAssistantError(
                f"no Harmonium select for room '{room}' — reload the integration"
            )
        await ent.async_select_option(aid)

    hass.services.async_register(
        DOMAIN, "set_activity", handle_set_activity, schema=SERVICE_SET_ACTIVITY_SCHEMA
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.services.async_remove(DOMAIN, "run")
    hass.services.async_remove(DOMAIN, "reseed")
    hass.services.async_remove(DOMAIN, "set_activity")
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return unloaded
