"""deploy_bundled_assets — the resilient stock-asset lifecycle (v0.84.4).
Pure filesystem test, no HA. Covers: fresh provision, stock update flows,
user files preserved, first-run adoption of pre-stamp stock, and the
cache-bust manifest tracking actual bytes."""
import importlib.util
import json
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "packaging", str(Path(__file__).resolve().parents[1]
                     / "custom_components/harmonium/packaging.py"))
pk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pk)

fails = []


def check(name, cond):
    print(("ok  " if cond else "FAIL") + " " + name)
    if not cond:
        fails.append(name)


def mk(d, name, data):
    (d / name).write_bytes(data if isinstance(data, bytes) else data.encode())


tmp = Path(tempfile.mkdtemp())
bundled = tmp / "bundle"; bundled.mkdir()
dest = tmp / "www" / "skins"

# --- fresh provision ---
mk(bundled, "rs90.png", b"RS90-v1")
mk(bundled, "astrion.png", b"ASTRION-v1")
copied = pk.deploy_bundled_assets(bundled, dest, manifest=True)
check("fresh: both deployed", sorted(copied) == ["astrion.png", "rs90.png"])
check("fresh: bytes landed", (dest / "rs90.png").read_bytes() == b"RS90-v1")
man = json.loads((dest / "manifest.json").read_text())
check("fresh: manifest has both", set(man) == {"rs90.png", "astrion.png"})
check("fresh: manifest fp matches bytes", man["rs90.png"] == pk.file_fp(dest / "rs90.png"))

# --- no-op second run (already current) ---
copied = pk.deploy_bundled_assets(bundled, dest, manifest=True)
check("rerun: nothing copied", copied == [])

# --- STOCK UPDATE: bundle changes → flows to an unmodified install ---
mk(bundled, "rs90.png", b"RS90-v2-NICER")
copied = pk.deploy_bundled_assets(bundled, dest, manifest=True)
check("update: rs90 re-deployed", copied == ["rs90.png"])
check("update: new bytes landed", (dest / "rs90.png").read_bytes() == b"RS90-v2-NICER")
man = json.loads((dest / "manifest.json").read_text())
check("update: manifest fp changed (cache-bust)", man["rs90.png"] == pk.file_fp(dest / "rs90.png"))

# --- USER FILE preserved: user replaces astrion.png with their own photo ---
mk(dest, "astrion.png", b"MY-OWN-PHOTO")
copied = pk.deploy_bundled_assets(bundled, dest, manifest=True)
check("user: astrion NOT overwritten", (dest / "astrion.png").read_bytes() == b"MY-OWN-PHOTO")
check("user: astrion not in copied", "astrion.png" not in copied)
# and a later stock bump to astrion still leaves the user's file alone
mk(bundled, "astrion.png", b"ASTRION-v2")
copied = pk.deploy_bundled_assets(bundled, dest, manifest=True)
check("user: stock bump still preserves user astrion", (dest / "astrion.png").read_bytes() == b"MY-OWN-PHOTO")

# --- FIRST-RUN ADOPTION: pre-stamp install (old stock on disk, no stamp) ---
dest2 = tmp / "legacy" / "skins"; dest2.mkdir(parents=True)
mk(dest2, "rs90.png", b"RS90-OLD-STOCK")          # deployed by the OLD (unstamped) code
assert not (dest2 / pk.ASSET_STAMP_FILE).exists()
mk(bundled, "rs90.png", b"RS90-v2-NICER")
copied = pk.deploy_bundled_assets(bundled, dest2, manifest=True)
check("adopt: old stock claimed + updated", (dest2 / "rs90.png").read_bytes() == b"RS90-v2-NICER")
check("adopt: rs90 in copied", "rs90.png" in copied)
# subsequent run is a stable no-op (stamp now governs)
copied = pk.deploy_bundled_assets(bundled, dest2, manifest=True)
check("adopt: stable after adoption", "rs90.png" not in copied)


# ===================================================================
# THE STOCK/USER PATH SPLIT (v0.84.6) — ownership becomes POSITIONAL.
# ===================================================================
tmp2 = Path(tempfile.mkdtemp())
bundled2 = tmp2 / "bundle"; bundled2.mkdir()
mk(bundled2, "rs90.png", b"RS90-STOCK-A")
mk(bundled2, "astrion.png", b"ASTRION-STOCK-A")

# --- the flat-claim registry itself: rs90 must NEVER be claimable flat
#     (no release ever shipped a flat rs90.png — every one in the wild
#     is a user's own photo) ---
check("registry: rs90 absent from PRE_SPLIT_FLAT_FPS",
      "rs90.png" not in pk.PRE_SPLIT_FLAT_FPS)
check("registry: astrion names present",
      {"astrion.png", "astrion2.png"} <= set(pk.PRE_SPLIT_FLAT_FPS))

# --- fresh install: stock lands in stock/, user/ is created empty.
#     The flat compat pass writes ONLY pre-split names — rs90 was never
#     flat, so it must not START being flat now. ---
skins = tmp2 / "www" / "skins"
res = pk.deploy_skins_split(bundled2, skins)
check("split: stock deployed under stock/", sorted(res["stock"]) == ["astrion.png", "rs90.png"])
check("split: stock bytes in stock/", (skins / "stock" / "rs90.png").read_bytes() == b"RS90-STOCK-A")
check("split: user/ dir exists", (skins / "user").is_dir())
check("split: legacy flat written for pre-split names (compat window)",
      (skins / "astrion.png").read_bytes() == b"ASTRION-STOCK-A")
