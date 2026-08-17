# Contributing to Harmonium

*Purpose: How to work on Harmonium: fork setup, the house style, doctrines you must not regress, build/push/test. Audience: contributors and forkers.*

PRs are welcome. This file is two things: how to get set up as a
fork, and the house style — the rules that keep a zero-dependency,
single-file engine honest across years of changes and more than one
house. Most of the rules were paid for with real debugging time; the
history behind each lives in `docs/PROJECT.md`.

## Getting set up as a fork

```sh
git clone https://github.com/<you>/harmonium
node build-engine.mjs                # engine → dist/index.html
cd studio-src && npm i && npm run build   # Studio → integration/.../studio/studio.html
```

To deploy to your own Home Assistant, create a house profile once:

1. Copy `houses\example.cmd` → `houses\<yourhouse>.cmd` and fill in
   `HOUSE_ID`, `HOUSE_NAME`, `HA_URL`, `DST` (your HA's share path).
2. Put your house id in `houses\default.txt` (one line).
3. Use the wrappers: `build-push.bat` (build + push engine),
   `push-engine.bat`, `push-studio.bat`, `push-all.bat`,
   `pull-my-config.bat`. They all read `houses\default.txt`.

Your house profile, `default.txt`, pulled configs and `.env.local`
are gitignored — nothing personal leaves your machine. Full details
and the multi-house model: `houses/README.md`.

## What makes a good PR

- **Run the battery** (`tests/` — see below) before and after; every
  suite's `errs` must stay empty. New behaviour ships with a suite
  case; the PR description says which suite proves it.
- **Small and single-purpose beats broad.** One concern per PR, like
  one concern per file.
- **Keep the decision log.** If you change behaviour, add the
  narrative comment (see Style) and a line to `docs/PROJECT.md`'s
  changelog explaining what changed and why.
- **Don't regress the doctrines** (below) — a PR that trades one of
  them for convenience will be declined kindly.
- Config-schema changes need a migration story (the store migrates
  on load; stock controllers migrate by generation stamp).
- By contributing you agree your work lands under the project's
  license (GPL-3.0).

Not sure a direction fits? Open an issue first — cheaper for both of
us than a finished PR that fights the architecture.

## The prime directives

1. **Code is shared, config is per-house.** Nothing in the repo ever
   writes a house's `config.json`. `push.bat` refuses a mismatched
   house marker; `dist/config.json` is a **test fixture** (the CT
   config the smoke battery was written against). If half the battery
   goes red, check the fixture before debugging anything.
2. **The battery gates everything.** Twenty Playwright suites
   (`tests/`) drive the real engine. Run them before and after your
   change; `errs` must stay empty. A behaviour worth building is a
   behaviour worth a suite case.
3. **Zero dependencies in the engine.** The artifact is one auditable
   HTML file. No frameworks, no runtime CSS tooling, no fetch of
   anything at boot beyond HA itself.
4. **ES2019 / Chromium 75 floor.** Cheap remotes ship vendor-frozen
   webviews. No flex `gap` (grid gap is fine — see
   `styles/compat.css`), no optional chaining assumptions in hot
   paths, verify anything exotic against the floor.

## Style

- **One concern per file, under ~500 lines.** When a file outgrows
  that, split along a seam and give the new file a banner header
  saying what it owns. The build concatenates everything into one
  scope, so splitting is cheap: add the file to `build.mjs`'s
  `SCRIPTS`/`STYLES` list (order only matters for top-level
  statements that run at load).
- **Comments are the decision log.** The narrative style —
  `/* WHAT CHANGED (vX — who asked: "the quote") … why the obvious
  alternative was wrong */` — is deliberate. Keep it. A future reader
  should learn not just what the code does but which bug or field
  report shaped it. Do not strip these to "clean up".
- **Say when you fail, truncate or wait.** No silent failures (HA
  errors flash in the bar), no silent truncation (grids say "N shown ·
  M more"), no silent waits (in-flight plays say "Queuing …").
- **No capability sniffing.** Feature flags lie on this hardware
  (measured: `SEARCH_MEDIA` set by players that can't, `can_search:
  false` on players that can). Key behaviour on declarations and
  provenance (entity registry platform), never on flags.
- **Declared, not inferred — at the layer that owns the decision.**
  Devices declare what they can do; activities declare where controls
  are drawn; sources declare how their ids route. When a rule needs
  an exception, make the exception a declaration too.

## Doctrines you must not regress

- **The routing model** (`core/routing.js`, `archive/design/design-library-ui.md`
  §5): every playable id is `native` / `bridged` / `fallback` /
  `none` against the cast player. Fallbacks are marked and two-press
  confirmed — a silent speaker takeover is the cardinal sin. New
  content sources declare routes (`_route`, `_viaMa`) rather than
  teaching the classifier special cases.
- **Stock generations**: every stock controller shape in the Studio
  (`studio-src/src/lib/state.svelte.js`) carries `gen`. **If you
  change a stock shape, bump its `gen`** — that is the entire
  migration story; the healer does the rest. Custom copies
  (`variant_of`) are the user's and are never touched.
- **Keys are policy, not hardcode**: physical-key behaviour is scoped
  by screen class; gestures (hold/double) are KeyMapper's job emitting
  distinct keycodes — the engine runs no gesture timers (one
  exception: select hold-capture).
- **Touch always drives the UI**; passthrough claims physical arrows +
  select only.

## Building & pushing

```sh
node build-engine.mjs        # the ONLY engine build in this clone
cd studio-src && npm run build   # Studio: on a machine, never a sandbox
build-push.bat               # or push-engine / push-studio / push-all
```

(The legacy `yaml/` authoring model and its `build.mjs` compiler are
retired to `archive/yaml/` — `build-engine.mjs` is self-contained and
is the only engine build.) Studio builds depend on the machine's
`node_modules`; a different tree produces a subtly different
`studio.html`.

Every root script is documented in
[docs/scripts.md](docs/scripts.md). Restarts are earned, not
assumed: only integration `.py` changes need an HA restart
(`push.bat` probes and tells you). Remotes pick up a new
engine on cache-clear + reload (Fully caches `/local/` hard).

## Tests

See `tests/README.md`. The pattern for a new suite: fake the socket
(`S.ws = { send: … }`, answer via `S.pending`), build a self-contained
controller in `CONFIG`, drive real DOM with Playwright, print one JSON
object, exit non-zero if `errs` is non-empty. Suites must not depend
on which house's config is in `dist/` — build your own fixtures
(`smoke-search.mjs` is the cleanest template).

## Docs

- `docs/PROJECT.md` is the living document — every shipped change adds
  a changelog entry at the top of the "Current state" block, written
  in the house voice: what changed, who asked, what the wrong obvious
  answer was, what the tests prove.
- `docs/HANDOFF.md` is the session hand-over: keep its "current
  state" table and "what's next" honest — the next session (or the
  other house, months later) starts there.
