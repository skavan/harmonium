# Cutting a release (maintainer ceremony)

*Purpose: The release ceremony: build, commit, tag matching the manifest, roll out. Audience: maintainers.*

**Outcome:** a tagged GitHub release that HACS can install, with the
built engine and Studio riding inside the integration. Five steps,
one rule: **the git tag must exactly match `manifest.json`'s
`version`** — HACS matches them by string, and a mismatch shows up
as a phantom "update" or an invisible release.

There are no release assets. HACS installs the git *tree* at the
tag, so publishing is just commit + tag.

## 0. Preflight

- `custom_components/harmonium/manifest.json` → `version` is the
  number you're about to tag (bumped during the dev round, not now).
- The battery is green (serve `dist/` on :8482, run `tests/smoke-*`)
  and `docs/PROJECT.md` has the round's entry.
- Release notes exist if you want real ones on the GitHub page
  (`docs/release-notes-v<version>.md` — v0.83.7 set the pattern).

## 1. Build everything — `make-release.bat`

From the repo root. It runs the Studio build (`npm run build` in
`studio-src/` — the reason Studio builds happen on the machine, not
in a sandbox), builds the engine (`build-engine.mjs`), and copies
the engine into `custom_components/harmonium/engine/index.html` so
the integration ships a matching bundled engine.

## 2. Commit and push

    git add -A
    git status        (eyeball it — no house configs, no _to_delete)
    git commit -m "v<version> — <one-line summary>"
    git push

Config never travels: `config.json` under `dist/` is a test
fixture, house configs live in each box's HA storage, and the
personal deploy profiles are gitignored. If `git status` shows
anything from `houses/` beyond the tracked template, stop.

## 3. Tag it

    git tag v<version>
    git push origin v<version>

Or do both halves in the GitHub UI (step 4) by typing the new tag
in the release draft — same result.

## 4. The GitHub release

GitHub → Releases → **Draft a new release** → tag `v<version>`
(create on publish if you tagged in the UI) → title
"v<version> — <name>" → paste the release notes → **Publish**.
Attach nothing.

## 5. Roll it out

- **Test box (.88)**: HACS → Harmonium → Update → pick the new
  version → **restart HA** (always after an update; the release
  page or PROJECT.md entry says when `.py` changed and made it
  mandatory rather than merely right).
- **Studio**: hard-refresh the tab (Ctrl+Shift+R — HA caches
  `studio.html` hard) and check the `s`-stamp in the footer matches
  the round. If the round bumped a stock `gen`, open the Studio and
  **Save & Deploy** once so the heal writes through.
- **Remotes**: Fully → clear cache → load start URL (Fully caches
  `/local/` hard).
- **CT (.87)** runs from the repo, not HACS: `build-push.bat` /
  `push-catrock-all.bat` as usual, restart HA only when `.py`
  changed.
- Jamaica stays frozen until visited. Always.

## Bumping for the *next* round

The dev round that changes code owns the bump: `manifest.json`
version + `ENGINE_V` (src/core/diag.js) move together at the first
engine/integration change after a tag. `STUDIO_V`
(studio-src/src/lib/state.svelte.js) is a BUILD STAMP, not a
version: `"<release> b<n>"`, where the build counter bumps on every
Studio build and never resets — the footer reads e.g. `s0.83.8 b31`,
release first, fingerprint after. At the first Studio build after a
tag, update the release half to the new number and keep counting.
By the time you're back on this page, step 0 should already be true.
