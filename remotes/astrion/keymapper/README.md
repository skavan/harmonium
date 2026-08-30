# Astrion Key Mapper configs — versioned

Two Key Mapper configurations live here, side by side. They are NOT interchangeable, and a remote is never upgraded automatically — moving a unit from one to the other is a deliberate choice (change its `keymap` in `remotes/units.json` and re-push).

## v1 — Expert Mode era

`v1/key_mapper.zip` (+ the generated `astrion-remote-map.md`, `data.json`, `KeyCodes Astrion.xlsx`, and the KeyMapper screenshots). This is the original config that drives keycode injection through Key Mapper's **Expert Mode** bridge. It works on units whose firmware keeps the bridge alive across reboots (the older Astrion). On new-firmware units the bridge does not survive a reboot — see `../key-input-findings.md`.

## v2 — IME path

`v2/key_mapper.zip`. Same logical mappings, but paired with the setup in `../README.md` that injects through Key Mapper's **input-method** path (with the Key Mapper GUI Keyboard) instead of Expert Mode — reboot-proof on new-firmware Astrions. This is the config the current guide provisions.

## Which does a remote use?

Its `units.json` entry says: `"type": "astrion", "keymap": "v1"` or `"v2"`. `push-keymapper.bat` / `pull-keymapper.bat` read that and target the right folder, so the two versions (and two physical remotes) never overwrite each other.

## Regenerating the map docs

`gen-map-docs.py` (in THIS folder, shared across versions) renders each version's `astrion-remote-map.md` + `KeyCodes Astrion.xlsx` straight from that version's `key_mapper.zip` - it self-extracts `data.json`, no manual step.

```
python gen-map-docs.py         # every version (v1, v2, ...)
python gen-map-docs.py v2      # just one
```

`pull-keymapper.bat` OFFERS to run it after a pull (prompted, never automatic). Needs openpyxl for the .xlsx (`pip install openpyxl`); the .md always renders.
