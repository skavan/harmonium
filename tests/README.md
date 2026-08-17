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

## Adding a suite

Copy the fake-socket prologue from `smoke-search.mjs`, build your own
fixture, assert through the DOM, print the JSON, and add nothing to
any shared state another suite reads. If your feature bounds coverage
(caps, retries, sampling), print what was dropped — the battery's
job is to make silence impossible.