check("split: rs90 NOT created flat (never shipped flat)",
      not (skins / "rs90.png").exists())

# --- manifest is keyed by path RELATIVE to skins/ ---
man = json.loads((skins / "manifest.json").read_text())
check("split: manifest keys are relative paths",
      "stock/rs90.png" in man and "astrion.png" in man)
check("split: manifest fp matches stock bytes",
      man["stock/rs90.png"] == pk.file_fp(skins / "stock" / "rs90.png"))

# --- A USER PHOTO NAMED LIKE A STOCK ONE is untouched, and keeps its
#     OWN fingerprint (basename keying would have collided) ---
mk(skins / "user", "rs90.png", b"MY-OWN-RS90-PHOTO")
res = pk.deploy_skins_split(bundled2, skins)
check("split: user photo of the same name survives deploy",
      (skins / "user" / "rs90.png").read_bytes() == b"MY-OWN-RS90-PHOTO")
man = json.loads((skins / "manifest.json").read_text())
check("split: user photo has its own manifest entry",
      man["user/rs90.png"] == pk.file_fp(skins / "user" / "rs90.png"))
check("split: user + stock fps differ (no basename collision)",
      man["user/rs90.png"] != man["stock/rs90.png"])

# --- STOCK UPDATE flows to stock/ AND to the pre-split flat copy, so a
#     config that has not been healed yet still sees current bytes ---
mk(bundled2, "astrion.png", b"ASTRION-STOCK-B")
res = pk.deploy_skins_split(bundled2, skins)
check("split: stock update reaches stock/",
      (skins / "stock" / "astrion.png").read_bytes() == b"ASTRION-STOCK-B")
check("split: stock update reaches the legacy flat copy",
      (skins / "astrion.png").read_bytes() == b"ASTRION-STOCK-B")
check("split: user photo STILL untouched by the update",
      (skins / "user" / "rs90.png").read_bytes() == b"MY-OWN-RS90-PHOTO")

# --- MIGRATION from a pre-split (v0.84.1) install: flat files, no
#     stock/ dir, no stamp. Adoption must be CONSERVATIVE — claim only
#     bytes we KNOW we shipped. THE CASE THAT MATTERS: a user's own
#     photo named rs90.png sits flat (we never shipped one, the
#     cookbook told them to put it there) — it must survive with its
#     bytes AND its manifest identity intact. ---
import hashlib
old_astrion = b"ASTRION-OLD-STOCK"
fps = {"astrion.png": (hashlib.sha1(old_astrion).hexdigest()[:8],),
       "astrion2.png": ()}
legacy = tmp2 / "legacy" / "skins"; legacy.mkdir(parents=True)
mk(legacy, "astrion.png", old_astrion)          # our old stock, unstamped
mk(legacy, "rs90.png", b"THEIR-RS90-PHOTO")     # THEIR photo, stock name
mk(legacy, "grandpa.png", b"USER-HEIRLOOM")     # their own flat photo
res = pk.deploy_skins_split(bundled2, legacy, adopt_fps=fps)
check("migrate: stock/ created and filled",
      (legacy / "stock" / "rs90.png").read_bytes() == b"RS90-STOCK-A")
check("migrate: known pre-split stock adopted + updated",
      (legacy / "astrion.png").read_bytes() == b"ASTRION-STOCK-B")
check("migrate: user's flat rs90.png photo NOT eaten",
      (legacy / "rs90.png").read_bytes() == b"THEIR-RS90-PHOTO")
check("migrate: the user's own flat photo is grandfathered untouched",
      (legacy / "grandpa.png").read_bytes() == b"USER-HEIRLOOM")
man = json.loads((legacy / "manifest.json").read_text())
check("migrate: manifest covers flat + stock",
      "grandpa.png" in man and "stock/rs90.png" in man)
check("migrate: flat rs90 keeps its OWN fingerprint",
      man["rs90.png"] != man["stock/rs90.png"])
# a second run is stable: still not adopted, still theirs
res = pk.deploy_skins_split(bundled2, legacy, adopt_fps=fps)
check("migrate: user's flat rs90.png stable across restarts",
      (legacy / "rs90.png").read_bytes() == b"THEIR-RS90-PHOTO")

# --- unknown bytes under a pre-split NAME are also the user's: an
#     astrion.png they uploaded over ours (overwrite=1 existed) ---
legacy2 = tmp2 / "legacy2" / "skins"; legacy2.mkdir(parents=True)
mk(legacy2, "astrion.png", b"THEIR-ASTRION-PHOTO")
res = pk.deploy_skins_split(bundled2, legacy2, adopt_fps=fps)
check("migrate: unknown flat astrion bytes preserved (their upload)",
      (legacy2 / "astrion.png").read_bytes() == b"THEIR-ASTRION-PHOTO")

print(("\nasset-deploy: %d ok / %d FAIL" %
       (0, len(fails))) if fails else "\nasset-deploy: ALL PASS")
raise SystemExit(1 if fails else 0)
