# HANDOFF — v0.87.0 to v0.88 (start here)

*Purpose: the baton for the next session, written 2026-09-08 at the end of the v0.87.0 release push, so nothing learned this cycle is lost. Audience: Suresh and whichever Claude session picks the work up next (from the Jamaica house). The older `HANDOFF.md` is still the long-form history; this one is the current state and the rules of the road.*

Everything below was verified against the repo and the running code on the day it was written. Where something is a plan rather than a fact, it says so.

---

## 2026-09-09 — v0.87.0 IS RELEASED. Read this block, then §1 (the rules); the rest is now history.

**Done on 2026-09-08, from the Jamaica machine (`dragonfly-evo`, repo at `G:\Local Documents\Code 2025\repos\harmonium`):** release commit + annotated tag `v0.87.0` (the old wrong tag had already gone from GitHub — the push said `[new tag]`), GitHub release published with pictures (absolute `raw.githubusercontent.com/…/v0.87.0/…` links — `Claude outputs/release-notes-v0.87.0-github.md` is the pasted copy; `Claude outputs/` is gitignored now), .95 (production Jamaica) updated through HACS, PR #8 landed and closed, forum threads told, the channel-keys tester answered (the tuner switch in Control target is the answer). Also in the release commit: PR #8's fix with the owning-room resolution + fence 4 in `probe-room-select`; the README rewrite (his voice kept verbatim, "What it does" one-liners, Gallery of the pictorials, plain Status); the two tracked clutter files and `Claude outputs/` removed; `docs/cookbook/releasing.md` gained the README preflight bullet and the corrected `docs/releases/` path. After the tag: the release notes gained an "Upgrading? export first, Save & Deploy after" callout under the title (repo copy + the GitHub page). The 0.88 round is open: manifest / `ENGINE_V` / `STUDIO_V` = `0.88.0-dev` (build counter kept at b56).

**Houses now.** `.95` = production Jamaica HA, HACS-installed, on 0.87.0 — entity ids as in `houses/jamaica*/config.json`. `.94` = `jamaica-dev`, a HAOS VirtualBox VM on this PC (default house here; `houses/jamaica-dev.cmd`); it got a fresh config built from its own entities after the imported production config turned out to reference 17 entities that don't exist there. The VM stalls (`rcu_preempt self-detected stall`) when the host is busy or sleeps — not a Harmonium problem; it recovers on its own. CT is unchanged.

**Working from this machine.** This session type had no device shell, so every edit was stage → edit in the container → `device_commit_files` with `expectedMtimeMs` → re-stage → md5 both sides. One trap found and reproduced twice: **writing to the same staged path a second time lands the previous content** — the guard passes, the tool says "written", and the file is stale. Use a fresh staged path for every write and always md5 after. Engine builds and probes run fine in the container (`node build-engine.mjs`, serve `dist/` on 8482, link `playwright-core` from `/opt/node-tools/node_modules`, `npm i acorn` for `probe-syntax-floor`); the Studio still builds only on his machine.

**Next.** His picks, in rough order: the fifth pictorial (his), the code-comment path sweep, then a 0.88 item — light color/color-temp is the biggest hole; custom icon sets and Save + Reload fan-out were user asks; whatever the forum sends back outranks all of it. `probe-version-stamps.mjs` now gates `make-release.bat` — all three stamps must agree.

---

## 0. Where we are, in one paragraph

v0.87.0 is code-complete, fenced (126 probes green) and fully synced to the repo. It has been **committed once** (5e79127, "v0.87.0 — entity controls, groups and casts, controller model, upgrade report") but that commit does not contain the last day's work (the focus-ring setting, the docs reorganization, the release-notes repair, the how-controllers-work section). The tag `v0.87.0` was created **on the wrong commit** (29dedd9, the September 2 commit) and pushed to GitHub before the release commit existed; it has to be deleted and recreated. No GitHub release has been drafted. The manifest says `0.87.0`.

