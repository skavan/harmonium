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
    """MDI, from HA's own frontend package. static/mdi/ holds the
    full set CHUNKED across ~50 hash-named JSONs ({name: pathdata},
    ~150 icons each) beside iconList.json (a names+keywords index)
    and iconMetadata.json — so the table is the UNION of every chunk
    (round 6, his stock-HA comparison: the first cut took the single
    biggest file and called it MDI, which served ~200 icons and left
    mdi:projector "missing"). `frontend` is located by the caller so
    this stays importable and testable without hass_frontend."""
    if not frontend:
        return None
    mdi_dir = frontend / "static" / "mdi"
    if not mdi_dir.is_dir():
        return None
    out: dict = {}
    for f in sorted(mdi_dir.glob("*.json")):
        if f.name in ("iconList.json", "iconMetadata.json"):
            continue                     # index + metadata, not paths
        try:
            data = json.loads(f.read_text("utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        for n, d in data.items():
            # every mdi path starts at an absolute moveto — anything
            # else (a stray metadata value) is not an icon
            if isinstance(d, str) and d[:1] in ("M", "m"):
                out[n] = ("0 0 24 24", d)
    return out or None


SOURCES = {"phu": _phu_source, "mdi": _mdi_source}


# ---- the distilled-file fallback (2026-09-02) ----------------------
# www/harmonium/icons/<set>/<name>.svg is both the hand-dropped
# escape hatch AND where studio-resolved custom-set icons land
# (save_resolved below). A file in the simple one-path shape
# (svg_for's own output) parses back to (viewBox, path), so a set
# with no python source still resolves, previews, and MINTS. A
# hand-dropped multi-element svg stays file-rendered on the remote —
# honest, just not inline-mintable.

_FILE_SVG = re.compile(
    r'viewBox="([\d.\s eE+-]+)"[^>]*>\s*<path[^>]*\sd="([^"]+)"')


def _file_lookup(www: Path, set_: str, name: str):
    if not ICON_REF_RE.match(set_ + ":" + name):
        return None
    f = www / "harmonium" / "icons" / set_ / (name + ".svg")
    try:
        m = _FILE_SVG.search(f.read_text("utf-8"))
    except OSError:
        return None
    return (m.group(1).strip(), m.group(2)) if m else None


def _file_names(www: Path, set_: str):
    d = www / "harmonium" / "icons" / set_
    try:
        return sorted(f.stem for f in d.glob("*.svg"))
    except OSError:
        return []


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
        if table is not None and nm in table:
            vb, d = table[nm]
            found[ref] = {"viewBox": vb, "path": d}
            continue
        # the distilled-file fallback: studio-saved custom-set icons
        # and simple hand-dropped files resolve (and mint) from disk
        hit = _file_lookup(www, st, nm)
        if hit:
            found[ref] = {"viewBox": hit[0], "path": hit[1]}
        elif table is None:
            if st not in no_source:
                no_source.append(st)
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
        # a set with no python source may still have distilled files
        # (studio-saved custom icons, hand-dropped SVGs)
        files = {}
        for n in _file_names(www, set_):
            hit = _file_lookup(www, set_, n)
            if hit:
                files[n] = hit
        if not files:
            return {"icons": [], "no_source": True}
        table = files
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


def search_icons(query: str, www: Path, frontend: Path | None = None,
                 sources: dict | None = None, limit: int = 60) -> dict:
    """CROSS-SET search (2026-09-02 — his screenshot of HA's tile
    card picker: "The search starts from the first key across
    multiple icon sets"): one query, hits from EVERY installed
    source, prefix matches leading inside each set, sets interleaved
    fairly so mdi's 7,400 names can't drown phu's. Rows carry set +
    path data, so every hit previews and the pick needs no second
    call. {'icons': [{set, name, viewBox, path}], 'sets': [installed
    set names]} — no query returns just the installed-set roster."""
    srcs = SOURCES if sources is None else sources
    # mdi/custom packs name with hyphens, phu with underscores — a
    # search must cross that line, so everything compares hyphenated
    q = re.sub(r"[ _]", "-", (query or "").lower().strip())
    canon = lambda n: n.lower().replace("_", "-")  # noqa: E731
    per_set: list = []
    installed: list = []
    tables: dict = {}
    for st in sorted(srcs):
        table = _load_source(st, www, frontend, srcs)
        if table is not None:
            tables[st] = table
    # distilled-file sets (studio-saved / hand-dropped) join the
    # search too — they are small, so per-query parsing is cheap
    icons_root = www / "harmonium" / "icons"
    if icons_root.is_dir():
        for d in sorted(icons_root.iterdir()):
            st = d.name
            if not d.is_dir() or st in tables or st == "material":
                continue
            files = {}
            for n in _file_names(www, st):
                hit = _file_lookup(www, st, n)
                if hit:
                    files[n] = hit
            if files:
                tables[st] = files
    for st in sorted(tables):
        table = tables[st]
        installed.append(st)
        if not q:
            continue
        names = [n for n in table if q in canon(n)]
        names.sort(key=lambda n: (0 if canon(n).startswith(q) else 1,
                                  len(n), n))
        per_set.append((st, names, table))
    out = []
    if q:
        # round-robin across sets: everyone's best hits make the cut
        i = 0
        while len(out) < max(limit, 1):
            row = [(st, names[i], table)
                   for st, names, table in per_set if i < len(names)]
            if not row:
                break
            for st, n, table in row:
                vb, d = table[n]
                out.append({"set": st, "name": n, "viewBox": vb,
                            "path": d})
                if len(out) >= max(limit, 1):
                    break
            i += 1
    return {"icons": out, "sets": installed}


_PATH_OK = re.compile(r"^[MmZzLlHhVvCcSsQqTtAa0-9eE.,\s+-]+$")
_VB_OK = re.compile(r"^[\d.\s eE+-]+$")


def save_resolved(refs: dict, www: Path) -> dict:
    """Persist studio-resolved custom-set icons (2026-09-02): the
    Studio runs the packs' own registered resolvers in the browser
    (the HA customIcons/customIconsets contract) and POSTs the
    results here; each becomes a distilled file under
    www/harmonium/icons/<set>/ under the same ownership stamps as
    the distiller — a user's hand-replaced SVG is never overwritten.
    From then on the set previews, mints, and renders server-side
    with no browser in the loop. Input {'set:name': {'viewBox': vb,
    'path': d}}; returns {'written': [...], 'rejected': [...]}."""
    by_set: dict = {}
    rejected: list = []
    for ref, v in (refs or {}).items():
        m = ICON_REF_RE.match(ref or "")
        vb = str((v or {}).get("viewBox") or "0 0 24 24")
        d = str((v or {}).get("path") or "")
        if (not m or m.group(1) == "material" or len(d) > 20000
                or not _PATH_OK.match(d) or not _VB_OK.match(vb)):
            rejected.append(ref)
            continue
        by_set.setdefault(m.group(1), {})[m.group(2)] = (vb, d)
    written: list = []
    for st, names in sorted(by_set.items()):
        dest = www / "harmonium" / "icons" / st
        stamps = read_stamps(dest, ICON_STAMP_FILE) if dest.is_dir() else {}
        wrote = False
        for n, (vb, d) in sorted(names.items()):
            fname = n + ".svg"
            body = svg_for(vb, d).encode("utf-8")
            dep = dest / fname
            d_fp = file_fp(dep) if dep.exists() else ""
            b_fp = hashlib.sha1(body).hexdigest()[:8]
            if should_deploy(b_fp, d_fp, stamps.get(fname, "")):
                dest.mkdir(parents=True, exist_ok=True)
                dep.write_bytes(body)
                stamps[fname] = b_fp
                written.append(st + ":" + n)
                wrote = True
            elif d_fp == b_fp and not stamps.get(fname):
                stamps[fname] = b_fp
                wrote = True
        if wrote:
            write_stamps(dest, stamps, ICON_STAMP_FILE)
    return {"written": written, "rejected": rejected}


def ci_icon_to_path(icn) -> tuple[str, str] | None:
    """thomasloven's hass-custom_icons IconData → our (viewBox, path),
    or None when the icon isn't expressible as one plain path (2026-
    09-02, round 4 of the icon saga: his fa6-solid: icons come from
    that integration's Iconify collection — a python service in the
    SAME process, so Harmonium asks it directly; no browser, no
    sandbox, no deadline games). Shapes seen in its collections:
      fapro:   {viewBox, path, path2?}         (path2 = duotone layer)
      iconify: {left, top, width, height, body: '<path d=.../>...',
                rotate?, hFlip?, vFlip?}       (+ per-icon overrides)
    A body of pure <path> elements concatenates into one d (subpaths);
    anything else — transforms, rects, groups — is honestly None."""
    if not isinstance(icn, dict):
        return None
    if icn.get("rotate") or icn.get("hFlip") or icn.get("vFlip"):
        return None                      # would render wrong un-transformed
    d = icn.get("path")
    if d:
        if icn.get("path2"):
            d = str(d) + " " + str(icn["path2"])
        vb = str(icn.get("viewBox") or "0 0 24 24")
        return (vb, str(d)) if _VB_OK.match(vb) and _PATH_OK.match(str(d)) else None
    body = icn.get("body")
    if isinstance(body, str) and body.strip():
        rest = re.sub(r"<path\b[^>]*>\s*(</path>)?", "", body).strip()
        if rest:
            return None                  # more than plain paths in there
        parts = re.findall(r'<path\b[^>]*\sd="([^"]+)"', body)
        if not parts or not all(_PATH_OK.match(p) for p in parts):
            return None
        vb = "%s %s %s %s" % (icn.get("left", 0), icn.get("top", 0),
                              icn.get("width", 16), icn.get("height", 16))
        return (vb, " ".join(parts)) if _VB_OK.match(vb) else None
    return None


def mint_icon_paths(config, www: Path, frontend: Path | None = None,
                    sources: dict | None = None) -> dict:
    """Everything a config references, resolved for baking into the
    deployed artifact as config['icon_paths'] — same report shape as
    resolve_icons. Deploy-only: the stored user layer never carries
    icon_paths (store.py adds it after the write boundary)."""
    refs = sorted({s + ":" + n for s, n in iter_icon_refs(config)})
    return resolve_icons(refs, www, frontend, sources)
