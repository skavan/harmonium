# v0.86.0 — Release Checklist

*From the 2026-08-30 checkpoint (manifest `0.86.0-dev`, pushed to `main` untagged) to a tagged HACS release. Tick items as they land. The two roadmap items can slip to 0.86.1 without holding the release.*

## Ship-blocking (required for 0.86.0)

- [ ] **Layered catalogs: verified + extended (2026-08-30).** Test surface green (`test-layered-catalogs.py` ALL PASS incl. 15 new derivation fences, `probe-catalog-provenance` ok) and the migration already ran live (the `prelayers.backup` files in www are its receipts). NEW this round, per the derivation ruling: **derived classes** (`derived_from` — deltas over the shipped parent; merge + subtract in `catalogs.py`; ⑂ Derive / View parent / Reset to parent / adopt-activities in the editor), **action-valued D-pad fields** (⚡ chip + JSON editor; kills the `[object Object]` data-loss trap; ⚡ convert button on every key), **stock/yours visual separation** + section renamed **Platforms**; design doc + release notes updated. Notes now carry today's work (Fixed section, Disney+, derived classes, remotes toolkit) — Remaining: Suresh reviews and de-DRAFTs. Tester reply drafted: `docs/posts/reply-beta-feedback-v0.86.md` (post after tagging).
- [ ] Bump `custom_components/harmonium/manifest.json` `0.86.0-dev` → `0.86.0` (the tag must match).
- [ ] Run `make-release.bat` (build Studio + engine, bundle into the integration).
- [x] Probes green (2026-08-30, sandbox, source byte-synced with the tree): 19/19 smoke suites + 8 touched probes + python integration-split 21/21 + layered-catalogs ALL PASS. Deck→Watch Projector verified by hand in the preview.
- [ ] Tag `v0.86.0` + draft the GitHub Release, then verify a HACS install on a test HA.

## Bug fixes (tester triage — see beta-gaps §6, 2026-08-30)

- [x] **Volume-band type won't change (silent override) — FIXED in source (2026-08-30).** The Controller tab's dropdown writes the LOWEST rung of gen-bands' ladder; a per-tile ⚙ `style` or `device_options[e].volume_style` silently pinned its row. Now the dropdown shows every pin beside it (`⚙ pinned: <member> = <style>`), each with a one-tap ↺ that clears that override in place — "why won't it change" answers itself. `ControllerTab.svelte`; Studio compiles. **Verify after the Studio build.**
- [x] **"Advanced" one-way tab.** Fixed in source (`TileRow` / `ActivityCard` / `PageSettings`: fill the square when active + a second click returns to the default tab). **Verify after the Studio build.**
- [x] **Save + Reload Astrion silent-fail — FIXED in source (2026-08-30).** Was hardcoded to `button.astrion1_clear_browser_cache` / `button.astrion1_load_start_url`, and HA "presses" a nonexistent button without complaint — hence the silent no-op on any other device name. Now: (1) explicit mapping — two EntityPickers in map → **Startup & Home → Remote reload** write `global.fully_cache_button` / `global.fully_reload_button`; (2) resolution ladder config → localStorage (`hakr_cachebtn`/`hakr_reloadbtn`, kept) → legacy astrion1 defaults; (3) both entities are verified to EXIST before pressing — a miss fails loudly, naming the missing id and where to wire it. Button relabeled **Save + Reload Remote**. `state.svelte.js` + `StartupEditor.svelte` + `App.svelte`; Studio compiles. **Verify after the Studio build.**
- [x] **Nav opens the wrong room's controller — FIXED in source (2026-08-30).** Root cause: the integration mints per-room selects but nothing wired them into the config, so a second room's shared controller fell to `global.activity_select` (porch's) and outvoted the tap. Fix: `wire_activity_selects()` in `workspaces.py` + applied on a deep copy in `HStore.deploy()` — every deployed config now carries each activity-owning room page's minted select automatically (never overriding an explicit one; store copy untouched, so nothing enters the 3-way merge). Nobody can get into the unwired state again. Fences: 6 new checks in `tests/test-integration-split.py` (18/18 green) + `tests/probe-room-select.mjs` (deck→controller answers deck, porch→porch, and the old unwired fall-through pinned). **Takes effect after the integration updates + HA restart + one Save & Deploy.**
- [x] **No Back/Home chrome in a browser — FIXED in source (2026-08-30).** Not the device profile (browser was on `default`). The touch Home button hid on `home_screen` (the BOOT VIEW, porch) while the Studio's "HOME — FINAL STOP" (`global.main_home` = home) was set and ignored. Fix: `updateBarChrome()` in `render.js` now follows the same home walk as the physical Home key and the edge swipe (parent → boot view → main_home) and hides only where the walk has nowhere to go — so porch shows Home (walks to the overview), the overview hides it, and a config with no `main_home` keeps the old behaviour. Fences: `tests/probe-home-chrome.mjs` (6 checks) green; neighbors `probe-power-btn` + `smoke-v2` (asserts homeShown/endShown) re-run green. **Ships with the next engine build.** (Back stays history-gated by design — it appears once you've navigated.)
## Docs (quick, before release)

- [x] **Fully Plus license** flagged up front: GETTING-STARTED's "What you need" table + §5 (autostart paragraph); the astrion setup guide already carries it in step 13.
- [x] **No automatic entity-rename** — GETTING-STARTED Troubleshooting entry (delete + recreate, rename before building).
- [x] **Music vs TV bottom chrome by design** — GETTING-STARTED Troubleshooting entry (the TV Back/Home strip and why music pages don't need it).

## Roadmap — settled 2026-08-30

- [x] **Fire TV sendevent first-class** — delivered via derived classes + action-valued dpad fields, per the "clone FireTV → FireTV-SE" design discussion.
- [x] **IP dialects (Denon/Panasonic)** — ruled OUT as a transport: receivers ride their HA integrations; extra commands ride HA services. Tester reply drafted (`docs/posts/reply-beta-feedback-v0.86.md`).
- [x] **Entity controls (`design-entity-controls.md`) rewritten as v2** per review — resolution ladder specified, one canonical spelling, fingerprint-safe normalization ruled, Weather evicted, grouping phase-gated on a focus spec, deterministic Auto. Positioned as the **0.87 keynote**; 0.86.0 does NOT gate on it.

## Housekeeping

- [ ] Delete stray `remotes/rs90/keymapper/v1/_superseded-by-parent-gen.py` (the device bridge can't delete; do it manually).
- [x] Yellow-long → quick-settings captured into the repo v2 keymap (re-pulled 2026-08-30).
- [x] beta-gaps triage + HANDOFF traps logged; astrion setup guide overhauled; Fully pull/push tooling + canonical settings in place.

## Done this session (context)

- Checkpoint pushed to `main` **untagged** — nothing shipped to HACS.
- `remotes/` toolkit: keymapper + Fully `pull`/`push`, `distill-fully.py`, version-aware map generator, `units.json` serial routing, scrcpy launchers.
- astrion v2 setup guide rebuilt: IME keyboard (ADB-only default), the Fully-via-remote-admin flow (reboot to escape, no force-stop), portrait lock in step 9, "didn't clone the repo" box, raw-adb push paths.
- `remotes/fully/remote-fully-settings.json` canonical omits the 3 device keys; km-fix build artifacts gitignored + untracked.
