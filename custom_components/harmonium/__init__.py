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

import hashlib
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
from .packaging import read_stamp, should_deploy, write_stamp
from .pairing import register_pairing
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
        # the workspace's ADDRESS: /local/harmonium/<ws>/ — MAIN
        # INCLUDED (v0.48.3, Suresh: "workspacename/index.html
        # everywhere"). The bare engine path stays for provisioned
        # kiosks; the engine canonicalizes the bar to <ws>/index.html.
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


def _engine_fingerprint(path: Path) -> str:
    """8 hex chars of the DEPLOYED engine's bytes. Cheap (one ~200KB
    read), and it is the file itself that is authoritative — not a
    version the repo claims, not a deploy timestamp we hope was
    updated. push-to-ha.bat copies a new index.html; the next boot
    sees a different fingerprint. Nothing to remember to bump."""
    try:
        h = hashlib.sha1()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()[:8]
    except OSError:
        return ""


class HarmoniumEngineVersionView(HomeAssistantView):
    """GET /api/harmonium/engine_version -> {"v": "<fingerprint>"}

    UNAUTHENTICATED on purpose: the entry stub runs before any token
    exists, and a content hash of a file already served at /local/ is
    not a secret. no-store so the answer is never itself cached."""

    url = "/api/harmonium/engine_version"
    name = "api:harmonium:engine_version"
    requires_auth = False

    def __init__(self, hass: HomeAssistant, version: str = "") -> None:
        self.hass = hass
        self.version = version   # the integration's manifest version (v0.82)

    async def get(self, request: web.Request) -> web.Response:
        engine = Path(self.hass.config.path(DEPLOY_DIR)) / "index.html"
        v = await self.hass.async_add_executor_job(_engine_fingerprint, engine)
        bundled = Path(__file__).parent / "engine" / "index.html"
        b = await self.hass.async_add_executor_job(_engine_fingerprint, bundled)
        return web.json_response(
            {"v": v, "bundled": b, "integration": self.version},
            headers={"Cache-Control": "no-store, must-revalidate"},
        )


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
                     # the workspace's ADDRESS — what a remote's start
                     # URL should be (v0.48.3: main/ included)
                     "path": "/local/harmonium/" + ws + "/"}
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
        b_fp = await hass.async_add_executor_job(_engine_fingerprint, bundled_engine)
        d_fp = await hass.async_add_executor_job(_engine_fingerprint, deployed_engine)
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

    # BUNDLED SKINS (v0.83.6 — .88 field report: "No photo for
    # astrion"): the starter config's astrion profile references
    # /local/harmonium/skins/astrion.png, so a fresh box must HAVE
    # it. Deploy every bundled skin that isn't already deployed —
    # and NEVER overwrite: a user's own photo of their own remote
    # always wins over ours. Non-fatal, same doctrine as the engine.
    bundled_skins = Path(__file__).parent / "skins"
    try:
        if bundled_skins.is_dir():
            def _deploy_skins() -> list[str]:
                copied = []
                dest = new_dir / "skins"
                dest.mkdir(parents=True, exist_ok=True)
                for src in sorted(bundled_skins.iterdir()):
                    if src.is_file() and not (dest / src.name).exists():
                        (dest / src.name).write_bytes(src.read_bytes())
                        copied.append(src.name)
                return copied
            deployed_skins = await hass.async_add_executor_job(_deploy_skins)
            if deployed_skins:
                _LOGGER.info("Harmonium deployed bundled skin(s) to %s: %s",
                             new_dir / "skins", ", ".join(deployed_skins))
    except OSError as err:
        _LOGGER.warning(
            "Harmonium could not deploy bundled skins: %s — device-photo "
            "presets will miss their image until it is copied by hand", err)

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
                starter = await hass.async_add_executor_job(_read_json, starter_path)
                problems = _validate(starter)
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
            _write_text, hstore.stub_path(MAIN), stub_html(MAIN))

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
            ents = ([entry_data["selects"].get((ws, room))] if room
                    else [e for (w, _r), e in entry_data["selects"].items()
                          if w == ws])
            ents = [e for e in ents if e is not None]
            if not ents:
                raise HomeAssistantError(
                    f"no Harmonium selects for workspace '{ws}'"
                    + (f" room '{room}'" if room else "")
                    + " — reload the integration")
            for ent in ents:
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
