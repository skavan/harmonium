"""The remote FLEET ledger — pure stdlib, no Home Assistant imports.

docs/design-remote-fleet.md (2026-09-02, Suresh: "I now have 4 remotes
registered with Harmonium... Surely I should see the remotes? And be
able to manage them"): pairing deliberately burns its session after
handing over the token, so nothing durable ever listed the UNITS.
This ledger is that list. Engines introduce themselves over channels
they already pay for (hello on connect + piggybacked on the existing
25s watchdog every ~5 visible minutes — the battery constraint is the
design's first law); the ledger keeps one row per unit id.

Like pairbook.py this file is deliberately testable with plain
python — tests/test-fleet.py runs on any interpreter.
"""
from __future__ import annotations

import time

# liveness thresholds (seconds) — computed at list time, never stored
FRESH = 6 * 60        # heartbeat is ~5 min; one missed beat still "online"
ASLEEP = 24 * 60 * 60 # seen today = the remote sleeps, as remotes do

# hello fields copied into the row verbatim (allowlist — the view can
# never grow the stored shape by accident)
FIELDS = ("name", "profile", "workspace", "version", "page",
          "battery", "charging", "ip")
# STUDIO-owned fields (fleet v2 — the Fully link): a hello can never
# touch these, only an explicit link() from an authenticated Studio
LINK_FIELDS = ("friendly", "fully_device")


class FleetBook:
    """All rows in a plain dict so the caller owns persistence:
    load() hands back the dict to store, seed() accepts it again."""

    def __init__(self, now=time.time) -> None:
        self._now = now
        self._units: dict[str, dict] = {}

    # ---- persistence (the caller's store does the disk work) ----

    def seed(self, data) -> None:
        if isinstance(data, dict):
            self._units = {k: dict(v) for k, v in data.items()
                           if isinstance(k, str) and isinstance(v, dict)}

    def dump(self) -> dict:
        return {k: dict(v) for k, v in self._units.items()}

    # ---- the engine's side ----

    def hello(self, unit: str, info: dict) -> bool:
        """Upsert one unit's row. Returns True when the row CHANGED in
        a way worth persisting (first sight, or an identity field
        moved) — heartbeats that only refresh last_seen return False
        so the caller can debounce disk writes."""
        unit = str(unit or "").strip()
        if not unit or len(unit) > 40:
            return False
        row = self._units.get(unit)
        fresh = row is None
        if fresh:
            row = {"first_seen": self._now()}
            self._units[unit] = row
        changed = fresh
        for k in FIELDS:
            if k in info:
                v = info.get(k)
                if isinstance(v, str):
                    v = v[:120]
                if row.get(k) != v and k not in ("battery", "charging", "page", "ip"):
                    changed = True
                row[k] = v
        row["last_seen"] = self._now()
        return changed

    # ---- the Studio's side ----

    def link(self, unit: str, patch: dict) -> bool:
        """Set/clear the Studio-owned fields on an EXISTING row —
        friendly (the user's name for the unit) and fully_device (the
        HA device id of its Fully Kiosk twin). Empty string clears a
        field. Returns True when anything changed."""
        row = self._units.get(str(unit))
        if row is None:
            return False
        changed = False
        for k in LINK_FIELDS:
            if k not in patch:
                continue
            v = patch.get(k)
            if not isinstance(v, str):
                continue
            v = v.strip()[:120]
            if v:
                if row.get(k) != v:
                    row[k] = v
                    changed = True
            elif k in row:
                del row[k]
                changed = True
        return changed


    def list(self) -> list[dict]:
        """Rows newest-seen first, each with computed liveness."""
        now = self._now()
        out = []
        for unit, row in self._units.items():
            age = max(0, now - (row.get("last_seen") or 0))
            out.append(dict(row, unit=unit, age=int(age),
                            liveness=("online" if age <= FRESH
                                      else "asleep" if age <= ASLEEP
                                      else "stale")))
        out.sort(key=lambda r: r["age"])
        return out

    def remove(self, unit: str) -> bool:
        return self._units.pop(str(unit), None) is not None
