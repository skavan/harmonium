"""Workspace helpers — pure functions, no Home Assistant imports.

A WORKSPACE is one complete runtime config: one remote's whole world
(screens, activities, sequences, theme, devices). Two remotes in two
rooms = two workspaces, both live at once.

Storage shape (v2):
    { "version": 2,
      "workspaces": { "<id>": <runtime config> },
      "meta":       { "<id>": {"name": "Porch"} },
      "order":      ["main", ...] }

The MAIN workspace is special only in its paths: it is the one the
repo's yaml compiles to, it deploys to config.json (so existing
remotes keep working untouched), and its minted selects keep their
legacy un-prefixed entity ids (automations watch those).

Kept HA-free so the container test suite can exercise it directly
with plain python3.
"""
from __future__ import annotations

import copy
import json
import re

MAIN = "main"

_SELECT_RE = re.compile(r"select\.harmonium_([a-z0-9_]+)_activity")
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def is_legacy(data) -> bool:
    """A pre-workspace store held ONE bare runtime config."""
    return isinstance(data, dict) and "screens" in data


def migrate(data):
    """Wrap a legacy single-config store as the main workspace."""
    if data is None:
        return None
    if is_legacy(data):
        return {
            "version": 2,
            "workspaces": {MAIN: data},
            "meta": {MAIN: {"name": "Main"}},
            "order": [MAIN],
        }
    data.setdefault("workspaces", {})
    data.setdefault("meta", {})
    data.setdefault("order", [w for w in data["workspaces"]])
    return data


def empty_store():
    return {"version": 2, "workspaces": {}, "meta": {}, "order": []}


def ws_prefix(ws: str) -> str:
    """Entity-id prefix for a workspace's minted selects.
    Main stays UN-prefixed — select.harmonium_porch_activity must
    never change out from under the automations watching it."""
    return "" if ws == MAIN else f"{ws}_"


def deploy_file(ws: str) -> str:
    """Deployed filename under www/harmonium/. Main keeps config.json
    so untouched remotes keep booting."""
    return "config.json" if ws == MAIN else f"config.{ws}.json"


def stub_html(ws: str) -> str:
    """PATH-PER-WORKSPACE entry stub (v0.38): www/harmonium/<ws>/
    index.html — the address IS the workspace.

    CACHE CORRECTNESS (v0.57): the stub used to hand off to a BARE
    ../index.html. HA serves www/ with long cache headers, so a kiosk
    browser kept the engine it first saw while happily re-fetching
    config.json — new config, old engine, and a config that names a
    widget the old engine has never heard of renders as a tile
    labelled "undefined". Diagnosing that from a screenshot is a
    waste of a life.

    So the stub now asks the integration what the deployed engine's
    fingerprint is (unauthenticated, no-store, computed per request
    from the file on disk) and hands off to ../index.html?v=<hash>.
    The ENGINE stays cacheable — instant-on is the whole thesis — but
    its URL changes the moment its bytes do, so every browser refetches
    exactly when it should and never otherwise. No per-device setup,
    no IPs: add the tenth tablet and it inherits this for free.

    The stub itself may be cached forever; its logic is what is
    stable, not the version it resolves. Deliberately ES5 — this runs
    on whatever webview the vendor froze (Fire OS 7 ships Chromium 75).
    """
    return (
        "<!doctype html><meta charset=\"utf-8\">"
        f"<title>Harmonium · {ws}</title>"
        "<script>(function(){"
        f"var h=\"#ws={ws}&pin=0\"+(location.hash.length>1?\"&\"+location.hash.slice(1):\"\");"
        "var go=function(v){location.replace(\"../index.html\"+(v?\"?v=\"+v:\"\")+h);};"
        "try{"
        "var x=new XMLHttpRequest();"
        "x.open(\"GET\",\"/api/harmonium/engine_version?t=\"+(new Date()).getTime(),true);"
        "x.timeout=4000;"
        "x.onreadystatechange=function(){if(x.readyState===4){"
        "var v=null;try{v=JSON.parse(x.responseText).v;}catch(e){}go(v);}};"
        "x.ontimeout=function(){go(null);};"
        "x.onerror=function(){go(null);};"
        "x.send();"
        "}catch(e){go(null);}"
        "})()</script>"
    )


def legacy_redirect_html() -> str:
    """Lives at the OLD prototype path (www/remote-proto/index.html)
    so remotes provisioned with the old start URL keep booting —
    hash rides along, so old #device=/#ws= links still work."""
    return (
        "<!doctype html><meta charset=\"utf-8\">"
        "<title>Harmonium moved</title>"
        "<script>location.replace(\"/local/harmonium/index.html\" + location.hash)"
        "</script>"
    )


def slugify(name: str) -> str:
    slug = _SLUG_RE.sub("_", (name or "").strip().lower()).strip("_")
    return slug or "workspace"


def retarget_selects(config, from_ws: str, to_ws: str):
    """Rewrite minted activity-select refs when a config moves between
    workspaces (duplicate, publish-scratch). String-level over the
    serialized JSON: catches global.activity_select, activity_state,
    and any sequence action that pokes the select."""
    if from_ws == to_ws:
        return config
    fp, tp = ws_prefix(from_ws), ws_prefix(to_ws)

    def sub(m: re.Match) -> str:
        room = m.group(1)
        if fp and room.startswith(fp):
            room = room[len(fp):]
        return f"select.harmonium_{tp}{room}_activity"

    return json.loads(_SELECT_RE.sub(sub, json.dumps(config)))


