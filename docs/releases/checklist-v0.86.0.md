# v0.86.0 — Release Checklist

*From the 2026-08-30 checkpoint (manifest `0.86.0-dev`, pushed to `main` untagged) to a tagged HACS release. Tick items as they land. The two roadmap items can slip to 0.86.1 without holding the release.*

## Ship-blocking (required for 0.86.0)

- [ ] Finish + verify **layered catalogs** — the headline feature is WIP in the tree. Finalize the one-time migration and the Studio provenance chips; lift `docs/releases/release-notes-v0.86.0.md` out of DRAFT.
- [ ] Bump `custom_components/harmonium/manifest.json` `0.86.0-dev` → `0.86.0` (the tag must match).
- [ ] Run `make-release.bat` (build Studio + engine, bundle into the integration).
- [ ] Run the test probes (`tests/*.mjs`) green after the build — engine `src/` changed this cycle, so confirm no regressions.
- [ ] Tag `v0.86.0` + draft the GitHub Release, then verify a HACS install on a test HA.

## Bug fixes (tester triage — see beta-gaps §6, 2026-08-30)

- [ ] **Volume-band type won't change (silent override).** Studio `ControllerTab`: disable/annotate the "Volume style" dropdown when a per-tile ⚙ `style` or `device_options[e].volume_style` is overriding it (the dropdown writes the lowest rung of the precedence ladder in `gen-bands.js`). Diagnosed, not yet fixed.
- [x] **"Advanced" one-way tab.** Fixed in source (`TileRow` / `ActivityCard` / `PageSettings`: fill the square when active + a second click returns to the default tab). **Verify after the Studio build.**
- [ ] **Save + Reload Astrion silent-fails** unless the Fully entities are named `astrion1` and kept out of an area. Give it an explicit entity mapping (like the battery option) and fail loudly when unmapped.
- [ ] **Nav opens the wrong room's controller (CONFIRMED on live config, 2026-08-30).** Deck's activities and context are correct, and the tap flips `select.harmonium_deck_activity` correctly — but NO room page in the config carries `activity_select`, so on the shared `controller:tv` the trail walk in `roomActivitySelect()` finds nothing and falls to `global.activity_select` (porch's select, which held `porch_watch_fire_tv`), and that trumps the tapped pending activity. **Config workaround (works today): give EVERY room page that owns activities its minted select in the Code tab** — `"activity_select": "select.harmonium_deck_activity"` on deck AND `"select.harmonium_porch_activity"` on porch (wiring only one room breaks the other via the owning-activities walk). **Engine fix for 0.86.0:** auto-derive `select.harmonium_<page>_activity` for a room page when the entity exists (the integration mints them; nothing wires them), and/or let the tapped pending activity outrank a select reached only via the GLOBAL fallback. §6.7 multi-room.
- [ ] **No Back/Home chrome in a browser on "parent" pages (CONFIRMED: config, 2026-08-30).** Not the device profile (the browser was on `default` = touch/pointer). The live config still has `home_screen: porch`, so the engine hides the Home button ON PORCH by design (`S.screen === CONFIG.home_screen` — "you are home"), and Back is hidden on a direct load (empty nav stack); meanwhile the user's new "Home" page — not being the configured home — absurdly SHOWS a Home button that navigates to porch. **Config fix (works today): set the workspace home screen to the Home page** (Studio startup/workspace-map setting, or Code tab `"home_screen": "home"`). **For 0.86.0:** consider a Studio hint when a page looks like a home page but isn't `home_screen`, since nothing surfaces this today. (Separate, still-real design note: a browser opening a URL with a hardware `#device=` profile inherits `physical_dpad` and loses the touch chrome — worth a look under device capabilities.)

## Docs (quick, before release)

- [ ] Flag the **Fully Plus license** requirement up front in `docs/GETTING-STARTED.md` and the remote setup guide.
- [ ] Note **no automatic entity-rename** (delete + recreate is the path).
- [ ] One line: **Music vs TV controllers show different bottom chrome by design** (the TV Back/Home strip).

## Roadmap — decide in-or-out for 0.86.0

- [ ] **Fire TV sendevent as a Studio field** (today it's a Code-tab tuning; see `docs/design-fast-dpad.md`). Real user demand now.
- [ ] **IP dialects (Denon / Panasonic, non-Android).** Take the tester up on the test + doc offer.

## Housekeeping

- [ ] Delete stray `remotes/rs90/keymapper/v1/_superseded-by-parent-gen.py` (the device bridge can't delete; do it manually).
- [x] Yellow-long → quick-settings captured into the repo v2 keymap (re-pulled 2026-08-30).
- [x] beta-gaps triage + HANDOFF traps logged; astrion setup guide overhauled; Fully pull/push tooling + canonical settings in place.

## Done this session (context)

- Checkpoint pushed to `main` **untagged** — nothing shipped to HACS.
- `remotes/` toolkit: keymapper + Fully `pull`/`push`, `distill-fully.py`, version-aware map generator, `units.json` serial routing, scrcpy launchers.
- astrion v2 setup guide rebuilt: IME keyboard (ADB-only default), the Fully-via-remote-admin flow (reboot to escape, no force-stop), portrait lock in step 9, "didn't clone the repo" box, raw-adb push paths.
- `remotes/fully/remote-fully-settings.json` canonical omits the 3 device keys; km-fix build artifacts gitignored + untracked.
