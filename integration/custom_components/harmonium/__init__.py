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
    DEPLOY_DIR,
    DEPLOY_PATH,
    DOMAIN,
    LEGACY_DIR,
    PANEL_URL_PATH,
    STATIC_URL,
    STORAGE_KEY,
    STORAGE_VERSION,
)
from .workspaces import (
    MAIN,
    deploy_file,
    empty_store,
    is_legacy,
    legacy_redirect_html,
    merge3,
    migrate,
    retarget_selects,
    slugify,
    stub_html,
)

# one-deep undo for reseed (lives beside config.json)
BACKUP_FILE = "config.main.backup.json"

_LOGGER = logging.getLogger(__name__)


def _read_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def _remove_file(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _migrate_deploy_dir(new_dir: Path, old_dir: Path) -> bool:
    """One-time move out of the prototype namespace (v0.38): if the
    new home has no config yet but the old one does, copy the engine
    + every config*.json over. Returns True if anything moved."""
    if (new_dir / "config.json").exists() or not (old_dir / "config.json").exists():
        return False
    new_dir.mkdir(parents=True, exist_ok=True)
    moved = False
    for f in list(old_dir.glob("config*.json")) + [old_dir / "index.html"]:
        if f.exists():
            (new_dir / f.name).write_bytes(f.read_bytes())
            moved = True
    return moved


class HarmoniumStore:
    """The workspace store: load-with-migration + save + deploy."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    async def load(self) -> dict:
        data = migrate(await self.store.async_load())
        return data if data is not None else empty_store()

    async def save(self, data: dict) -> None:
        await self.store.async_save(data)

    def deploy_path(self, ws: str) -> Path:
        return Path(self.hass.config.path(DEPLOY_DIR)) / deploy_file(ws)

    def stub_path(self, ws: str) -> Path:
        return Path(self.hass.config.path(DEPLOY_DIR)) / ws / "index.html"

    async def deploy(self, ws: str, config) -> Path:
        path = self.deploy_path(ws)
        await self.hass.async_add_executor_job(_write_json, path, config)
        if ws != MAIN:
            # the workspace's ADDRESS: /local/harmonium/<ws>/ (v0.38)
            await self.hass.async_add_executor_job(
                _write_text, self.stub_path(ws), stub_html(ws))
        return path

    async def retire(self, ws: str) -> None:
        """Remove a deleted workspace's deployed file + entry stub."""
        await self.hass.async_add_executor_job(_remove_file, self.deploy_path(ws))
        stub = self.stub_path(ws)
        await self.hass.async_add_executor_job(_remove_file, stub)
        try:
            stub.parent.rmdir()
        except OSError:
            pass

    async def get_ws(self, ws: str):
        data = await self.load()
        return data["workspaces"].get(ws)


class HarmoniumConfigView(HomeAssistantView):
    """Authenticated runtime-config endpoint for the Studio.

    GET  /api/harmonium/config?ws=<id>   -> that workspace's config
    POST /api/harmonium/config?ws=<id>   -> validate, store, deploy
    No ?ws= means main — pre-workspace clients keep working.
    """

    url = "/api/harmonium/config"
    name = "api:harmonium:config"
    requires_auth = True

    def __init__(self, hass: HomeAssistant, hstore: HarmoniumStore, mint) -> None:
        self.hass = hass
        self.hstore = hstore
        self.mint = mint            # callable(ws, config) → mint missing selects

    async def get(self, request: web.Request) -> web.Response:
        ws = request.query.get("ws") or MAIN
        config = await self.hstore.get_ws(ws)
        if config is None:
            return self.json_message(f"no config stored for workspace '{ws}'",
                                     status_code=404)
        return self.json(config)

    async def post(self, request: web.Request) -> web.Response:
        ws = request.query.get("ws") or MAIN
        try:
            config = await request.json()
        except ValueError:
            return self.json_message("body is not valid JSON", status_code=400)

        problems = _validate(config)
        if problems:
            return self.json({"ok": False, "problems": problems}, status_code=422)

        data = await self.hstore.load()
        if ws != MAIN and ws not in data["workspaces"]:
            return self.json_message(
                f"workspace '{ws}' does not exist — create it first",
                status_code=404)
        data["workspaces"][ws] = config
        data["meta"].setdefault(ws, {"name": "Main" if ws == MAIN else ws})
        if ws not in data["order"]:
            data["order"].append(ws)
        await self.hstore.save(data)
        deploy = await self.hstore.deploy(ws, config)
        await self.mint(ws, config)
        _LOGGER.info("Harmonium workspace '%s' saved and deployed to %s", ws, deploy)
        return self.json({"ok": True, "workspace": ws, "deployed": str(deploy)})


class HarmoniumWorkspacesView(HomeAssistantView):
    """Workspace management for the Studio.

    GET  /api/harmonium/workspaces
         -> { order, workspaces: {id: {name, file}} }
    POST /api/harmonium/workspaces
         { action: "create",    name, id?, from?, config? }
         { action: "duplicate", from, name, id? }
         { action: "rename",    id, name }          (display name only)
         { action: "delete",    id }                 (main refused)
    Create/duplicate retarget minted-select refs to the new workspace's
    prefix server-side, deploy the file, and mint selects immediately.
    """

    url = "/api/harmonium/workspaces"
    name = "api:harmonium:workspaces"
    requires_auth = True

    def __init__(self, hass: HomeAssistant, hstore: HarmoniumStore, mint) -> None:
        self.hass = hass
        self.hstore = hstore
        self.mint = mint

    async def get(self, request: web.Request) -> web.Response:
        data = await self.hstore.load()
        return self.json({
            "order": data["order"],
            "workspaces": {
                ws: {"name": (data["meta"].get(ws) or {}).get("name") or ws,
                     "file": deploy_file(ws),
                     # the workspace's ADDRESS (v0.38) — what a remote's
                     # start URL should be
                     "path": "/local/harmonium/" + ("" if ws == MAIN else ws + "/")}
                for ws in data["workspaces"]
            },
        })

    async def post(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except ValueError:
            return self.json_message("body is not valid JSON", status_code=400)
        action = body.get("action")
        data = await self.hstore.load()

        if action in ("create", "duplicate"):
            name = (body.get("name") or "").strip()
            if not name:
                return self.json_message("name required", status_code=400)
            ws = slugify(body.get("id") or name)
            if ws in data["workspaces"] or ws == MAIN:
                return self.json_message(f"workspace '{ws}' already exists",
                                         status_code=409)
            src = body.get("from")
            if action == "duplicate" or (src and "config" not in body):
                if src not in data["workspaces"]:
                    return self.json_message(f"source workspace '{src}' not found",
                                             status_code=404)
                config = json.loads(json.dumps(data["workspaces"][src]))
            else:
                config = body.get("config")
                if not isinstance(config, dict):
                    return self.json_message("config required for create",
                                             status_code=400)
                problems = _validate(config)
                if problems:
                    return self.json({"ok": False, "problems": problems},
                                     status_code=422)
            config = retarget_selects(config, src or MAIN, ws)
            data["workspaces"][ws] = config
            data["meta"][ws] = {"name": name}
            data["order"].append(ws)
            await self.hstore.save(data)
            deploy = await self.hstore.deploy(ws, config)
            await self.mint(ws, config)
            _LOGGER.info("Harmonium workspace '%s' (%s) created, deployed to %s",
                         ws, name, deploy)
            return self.json({"ok": True, "workspace": ws,
                              "file": deploy_file(ws)})

        if action == "rename":
            ws = body.get("id")
            name = (body.get("name") or "").strip()
            if ws not in data["workspaces"] or not name:
                return self.json_message("unknown workspace or empty name",
                                         status_code=400)
            data["meta"].setdefault(ws, {})["name"] = name
            await self.hstore.save(data)
            return self.json({"ok": True})

        if action == "delete":
            ws = body.get("id")
            if ws == MAIN:
                return self.json_message(
                    "main is the repo workspace — it can't be deleted",
                    status_code=400)
            if ws not in data["workspaces"]:
                return self.json_message(f"unknown workspace '{ws}'",
                                         status_code=404)
            data["workspaces"].pop(ws, None)
            data["meta"].pop(ws, None)
            data["order"] = [w for w in data["order"] if w != ws]
            await self.hstore.save(data)
            await self.hstore.retire(ws)
            _LOGGER.info("Harmonium workspace '%s' deleted (its select "
                         "entities retire on the next integration reload)", ws)
            return self.json({"ok": True})

        return self.json_message(f"unknown action '{action}'", status_code=400)


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


SERVICE_RUN_SCHEMA = vol.Schema({
    vol.Required("sequence"): cv.string,
    vol.Optional("workspace", default=MAIN): cv.string,
})
SERVICE_SET_ACTIVITY_SCHEMA = vol.Schema({
    vol.Required("activity"): cv.string,
    vol.Optional("workspace", default=MAIN): cv.string,
})
PLATFORMS = ["select", "sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hstore = HarmoniumStore(hass)

    # v0.38: move out of the prototype namespace. One-time copy of the
    # engine + configs www/remote-proto → www/harmonium, and a
    # permanent redirect stub at the old address so remotes with the
    # old start URL keep booting (hash rides along).
    new_dir = Path(hass.config.path(DEPLOY_DIR))
    old_dir = Path(hass.config.path(LEGACY_DIR))
    if await hass.async_add_executor_job(_migrate_deploy_dir, new_dir, old_dir):
        _LOGGER.info("Harmonium moved %s → %s (one-time migration)",
                     old_dir, new_dir)
    if old_dir.is_dir():
        await hass.async_add_executor_job(
            _write_text, old_dir / "index.html", legacy_redirect_html())

    # One-time shape migration: persist the wrapped form so every later
    # load is already v2.
    raw = await hstore.store.async_load()
    if is_legacy(raw):
        migrated = migrate(raw)
        await hstore.save(migrated)
        _LOGGER.info("Harmonium store migrated to workspaces (v2): %s",
                     ", ".join(migrated["workspaces"]))

    async def handle_run(call: ServiceCall) -> None:
        """harmonium.run — execute a building-block SEQUENCE from the
        stored config, HA-side, with HA's own script engine (full
        delay/wait/choose semantics; remotes never run orchestration).
        `workspace` routes to the calling remote's world (default main)."""
        seq_id = call.data["sequence"]
        ws = call.data["workspace"]
        config = await hstore.get_ws(ws) or {}
        seq = (config.get("sequences") or {}).get(seq_id)
        if seq is None:
            raise HomeAssistantError(
                f"Harmonium workspace '{ws}' has no sequence '{seq_id}' — "
                "check Building blocks in the Studio"
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
        _LOGGER.info("Running Harmonium sequence '%s' (ws=%s, %d actions)",
                     seq_id, ws, len(actions))
        await script.async_run(context=call.context)

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
        fresh = await hass.async_add_executor_job(_read_json, deployed)
        data = await hstore.load()
        current = data["workspaces"].get(MAIN)
        base = data.get("base_main")

        if current is not None:
            await hass.async_add_executor_job(
                _write_json, hstore.deploy_path(MAIN).with_name(BACKUP_FILE),
                current)

        if current is not None and base is not None:
            merged, conflicts = merge3(base, fresh, current)
            problems = _validate(merged)
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
        saved = await hass.async_add_executor_job(_read_json, backup)
        data = await hstore.load()
        data["workspaces"][MAIN] = saved
        await hstore.save(data)
        await hstore.deploy(MAIN, saved)
        _LOGGER.info("Harmonium main restored from %s", backup)

    hass.services.async_register(DOMAIN, "restore_backup", handle_restore_backup)

    # First run: seed the store from the currently deployed config so the
    # Studio opens showing exactly what the remotes are running.
    data = await hstore.load()
    if not data["workspaces"]:
        deployed = Path(hass.config.path(DEPLOY_PATH))
        if deployed.exists():
            try:
                seeded = await hass.async_add_executor_job(_read_json, deployed)
                data["workspaces"][MAIN] = seeded
                data["base_main"] = seeded   # merge baseline (v0.37)
                data["meta"][MAIN] = {"name": "Main"}
                data["order"] = [MAIN]
                await hstore.save(data)
                _LOGGER.info("Seeded Harmonium main workspace from %s", deployed)
            except (OSError, ValueError) as err:
                _LOGGER.warning("Could not seed from %s: %s", deployed, err)

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

    hass.http.register_view(HarmoniumConfigView(hass, hstore, mint))
    hass.http.register_view(HarmoniumWorkspacesView(hass, hstore, mint))

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

    async def handle_set_activity(call: ServiceCall) -> None:
        """harmonium.set_activity — flip the owning hub's routing select
        to an activity id ("off" ends the room). The room is inferred
        from the activity's owner (room_view) in the stored config."""
        aid = call.data["activity"]
        ws = call.data["workspace"]
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
        await ent.async_select_option(aid)

    hass.services.async_register(
        DOMAIN, "set_activity", handle_set_activity, schema=SERVICE_SET_ACTIVITY_SCHEMA
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.services.async_remove(DOMAIN, "run")
    hass.services.async_remove(DOMAIN, "reseed")
    hass.services.async_remove(DOMAIN, "restore_backup")
    hass.services.async_remove(DOMAIN, "set_activity")
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return unloaded
