"""Icon-set resolver (0.87 — docs/design-icon-sets.md).

Suresh's rulings: support ANYTHING HA has installed (2026-08-31),
and the icon flow is "live preview in the Studio, then mint into the
deployed artifacts" (2026-09-01). One resolver serves both: the
Studio's /api/harmonium/icons lookup answers as the user types, and
every deploy MINTS the referenced icons' path data straight into the
deployed config (config.icon_paths) — the remote renders inline SVG
and depends on no pack, no file, no network at runtime. Harmonium
never redistributes a set — everything resolved comes from an
artifact the user installed themselves.

The v1 file distiller (www/harmonium/icons/<set>/<name>.svg,
mask-rendered) survives below as the HAND-DROPPED escape hatch: a
user's own SVG in that folder still renders on the remote.

Sources v1:
  phu:  Custom Brand Icons — the installed HACS Lovelace module at
        www/community/custom-brand-icons/ (icon table in JS:
        "name":[x,y,w,h,"pathdata"] — regex-extracted, no JS engine).
  mdi:  Home Assistant's OWN frontend ships every MDI path as JSON
        (hass_frontend/static/mdi/<hash>.json) — no network, no
        vendoring, present on every HA install.
A future set is one SOURCES entry: detect(paths) -> {name: (viewbox,
path)} or None when not installed.

Ownership: per-file stamps (packaging.read_stamps — the skins/logos
contract). A distilled file we recognise as ours refreshes when the
source changes; a user's hand-replaced SVG is never overwritten.

Pure functions + filesystem; no HA imports. Unit-tested in
tests/test-icon-distill.py.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from .packaging import file_fp, read_stamps, should_deploy, write_stamps

ICON_REF_RE = re.compile(r"^([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$")
ICON_STAMP_FILE = ".icons.stamp"


# ---- what the config asks for --------------------------------------

def iter_icon_refs(node):
    """Every '<set>:<name>' under any key named 'icon', anywhere in a
    config — tiles, present entries, devices, cast groups, apps. The
    material: namespace is the font, not a set."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "icon" and isinstance(v, str):
                m = ICON_REF_RE.match(v)
                if m and m.group(1) != "material":
                    yield m.group(1), m.group(2)
            else:
                yield from iter_icon_refs(v)
    elif isinstance(node, list):
        for v in node:
            yield from iter_icon_refs(v)


# ---- installed sources ---------------------------------------------

_PHU_ENTRY = re.compile(
    r'"([A-Za-z0-9_-]+)":\[(\d+),(\d+),(\d+),(\d+),"((?:[^"\\]|\\.)*)"\]')


def _phu_source(www: Path, _frontend: Path | None):
    """Custom Brand Icons, from the user's HACS install."""
    root = www / "community" / "custom-brand-icons"
    if not root.is_dir():
        return None
    out: dict = {}
    for js in sorted(root.glob("*.js")):
        try:
            text = js.read_text("utf-8", errors="replace")
        except OSError:
            continue
        for m in _PHU_ENTRY.finditer(text):
            vb = " ".join(m.group(i) for i in range(2, 6))
            out[m.group(1)] = (vb, m.group(6))
    return out or None


