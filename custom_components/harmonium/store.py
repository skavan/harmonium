"""File and store plumbing for Harmonium.

The pure disk layer: the small json/text helpers every other module
leans on, the one-time deploy-dir migration, the workspace store
itself (load-with-migration + save + deploy + retire), and the engine
fingerprint that makes deploys self-describing. No HTTP, no services —
those live in api.py and services.py (split out of __init__.py,
v0.83.11)."""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .catalogs import merge_config, stock_catalogs
from .const import DEPLOY_DIR, STORAGE_KEY, STORAGE_VERSION
from .icons import frontend_root, mint_icon_paths
from .workspaces import deploy_file, empty_store, migrate, stub_html

# one-deep undo for reseed (lives beside config.json)
BACKUP_FILE = "config.main.backup.json"

_LOGGER = logging.getLogger(__name__)


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def _remove_file(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def migrate_deploy_dir(new_dir: Path, old_dir: Path) -> bool:
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
        self.component_dir = Path(__file__).parent

    def stock(self) -> dict:
        """The shipped catalogs (cached after the first read — setup
        primes the cache off the event loop)."""
        return stock_catalogs(self.component_dir)

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
        # MINT THE ICONS (2026-09-01 — Suresh: "live preview in the
        # studio and then mint into the deployed artifacts"): every
        # set icon the config references resolves to its path data
        # HERE, baked into the deployed file as icon_paths — the
        # remote renders inline SVG with no pack dependency. Deploy-
        # only: the stored layer never carries it. A failure never
        # blocks the deploy — the engine falls back per icon.
        try:
            if isinstance(config, dict):
                rep = await self.hass.async_add_executor_job(
                    mint_icon_paths, config,
                    Path(self.hass.config.path("www")), frontend_root())
                config = dict(config)
                config.pop("icon_paths", None)
                if rep["found"]:
                    config["icon_paths"] = rep["found"]
                    _LOGGER.info("minted %d icon(s) into %s",
                                 len(rep["found"]), deploy_file(ws))
                for miss in rep["missing"]:
                    _LOGGER.warning("icon %s: not in the installed pack", miss)
                for st in rep["no_source"]:
                    _LOGGER.warning("icon set '%s': no installed pack found", st)
        except Exception:  # noqa: BLE001 — icons never block a deploy
            _LOGGER.exception("icon minting failed (deploy unaffected)")
        await self.hass.async_add_executor_job(write_json, path, config)
        # the workspace's ADDRESS: /local/harmonium/<ws>/ — MAIN
        # INCLUDED (v0.48.3, Suresh: "workspacename/index.html
        # everywhere"). The bare engine path stays for provisioned
        # kiosks; the engine canonicalizes the bar to <ws>/index.html.
        await self.hass.async_add_executor_job(
            write_text, self.stub_path(ws), stub_html(ws))
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
        """The EFFECTIVE config for a workspace — the stored user
        layer with the stock catalogs spread underneath (v0.86.0,
        docs/design-layered-catalogs.md). Everything that reads a
        config to ACT on it (the API's GET, the services, deploys)
        wants this; the raw layer is get_ws_layer."""
        data = await self.load()
        cfg = data["workspaces"].get(ws)
        return merge_config(self.stock(), cfg) if cfg is not None else None

    async def get_ws_layer(self, ws: str):
        """The stored user layer, verbatim — deltas + tombstones."""
        data = await self.load()
        return data["workspaces"].get(ws)


def engine_fingerprint(path: Path) -> str:
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
