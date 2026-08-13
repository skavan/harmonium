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
