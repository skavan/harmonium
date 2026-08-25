"""Engine self-deploy — the HACS story's load-bearing wall (v0.82,
beta-gaps §5).

A HACS install delivers ONLY custom_components/harmonium/ — nothing
can hand-copy the engine to www/. So the release zip carries the
engine INSIDE the integration (engine/index.html, placed there by
make-release.bat), and setup deploys it to www/harmonium/index.html
itself. Updates ride the same rail: HACS update → restart → new
bundled fingerprint → redeploy.

THE OWNERSHIP STAMP is what keeps this from fighting the dev
workflow: push-catrock-engine.bat copies engines to www/ without any
integration involvement, and a naive "bundled differs → overwrite"
would REVERT such a push on the next restart. So the integration
records the fingerprint of what IT deployed (.engine.stamp beside
the engine) and only ever overwrites a file that matches its own
stamp. A manual push changes the deployed fingerprint away from the
stamp → the integration keeps its hands off until the next release
bundle catches up.

should_deploy() is pure — tested with plain python, no HA.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

STAMP_FILE = ".engine.stamp"


def should_deploy(bundled_fp: str, deployed_fp: str, stamp_fp: str) -> bool:
    """Decide whether setup may (over)write www/harmonium/index.html.

    bundled_fp  — fingerprint of the engine inside the integration
                  ("" = dev checkout without a bundle: never deploy)
    deployed_fp — fingerprint of what's at www/ ("" = nothing there)
    stamp_fp    — what the integration last deployed ("" = never)
    """
    if not bundled_fp:
        return False              # nothing to deploy (dev checkout)
    if not deployed_fp:
        return True               # empty www — always provision
    if bundled_fp == deployed_fp:
        return False              # already current
    return stamp_fp == deployed_fp   # ours to replace; a manual push is not


def read_stamp(deploy_dir: Path) -> str:
    try:
        return (deploy_dir / STAMP_FILE).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def write_stamp(deploy_dir: Path, fp: str) -> None:
    deploy_dir.mkdir(parents=True, exist_ok=True)
    (deploy_dir / STAMP_FILE).write_text(fp + "\n", encoding="utf-8")


# PER-ASSET STAMPS (v0.84.4) — the same ownership contract as the engine
# stamp, but a map {filename: fingerprint} so a whole DIR of bundled
# assets (skins, sounds) can each be updated-if-ours / preserved-if-
# theirs. should_deploy() decides per file; these just persist the map.
ASSET_STAMP_FILE = ".assets.stamp"


def read_stamps(deploy_dir: Path, name: str = ASSET_STAMP_FILE) -> dict:
    import json
    try:
        data = json.loads((deploy_dir / name).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_stamps(deploy_dir: Path, stamps: dict, name: str = ASSET_STAMP_FILE) -> None:
    deploy_dir.mkdir(parents=True, exist_ok=True)
    (deploy_dir / name).write_text(json.dumps(stamps, indent=1) + "\n",
                                   encoding="utf-8")


def file_fp(path: Path) -> str:
    """8 hex of a file's bytes — the same cheap fingerprint the engine
    deploy uses, reused for any bundled asset. '' when unreadable."""
    try:
        h = hashlib.sha1()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()[:8]
    except OSError:
        return ""


def deploy_bundled_assets(bundled_dir: Path, dest: Path, manifest: bool = False) -> list:
    """Deploy a dir of bundled assets (skins, sounds) with the engine's
    OWNERSHIP contract, per file (v0.84.4). Overwrite a file we recognise
    as our own (stock updates flow); keep our hands off a file whose bytes
    differ from our stamp (a user's own photo/sound is preserved).

    FIRST-RUN ADOPTION: pre-stamp installs have our stock assets on disk
    with no stamp — should_deploy would read them as the user's and freeze
    them forever. On the first stamped run (no .assets.stamp) we claim the
    bundled-named files (they came from our old deploy), bringing everyone
    current; thereafter the stamp governs.

    manifest=True also writes manifest.json {name: fp} (content
    fingerprints of every image present) so the Studio can append ?v=<fp>
    and dodge Fully's hard /local/ cache. Pure + filesystem-only —
    unit-tested in tests/test-integration-split.py."""
    copied: list = []
    if not bundled_dir.is_dir():
        return copied
    dest.mkdir(parents=True, exist_ok=True)
    first_run = not (dest / ASSET_STAMP_FILE).exists()
    stamps = read_stamps(dest)
    for src in sorted(bundled_dir.iterdir()):
        if not src.is_file():
            continue
        b_fp = file_fp(src)
        dep = dest / src.name
        d_fp = file_fp(dep) if dep.exists() else ""
        adopt = first_run and dep.exists() and d_fp != b_fp
        if adopt or should_deploy(b_fp, d_fp, stamps.get(src.name, "")):
            dep.write_bytes(src.read_bytes())
            stamps[src.name] = b_fp
            copied.append(src.name)
        elif d_fp == b_fp and not stamps.get(src.name):
            stamps[src.name] = b_fp        # byte-identical to ours → claim it
    write_stamps(dest, stamps)
    if manifest:
        exts = (".png", ".jpg", ".jpeg", ".webp", ".gif")
        man = {f.name: file_fp(f) for f in sorted(dest.iterdir())
               if f.is_file() and f.suffix.lower() in exts}
        (dest / "manifest.json").write_text(json.dumps(man, indent=1) + "\n",
                                            encoding="utf-8")
    return copied


# ---- THE STOCK/USER PATH SPLIT (v0.84.6) ---------------------------
# Ownership used to be a GUESS: stock skins and a user's own photos
# landed flat in the same www/harmonium/skins/, and only a content
# fingerprint told them apart. Now it is POSITIONAL — the path says who
# owns a file:
#
#   skins/stock/  integration-owned. Only deploy writes here; the
#                 upload endpoint refuses it outright.
#   skins/user/   the user's own photos. We only ever write here to
#                 accept an upload they initiated.
#
# The stamp machinery above is NOT retired — it stays as the backstop
# for the compat window and for noticing tampering inside stock/.
STOCK_SUBDIR = "stock"
USER_SUBDIR = "user"


def skin_manifest(skins_root: Path) -> dict:
    """Content fingerprints for every image under skins/, keyed by the
    path RELATIVE to skins/ ("rs90.png", "stock/rs90.png",
    "user/mine.png") — Fully hard-caches /local/, so the Studio appends
    ?v=<fp> to make a content change a new URL.

    Keying by relative path (not basename) matters once the tree is
    split: a user photo named rs90.png must not inherit the stock
    rs90.png's fingerprint, or the cache-bust would lie."""
    exts = (".png", ".jpg", ".jpeg", ".webp", ".gif")
    man: dict = {}
    if not skins_root.is_dir():
        return man
    for sub in ("", STOCK_SUBDIR, USER_SUBDIR):
        d = skins_root / sub if sub else skins_root
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if f.is_file() and f.suffix.lower() in exts:
                man[(sub + "/" + f.name) if sub else f.name] = file_fp(f)
    return man


def write_skin_manifest(skins_root: Path) -> dict:
    man = skin_manifest(skins_root)
    skins_root.mkdir(parents=True, exist_ok=True)
    (skins_root / "manifest.json").write_text(
        json.dumps(man, indent=1) + "\n", encoding="utf-8")
    return man


def deploy_skins_split(bundled_dir: Path, skins_root: Path) -> dict:
    """Deploy bundled skins into skins/stock/ AND, for one release,
    keep refreshing the legacy FLAT copies (v0.84.6 migration).

    WHY BOTH: configs deployed before this release still reference
    /local/harmonium/skins/<name>.png. healStockSkins repoints them to
    stock/, but heal only runs when the Studio next loads and saves —
    until then the engine is still reading the flat path. Dropping the
    flat copies immediately would blank those remotes' skins in the
    gap. So the flat copies stay CURRENT during the compat window
    (same ownership stamp, so a user's own flat photo is still never
    touched), and a later release can sweep them.

    Returns {"stock": [...], "legacy": [...], "manifest": {...}}."""
    stock = deploy_bundled_assets(bundled_dir, skins_root / STOCK_SUBDIR)
    legacy = deploy_bundled_assets(bundled_dir, skins_root)
    (skins_root / USER_SUBDIR).mkdir(parents=True, exist_ok=True)
    return {"stock": stock, "legacy": legacy,
            "manifest": write_skin_manifest(skins_root)}
