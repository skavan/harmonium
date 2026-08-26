"""Harmonium — instant-on remote frontend for Home Assistant.

The integration is the third leg of the Harmonium stack:

    yaml/ authoring model  →  compiled runtime config  →  engine (kiosk)

It owns the runtime configs in HA storage — one per WORKSPACE, where a
workspace is one remote's whole world (two remotes in two rooms = two
workspaces, both live at once). It serves them over an authenticated
API, deploys each to the path the remotes read
(/local/remote-proto/config.json for main, config.<ws>.json for the
rest), and registers the Harmonium Studio sidebar panel — the editor
whose live preview is the engine itself in #preview=1 mode.
The integration is split by concern (v0.83.11): store.py (disk +
workspace store), api.py (the Studio's HTTP views), services.py (the
four harmonium.* services), workspaces.py (pure config surgery),
pairing.py/pairbook.py (onboarding), packaging.py (engine deploy
stamps), select.py/sensor.py (entities). This file is the wiring.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .api import (
    HarmoniumConfigView,
    HarmoniumEngineVersionView,
    HarmoniumUploadView,
    HarmoniumWhoamiView,
    HarmoniumWorkspacesView,
    validate_config,
)
from .const import (
    DEPLOY_DIR,
    DEPLOY_PATH,
    DOMAIN,
    LEGACY_DIR,
    PANEL_URL_PATH,
    STATIC_URL,
)
from .packaging import (
    deploy_bundled_assets,
    deploy_skins_split,
    read_stamp,
    should_deploy,
    write_stamp,
)
from .pairing import register_pairing
from .services import register_services, remove_services
from .store import (
    HarmoniumStore,
    engine_fingerprint,
    migrate_deploy_dir,
    read_json,
    write_text,
)
from .workspaces import MAIN, is_legacy, legacy_redirect_html, migrate, stub_html

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["select", "sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hstore = HarmoniumStore(hass)

    # v0.38: move out of the prototype namespace. One-time copy of the
    # engine + configs www/remote-proto → www/harmonium, and a
    # permanent redirect stub at the old address so remotes with the
    # old start URL keep booting (hash rides along).
    new_dir = Path(hass.config.path(DEPLOY_DIR))
    old_dir = Path(hass.config.path(LEGACY_DIR))
    if await hass.async_add_executor_job(migrate_deploy_dir, new_dir, old_dir):
        _LOGGER.info("Harmonium moved %s → %s (one-time migration)",
                     old_dir, new_dir)
    if old_dir.is_dir():
        await hass.async_add_executor_job(
            write_text, old_dir / "index.html", legacy_redirect_html())

    # ENGINE SELF-DEPLOY (v0.82 — the HACS story, beta-gaps §5): a
    # release bundle carries the engine INSIDE the integration; setup
    # deploys it to www/harmonium/ so a HACS install needs no hand
    # copying — and the ownership stamp keeps this from ever reverting
    # a manual push-catrock-engine.bat (see packaging.py).
    # THE VIRGIN-INSTALL BUG (v0.83.4 — found on the FIRST real HACS
    # install, a fresh HA at .88: "Error setting up entry"): the
    # engine write assumed www/harmonium/ existed. It always had, on
    # every dev house — but a fresh HA has no www/ at all, and
    # write_bytes into a missing directory is FileNotFoundError,
    # which killed the whole entry. mkdir first; and the entire
    # deploy block is now non-fatal — a remote UI that can't deploy
    # is a logged error, not a dead integration.
    bundled_engine = Path(__file__).parent / "engine" / "index.html"
    deployed_engine = new_dir / "index.html"
    try:
        b_fp = await hass.async_add_executor_job(engine_fingerprint, bundled_engine)
        d_fp = await hass.async_add_executor_job(engine_fingerprint, deployed_engine)
        s_fp = await hass.async_add_executor_job(read_stamp, new_dir)
        if should_deploy(b_fp, d_fp, s_fp):
            def _deploy_engine() -> None:
                new_dir.mkdir(parents=True, exist_ok=True)
                deployed_engine.write_bytes(bundled_engine.read_bytes())
            await hass.async_add_executor_job(_deploy_engine)
            await hass.async_add_executor_job(write_stamp, new_dir, b_fp)
            _LOGGER.info("Harmonium engine deployed to %s (bundle %s, was %s)",
                         deployed_engine, b_fp, d_fp or "empty")
        elif b_fp and b_fp != d_fp:
            _LOGGER.info(
                "Harmonium engine at %s differs from the bundle (%s vs %s) but "
                "was not integration-deployed — leaving the manual push alone",
                deployed_engine, d_fp, b_fp)
    except OSError as err:
        _LOGGER.error(
            "Harmonium could not deploy the engine to %s: %s — the "
            "integration will still set up; fix permissions/space and "
            "restart to deploy the remote UI", deployed_engine, err)

    # BUNDLED ASSETS — skins + sounds — with the ENGINE's OWNERSHIP
    # STAMP (v0.84.4). The old rule ("deploy only if absent, never
    # overwrite") protected a user's own photo but meant a shipped
    # STOCK update never reached an existing install — every customer
    # kept the first skin we ever gave them. Now each asset carries a
    # stamp of what WE last deployed (.assets.stamp, a {name: fp} map):
    # should_deploy() overwrites a file we recognise as our own (stock
    # updates flow) but keeps its hands off a file whose bytes differ
    # from our stamp (a user's own photo/sound is preserved) — exactly
    # the engine's contract, per file. Skins ALSO get a manifest.json of
    # content fingerprints so the Studio can append ?v=<fp> and dodge
    # Fully's hard /local/ cache (the "shows the wrong skin" bug).
    # Non-fatal, same doctrine as the engine deploy. The per-file logic
    # lives in packaging.deploy_bundled_assets (pure, unit-tested).
    #
    # THE PATH SPLIT (v0.84.6 — Suresh: "stock images and skins can go
    # in a stock subdirectory… whereas their stuff can go in a user
    # subdirectory. Our file pickers refuse to overwrite stock"):
    # bundled skins now land in skins/stock/, uploads in skins/user/,
    # so ownership is POSITIONAL — the path says who owns a file and
    # nothing has to be inferred from its bytes. The legacy FLAT copies
    # keep being refreshed for one release, because configs written
    # before this release still point at /local/harmonium/skins/<n>.png
    # and only heal (Studio load/save) repoints them; dropping the flat
    # copies now would blank those skins in the gap.
    try:
        split = await hass.async_add_executor_job(
            deploy_skins_split, Path(__file__).parent / "skins",
            new_dir / "skins")
        if split["stock"]:
            _LOGGER.info("Harmonium deployed/updated stock skin(s): %s",
                         ", ".join(split["stock"]))
        if split["legacy"]:
            _LOGGER.info("Harmonium refreshed legacy flat skin(s) "
                         "(compat window): %s", ", ".join(split["legacy"]))
    except OSError as err:
        _LOGGER.warning(
            "Harmonium could not deploy bundled skins: %s — device-photo "
            "presets will miss their image until it is copied by hand", err)

    try:
        deployed_sounds = await hass.async_add_executor_job(
            deploy_bundled_assets, Path(__file__).parent / "sounds",
            new_dir / "sounds", False)
        if deployed_sounds:
            _LOGGER.info("Harmonium deployed/updated sound(s): %s",
                         ", ".join(deployed_sounds))
    except OSError as err:
        _LOGGER.warning(
            "Harmonium could not deploy bundled sounds: %s — the battery "
            "blueprint's default beep URL will 404 until copied by hand", err)

    # One-time shape migration: persist the wrapped form so every later
    # load is already v2.
    raw = await hstore.store.async_load()
    if is_legacy(raw):
        migrated = migrate(raw)
        await hstore.save(migrated)
        _LOGGER.info("Harmonium store migrated to workspaces (v2): %s",
                     ", ".join(migrated["workspaces"]))

    # First run: seed the store from the currently deployed config so the
    # Studio opens showing exactly what the remotes are running.
    data = await hstore.load()
    if not data["workspaces"]:
        deployed = Path(hass.config.path(DEPLOY_PATH))
        if deployed.exists():
            try:
                seeded = await hass.async_add_executor_job(read_json, deployed)
                data["workspaces"][MAIN] = seeded
                data["base_main"] = seeded   # merge baseline (v0.37)
                data["meta"][MAIN] = {"name": "Main"}
                data["order"] = [MAIN]
                await hstore.save(data)
                _LOGGER.info("Seeded Harmonium main workspace from %s", deployed)
            except (OSError, ValueError) as err:
                _LOGGER.warning("Could not seed from %s: %s", deployed, err)
        else:
            # VIRGIN INSTALL (v0.83.5 — the .88 stranger-path test):
            # nothing stored AND nothing deployed = a fresh HACS
            # install. Seed from the BUNDLED starter — the system
            # layer only (input policy, default + astrion remote
            # profiles with keymaps, theme, the app master list +
            # dialects, the full stock controller library) plus one
            # empty "New Room" home hub — and deploy it immediately,
            # so a remote paired before the Studio is ever opened
            # renders a real page instead of a 404. If a config
            # exists through EITHER door it is left alone: updates
            # never overwrite. NON-FATAL like the engine deploy — a
            # seed that can't happen is a logged warning, and the
            # Studio's own virgin fallback (s0.83.9) still covers it.
            starter_path = Path(__file__).parent / "starter-config.json"
            try:
                starter = await hass.async_add_executor_job(read_json, starter_path)
                problems = validate_config(starter)
                if problems:
                    _LOGGER.warning(
                        "Harmonium bundled starter config is invalid (%s) — "
                        "starting empty; the Studio can still create a "
                        "config", "; ".join(problems))
                else:
                    data["workspaces"][MAIN] = starter
                    data["base_main"] = starter
                    data["meta"][MAIN] = {"name": "Main"}
                    data["order"] = [MAIN]
                    await hstore.save(data)
                    deploy = await hstore.deploy(MAIN, starter)
                    _LOGGER.info(
                        "Harmonium fresh install: starter config created "
                        "and deployed to %s", deploy)
            except (OSError, ValueError) as err:
                _LOGGER.warning(
                    "Harmonium could not seed the bundled starter (%s): %s "
                    "— starting empty; the Studio can still create a "
                    "config", starter_path, err)

    # the MAIN entry stub (v0.48.3): make /local/harmonium/main/ real
    # NOW — canonical addresses shouldn't wait for the next save
    if data["workspaces"].get(MAIN) is not None:
        await hass.async_add_executor_job(
            write_text, hstore.stub_path(MAIN), stub_html(MAIN))

    entry_data = hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
        "hstore": hstore,
        "selects": {},          # (ws, room) → select entity
        "add_selects": None,    # set by the select platform at setup
    }

    async def mint(ws: str, config) -> None:
        """Mint any missing activity selects for a workspace NOW —
        new workspaces get their routing selects without a reload."""
        add = entry_data.get("add_selects")
        if add:
            await add(ws, config)
    register_services(hass, hstore, entry_data, mint)

    hass.http.register_view(HarmoniumConfigView(hass, hstore, mint))
    hass.http.register_view(HarmoniumWorkspacesView(hass, hstore, mint))
    hass.http.register_view(HarmoniumUploadView(hass))   # v0.83.8
    hass.http.register_view(HarmoniumWhoamiView())       # v0.85.7 — ⓘ shows the device IP
    # the integration's own version, read once from its manifest —
    # the Studio surfaces it and checks GitHub for a newer release
    def _manifest_version() -> str:
        try:
            with (Path(__file__).parent / "manifest.json").open(encoding="utf-8") as f:
                return str(json.load(f).get("version") or "")
        except (OSError, ValueError):
            return ""
    ver = await hass.async_add_executor_job(_manifest_version)
    hass.http.register_view(HarmoniumEngineVersionView(hass, ver))
    register_pairing(hass)   # Bluetooth-style onboarding (v0.81 — beta §1)

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
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    remove_services(hass)
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return unloaded
