# HANDOFF — session ended 2026-08-01 (v0.56 built, not yet deployed)

Read `docs/PROJECT.md` first; it is the living document. This file is
the bridge from the last session to the next one.

## Where things stand

- Shipped and LIVE on the remotes: **v0.55**.
- BUILT this session, NOT YET PUSHED: **v0.56 — the remote-creation
  screen** (both halves; see the PROJECT.md entry). 14/14 suites
  green, engine + Studio rebuilt, screenshot-verified.
- Cloud workspace rolled back 14 times total. G:\ is ground truth;
  the mirror ceremony is the whole disaster plan.
- Session archive from the previous session lives beside this file in
  `docs/sessions/`: `conversation.md` and
  `session-full.jsonl.gz.part00..02` (rejoin:
  `copy /b part00+part01+part02 session-full.jsonl.gz`, or
  `cat part* > session-full.jsonl.gz`, then gunzip).

## FIRST THING NEXT SESSION: deploy v0.56

Nothing yaml-shaped changed, so the ceremony is the short one:

1. `push-to-ha.bat` (engine dist + studio.html)
2. `script.harmonium_deploy_remotes` — **reseed OFF**
3. Astrion cache-clear + `load_start_url`
4. Studio hard refresh

No HA restart (no `.py` touched), no `harmonium.reseed`.

Then field-test the loop on real hardware, which is the part a
harness cannot prove:

- Studio → ✎ edit layout → describe the Astrion's real face in order
  (custom slots type straight in now), Save & Deploy.
- On the remote: hold ⓘ → Key capture → press each physical button →
  tap its slot → 💾 Save. Watch for KeyMapper-injected keys that
  arrive with surprising `e.key` values (the log rows show raw key ·
  code · keyCode, so the evidence is on screen).
- The RS90 is the real target for this: pair it, describe it, learn
  it, without touching a config file.

## Files v0.56 touched

`src/core/keycap.js` (rewritten) · `src/widgets/kslot.js` (new) ·
`src/styles/widgets.css` (kslot block appended) · `build.mjs` (widget
registered) · `studio-src/src/lib/PreviewPane.svelte` ·
`integration/custom_components/harmonium/studio/studio.html` (built) ·
`dist/index.html` · `tests/smoke-keys.mjs` · `tests/smoke-studio.mjs`.

## Open / parked after v0.56

- **Parked (his words: "One day… V2 UX")**: photograph the physical
  remote and map hotspot areas onto the image — the "mirror the
  remote" experience at full fidelity. Revisit when the RS90 lands.
- Capture-assign v1 deliberately has no UNASSIGN gesture: a raw key
  is reassigned by capturing it again and tapping a different slot,
  and a wrong entry is edited in the Studio's Code tab. Add one if it
  bites in the field.
- Controllers' `buttons` maps (music CH±) still edit via the Code tab
  — bindings-table-on-controllers remains a later nicety.
- yaml/ round-trip is still the standing debt: the Studio edits the
  COMPILED config, so keepers must be ported back into `yaml/` by
  hand. The v0.37 three-way merge stops deploys from destroying that
  work, but it is not round-trip.