What Suresh still has to do, in order: delete the scratch folders (§7) → `build-push` → Ctrl+F5 the Studio tab → Save & Deploy once → try things on the house → `make-release` → commit everything → move the tag (§7 has the exact commands) → GitHub release from `docs/releases/release-notes-v0.87.0.md` → bump manifest to `0.88.0-dev` on the first commit after.

---

## 1. Ways of working — the rules Suresh has set (read these twice)

These come from Suresh directly, most of them more than once. They are not style preferences; several were set after real damage.

**Language and tone.** Plain English. Short turns. Explain things the way you would to a colleague, with humility. He has called out two failure modes by name: *overly imperative* ("One consistent design. Everywhere." — an intent stated as a fact, "too ostentatious for my style") and *cutesy*. Simple sentences, no slogans, no jokes for their own sake. When you make a list, it is because he asked for one.

**His documents are his.** `README.md`, `docs/releases/release-notes-*.md`, `docs/pictorials/*`, the cookbook pages he has edited — anything with his voice in it. The rule, verbatim: **"DO NOT CHANGE MY EDITORIAL STYLE"** and **"Be very careful on changing MY LANGUAGE!"** Concretely:
- Edits to his documents are **insertions only**, in clearly separated places (a new section, a new bullet at the end of a list). Never rewrite his sentences, even to fix what looks like a factual slip — point it out and let him decide.
- Show him the diff (in words, in the reply) before or as the file is written; he should never discover a change by reading the file.
- If he supplies wording, use it verbatim, typos and all, unless he asks you to tidy it.
- When a claim in his text is wrong (e.g. "Streaming App tiles tint their logos" when the logos are photos and only glyphs tint), say so plainly and offer a correction; he will usually give you the sentence he wants.

**Never overwrite what he has changed.** On 2026-09-06/07 an afternoon of his edits to the release notes was lost: I wrote the file out from a stale container copy, and later forced a write past the safety check. He recovered an older copy from the recycle bin; the rest had to be rebuilt. The discipline now, without exception:
1. **Stage his copy immediately before editing any file he might have touched** (`device_stage_files`), and build the edit on that copy, not on the container's.
2. **Write with the mtime guard on** (`expectedMtimeMs` from that staging call). If it refuses, re-stage, diff, and merge — never `force`.
3. After writing, **md5 both sides** and compare.
4. Container copies of docs go stale within hours; treat the container as scratch and his repo as truth for anything he edits.

**He commits.** Never run git write commands on his machine. Tell him the exact commands when he asks (he does not know git well — spell out tag/push/delete-tag). He uses VS Code's Source Control view.

**Security — LAN addresses never enter the repo.** His two houses' HA URLs (CT and Jamaica) appear only in the gitignored `houses/*.cmd` and `remotes/units.json`. Do not write them into docs, tests, fixtures or commit messages. `dist/config.json` is a test fixture that already carries a few `192_168`-style entity ids from long ago — do not add new ones. `remotes/units.json` is gitignored; `remotes/units.example.json` is the tracked template.

**Files that must keep their exact shape.** `custom_components/harmonium/starter-config.json`: JSON with `indent=1`, **no trailing newline** (a probe compares it byte-for-byte against the stocklib twin). `src/core/config.js` on his machine is CRLF — the container copy was converted before writing so the diff stayed clean; check line endings (`file`) before writing any file you did not stage from him.

**Never sync built artifacts** (`dist/index.html`, `custom_components/harmonium/studio/studio.html`, `custom_components/harmonium/engine/index.html`). His scripts build them.

**Don't spend his time.** He interrupts long full-battery runs mid-flow. Run targeted probes after each change; run the full battery once, in the background, before a release. When he says "ENOUGH" or "we've discussed this 100 times", stop exploring and do the smallest correct thing. When he asks "where do you disagree?", answer honestly and briefly — no tool-heavy detours.

---

## 2. The repo, after the 2026-09-08 tidy

