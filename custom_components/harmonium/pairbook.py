"""The pairing session book — pure stdlib, no Home Assistant imports.

Bluetooth-style numeric-comparison pairing (beta-gaps §1, v0.81):
an UNPROVISIONED remote creates a session and displays its CODE
big on screen; the Studio (an authenticated browser) shows the same
code, the human compares, clicks Approve; the Studio mints a
long-lived token via `auth/long_lived_access_token` on its OWN
websocket and hands it here; the remote's poll collects it ONCE and
the session burns. Nothing in this file touches HA — that is what
makes it testable with plain python (tests/pairbook_test.py runs on
any interpreter, no venv).

Security posture, in one place:
  · create is unauthenticated but cheap to refuse: per-IP rate limit
    (RATE_MAX per RATE_WINDOW) and a global pending cap.
  · a session id is 128 random bits; the code is only the HUMAN
    check — knowing a code approves nothing.
  · approve/deny require an authenticated admin (the views enforce
    it) and name the SESSION, not the code.
  · the token is released exactly once, to the session's poller,
    then the session is deleted. TTL sweeps the forgotten.
"""
from __future__ import annotations

import secrets
import time

# unambiguous at 3 metres on a 5" panel: no 0/O/Q, 1/I/L, 2/Z, 5/S, 8/B
CODE_LETTERS = "ACDEFGHJKMNPRTUVWXY"
CODE_DIGITS = "34679"

TTL = 300.0          # a pairing offer lives 5 minutes
RATE_WINDOW = 60.0   # per-IP create limit: RATE_MAX per RATE_WINDOW
RATE_MAX = 5
MAX_PENDING = 5      # book-wide cap — a LAN can't wallpaper the Studio


def _mint_code() -> str:
    return ("".join(secrets.choice(CODE_LETTERS) for _ in range(3)) + "-" +
            "".join(secrets.choice(CODE_DIGITS) for _ in range(3)))


class PairBook:
    """All state in memory — a reboot forgets pending offers, which is
    the correct failure for a security handshake."""

    def __init__(self, now=time.monotonic) -> None:
        self._now = now
        self._sessions: dict[str, dict] = {}
        self._creates: dict[str, list[float]] = {}   # ip → timestamps

    # ---- the remote's side (unauthenticated views) ----

    def create(self, ip: str, name: str = "") -> dict | None:
        """New pairing offer. None = rate-limited or book full."""
        self._sweep()
        now = self._now()
        stamps = [t for t in self._creates.get(ip, []) if now - t < RATE_WINDOW]
        if len(stamps) >= RATE_MAX:
            return None
        if len(self._sessions) >= MAX_PENDING:
            return None
        stamps.append(now)
        self._creates[ip] = stamps
        sid = secrets.token_hex(16)
        self._sessions[sid] = {
            "code": _mint_code(),
            "name": (name or "").strip()[:40],
            "born": now,
            "token": None,
            "denied": False,
        }
        return {"session": sid, "code": self._sessions[sid]["code"]}

    def poll(self, sid: str) -> dict:
        """The remote asks after its offer. An approved session hands
        over the token EXACTLY once and burns."""
        self._sweep()
        s = self._sessions.get(sid)
        if s is None:
            return {"status": "gone"}
        if s["denied"]:
            del self._sessions[sid]
            return {"status": "denied"}
        if s["token"]:
            token = s["token"]
            del self._sessions[sid]
            return {"status": "approved", "token": token}
        return {"status": "pending"}

    def cancel(self, sid: str) -> bool:
        """The remote backs out (its own session id is its right)."""
        return self._sessions.pop(sid, None) is not None

    # ---- the Studio's side (authenticated views) ----

    def pending(self) -> list[dict]:
        self._sweep()
        now = self._now()
        return [
            {"session": sid, "code": s["code"], "name": s["name"],
             "age": int(now - s["born"])}
            for sid, s in sorted(self._sessions.items(),
                                 key=lambda kv: kv[1]["born"])
            if not s["denied"] and not s["token"]
        ]

    def approve(self, sid: str, token: str) -> bool:
        self._sweep()
        s = self._sessions.get(sid)
        if s is None or s["denied"] or s["token"] or not token:
            return False
        s["token"] = token
        return True

    def deny(self, sid: str) -> bool:
        self._sweep()
        s = self._sessions.get(sid)
        if s is None:
            return False
        s["denied"] = True
        return True

    # ---- housekeeping ----

    def _sweep(self) -> None:
        now = self._now()
        for sid in [k for k, s in self._sessions.items()
                    if now - s["born"] > TTL]:
            del self._sessions[sid]
        for ip in [k for k, ts in self._creates.items()
                   if all(now - t >= RATE_WINDOW for t in ts)]:
            del self._creates[ip]
