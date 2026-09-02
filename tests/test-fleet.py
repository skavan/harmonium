"""FleetBook unit tests (design-remote-fleet, 2026-09-02) — plain
python, no HA, mirrors pairbook_test's style. Run: python3 tests/test-fleet.py"""
import importlib.util
import sys
from pathlib import Path

# load fleet.py DIRECTLY (the package __init__ imports homeassistant)
_p = Path(__file__).resolve().parent.parent / "custom_components" / "harmonium" / "fleet.py"
_spec = importlib.util.spec_from_file_location("fleet", _p)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
FleetBook, FRESH, ASLEEP = _mod.FleetBook, _mod.FRESH, _mod.ASLEEP

FAILS = []


def ck(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        FAILS.append(name)


clock = {"t": 1000.0}
fb = FleetBook(now=lambda: clock["t"])

# first hello = changed (worth persisting)
ck("first hello reports changed", fb.hello("uabc12", {"name": "astrion", "profile": "astrion",
   "workspace": "main", "version": "0.87.0", "page": "porch", "battery": 80, "ip": "1.2.3.4"}) is True)
# heartbeat with same identity = not worth persisting
clock["t"] += 60
ck("heartbeat reports unchanged", fb.hello("uabc12", {"name": "astrion", "profile": "astrion",
   "workspace": "main", "version": "0.87.0", "page": "hvac", "battery": 79}) is False)
# but volatile fields still updated in memory
row = fb.list()[0]
ck("volatile fields tracked (page, battery)", row["page"] == "hvac" and row["battery"] == 79)
# identity change = changed
ck("profile change reports changed", fb.hello("uabc12", {"profile": "rs90"}) is True)

# liveness math
ck("fresh row reads online", fb.list()[0]["liveness"] == "online")
clock["t"] += FRESH + 60
ck("past the fresh window reads asleep", fb.list()[0]["liveness"] == "asleep")
clock["t"] += ASLEEP
ck("past a day reads stale", fb.list()[0]["liveness"] == "stale")

# a second unit sorts first when fresher
fb.hello("uxyz99", {"name": "kitchen", "profile": "astrion"})
rows = fb.list()
ck("list sorts freshest first", rows[0]["unit"] == "uxyz99" and rows[1]["unit"] == "uabc12")

# persistence round-trip
fb2 = FleetBook(now=lambda: clock["t"])
fb2.seed(fb.dump())
ck("dump/seed round-trips", {r["unit"] for r in fb2.list()} == {"uabc12", "uxyz99"})

# junk resistance
ck("empty unit refused", fb.hello("", {"name": "x"}) is False)
ck("oversized unit refused", fb.hello("u" * 60, {}) is False)
fb.hello("utrim1", {"name": "y" * 500})
ck("string fields capped", len([r for r in fb.list() if r["unit"] == "utrim1"][0]["name"]) == 120)
fb.hello("utrim1", {"evil": "x", "name": "fine"})
ck("unknown fields never stored (allowlist)", "evil" not in fb.dump()["utrim1"])

# the Fully link (fleet v2): Studio-owned, hello-proof
ck("link sets friendly + fully_device", fb.link("uxyz99",
   {"friendly": "Kitchen remote", "fully_device": "devabc"}) is True)
row = [r for r in fb.list() if r["unit"] == "uxyz99"][0]
ck("link fields readable", row["friendly"] == "Kitchen remote" and row["fully_device"] == "devabc")
ck("same link again reports unchanged", fb.link("uxyz99",
   {"friendly": "Kitchen remote"}) is False)
fb.hello("uxyz99", {"name": "kitchen", "friendly": "EVIL", "fully_device": "EVIL"})
row = [r for r in fb.list() if r["unit"] == "uxyz99"][0]
ck("hello can never touch the link fields", row["friendly"] == "Kitchen remote" and
   row["fully_device"] == "devabc")
ck("empty string clears a link field", fb.link("uxyz99", {"fully_device": ""}) is True and
   "fully_device" not in fb.dump()["uxyz99"])
ck("link to unknown unit is False", fb.link("nope", {"friendly": "x"}) is False)

# remove
ck("remove removes", fb.remove("utrim1") is True and
   all(r["unit"] != "utrim1" for r in fb.list()))
ck("remove of unknown is False", fb.remove("nope") is False)

print()
if FAILS:
    print(f"{len(FAILS)} FAILURES"); sys.exit(1)
print("all green")