def _mdi_source(_www: Path, frontend: Path | None):
    """MDI, from HA's own frontend package (static/mdi/<hash>.json —
    {name: pathdata}). `frontend` is located by the caller so this
    stays importable and testable without hass_frontend."""
    if not frontend:
        return None
    mdi_dir = frontend / "static" / "mdi"
    if not mdi_dir.is_dir():
        return None
    best: dict = {}
    for f in sorted(mdi_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text("utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and len(data) > len(best):
            best = data
    return ({n: ("0 0 24 24", d) for n, d in best.items()
             if isinstance(d, str)} or None)


SOURCES = {"phu": _phu_source, "mdi": _mdi_source}

# ---- source cache (2026-09-01 — "the icon drop-down is so slow its
# unusable"): parsing a pack (regex over the HACS module, a several-
# thousand-entry JSON) per request made every keystroke a re-parse.
# One load per (set, source mtimes); a pack update invalidates. ----
_SRC_CACHE: dict = {}


def _src_key(set_: str, www: Path, frontend: Path | None):
    try:
        if set_ == "phu":
            root = www / "community" / "custom-brand-icons"
            return tuple(sorted((str(f), f.stat().st_mtime_ns)
                                for f in root.glob("*.js")))
        if set_ == "mdi" and frontend:
            mdi = frontend / "static" / "mdi"
            return tuple(sorted((str(f), f.stat().st_mtime_ns)
                                for f in mdi.glob("*.json")))
    except OSError:
        pass
    return None


def _load_source(set_: str, www: Path, frontend: Path | None,
                 srcs: dict):
    if set_ not in srcs:
        return None
    key = _src_key(set_, www, frontend)
    if key is not None:
        hit = _SRC_CACHE.get(set_)
        if hit and hit[0] == key:
            return hit[1]
    table = srcs[set_](www, frontend)
    if key is not None:
        _SRC_CACHE[set_] = (key, table)
    return table


def frontend_root() -> Path | None:
    """Where hass_frontend lives on this install (None outside HA)."""
    try:
        import hass_frontend  # type: ignore
        return Path(hass_frontend.where())
    except Exception:  # noqa: BLE001 — absence is a normal answer
        return None


# ---- the distiller --------------------------------------------------

def svg_for(viewbox: str, path_data: str) -> str:
    """One masked-renderable SVG. fill is inherited-irrelevant (the
    engine paints through the alpha), but black keeps the file sane
    when opened directly."""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'
            + viewbox + '"><path d="' + path_data + '"/></svg>\n')


def distill_icons(www: Path, config, frontend: Path | None = None,
                  sources: dict | None = None) -> dict:
    """Materialize every referenced set icon that an installed source
    can supply. Returns a report the caller may log:
      {"written": [set:name...], "missing": [set:name...],
       "no_source": [set...]} — `missing` = the source is installed
    but lacks the name; `no_source` = no installed pack for the set
    (a hand-dropped file still renders; the Studio warns)."""
    srcs = SOURCES if sources is None else sources
    refs: dict = {}
    for s, n in iter_icon_refs(config):
        refs.setdefault(s, set()).add(n)
    report = {"written": [], "missing": [], "no_source": []}
    loaded: dict = {}
    for s, names in sorted(refs.items()):
        if s not in loaded:
            loaded[s] = srcs[s](www, frontend) if s in srcs else None
        table = loaded[s]
        if table is None:
            report["no_source"].append(s)
            continue
        dest = www / "harmonium" / "icons" / s
        stamps = read_stamps(dest, ICON_STAMP_FILE) if dest.is_dir() else {}
        wrote = False
        for n in sorted(names):
            if n not in table:
                report["missing"].append(s + ":" + n)
                continue
            fname = n + ".svg"
            body = svg_for(*table[n]).encode("utf-8")
            dep = dest / fname
            d_fp = file_fp(dep) if dep.exists() else ""
            b_fp = hashlib.sha1(body).hexdigest()[:8]
            # ours-or-absent updates; a user's own bytes are frozen
            if should_deploy(b_fp, d_fp, stamps.get(fname, "")):
                dest.mkdir(parents=True, exist_ok=True)
                dep.write_bytes(body)
                stamps[fname] = b_fp
                report["written"].append(s + ":" + n)
                wrote = True
            elif d_fp == b_fp and not stamps.get(fname):
                stamps[fname] = b_fp        # identical → claim it
                wrote = True
        if wrote:
            write_stamps(dest, stamps, ICON_STAMP_FILE)
    return report


# ---- the resolver (2026-09-01 — one lookup for preview AND mint) ----

def resolve_icons(names, www: Path, frontend: Path | None = None,
                  sources: dict | None = None) -> dict:
    """{'found': {'<set>:<name>': {'viewBox': vb, 'path': d}},
        'missing': [refs the installed pack lacks],
        'no_source': [sets with no installed pack]}"""
    srcs = SOURCES if sources is None else sources
    found: dict = {}
    missing: list = []
    no_source: list = []
    loaded: dict = {}
    for ref in names:
        m = ICON_REF_RE.match(ref or "")
        if not m or m.group(1) == "material":
            continue
        st, nm = m.group(1), m.group(2)
        if st not in loaded:
            loaded[st] = _load_source(st, www, frontend, srcs)
        table = loaded[st]
        if table is None:
            if st not in no_source:
                no_source.append(st)
            continue
        if nm in table:
            vb, d = table[nm]
            found[ref] = {"viewBox": vb, "path": d}
        else:
            missing.append(ref)
    return {"found": found, "missing": missing, "no_source": no_source}


def list_icons(set_: str, query: str, www: Path,
               frontend: Path | None = None, sources: dict | None = None,
               limit: int = 60) -> dict:
    """Autocomplete for the Studio's icon box (2026-09-01 — Suresh:
    "when I start typing phu: I get the same dropdown I get when we
    type material:"): the installed pack's names filtered by the
    typed fragment, WITH their path data so every row previews and
    the pick needs no second lookup. {'icons': [{name, viewBox,
    path}], 'no_source': bool}"""
    srcs = SOURCES if sources is None else sources
    table = _load_source(set_, www, frontend, srcs)
    if table is None:
        return {"icons": [], "no_source": True}
    q = (query or "").lower()
    names = sorted(n for n in table if q in n.lower()) if q \
        else sorted(table)
    # prefix matches first — the HA picker's feel
    names.sort(key=lambda n: (0 if n.lower().startswith(q) else 1, n))
    if limit > 0:
        names = names[:min(limit, 500)]
    # limit 0 = the WHOLE pack, one call — the Studio caches it and
    # filters locally, so typing costs nothing after the first fetch
    out = []
    for n in names:
        vb, d = table[n]
        out.append({"name": n, "viewBox": vb, "path": d})
    return {"icons": out, "no_source": False}


def mint_icon_paths(config, www: Path, frontend: Path | None = None,
                    sources: dict | None = None) -> dict:
    """Everything a config references, resolved for baking into the
    deployed artifact as config['icon_paths'] — same report shape as
    resolve_icons. Deploy-only: the stored user layer never carries
    icon_paths (store.py adds it after the write boundary)."""
    refs = sorted({s + ":" + n for s, n in iter_icon_refs(config)})
    return resolve_icons(refs, www, frontend, sources)