def wire_activity_selects(config, ws: str):
    """AUTO-WIRE (v0.86 — the Deck/Porch wrong-room bug, 2026-08-30):
    every activity-owning room page gets its minted select written into
    the config as screens[room].activity_select (never overriding an
    explicit value). The engine's roomActivitySelect() can only honor a
    room's select if the config NAMES it — the integration minted them
    but nothing wired them, so a second room's shared controller fell
    through to the GLOBAL select and rendered the wrong room's
    activity. Called on the deploy copy: derived, idempotent, and the
    user can never wire it wrong because they never wire it at all."""
    if not config:
        return config
    screens = config.get("screens") or {}
    prefix = ws_prefix(ws)
    for room, ids in room_hosts(config).items():
        scr = screens.get(room)
        if not isinstance(scr, dict) or scr.get("activity_select"):
            continue
        if not ids:
            continue      # sticky host with no activities — nothing routes
        scr["activity_select"] = f"select.harmonium_{prefix}{room}_activity"
    return config


def unwire_activity_selects(config, ws: str):
    """The inverse of wire_activity_selects, for the WRITE boundary:
    drop screens[room].activity_select wherever it equals the derived
    minted id. The Studio is SERVED wired configs (get_ws), so what it
    posts back carries the wiring — stripping the derived values here
    keeps the store derivation-clean, which is what lets a renamed
    room page heal (the derivation follows the page id; a baked value
    would keep pointing at the old select). An explicit DIFFERENT
    value (a legacy input_select, say) is the user's and stays."""
    if not config:
        return config
    screens = config.get("screens") or {}
    prefix = ws_prefix(ws)
    for room in room_hosts(config):
        scr = screens.get(room)
        if isinstance(scr, dict) and scr.get("activity_select") \
                == f"select.harmonium_{prefix}{room}_activity":
            del scr["activity_select"]
    return config


def room_hosts(config) -> dict[str, list[str]]:
    """STICKY HOSTS (v0.26), workspace-scoped: every room-marked screen
    keeps a select for the life of the page; activity owners join in.
    The overview hub (main_home) is a collection, not a host."""
    screens = (config or {}).get("screens") or {}
    activities = (config or {}).get("activities") or {}
    main_home = ((config or {}).get("global") or {}).get("main_home")
    rooms: dict[str, list[str]] = {}
    for sid, scr in screens.items():
        if sid != main_home and (scr or {}).get("room"):
            rooms.setdefault(sid, [])
    for aid, act in activities.items():
        room = (act or {}).get("room_view")
        if room:
            rooms.setdefault(room, []).append(aid)
    return rooms


# ---------------------------------------------------------------------
# THREE-WAY MERGE (v0.37) — non-destructive reseed.
#
# Main has TWO authors: the repo (yaml → config.json) and the Studio
# (Save & Deploy → the store). The old reseed let the repo overwrite
# everything, erasing Studio-side work (theme resets, Suresh
# 2026-07-26). Now reseed remembers the repo build it last integrated
# (the BASE) and merges per key:
#
#   repo unchanged since base  → the Studio's state stands
#                                (including a Studio DELETION)
#   Studio unchanged since base → the repo's state stands
#                                (including a repo DELETION — no
#                                superseded keys ride back in)
#   both changed the same key  → repo wins, path logged
#
# Dicts merge per key, recursing while both sides are dicts; lists and
# scalars are atomic (element-wise list merging is a trap — a tiles
# array is one authored thing). Pure + HA-free for direct unit runs.
# ---------------------------------------------------------------------

_MISSING = object()


def merge3(base, repo, store, path="", conflicts=None):
    """Merge repo and store against their common base.
    Returns (merged, conflicts) — conflicts is a list of dotted paths
    where both sides changed and the repo won."""
    if conflicts is None:
        conflicts = []
    if repo == store:                       # same change (or both untouched)
        return copy.deepcopy(repo), conflicts
    if repo == base:                        # only the Studio changed
        return copy.deepcopy(store), conflicts
    if store == base:                       # only the repo changed
        return copy.deepcopy(repo), conflicts
    if isinstance(repo, dict) and isinstance(store, dict):
        b = base if isinstance(base, dict) else {}
        out = {}
        # repo's key order leads (stable, mirrors the compiled build);
        # store-only keys follow in their own order
        keys = list(repo) + [k for k in store if k not in repo] + \
               [k for k in b if k not in repo and k not in store]
        for k in keys:
            if k in out:
                continue
            bv = b.get(k, _MISSING)
            rv = repo.get(k, _MISSING)
            sv = store.get(k, _MISSING)
            p = f"{path}.{k}" if path else k
            if rv is _MISSING and sv is _MISSING:
                continue                    # gone from both — stays gone
            if _eq(rv, sv):                 # agreement (incl. same add)
                out[k] = copy.deepcopy(rv)
            elif _eq(rv, bv):               # repo untouched → Studio's call
                if sv is not _MISSING:
                    out[k] = copy.deepcopy(sv)
            elif _eq(sv, bv):               # Studio untouched → repo's call
                if rv is not _MISSING:
                    out[k] = copy.deepcopy(rv)
            elif isinstance(rv, dict) and isinstance(sv, dict):
                out[k], _ = merge3(bv if isinstance(bv, dict) else {},
                                   rv, sv, p, conflicts)
            else:                           # true conflict → repo wins
                conflicts.append(p)
                if rv is not _MISSING:
                    out[k] = copy.deepcopy(rv)
        return out, conflicts
    # non-dict divergence at the top of a subtree → repo wins
    conflicts.append(path or "<root>")
    return copy.deepcopy(repo), conflicts


def _eq(a, b):
    if a is _MISSING or b is _MISSING:
        return a is b
    return a == b
