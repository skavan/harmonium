"""Harmonium's HTTP surface — the Studio's API.

The four views (engine version — deliberately unauthenticated; image
upload; per-workspace config; workspace management) and the structural
validator they share with the reseed path. async_setup_entry wires
them (split out of __init__.py, v0.83.11)."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DEPLOY_DIR
from .packaging import STOCK_SUBDIR, USER_SUBDIR
from .store import HarmoniumStore, engine_fingerprint
from .icons import frontend_root, list_icons, resolve_icons
from .catalogs import merge_config, subtract_config
from .workspaces import MAIN, deploy_file, retarget_selects, slugify

_LOGGER = logging.getLogger(__name__)


class HarmoniumHelloView(HomeAssistantView):
    """POST /api/harmonium/hello — a running remote announces itself.

    The fleet's UP channel (docs/design-remote-fleet.md): fired on
    every websocket auth_ok and piggybacked on the engine's existing
    25s watchdog every ~5 visible minutes, so it costs the battery
    nothing the watchdog wasn't already spending. Authenticated but
    NOT admin — remote tokens must never need admin."""

    url = "/api/harmonium/hello"
    name = "api:harmonium:hello"
    requires_auth = True

    def __init__(self, fleet, persist) -> None:
        self.fleet = fleet
        self.persist = persist      # persist(urgent: bool) — debounced store

    async def post(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except ValueError:
            return self.json_message("body is not valid JSON", status_code=400)
        if not isinstance(body, dict):
            return self.json_message("body must be an object", status_code=400)
        info = dict(body)
        info["ip"] = request.remote or ""
        changed = self.fleet.hello(str(body.get("unit") or ""), info)
        self.persist(changed)
        return self.json({"ok": True})


# the Fully Kiosk entities a linked unit borrows, keyed by the tail of
# their entity ids (stable across renames — HA keeps the object_id)
_FULLY_TAILS = {
    "battery_sensor": "_battery",
    "plugged_sensor": "_plugged_in",
    "page_sensor": "_current_page",
    "reload_button": "_load_start_url",
    "cache_button": "_clear_browser_cache",
    "overlay_notify": "_overlay_message",
    "tts_notify": "_text_to_speech",
    "beep_player": None,   # the device's media_player (no suffix)
}


class HarmoniumFleetView(HomeAssistantView):
    """GET /api/harmonium/fleet — the units ledger for the Studio's
    "Your remotes" section, ENRICHED (fleet v2 — Suresh: "link it to
    a Fully Kiosk profile, which will pull in a default name, a start
    url, a battery level"): a linked unit borrows its Fully device's
    name, battery/charging truth (fresh even while the remote
    sleeps), current URL, and the entity ids the battery-alert
    blueprint wants. The response also carries the pickable Fully
    devices (with an ip-matched suggestion per unit) and the
    installed battery-alerts blueprint path, so Create needs no
    second round-trip. Refresh in the Studio = just GET again."""

    url = "/api/harmonium/fleet"
    name = "api:harmonium:fleet"
    requires_auth = True

    def __init__(self, hass: HomeAssistant, fleet, hstore: HarmoniumStore) -> None:
        self.hass = hass
        self.fleet = fleet
        self.hstore = hstore
        self._bp: str | None = None    # discovered blueprint path, cached

    def _fully_devices(self) -> list[dict]:
        from homeassistant.helpers import device_registry as dr
        out = []
        for dev in dr.async_get(self.hass).devices.values():
            if not any(i[0] == "fully_kiosk" for i in (dev.identifiers or ())):
                continue
            host = ""
            for eid in dev.config_entries:
                entry = self.hass.config_entries.async_get_entry(eid)
                if entry and entry.data.get("host"):
                    host = str(entry.data["host"])
            out.append({"id": dev.id, "name": dev.name_by_user or dev.name or dev.id,
                        "host": host})
        out.sort(key=lambda d: d["name"].lower())
        return out

    def _device_join(self, device_id: str) -> dict:
        """The linked device's name + borrowed entity ids + live reads."""
        from homeassistant.helpers import device_registry as dr
        from homeassistant.helpers import entity_registry as er
        dev = dr.async_get(self.hass).devices.get(device_id)
        if dev is None:
            return {"fully_missing": True}
        ents = er.async_entries_for_device(er.async_get(self.hass), device_id)
        picked: dict = {}
        for e in ents:
            obj = e.entity_id.split(".", 1)[1]
            for key, tail in _FULLY_TAILS.items():
                if tail is None:
                    if e.entity_id.startswith("media_player."):
                        picked[key] = e.entity_id
                elif obj.endswith(tail):
                    picked[key] = e.entity_id
        out = {"fully_name": dev.name_by_user or dev.name or "", "fully": picked}
        batt = self.hass.states.get(picked.get("battery_sensor", ""))
        if batt is not None:
            try:
                out["battery"] = int(float(batt.state))
            except (TypeError, ValueError):
                pass
        plug = self.hass.states.get(picked.get("plugged_sensor", ""))
        if plug is not None:
            out["charging"] = plug.state == "on"
        page = self.hass.states.get(picked.get("page_sensor", ""))
        if page is not None and page.state not in ("unknown", "unavailable"):
            out["url"] = page.state
        return out

    async def _blueprint_path(self) -> str | None:
        """The installed battery-alerts blueprint, found on disk once —
        import sources name their folder unpredictably, so we glob."""
        if self._bp is not None:
            return self._bp or None

        def _find() -> str:
            root = Path(self.hass.config.path("blueprints", "automation"))
            try:
                hit = next(root.glob("*/battery_alerts.yaml"), None)
            except OSError:
                return ""
            return f"{hit.parent.name}/{hit.name}" if hit else ""
        self._bp = await self.hass.async_add_executor_job(_find)
        return self._bp or None

    async def get(self, request: web.Request) -> web.Response:
        units = self.fleet.list()
        fully = self._fully_devices()
        by_host = {d["host"]: d["id"] for d in fully if d["host"]}
        cfgs: dict = {}
        for row in units:
            if row.get("fully_device"):
                row.update(self._device_join(row["fully_device"]))
            elif row.get("ip") and by_host.get(row["ip"]):
                # unlinked, but a Fully device lives at this unit's ip
                row["fully_suggest"] = by_host[row["ip"]]
            if row.get("battery") is not None:
                continue
            # legacy fallback: the PROFILE's wired battery sensor
            ws = row.get("workspace") or MAIN
            if ws not in cfgs:
                cfgs[ws] = await self.hstore.get_ws(ws) or {}
            prof = ((cfgs[ws].get("remotes") or {}).get(row.get("profile")) or {})
            sensor = prof.get("battery_sensor")
            st = self.hass.states.get(sensor) if sensor else None
            if st is not None:
                try:
                    row["battery"] = int(float(st.state))
                except (TypeError, ValueError):
                    pass
        return self.json({"units": units, "fully": fully,
                          "blueprint": await self._blueprint_path()})


class HarmoniumFleetUnitView(HomeAssistantView):
    """DELETE /api/harmonium/fleet/{unit} — remove a stale row (a
    wiped device mints a fresh unit id; the old row is just history)."""

    url = "/api/harmonium/fleet/{unit}"
    name = "api:harmonium:fleet:unit"
    requires_auth = True

    def __init__(self, fleet, persist) -> None:
        self.fleet = fleet
        self.persist = persist

    async def delete(self, request: web.Request, unit: str) -> web.Response:
        ok = self.fleet.remove(unit)
        if ok:
            self.persist(True)
        return self.json({"ok": ok})

    async def post(self, request: web.Request, unit: str) -> web.Response:
        """The LINK (fleet v2): {friendly?, fully_device?} — Studio-owned
        fields; empty string clears. A hello can never touch these."""
        try:
            body = await request.json()
        except ValueError:
            return self.json_message("body is not valid JSON", status_code=400)
        if not isinstance(body, dict):
            return self.json_message("body must be an object", status_code=400)
        changed = self.fleet.link(unit, body)
        if changed:
            self.persist(True)
        return self.json({"ok": True, "changed": changed})


class HarmoniumCommandView(HomeAssistantView):
    """POST /api/harmonium/command {verb, target?, workspace?} — bump
    the command bus. The DOWN channel: the bus is one sensor riding
    every remote's existing filtered subscription (custom-event
    subscriptions are admin-gated in HA; state diffs are not, and a
    second subscription would be a second thing to keep alive).
    Verbs v1: reload · identify. Returns how many ledger rows are
    currently online AND addressed, for the Studio's toast."""

    url = "/api/harmonium/command"
    name = "api:harmonium:command"
    requires_auth = True

    VERBS = ("reload", "identify")

    def __init__(self, fleet, bus_push) -> None:
        self.fleet = fleet
        self.bus_push = bus_push    # callable(payload) → seq, or None if platform not up

    async def post(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except ValueError:
            return self.json_message("body is not valid JSON", status_code=400)
        verb = (body or {}).get("verb")
        if verb not in self.VERBS:
            return self.json_message(f"verb must be one of {self.VERBS}", status_code=400)
        # CONSTANT SHAPE, always every key ("" = unaddressed): state
        # diffs MERGE attributes, so an omitted key would let a stale
        # value from the previous command linger and mis-address this
        # one (found by probe-remote-fleet before it could ship)
        target = (body.get("target") or "").strip()
        workspace = (body.get("workspace") or "").strip()
        label = str(body.get("label") or "").strip()[:60]
        payload = {"verb": verb, "target": target, "workspace": workspace,
                   "label": label, "ts": time.time()}
        seq = self.bus_push(payload) if self.bus_push else None
        if seq is None:
            return self.json_message("command bus not ready (sensor platform still starting)",
                                     status_code=503)
        n = 0
        for row in self.fleet.list():
            if row["liveness"] != "online":
                continue
            if workspace and (row.get("workspace") or MAIN) != workspace:
                continue
            if target and target not in ("all", row.get("unit"), row.get("profile")):
                continue
            n += 1
        return self.json({"ok": True, "seq": seq, "online": n})


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
        v = await self.hass.async_add_executor_job(engine_fingerprint, engine)
        bundled = Path(__file__).parent / "engine" / "index.html"
        b = await self.hass.async_add_executor_job(engine_fingerprint, bundled)
        return web.json_response(
            {"v": v, "bundled": b, "integration": self.version},
            headers={"Cache-Control": "no-store, must-revalidate"},
        )


class HarmoniumIconsView(HomeAssistantView):
    """GET /api/harmonium/icons?names=phu:a,mdi:b — the Studio's LIVE
    icon lookup (2026-09-01 ruling: "live preview in the studio and
    then mint into the deployed artifacts"). Same resolver the deploy
    minting uses, so preview and remote can never disagree."""

    url = "/api/harmonium/icons"
    name = "api:harmonium:icons"

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request) -> web.Response:
        www = Path(self.hass.config.path("www"))
        # ?list=<set>&q=<fragment> — the autocomplete (names + path
        # data, so every dropdown row previews without a second call)
        set_ = (request.query.get("list") or "").strip()
        if set_:
            lim = 0 if request.query.get("all") else 60
            rep = await self.hass.async_add_executor_job(
                list_icons, set_, request.query.get("q") or "",
                www, frontend_root(), None, lim)
            return self.json(rep)
        names = [n.strip() for n in
                 (request.query.get("names") or "").split(",") if n.strip()]
        if not names:
            return self.json({"found": {}, "missing": [], "no_source": []})
        rep = await self.hass.async_add_executor_job(
            resolve_icons, names[:200], www, frontend_root())
        return self.json(rep)


# ---- Studio image upload (v0.83.8 — beta-gaps P1 #7: "a stranger
# never needs filesystem access to finish a good-looking page") ------
UPLOAD_MAX = 8 * 1024 * 1024
UPLOAD_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
# PNG / JPEG / GIF / RIFF(WEBP) signatures — with the extension
# whitelist this keeps "renamed a .zip to .png" out of www/
UPLOAD_MAGIC = (b"\x89PNG", b"\xff\xd8\xff", b"GIF8", b"RIFF")


class HarmoniumWhoamiView(HomeAssistantView):
    """GET /api/harmonium/whoami -> {"ip": "<caller's address>"}

    v0.85.7 — Suresh: "Put the ip address in the [ⓘ] page". A webview
    cannot learn its own LAN address (no Fully JS interface in our
    profile; WebRTC candidates are mDNS-obfuscated; getBattery-style
    APIs need a secure context) — but HOME ASSISTANT sees the caller's
    address on every request, so the integration just tells it back.
    The ⓘ page shows it with the Fully remote-admin hint (:2323),
    which is the sanctioned door to Fully's settings on a kiosk.
    Authenticated: an address is mildly sensitive and the engine
    always has its token by the time ⓘ renders."""

    url = "/api/harmonium/whoami"
    name = "api:harmonium:whoami"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        return self.json({"ip": request.remote or ""})


class HarmoniumUploadView(HomeAssistantView):
    """POST /api/harmonium/upload — a picture for the deployed tree.

    Multipart form: `file` (the image), `kind` ("image" | "skin"),
    `overwrite` ("1" to replace an existing name). Returns the
    /local/… path ready for a Studio field. Without overwrite an
    existing name answers 409 so the Studio can ask first — a user's
    picture is never silently replaced. Authenticated: only a
    logged-in Studio writes; size and type are whitelisted.

    WHERE THINGS LAND (v0.83.8 follow-up — Suresh: "Are you sure we
    want our uploaded hero images inside harmonium?" — he was right):
    hero/banner pictures go to www/images/ (/local/images/…), the
    house's own picture folder, OUTSIDE the integration's deploy
    tree — a wipe-and-reinstall deletes www/harmonium/ wholesale and
    must never eat family photos. Device-photo SKINS stay at
    www/harmonium/skins/ because they are Harmonium furniture (the
    bundled-skin deploy already manages that folder); the wipe doc
    says to re-upload them after a wipe.
    """

    url = "/api/harmonium/upload"
    name = "api:harmonium:upload"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def post(self, request: web.Request) -> web.Response:
        try:
            form = await request.post()
        except ValueError:
            return self.json_message("body is not multipart form data",
                                     status_code=400)
        f = form.get("file")
        if f is None or not getattr(f, "filename", None):
            return self.json_message("no file field in the form",
                                     status_code=400)
        skin = form.get("kind") == "skin"
        overwrite = str(form.get("overwrite") or "") in ("1", "true", "yes")
        src = Path(str(f.filename))
        ext = src.suffix.lower()
        if ext == ".jpeg":
            ext = ".jpg"
        if ext not in UPLOAD_EXT:
            return self.json_message(
                f"unsupported type '{ext or 'none'}' — png/jpg/webp/gif only",
                status_code=415)
        base = slugify(src.stem) or "upload"
        data = await self.hass.async_add_executor_job(
            f.file.read, UPLOAD_MAX + 1)
        if len(data) > UPLOAD_MAX:
            return self.json_message("file too large (8 MB max)",
                                     status_code=413)
        if not data.startswith(UPLOAD_MAGIC):
            return self.json_message("that file does not look like an image",
                                     status_code=415)
        if skin:
            # THE PATH SPLIT (v0.84.6): a user's photo lands in
            # skins/user/ — never beside, and never on top of, the
            # stock skins in skins/stock/. Ownership is positional, so
            # naming your photo "rs90.png" is now harmless.
            skins_root = Path(self.hass.config.path(DEPLOY_DIR)) / "skins"
            target = skins_root / USER_SUBDIR / (base + ext)
            local = f"/local/harmonium/skins/{USER_SUBDIR}/{base}{ext}"
            # THE PICKER REFUSES STOCK (structural belt-and-braces):
            # nothing reaching this endpoint may resolve inside
            # skins/stock/. This is a REFUSAL, not a 409 — there is no
            # "overwrite anyway", because a clobbered stock file would
            # be silently restored by the next deploy anyway.
            try:
                resolved = target.resolve()
                stock_root = (skins_root / STOCK_SUBDIR).resolve()
                if resolved == stock_root or stock_root in resolved.parents:
                    return self.json_message(
                        "stock skins are locked — upload your own photo "
                        "instead; it lands in skins/user/", status_code=403)
            except OSError:
                pass
        else:
            target = Path(self.hass.config.path("www/images")) / (base + ext)
            local = f"/local/images/{base}{ext}"

        def _write() -> bool:
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and not overwrite:
                return False
            # tmp + rename: a remote fetching mid-upload never sees
            # a half-written picture
            tmp = target.with_suffix(target.suffix + ".tmp")
            tmp.write_bytes(data)
            tmp.replace(target)
            return True

        try:
            wrote = await self.hass.async_add_executor_job(_write)
        except OSError as err:
            return self.json_message(f"could not write the file: {err}",
                                     status_code=500)
        if not wrote:
            return self.json({"ok": False, "exists": True, "path": local},
                             status_code=409)
        _LOGGER.info("Harmonium upload: %s (%d bytes)", target, len(data))
        return self.json({"ok": True, "path": local, "file": base + ext})


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

        problems = validate_config(config)
        if problems:
            return self.json({"ok": False, "problems": problems}, status_code=422)

        data = await self.hstore.load()
        if ws != MAIN and ws not in data["workspaces"]:
            return self.json_message(
                f"workspace '{ws}' does not exist — create it first",
                status_code=404)
        # LAYERED CATALOGS (v0.86.0): the Studio posts the EFFECTIVE
        # config (what it was served). The store holds only the user
        # LAYER — subtract the stock catalogs here, at the write
        # boundary, so nothing can ever bake stock into user space
        # (the never-write-merged contract). An entry equal to stock
        # lifts out; a missing stock key becomes a tombstone; the
        # deploy below still carries the full effective config.
        data["workspaces"][ws] = subtract_config(self.hstore.stock(), config)
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
                problems = validate_config(config)
                if problems:
                    return self.json({"ok": False, "problems": problems},
                                     status_code=422)
            config = retarget_selects(config, src or MAIN, ws)
            # a duplicate's source is already a user layer; a config
            # supplied in the body is effective-shaped — subtract is
            # a no-op on the former and the contract on the latter
            stock = self.hstore.stock()
            if action != "duplicate" and "config" in body:
                config = subtract_config(stock, config)
            data["workspaces"][ws] = config
            data["meta"][ws] = {"name": name}
            data["order"].append(ws)
            await self.hstore.save(data)
            effective = merge_config(stock, config)
            deploy = await self.hstore.deploy(ws, effective)
            await self.mint(ws, effective)
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


def validate_config(config) -> list[str]:
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
