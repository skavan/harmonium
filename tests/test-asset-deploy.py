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

# --- fresh install: stock lands in stock/, user/ is created empty ---
skins = tmp2 / "www" / "skins"
res = pk.deploy_skins_split(bundled2, skins)
check("split: stock deployed under stock/", sorted(res["stock"]) == ["astrion.png", "rs90.png"])
check("split: stock bytes in stock/", (skins / "stock" / "rs90.png").read_bytes() == b"RS90-STOCK-A")
check("split: user/ dir exists", (skins / "user").is_dir())
check("split: legacy flat also written (compat window)",
      (skins / "rs90.png").read_bytes() == b"RS90-STOCK-A")

# --- manifest is keyed by path RELATIVE to skins/ ---
man = json.loads((skins / "manifest.json").read_text())
check("split: manifest keys are relative paths",
      "stock/rs90.png" in man and "rs90.png" in man)
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

# --- STOCK UPDATE flows to stock/ AND to the legacy flat copy, so a
#     config that has not been healed yet still sees current bytes ---
mk(bundled2, "rs90.png", b"RS90-STOCK-B")
res = pk.deploy_skins_split(bundled2, skins)
check("split: stock update reaches stock/",
      (skins / "stock" / "rs90.png").read_bytes() == b"RS90-STOCK-B")
check("split: stock update reaches the legacy flat copy",
      (skins / "rs90.png").read_bytes() == b"RS90-STOCK-B")
check("split: user photo STILL untouched by the update",
      (skins / "user" / "rs90.png").read_bytes() == b"MY-OWN-RS90-PHOTO")

# --- MIGRATION from a pre-split install: flat stock already on disk,
#     no stock/ dir at all. It must be adopted, not treated as a user
#     file, and the user's own flat photo must be left alone. ---
legacy = tmp2 / "legacy" / "skins"; legacy.mkdir(parents=True)
mk(legacy, "rs90.png", b"RS90-STOCK-A")        # our old stock, unstamped
mk(legacy, "grandpa.png", b"USER-HEIRLOOM")    # their own flat photo
res = pk.deploy_skins_split(bundled2, legacy)
check("migrate: stock/ created and filled",
      (legacy / "stock" / "rs90.png").read_bytes() == b"RS90-STOCK-B")
check("migrate: pre-split flat stock adopted + updated",
      (legacy / "rs90.png").read_bytes() == b"RS90-STOCK-B")
check("migrate: the user's own flat photo is grandfathered untouched",
      (legacy / "grandpa.png").read_bytes() == b"USER-HEIRLOOM")
man = json.loads((legacy / "manifest.json").read_text())
check("migrate: manifest covers flat + stock", 
      "grandpa.png" in man and "stock/rs90.png" in man)

print(("\nasset-deploy: %d ok / %d FAIL" %
       (0, len(fails))) if fails else "\nasset-deploy: ALL PASS")
raise SystemExit(1 if fails else 0)