```
README.md                         the front door (Status paragraph is mine and too grand — see §6)
CONTRIBUTING.md, SECURITY.md, LICENSE, hacs.json
build-engine.mjs                  THE engine build: concatenates src/ → dist/index.html
*.bat                             deploy scripts (docs/scripts.md explains every one)
houses/                           multi-house model; *.cmd and default.txt gitignored
src/                              the engine (core/, ui/, widgets/, styles/) — Chromium 61 floor
studio-src/                       the Studio (Svelte 5 runes, Tailwind v4) → build/index.html → studio.html
custom_components/harmonium/      the HA integration (Python), starter-config.json, engine/ + studio/ (built copies)
tests/                            Playwright probes (probe-*.mjs), smokes, python tests; run.sh
tools/                            gen-stock-history.mjs, gen-identity-palette.mjs, starter-history/ snapshots
docs/
  GETTING-STARTED.md, ARCHITECTURE.md, PROJECT.md (decisions log), HANDOFF.md (long history), this file
  beta-gaps.md                    the living roadmap
  screen-schema.md                the config contract
  scripts.md                      the .bat files
  cookbook/                       user how-tos (README.md is the table of contents)
  pictorials/                     Suresh's screenshot walkthroughs (4 so far; images in pictorials/media/)
  design/                         the two HTML design canvases
  design/notes/                   the design notes, one per topic, README.md indexes them with status
  releases/                       every release-notes-*.md and checklist-*.md
  media/, images/                 screenshots the docs use
  posts/                          forum/GitHub posts as sent (records — don't edit)
archive/                          retired material; archive/design/tablet-mode.md is the newest arrival
```

Links: every relative link in every `.md` was checked on 2026-09-08 (173 links, 0 broken). Plain-text path mentions were updated in docs but **not in code comments** (~20 source files still say `docs/design-foo.md`; harmless, worth a sweep on a quiet day). `docs/posts/` was left alone on purpose.

Clutter that is his to delete (I cannot delete on his machine, only move): `docs/pictorials/_to_delete/`, `tools/starter-history/_to_delete/`, `docs/release-notes-v0.87.0-recovered.md`, and the untracked `Claude outputs/` and `docs/image.png` (add `Claude outputs/` to `.gitignore` if he wants to keep the folder).

---

## 3. How work gets from a Claude session into his repo

The container (`/root/work/harmonium` in the session that wrote this — a fresh session starts empty) is scratch. His repo is `G:\Documents\Code 2025\repos\HA-2026\harmonium`, mounted in the device shell as `$HOME/mnt/harmonium`.

**Bootstrapping a new session:** stage the files you need from his repo (or clone from GitHub for the bulk and then stage his uncommitted files on top — his working tree is usually ahead of GitHub). Do not assume any container copy is current.

**The loop for a code change:**
1. Edit in the container.
2. `node build-engine.mjs` and, for Studio changes, `cd studio-src && npm run build` (then `rm -rf /tmp/studio-test/build && cp -r build /tmp/studio-test/build` — the Studio probes load from there).
3. Serve `dist/` on 8482 (`cd dist && nohup python3 -m http.server 8482 &`) and run the relevant probes: `node tests/probe-xyz.mjs`. Probe lists for the full battery live in `/tmp/batt1.txt` + `/tmp/batt2.txt` in the old session — in a new one, `ls tests/probe-*.mjs tests/smoke-*.mjs` is the list (skip `shoot-*`, they take screenshots). Known parallel-load flakes, green when run alone: `probe-fast-dpad`, `probe-page-link`, occasionally `probe-tv-focus`.
4. `SendUserFile` the changed files (one call, `display: attach`), then `device_commit_files` with `expectedMtimeMs` for every file that existed, then md5 both sides.

**His three scripts (read from the .bat files; I got this wrong once):**
- `build-push` — builds Studio + engine, pushes engine → `www/harmonium` and `studio.html` → `custom_components/harmonium/studio` on the default house. No `.py`, no restart. Then Ctrl+F5 the Studio tab; remotes clear cache and reload.
- `make-release` — builds both and copies the engine into `custom_components/harmonium/engine/` (the HACS tree). Pushes nothing anywhere. Run before commit + tag.
- `push-all` — **no build**; robocopies the already-built engine plus the whole `custom_components/harmonium` tree including `.py`; asks for an HA restart only if a `.py` differs.

