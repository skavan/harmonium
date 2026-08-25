# The smoke battery

*Purpose: The smoke battery: the pattern, per-suite coverage, and how to add a suite. Audience: developers.*

Nineteen Playwright suites that drive the **real engine** — the same
`dist/index.html` that ships to a house — against a stubbed Home
Assistant. No mocks of the engine itself, ever: if the grid renders a
tile, it rendered it with the production code path.

## Run

```sh
cd dist && python3 -m http.server 8482 &
cd tests && for t in smoke-*.mjs; do node "$t"; done
```

`playwright-core` is a no-save install; Chromium is expected at
`/opt/pw-browsers/chromium` (adjust `executablePath` if yours lives
elsewhere). Each suite prints one JSON object; **`errs: []` is the
pass signal** (page errors fail the process), and the semantic fields
are there to eyeball in review.

## How a suite works

The pattern (see `smoke-search.mjs` for the cleanest example):

1. Load the built engine, hide the auth overlay.
2. **Fake the socket**: `S.ws = { send: m => window._sent.push(…) }`
   with `S.connected = true`. Everything the engine sends is captured;
   the test answers whichever message it wants via `S.pending` —
   deterministic, ordered, no timers.
3. Build a **self-contained fixture**: a controller in
   `CONFIG.controllers`, entities via `S.states.set(…)`, browse nodes
   via `S.browse.nodes[browseKey(…)]`, sensors, localStorage.
4. Drive **real DOM**: `p.click('#tile_…')`, assert classes, labels,
   badges, and what got sent to "HA".

Suites deliberately do **not** lean on whichever house's config is in
`dist/config.json` for new coverage — the fixture trap (a config swap
turning half the battery red) is documented in `docs/HANDOFF.md`.
Older suites that do read the fixture were written against the CT
config, which is why that file is pinned as the repo's test fixture.

## The suites

| Suite | Covers |
|---|---|
| `smoke-nav` | screens, parents, back/home ladder, nav cards, apps |
| `smoke-keys` | physical-key policy per screen class, passthrough |
| `smoke-devices` / `smoke-device` | device tiles, cast, detail pages (+ Studio round-trip) |
| `smoke-details` | generated detail screens, steppers/chips |
| `smoke-sliders` | meters and level widgets |
| `smoke-music` | the music surface: hero, transport, library tree, favourites promotion |
| `smoke-search` | search-as-a-role resolution order + registry derivation |
| `smoke-routing` | **the cast player decides**: native/bridged/fallback/none, marks, two-press confirm, routed favourites |
| `smoke-amalgam` | ★ Favorites merge, best-route dedup, ♫ de-mirrored library, pretty chips, service badges |
| `smoke-index` | the Sonos index: crawl, cache, forgiving match, instant merge, outage survival, refresh row |
| `smoke-libui` | error surfacing, queuing feedback, search row, magnifier placement, grid⇄list view toggle |
| `smoke-trailing` | trailing action zones |
| `smoke-present` | per-member presentation: inline shows on the Devices section, loose-entity controls, name/icon/tap overrides, member-beats-group, classic fallback |
| `smoke-sources` | source select tiles |
| `smoke-googletv` | Google TV dialect (projector) |
| `smoke-queue`* / `smoke-v2` | queue adapters / config v2 shapes |
| `smoke-workspaces` | multi-workspace worlds |
| `smoke-preview` | the `#preview=1` postMessage protocol |
| `smoke-studio` | the full Studio walkthrough — its preview iframe is the real engine |

(*queue coverage lives inside `smoke-music`/`smoke-v2` where noted.)

## Probes and unit smokes

Beside the battery live the `probe-*.mjs` regression probes — one per
shipped fix or feature, same harness pattern, run individually (e.g.
`node probe-vol-ux.mjs`).

**ENGINE probes need the server too** (2026-08-24 — the lesson that
cost a round): a probe that loads `http://localhost:8482/index.html`
fails with `ERR_CONNECTION_REFUSED` if you run it bare, and the
failure looks exactly like a regression. Start the static server from
the Run section first, or use `run.sh`, which starts and kills its
own. STUDIO probes are different — they stub every request through
Playwright routes and need nothing running.

Worth knowing by name: `probe-activity-tabs.mjs` walks every tab of a
real activity card (Svelte compiles unknown identifiers as globals, so
a missed import in the per-tab components only fails at runtime — this
is the net); `probe-stock-lock.mjs` (pure, no browser) proves a user's
fork survives a stock heal byte-for-byte; `probe-stock-lock-ui.mjs`
and `probe-skin-lock-ui.mjs` drive the Studio's stock lock (controller
and skin); and `tests/test-integration-split.py` (plain python, no
pytest) imports the integration's modules against stubbed HA and
exercises the pure seams — `validate_config`, `_bind_ws`, service
wiring.

`test-asset-deploy.py` (plain python, no HA) is the filesystem
contract for stock assets: fresh provision, stock updates flowing to
existing installs, a user's own photo never overwritten, the pre-stamp
adoption, and — since v0.84.6 — the stock/user path split and its
migration (a user photo *named* like a stock one keeps its own
fingerprint; a pre-split flat install adopts its stock while
grandfathering the user's flat photo). `probe-skin-path-split.mjs` is
its config-side twin: heal repoints a pre-split skin into
`skins/stock/` and never claims anything under `skins/user/`.

A probe that guards a RETIRED feature is worse than no probe — it
reads as a regression forever. When a feature is parked, retire its
probe in the same commit (`probe-battery.mjs` + `src/core/battery.js`
went this way on 2026-08-24: the engine-side beeper was parked in
favour of the HA blueprint, but the probe stayed and had been red
ever since).

## Adding a suite

Copy the fake-socket prologue from `smoke-search.mjs`, build your own
fixture, assert through the DOM, print the JSON, and add nothing to
any shared state another suite reads. If your feature bounds coverage
(caps, retries, sampling), print what was dropped — the battery's
job is to make silence impossible.