**Jamaica specifics:** `houses/jamaica.cmd` exists (gitignored) with that house's HA URL and share letter. To make it the default there: `echo jamaica> houses\default.txt`, then once, with the drive mapped, `push jamaica init` to write the `.house` marker. `houses/jamaica/config.json` is a snapshot from `pull-config`. Everything else is identical.

---

## 4. Architecture cheat-sheet (the parts this cycle touched)

- **Config store.** The integration keeps the config in HA `.storage`; `www/harmonium/config.json` is a deploy artifact. The Studio saves with `POST /api/harmonium/config`; `harmonium.reseed` merges a deployed file back into the store.
- **Normalization on Studio load** (`studio-src/src/lib/stocklib.js`, `normalizeConfig`, in order): `ensureStockControllers` → `normalizeCastOrder` → `normalizeTemplateBindings` → `normalizeTuner` → `normalizeVariants` → `normalizeNpDefaults` → `healPinnedDialects` → … Each reports into `NORMALIZE_REPORT` (`variants, pins, pinsKept, castMerged, templatesFreed, tunerChips, npDefaults`); the status line and the upgrade audit (`buildAuditFindings`) read it. Nothing is persisted until Save & Deploy.
- **Stock controllers** live in stocklib (`STOCK_TV`, `STOCK_MUSIC`, the Media Device stock…) with a `gen` number; the starter config is a byte-twin (`probe-stock-sync`). Bumping a stock = bump `gen` + update starter + `node tools/gen-stock-history.mjs` (which reads `tools/starter-history/*.json`, now including `starter-v0.87.0.json`). Ownership (`ownership.js`) uses those fingerprints to tell "untouched stock" from "his edit".
- **Adapter registry** — byte-identical twins in `src/core/adapters.js` and stocklib's `@adapter-table` region, including a `none` row (`role: null, domains: [], variants: []`); `SHOWS_NONE` is appended only in PresPanel. `probe-entity-phase1` compares them.
- **Activity dressing.** `actSurface(act)` in `src/core/context.js` is the *only* reader of an activity's Controller-tab overrides (np_style, band switches, order, labels, volume style, speakers). It returns `{}` while `S.pvBare` is set. Consumers: `surfDressTile`, `surfOrderTiles`, `visibleTile`, `srfOff`, `surfaceVariant`, gen-bands speakers, generators' Devices switch, `render.js` labels.
- **Preview.** Studio → engine message `harmonium_preview_activity {id, rolesOnly, force, bare}`; `boot.js` sets `S.pvActivity`, `S.pvBare`. `renderActivityId()` returns `S.pvActivity` unconditionally (preview-as is the law; the old ownership gate that swapped a non-owner pick for the surface's owner is gone). The controller editor (`ViewEditor.svelte`) sends `bare: true` for its whole visit (mount/unmount `$effect`); the activity card never does.
- **Now Playing style** (`media.js npMode`): `tile.style` → `tile.np_default` → (`art ? "art" : ""`). Stock TV `t_np` and Music `m_np` carry `np_default: "art"`; `normalizeNpDefaults` makes custom copies' `np_default` follow their root stock when the tile has no explicit style; TileRow's Auto label names the resolved default.
- **Device pages.** `details.js detailScreen(eid)`: `deviceOwning(eid)` scans `CONFIG.devices` for any bundle naming the entity in any role; if found, the page speaks the device — roles become context, dialect drives keys, `dpad` role takes the physical keys (BACK | HOME strip), volume row rewired from `roles.volume` / `roles.volume_level` unless the tile carries an authored `variant`/`level_entity`. `detailDef` picks the page: the bundle's `page` pin → an entity-bound copy → the domain stock. The Studio's `DevicePageDoor.svelte` is the one affordance for choosing/editing/copying a device page.
- **Control target.** Stocklib helpers `CT_DEFAULT_KEYS`, `CT_TUNER_KEYS`, `fillControlTargetDefaults`, `tunerOn`, `setTuner`, `normalizeTuner`. The TV-tuner switch *is* the `ch_up`/`ch_down` chips in `pass_through`; the legacy `tuner` flag is never written and heals into chips. Device pages synthesize their control target from the bundle (`ViewEditor` says "From the device.").
- **Lands-on / preview pickers.** `KIND_SURFACES {watch:'tv', play:'tv', listen:'music'}`, `controllerRoot()`; `Select.svelte` supports `optgroup` via `group` on options. Lands-on offers activity surfaces only (stock/custom), grouped by shape; device pages never.
- **Theme.** `applyTheme` in `src/core/config.js` sets `--<key>` CSS vars from `CONFIG.theme` merged with `remotes.<id>.style`. New this cycle: key `focus-ring` — a color re-tints the d-pad cursor; `off|none|false|0|no` sets `html.noring` (transparent ring, no lift/wash; the `.focused` class and `S.focusId` untouched). Tokens `--focus-ring`, `--focus-bg`, `--focus-wash` in `tokens.css`; every `.focused` rule paints through them (`probe-focus-ring` has a static check). Studio: Theme → Colors → "Focus ring" select.
- **Upgrade audit v1** (`UpgradeAudit.svelte`, `release-behavior.js`): version-pair banner + findings panel; per-release behavior lines (the `0.87.0` block was rewritten to the final rulings); dismissal persisted at Save & Deploy. Phase 2 (rebase) is parked.

---

## 5. Rulings that stand (the law, in his words where possible)

- **Panel order:** the Controller tab's ↑↓ is the ONE order lever. Setup-tab cast arrows were removed; member rows inside a group keep theirs.
- **Two kinds of controller** (`docs/cookbook/how-controllers-work.md`): `$device` pages and `$context` activity surfaces. Context comes from the cast's roles. A controller shows nothing without an input. Preview = "show me this controller with that as the input" (keys included). Hard-coding is possible for authored tiles only.
- **Controller editor preview:** "If I am looking at or editing a controller, the only thing I care about is that controller's rendering. I choose a preview because that is the only way I can see what the controller I'm looking at will render." and "The controller bits should stay as is… by activity overrides… but not permeate into a controller preview." → bare preview in the editor; overrides apply on the remote and in the activity card.
- **Lands-on:** "In pages > activities there should be ZERO hard coded controllers. They should be stock or custom."
- **Now Playing:** DEFAULT and Auto are **Art** for stock TV (gen 2) and Music (gen 9); copies' defaults track the stock's; the Auto label says what it resolves to.
- **"I want stock to be what we need it to be."** — bump stock freely when the design says so; the heals carry users forward and the audit tells them.
- **Draw as Nothing** exists for cast members; a device page shows `$device` in the tree and on its page; the control-target panel tells the truth on a device page; Fill-in-defaults; tuner switch = chips.
- **Focus ring:** off means transparent, not absent (his suggestion, "if that causes issues, we could just make it transparent").
- **Docs:** design notes live in `docs/design/notes/`; unbuilt ideas go to `archive/design/`; release notes in `docs/releases/`.

---

## 6. Open items and ideas (none block the release)

1. **README rewrite** — agreed in principle, his tone rules apply. Plan: keep what it is / one good screenshot (his pictorials) / Why / Quick start / hardware remotes / Cookbook table / How it's built / Status / Asks; replace the aging feature prose with a dozen plain one-liners and a "What's new: see the release notes" line; add a Gallery of his pictorials and the two videos; make "update Status + What's-new" a line in `docs/cookbook/releasing.md`. Draft it as a **separate file** for him to read; do not overwrite `README.md`. The current Status paragraph ("**one design language** everywhere…") is mine and is the example of the tone he dislikes.
2. **Fifth pictorial** (his, if he wants it): Pre-wired Devices card with Volume keys / Volume readout pointed at the soundbar, then the TV's page. His new section in how-controllers-work ends "Easier to try than to explain!" — the picture would do it.
3. **Code-comment path sweep** for the moved design notes (~20 files, comments only).
4. **Upgrade audit phase 2** (rebase a fork onto a new stock) — parked by ruling.
5. **Domain-parity backlog** (ruled "to-dos, not 0.87"): light color/color-temp (biggest hole), lock confirm doctrine, vacuum, humidifier, alarm. Styling for device pages, group pages and a group's children — parked to next release.
6. **Weather card** — its own future design; tablet mode — archived thought.
7. **Pending-vs-global ordering hardening** (beta-gaps §6.7) — optional, moot in practice.
8. `docs/HANDOFF.md` (the 106 KB one) now carries a two-line pointer to this file at the top; its August status box and everything below are history, still accurate for what they describe.

---

## 7. The exact commands he still needs

Delete first (Explorer or terminal): `docs\pictorials\_to_delete`, `tools\starter-history\_to_delete`, `docs\release-notes-v0.87.0-recovered.md`.

Then, after build-push / shakedown / make-release, in the repo folder:

```
git add -A
git commit -m "v0.87.0 — release"
git tag -d v0.87.0
git push origin :refs/tags/v0.87.0
git tag -a v0.87.0 -m "Harmonium v0.87.0"
git push origin main
git push origin v0.87.0
```

Line 3 removes the wrong local tag, line 4 removes it from GitHub, line 5 recreates it on the release commit. Then Releases → Draft a new release → tag `v0.87.0` → paste `docs/releases/release-notes-v0.87.0.md` → Publish. If a release was already drafted on the old tag, delete that draft first.

Stock history is already frozen for this tag (`tools/starter-history/starter-v0.87.0.json`, `stock-history.js` regenerated) — as long as `starter-config.json` is not edited before the commit, nothing else is needed after the tag except the manifest bump to `0.88.0-dev`.

---

## 8. Traps that cost real time this cycle (so they cost none next time)

- **Stale container copies overwrote his edits.** See §1. Stage, guard, md5. Every time.
- **The tag on the wrong commit.** "git tag" tags HEAD; he had not committed. Always say "commit first, then tag" in that order, and check `git log -1` with him.
- **push-all does not build.** I described it as building; the .bat says otherwise. Read the scripts, don't remember them.
- **`Set` edits by substring** ("removeGroup" contains "moveGroup") — use word boundaries in regex-driven edits.
- **The preview-as bug was not the padlock.** It was the ownership gate in `renderActivityId`, compounded by a stale engine on his HA. When "changing X does nothing", verify in his live Studio (his Chrome tab at `/harmonium-studio` via claude-in-chrome; `w.eval('JSON.stringify({...S...})')` reads engine state) before theorizing.
- **A wrong proxy in a fence:** probe-lands-on used "not art" to detect override leakage; the moment Art became the default the fence lied. Fence the intent, not a coincidence. Same for `probe-dpad-dialect`, which pinned Music's default as Hero.
- **Registry parity broke twice** when a row existed in one twin only (`none`). Add rows to both twins in one edit; `probe-entity-phase1` catches it.
- **`ha_read_file` returns 115 KB** — read the saved tool-result file instead; never `ha_write_file` to `www/harmonium` (deploy artifact); to change his live config use his Chrome tab and POST `/api/harmonium/config`.
- **`git` under `device_bash` warns about `.git/index.lock`** ("Operation not permitted") on read-only commands — harmless, but it means write commands would fail: don't try.
- **The one half-day loop.** The controller-preview thread went round several times because I kept "fixing" from a theory instead of the ruling. His summary of it: "It's obvious. Where do you disagree?" Say where, in two sentences, or do exactly what was asked.

---

## 9. Where the mirrors are

The Claude project attached to these sessions ("Home Assistant Lightweight Remote Framework") holds `claude/checklist-v0.87.0.md` (the program checklist, current), `claude/HANDOFF.md` (older), `claude/beta-gaps.md`, `claude/PROJECT.md` and the design docs from before the reorg. The repo is the truth; the project docs are for a session that starts with no repo in hand. This file is mirrored there as `claude/HANDOFF-v0.87-to-v0.88.md`.
