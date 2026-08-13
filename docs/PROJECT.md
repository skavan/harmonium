# Harmonium — HA Lightweight Remote Framework

Name: **Harmonium** (successor to harmonia/hastrion; prototype
developed as `remote-proto/`).
Repo home: `G:\Documents\Code 2025\repos\HA-2026\harmonium` (organized
by concern: src/core, src/widgets one-file-per-widget, src/ui,
src/styles; zero-dep `build.mjs` → single-file `dist/index.html`).
Working docs: `S:\Documents\HA26` · Session partner: Claude (Cowork).

## Intent

Build a lightweight, instant-on control frontend for Home Assistant aimed
at low-power Android hardware remotes (Sanytron Astrion, Haptique RS90 and
similar), while running equally well in any browser, on tablets, and on
embedded Linux (WPE WebKit/Cog). Long-term: a product other HA users can
adopt — not just a personal fix.

## Core thesis

The bottleneck on weak remote hardware is NOT the browser/webview — it is
the stock HA frontend: a multi-MB Lit/Polymer bundle plus a websocket
firehose of every entity in the instance. So:

1. **Entity-scoped data contract.** Subscribe only to what's on screen via
   `subscribe_entities` + `entity_ids` (compact diffs). Verified: even
   ha-fusion still uses the full-state firehose; we don't.
2. **Tiny renderer.** v0 is one dependency-free HTML file (~35KB). v1
   graduates to Svelte, forking ha-fusion's MIT widget layer, rebound to
   our filtered store.
3. **Buttons are first-class.** Full D-pad/spatial-focus operation;
   touch is also supported but never required.
4. **HA is the brain.** Activities are HA scripts; activity state is an
   `input_select` HA owns; anything smart is a template sensor/automation
   HA-side. The remote is a dumb, fast renderer.

## Architecture

- **Engine** (`remote-proto/index.html`): websocket client (auth →
  filtered subscribe → diff merge), widget catalog, spatial focus +
  capture mode, activity lifecycle, theming. Contains ZERO
  house-specific data.
- **Config** (`remote-proto/config.json`): screens, sections, tiles,
  activities, context bindings, keymap, theme tokens. Pure data. In v1
  this JSON is stored/delivered by a custom HA integration over the same
  websocket (live push, HA backups, multi-remote sync).
- **Schema** (`screen-schema.md`): the evolving contract, incl. the v0.3
  addendum (lifecycle, sections, context, styling doctrine).
- **Shells** (future): minimal Android APK with native key handling and
  frontend shipped in assets (instant boot); WPE/Cog for embedded Linux;
  plain browser/Fully Kiosk today.

## Key decisions log

| Decision | Choice | Why |
|---|---|---|
| Transport | HA websocket, filtered `subscribe_entities`; thin state-bus seam so MQTT could be added later | Native contract, no broker dependency; retained-message instant-on deferred until proven necessary |
| Widget model | One tile **chassis** (slots + focus/capture plumbing) + per-domain **adapters**; rare bespoke "panel widgets" (dpad) | HA's own card evolution validates it; adapters are the extensibility surface |
| Extensibility tiers | 1st-party compiled widgets → community **declarative** widgets (JSON over trusted primitives + curated utility-class whitelist) → arbitrary-JS "on your own" tier | Opens the layer Unfolded Circle keeps closed (their Qt/QML firmware UI is why their widget backlog exists) without losing the perf guarantee |
| Styling | Design tokens via CSS custom properties (config `theme` map); later align token names with HA theme variables for free theme compatibility; no CSS framework, no runtime Tailwind | Tokens are themable data; HA themes are literally CSS variable maps |
| Activities | select = start (off) / open (running); hold or power key = end; optional inline two-press confirm (red tile, 5s), never modals | Harmony's lesson: accidental toggle-off is the cardinal sin |
| Activity state | `input_select.porch_activity`, set FIRST by each activity script; sync automation covers device-initiated starts | Solves shared-hardware ambiguity (two TV activities, one TV); exclusivity for free |
| Context | Screen `context` overlaid by active activity's context; `$context.slot` is the ONLY substitution (no templating client-side) | One TV screen serves Fire TV & Smart TV with different dpad targets, command maps, volume paths |
| Volume (ARC) | Split `entity` (commands → Samsung TV, relays via ARC) from `level_entity` (truth → soundbar) | Command path ≠ state path in ARC/CEC chains; mirrors the proven URC-card setup |
| Devices access | Scroll-down "Devices" sections on activity screens; long-press rejected (spent on capture/end; undiscoverable) | Matches the user's own harmonia design |
| Keymap | Logical buttons in engine; physical-key quirk table in config (`keymap`), matching Astrion KeyMapper conventions (Tab=down, +/-=vol, [=back, ]/;=home, F2/p=power) | One config portable across devices |
| Apps access | Chassis-level `trailing` slot (icon + action on a tile's right edge, own focus stop); Now Playing trails into the Apps screen; no inline Apps grid on activity screens | Apps are a picker, not a dashboard — occasional-use content shouldn't spend permanent vertical space; slot is generic (any tile can trail into a detail screen) |
| D-pad passthrough | `dpad_passthrough` screen key: PHYSICAL D-pad drives the device during an activity (command-map aware); touch is NEVER intercepted — taps always drive the UI; home/power stay system keys | Harmony's defining behavior; the touch rule was a real bug caught on-device (Home tile sent ENTER to the Fire TV) |
| Two homes | Device home = touch affordance (ring corner in browser, `buttons` bar on remotes); system home = physical key + nav tiles, laddering screen → room → main_home | Same word, two meanings — separate surfaces so neither steals the other |
| Button bar | `buttons` panel widget: 2-4 configurable logical-key slots through the shared command map; shown `only: physical_dpad` where the on-screen ring is hidden | Hardware remotes still need touch access to info/menu/back/home; config picks the slots |
| Device details | GENERATED virtual screens (`detail:<entity>`) from per-domain compositions of power/stepper/chips primitives; chip options read from entity attributes (hvac_modes, source_list…); device tiles auto-grow a `tune` trailing zone; `detail:`/`trailing:` config overrides | Scales to every device with zero config; options always match the hardware; tap stays zone-deterministic (body=act, trail=deeper) |
| VOL exception | On a device's detail screen ONLY, VOL nudges that device's primary range (brightness/setpoint/volume/position); everywhere else VOL = room/activity audio | User call: "do what I mean" scoped narrowly enough to keep the volume promise intact elsewhere |
| Back placement | Global chevron in the status bar (shown iff history); per-screen Back tiles retired; Home = destination (ladder + nav tiles) and resets history | One place for Back on every screen incl. virtual ones; Back unwinds, Home jumps — different jobs, different affordances |
| Music presets | HA-published favorites: trigger template sensor calls `music_assistant.get_library` (favorites) → list attribute; remote renders it via `presets_from`; `music_assistant.play_media` takes readable names/uris | Solves addressing (no opaque content ids in config) AND liveness (heart in MA → tile appears); remote stays dumb, rides the existing subscription; rejected client-side browse_media (media-browser scope creep, per-integration trees) |
| Generated tiles | `presets_from` tile type + `$item.<field>` substitution (per-row sibling of `$context`): expands an entity's list attribute into real preset tiles; structural signature triggers grid re-render on change | Chips pattern at tile scale; generic day one (any HA-published list becomes tiles) — the shape of the declarative community-widget tier |
| Music screen | No passthrough (tiles must stay reachable); transport adopts coverbtns ◀▶ roving; Now Playing = art hero (`art: true`: entity_picture + title/artist/album + interpolated progress, 1s ticker touches only visible heroes); drawer holds favorites + `transfer_queue` "Pull Music Here" | TV's center of gravity is the D-pad (foreign UI); music's is content + transport — different screen, same chassis |
| Storage tiers (2026-07-20) | Source of truth is HA-side, today as helpers/template sensors, ABSORBED by the v1 custom integration (config + favorites + activity state in one place); browser storage rejected as truth (per-device divergence, cache-clear loss, invisible to HA) but reserved as instant-on cache. Favorites sensor is ONE per house (library-wide; room-ness comes from `$context.media_player`) — the `porch_` prefix is a misnomer | User pushback on helper sprawl ("what if I have 10 rooms?") — per-room cost is only the activity select+scripts (Harmony had the same shape); helper dislike = strongest argument to pull the integration forward after schema freeze |
| Media browsing scope | Favorites-only, flat. No ALBUMS/ARTISTS/TRACKS/PLAYLISTS browse tier on the remote (that's a media browser — the stock app's job, done worse on a D-pad). If ever wanted it's config-shaped: per-type get_library calls in the sensor + per-type `presets_from` sections | Remote = recall, phone = discovery |
| Key policy (v0.11) | Physical keys scoped by SCREEN CLASS (room/group/detail/activity; `class` + `parent` config keys): tap-Back/Home = UI (unwind / ladder via parent), HOLD = device back/home through the command map; Power's blast radius follows class (room=All Off, group=page devices, detail=device toggle immediate, activity=end) with confirm only for multi-device scopes; VOL follows the focused device's primary range with a MEDIA CARVE-OUT (media focus keeps the $context.volume ARC path); passthrough claims arrows+select only, cued by a 2px accent rule + gamepad glyph | Field pain: "hitting the wrong buttons all the time" — keys get policies per page class, not one behavior; user picked tap=UI / hold=device over both pure options |
| Gestures = shell (v0.11.1-2) | Taps fire on KEYDOWN; press-type disambiguation (short/long/double) is KeyMapper's job, emitting DISTINCT keycodes per gesture — zero timers in the webview (exception: select hold-capture, Enter delivers true key pairs). Confirmed Astrion matrix: Back `[`/`]`, Home `F1`/`;`, Power `F2`/`=` (hold = All Off w/ confirm), Menu `#`/`@` (hold → Apps drawer via `buttons` navigate binding), Mute `` ` ``, CH PageUp/PageDown. `buttons` bindings accept {navigate} and no-op on unresolved context targets. Key-event debug card (`global.debug` / `#debug=1`) for field diagnosis | KeyMapper-injected keys don't deliver reliable keyup/hold timing — keyup-gated taps and engine hold timers died on-device; the old hastrion dashboard-hotkeys card was the authoritative raw-emission map. Doubles taxed every single press, so avoided on nav keys. Same contract the native APK shell will honor |
| Drawer pop + switch confirm (v0.12) | Drawer screens (`drawer: true` — Apps, Music Library) pop back after a preset fires (label flashed in the bar; target resolved eagerly for the deferred ensure-activity path). `confirm_switch` (global true, per-activity override) asks "Press again to switch to X" before starting an activity while another runs; same-activity open never asks. Per-activity `stop` used in anger: music ends via `script.activity_music_stop` (state + media_stop on the Sonos, nothing else) | Field report: "physical buttons don't work on App page" was really "make me not need them" — a drawer is pick-one-and-leave. And "I don't always want one activity to turn off the others" → confirm as a setting; "some activities' off is merely STOP" → per-activity stop scripts |

## Current state (v0.83.4, 2026-08-13)

v0.83.4 — **THE HACS COMPLIANCE MOVE** (field failure on the first
real install attempt: HACS refused with "Repository structure for
v0.83.3 is not compliant"). The lesson: HACS validates the GIT TREE
of the tagged version and requires the integration at
`custom_components/<domain>/` in the REPO ROOT — `zip_release` only
changes the download source, not the structure check, so our
`integration/custom_components/harmonium/` layout failed validation
before the zip was ever considered.

- `git mv integration/custom_components custom_components` (history
  preserved); `integration/README.md` → `custom_components/README.md`;
  the empty `integration/` shell moved to `_to_delete/`.
- **zip_release RETIRED** (hacs.json now just name/render_readme/
  homeassistant): with the tree compliant anyway, tree-install is
  strictly simpler — a release is now commit + tag, with NO asset to
  attach or forget. The bundled `engine/index.html` and
  `studio/studio.html` are committed build artifacts, same doctrine
  as `dist/index.html`.
- make-release.bat rewritten for the tree story (3 steps, prints the
  commit+tag instructions; the zip step is gone); paths patched in
  push.bat (all modes), finish.mjs (studio build destination),
  smoke-devices/smoke-studio (both re-run green), README's How-it's-
  built table, ARCHITECTURE.md, custom_components/README.md.
- Publishing flow now: make-release.bat → git add/commit/push →
  GitHub release with tag v<manifest version>. HACS installs
  custom_components/harmonium from the tag.
- **THE VIRGIN-INSTALL BUG** (same day, first real HACS install on
  the fresh .88 HA: "Error setting up entry" —
  FileNotFoundError /config/www/harmonium/index.html): the engine
  self-deploy wrote into www/harmonium/ without ever creating it.
  Every dev house has had that directory for months; a fresh HA has
  no www/ at all. Fixed: mkdir(parents=True) before the write, and
  the whole deploy block is now NON-FATAL (OSError → logged error
  with a fix-and-restart hint; the integration still sets up — a
  remote UI that can't deploy must not kill the entry). manifest →
  0.83.4; tag v0.83.4 is the first HACS-installable release.

## Current state (v0.83.3, 2026-08-13)

v0.83.3 — **DESLUG** (statusreview tweak, climate-detail screenshot:
"Note the presets like wind_free. We need to intelligently strip the
_ so it reads wind free"). Display-layer only:

- `deslug()` joins `cap()` in widgets/helpers.js, and cap() now
  deslugs before capitalizing — every cap() call site is a display
  of an entity state/enum (audited: climate, cover, device×4, fan,
  light, media×3), so fan_only reads "Fan only" and heat_cool "Heat
  cool" everywhere at once.
- Chip rows (hvac/fan/preset/source/effect/sound_mode) render
  deslugged labels while `data-ch` keeps the RAW value — verified
  in probe-deslug.mjs: the "wind free" chip still calls
  set_preset_mode {preset_mode: "wind_free"}.
- fan tile's preset sub-line deslugged.
- ENGINE_V 0.83.3; battery 20/20 (one smoke-studio flake was the
  dist server dying between suites — clean on re-run).
- **The volume-kind stepper matches the volume row** (Suresh: "The
  first is nice. The second needs fixing (Volume)"): steprow.vol —
  58×46 buttons, 21px/600 value, 12px gap — so a stepper-styled zone
  (the Receiver) and the wired volume read as the same control.
  Other stepper kinds (brightness/setpoint/position) keep the big
  display type: on a detail page they ARE the page.
- **The photo-mode 1px seam was a WRONG APERTURE, not rounding**
  (Suresh: "the LCD panel is one pixel off on both axis… grey/white
  line"): SKIN_ASTRION.screen carried the alpha-scan of the ORIGINAL
  1280×4084 Photoshop export, but the shipped 814×2600 PNG is a
  slightly different crop — flood-filling its enclosed transparent
  hole gives x 82..737, y 93..1178 = **10.07/3.58/80.59/41.77** (the
  old 9.84/3.80/80.00/41.80 left ~6 unfilled source rows above the
  iframe showing the page background). Preset corrected; the clip
  also runs 1px proud of the rect with the iframe nudged back in
  (black ring under the photo's anti-aliased rim — the 📷 bleed
  trick, live). AND the deeper cause of "1 or two pixels off our
  vertical position" (the follow-up screenshot's bottom line): the
  iframe's height was DERIVED (width × viewport ratio), so any
  rect-vs-viewport aspect mismatch left a hairline at the bottom —
  and every hand-nudge of the rect moved it. The iframe now scales
  X and Y INDEPENDENTLY to fill the rect edge-to-edge; the residual
  anamorphic stretch is the aspect delta (~0.6% on the astrion),
  invisible where a white line is not. Verified with red-background
  leak tests: 0 leak pixels with the corrected rect AND with a
  deliberately wrong-aspect rect (h=42.5). RE-APPLY the preset on
  the device profile (footer → 🖼 device photo) to pick up the new
  rect — stored configs carry the old numbers.
- **The slider volume's middle is the %** (same round — Suresh, seeing
  the wired-volume tile beside a stepper Receiver: "like the first
  example in height but with the volume % instead of a duplicate
  slider"): in slider mode the −/+ row's center shows the percentage
  (21px, sized to the 46px button row — deliberately NOT the
  stepper's 42px display type) instead of the mini-meter that
  duplicated the fat track above it. Compact mode keeps the meter —
  with no track, it IS the level. The % follows optimistic nudges
  and the drag finger. Battery 20/20 re-run; probe-vol asserts
  centerPct + miniMeterGone.

## Current state (v0.83.2, 2026-08-13)

v0.83.2 — **FOUR MORE, WITH A CAMERA** (statusreview follow-ups):

- **Artwork is themeable** ("have the library artwork (including
  tiles) set in the theme (for both music and tv)"): three new
  engine tokens — `--br-art` 58px (library cards, music AND tv
  browse grids), `--art-big` 84px (art-forward playlist cards; wide
  screens add 16px via calc), `--app-art` 42px (app stamps on
  presets/apps drawer). List rows already rode `--icon-zone`. Theme
  editor grows Library art / Playlist art / App stamp knobs beside
  the existing tile-h/icon-zone row.
- **Export is a dropdown** ("this workspace, all workspaces" — asked
  twice whether Export took everything; the answer now lives in the
  control): This workspace = the old full-fidelity draft download;
  All workspaces = a one-file bundle {harmonium_export:"workspaces",
  order, workspaces:{id:{name,config}}} — the current world from the
  live draft, the rest fetched fresh (?ws=). importConfig names the
  bundle instead of half-loading it.
- **Washes are toggleable** ("Just a simple toggle"): `washes on/off`
  link in the soft-remote footer (both photo and grid modes), gating
  every wash — tap, hold-latch, hotspots and soft keys alike.
  Persisted per browser (hakr_studio_wash).
- **📷 The preview screenshots itself** ("the screenshot should honor
  alpha on the preview (this is what will build my gifs)"): camera
  button beside the Showing row. The engine iframe's DOM renders to
  canvas (html-to-image — NEW studio dependency, `npm i` before the
  machine build), composited into the skin photo's aperture at the
  photo's NATURAL resolution with a 2px bleed under the anti-aliased
  rim, photo drawn over — everything outside the device is genuinely
  transparent (verified: corner alphas 0, screen content composited,
  814×2600 out of the 814px astrion asset). No skin → the bare
  screen at 2×. THE FONT TRAP: html-to-image can't read a
  cross-origin <link>'s cssRules and silently skips Google Fonts —
  every icon renders as its ligature name; snapFontCSS() fetches the
  stylesheet itself, inlines each url() as a data: URL, and passes
  it as fontEmbedCSS. Files download as harmonium-<screen>.png.
- Verified end-to-end in probe-nits2.mjs (wash 9→0→9, export bundle
  carries both workspaces, PNG alpha checked with PIL, --br-art
  reaches the engine); battery 20/20.

## Current state (v0.83.1, 2026-08-13)

v0.83.1 — **THE NITS AND NATS ROUND** (statusreview.md, four items +
one question):

- **Actions were already global in scope** (item 1): any page, preset
  or activity in a workspace can reference any sequence — the room
  stamp is filing, not scope (SequencesEditor has said so since the
  groups pass). What they could not do was TRAVEL, so they now ride
  the standard snippet grammar: **action snippets** — ⤴ Export
  snippet on any Action card's ··· menu, ⤵ Import snippet… beside
  ＋ Add action, across workspaces like every snippet. The room
  stamp is dropped on export AND import (it names the source house's
  rooms). Studio: SNIPPET_TYPES.action + actionSnippetSeq() +
  SequencesEditor doors.
- **Preview first-mount height** (item 2 — "wrong height unless I
  click the photo mode on then off"): the plain frame's last-resort
  viewport was the historical 320×537 guess, which only healed after
  the photo dance wrote a measured viewport into the profile. Now a
  profile without its own measurement borrows one from any profile
  in the workspace, and the final fallback is the HA100 ground truth
  349×581 — first mount now matches the post-dance size.
  (PreviewPane plainVp chain.)
- **Volume: fat by default + optimistic** (item 3): the slider
  treatment is now the default volume style everywhere (generators'
  dflt and the presShows path: "compact"→"slider"; the widget draws
  the track unless slider:false — a generated compact choice still
  says so explicitly). And +/- taps nudge the LOCAL volume_level by
  0.05 immediately (renderStates before the HA round-trip; the next
  diff overwrites with truth) — the "doesn't update quickly" was a
  full round-trip plus device report latency before anything moved.
  Slider drags now write optimistic state too, so "Vol n%" follows
  the finger. Verified: probe-vol.mjs (34%→39% before any state
  event arrives; volume_up still called).
- **Browse list rows read like a list** (item 4, screenshot): browse
  items are preset-TYPE tiles, and .wgt-preset's centered-card
  styling (text-align:center, free wrap) leaked into .row mode —
  big centered wrapping titles. Now .tile.brw.row is left-aligned,
  drops the row +2px bump (base --fs-1 / --fs-m1, incl. a music-
  scope override — the #app rule outranks the class chain), and
  ellipsizes on one line. Plus the asked-for THIRD VIEW: the
  category toggle cycles grid → list → **grid2** (two-wide cards —
  half the density, double the label room; brCols:2 stamped by
  gen-browse, honored by render.js's section host the same way the
  list narrows to one column). Old localStorage view values stay
  valid. Verified: probe-libui-look.mjs (left/15px/nowrap rows;
  2-column host; toggle title cycles).
- Answered: **Export downloads the current workspace only** (the
  tooltip says so); snippets are the cross-workspace carrier. A
  whole-house export-all remains an easy ⋯-menu add if wanted.
- ENGINE_V 0.83.1. Battery 20/20 green post-change; new probes
  probe-vol.mjs, probe-nits.mjs (plain-frame first-mount 349×581 +
  action-snippet round trip: 5→6 sequences), probe-libui-look.mjs.
- Studio src changes (state.svelte.js, SequencesEditor.svelte,
  PreviewPane.svelte) need the machine build + push-studio.bat;
  engine needs push-engine.bat + Fully cache clear.

## Current state (v0.83, 2026-08-12)

v0.83 — **THE SHOP WINDOW** (P0-3, beta-gaps §5 — Suresh: "The main
readme needs to sell our work and get the user excited… We get one
chance to make an impression"). The outsider docs, complete:

- **README.md rewritten product-first.** Hero GIF (real engine
  booting + D-pad walk + music controller, composited into the
  astrion device render at the true 349×581 viewport), four engine
  stills, a Studio tour GIF, the map-keys and pairing shots, a
  3-step HACS quick start, cookbook table, and the architecture
  moved below the fold (linked, not leading). Old README's technical
  content survives in ARCHITECTURE/CONTRIBUTING links.
- **All media generated from the REAL engine/Studio headlessly**
  (`tests/shoot-engine.mjs`, `tests/shoot-studio.mjs` — Playwright
  against the dist fixture with stubbed WS states; Material Symbols
  served locally because the sandbox can't reach Google Fonts — the
  same class rule Google's css2 ships had to be stubbed too, or every
  icon renders as its ligature name). 12 assets in `docs/media/`,
  2.2MB total.
- **docs/GETTING-STARTED.md rewritten for the HACS era**: zero →
  paired remote with no file shares and no copied tokens; links Brad
  Sanders' community sideloading guide for the Astrion hardware prep
  instead of duplicating it; honest fresh-install story (empty store
  → build one page → Save & Deploy → then pair).
- **docs/cookbook/** — seven task-shaped pages (first-screen,
  activities, presets, device-photo-skin, hardware-keys, workspaces,
  theming), each ending in one outcome; the old `docs/cookbook.md`
  stays as the deeper config-recipe collection, cross-linked.
- **CONTRIBUTING.md** gains the fork setup (houses\default.txt +
  wrapper scripts) and a "what makes a good PR" section; battery
  count corrected to twenty; push examples use the new script names.
- **SECURITY.md** (new): trust model, the pairing ceremony +
  guardrails, engine self-deploy stamp, forker token hygiene,
  vulnerability reporting.
- **LICENSE: GPL-3.0** (Suresh: "I would prefer if someone didn't
  take the code and make a commercial product" — GPL's
  keep-derivatives-open obligation kills closed commercial forks
  while staying real open source; Polyform NC was the alternative
  and was declined for community friction). README/CONTRIBUTING
  carry the license note.
- Media shoot states are PLAUSIBLE FICTION (album "Golden Hour" by
  The Analog Hours is generated art) — no real house data in any
  screenshot beyond the CT fixture's entity names.
- Earlier same day: **repo history reset for beta** — full history
  (which carried a real LLAT in `.env.local`, since revoked, plus
  ~250MB of scratch) archived to private `skavan/harmonium-alpha`
  via GitHub rename; public `skavan/harmonium` restarted at a
  single clean baseline commit; `.gitattributes` line-ending
  contract added (`.bat`/`.cmd` = CRLF on every checkout — four
  committed bats were LF-blobbed and would mis-parse for
  autocrlf=false forkers); `.md4h/` editor scratch untracked.

Still open for beta launch: make-release.bat run + v0.82 tag with
zip, the community-post announcement, and the video (storyboard
offered, GIFs shipped first).

## Current state (v0.82.1, 2026-08-12)

v0.82.1 — **THE FORK-READY SWEEP** (Suresh: "We have a whole bunch
of ***catrock***.bat files… so someone who forks the repo isn't
screwed or confused"). And the sweep found a live wire:
SECURITY — `.env.local` at the repo root held a REAL long-lived
access token, tracked in git, on the PUBLIC repo. Now untracked and
gitignored, but git history is forever: THE TOKEN MUST BE REVOKED
(HA profile → Security). Recommendation on record: a fresh-history
push before announcing the beta (history also carries ~250MB of
_to_delete tarballs and personal house configs).
THE DEFAULT-HOUSE MODEL: wrappers renamed off the house —
build-push.bat / push-engine.bat / push-studio.bat / push-all.bat /
pull-my-config.bat all act on houses\default.txt (one line, e.g.
"ct"); a forker copies houses/example.cmd (the only tracked
profile), fills four values, writes default.txt, done. push.bat
stays the generic core; the .house marker safety is unchanged.
UNTRACKED + IGNORED: .env.local, houses/*.cmd (except example),
houses/default.txt, houses/<house>/ config snapshots, _to_delete/,
_survey2/, release/. MOVED TO _to_delete (delete it yourself —
~250MB of tgz): the five catrock wrappers, push-to-ha.bat (the
pre-push.bat Jamaica pusher), harmonium-integration.zip (superseded
by make-release), "dist cat rock/", the duplicate catrock.cmd
(ct.cmd is canonical — the share marker reads "ct").
houses/README.md rewritten around the fork story with the script
table. Docs' script names updated.


## Previous state (v0.82, 2026-08-12)

v0.82 — **THE HACS STORY** (beta-gaps P0-2, chosen over the grouping
card: "the docs depend on this being settled").
ENGINE SELF-DEPLOY: the release bundle carries the engine INSIDE the
integration (custom_components/harmonium/engine/index.html, placed
by make-release.bat); async_setup_entry deploys it to www/harmonium/
so a HACS install needs no hand-copying, and HACS update → restart →
redeploy is the whole update rail. THE OWNERSHIP STAMP
(packaging.py, pure stdlib, 8-case matrix green on plain python):
the integration records the fingerprint of what IT deployed
(.engine.stamp) and only ever overwrites a file matching its own
stamp — push-catrock-engine.bat pushes are never reverted, dev
checkouts without a bundle never deploy at all.
THE RELEASE RAIL: hacs.json (zip_release → release/harmonium.zip) +
make-release.bat (build Studio → build engine → bundle engine into
the integration → Compress-Archive with integration files at the
ZIP ROOT, exactly what HACS expects) + publishing steps printed
(tag v<version> matching manifest, attach the zip). manifest.json
version → 0.82.0 (bump per release from now on).
VERSION SURFACING: engine_version now reports {v, bundled,
integration}; the Studio header shows a quiet v-chip (tooltip:
deployed engine fingerprint) and an UPDATE STRIP appears when
GitHub's latest release beats the installed manifest ("update in
HACS, then restart" + release notes link + dismiss) — the one trick
worth stealing from the dckiller51 fork. Silent on every failure,
including "repo not published yet", which is today's state.
VERIFIED: should_deploy 8/8; integration compiles; probe asserts
chip v0.82.0, strip for stubbed v0.83.0, dismiss works; battery
20/20. REMAINING (only Suresh can): the public repo EXISTS and is git-synced to G:\ —
https://github.com/skavan/harmonium (manifest repointed) — so: run
make-release.bat, tag v0.82.0, attach release/harmonium.zip — then
HACS custom-repository installs work.


## Previous state (v0.81.2, 2026-08-12)

v0.81.2 — **APPROVE HEALS** (field day one: "clicking approve isn't
doing anything!" — and CT's error log said why, four times over:
`ValueError: Harmonium astrion already exists`). Three fixes, all
Studio:
(1) THE CODE IS THE SUFFIX: HA's async_create_refresh_token refuses
duplicate client_names, so a remote that ever paired before could
never approve again. The minted name is now "Harmonium <name>
<CODE>" — the offer's code is random per pairing, collision-proof
and human-readable. Old tokens deserve deleting in the profile but
no longer block.
(2) ERRORS SHOUT IN THE BANNER: pairing failures rendered only in
the little status line — invisible in practice. A red strip now
appears above the pair banner with the message, plus a pointed hint
when the cause is a leftover duplicate token.
(3) THE 401 FLOOD: a Studio tab with an absent/revoked token polled
pair_admin every 10s and HA's http.ban logged each as a login
attempt (measured at 16:44 — that path ends in an IP BAN). pollPairs
now skips without a token and STOPS permanently on a real 401.
Verified: probe asserts client_name "Harmonium porch remote
FIG-482"; full handshake still green end-to-end. Studio-only deploy:
build + push studio + hard refresh (no HA restart).


## Previous state (v0.81.1, 2026-08-12)

v0.81.1 — **THE DOOR OUT** (Suresh, first field test of pairing: "It
worked great on the browser - but the astrion seems to be authed!").
Of course it is — a provisioned kiosk carries its token in
localStorage and never meets the overlay. Pairing had a door in and
no door out. The diag: page's Tools band gains **Sign out &
re-pair**: first tap ARMS with the engine's standard two-press
confirm chrome ("tap again to sign out", TIMING.confirm window),
second tap burns hakr_token and reloads — which boots straight to
the Pair screen, host prefilled (the host is deliberately KEPT).
With no token stored it says so and does nothing. Full
de-authorization = this + revoking the old "Harmonium <name>" token
in the HA profile. Implementation note: the diagout widget registers
LAZILY from diagScreen() — core/ files load before
widgets/registry.js, so a parse-time WIDGETS.x assignment would
throw. Verified: arm shows confirm sub, token survives tap 1, burns
on tap 2, host survives, reload lands with Pair leading; battery
20/20. Engine-only — no HA restart for this one.


## Previous state (v0.81, 2026-08-12)

v0.81 — **PAIRING** ("Let's go!" — beta-gaps §1, P0-1, built exactly
to the design). Bluetooth-style numeric-comparison onboarding: zero
typing on the remote.
THE BROKER (integration): `pairbook.py` — a pure-stdlib PairBook
(testable without HA: 8-case suite green on plain python) — plus
`pairing.py` views registered from async_setup_entry. Unauth doors:
POST /api/harmonium/pair (opens an offer: 128-bit session id + a
FIG-482 code from an unambiguous alphabet, per-IP rate limit 5/min,
book cap 5, TTL 5min, persistent notification), GET/DELETE
/pair/{session} (poll / back out). Auth doors: GET/POST /pair_admin
(Studio lists pending; approves with a token IT minted, or denies).
The token releases to the poller EXACTLY once, then the session
burns. The integration never mints anything.
THE REMOTE (engine): the auth overlay leads with "Pair with Home
Assistant" (manual token entry demoted to the quiet path). Pair →
POST the offer → the code renders 56px accent, centre screen →
poll every 2s → approved lands the token on the same localStorage
shelf the manual path uses → connect. Denied/expired fall back to
the form with a plain sentence; Cancel DELETEs the offer.
THE STUDIO: a banner under the header for each pending offer —
the code big and mono, the remote's name, expiry countdown,
Approve/Deny. Approve mints `auth/long_lived_access_token`
(client_name "Harmonium <name>", lifespan 3650) over the Studio's
OWN authenticated websocket — the documented path — so every
paired remote is a NAMED token in the approving user's HA profile,
individually revocable there (instant remote de-auth, a feature we
document, not hide). pollPairs every 10s keeps the banner honest.
VERIFIED end-to-end (probe-pair: real engine + real built Studio +
a simulated broker with pairbook semantics): code shown on the
engine → same code + name in the banner → Approve mints (asserted:
type auth/long_lived_access_token, Harmonium-prefixed client_name,
lifespan 3650) → broker receives the minted token → banner clears
→ engine's next poll stores MINTED-LLAT-XYZ and the overlay
closes. Zero page errors both sides; pairbook 8/8; pairing.py
compiles; battery 20/20.
DEPLOY NOTE: this round touches the INTEGRATION — push the .py
files and RESTART HA (build-push-catrock.bat deliberately skips
integration .py). Then engine push + Fully clear, Studio build +
push + hard refresh, as usual.


## Previous state (v0.80.7, 2026-08-12)

v0.80.7 — **THE PLAIN FRAME CATCHES UP + KEYS EXPLAIN THEMSELVES**
(Suresh: "The no device photo one is too short. Also… a hover over
a key told me what it did in a tooltip in both modes").
(1) The photo-less phone frame was still hardcoded 320×537 — ~8%
less content than the device's true 349×581. It now renders at the
profile's viewport 1:1 (skin.viewport → profile.viewport → the old
320×537), and "no photo" HOISTS the skin's measured viewport onto
the profile before deleting the skin, so ground truth survives the
toggle.
(2) keyTitle(btn): every soft key — grid buttons and photo hotspots
— carries a tooltip that verbalizes what the wash only hinted:
explicit page binding (navigate/service/seek/sequence), "passed
through to the device", globals, then the engine's ambient meanings
(moves focus / activates the focused tile / back / home / activity
power), with the hold variant riding along ("LEFT — passed through
to the device · hold: remote.send_command"). Unbound keys say
"nothing on this page" — the soft remote still never lies.
Verified: tv-page hotspot titles read passthrough + hold; ch_up
truthfully reads nothing (their tv binds seek to left/right holds,
not channel); after "no photo" the plain frame measures 349×581
with contentWindow to match and grid tooltips live ("UP — moves
focus"). Zero page errors.


## Previous state (v0.80.6, 2026-08-12)

v0.80.6 — **GROUND TRUTH: 349×581 @ 1.38** (Suresh, reading the
brand-new diag: page off the HA100's own screen). The panel runs a
CUSTOM ~220dpi density — 349×1.375=480, 581×1.377=800, ratio
0.6007 — which is why every standard-DPR guess (1.0 / 1.333 / 1.5)
missed by a few percent, and exactly what his Photoshop stretch
measurements kept detecting. The Astrion preset viewport is now
349×581, verified in the scratch build (contentWindow 349×581
inside the aperture). The diag page paid for itself within one
deploy: tap ⓘ, read one line, done — that's the procedure for
every future device skin. RE-APPLY the preset (no photo → 🖼 device
photo → Save & Deploy).


## Previous state (v0.80.5, 2026-08-12)

v0.80.5 — **THE DIAGNOSTICS PAGE** (Suresh, mid-viewport-hunt, after
chrome://inspect answered "Device discovery is not responding":
"Should we use this moment to create a diagnostics page?"). Yes —
the device now answers for itself. `diag:` is a virtual screen in
the keys: mold (core/diag.js, new file, registered in build.mjs):
**Tap ⓘ opens it** (tap again returns home; hold ⓘ stays Key
capture; v0.32's perfInfo flash is retired — everything it said
lives here now). Four bands, D-pad scrollable: THE PANEL (viewport
CSS px — the exact number a skin's `viewport` wants — pixel ratio,
physical resolution, orientation), THE BUILD (**Engine vX.Y.Z — the
engine finally states its own version on screen**, new ENGINE_V
const; boot ms; config version/workspace; pages/controllers/
activities counts; profile + capabilities + mapped-key count), HOME
ASSISTANT (connected/offline, host, msg count, token stored/
MISSING), TOOLS (Refresh, Key capture, user agent). The Studio's
Showing dropdown gained a Diagnostic group (diag: / keys:), so the
preview can open it too. For the beta this is the page a stranger
reads back to us; today it ends the viewport triangulation — deploy,
tap ⓘ on the HA100, read "Viewport W × H", set
`skin.viewport` to exactly that. Verified: ⓘ tap → diag: (toggles
home), Viewport row reads the probe's real 360×600, tools navigate,
section heads render, zero page errors, battery 20/20.


## Previous state (v0.80.4, 2026-08-12)

v0.80.4 — **TVDPI, TRIANGULATED** (Suresh, scrcpy beside the
preview, round three — including a manual clip experiment "to 0.824
aspect ratio" that "matches the remote pretty closely"). The three
data points pin the HA100's real CSS viewport: DPR 1.5 (320×533)
was too NARROW (the vertical stretch of v0.80.2); DPR 1.0 (480×800)
too MUCH (more title chars and more visible rows than scrcpy); his
0.824 clip measured ~583px of visible content at 480 wide ≈ a
600px-tall viewport, and the char-count deficit says 360 wide.
**360×600 — DPR 1.333, Android tvdpi, the stock density for 5"
480×800 panels** — and exactly 0.6, so it fills the aperture with
no white gap. The Astrion preset now says viewport 360×600 (the
0.824 rect can't be physically real: uniform scale cannot fill a
0.6 hole from a 0.824 source — the clip was a measurement, not a
setting). Verified: contentWindow 360×600 inside the 272×453
aperture. RE-APPLY the preset (no photo → 🖼 device photo) and
restore the screen rect if it was hand-clipped. To settle it beyond
triangulation: chrome://inspect over adb on the Fully webview,
`innerWidth + "×" + innerHeight` — one line, ground truth.


## Previous state (v0.80.3, 2026-08-12)

v0.80.3 — **THE REAL VIEWPORT IS 480** (Suresh, scrcpy beside the
preview: "still off a touch… stretched ever so slightly on the
vertical axis"). Uniform scaling cannot stretch — so the v0.80.2
viewport GUESS (320×533, assuming DPR 1.5) was wrong: the HA100's
WebView runs the panel at DPR 1.0, a true 480×800 CSS viewport. At
320 wide, fixed-px chrome (fonts, bars, paddings) eats relatively
more height — which reads as exactly the slight vertical stretch he
saw. The viewport is now DATA on the skin (`skin.viewport {w,h}`,
absent = the old 320×533.33), the Astrion preset says 480×800, and
the iframe scales by width from whatever the skin declares. 480
stays far under the wide-mode gate (840), so the compact layout is
untouched. Verified: contentWindow 480×800 inside the same 272×453
aperture. If a future device really is DPR 1.5, its skin just says
so — config, not code. RE-APPLY the preset once (no photo → 🖼
device photo) to pick up the viewport field.


## Previous state (v0.80.2, 2026-08-12)

v0.80.2 — **TRUE VIEWPORT, SCALED** (Suresh, with scrcpy proof:
"Width is squished even though map keys says 0.6 480x800"). Sharp
catch: the aperture RECT was a true 0.6, but the engine was rendered
AT aperture size — a 272px CSS viewport, narrower than the HA100's
real 320×533 (480×800 @ DPR 1.5), so the layout cramped horizontally
while the rectangle measured perfect. The rect was right; the
VIEWPORT was wrong. Now the iframe renders at the device's true
320×533.33 and CSS-scales down into the aperture (transform:
scale, clipped wrapper) — a faithful miniature, the same contract
as the old phone frame. Verified: contentWindow.innerWidth 320×533
inside the 272×453 aperture; screenshot side-by-sides with the
scrcpy proportions. Battery untouched (Studio-only).


## Previous state (v0.80.1, 2026-08-12)

v0.80.1 — **THE SKIN FITS** (three field notes on v0.80, all three
traced to ONE root: the v0.80 aperture was eyeballed from a chat
paste; the real export differs).
(1+3) "one pixel off on x, 2 on y… the LCD has lost its aspect
ratio" — an ALPHA-SCAN of the real Photoshop export (1280×4084)
measured the transparent aperture at exactly 9.84/3.80/80.00/41.80,
pixel ratio 0.5999 = true 480×800. The eyeballed 10.1/3.6/80.7 was
−0.26%/+0.20% off (his 1px/2px, precisely) with ~1% aspect error.
The preset now carries the measured screen rect and the same
correction on every button. RE-APPLY: "no photo" then "🖼 device
photo" refreshes a saved skin to the corrected numbers.
(2) "we're not shading all the buttons like back, home, power,
dpad, ok, mute" — v0.79.1's deliberate no-ambient-wash rule is
OVERRULED: the navigation set (arrows/OK/back/home) does something
on every page and now always washes; power washes when the page's
control_target claims power; mute/vol wash when it claims volume.
EDITOR GROWS UP: the LCD rect is a first-class map object (drag,
corner-handle resize, ⇧-arrows) with a live RATIO METER ("screen
0.600 ✓ 480×800" — red until true); ⌖ nudge-all arrows shift every
key hotspot together in 0.1% steps for whole-map misalignment;
arrow keys nudge the selected rect.
VERIFIED against the REAL export (staged from G:\ via the bridge):
iframe 272×453 (0.6005), porch washes up/back/select + vol pair
(mute correctly dark — no control_target on a hub), meter reads
0.600 ✓, nudge cluster present, drag+name still green, zero page
errors; screenshot eyeballed — the actual HA100 photo with keys
glowing. Battery 20/20. Deploy: build-push-catrock.bat + Studio
hard refresh; re-apply the skin preset once.


## Previous state (v0.80, 2026-08-12)

v0.80 — **THE PREVIEW BECOMES THE REMOTE** (Suresh: "replace the
hastrion preview with an image of the real remote… Button mapping
from the remote to the screen"). Studio-only; engine untouched.
THE SKIN: `remotes.<id>.skin = { image, screen:{x,y,w,h},
buttons:[{btn,x,y,w,h}] }` — every coordinate a PERCENTAGE of the
image, so one PNG works at any width. The live preview iframe sits
BEHIND the photo (z-0), the photo overlays pointer-events-none
(z-10) with its screen aperture cut transparent, and invisible
hotspot buttons (z-20) sit over the physical keys. The hotspots
share the grid soft remote's entire brain — softPress, the HOLD
latch, keymap-driven disabling, and the v0.79.1 active-on-this-page
washes, which now render as accent glows ON the physical buttons in
the photo (12% tap-active ring, 25% hold-active, 10% merely
holdable). No skin → the grid soft remote, unchanged.
THE MAP EDITOR ("✎ map keys"): drag a box over a key in the photo →
name it (standard vocabulary offered, custom names legal — voice,
light, cover, music, climate, red/green/blue/yellow); click a box to
rename/delete; drag its body to move. Percentages written live into
the draft; Save & Deploy persists. A skin is shareable config.
THE ASTRION PRESET: "🖼 device photo" applies a measured HA100 map
(23 hotspots, aperture at 10.1/3.6/80.7/41.8) pointing at
/local/harmonium/skins/astrion.png. A placeholder PNG (814×2600,
transparent aperture, drawn to the same geometry) ships at
skins/astrion.png so the feature works TODAY; Suresh's Photoshop
export replaces it file-for-file (same frame), then ✎ map keys
nudges any hotspot the real photo disagrees with.
VERIFIED (probe-skin, real built Studio + real engine + served
placeholder): preset applies (23 hotspots), iframe renders inside
the aperture (274×454 in a 340×1086 image), porch washes vol_up/
vol_down on the photo keys, pressing the vol_up hotspot delivers
the profile's real "+" key into the engine, map-drag creates
hotspot #24 and names it "info" — zero page errors; screenshots
eyeballed. Battery 20/20. Deploy: build-push-catrock.bat + Studio
hard refresh; copy skins/astrion.png to HA www/harmonium/skins/
once (push scripts don't cover skins).


## Previous state (v0.79.2, 2026-08-12)

v0.79.2 — **THE STUDIO POLISH ROUND** (five items on the v0.79.1
build; Studio-only, engine untouched).
(1) "Dropdown gets clipped" — the row-card ··· menu was absolute
inside two overflow-hidden cards; the Export-snippet item made it
tall enough to notice. CardRow's menu is now position:fixed anchored
to the button's rect (the castRect pattern), flips UP near the
viewport bottom, and any scroll/resize closes it.
(2) ONE SNIPPET GRAMMAR — "Everywhere we have snippets, we are using
different language." Now one pair everywhere: ⤴ **Export snippet** /
⤵ **Import snippet…**, same icons, on Setup ("Save cast as set" and
"Use a set…" are gone), State, the activity's Presets tab, the page's
Presets fold, and every preset row's ··· menu. SnippetsEditor prose
matches.
(3) THE PREVIEW MOVES SENSIBLY — a **Showing** strip above the
preview phone names the screen the engine reports (app.pvScreen, so
it stays true even when you tap around INSIDE the preview) and jumps
anywhere via a grouped Pages/Controllers select. Every tile row's
··· menu gains **Preview it** (nav → its target; preset → its
landing, explicit navigate else its activity's page; entity tiles →
their device page; else the page they live on). The ActivityCard's
existing Controller/Room-page toggle stays.
(4) PAGE DEVICE TILES CATCH UP WITH THE ⚙ — "Devices is lagging in
its options." The device tab (and every raw entity row) gains
**Draws as** (same intelligent filtering as presShows: media_player
offers Volume/Now Playing/Transport/Sources/−+, switch-likes offer
Power), **Volume style** (compact/slider/stepper, exactly the
generator's mapping — slider:true / type stepper kind volume), and a
token-aware **Status line** with the ＋ attribute picker and an ∅
button for the intentional no-line. The engine honoured all of these
fields all along; only the Studio never offered them. `power` joined
the Studio's type lists (the engine always had the widget).
(5) LAYOUT TIDY — the ＋ picker is appearance-none (no native
chevron, the ＋ centres); the IconPicker chip gets leading-none +
overflow-hidden so a glyph rendering as TEXT (font loading, unligated
name) can't spill out the top.
VERIFIED: probe-79x extended — menu opens on-screen as fixed,
snippet round-trip via the renamed doors (2 → save → import → 3),
Showing reads "Porch (page)", device row shows Draws as/Status
line/∅, flipping Draws-as to Volume control reveals Volume style,
liturgy export still healed, wash matrix unchanged, zero page
errors. Battery 20/20. Machine build required as usual:
build-push-catrock.bat + the two cache rituals.


## Previous state (v0.79.1, 2026-08-12)

v0.79.1 — **THE COG LIVES, THE LITURGY HOLDS, PRESETS TRAVEL, THE
SOFT REMOTE TELLS THE TRUTH** (four field reports on v0.79).
(1) "Settings cog has stopped working" — REPRODUCED in the scratch
Studio build against a scratch-shaped config: clicking any member ⚙
threw `curly is not defined` and ate the panel. Two v0.79 tooltips
said {curly} and {token} INSIDE quoted attributes — which Svelte
parses as expression interpolations of variables that don't exist.
Compile passed (unknown identifiers are globals in Svelte 5); only
the runtime probe caught it — the v0.76.2 lesson, verbatim, new
disguise. Both are string expressions now (title={"…"}), with a
comment standing guard. BONUS FOUND BY THE SAME PROBE: the "+"
attribute picker only ever offered "state" — presAttrs read
`e.attributes`, a field loadEntities never kept. loadEntities now
captures attribute NAMES (`attrs`), and the picker lists the real
ones (media_title, media_artist, volume_level, …).
(2) "On my Main Porch Presets are after activities. In my Scratch
Porch Page they appear under Devices?" — the HubEditor DISPLAYS the
liturgy (Hero → Activities → Presets → Devices) whatever the array
order, but the ENGINE renders the array as written — and
addRoleSection push()ed every new role section to the END. Scratch's
porch was activities/devices/presets on disk; the editor hid it and
offered no way to even see it. Two-part fix: addRoleSection now
inserts at the liturgy slot (custom sections never move), and
normalizeSectionOrder heals existing configs on load — the role trio
is re-seated in liturgy order within the index slots it already
occupies. Also unified: the BOOT load path had hand-rolled the
normalize chain (drifted, again) — it calls normalizeConfig now,
same as switchWorkspace and importConfig. One config door, one
normalizer, third time it's law.
(3) "I'd like to be able to export (and import) a Preset to
snippets" — SNIPPET_TYPES grew `preset`. Any preset row's ⋮ menu
(page fold or activity tab — same TileRow) offers "Save as snippet"
(the whole tile minus its id; `activity` rides along on purpose).
The ⤵ insert select sits beside ＋ Add preset in the activity's
Presets tab and atop the page's Presets fold — shown only when
something is saved. localStorage-backed like all snippets: global
across workspaces, reseed-proof. presetSnippetTile() is the one
shared inserter.
(4) "add a light, but visible wash to the soft remote keys that are
active on the page? and if hold is engaged, the same" — the engine
now reports every preview landing (navigate posts harmonium_screen,
PREVIEW only; kiosks inert), the Studio tracks it (app.pvScreen),
and the soft remote washes accordingly: tap mode → bg-accent/12 on
keys the current page answers (its buttons map, control_target
pass_through / dpad_passthrough's standard set, global_buttons);
HOLD latched → bg-accent/25 on keys whose _hold variant is answered
(same sources + input.physical_buttons.hold), bg-accent/10 on
merely-holdable ones so "next press sends the hold" stays legible.
Focus movement is ambient everywhere and deliberately unwashed.
VERIFIED: probe-79x drives the REAL built Studio with the REAL built
engine in the preview iframe — cog panel opens (0 page errors), "+"
lists live attributes and inserts {media_title}, export shows the
healed activities/presets/devices order, snippet round-trips (2 rows
→ save → insert → 3), wash follows porch → controller:tv →
HOLD latch exactly. smoke-preview gained the harmonium_screen case.
Battery 20/20. Deploy: build-push-catrock.bat + the two cache
rituals.


v0.79 — **BUTTONS FEEL, PRESETS LAND, STATUS LINES LIVE** (three
review items).
(1) LIVE STATUS LINES: the ⚙'s Status line takes {curly} tokens —
"{media_title}", "{volume_level}", "{state}" — substituted from the
tile entity's LIVE attributes on every state diff (render.js
subTextOf). The Studio field grew a compact "+" picker listing the
member's actual attribute names; picking one appends the token.
Plain text still passes through, blanks still mean what v0.78.2
said.
(2) PRESS FEEDBACK, everywhere, for free: `.tile:active` dips to
scale(.98) with a highlight; trails, D-pad buttons, keyboard keys,
roots, chips and hero jumps dip harder. Pure CSS :active — no JS, no
state, gone when the finger lifts; the .brwait status strips are
exempt because they are not buttons.
(3) THE PRESET GLOW IS DEAD, THE LANDING IS BORN. "Why is Discover
Weekly always highlighted?" — because v0.68.6's ownership stamp
doubled as an ON state: every preset of a RUNNING activity lit,
which reads as "this playlist is playing", a claim nobody can back.
A preset is a button, not a state — the stamp keeps warm-start and
loses the glow. And the review's "logically, the default is the
destination of the Belongs To Activity" is now the engine rule:
outside a drawer, an activity-owned preset with no declared
`navigate` lands on its activity's page (explicit navigate still
wins, v0.68.7; drawer pop untouched). The Studio's Navigate To now
also lists every activity's landing ("Music Media Player — Listen
to MA's page") and its blank option says which default applies.
smoke-present case 12: glow off while the activity runs, tap on the
hub lands on the controller, "Now: {media_title}" renders "Now:
Dear August". Battery 20/20; Studio compiled + scratch-built.
Deploy: build-push-catrock.bat + the two cache rituals.


v0.78.2 — **THE STATUS LINE IS YOURS** (Suresh, of his favorites
button: "I don't [want] it to say Pressed 5 min ago, at least not in
this case… Where do I find the attr attribute?"). The answer is not
`attr` (an authored-tile escape hatch, Code tab only) — it's the ⚙,
where everything else about a member already lives. The panel grew
"Status line": blank = the widget's smart summary (unchanged
default), typed text replaces it ("Adds this track to MA
favorites"), and clearing a SAVED line shows none at all — the same
intentional-blank mechanics as Display name, now generalized
(presHad tracks both). Engine: chassis-level `sub_text` on the tile
beats the widget's sub in renderStates; presApply maps present.sub.
smoke-present case 11: custom text and intentional blank, one
render. Battery 20/20.
NOTED for the roadmap, not built: the favorite-aware Now Playing
hero (swap the note for a red heart when the CURRENT track is in MA
favourites). The player entity doesn't expose favourite status, so
it needs an MA data path (music/item lookup per track — the
mass_queue window proved the API exists); worth doing as its own
piece.


v0.78.1 — **PRESS-SHAPED DOMAINS + THE SEARCH GUESS** (review follow-
ups: "should we fill in search role too?" and "I added a button…
Pressing does nothing… how to override that unhelpful text, the long
date string?").
(1) THE BUTTON MYSTERY, both halves one cause: the device widget's
verb table had never met the press-shaped domains, so a button tile
fell through to open() — which, with no activity claiming a button,
opened nothing; and the "unhelpful text" was the smart summary
faithfully showing a button's STATE, which HA defines as the
last-pressed ISO timestamp. Fixed at the widget: button/input_button
press, scene/script turn_on on tap; and the summary now says the
time like a person — "Pressed 5 min ago" / "Ran 2 h ago" / "Press"
when unknown. No new Draws-as needed: with the verb fixed, the
launcher tile IS the button tile, and the ⚙ already names and icons
it. (The half-remembered "select the data on a tile" is the device
tile's `attr` option — authored tiles only, and now unnecessary
here.)
(2) SEARCH IS GUESSED FOR THE PLAYERS THAT CAN ANSWER: the loose-add
role guess now wires `search` too — but ONLY when the entity
registry says the platform is music_assistant. A native Sonos wired
to search answers an empty list (measured, v0.65), so it stays
unguessed there.
smoke-present case 10: tap sends button.press, sub reads "Pressed
5 min ago", never the ISO. Battery 20/20. Deploy:
`build-push-catrock.bat` (the new one-click), then the two cache
rituals it prints.


v0.78 — **THE QUICK PASS** (Suresh's `docs/status-review.md`, four
items with screenshots).
(1) THE TILE SAYS ENOUGH (engine, widgets/activity.js): the activity
tile's ON line was "On · press to open · hold to end" — now
"On · hold to end" (press-to-open is what an ON tile obviously does;
only the END gesture needs teaching). Off stays "Off · press to
start".
(2) GUESS THE ROLES (Studio): adding a LOOSE entity now prefills
unwired roles from its DOMAIN — a media_player takes media_player /
power / volume / source_select, a remote takes dpad — same first-
come-first-served doctrine as addCast's claim prefill. No more
all-nobody Roles tab after casting one Sonos.
(3) THE DROPDOWN SHOWS THE CAST (Studio): role selects now list, in
order — nobody · cast-device claims · loose cast entities (domain-
filtered, "· cast entity") · an entity directly…. And an entity
wired in from OUTSIDE via the direct picker is ADOPTED into the cast
as a loose row with on-controller OFF (device_options tile:false) —
his exact spec. Probe-verified: the media_player dropdown reads
nobody / Ma Sonos / onkyo · cast entity / directly.
(4) ONE DEFINITION OF PRIMARY (Studio): two stars had crept in —
cast[0] (the old cast-order face) and the media_player wiring holder
(the loose-row rule) — so adding the Onkyo as the FIRST cast device
crowned it while the Sonos held the actual role. Unified: the ★ is
whoever HOLDS media_player (device or entity), cast[0] only when the
role is unwired; a cast device without a media_player claim shows a
quiet disabled ☆ ("it's a device, not the face"); castPrimary now
also takes the media_player wiring when the device claims it; the
row tint follows the same rule.
Battery 20/20 (one false mass-failure: the :8482 server died again —
HANDOFF's documented trap, restart and rerun). Engine push + Fully
cache clear; Studio build + push + hard refresh.


v0.77.1 — **THE BAND JOINS THE PRESENTATION SYSTEM** (Suresh, from
the Scratch-workspace build: "we need (maybe) a way of overriding
the Ma Sonos Basement name on the volume and also switch from that
volume tile to the fat one. But we need a systematic approach.
Should apply to TV controller too." → design discussion → "Keep
member names always and let me blank them via ⚙ and give me the fat
option!"). The principle, now enforced: ONE member, ONE ⚙, and every
tile the activity GENERATES for that member follows it — devices,
groups, group pages, the controls band, and now the VOLUMES BAND,
which had its own private vocabulary since v0.57. Authored tiles
(the TV controller's literal `type: volume, label: "Volume"`) stay
the controller's business — that boundary is why Fire TV's band says
"Volume": the stock author wrote it, not a generator.
(1) The volumes generator reads presentation: name (member's name
always — his call over the names-disambiguate auto-rule), icon, and
STYLE on the ladder present.style → device_options.volume_style →
the generator tile's own → global.style.volume. The loose-volume
fallback (v0.76.5) reads it too, keyed by entity.
(2) THE INTENTIONAL BLANK: the Studio persists an empty name ONLY
when the user actively clears a saved one (presHadName tracks the
open state; the untouched backfill still sweeps) — and the engine
renders a stored "" as no label at all, everywhere presApply reaches.
(3) THE FAT OPTION: the ⚙ grows "Volume style" (Theme default /
Compact / Slider — the fat one / Stepper), shown only for members
that can hold volume; groupChildTile's and looseShowTile's volume
branches read the same ladder, so grouped zones can differ from the
master.
smoke-present case 9: renamed + fat slider + intentional blank on
the band, in one render. Battery 20/20; Studio compiled +
scratch-probed (panel shows Volume style). Engine push + Fully cache
clear; Studio build + push + hard refresh.


v0.77 — **WHERE THINGS LIVE** (Suresh: "When I create a group, it
appears directly under the Volume Control. When I create a loose
device, it appears in DEVICES. We should either (a) be consistent or
(b) give optionality!"). Both. The split was never a decision — the
`groups` generator happens to sit in the controls band of the stock
music controller and the `devices` generator IS the Devices section,
and nothing had a say. Now:
(1) THE DEFAULTS ARE THE LAW OF THE LAND, unchanged: groups → the
controls band, devices and loose entities → the Devices section.
Deployed configs render byte-identically.
(2) ONE WORD FLIPS EITHER — `where`. On a group, `where: "devices"`
sends its nav card down after the device tiles. In a member's
presentation, `where: "controls"` promotes its tile (launcher OR
inline control, presentation and all) up beside the group cards —
and its entities leave the Devices section entirely, no doubles.
(3) STUDIO: the ⚙ panel grew a "Where" select (Devices section /
With the controls) — hidden for grouped members, whose group decides
where they're drawn; the group editor grew the mirror-image select
(With the controls / Devices section).
smoke-present case 8 proves all four directions: promoted volume in
the controls band and absent from Devices; demoted group card after
the device tiles and absent from the controls band. Battery 20/20;
Studio compile + scratch-probe green (the panel shows the new field,
star/rewire intact). Engine push + Fully cache clear; Studio build +
push + hard refresh.


v0.76.5 — **THE LOOSE VOLUME** (Suresh: "On Listen to Music (the MA
activity) there is no volume control on the controller, even though
volume is an assigned role… In Listen to Sonos, there is! So — why
the difference? What should behaviour be is a good start!"). The
difference, confirmed in the generator: the volumes band iterated
CAST DEVICES claiming roles.volume — full stop. Listen to Sonos has
the pre-wired sonos_basement in its cast → slider; Listen to Music
is all loose entities with RAW-ENTITY volume wiring → nothing, even
though the role is assigned and working. THE BEHAVIOUR SPEC, now
implemented: the volumes band draws whoever actually holds the
volume role — a cast device's claim first, and when no cast device
supplies the control, the wired entity itself (label from its
friendly_name, volume_level wiring honoured, device_options and
style knobs apply, and it draws as a CARD like every control).
Also PROVED in the same suite run: a group member's ⚙ DOES act —
its name/shows land on the group's PAGE (behind the nav card), not
on the nav card itself; the field report "does nothing" is a
where-it-acts + stale-engine matter, since the deployed engine
predates v0.76.4. smoke-present grew cases: loose-volume render and
group-member name-through. Battery 20/20. Engine push + Fully cache
clear (v0.76.4's card fix rides along).


v0.76.4 — **CONTROLS ARE CARDS, ROWS MAY WRAP** (Suresh: "screen is
corrupted at smaller widths" + "The volume control tiles have
changed (for the worse)"). One engine fix, two Studio fixes.
(1) ENGINE: the Devices section is a columns-1 surface, so its tiles
render as ROWS — and a volume widget crammed into the row chassis is
the wreck in his screenshot (giant meter, orphaned −, overlapping
trail). The volumes band always drew these as CARDS; inline control
tiles from groupChildTile/looseShowTile now stamp `brRow: false`, so
the control keeps the card shape (his img3) wherever it lands —
including group pages, which quietly had the same disease. The
`device` launcher fallback stays a row, where rows belong.
smoke-present case 6 pins it: volume/stepper cards, device row, in a
columns-1 section.
(2) STUDIO: the loose row was flex WITHOUT wrap — the entity name was
the only shrinkable thing, so at smaller widths the chips squeezed it
to nothing and pushed the ★ out of the box. Now flex-wrap (his
blessing: "OK to create an extra line") with a 140px floor under the
name. (3) The presentation panel's fixed 5-column grid (~700px min)
clipped at narrow widths — re-laid as wrap-friendly uniform blocks;
alignment holds because the hints live in tooltips. Battery 20/20.
Engine push + Fully cache clear; Studio build + push + hard refresh.


v0.76.3 — **PRIMARY LIVES ON LOOSE ROWS TOO** (Suresh: "The primary
entity has lost its primary icon… if we're building a music
controller, then a media player needs to [be] primary. And other
devices should show a disabled primary like we used to" + "The
config (cog) layout is a bit messed up"). Two Studio fixes, both
probe-verified in the scratch harness:
(1) For loose entities, PRIMARY MEANS THE media_player WIRING: the
holder wears ★ (title says why); any other media_player.* offers
"☆ make primary" (setRole — rewires the role, and the old holder's
chip retires with it, wiring being singular); other domains show a
quiet disabled ☆. Cast rows keep their cast[0] star untouched. The
probe clicks ☆ on the loose Onkyo and the ★ moves.
(2) THE PANEL IS A GRID NOW: five columns on one 38px baseline,
labels above, explanations moved into tooltips — the stacked hints
of different heights were what shoved fields off-line.
Note recorded for the field report "draws as does nothing": engine
v0.76 IS deployed (17:51, md5-verified) — presentation rides the
ACTIVITY, so the Devices section reflects it only while that
activity is running (or previewed as running), and both the panel
and the preview iframe cache the engine hard. Studio build + push +
hard refresh; Fully cache clear for the remote.


v0.76.2 — **THE PANEL THAT DIED HALFWAY** (Suresh: "adding an entity
gets a cog icon but it doesn't do anything on click. A cog icon also
then appeared on the primary, which seems to have lost its role as
primary."). Found by finally RUNTIME-testing the Studio — a scratch
sandbox build (test-only, discarded, never pushed; the no-sandbox-
build rule is about shipping artifacts) driven by Playwright with the
stubbed HA API. The ⚙ click threw Svelte's props_invalid_value: the
panel's bind:value handed UNDEFINED (a fresh present entry has no
.name/.icon) to $bindable props that declare defaults, the panel
render died halfway — so the click "did nothing" — and the broken
render is what ate the ★ (the primary never changed; the DOM around
it did). Fix: editPres backfills name:"" and icon:"" before the
panel renders; the close-sweep still deletes them when they stay
empty. Verified in the scratch build end-to-end: panel opens with
all four fields, no errors, ★ intact before and after, ⚙ tints
accent after a pick. LESSON, recorded: the battery's Studio suites
run the BUILT studio.html in the repo, which lags source edits — a
compile check is not a runtime check. Studio build + push + hard
refresh.


v0.76.1 — **THE CHIPS FOLLOW THE ENTITY** (Suresh, adding to Listen
to Music: "it keeps the existing entity but demotes it and throws
away the roles!"). It never lost them — the adoption doesn't touch
a.wiring, and compileContext's raw-entity escape hatch carries
entity-valued wiring straight into context — but only the LEGACY row
template drew role chips, so the moment an adopted entity moved into
the loose-row shape it LOOKED stripped. Loose rows now render the
same rolesOf() chips in the same voice. Cosmetic-only; wiring
verified intact end-to-end. Studio build + push + hard refresh.


v0.76 — **PRESENTATION BELONGS TO THE MEMBER** (Suresh's rework of
cleanup item 4: "That tile should have a config icon… display name,
display icon, display mode, a click-to. We should move the Children
Show out. And put the device options in the device rows." → "Build
it!"). Engine + Studio source.
(1) THE SHAPE: `activity.present` — a keyed map (device id for cast
members, entity id for loose entities) of `{name, icon, shows, tap}`.
A map, not member objects, on purpose: every consumer of the cast
keys by the id string, and a shape change would touch twenty call
sites to say one thing. `shows` is the existing group vocabulary
(volume/stepper/power/media/transport/sources) applied per member;
`tap` is "" (the widget's smart default) / "open" (the device's page)
/ "none" (a pure readout — device tiles already spoke tap natively,
widgets/device.js; control tiles get/lose a chevron trail).
(2) ENGINE (generators.js presOf/presApply/looseShowTile + the
devices generator's INLINE PASS, details.js groupScreen): an
UNGROUPED cast device whose presentation says `shows` draws AS that
control right on the Devices section — the group-of-one workaround is
dead — with its bundle entities collapsed into the one tile at the
position of the first of them. Loose entities render the control on
themselves. Group members read their OWN `shows` first, the group's
as default — so deployed configs render unchanged until a row says
otherwise, and `g.shows` needs no migration.
(3) STUDIO (ActivityCard): every member row — cast, group member,
loose — grows a ⚙ that expands the ONE panel shape: Display name ·
Display icon · Draws as (the INTELLIGENT list: only modes whose role
the device claims, or the entity's domain honours; Launcher always) ·
Tap. The ⚙ tints accent when a presentation exists. "Children show"
is RETIRED from the group editor (legacy g.shows shows as a quiet
"default:" pill); removeCast/removeExtraEnt sweep the member's
presentation; Save-cast-as-set snippets carry `present`.
(4) NEW SUITE smoke-present (battery now 20): inline volume with
renamed label + collapsed bundle, loose power tile, tap:none
suppressing the ⚙ trail, member-stepper-beats-group-volume, and the
no-present classic render. All Svelte edits compile-checked
(svelte@5). Ceremony: engine push + machine Studio build + studio
push + hard refresh.

v0.75.3 — **THE OTHER DOOR** ("Didn't work for the existing activity.
New activity is working."). The tell was in his screenshot: the Onkyo
sits in the cast as a LOOSE ENTITY row — he typed the entity, which
goes through addExtraEnt, and only addCast had the v0.75.2 adoption.
addExtraEnt regenerates a.devices from cast + extras just the same,
so the legacy Sonos was erased through the door the fix wasn't
guarding. (The new activity "worked" because it had no legacy context
to lose.) The adoption is now a shared helper — adoptWired() — called
by BOTH doors into the cast block. Simulated: loose-add on a legacy
activity preserves the wired Sonos; re-adding the context entity
itself stays idempotent. Same ceremony: machine Studio build, studio
push, hard refresh.


v0.75.2 — **THE ADOPTION, HARDENED** ("Same problem!" — with the
v0.75.1 build deployed and verified live at 17:05). The retry path
found the hole: after the ORIGINAL bug fired once, the draft's
devices array is wrecked ([] after backing the newcomer out,
newcomer-only if not) — and deviceList() short-circuits on ANY truthy
array, [] included, so v0.75.1's first-cast adoption read the
wreckage instead of the context and adopted nothing. Three changes:
(1) deviceList() length-checks its short-circuit — an empty devices
array falls through to the context derivation; (2) the legacy-rows
gate does the same, so a wrecked cast-less draft shows its real
entities again; (3) addCast's adoption reads the CONTEXT directly
(the ground truth), unions the existing devices list, and runs on
EVERY cast add — so an already-wrecked draft heals on the next touch.
Modern activities no-op: their context entities all trace to cast
bundles, and removeCast unwires roles before adoption could ever
resurrect a removed member. Simulated: wreck→back-out→retry heals
(Sonos returns as a loose entity, media_player wiring intact), clean
first add, modern add/remove/re-add all clean. Machine build + studio
push + HARD refresh of the Studio tab.

v0.75.1 — **THE FIRST CAST MUST NOT ERASE THE HOUSE** (Suresh: "When
I edit an activity, say Listen to music and try adding a device
(onkyo receiver) it replaces the previous media_player.
ma_sonos_basement!"). Studio-source only. Confirmed against the live
CT config: `music` is a LEGACY activity — cast [], devices null, its
Sonos wired only through $context — and `regenDevices()` rebuilds
a.devices from cast + extras ALONE, so the first cast member
overwrote the list with just itself, and the legacy rows' render
condition (`!cast.length && !a.devices`) flipped off in the same
stroke: the Sonos vanished from the panel AND from the controller's
Devices list. Fix in addCast: on the FIRST cast into such an
activity, the incumbents are adopted as loose entities (visible,
curatable, promotable) before the newcomer lands — except any entity
the newcomer's own bundle covers (casting the pre-wired twin must
not leave a duplicate loose row). First cast only, deliberately:
after that a.devices is cast-derived, and adopting it back would
make removeCast resurrect removed members. Simulated all three
shapes (legacy+stranger, remove-after, legacy+twin) green. Needs the
machine Studio build, same as the rest of v0.75.

v0.75 — **THE CLEANUP PHASE, ROUND ONE** (Suresh's five-point list,
post-refactor). Engine + Studio-source batch; the Studio half needs a
machine build (`cd studio-src && npm run build`, then the studio push).
(1) SIZE IS A SETTING (“They start slim and then jump in size! We
should have a setting somewhere for grid size and tile mode size”):
`grid.tile_h` / `grid.row_h` per screen pin `--tile-h` / `--tile-row-h`
inline on #grid — theme keeps every screen that doesn't declare them,
removed on navigate so nothing leaks. Studio: ViewEditor grew a
“Layout — grid & tile size” card (columns · tile style · card/row
height · max width, all merge-don't-clobber); LibraryEditor's columns
field now merges instead of replacing scr.grid. NOTE: the size JUMP
itself did not reproduce in the harness — live CT config, compact +
wide, list + grid, real artwork: rows render 94px everywhere. Needs
the actual panel's device/window to pin down; the knobs give control
either way.
(2) THE SEARCH HEARTBEAT (“It can take a while for the results to
fill in. Maybe we have a placeholder first tile, that is a spinner?”):
while waves are still out and results are already on screen, a slim
pulsing “Searching for more…” tail row (cls `brwait qtail`) sits under
the live results and vanishes in the render that clears qbusy. Tail,
not head as suggested: first-tile is where D-pad focus lands and
.brwait hides the focus ring — an invisibly-focused dead tile would be
v0.70's “clicking does nothing” reborn.
(3) CAST PANEL HONESTY (Studio, “inconsistent on where and how we
show 'on controller'… why does Onkyo show primary? Roles seem to be
wrong”): castRow's per-entity checkboxes now carry the loose rows'
own words (“on controller:”); the ☆ affordance reads “☆ make primary”
(it was always a button, never a state); and a cast member whose
claims an earlier member took now says “understudy — an earlier cast
member claimed its roles first. Reassign on the Roles tab” instead of
silently showing nothing (addCast is first-come-first-served BY
DESIGN; the design just never said so on screen).
(4) IMPORT = BOOT (“Just wanted to check whether Export and Import
work”): importConfig hand-rolled a subset of the normalize chain and
skipped ensureStockControllers — an older export kept stale stock
surfaces (no gen heal) until the next boot. It now runs
normalizeConfig(), the same door boot uses. Export answered: full-
fidelity draft of the CURRENT workspace, named harmonium-<ws>-<date>;
import lands in the draft (Save & Deploy to keep) — both per-workspace.
(5) Battery 19/19 (smoke-search grew the heartbeat + size-knob +
no-leak case). Group-as-inline-volume (his #4) is a DESIGN answer,
not code — see the session notes: `draw: "inline"` on a group +
one-member sugar, riding the existing `shows` vocabulary.

v0.74.1 — **ONE TAP, THREE CACHES** (Suresh: "remind me how I force a
refresh of the music library?" → the honest answer was three separate
levers in three places → "Why not! And we should document the caching
stuff above."). The library keeps three caches — the browse tree
(in-memory `S.browse.nodes`), the Sonos index (localStorage, 24h
stale), and the MA favourites sensors (server-side, 5-min template
poll) — and staleness looked identical for all three: old names on
tiles.
(1) `brLibRefresh()` in browse.js empties the tree cache
(`B.nodes`/`B.busy`/`B.qres`), re-crawls the index via
`brIdxCrawl(B.mp)`, and pokes the five `sensor.harmonium_music_*`
sensors with a raw `homeassistant.update_entity` send — raw
deliberately, bypassing callService's error flash, so a house
without the integration (Jamaica) sees nothing rather than an error.
An open search re-runs against the fresh caches (`brSearchSoon`).
(2) One control, one meaning: the band-1 roots row grows an
icon-only ↻ (`.brrootr`, 44px touch target, sits beside the
magnifier), and the search-tail index-age row's `__idxr` action now
routes to the SAME `brLibRefresh` — tapping "index built 2h ago"
refreshes everything, not just the index.
(3) DOCUMENTED: ARCHITECTURE.md grew "Caches & how to refresh" — a
four-row table (browse tree / Sonos index / MA favourites / engine
HTTP cache) with owner, lifetime, and lever for each, ending at the
one-tap ↻.
(4) smoke-index case 7: ↻ present, tree dropped AND refetch begun,
index re-crawl kicked, update_entity poke captured. Battery 19/19.
Ceremony: engine only — `push-catrock-engine.bat`, Fully cache
clear.

v0.74 — **THE REFACTOR** (overnight, on Suresh's brief: "when I share
this project people find a world class code base… doesn't have 500
line code files. Neat. Documented."). Behaviour-preserving by
construction: the 19-suite battery ran green after every step, and
the narrative comments — the decision log in the code — moved intact.
(1) NO FILE OVER 500 LINES. context.js (1448) split into context.js
(activity scope + $context, 360) / generators.js (expandTile + cast
vocabulary, 390) / gen-browse.js (the browse generator, 374) /
gen-browse-amalgam.js (★/♫, 182) / gen-browse-search.js (the search
grid, 123) / subscribe.js (filtered subscriptions, 99). browse.js
(1067) split into browse.js (state + tree + bar, 459) / routing.js
(brRoute + provenance, pure, 119) / sonos-index.js (159) / search.js
(364). render.js (668) split into render.js (478) / tiles.js (the
chassis, 202). The extracted browse views take an explicit `bx`
context object destructured at the top, so their bodies read exactly
as the closures they were — diff-friendly against the pre-split
history.
(2) MECHANISM UNCHANGED: build.mjs's SCRIPTS list grew the new files
(38 → 45 scripts); build-engine.mjs still parses that list, so the
two builds cannot drift. Concatenation = one scope; only load-time
statements constrain order (S before S.browse), and they kept it.
(3) THE FRONT DOOR: README rewritten to current reality (the
two-house model, build-engine doctrine, reseed retirement, the
routing/silence doctrines, 19 suites, updated repo map);
ARCHITECTURE.md refreshed (new module map, yaml marked LEGACY,
retired services, Studio-owns-config); NEW CONTRIBUTING.md (the house
style: prime directives, comment doctrine, doctrines-you-must-not-
regress, gen-bump rule); NEW tests/README.md (how the battery works,
per-suite coverage table, how to add one).
(4) Battery 19/19 after every split and at the end. Ceremony: engine
only — the built dist/index.html is byte-different (same code, new
file order) so push + cache clear as usual.

v0.73.3 — **QUEUING, SAID OUT LOUD** (Suresh: "the player section
sits there saying idle for a few seconds while the playlist is
arriving. It feels like nothing is happening"). The seconds between
play_media leaving and the player reporting `playing` were dead
silence on the Now Playing hero — the same "silent = broken" class
as v0.70.2, on the happy path this time.
(1) callService stamps `S.pendingPlay = {e, label, at}` on every
media_player.play_media (label supplied at tap time: firePreset
passes the tile's name, runAction reads its srcTile). The media
hero renders "Queuing “<name>”…" — label, title line and sub, all
pulsing in accent (the cfmpulse keyframes) — instead of Idle.
(2) The stamp is CONSUMED the moment the player reports playing or
buffering; a FAILED call clears it immediately (the bar carries the
reason, the hero goes honestly back to Idle); a 20s timeout gives
up rather than pulse forever.
(3) smoke-libui grew the lifecycle: tap → npqueue class + named
"Queuing" text + pending set / failure → cleared, error flashed /
success → consumed, title shows the track. Battery 19/19.
Ceremony: engine only — `push-catrock-engine.bat`, Fully cache
clear.

v0.73.2 — **PROVENANCE IS TWO FACTS** (Suresh: "we need to split
this into two badges. 1) the base provider: sonos or ma… 2) the tile
provider: deezer, spotify etc.. maybe it goes top right").
(1) `brSrcOf` split into `brSysOf` + `brSvcOf`. The SYSTEM — which
id-space owns the item, i.e. which door the play goes through — is a
two-letter mini badge bottom-right: SO (FV:/SQ:/A:/x-file-cifs), MA
(library:// AND every provider-instance uri, spotify--Xy://
included), HA (media-source://). The SERVICE — where the content
actually lives — sits top-right: named by MA's provider-instance
prefix outright, else by the artwork CDN (dzcdn→deezer,
scdn→spotify, tidal, ytimg→youtube, mzstatic→apple), else absent
rather than guessed. Tiles carry `src` + `svc`; chassis renders
both.
(2) Corner map, final: kind (top-left) · trail ▶ + service
(top-right, service slides inboard 38px when a trail owns the
corner) · routing mark (bottom-left) · system (bottom-right).
(3) Suites updated for the split (snapshots capture `.svcb`; the
Deezer assertion reads svc; Car Ride now reads MA + deezer, the
Sonos favourites SO with no service claim). Battery 19/19.
Ceremony: engine only — `push-catrock-engine.bat`, Fully cache
clear. NOTE: built container-side with the device bridge OFFLINE —
mirror to G:\ pending reconnect; hashes in the session log.

v0.73.1 — **PRETTY CHIPS + THE SERVICE BADGE** (field feedback on
freshly-favourited Sonos artists).
(1) HA groups Sonos favourites under RAW type ids and the chip read
"ALBUM_ARTISTS": amalgam chips now wear proper labels (known folded
keys map to Artists/Albums/…; unknown ones lose underscores and gain
caps). brFoldCat already folded album_artists→artists, so the union
was right — only the label was raw.
(2) THE SOURCE BADGE NAMES THE SERVICE when knowable (Suresh: "We
should if we can put service in one of the slots (deezer, spotify
etc)"): brSrcOf(id, img) — MA's provider-instance prefix
(`deezer--Xy://…`) wins outright; else the ARTWORK CDN gives it away
(dzcdn→deezer, scdn/spotifycdn→spotify, tidal, ytimg→youtube,
mzstatic→apple); only then the system fallback (ma / sonos / ha).
His Deezer-backed "Car Ride" library:// playlist now reads deezer.
(3) Field answers recorded: Sonos favourites are PLAY-ONLY objects
(HA marks them non-expandable) — an artist favourite plays, it does
not drill; cross-linking a favourite to its library node for a drill
path is future polish. The ⇄ bottom-left mark is v0.70's routing
mark: playing that tile hands the speaker to another player
(two-press confirmed).
smoke-amalgam grew both checks (Artists chip from a raw
album_artists folder; deezer badge from artwork). Battery 19/19.
Ceremony: engine only.

v0.73 — **THE SONOS INDEX, ENGINE-SIDE** (phase 3 of
design-search-sources.md, built to design-library-ui.md §1's
correction: NO Python, no integration risk to the golden master —
the crawl is the same browse_media call the tree already makes, and
localStorage is exactly the instant-on cache the storage-tiers
decision reserved browser storage for).
(1) THE CRAWL (`brIdxCrawl`): opening a Sonos-shaped library (a tree
with a favourites root) keeps the index warm — root → favourites
categories (all of them, favourites are small) + library categories
EXCEPT tracks/folders (A:TRACKS ~1.8 MB; live Sonos search answers
tracks uncapped). ~8 requests, uncapped children (deliberately NOT
browseFetch, whose BROWSE_CAP 200 would truncate the 697 albums).
Slim storage {t,id,ty,cl} per item, `built_at` stamped, keyed PER
PLAYER (`hakr_sidx_<mp>`), stale after 24 h, self-healing after a
cache-clear — brIdxEnsure no-ops when fresh or already crawling.
(2) FORGIVING MATCHING (the "mama mia" fix, the capability no remote
service offers): case + diacritic folding (NFD strip), token-order
independence, and edit-distance-1 tolerance on tokens of 4+ chars —
"mama mia" finds Mamma Mia. Pure functions (brFold, brNear),
trivially testable.
(3) SEARCH MERGE: index hits paint IN THE SAME RENDER that says
"Searching…" — instant local answers above, the busy dot promising
more. With a deep MA engine the index contributes ONLY the wells
nothing else can see (FV:/SQ: — the library categories index the
same NAS under different uris, design-library-ui.md §3); without one
it answers every crawled category. Engine results dedup against the
index by folded name+class and THE INDEX COPY WINS — it is native
to the cast player (routing needs no new case: index ids are the
tree player's own, `_viaMa: null`). An engine FAILURE with index
hits standing keeps the results — the error goes to the flashBar,
not over live answers (the error tile only owns an empty page).
Measured need: the same-day Spotify outage took every engine down
while thirteen Sonos playlists sat unsearchable.
(4) VISIBLE AGE: a quiet tail row on served searches — "Sonos index
· updated N min ago — tap to refresh" (`__idxr` browse action →
re-crawl + flash). "Why isn't my new playlist here" is answerable
by looking.
(5) 19th suite smoke-index.mjs: crawl kicks on library open, stores
favs+albums, SKIPS tracks / builds localStorage with built_at /
"mama mia" finds Mamma Mia Party instantly while the engine is
still pending / name-collision dedup keeps the sonos copy and keeps
distinct engine results / index hit one-taps on the CAST player /
full engine outage still answers with no error tile / age row taps
into a re-crawl. Battery 19/19.
NOTE: index results are non-expandable in v0.73 (tapping an album
plays it; drilling it would fetch from the wrong player in search
mode) — a drill path via the tree player is future polish. ALSO:
brFoldCat is now shared by the amalgam and the index. Sonos-side
artists/albums appear in favourites the moment they are favourited
in the Sonos app (⋯ → Save to Sonos Favorites) — the FV: tree grows
folders per favourited type and both the amalgam and the crawler
pick new categories up with no code change.
Ceremony: engine only — `push-catrock-engine.bat`, Fully cache
clear. Cache-clear wipes the index; it rebuilds on the next library
open in seconds.

v0.72 — **THE AMALGAM** (Suresh, with three screenshots of the hall
of mirrors: "It's all very confusing… I would expect Favorites and
Music Library return the amalgam of Sonos and MA"). The Sonos tree
carries its OWN Favorites / Music Library pair, and v0.50.3's
promotion overlaid a SECOND pair fed by the MA sensors — two
Favorites with different contents, and which pair you saw depended
on which branch of the tree answered first.
(1) ONE RULE: the library lands on the synthetic ★/♫ pair whenever
ANY favourites source exists (tree favourites root, MA sensors, or
both) — same two bands every time, no flapping. Raw-tree rendering
only remains for trees with nothing favourites-like.
(2) ★ FAVORITES IS THE MERGE: the tree's favourites root (Sonos FV:,
sliced by its category folders) UNIONED with the MA sensors, chips
by folded category name ("Radio Stations" folds to radio, etc.).
Every tile routed (v0.70) and source-badged (v0.71.2). DUPLICATES —
the same list hearted in both systems — collapse by folded name and
THE BEST ROUTE FOR THE CAST PLAYER WINS (native > bridged >
fallback): "Discover Weekly" plays the Sonos copy when casting
Sonos and the MA copy when casting MA, no setting anywhere. mkItems
grew per-child `_viaMa` so one merged list can route each item
against its own hand-off player.
(3) ♫ MUSIC LIBRARY IS THE TREE MINUS ITS MIRROR: the favourites
root is excluded; one remaining root auto-descends (Sonos: A: →
Artists / Albums / … as chips); several remain as chips. The FULL
libraries are deliberately NOT amalgamated — Sonos's NAS index and
MA's library:// index THE SAME FILES (design-library-ui.md §5), a
merge would double every album.
(4) POSITION IS PRESERVED: a sticky real-category selection maps
into the ♫ side when the pair activates (e.g. the hourly sensor
refresh landing mid-browse must not yank you to Favorites);
smoke-music 8d updated to assert promotion on FRESH entry, which is
what it always meant.
(5) 18th suite smoke-amalgam.mjs: landing = union chips + ONE
Discover Weekly (Sonos copy, unmarked, plays native one-tap) +
MA-only Daily Mix 1 (marked, badged) / ♫ auto-descends past the
mirror to Artists–Albums / under an MA cast the SAME collision
resolves the other way and plays the MA copy one-tap. Found and
fixed in review: brSame(raw, raw) never matched (it expects a ref)
— the mirror filter silently kept the mirror; folded through
brRef. Battery 18/18.
Ceremony: engine only — `push-catrock-engine.bat`, Fully cache
clear.

v0.71.2 — **FAVOURITES ARE ROUTED TOO + THE SOURCE BADGE** (field
find, minutes after the v0.71.1 heal went live — the bar flashed
"⚠ Validation error: Could not find Sonos playlist:
library://playlist/49", which is v0.70.2's error surfacing earning
its keep on day one; Suresh: "I think that error is us". It was.)
(1) THE BUG: the sensor-favourites synth path (v0.50.3) predates
brRoute and played the sensor's uri STRAIGHT AT THE TREE'S PLAYER.
The sensors carry Music Assistant ids (library://playlist/49 =
"Daily Mix 1", freshly re-synced after the Spotify re-add) — fine
for as long as the cast player WAS the MA twin, and a live Sonos
error the moment "Listen to Sonos" cast native. Favourite tiles now
go through brRoute against the cast player with the engine's player
(the search role) as the hand-off: native under an MA cast
(unchanged, one tap), fallback under a native cast (amber mark,
two-press confirm, plays on the twin), `none` never offered, and no
search wired means native as before — nothing else could play them
anyway.
(2) THE SOURCE BADGE (Suresh: "a small badge on the tile showing
the source"): `brSrcOf(id)` derives provenance from the uri scheme
(spotify / ma / sonos / ha; unknown schemes stay unlabelled rather
than guessed) and the chassis renders `src` as a tiny bottom-right
label. The four tile corners now each have one job: kind (top-left),
trail (top-right), routing mark (bottom-left), source
(bottom-right). Set on browse items, search results, favourites and
the drilled Play tile.
(3) smoke-routing.mjs grew the exact field case: a sensor favourite
with an MA id under a native cast is marked + badged "ma", the
first tap fires NOTHING and pulses the tile, the second plays on
the engine's player. 17/17.
NOTE for authored content: a hand-written PRESET whose action names
an MA uri at $context.media_player has the same disease — the
engine takes authored actions literally by doctrine, so those now
FAIL LOUDLY (v0.70.2) rather than silently; authoring-time routing
warnings in the Studio are future work.
Ceremony: engine only — `push-catrock-engine.bat`, Fully cache
clear.

v0.71.1 — **STOCK GENERATIONS** (Studio only; Suresh: "We should
probably add a version number in the json?"). The Onkyo-on-the-cast
bug exposed a CLASS: code is shared, config is per-house, so a
controller authored in an early generation never grows what later
generations emit — and ensureStockControllers healed by SHAPE-
SNIFFING, one hand-written sniffer per change ("includes
sensor.harmonium_music_", "still carries a banner"), which never
covered `music` because `music` WAS NEVER A NAMED STOCK — its best
shape (volumes/groups/presets/devices, accented library trail, 760px
cap) matured in Jamaica's config and lived only there.
(1) Every stock shape now carries `gen`, an integer bumped whenever
the shape changes. The engine ignores it; `_validate` is structural
and passes it.
(2) `STOCK_MUSIC` is born — the Jamaica shape, adopted verbatim (no
`parent`; that is a per-house content-graph edge).
(3) `healStockGen`, ONE rule replacing the sniffer pile going
forward: a non-variant copy of a named stock (apps, music_library,
music, media) or a domain stock whose `gen` is missing or behind is
replaced by the current stock, keeping its `parent`. Custom copies
(variant_of) are never touched — the doctrine every existing healer
already followed. Runs at the end of ensureStockControllers, so
every load path heals. Verified in a node harness: CT's flat music
upgrades keeping parent=porch, a custom `tv` and a variant copy stay
untouched, domain stocks restamp, and the pass is idempotent.
Ceremony: STUDIO ONLY — `cd studio-src && npm run build` ON THE
MACHINE (never in a sandbox), `push-catrock-studio.bat`, hard-refresh
the Studio tab, then open the workspace and Save & Deploy (the load
heals; the save writes the healed config). No engine push, no
restart. First load after this build upgrades CT's `music`
controller automatically — the `ct-controller-music-v2.json` snippet
becomes unnecessary.

v0.71 — **THE LIBRARY SURFACE** (steps 2+3 of design-library-ui.md
§5's build order, plus v0.70.2's error surfacing — all built during
the MA/Spotify outage, see the field note at the end).
(1) SAY WHEN HA SAYS NO (v0.70.2): `callService` was fire-and-forget,
so a failed call looked exactly like a dead tap. Field case, same
day: MA's Spotify streaming auth broke (librespot
INVALID_CREDENTIALS) and every play_media raised "No playable item
found to start playback" — a message that sat in the HA log while
the remote showed NOTHING. HA always answers a call_service; a
failure now flashes HA's own words in the bar ("⚠ …", 5s). Success
stays silent.
(2) THE SEARCH ROW HOLDS TWO CONTROLS (§3): it held four small icons
— ⌫, clear-✕, ⌨, close-✕ — two of them ambiguous, on a surface
driven by a thumb or a D-pad. Now: a CARET (2px accent bar,
CSS-blinking, inside .brqt so the per-keystroke echo redraws it for
free) says "your typing lands here" without a real <input>; ⌫ moved
ONTO THE KEYBOARD beside space where every phone puts it, tap =
backspace, HOLD (550ms, the tile-hold threshold) = clear all — which
retires the clear-✕; the row keeps keyboard show/hide and ONE ✕
meaning close search and nothing else.
(3) THE MAGNIFIER LIVES IN BAND 1 (§2): it headed the chip strip,
which read as "search is a category". It is a MODE — a sibling of
Favorites and Music Library, a different answer to "where am I
looking". It is now a roots-row button pushed right (`.brrootq`),
and the row renders whenever search exists, even over a lone-root
tree whose roots stay hidden (v0.62's one-option rule intact for
THEM). Freed chip width lands exactly where the chips overflowed on
the Astrion.
(4) THE VIEW TOGGLE takes the vacated strip-head slot (Suresh's
placement): grid ⇄ dense one-column LIST — the shape a D-pad wants
(one axis) and the right shape for 697 artists with art the source
doesn't have. It cycles, and that is honest HERE: the state is
visible in the thing it controls (the whole screen redraws) — the
same rule that forbids cycling the scope. Remembered PER CATEGORY
(brViewKey: chip/root title, or q:<kind> in search), persisted per
REMOTE PROFILE (`localStorage hakr_views_<device>` — the storage-
tiers exception for device-local presentation state; the same store
that already holds hakr_device). Mechanics: generators stamp `brRow`
on item tiles; makeTile honours a per-tile row override; the section
render gives row-stamped browse sections their own single-column
secgrid host, leaving every other section untouched.
(5) 17th suite smoke-libui.mjs: error flash carries HA's words / row
has exactly two buttons + caret / ⌫ tap deletes one, hold clears
all / magnifier in band 1, not the strip / view toggle lists at one
column, other categories keep their own choice, choice persisted.
smoke-search's chip probe now looks for `.brrootq`. Battery 17/17.
FIELD NOTE (2026-08-10): the "clicking does nothing" report against
v0.70 was NOT the engine — MA's Spotify provider lost its librespot
streaming credentials (web-API login still worked, so search/art/
queueing all looked fine). Diagnosed end-to-end via bare HA service
calls + MA server log (mass_queue.send_command logging/get); MA
addon restart did not clear it; Suresh re-added Spotify in MA
(known MA-side issue, playlists tab empty per their Discord). His
question "can I play Sonos playlists on an MA player?" — NO, by
design: SQ:/FV: live inside Sonos, MA has no provider for them;
that is the routing matrix's `none` row and the argument for
phase 3 + native cast.
Ceremony: engine only — `push-catrock-engine.bat`, Fully cache
clear. No restart.

v0.70.1 — **THE CONFIRM PULSES UNDER THE FINGER + THE UP ROW SPLITS**
(field feedback on v0.70, same day).
(1) "Clicking on a library item doesn't do anything" — it WAS doing
something: the new fallback two-press confirm, invisibly. flashBar's
confirm cue pulses `grid.querySelector(".tile")` — the FIRST tile,
a deliberate choice for status-bar power confirms where the screen's
major tile is the right cue — but a routed browse result sits
mid-grid, often scrolled, so the pulse happened off-screen and the
first tap read as dead. flashBar/barConfirm/runAction now take an
optional TILE: firePreset passes the tapped tile, the trailing ▶
passes its parent, and the red pulse happens under the finger. The
first-tile default stands for every existing caller.
(2) "On that child screen, we can shrink the back button by 50% and
add an equally sized play button!" — done as `upRow()`: drilling
into a container renders ‹ Back at span 1 beside an equal Play tile
that plays the CONTAINER itself. The drill ref now carries the
node's `can_play` (`browse.play`), and the container's id goes
through brRoute like any other playable: a bridged Spotify album
one-taps on the cast player with the rewritten share link, a
fallback container is marked amber and two-press confirmed, `none`
grows no Play at all. Both drill sites (search-mode and tree) share
the helper; refs from before v0.70.1 lack the flag and render Back
alone, harmlessly.
(3) smoke-routing.mjs grew three checks: the tapped tile carries
`cfm-off` on the first fallback tap; the up row is two span-1 tiles;
Play on a drilled bridged album fires on the CAST player. 16/16.
Ceremony: engine only — `push-catrock-engine.bat` (new double-click
wrapper, also this session), Fully cache clear. No restart.

v0.70 — **THE CAST PLAYER DECIDES** (design-library-ui.md §5; Suresh:
"It's not a house thing… isn't it a player choice? When I choose an
MA Player, I can never have Sonos results right?"). Step 1 of the
revised build order — the routing model, built BEFORE the search row
moves and before the phase-3 index exists, so adding those changes
data, not layout.
(1) EVERY PLAYABLE ID IS CLASSIFIED by how it reaches the CAST
player — `brRoute(c, mp, viaMa)`: `native` (the cast player plays it
directly — the whole browse tree by construction, its ids come from
the cast player's own browse; and every search result when the cast
player IS the engine), `bridged` (a known conversion — the v0.66
spotify--…→spotify: share-link rewrite, played on the cast player),
`fallback` (only playable by handing off to the engine's player,
which EVICTS the cast player's queue), `none` (cannot play here —
suppressed in mkItems, never offered-and-disabled). An item may carry
its own `_route`: the seam a source stamps at production time, which
is how the phase-3 Sonos index will declare `none` for `FV:`/`SQ:`
ids when the cast player is the MA twin.
(2) THE SILENT EVICTION IS DEAD. Before: cast native Sonos, tap an MA
`library://` result → playOf silently fell back to the MA player; the
real Sonos queue vanished and the Sonos app showed a single "Music
Assistant" stream — on exactly the house where guests-use-the-Sonos-
app is the stated reason Bar presets play natively. Now a `fallback`
play carries a two-press confirm through the shared action grammar:
`confirm: {key, msg, tone}` gates BOTH runAction (trailing ▶, qrow,
key bindings) and firePreset (tile body) via barConfirm — red pulse,
TIMING.confirm window, "Takes over <speaker> — press again to play".
firePreset's gate runs AT TAP TIME and returns false, so a drawer
does NOT pop while the confirm is pending — the second press needs
the tile still under the finger. Body tap and trailing ▶ share one
pending key (`brfb:<media_content_id>`), so either press confirms.
(3) THE MARK: a fallback tile that can PLAY gets a chassis-level
`mark` (amber swap_horiz, bottom-left — the kind badge owns top-left,
the trailing ▶ top-right; amber because it is a caution, not an
error). An expandable artist is NOT marked for drilling — stepping in
goes via the engine harmlessly and its albums come back with routes
of their own; its trailing ▶ is the marked, confirmed act.
(4) 16th suite smoke-routing.mjs: none suppressed / fallback marked,
bridged clean / bridged one-taps on the CAST player with the
rewritten id / fallback first tap fires NOTHING and warns, second
plays on the engine / drawer stays put mid-confirm / cast-the-engine
⇒ all native, no marks, one tap. Battery 16/16.
Ceremony: ENGINE ONLY — `node build-engine.mjs`, `push catrock
engine`, Fully cache clear. No Studio change, no HA restart, config
untouched. NOT yet pushed to CT as of this entry.

v0.69 — **SEARCH IS A ROLE** (Suresh: "It's hardcoding a device inside
a stock controller. This should be provided by context. And if the
player supports it, it should be enabled"). Phases 1+2 of
docs/design-search-sources.md; 3 (Sonos index) and 4 (scope chip,
derived tabs) still design.
(1) THE CLAIM: a bare `type: browse` tile now binds `$context.search`,
so the stock music_library names NO entity. `search` joins the role
set (ROLE_KEYS, ActivityCard ROLES/SLOT_DOMAINS/copy) and is claimed
per DEVICE in the Pre-wired library — a Sonos speaker's searchable
index lives on its MA twin, which is a fact about the box, not about
the page. Resolution: explicit `search.entity` (a custom controller
pins one) > `search: false` (the per-surface off switch, the Mediocre
card's `search_enabled`) > `$context.search` > nothing, and nothing
means no magnifier rather than an error. Every pre-v0.69 config keeps
working — Jamaica's explicit block still wins.
(2) NO CAPABILITY SNIFF, EVER. Measured on CT: native Sonos
`supported_features` 8321599 vs MA 8322623 — the delta is 1024
(VOLUME_STEP) and BOTH set bit 22 SEARCH_MEDIA; meanwhile every Sonos
browse node reports `can_search: false` on a player that returns 521
results for "love". The flags are wrong in both directions.
(3) CONFIG_ENTRY DERIVED: new `brRegistry()` asks
`config/entity_registry/get` once per entity (cached, session-scoped)
and gets BOTH `config_entry_id` and `platform` — so MA's own service
(which takes a `limit`, lifting HA's hard 5-per-class cap) is reached
without the instance-specific string being authored, and a non-MA
platform correctly falls through to the standard contract instead of
being handed someone else's entry. An explicit key still overrides.
(4) THE MA TWIN, AT LAST IN THE RIGHT LAYER: seedDeviceFromEntity now
prefills the `search` claim from the platform (`music_assistant`),
name-regex only as fallback. This does NOT reopen the v0.49 revert —
that killed a runtime heuristic; this is a default in an editor the
user can see and change.
(5) BAR FIX FOUND BY THE NEW SUITE: `browseBar` early-returned on
`!B.ui`, and `ui` is only set after the auto-descent finishes two or
three round trips deep — so the magnifier was unreachable until the
whole library loaded, on exactly the slow libraries where search is
the fast way in. v0.68.1 fixed that gate for the grid and missed the
bar. The bar now renders when there is EITHER a tree or an engine.
15th suite smoke-search.mjs (unwired / role / off-switch / explicit /
registry derivation / non-MA fall-through / chip on screen). NOTE:
the battery is 7/15, and the 8 failures are IDENTICAL on an untouched
checkout — the suites are stale against the Bar config shipped in
dist/ (activities renamed bar_* in Jamaica; `music`, `porch`,
`watch_firetv` no longer exist). Not a v0.69 regression; real debt.
Ceremony: engine + Studio SOURCE changed — `npm ci && npm run build`
in studio-src on the machine, then `push <house> all`, HA restart,
Studio hard refresh, remote reload. Config untouched; no reseed.

v0.14: **the Studio chain is live end-to-end.** Engine grew
`#preview=1` (same-origin postMessage: parent injects configs +
synthetic keys, engine answers ready/applied/error; `applyConfig`
extracted so every edit is a clean re-render; still connects to HA so
the preview shows LIVE states via the shared `hakr_token`; inert on
the kiosk). New `integration/custom_components/harmonium/`: single-
instance integration owning the runtime config in HA storage (seeded
from the deployed config.json), authenticated `/api/harmonium/config`
(POST = validate → store → deploy to www/remote-proto/config.json;
`_validate` mirrors the compiler's checks), and the **Harmonium
Studio** admin sidebar panel served at /harmonium-static. Studio v1 =
slice nav → per-slice JSON editing → debounced draft re-injection
into the real engine iframe, soft remote with real Astrion keycodes,
device-profile switcher, Save & Deploy + Save-and-reload-Astrion.
Install is manual copy (HA API can't write custom_components — see
integration/README.md). Suites 8+9 (smoke-preview, smoke-studio); all
9 green; v0.14 engine deployed to HA (byte-identical to dist) and the
Astrion reloaded. Caveat: Studio edits the COMPILED config — keepers
must be ported back to yaml/ until round-trip lands.

v0.14.1 — **Studio v2 visual editors** (Suresh: "we need a proper ui
— not just a code editor"; toolchain decision: Svelte + shadcn):
`studio-src/` Vite + Svelte 5 + Tailwind 4 + vendored shadcn-style
components (bits-ui) building to ONE self-contained studio.html.
Visual | Code toggle per slice; forms for Room (identity/homes/order),
Views & tiles (control_target form, tile cards with reorder/dup/
delete + all-fields JSON expander), Activities (the harmonia Activity
card: Setup $context slots with live entity pickers, State rules
builder incl. in/not_in chips, navigate-after-start, confirm-end).
Entity pickers fed from live /api/states. A sandbox studio.html
(read-only fallback when the integration API 404s — Save disabled)
is deployed at /local/harmonium-studio/studio.html (currently the v1
JSON-only build; v2 ships inside the integration zip). Engine stays
zero-dep; the Studio owns the UI complexity. Still open: Actions
on-start/on-stop builders w/ Test (→ generated scripts), yaml/
round-trip, input-policy/theme forms.

v0.15 — **SEQUENCES ARE FIRST-CLASS** (Suresh: HA tap_action
philosophy — "a script? fine. one action? great. multiple? super."):
`config.sequences` = Building blocks, HA action syntax authored
per-room (porch.yaml `sequences:`), executed HA-SIDE by the
integration's `harmonium.run` (cv.SCRIPT_SCHEMA → helpers.script.
Script, mode restart — remotes never run orchestration).
Activity start/stop are ACTION REFS: `sequence:<id>` first-class,
`script.<x>` 2nd-class forever (engine `runActionRef`; compiler +
`_validate` check refs). All five activity scripts ported 1:1 into
sequences, doctrine comments intact; the HA script.activity_*
entities stay as fallback. `harmonium.reseed` reloads the store from
the deployed config.json after a bat push. Studio: Building blocks
page (typed action rows, ▶ Test, used-by, rename-with-ref-fixup),
ActionPickers for Start/Stop, EntityPicker = real dropdowns of
compatible entities (custom escape for $context.*), Room editor Hero
card form + Room functions shelf ("off" is special) + activity-select
demoted to Advanced (integration will own that entity next phase).
NOTE: a session rollback ate the room-centric studio-src tree
mid-round; restored byte-perfect from the G:\ mirror — the mirror
discipline paid for itself. All 9 suites green.

v0.15.1 — **APP REGISTRY** (per Suresh + his ur_*.yaml universal-
remote cards): config.apps = house-level app identities with
per-device launch resolution (override → auto-from-source_list →
hidden); engine tile `type: apps` GENERATES the drawer from the
registry (the hand-authored apps tiles are gone); overrides speak
source-string / sequence / HA-action. Studio Apps page with live
"auto on" chips. Room editor completes the harmonia trio: Presets/
Devices/custom GROUP sections editable in-room; accordion layout;
boot/hub/paging demoted to Advanced (screen_order = CH paging, now
labeled honestly); activity reorder arrows; nav views sub-grouped.

v0.16 — **TAXONOMY v2** (Suresh's collapse): views are `type: hub`
(launcher; `room: true` = room's hub, room-scope keys) or
`type: controller` (control surface, context-bound); "group"/"kind"
retired from authoring (legacy still compiles); compiler derives the
`class` the key policy consumes — engine policy untouched. Shared
controllers gained per-activity content overrides
(`when: {activity|not_activity}` tile visibility, smoke-v2-covered).
Preview now FOLLOWS the Studio selection (harmonium_navigate) and
re-injection keeps the edited screen. Apps drawers are consciously
CURATED via the apps tile's ordered `include:` (live: netflix,
youtube, youtubetv). Workspaces (multi-config Studio, title-bar
switcher, per-workspace deploy paths) designed, deferred to v2.

v0.16.1 — **ANATOMY-COMPLETE HUBS + NESTED SUBORDINATES** (Suresh's
final taxonomy pass): every hub shows the identical editor with
canonical section roles (compiler-inferred; flat tiles normalized to
a devices section) — Comfort = Porch with bits switched off,
switchable on; any hub may own activities (shared-select v1 caveat).
Drawers edit inline inside their controllers, group-tile pages open
from their tiles with ↑ breadcrumbs; nav = hubs + controllers only.
Group tiles derive summary entities live from their target page
(dupes removed); a group's page name follows its tile label (comfort
→ "HVAC & Lights").

v0.16.2 — **LIBRARIES + WORKSPACE SAFETY**: `type: library` (simple
picker: content/grid/buttons; compiles to drawer semantics) with its
own 3-question editor — Apps + Music Library migrated; subordinate
pages back in the nav, indented ⌞ under their openers (Comfort had
"vanished"); Studio header gained Live|Scratch workspaces (scratch =
browser-autosaved sandbox with a clean-start starter that keeps
hardware/system config) + ⤓ Export / ⤒ Import (full-fidelity JSON) /
✦ Clear.

v0.16.3 — **ACTIVITY TILES GENERATE FROM THE REGISTRY**: new engine
generator tile `type: activities` (one tile per activity the hub
owns, registry order, "off" excluded — hold-Power territory); porch's
three authored activity tiles replaced by the generator; the scratch
starter carries it, so "＋ Add activity" makes the tile appear in the
preview instantly, no device/entity required (Suresh's first scratch
pain point). v2 BACKLOG (Suresh): per-hub/tile BACKGROUND — color
with alpha, or image with alpha.

v0.17 — **INPUT_SELECTS RETIRED**: the integration mints
`select.harmonium_<room>_activity` per activity-owning hub (select
platform, RestoreEntity, options from the stored config) + service
`harmonium.set_activity {activity}` (room inferred from ownership).
Sequences use the service (zero entity ids in state steps); config
activity_select → the minted select; engine self-heal domain-
agnostic; sync automation retargeted at deploy; the
input_select.porch_activity helper + activity_* scripts are now
deletable. Studio: sequences grouped by owner room, duplicate
sequence/step, visible step-rename.

v0.18 — **ACTIVITY SETUP FAST PATH** (Studio-only, no engine/config
change): (1) activity id AUTO-FILLS from the display name as a
room-prefixed slug ("Watch Smart TV" in porch → porch_watch_smart_tv)
until hand-edited; rename now updates every reference (tile refs,
when: visibility, set_activity steps inside sequences). (2) Setup —
devices & roles moved ABOVE Start/Stop (cast before actions);
EntityPicker rebuilt as a type-to-search COMBOBOX (filters by id +
friendly name, "This activity's devices" pinned on top, free text =
custom/$context escape hatch, no mode switch) — used everywhere,
including sequence step targets (pinned cast = devices of activities
using that sequence or sharing its room). (3) empty Start/Stop shows
＋ which MINTS an auto-named sequence ("<Activity> — Start",
porch_<slug>_start) seeded with the Set-activity-state step ("off"
for stops), filed under the owner room, linked immediately.
Activity-select picker now offers select.* (minted) first.
smoke-studio grew sections 9–11 covering all three flows.
v0.18.1 (Suresh's scratch findings): the auto-id PREFIX comes from the
owner room's display NAME, not its page key — a scratch room called
Porch on page "home" still yields porch_* ids. And the PAGE ID itself
is now editable (Hub + View editors, "Page id" field): renameScreen()
walks every ref — screens key, home_screen, screen_order, parents,
hero refs, tile target/room, navigate actions (global/per-screen/
input policy), activity room_view+screen, sequence room stamps, and
the nav selection. Matters because the minted select follows it:
select.harmonium_<page-id>_activity. Combobox grew DOMAIN CHIPS
(media_player · remote · light … by entity count) for one-tap
narrowing in unconstrained pickers. smoke-studio section 12 proves
the rename ref-walk end to end. Multi-entity "devices" stay the ROLE
model (cast = entities; volume role may point at a different box);
HA device-registry grouping in the picker = v2 backlog.

v0.19 — **DEVICE TILES** (Suresh's simplification: "when its a device
tile, its ONE entity" — multi-entity only at the activity level).
New engine tile `{type: device, entity}` + widget: renderer/sub by
domain; tap = obvious verb (play/pause playing media, toggle
lights/switches/fans); NO verb (off media player, climate, remote) →
open its page; touch long-press (new 550ms pointer gesture, chassis-
level `hold` support) → its page. Page inferred from the activity
claiming the entity as primary (context.media_player/dpad); tap: and
target: override. Porch Devices section gains dev_tv + dev_music
(Fire TV deliberately absent — feeds the other TV). Studio: device
tile type with auto-label from friendly name, Tap/Opens fields;
picker chips always pin control domains incl. remote. 10th suite
smoke-device.mjs. Deferred: hold on verb-less lone entities, detail
levels, HA device-registry seeding.

v0.19.1 — **DEVICE-FIRST STUDIO FLOW** (Suresh: "that list is almost
meaningless — a device STARTS with a name and an entity"). New tiles
default to type device ("New device"); the device form leads with
Name + Entity, then HA-speak Tap action / Hold action — opens (hints
show the auto behavior AND the inferred page, e.g. "auto: tv (from
its activity)"); Icon + label auto-fill from the entity (device_class
tv → material:tv, else speaker; per-domain map); "Show attribute
(advanced)" renders a chosen attribute as the sub instead of the
smart summary (engine t.attr). The Type list is grouped: device
first, then Content & navigation, then Raw widgets (advanced).
FIX: compiler's devices-role whitelist predated type device — porch's
Devices section got stamped custom, splitting the Studio into TWO
Devices folds; whitelist fixed both compile sites, smoke-studio 11b
guards fold-count == 1.

v0.20 — **CONTROL PAGES: MINT + CAST GENERATOR + UNLINK** (Suresh:
"unlink or a duplicate unlinked function gives us the best of both
worlds"). Activity editor's "Navigate to (after start)" grew ＋: mints
the activity's controller page — type controller, parent = owner
room, control_target pre-wired to $context (keys route through the
roles), Now Playing (art) when the primary is a media_player, and a
Devices section holding the new CAST GENERATOR `{type: "devices",
activity}` — engine expands it to one device tile per cast member
(explicit a.devices, else derived from role wiring), primary first,
friendly-name labels, device_class-aware icons; always in sync with
Setup. Studio tile card for the generator: "Cast of activity" select
+ ⛓ Unlink → baked tiles (expands to plain device tiles you then
own — the escape hatch to page-level art direction). Devices with no
page stay as decided (nothing; detail-page fallback still backlog).
Compiler whitelists include "devices". smoke-device §6 (expansion,
primary-first), smoke-studio 11a (mint+link) + castPage-in-save;
unlink verified by one-off harness.
v0.20.1 (Suresh: "image 1 generates image 2, instead of image 3") —
the mint now produces the WATCH-TV ANATOMY, not a noun grid: control
surface first — Now Playing + Transport (iff media_player role),
On-screen device buttons (physical-dpad hardware) + Remote pad
(elsewhere) (iff dpad role), Volume slider with level_entity when
volume_level is wired (the ARC split) — then Devices (cast
generator, columns:1, titled). control_target pass_through prefills
the full key set when a dpad role exists + dpad_passthrough stamped
(mirrors the compiler's derivation). Cast generator + Unlink now SKIP
remote.* entities — the Remote pad IS their tile. Verified in the
real preview: np/transport/volume tiles render, dpad tiles correctly
absent without the role, Devices heading shows (section title key).
v0.21 — **THE POLISH DOC, PHASE 1** (Suresh's "The UI and flow
needs work" + follow-up debate; controllers-as-library agreed:
controller = named control surface bound to $context, caller passes
context + cast; per-activity accordion for small overrides,
"Save as variant" for structural ones — phase 2 builds the registry).
Shipped now: SIDEBAR regrouped VIEWS (Home rooms-hub first, room
views, ⌞ non-controller pages) / CONTROLLERS (control surfaces with
⌞ libraries/drawers) / MODEL (Actions·Apps·All activities) / SYSTEM;
slice keys room.* → view.*; "Building blocks" renamed ACTIONS.
View metadata: page id AUTO-FOLLOWS the name slug until hand-pinned
(collision → _2); Type select dropped from the view editor; KEY
MAPPINGS panel (Home = page:<parent> select; Back/Power doctrine
spelled out). POWER DOCTRINE (2026-07-23): idle view tap = NOTHING;
running tap = confirm to end; HOLD = end immediately (confirm
removed from power_hold + v2 activity_end role; idle-tap All Off
retired). DRAFT-CONFIRM mint flow: ＋ creates the action and opens
the Actions editor in draft mode — banner with "Confirm & link" /
"Discard", nothing linked until confirm, both paths return to the
origin view with the activity card re-opened; Actions page grew a
"← back to <view>" affordance (prevKey). smoke-studio: draft-mode /
not-yet-linked / seeded / linked / card-reopened + discard checks.

v0.22 — **PHASE 2: THE CONTROLLER LIBRARY IS REAL.** New config
key `controllers` — shared, $context-bound control surfaces addressed
as `controller:<id>`; yaml views marked `library: true` compile into
it, with every ref (activity screens, screen_order, parents)
auto-rewritten. Engine: screenOf() resolves controller: from the
registry (same seam as detail: virtual screens); existence guards
(Home ladder, boot keep-screen, preview navigate, preset pop) went
through screenOf; the cast generator defaults to the ACTIVE
activity's cast when the tile names none (library controllers carry
`{type: devices}` bare); barTitle shows the ACTIVE activity's name on
its own controller ("Watch Fire TV", not "TV Media Player").
MIGRATED: tv → controllers.tv "TV Media Player", music →
controllers.music "MA Media Player" — defs verbatim (default context
kept, so CH-paging to an idle controller behaves exactly as before);
apps + music_library drawers reparented to controller: refs.
Integration _validate is controller-aware (RESTART required this
deploy). Studio: CONTROLLERS sidebar lists the library (drawers
nested ⌞), controller.* slices edit in ViewEditor (Controller id
rename via renameController — walks refs; guarded deleteController;
⧉ Duplicate variant); Navigate-to's Controllers optgroup = library
first (controller: values) then legacy controller screens; edit→
routes to the registry editor; renameScreen/deleteScreen walk
controllers too. POLISH: title bar shows /local/remote-proto/ ↗ as a
new-tab link; soft remote regrouped (taps · holds · vol/dpad/channel
9-block · gap · ancillary, CH− added). All suites migrated to
controller: addressing. NEXT: per-activity controller-settings
accordion + domain-guess defaults; Apps → grouped Preset Library.

v0.23 — **LAZY INSTANCING** (Suresh: "we DON'T go eager — 99% of
the time only devices + presets vary"). The stock tv controller's
BAKED device tiles (migration residue — why Watch Smart TV showed a
Fire TV row) are replaced by the bare CAST GENERATOR; the stock page
viewed directly is now honestly a template. Per-activity CONTROLLER
ACCORDION under Navigate-to when it points at a stock controller:
"Auto-populate devices" switch (activity.surface.devices === false →
the bare generator renders nothing for that activity; engine-side) +
"⧉ Create custom copy" — copies the stock as the activity's own
controller ("Porch Watch Fire TV", variant_of lineage, generator
stamped with the activity), relinks, and opens it. On a copy the
accordion shows edit→ / "↺ use stock" (relink + delete the orphan).
Controllers sidebar: DEFAULTS / CUSTOM subfolders (stock + drawers,
then copies "copy of <stock>" + legacy custom pages). Controller
editor: ← back (prevKey), STOCK banner naming its users, CUSTOM
banner + "↺ Reset to stock" (re-copy, re-stamp). Presets knob
deliberately deferred to the Preset Library rework. device widget is
now `detailable` (cast tiles grow the ⚙ detail trail — smoke-details
caught the gap). INCIDENT: a bad edit + a STALE device_stage_files
cache (served a Jul-21 snapshot over today's G:\ file) briefly
destroyed build_config.py locally; reconstructed from session-known
deltas and verified 0-diff against the last-good compiled output;
G:\ mirror was never actually corrupted. New mirror discipline:
verify staged reads/writes with a device_bash hash, never trust a
re-staged path blindly.

v0.23.2 (Suresh: "shouldn't there always be the stock
controllers?") — the STOCK LIBRARY IS SYSTEM, like keymaps/theme:
the scratch starter now carries the live config's stock controllers
(variant_of copies excluded), and every workspace is guaranteed at
least the new GENERIC "Media Player" stock — house-neutral, pure
$context, zero entity ids (the mint anatomy: np/transport/buttons/
remote pad/volume + cast generator), planted by normalizeScratch
when a config has no stock at all. Navigate-to in a fresh scratch
offers MA/TV Media Player (or the generic) immediately.

v0.23.3 — (1) FIX: ✦ Clear while ON scratch inherited scratch's
own empty library (starterConfig snapshotted the current draft) —
stock now always sources from the LIVE config (liveStash/app.saved).
(2) MA Media Player renamed "Music Media Player" (music.yaml).
(3) BUILT-IN fixed controllers (Light/Switch/Climate/Cover/Fan)
listed under Controllers → Defaults with a BuiltinEditor: explains
the generated detail:<entity> surface + per-device OPTIONS bound to
config.entity_options — cover "Reverse direction" (invert_position)
is live, reading/writing the real config (MaestroScreen verified).
Options map grows per domain as needed.

v0.24 — **DOMAIN CONTROLLERS = THE MEDIA PLAYER PATTERN, EXACTLY**
(Suresh: "choosing Cover should show the cover screen; edit knobs =
changing stock; a chosen device can create a custom one"). The
options-table BuiltinEditor as a page was wrong. Now: the engine's
DETAIL_TILES compositions ship as editable STOCK controllers
(config.controllers.light/switch/climate/cover/fan, `domain` marker,
tiles bound to "$device") — compiler emits them (yaml can override),
Studio guarantees them in every workspace. Engine detailScreen():
per-device CUSTOM copy (variant_of=domain, entity=<eid>) wins →
stock def → hardcoded fallback; $device substituted at render, so
shipping the defs changed nothing until edited. Studio: domain
stocks under Defaults open in ViewEditor showing the REAL surface
(preview = detail:<first domain entity>); id locked (it IS the
routing key); banner "every <domain> device's page — edits reach
them ALL" + EntityPicker + "⧉ Custom copy for device" (named after
the device, previews its page, Reset-to-stock preserves
entity/domain); per-device options (invert) tucked into a collapsed
fold. VERIFIED: deleting the stepper in the MaestroScreen copy
removed it from that cover's page only. builtin.* slices retired.

v0.24.1 (Suresh's round of polish): (1) the entity combobox
dropdown is FIXED-positioned (measured from the input, re-glued on
scroll/resize) — no ancestor can clip it; first attempt closed-on-
scroll and raced the browser's focus-scroll, killing the dropdown at
birth — repositioning, not closing, is the rule. (2) "dpad doesn't
work in preview" DIAGNOSED as passthrough working correctly (arrows
→ the device, focus frozen, per Harmony doctrine) — the preview now
flashBars "D-pad → device (passthrough)" so it can't read as dead.
(3) fan + cover pinned into the picker's domain chips. (4) GROUP
TILES follow the controller flow: pick an existing page or ＋ mint
one — a full hub view named from the tile label, parented to the
owner view, all anatomy folds present but OFF ("same anatomy, bits
switched off"); TileRow got ownerScreen. Group-tile rendering itself
verified fine (one summary tile on porch).

v0.25 — **NAV CARDS: ONE TYPE, FOUR STYLES** (Suresh: "groups are
just another page/view… the device tile is really a NAV CARD… our
nav card is functionally an activity card with a jump to page";
blessed "lets do a and b"). (a) group/room/nav tiles are ONE engine
type — `nav` with `style: auto|plain|image|summary` (auto: image if
the tile has one or targets a room · summary if the target page has
entities · plain otherwise). The widget merges the old three: plain
button / full-bleed photo (`nav-image` class carries the old room
CSS) / live "n entities · k active" derived from the target page's
tiles (navTargetEntities — one source of truth, no baked copies;
only summary cards subscribe those entities). HARD migration ("we're
the only user"): the compiler rewrites old types (NAV_MIGRATE in
compile_tile) and validates nav targets; yaml sources rewritten;
Studio normalizeNavTiles() heals stored/scratch/imported configs;
the engine ships nav only (group.js/room.js deleted). (b) ARCHETYPE
ADD BUTTONS: every tile section offers "＋ Add device · ＋ Add nav
card" (HubEditor + ViewEditor); the Type dropdown collapsed to
device / nav card / content generators / raw widgets. Nav-card
concertina: label (the target page's name follows) · style · image ·
Opens (name-labeled views · edit page → · ＋ mint). (3-agreed) PAGE
DRAFTS generalize the action-draft contract: beginPageDraft /
confirmPageDraft / discardPageDraft — ＋-minted pages (the nav
card's ＋ AND the activity's ＋ Create control page) JUMP into their
editor under a draft banner ("✓ Keep this page" / "✕ Discard";
discard unwinds the link and deletes the page, landing back where
you left); renameScreen keeps pending.sid honest while the page id
follows the name. Plus: sidebar "＋ Add view" under Views (Suresh:
"where can I add a page/view?") — mints a free-standing hub; flip
Room view on for it to own activities. subordinateScreens is
nav-aware (a nav target nests under its card unless the target is
itself a room). Parked (c): room-summary nav content ("Watching
Fire TV · 22°"). Tests: smoke-nav grew style/tap coverage
(summary counts live, image renders, no-target flashes);
smoke-studio 11a reworked for the draft jump + new 11c (nav-card
mint → draft → discard). All 10 suites green.

v0.26 — **ROOMS DISSOLVE INTO INFERENCE** (Suresh: "it feels
redundant and a mental gyration — all pages can have activities;
power should be settable anyway; we already map Home; I don't like
us adding HA entities"). The Room-view toggle is GONE from the UI.
Doctrine: "room" isn't declared, it's what a page BECOMES — a page
that owns activities is a place where things run. The `room` field
stays in the data model as the STICKY host marker: stamped when the
first activity arrives (Studio stampHost on ＋ Add activity;
normalizeHosts heals stored/imported/scratch configs; the compiler
infers it for hub views that declare activities), never removed
until the page is deleted — so the minted select NEVER flaps under
automations (his wrinkle question: "sticky for the life of the
page" chosen over pure inference). select.py mints per room-marked
screen (main_home excluded — the rooms hub is a collection, not a
host) ∪ activity owners; a host stripped bare mid-rebuild keeps its
select at "off". POWER is now a visible per-page SETTING (Key
Mappings row, default Auto): auto = hosts → end-the-running-activity
(confirm/hold doctrine), plain page → switch page devices;
`screen.power: "activity" | "devices"` overrides; controllers still
pass through. Engine input.js honors the override before the class
scopes. On the "beyond our remit" pushback, the select was defended
and kept: it's not storage, it's the PUBLISHED runtime state — HA
entities are the pub/sub bus (engine resubscribe/reconnect, multi-
remote convergence, his sync automation, dashboards/voice see
"what's running") — but minting is now earned (a consequence of
owning activities), never declared. Tests: smoke-keys 6b (power
overrides both ways), smoke-studio 13 (toggle gone; ＋ Add view →
first activity stamps the sticky marker). All 10 suites green.

v0.27 — **POLISH: "ROOM" LEAVES THE UI + THEME GROWS LAYOUT & TYPE**
(Suresh's polish round, items 1+3; item 2 — key-mapping versatility /
All-Off-as-action — went to DISCUSS first). (1) Wording sweep: "Room
functions" → "Page functions", "Rooms hub" → "Home hub", "Rooms chip"
→ "Home chip", "owner room" → "owner page", "edit in room" → "edit in
page" — every user-facing "room" in the Studio is now "page" (data
keys room/room_view unchanged — internal). (3) THEME EDITOR (new
visual editor for the theme slice — was Code-tab-only): Colors (all
tokens + radius, color pickers where hex) and a LAYOUT & TYPE global
block — tile height (--tile-h), primary font face/size/weight
(--font-1/--fs-1/--fw-1: labels & titles + body) and secondary
(--font-2/--fs-2/--fw-2: subs & hints). Engine: tokens.css declares
the vars with today's values as defaults, grid.css consumes them;
applyTheme now CLEARS previously-set vars before applying, so
blanking a field in the Studio falls back to the stylesheet default
live. Cols stay per-page (grid.columns); per-page height/type
overrides are the noted later cleverness. All 10 suites green.

v0.28 — **KEY BINDINGS TABLE + ALL OFF DISSOLVES** (Suresh: "All
Off is too fixed… isn't it just another defined activity sequence?"
— yes, and it dissolved). ONE action grammar everywhere: runAction
now speaks {navigate} | {sequence} | {service, entity|target, data}
(with the unresolved-context no-op guard), shared by presets,
trailing slots, and key bindings; the bmap dispatch in input.js
collapsed onto it. POWER (hold): a power_hold BINDING
(screen.buttons over global.buttons) is the page's authored
sledgehammer — just an Action it points at ("Porch All Off");
unbound = derived default (end the running activity IMMEDIATELY;
idle = nothing). endActivity's fallback for a stop-less activity is
now owner-page binding → current-page → global (the old
activities.off.start fallback is gone). The special "off" ACTIVITY
is retired: compiler migrates a declared off activity into its
owner view's buttons.power_hold ({sequence:…}); porch.yaml
rewritten (buttons: power_hold: {sequence: all_off}); Studio
normalizeOffActivity heals stored configs. Studio KEY MAPPINGS grew
the BINDINGS TABLE: rows of key (Power/Menu hold · Vol± · CH± ·
Mute) → Run action (sequence picker) / Go to page (raw service
bindings summarized, Code tab to edit); ghost row shows the
power_hold derived default until bound; ＋ Add key binding. The
"Page functions" fold is deleted. Stop-action hint: "blank = the
page's hold-Power action ends it". Tests: smoke-keys 7c rewritten
(idle+unbound = nothing; porch binding fires harmonium.run
all_off), smoke-studio 14 (fold gone, binding row renders, off
activity gone). All 10 suites green. NOTE: controllers' buttons
(music CH±) still edit via Code tab — bindings-table-on-controllers
is a later nicety.

v0.28.1 (Suresh's screenshots): (1) "theme variables do nothing" —
REAL BUG on one-column pages: `.tile.row` hard-coded min-height 78px
over the new var; now `var(--tile-row-h, calc(var(--tile-h) - 6px))`
(rows ride the global knob, 6px slimmer, matching the old 84/78;
independent override via Code tab). Fonts were live all along;
harness-verified end-to-end (78→194px at tile-h 200px). (2) Key
Mappings de-cluttered: bindings moved OUT of the stock grid into
their own bordered "Key bindings" sub-block — left-aligned, one line
per binding (key select w-36, no truncation), ghost default row and
＋ button inside it. (3) Scratch showing no binding while Live shows
one is EXPECTED — workspaces are separate configs; the off→binding
migration applies to whichever config carried an off activity.

v0.28.2 — Primary font size was ALSO row-pinned: `.tile.row .lbl`
(and the nav-image card label) hard-coded 17px → now
`calc(var(--fs-1) + 2px)` (15→17 default, rides the knob;
harness-verified 24px → 26px row labels, fs-2 6px → 6px subs).
Layout & type block tidied into a proper table: one header row (FONT
FACE / SIZE / WEIGHT), Primary/Secondary rows, compact tile-height
row, weight options shortened ("600 · default") so nothing clips.
LESSON now twice-learned: the one-column `.tile.row` variant is a
parallel styling universe — any new global token must be checked
against it.

v0.29 — **TILE ANATOMY KNOBS** (Suresh's Fire-TV-row target).
Theme vars: --icon-zone (row icon disc, glyphs scale at .52/.48 of
it, images fill it), --icon-radius (50% circle · 14px squircle · 0
square), --tile-gap (icon↔text), --tile-pad-x/--tile-pad-y (both
tile variants — shifts the icon+text block toward/away from edges).
Weight list is Roboto's real cuts: 100/300/400/500/700/900 (all
on-device on Android — zero bloat; system-ui = Roboto there, and
sans-serif-condensed gives the dense Harmony look free). ONE icon
field in TileRow now takes either payload: material:<glyph> →
`icon`, path/URL (/local/…) → `icon_image` (already engine-supported;
fills the zone — the branded Fire TV look); grid tiles got sane
28px img styling. Layout & type block: knob rows via a Svelte
snippet (tile height · icon zone · icon shape · gap · padding ↔ ↕).
Harness-verified end-to-end (zone 72px, radius 14px, gap 24px,
pad-x 30px, weight 300). All 10 suites green.

v0.29.1 — HERO HEIGHT DEMYSTIFIED (Suresh: "works in increments
of 50… what does Min height (scrolled) do?"). Diagnosis: the
self-fitting hero treats Height as a CEILING and shrinks to the
nearest tile boundary so no tile is guillotined at the fold — hence
tile-pitch-quantized height edits, and per-device variance (the HW
remote's viewport snaps differently). min_height was mislabeled —
it's the shrink FLOOR, unrelated to scrolling. Now: `banner.fit:
false` = exact height, no snapping (harness: fit on → 230/260/290
all land 230/233/233; fit off → exact); Studio hero fold grew a
"Self-fitting height" switch + an explanation paragraph; fields
relabeled Height ("ceiling — self-fit may shrink it") and Height
floor. All 10 suites green.

v0.30 — **APP STRATEGY: MASTER LIST + DEVICE CLASSES** (Suresh's
heavy lift #1, design agreed). Three layers: config.apps = MASTER
LIST, identity only (name + icon/image, could be 100 items);
config.app_classes = DEVICE CLASSES, the platform launch dialects
(firetv/tizen/…) — a class's entry per app IS the curation (listed =
offered) and speaks three forms: `source:` (select_source on
$context.media_player), full HA action (entity defaults ctx mp;
$context refs fine — Fire TV's PROG_RED/adb rows target
$context.dpad), or `sequence:` (run a named Action); entries may
override name/icon/image. Layer 3 binds by CONTEXT, not controller:
the activity's `app_class` (watch_firetv → firetv, watch_smart →
tizen) rides the normal context overlay, so ONE shared Apps drawer
speaks the running activity's dialect; tile-level `class:` hard-wires
when needed; tv.yaml's surface context carries the idle default
(firetv). Engine: classLaunch replaces appLaunch — the source_list
sniffing/launchability era is GONE (the class is the truth); tile
resolution class → $context.app_class → only-class fallback → empty.
Compiler: app_classes passthrough + validation (class app ids ⊂
master; literal tile class refs must exist). yaml hard-migrated:
apps.yaml = 10 identities; app_classes.yaml = firetv (8, from the
proven per-entity overrides) + tizen (10, from the old source
names). Studio: AppsEditor rebuilt (classes lead — per-class app
rows with Source/HA action/Run action forms, add-from-master picker,
spoken-by badges, guarded deletes; master list a collapsed phone
book, icon-or-image field, id renames walk classes+includes);
Activity Setup grew the App class select; apps tiles grew a Device
class override; normalizeApps heals legacy configs into a "tv"
class; starterConfig carries classes into scratch. Tests: smoke-nav
dialect assertions (idle→firetv com.netflix.ninja; watch_smart
active→tizen Netflix). All 10 suites green. Music Library is lift
#2 (decisions pinned: favorites only; Playlists/Artists/Albums on by
default; CH± cycles categories; menu = on-screen category picker).

v0.30.1 (Suresh: "hangover from the past") — (1) the apps drawer's
include: [3 ids] curation dropped from apps.yaml: the CLASS is the
curation now, so the drawer offers everything the dialect lists
(firetv 8 / tizen 10); include: stays available to narrow
special-purpose drawers. (2) APP STOCK DOCTRINE: the master list +
device classes are SYSTEM, not content — same as the controller
library: starterConfig sources them from LIVE, and switching to an
older scratch draft inherits LIVE's when absent. All 10 suites green
(smoke-nav expects the full 8 now).

v0.31 — **MUSIC LIBRARY: CATEGORIES** (heavy lift #2, decisions
pinned by Suresh: favorites only · Playlists/Artists/Albums default ·
CH± steps · menu tours). INTEGRATION grew a sensor platform
(sensor.py, PLATFORMS += sensor): a DataUpdateCoordinator calls
music_assistant.get_library HA-side per category (playlist/artist/
album/track/radio, favorite=True, limit 100, hourly; tolerant first
load — MA absent → empty, heals next cycle) and publishes
sensor.harmonium_music_<category> (state = count; `items` attribute
slimmed to name/uri/media_type/image, _unrecorded). The remote stays
a dumb renderer: music_library.yaml became SECTIONS (Playlists w/
Pull-Music-Here + presets_from per category; Tracks/Radio are one
more section when wanted), fed by the new sensors — the hand-built
sensor.porch_music_favorites template sensor is RETIRABLE. A small
imageless header (renderBanner now guards missing image) provides
the on-screen category nav: the existing hstrip chips ARE the
categories menu (tap to jump, scroll-spy highlights). ENGINE:
heroCycle(dir, wrap) — CH▲▼ steps categories (unbound CH on any
multi-section page = section paging; bindings always win, so the
music CONTROLLER keeps CH = track skip), MENU tours with wrap when
no device menu target resolves; stepping REMEMBERS its position
(S.heroAt — short sections can't scroll to top, the spy misreads;
seeded from the top-visible section, reset per page). smoke-music
retargeted to the new sensors + new coverage (sections render, CH
step flashes Artists, menu tours to Albums, controller CH still
next_track). All 10 suites green.

v0.32 — **FIELD-REPORT FIX BATCH + CONTAINER ROLLBACK RECOVERY.**
INCIDENT: the cloud workspace partially rolled back to a ~Jul-24
snapshot mid-session (v0.28–v0.31 engine/Studio/integration files
reverted while others survived — second filesystem-trust incident
after the staging cache). RECOVERY: G:\ is ground truth (roll-up
hashes verified after every release) — tar'd the repo on-device,
staged, hash-matched (a5208aba…), restored, re-applied the
in-flight batch. THE FIXES (all harness-verified): (1) Prime/idle
apps — apps.yaml drawer context lacked app_class (idle = empty
drawer); firetv now the drawer default; Prime verified firing
PROG_RED at $context.dpad. (2) Browser button bar — tv.yaml grew
t_btns2 (menu/back/home, unless: physical_dpad). (3) VOLUME_2 ROLE
(Sonos→amp): role in Setup (SLOT_DOMAINS media_player), cast lists,
music.yaml + generic stock got a Volume 2 tile — plus the new
doctrine making it free: a $context-bound tile whose role is
UNWIRED hides itself (visibleTile). (4) span coercion: Studio wrote
"2" as a string; makeTile now +t.span (his stuck 1-col custom
tile). (5) Device tap: "none" (readout only) + Studio option.
(6) Transport ⏸/▶ mirrors state; the art hero's LABEL mirrors
state too (Paused/Off, "Now Playing" only while playing). (7) ART
AS BACKGROUND: entity_picture washes the whole tile (gradient
overlay), thumb shrunk 96→64 — metadata keeps full width.
(8) TITLE BAR: perf clutter → ⓘ icon (tap = boot/msgs/device/
connection flash); title size themable (--bar-fs). Answered: apps
drawer pops because drawer:true (Key Mappings switch turns it
off). All 10 suites green.

v0.68.6 — **THE CHASSIS ALREADY DID IT.** Suresh, with a screenshot
of the Studio's empty Presets fold: "isn't this what this section is
for? It should turn on listen to sonos activity and then launch the
playlist?"

Yes to both, and I had reimplemented the second one by hand.

**`firePreset` has ensured the activity since v0.12.** Its own comment
says so: *"Presets: one-tap content shortcuts. If the preset names an
activity, ensure it's running first (Harmony-favorite behavior), then
fire."* It starts the activity, polls the select for up to ~12s, and
only then fires the action. Hand-written preset tiles have always
carried `activity` and always got this.

**The v0.64 GENERATOR never passed it on.** It resolves `aid` — it
just looked the presets up with it — and then emitted tiles without
it, so every generated preset silently lost the warm-start the chassis
was standing by to give it. One word in one Object.assign. And with it,
the three guarded start-then-play sequences I wrote in v0.68.5 are
deleted: `bar_play_marley` / `_easy` / `_pop` are gone, and the presets
are plain `media_player.play_media` calls again.

Measured on the built engine, three states:

    cold (receiver off)   -> harmonium.run bar_music_on, then the play
    already listening     -> the play, directly — no re-run, so the
                             0.66/0.35 volumes are not reset
    Fire TV running       -> nothing yet: confirm_switch asks first,
                             exactly as v0.12 intended

That middle row is the case my hand-rolled guard existed for. The
chassis does it better, because it waits on the activity's declared
TRUTH (receiver on AND on the DVD input) rather than on the select.

**And the section was in the wrong fold — a Studio bug.** `roleOf()`
infers a hub section's role from its tile types when no `role` is set,
and its preset test read `types.has("preset") || types.has(
"presets_from")`. The v0.64 generator's type is **`presets`**, which is
in neither list, so my new section fell through to the `devices`
bucket — hence his screenshot: `bar_presets` filed under Devices with
an empty Presets fold sitting above it. Two fixes: the section now
declares `role: "presets"` outright (an explicit role always wins), and
`roleOf` learns the `presets` type so the next one lands right without
being told.

**THE LESSON, AND IT IS THE SECOND TIME TODAY.** With the Games Room I
built a power route without reading the scripts that already worked.
Here I built a start-then-play sequence without reading the function
that already started activities. Both times the answer was inside
arm's reach and I wrote code instead of looking. *Before building a
behaviour, grep for it.* His "isn't this what presets are for" was a
better piece of engineering than my three sequences.

v0.68.5 — **THE PRESETS BELONG ON THE ROOM PAGE.** Suresh: "Not
exactly what I was thinking. I wanted them on the main room activities
page. 3 or 4 in row."

Fair — v0.68.4 put them where the grammar made them easiest (the
player's Presets section), not where he reaches for them. The Bar page
now carries a **MUSIC** section between Activities and Devices: three
across on the remote at 145px, three across on the tablet at 412px
(`columns: 3` + `tile_width: 380`, so the wide rule keeps the row a
row instead of spreading it to eight thin columns).

**Two things had to change for a room-page preset to actually work.**

**(1) `include` on the presets generator.** The activity owns five
presets — three playlists and the Pool grouping pair — and the room
page wants only the three. `include: [ids]` narrows and orders them.
Not a new idea: the `apps` generator has taken exactly this option
since v0.46, with identical semantics. One activity's presets can now
appear on two surfaces with different subsets — three on the room
page, all five on the player.

**(2) They are SEQUENCES now, not direct play calls.** v0.68.4 fired
`media_player.play_media` at `$context.ma_player`. That was fine on
the music controller and would have failed silently on the room page,
twice over. First, `$context.ma_player` resolves through the RUNNING
activity: with Fire TV running, or nothing running, the slot is absent,
`resolveEntity` returns null and `runAction` no-ops by design. Second
and worse — **the Bar Sonos feeds the Onkyo.** Playing to the MA
player while the receiver is off or on the TV input produces silence,
which would have looked exactly like a broken button.

So each preset now runs `bar_play_<name>`: start Listen to Sonos
*unless it is already running*, settle 2s, then play. The guard
matters — `bar_music_on` sets the receiver to 0.66 and the Sonos to
0.35, so an unguarded re-run would yank the volume out from under
someone already listening. Tapped cold it powers the room and plays;
tapped mid-listen it just changes the music.

The `ma_player` context slot added in v0.68.4 is gone with the direct
calls that needed it.

v0.68.4 — **THREE BAR PRESETS.** Suresh, wrapping up: "I want to
create 3 presets… Play Bob Marley Greatest Hits 2026 (but the preset
says 'Bob Marley') on Sonos Bar. Top Easy Listening Hits of All Time –
Smooth & Timeless Favorites ('Easy Listening'). Top Songs - USA
('Latest Pop')."

Config only — no engine change. Added to `activities.listen_sonos.
presets`, ahead of the two Pool-grouping presets, because "play
something" is the more frequent tap.

| label | plays | icon |
|---|---|---|
| Bob Marley | `library://playlist/44` | `sunny` |
| Easy Listening | `library://playlist/37` | `weekend` |
| Latest Pop | `library://playlist/42` | `trending_up` |

**Ids were looked up, not guessed.** `music_assistant.search` by exact
name returned all three from HIS library, and `browse_media` on
`library://playlist/44` came back as "Bob Marley Greatest Hits 2026"
with `can_play: true` and 70 tracks — verified without playing a note
in his house.

**Why `library://` and the MA player rather than v0.66's Sonos-direct
share link.** The v0.66 rule stands: convert to `spotify:` and let the
Sonos stream it whenever the id is known. Here the ids are NOT
unambiguous. "Top Easy Listening Hits of All Time" returns **two**
Spotify playlists with byte-identical names and mosaics; "Top Songs -
USA" has no exact Spotify match at all (it is the region chart, saved
into his library). Only Bob Marley had a single clean candidate — and
its library copy carries a different cover from the Spotify one, so
even there I could not prove they are the same playlist. A `library://`
uri is unambiguous: it IS the playlist he curated. One rule for all
three beats a rule that guesses on two of them. Sound still comes out
of the Bar Sonos — the MA player drives that speaker.

**AND THE REPO ADOPTED HIS DELETION.** The post-reseed audit showed
one difference between the merged store and the repo build: Bar ›
Devices had 2 tiles in the repo and 1 live — he had removed the "Games
Room" nav card in the Studio ("Ive given up on the games room for
now"). The three-way merge did exactly the right thing: `base` and
`fresh` agreed on that path, so `current` won and his deletion
survived the reseed. The repo has now adopted the live store wholesale
so the two do not drift — the v0.62 discipline, and the reason this
audit is run every time rather than trusted.

**`ma_player` is now a context slot.** Rather than repeat
`media_player.ma_bar` in three preset actions, `listen_sonos.context`
names it once and the presets say `$context.ma_player`, like every
other wiring in the system. The browse tile's `search.entity` still
names it separately; folding that in is a tidy-up for later.

v0.68.3 — **THREE FROM THE TABLET, AND TWO OF THEM WERE MINE.**

**(1) A SURFACE IS SUPPLIED BY THE ACTIVITY THAT OWNS IT.** Suresh:
"Games Room - Music Media Player has Games TV and Games Receiver in
it. As I said before, Sonos Pool has zero other devices… Clicking the
library brings up a Nothing to browse on this player."

Games TV + Games Receiver is *precisely* `games_xbox`'s cast, which is
what identified it. With the Xbox running, opening the MUSIC player in
that room drew the XBOX's `$context` onto it — its volume cast, and
`media_player` = the television. Hence the library too: browsing a
Google TV returns an "Applications" directory whose children are empty
(that integration has no apps configured), so after the media-source
filter there were no roots and the grid said, accurately, that there
was nothing to browse. Confirmed by measurement — `browse_media` on
`media_player.sonos_pool` returns Favorites plus the media-source
roots, exactly as it should.

v0.67.4 gave the engine the ROOM axis: an activity only supplies
surfaces in its own room. The missing axis is the SURFACE: being in
the right room does not make the Xbox the right source for a music
controller. A controller is declared by the activities that name it as
their `screen`, and `games_xbox` is not one of them.

`renderActivityId()` now asks `surfaceOwners()` — the nearest screen
in the inheritance chain that any activity declares — and if the
running activity is not among them, the page draws as its owner, which
is what `presumedActivity()` already computed. Surfaces nobody owns (a
room page) keep the running activity, and truth does not move: this is
presentation, exactly as v0.61 was.

**A REGRESSION MY OWN TEST CAUGHT, which is the part worth keeping.**
The first version broke the BAR: with Fire TV running, its Apps drawer
resolved to `games_gtv`. The Apps drawer declares `parent:
controller:tv` — the generic TV controller, owned by the two GAMES
activities — while the Bar reaches Apps through its own `bar_tv` fork.
So the owner search found a foreign room's activities one step before
the back-stack could offer the right one. Both `surfaceOwners()` and
`presumedActivity()` now filter owners through the existing
`activityInScope()`, so an out-of-room parent is skipped and the walk
continues. Twelve cases now pass, including every Bar case that had to
stay still. I would not have found that by reading.

**(2) I SHIPPED TWO FIXES THAT CANCELLED EACH OTHER.** Suresh: "As
soon as we fire off any search, it should display a line searching
for… all i get is a blank screen for 30+ seconds."

v0.68.1 fixed the same complaint twice, and the two fixes met. The
speed fix made typing repaint only the query TEXT (`brEcho`) instead
of the whole page — correct, and it stands. But "Searching…" lives in
the GRID, and the grid is only built by `navigate()`. The one render
that would have drawn it was the render I had just removed: `qbusy`
went true, `brBusy()` lit the small dot in the bar, and the grid kept
the empty-query `[]` it was already showing. Thirty seconds of
nothing — precisely as reported, and precisely what I claimed to have
fixed.

**I tested them one at a time.** That is the whole lesson: two changes
to the same surface, each verified alone, neither verified together.
One render now happens where a search BEGINS — after the debounce, so
once per query and not once per keystroke, and the per-keystroke win
is untouched.

**(3) LOCAL FIRST, THEN THE WORLD.** v0.68.1 split one four-kind MA
call into one per kind so the first kind could paint alone. It helped,
but every one of those calls still went out to Spotify, so the floor
stayed at whatever the slowest provider round-trip cost. Measured:
the same query with `library_only: true` returns his own ripped tracks
essentially instantly.

Each kind is now asked twice — library first (painted the moment it
lands), providers second (merged in as they arrive), deduped per kind
by `uri`, which also puts HIS music above the catalogue's. Verified
against a stubbed socket: 8 calls fire, "Searching…" appears, the
library wave alone paints 12 tiles with the busy dot still spinning,
and the provider wave merges to 24 with the 12 overlapping uris
correctly dropped.

**AND THE APP CATALOGUE IS BACK TO 13.** Suresh: "I have a google tv
at home in CT and the app list 100% works with that. I hope we created
a new one and not overwrote the reference library. We should show my
full app set. I'll add the missing apps." Right on both counts — I
said myself in v0.68.2 that pruning a dialect to one television's
inventory was the wrong layer, and then did it anyway. Restored in the
original order. A device-level installed-apps filter remains the
correct fix if dead tiles ever become a nuisance.

v0.68.2 — **THE GOOGLE TV: FOUR FAULTS, NOT ONE.** Suresh: "The
googletv integration was broken. I fixed it. power should now work
directly. We may need to fix all the keys too as they dont work and
the app list doesn't fill in. the entities may have changed name. not
sure."

Right on every count, and there were four distinct causes — so I
measured each rather than fixing the first one and hoping.

**(1) THE ADB ENTITY WAS RENAMED, NOT DELETED.** Re-adding the
integration re-created it with the area folded into the slug:

    media_player.android_games_tv_192_168_1_41           (gone)
    media_player.games_room_android_games_tv_192_168_1_41 (new)

10 references in config — the `commands` role, both activities'
`context.commands`, every `if` guard in the four Games sequences, and
two `state` blocks. All repointed. The new entity reports `idle` with
`app_name` and `source` populated, so ADB is genuinely connected.

**(2) THE `googletv` DIALECT HAS NEVER WORKED — ALL 18 COMMANDS CARRY
AN `adb shell` PREFIX.** `androidtv.adb_command` already executes
inside the device's shell, so `"adb shell input keyevent 176"` runs
`adb shell …` ON the TV and dies with `adb: not found`. The working
dialects give it away: firetv (2 commands) and firetv_embedded (6)
carry no prefix; googletv carries it on all 18. Proved with a
read-only probe rather than argued:

    "getprop ro.product.model"            → adb_response "SmartTV 4K FFM"
    "adb shell getprop ro.product.model"  → no response at all

Stripped from all 18. This was independent of the rename and predates
it — those keys and apps were never once going to fire.

**(3) THE DIALECT NEVER REACHED THE ACTIVITY CONTEXT — hence the EMPTY
drawer.** The apps/keys generators resolve `t.dialect → ctx.dialect →
the only dialect when exactly one exists`. `devices.games_tv` declares
`dialect: googletv`, but that lives on the DEVICE; the generators read
the CONTEXT, and neither Games activity carried the key. With four
dialects configured, the "exactly one" fallback can't fire either, so
`cls` was undefined and the generator returned `[]`. `watch_firetv`
has `"dialect": "firetv_embedded"` in its context and works, which is
the control case. Added to both Games activities: **0 apps → 13, 0
keys → 5.**

**(4) POWER GOES DIRECT, WITH AN OUTCOME-GUARDED IR FALLBACK.**
`media_player.games_room_tv` now advertises TURN_ON|TURN_OFF
(`supported_features` 153529), so v0.67.6's IR-only power is
superseded. But v0.67.6 was written because the network entities are
unavailable while the TV sleeps, and I have not been able to test the
cold-start path without switching off a television he may be watching.
So both routes run, SEQUENCED and CONDITIONED rather than fired blind:
`turn_on` → wait up to 8s for the TV to answer → IR `PowerToggle`
**only if the ADB witness still says off**. A toggle that cannot
double-fire, because it is conditioned on the outcome of the thing
before it. That is the difference between this and the v0.67 mistake,
where two unproven routes fired in parallel behind
`continue_on_error` and failed in silence.

HDMI1 stays on Harmony IR: his own working script used it, and ADB
`input keyevent 243` is still unproven. It is now testable in seconds
whenever he wants it.

**AND A FIFTH THING NOBODY ASKED ABOUT.** With the drawer finally
populating, `pm list packages` says only **4 of the 13** apps in the
catalogue are installed on that television:

    installed      netflix · prime · youtube · disney
    not installed  youtubetv · peacock · paramount · max · appletv ·
                   hulu · fubo · espn · britbox

Nine tiles that appear and do nothing is worse than an empty drawer,
so the googletv catalogue is pruned to the four. **This is the wrong
LAYER and I know it** — a dialect is a platform's vocabulary, not one
television's inventory, and a second Google TV with a different app
set would need the full list back. The right fix is a device-level
installed-apps filter (the generator already honours `t.include`, but
the apps controller is shared across rooms so narrowing it there would
hit the Bar's Fire TV too). Not inventing a config key mid-test; the
removed entries are recorded verbatim below and are one paste from
returning:

    youtubetv   am start -n com.google.android.youtube.tvunplugged/com.google.android.apps.youtube.tvunplugged.activity.ChrobaltMainActivity
    peacock     am start -n com.peacocktv.peacockandroid/com.peacock.peacocktv.GoogleMainActivity
    paramount   am start -n com.cbs.ott/com.paramount.android.pplus.features.splash.tv.SplashMediatorActivity
    max         am start -n com.wbd.stream/com.wbd.beam.BeamActivity
    appletv     am start -n com.apple.atve.androidtv.appletv/.MainActivity
    hulu        am start -n com.hulu.livingroomplus/.WKFactivity
    fubo        am start -n com.fubo.firetv.screen/tv.fubo.mobile.presentation.onboarding.dispatch.controller.DispatchActivity
    espn        am start -n com.espn.score_center/com.espn.startup.presentation.StartupActivity
    britbox     am start -n com.britbox.tv/axis.androidtv.sdk.app.MainActivity

v0.68.1 — **FIVE NOTES FROM A RUN-THROUGH.** Suresh, after using it
on the tablet.

(1) **THE LIBRARY BUTTON IS A DESTINATION, NOT A DETAIL.** "Lets try
inverting the library launch button, to make it more prominent. And
give it just a little more width." A trail is a CHASSIS slot — the
same one carrying every device tile's quiet ⚙ chevron — so inverting
the class would shout everywhere. `trailing.emphasis: "accent"` names
the one that earns it: accent fill, background-coloured glyph, 76px
instead of 60, sized off `--trail-w-acc`.

(2) **CHIP SIZE IS A TOKEN.** "make that tab row a little bigger
(maybe its a theme setting because on a small remote we probably want
to keep as is)" — exactly right, and the reason to do it as tokens
rather than a wide-only rule. `--chip-fs`/`--chip-gap`/`--chip-pad`
default to today's values, `html.wide` bumps them to 16px/26px, and a
theme or per-remote style block can override either way.

(3) **SHOW THE SLICES BEFORE THERE IS ANYTHING TO SLICE.** "Its not
obvious what Im looking at… we should have the tab bar
(artists/playlists etc..) shown. Not just the magnifying icon. If
there is no search text, the tabs are disabled." With no results the
strip collapsed to a lone magnifier, which says nothing about what
search even does. The declared `classes` already name the answer's
shape, so they are drawn from the start — greyed and unpressable until
an answer exists. (CH▲▼/swipe skip a disabled strip; and while in
there, `brStepCat` learned search mode at all — it compared the tree's
root/cat refs, which search never sets, so stepping had been silently
dead on the results strip.)

(4) **TWO CAUSES OF THE 20 SECONDS, AND THE FIRST ONE WAS EMBARRASSING.**
"When I type, there is no visual feedback and it can take 20 seconds
for the results. (a) we should have a centered 'searching…' and (b)
can we return the first results quicker?"

  - **Search was queued behind the browse tree.** The generator's
    `if (!L0) return loading` gate fired before the search branch, so
    opening the library and typing straight away waited out a
    `browse_media` fetch whose answer search never uses — with an
    empty bar the whole time, because that path sets `B.ui = null` and
    `browseBar` renders nothing. That is also most of why "it's not
    obvious what I'm looking at". Search now renders immediately; the
    tree fetch still starts (closing search lands you there) but no
    longer blocks the door.
  - **One call for four kinds** meant nothing could paint until the
    slowest provider for the slowest type returned. Now one call per
    kind, each painting as it lands, merged in the declared class
    order so the strip reads the same however the answers race. The
    TOTAL may not shrink — MA may serialise them server-side — but
    the wait before you see SOMETHING drops to the fastest kind, which
    is what those 20 seconds actually were.
  - And a centred **"Searching…"** across the full grid width,
    pulsing, deliberately distinct from the library's hourglass: a
    query in flight is not a page loading. It suppresses its own focus
    ring, because a ring around a status message reads as a button.

(5) **LEAVING SEARCH NEEDS A DOOR.** "Clicking the magnifying glass
takes me out of search mode, but its not obvious. Maybe we have a
close icon after the keyboard icon." Added, set apart by a rule so it
never reads as another "clear" — and the clear ✕ now only exists while
there IS text, so the two are never side by side.

Chassis: tiles gained a `cls` passthrough (validated against
`/^[\w -]+$/`) so a generator needing one specific look can say so
without earning a widget type. Used once, by "Searching…".

v0.68 — **LANDSCAPE: THE WIDE SIZE CLASS.** Suresh: "A simple way to
handle landscape mode tablets where we have a lot of real estate that
is unused. My sense is we fold to a 2 column layout at certain
breakpoints for the screens where that makes sense. And we use the
full screen for things like media library."

His instinct was right and the diagnosis was one level off, which the
code said immediately:

    #app { ... max-width: 520px; margin: 0 auto; }

**The waste was never mainly the column count — it was that cap.** A
1280-wide tablet rendered a 520px strip with 760px of black either
side. Column count is the second-order question.

**The gate.** `html.wide` when `width >= 840 AND height >= 600`. Two
dimensions, because a phone in landscape is ~844×390 and sails past
any width-only test. Both remotes are **480×800**, so they miss on
width by 360px — a chasm, not a near thing. And 480×800 vs 1280×800
means the panels are the SAME HEIGHT: nothing vertical changes, not
the hero, not the tile height, not the fold. The whole feature is
horizontal. Set by an ES5 probe beside the flex-gap probe; a panel
that cannot answer keeps today's layout.

**The rule.** A screen's declared `columns` is a statement about how
big a TILE is, not a count to obey at every width. 480 minus 24px
padding and a 10px gap is 223px per tile in a 2-column grid — the size
this design is tuned to. Feed that same size a 1280 tablet and you get
5 columns: identical physical tiles, more of them. One number, no
breakpoint table, and it fixes every desktop window width as a side
effect. Measured:

    viewport   rooms(decl 1)   controllers(2)   library(3)
    480         1 × 456px       2 × 223px        3 × 145px   (unchanged)
    1024        2 × 495px       4 × 243px        6 × 158px
    1280        2 × 623px       5 × 243px        8 × 148px
    1920        4 × 467px       8 × 228px       12 × 149px

Using the 520 cap as the reference instead of the hardware costs real
quality at 1024 — a room page lands one pixel-pair short of two
columns and renders a single 1000px row. Measured, not guessed.

**THREE INFERENCES BECAME DECLARATIONS**, which is why this is a
correctness fix that happens to make landscape work rather than a
landscape hack:

1. `const row = cols === 1` — ROW-NESS WAS ARITHMETIC. That single
   expression made "two columns of rows", the obvious landscape layout
   for a room page, literally unsayable: asking for a second column
   silently converted the rows to cards. Row-ness is a tile-style
   decision; the column count is a fitting decision; they were the same
   expression by accident. `tile_style: row|card` states it, and the
   fallback reads the DECLARED count so every existing page is
   unchanged at any width.
2. `span: 2` — A COUNT THAT MEANT A PROPORTION. All 39 spans in the
   live config (and all 35 in the engine) are `2`, authored in a
   2-column world where that plainly meant "the whole row". Read
   literally at 5 columns it means "two fifths". So a span now scales:
   N of a declared C covers the same FRACTION of the real count, and
   N >= C is full width forever. span 1 is never scaled.
3. `max_width` — WIDTH THAT MEANS "A COLUMN", NOT "A WALL". A
   controller is a STACK of full-width bands; scaling it faithfully
   produced a *stretched* stack, 1256px of band around a play button.
   Only the page knows which it is, so it says. Set to 760 on the
   music, tv and bar_tv controllers; the room pages and the library
   take everything they can get.

**TWO BUGS THE WIDE VIEW EXPOSED**, both latent on a 480 panel:

- The scroll-spy's bottom rule (`scrollTop + clientHeight >=
  scrollHeight`) is TRUE at rest on a page that does not scroll — so
  the hero strip lit the LAST section while you were looking at the
  first. Invisible at 480, where pages usually overflow; obvious at
  1280 in 5 columns. Now gated on the grid actually scrolling.
- `.hjump { flex: 1 }` makes the jump strip a tab bar spanning the
  hero. Right at 480; at 1280 it flung two labels into opposite
  corners 640px apart. Wide keeps them centred as a group.

**AND ONE HOUR LOST TO A FLEXBOX RULE, worth writing down.** Capping
the grid with `max-width: 760px; margin: 0 auto` did not cap it — it
COLLAPSED it, to 320px inside a 1280px page. `#grid` is a flex item in
a *column* flex container, and **auto margins on the cross axis
override `align-items: stretch`**: the item stops filling its parent
and sizes to its own content, then centres that. The fix is symmetric
padding (which also leaves the scroll track at the screen edge). The
same trap was waiting in `#brbar` for the search keyboard cap —
`width: 100% + align-self: center` there. I only caught it because I
rendered the real engine in a real browser and MEASURED the tile
widths; the arithmetic all said 760 and the screen said 320.

Verified by driving the built engine headless at 480×800, 844×390,
1194×834 and 1280×800: compact geometry byte-for-byte unchanged, the
Bar at 1280 in 2 columns of rows, the library at 8, the controller a
centred 760 column.

v0.67.6 — **THE GAMES ROOM TV IS AN IR TELEVISION, AND I SHOULD HAVE
LOOKED.** Suresh, from the room: "1. TV doesn't come on. 2. XBOX
doesn't come on."

Both true, both mine, and the evidence had been sitting in his own
Home Assistant the whole time. `script.hisense_gtv_on` and
`script.hisense_xbox_on` — the routines this room actually ran before
Harmonium — say:

    if media_player.android_games_tv… is off/standby/unavailable/unknown:
        harmony → Hisense TV → PowerToggle
        harmony → Hisense TV → InputHdmi1
    else:
        harmony → Hisense TV → HDMI1

**Harmony IR wakes that television. Nothing else can.** I built the
room from the dashboards, read "we can reduce dependency on harmony as
we did in the bar" as a goal to reach immediately, and wired power to
WOL + `androidtv_remote.turn_on` + a 12-second `wait_for_trigger`.
Measured tonight with the TV asleep:

    media_player.games_room_tv        → unavailable   (androidtv_remote)
    media_player.android_games_tv_…   → unavailable   (androidtv/ADB)

Both network entities are unavailable **because the TV is off**. An
integration that talks to the TV over the network cannot be the thing
that wakes it. My HDMI1-over-ADB route had the same circularity: ADB
needs the TV awake to accept the keyevent that switches its input. And
the WOL button did fire — `button.wake_on_lan_7c_b3_7b_83_f7_39` has a
timestamp from his test at 22:07 — it simply woke nothing, so the MAC
question (wired 64:ae:f1:… vs 7c:b3:7b:…) turned out to be moot rather
than the answer.

The reduce-Harmony instruction was real, but it described the Bar,
where a working non-IR path EXISTED. Here there is none. **"Reduce the
dependency" is a direction, not a licence to invent a route and ship it
untested.** Every step carried `continue_on_error: true` — deliberate,
while the routes were unproven — so all of it failed in silence, which
is how an untested guess reaches the field looking like a feature.

All four Games sequences now mirror his scripts: IR PowerToggle for
power, guarded by the ADB entity's state so a TOGGLE never turns a
running TV off, IR for the input, and `media_player.turn_on` on the
console (his own step — `media_player.xbox` is a Music Assistant UPnP
renderer for an Xbox One, and waking it was his idea, not the Xbox
integration's).

**Three more bugs fell out of reading the real scripts:**

1. The receiver's Xbox input is **`"Game"`**, not `"GAME"`. My
   `select_source` would have failed even once the TV worked, and
   `games_xbox`'s truth test — `source in ["GAME"]` — could never have
   matched. Both corrected.
2. Both **off** sequences called `media_player.turn_off` on
   `media_player.games_room_tv`, which is unavailable whenever it
   matters. Off was as broken as on; he had not reached it yet. Now IR,
   with the same only-if-on guard.
3. `games_gtv`'s truth watched the androidtv_remote entity. It now
   watches the ADB entity his own guards trust, via `not_in` — and
   `not_state`, which I reached for first, **is not in the condition
   grammar** (`equals` / `state` / `in` / `not_in` are). Caught by
   reading `evalCond` before shipping rather than after.

The WOL `cold_start` trait on the games_tv device is gone: disproven by
its own timestamp.

**The rule this earns:** when replacing something that already works,
READ WHAT WORKS FIRST. His scripts were three tool calls away for two
days. I had even written "Watch which one actually moves the TV and
delete the other" into the handoff — planning to learn in the field
what one `ha_config_get_script` would have told me for free.

v0.67.5 — **THREE SEARCH TWEAKS.** Suresh, testing: "1. Working —
but when I click a tab like Tracks in search mode, that should
highlight. 2. The There's more add a word should appear in the tab
results too, if true. 3. Its a bit slow."

(1) **THE SEARCH CHIPS NEVER LIT.** The chip strip marks its selection
with `brSame(c, sel)`, which compares MEDIA IDS against `B.root` /
`B.cat`. Search chips are synthetic — `{title, qclass}` minted from the
result set — and their selection lives in `B.qcat`, a media_class.
Neither of the two things brSame reads is ever set in search mode, so
no chip could ever be current. Selection is now asked the right
question per mode: `qclass === qcat` while searching, `brSame` while
browsing.

(2) **THE NOTE NOW NAMES THE KIND.** It always did appear in a tab
whose kind was capped — the rule was right. What was wrong was that it
was ILLEGIBLE: an unnamed "There's more" in All that vanishes when you
tap Tracks reads as a bug, not as an answer. The limit is PER KIND, so
All can be deep in artists while tracks are genuinely exhausted. Now it
says which: "More artists · playlists — add a word to narrow it down",
and in a tab, "More tracks — …" or nothing. Same logic, visible rule.

(3) **TYPING STOPPED REBUILDING THE PAGE.** Every keystroke called
`navigate()`. That tears the grid down, re-runs every generator,
rebuilds up to 200 tiles, re-focuses, repaints all states, refits, AND
does an unsubscribe/subscribe round trip on the websocket. One more
letter in a query changes none of it. `brEcho()` now repaints just the
query text — one assignment instead of ~200 DOM nodes and a socket
exchange per keypress — and falls back to a full render only when the
grid genuinely moves (a kind filter or a drill-in being dropped, or
Clear). The busy dot became a permanently-present hidden node so
`brBusy()` can toggle it without a render.

The lesson generalises past search: **a text field is not a page.**
The engine has exactly one repaint path, which is a virtue everywhere
except on the one surface that changes 5 times a second.

v0.67.4 — **A SHARED SURFACE CANNOT NAME A ROOM.** Suresh: "When I
run Listen To Music in the Games room, it takes me to the bar
controller page. This implies stock has hardcoded stuff in it."

Nothing was hardcoded — and that mattered, because the fix for a
hardcode would have been to FORK the controller, which is the thing
this architecture exists to avoid. The shared `controller:music` was
*answering* for a room, and answering first-come.

`roomActivitySelect()` (v0.67) walks the trail — current screen, then
back through the stack — looking for a page that names an
`activity_select`. A controller names none, so it fell to the second
rung: ask the activities that OWN this screen which room they live in.
Both `listen_sonos` (Bar) and `games_music` (Games) declare
`screen: controller:music`, so `activitiesOwning()` returned both and
the loop took `[0]` — the Bar. The Bar's select read `listen_sonos`,
so every `$context` slot filled with Bar devices and the title bar
said Bar. The right answer was one step further along the very same
trail: the room page he had walked THROUGH.

So an owner-derived guess now only counts when the owners AGREE. A
split vote means the surface abstains and the walk continues. This is
exactly `presumedActivity()`'s v0.61 rule — "a SHARED surface cannot be
guessed from the surface alone; the ROOM we walked through is the
disambiguator" — which the select lookup had failed to learn. Two
places asked the same question and only one of them knew the answer.

Proved both directions before shipping: driving the real config
through the old function returns `select.harmonium_bar_activity` /
`listen_sonos` for the Games trail, the new one returns
`select.harmonium_games_activity` / `games_music`, and the Bar trail,
the drawer trail (games → music → library) and both room pages are
unchanged.

**Same class, caught while in there.** `isActivityActive()`'s fallback
for an activity with no declared `state` read
`CONFIG.global.activity_select` — which is literally the Bar's select.
It now asks the select of the room that OWNS the activity (its truth,
not the current screen's), keeping global as the last resort. No
activity reaches that path today, since all five declare `state` —
which is precisely why it would have waited quietly for the third
room.

**THE ONKYO LEAVES THE POOL.** Suresh: "in games/pool the onkyo is not
involved at all in Sonos. I've delete it from activity." He cut the
Zone Amps group from the cast in the Studio; the rest of the Onkyo was
still threaded through `games_music` because I had built that activity
by analogy with the Bar's, where the Sonos genuinely does feed the
receiver. The Pool Sonos is a standalone speaker. Removed:
`wiring.source_select`, `context.source_select`, both receivers from
`devices`, the receiver power/`select_source`/volume steps from
`games_music_on`, and the receiver power-off from `games_music_off`.

That left the activity with no way to know it was on: truth had been
"the receiver is powered AND on the CD input". The Sonos is now the
only witness, so `state` becomes
`{entities: [media_player.sonos_pool], on: {any_state: [playing,
paused]}}`. Worth watching on the panel — a Sonos that is idle rather
than playing will read as off, and the pending-impersonation path
(v0.48) is what carries the UI across the gap between tapping the
activity and the first note.

Config v20 also **adopts the live store wholesale** before editing —
his tile reorder in Bar › Devices and the new "Bar" card on the Games
page came down from HA first, so the next reseed has nothing to fight.

v0.67.3 — **FIVE IS NOT A SEARCH.** Suresh, precisely: "Type 'Love'
into search. We get 18 result tiles. (It should show that there are
more, must be thousands!) Now tap Tracks. I would expect to see Tracks
with Love (also a gazillion). But I get 5. This is where I think its
rescoping to favorites."

He was right that something was wrong and wrong about what. Measured
on his box: `media_player/search_media` for "love" returns **exactly
5 per class** — and asking for `media_filter_classes: ["track"]`
ALONE still returns 5. So the chip was an honest filter over a well
that was only ever five deep, and 4 classes × 5 = 20 (18 after the
kinds that came back short). Nothing was rescoping. HA's generic
search-media contract has no `limit` argument at all.

Music Assistant's own service does:

    music_assistant.search {config_entry_id, name, media_type[],
                            limit, library_only}

Same query at limit 25 → **23 tracks**, mixing `library://` (his
ripped CDs) with `spotify--<instance>://` (the catalogue) — which is
also the direct disproof of "scoped to favourites", since a Spotify
provider hit cannot be a favourite.

So the browse tile learned to declare **which** Music Assistant to
ask, and how deep:

    "search": { "engine": "music_assistant",
                "entity": "media_player.ma_bar",
                "classes": ["artist","album","track","playlist"],
                "config_entry": "01KK4WSP09VCQ4G6PY95KTFP4R",
                "limit": 25 }

With `config_entry` the engine calls MA directly and adapts the reply
(`maItem`) into ordinary browse items — `uri` IS a media_content_id,
so v0.66's Sonos share-link rewrite, the badges, the thumbnails, the
drill-in and the play path all keep working with no idea where the
items came from. Buckets are emitted in the order the tile declared
its classes, so the chip strip reads the way the author wrote it.
**Without** `config_entry` the standard contract still runs — any
player, five deep, unchanged. The engine stays dumb: it knows the
shape of MA's answer, not which MA it is talking to nor how deep to
dig. Declared, at the layer that owns the decision.

Two things fell out. Search results now go through the thumbnail
signing pass (`brThumbs`, lifted out of `browseFetch`) — **they never
had artwork before**, which nobody had noticed. And the v0.62
no-silent-truncation rule finally reaches search: a kind that comes
back FULL gets "There's more — add a word to narrow it down",
scoped to what you're looking at (filtered to Tracks, it only appears
if TRACKS were capped). `node.more` now takes a string as well as a
count, because search knows there is deeper water but not how deep.

Studio: the browse tile gained **Music Assistant entry** and **Results
per kind** — SOURCE only this time (see below); rebuild `studio-src`
to see them. It already round-tripped unknown keys (`Object.assign`
over `tile.search`), so nothing was ever at risk — but a setting you
can't see is a setting you can't fix.

**A NEAR MISS WORTH MORE THAN THE FIX.** Mid-session I concluded from
file sizes that `studio-src/` was "three days stale" and that the
shipped `studio.html` dated from 2026-08-03 — and wrote that into this
document as fact. **It was false.** I was reading the assistant's
uploaded SNAPSHOT of the repo, not the repo. `src/` in that snapshot
happened to be current; `studio-src/` was days behind. His real
working tree had every byte of the v0.60–v0.66 Studio work, and his
`studio.html` was built the moment after his last TileRow edit.

Caught only because acting on the belief meant overwriting his tree,
so I checked the other end first: listed every file on the device and
compared it to the snapshot. Every file I had NOT edited matched
byte-for-byte; the five that differed were exactly the five I had
touched. That is the whole check, and it is cheap:

> **The snapshot is not the repo. Before writing back, prove that the
> files you did not touch are identical — a stale upload and a stale
> repo look the same until you look at both ends.**

Corollary learned the same way: the scratch rebuild of `studio.html`
came out 11 KB SMALLER than his despite ADDING fields, because the
scratch tree carries its own `node_modules`. An artifact from a
different toolchain is not the same artifact. Ship the source and let
his build produce his binary.

v0.67.2 — **FOUR TWEAKS BEFORE A TEST RUN.** Suresh, on his way to
the panel: "1. I added a nav tile to Bar. Not rendering properly.
2. I need a way to hide/show the keyboard. We can use the input line.
3. What is the point of that great big button? Type to search ma bar?
4. The search results seem scoped to favorites."

(1) **A ROOM CARD BORROWS THE ROOM'S PICTURE.** His new card —
`{type: nav, label: "Games Room", target: "games"}`, no `style`, no
`image` — resolved through `navStyle`'s `auto` ladder, whose second
rung was "target page is a room → image". So it wore the photo shape
and rendered `<img src="">`: a broken-image glyph. The rung was wrong
in principle, not just in this case — it decided the STYLE from the
target's kind while the picture came from the tile, so the two could
always disagree. Now `navImage(t)` answers one question — is there a
picture to show? — as `t.image` **else the target screen's
`banner.image`**, and the ladder asks it instead. A room already
declares its photograph once; the card that points there borrows it
rather than making the author paste the path twice. An explicit
`style: image` with nothing to show now falls through the ladder too,
because a broken image is never what anyone asked for.

(2) **THE QUERY LINE IS THE KEYBOARD'S SWITCH.** `S.browse.qkb`,
sticky for the session, toggled by tapping anywhere on `.brq` that
isn't ⌫ or ✕ (those now `stopPropagation`) — plus a trailing
`keyboard_hide` / `keyboard` button so the affordance is stated, not
guessed at. Opening search always raises the keyboard; the placeholder
reads "tap to type…" when it's down. The tablet has room for it while
typing and wants the room back while reading results.

(3) **AN EMPTY QUERY SHOWS NOTHING.** The "Type to search ma bar"
tile was mine, an empty-state placeholder, and it was furniture: the
query line directly above it already says *type to search*, and the
tile did nothing when tapped. Deleted. Its removal exposed the v0.47.1
empty-page hint ("Nothing here yet — add tiles in the Studio"), which
would have been a lie, so that hint now stands down whenever the
browse bar is up: an empty grid under a keyboard is the intended
picture, not a broken one.

(4) **SEARCH IS NOT FAVOURITE-SCOPED — measured, not argued.** Called
`media_player/search_media` on `media_player.ma_bar` with
`search_query: "radiohead"` and our four filter classes. It came back
with the full Spotify catalogue: 5 artists (Radiohead ×2, Nirvana,
Muse, Thom Yorke), 5 albums (OK Computer, In Rainbows, The Bends,
Kid A, Pablo Honey), 5 tracks (Creep, Let Down, No Surprises, All I
Need, Karma Police), 5 playlists. Nothing in our code narrows the
scope. The likely cause of what he saw: MA ranks LIBRARY matches
above provider matches, so a word that appears in his own favourites
("coffee", "chill") fills the first screen with them and looks
scoped. Asking what he typed before changing anything — the wrong fix
here would be to widen a scope that is already wide.

v0.67.1 — **THE INPUT SWITCH GOES OVER ADB** (Suresh: "I'm pretty
sure you can switch inputs on a google tv via adb commands." He is
right, and my "no clean API" was lazy — I had reached for
`androidtv_remote` and stopped looking).

Checked both paths rather than guessing again. `androidtv_remote`'s
`remote.send_command` takes a FIXED command list — navigation, volume,
media, channel, colour keys, HOME/MENU/SETTINGS/POWER — and no input
keys at all. But this TV also has the ADB `androidtv` integration
(`media_player.android_games_tv_192_168_1_41`), and his own legacy
script used that entity as the Hisense's state proxy, which is the
evidence that both entities are the same television. So:

    androidtv.adb_command → "input keyevent 243"   (KEYCODE_TV_INPUT_HDMI_1)

Both routes now run, both `continue_on_error`, and both are DISCRETE
(set HDMI1, not toggle) so running them together cannot fight — the
alias on the IR step says to delete whichever turns out to be
redundant. That is deliberate for a room built blind: whichever works,
the Xbox activity lands on the right input the first time.

If neither fires, the fallback worth trying is the passthrough intent
— `am start -a android.intent.action.VIEW -d
content://android.media.tv/passthrough/<inputId>` — with the ids from
`cmd tv list_inputs`.

**AND AN INTEGRATION BUG THE SECOND ROOM SURFACED.** `harmonium.reseed`
saved, merged and deployed — but never MINTED. Every page that owns
activities needs its `select.harmonium_<page>_activity`, and Save &
Deploy has always minted one (the POST view calls it); reseed did not.
So the Games Room arrived by file copy with no select at all, and the
engine reads that select to know what is running in the room. Found it
by looking for the entity after the reseed rather than assuming the
room was fine — worth remembering as a habit. Fixed: reseed now mints
every workspace it just wrote. Until this ships, a new room needs an
integration reload (which is how the Games Room got its select today).

v0.67 — **A SECOND ROOM** (the Games Room), and the engine change it
forced.

Built from the existing `games-*` dashboards and their scripts rather
than from a description — same method as the Bar. What the room is:
a Hisense with Google TV built in, an Onkyo TX-NR6100 (+ Zone 2), an
Xbox on the receiver's GAME input, and a Harmony hub.

**THE BUG A SECOND ROOM EXPOSED.** `currentActivityId()` read exactly
one entity, `global.activity_select`. The integration has always
minted `select.harmonium_<page>_activity` PER ROOM, so with two rooms
the engine was reading the Bar's select everywhere — music playing in
the Bar would have supplied `$context` for a controller opened from
the Games Room, putting the Bar's Sonos on the Games Room's screen.
Fixed three ways, all small:

- a room page may name its own `activity_select`, and the engine asks
  the room it is STANDING IN (`roomActivitySelect()`, reusing
  presumedActivity's trail — the screen, then what we came through).
  Absent, the global one still answers, so a one-room workspace is
  bit-for-bit unchanged.
- `activityInScope()` — an activity only owns the surfaces of its OWN
  room. Belt and braces for the case where a select is shared.
- `barTitle` and the subscription set follow suit: `room_name` per
  screen (the bar reads "Bar", the games room "Games Room"), and every
  room's select is subscribed so activity tiles stay truthful while
  you stand in the other room.

Proven in the harness, and it is the test worth keeping: opening
`controller:music` from the BAR resolves `$context.media_player` to
`media_player.sonos_bar`; opening the SAME shared controller from the
GAMES ROOM resolves it to `media_player.sonos_pool`.

**HARMONY IS DOWN TO ONE JOB.** The legacy scripts drove the TV
entirely by IR through the hub — PowerToggle, InputHdmi1, Home. The
room has a better path: `media_player.games_room_tv` is the
**androidtv_remote** integration (the Google TV protocol), which does
power and keys natively, plus a wake-on-LAN button on the same MAC.
So power and HOME are now native, and the hub is left with exactly
one thing — **putting the TV on HDMI1** for the Xbox, an input switch
Google TV exposes no clean API for. Same shape as the Bar, where
Harmony survives only for the soundbar's IR sound modes.

Two corrections the entity registry handed over. The legacy scripts
select the Onkyo source `"Game"`; the receiver's actual `source_list`
reads **`GAME`** (and `CD ··· TV/CD` for the Sonos feed) — the new
sequences use the real strings. And `media_player.xbox` is a MUSIC
ASSISTANT player, not the Xbox integration, so the old script's
`media_player.turn_on` against it is unlikely to have woken anything;
the new Xbox sequence does not pretend to.

v0.66 — **THE SONOS PLAYER IS THE TARGET** (his words, after the
rental conversation settled what search was actually for).

Search stays on Music Assistant because nothing else in the house can
do it. **Playback moves to Sonos**, which removes the second player
from view entirely:

    spotify--<instance>://track/6vMpPxLV0F5Diwcs6awI1Z
        →  spotify:track:6vMpPxLV0F5Diwcs6awI1Z

Two facts make that safe, both read out of the source rather than
assumed. HA's Sonos `_play_media` checks
`share_link.is_share_link(media_id)` **before** any `media_type`
branch, so the type barely matters and a share link is taken as-is.
And SoCo's SpotifyShare canonical regex is
`spotify.*[:/](album|episode|playlist|show|track)[:/](\w+)` — which is
also why **artist is not in the convertible set**: Sonos cannot
share-link an artist. Guessing either of those would have produced a
button that silently does nothing.

So the routing is honest rather than uniform, and says so:

| result | plays on |
|---|---|
| Spotify album / playlist / track / show / episode | **the Sonos entity**, as `spotify:<kind>:<id>` |
| artist | MA (and drilling in lists their albums, which then play on Sonos) |
| MA `library://…` | MA — no Spotify equivalent exists |

The artist case turned out to be the nice one: MA marks artists
expandable, so stepping into one lists their albums FROM MA and those
albums play on Sonos like anything else. The fetch has to use the
ENGINE's player, though — the ids are MA's and the tree's player has
never heard of them.

**Scoped, and the scope is the point.** `media_filter_classes:
[artist, album, track, playlist]` is his original list, and never
ASKING for MA's generated playlists, audiobooks and podcasts is the
cure for "I like music assistant, but its almost too overwhelming".

**The engine is declared, not inferred.** The tile carries a block, not
a loose key:

    "search": { "engine": "music_assistant",
                "entity": "media_player.ma_bar",
                "classes": ["artist","album","track","playlist"] }

with a matching editor in the Studio — engine, search player, result
kinds. One option today and it still shows: "there is no plan B today,
but it may come". Note the deliberate distinction from v0.62, where I
collapsed a one-option roots row — that was a control with one ACTION
and pressing it did nothing. This is a declaration of WHICH ENGINE
ANSWERS, and it has to be legible even at one option or the next
person finds search working with no idea what is behind it.

DESIGN NOTE 2026-08-05 — **THE HOUSE IS RENTED** (no code shipped;
this is the reasoning, and two deliberate refusals worth more than the
decision they replaced).

Context Suresh gave after v0.65 landed: "I rent this house. Guests come
and attach their own sonos apps (and libraries) and play through my
sonos boxes." Everything Harmonium has assumed until now — one
household, one intent, one actor — stops being true. This note records
what that changes and, mostly, what it does NOT.

**WHAT THE RESEARCH FOUND** (he asked whether Spotify could be searched
and handed to Sonos, bypassing Music Assistant):

- **Sonos CAN play Spotify.** HA's Sonos integration takes
  `spotify:playlist:…` with `media_content_type: playlist`, and
  `https://open.spotify.com/…` share links with type `music`, "as-is".
  This house's Sonos household already has Spotify linked — several
  Sonos favourites ARE Spotify playlists.
- **Sonos CANNOT search Spotify.** Its `search_media` covers the LOCAL
  Sonos library only; the docs say streaming services "are not included
  in search results". Confirmed live: "coffee" and even "the" against
  `media_player.sonos_bar` both return `[]`.
- **There is no Spotify integration in this HA**, and HA's official one
  does not implement `search_media` anyway — it documents browsing and
  `play_media`. Since Feb 2026 it also needs a Premium account plus a
  self-created developer app.
- So **Music Assistant is the only thing in the house that can search
  Spotify.** Not a preference — the only door.
- **But MA's ids convert.** A result comes back as
  `spotify--<instance>://track/6vMpPxLV0F5Diwcs6awI1Z`; the tail is a
  real Spotify base-62 id, so `spotify:track:6vMpPxLV0F5Diwcs6awI1Z`
  falls straight out and Sonos accepts it. Library items
  (`library://playlist/11`) have no Spotify equivalent and do not
  convert — the design must be honest about that split rather than
  pretend it is uniform.
- Worth knowing: MA STREAMS audio from its own server (re-encoded), so
  the HA box sits in the audio path. A `spotify:` URI handed to Sonos
  does not — Sonos streams from Spotify directly, survives an HA
  restart, and skips a transcode. MA's own docs also warn that running
  HA's Sonos integration alongside MA's Sonos provider can misbehave
  ("speakers do not like too many requests from too many sources").
  Both are running here.

**THE ENTITY MODEL** (his question: "does it target the sonos players or
the ma_sonos players?"). Different entity per job, and the split is the
answer rather than a dodge:

| job | entity | why |
|---|---|---|
| display + control | the **Sonos** entity | it is the truth of the speaker, whoever is driving |
| search | the **MA** entity | the only thing that can |
| playback | **Sonos** where the id converts, MA otherwise | one entity to look at |

Which demotes MA from a PLAYER to a SERVICE WE CALL. It never becomes
a surface; it answers questions. That also answers his "MA is almost
too overwhelming" — a scoped search is us choosing which of MA's world
to ask about, so generated playlists and recommendations are never
requested in the first place.

**DECIDED — scoped MA search, with the engine visible.** Restrict
`search_media` to artists / albums / tracks / playlists (its
`media_filter_classes` parameter), which is exactly the list he asked
for originally, and which is what keeps MA's generated content out.
Expose the backend as a SETTING even though there is exactly one
option today: "there is no plan B today, but it may come."

Note the tension with v0.62, and the distinction that resolves it: I
collapsed the Sonos roots row because a control with one option is not
a control. That row was a control with one **action** — pressing it did
nothing. This is a declaration of **which engine answers**, and it has
to be visible even at one option, or the next person finds search
working with no idea what is behind it. Documentation that happens to
be a dropdown, and the seam a plan B slots into.

**REJECTED — the takeover confirm.** The idea was "Bar is playing X —
press again to take over", reusing `barConfirm`. I proposed firing it
when the speaker is playing and no activity is running. Suresh: "Unless
we know that the new play request comes from NOT US, the whole takeover
thing is too brittle… net net, not worth the brain damage." He is
right, and the rule was worse than I described it:

- "no activity running" is not a proxy for "not us". Fire a preset from
  the room page without starting the activity and the SECOND press
  confirms against your own music.
- A guest who stomps you mid-session produces no confirm at all — the
  one moment it would have earned its keep.

The only sound signal is HA's `context` on state changes: our service
calls carry one, the Sonos app's do not. The engine subscribes to
entity DIFFS, not state-changed events, so honouring it means a
different subscription model for one dialog. Matching on
`media_content_id` does not work either — Sonos rewrites a `spotify:`
URI into its own internal id the moment it accepts it. **If this ever
comes back, `context` is the only honest path.**

**REJECTED — "the receiver is off" hint.** I offered that a Sonos
playing into a powered-off Onkyo produces silence a guest reads as
"broken", so the controller could say so. Suresh: "If someone tries to
play on the sonos, from their phone, they are almost certainly not
looking at the tablet, so showing a message is redundant." Aimed at the
wrong person — the one who caused the silence is holding a phone in
another room. Filed under *right instinct, wrong audience*.

**OUT OF SCOPE — waking the Onkyo automatically.** An automation on
"Bar Sonos starts playing" could bring the receiver up. It is an
automation about the HOUSE, not about the remote: engine dumb, HA
brain. It belongs in his automations, not in Harmonium.

**THE PRINCIPLE THAT CAME OUT OF IT — multi-user by DISPLAY HONESTY,
not arbitration.** Sonos has no ownership and no locking: one transport
per speaker, last writer wins, and nothing we build changes that. So
the remote shows the truth of the speaker and never editorialises about
who is driving. A guest plays from their phone and your Now Playing,
artwork and transport follow them; you can pause them, skip them, take
the volume down. In a rental that is the feature, not a compromise.
No locks, no dialogs — and it is what the system already did, which is
usually the sign of a right shape.

One honest limit: if a guest arrives via Spotify Connect rather than
loading a Sonos queue, Now Playing is correct while the queue screen
may read empty. That is Sonos's model, not ours.

Also flagged for a look, unverified: **SpotifyPlus**, a HACS
integration wrapping much of the Spotify Web API as HA services —
search plus Spotify Connect device transfer, and Sonos speakers are
Connect targets. Potentially MA-free end to end. Needs Premium and a
developer app, and its current surface has NOT been checked.

v0.65 — **SEARCH, WITH A KEYBOARD** (Suresh, heading out to dinner:
"Here's a big lift for music library. Search (artists|albums|tracks|
playlists etc…). On a tablet I have plenty of room for an on-screen
keyboard. Give it a go.").

**The finding that shaped it: Sonos cannot search.** HA exposes
`media_player/search_media`, and asking the house rather than the docs
settled it in two calls — `media_player.sonos_bar` answers an empty
list; `media_player.ma_bar`, the Music Assistant player driving the
SAME physical speaker, returns artists, albums, tracks, playlists,
podcasts and audiobooks with artwork. And the ids it returns
(`library://playlist/11`, `spotify--…://track/…`) mean nothing to
Sonos, so results must PLAY on the player that found them. One entity
has to be both, and the tile names it: `search_entity` on the browse
tile. Absent, there is no magnifier and nothing changes for anybody.

The UI reuses what browse already had rather than inventing a screen:

- The magnifier is a **chip**, first in the strip — the strip is
  already "which slice am I looking at", and the roots row may not
  exist to hold a button (v0.62 collapses it).
- Search MODE swaps the bands: query line + on-screen keyboard above,
  and the chips become the KINDS the answer contains (All · Playlists ·
  Artists · Albums · Tracks · Podcasts), built from the results'
  `media_class`, filtering client-side. He asked for
  "artists|albums|tracks|playlists"; the answer decides which of them
  exist.
- Results render through `mkItems` — the same renderer as the tree, so
  thumbnails, the ▶ play badge, drill-in and the v0.62 kind badges all
  come along free. Search results mix kinds by nature, which is
  precisely what that badge was built for.
- Keystrokes debounce at 350ms and every reply carries a sequence
  number, so a slow answer can never overwrite a newer query.

**The keyboard is a CSS grid, not flex** — Chromium 75 has grid gap
and won't have flex gap until 84 (the tablet's floor, see v0.56.1).
Keys size off `--kb-*` custom properties, so the wall tablet can grow
them from its remote profile without a fork, exactly like `--bar-*`.

The bug worth recording, because the first design was backwards:
**while a search field is open, TEXT WINS.** I first wrote "capture
only keys that aren't remote buttons", reasoning that KeyMapper emits
punctuation. Then the test typed "miguel" and got "iguel" — because
every profile binds `m`→mute, `p`→power, `o`→power_hold and
space→select as desktop conveniences, and Backspace→back, which
navigated out of the library mid-word. Now every PRINTABLE key types;
arrows, Enter, F-keys and the punctuation KeyMapper actually sends
still route as buttons, so a hardware remote loses nothing and can
still walk the results and press play. Escape closes search and hands
Escape back to Back.

v0.64 — **PRESETS BELONG TO THE ACTIVITY** (Suresh, one push after
v0.63 shipped: "these presets shouldn't be hardcoded in the stock
controller. The logical place to define presets is in the Listen to
Sonos activity isn't it? What if I wanted a preset to play CoffeeHouse
Radio?").

He is right, and the CoffeeHouse question is what makes it obvious:
"Add the Pool" is arguably infrastructure, but a favourite radio
station could never belong to the shared Media Player surface. v0.63
put both tiles ON `controllers.music` and scoped them with
`when: {activity: listen_sonos}` — which WORKS, and is the same
mistake as `volume_zone`: content owned by one activity, stored in the
thing every activity shares, with a filter papering over it. `when`
earns its keep for genuine per-activity *variation* of a shared
surface; it should not be how content gets there in the first place.

So `activities.<id>.presets` joins the cast, its groups and its
volumes as things the ACTIVITY owns, and the controller carries one
more generator that names nothing:

    { "id": "acts_presets", "type": "presets" }

Same contract as `devices` / `volumes` / `groups`: reads the RUNNING
(or presumed) activity, emits its tiles, and renders nothing —
section header included — for a room that has none. Tile objects pass
through whole, so a preset keeps every field it always had
(`activity:` warm-start included).

STUDIO: a **Presets** tab on the activity card, which is exactly where
he went looking. It reuses `TileRow` verbatim, so activity presets get
the same editor as a page's — icon, label, the three-door "On tap"
(sequence / scene / service), reorder, duplicate, delete — for free.
The count rides the tab like State's does.

Also aligned: v0.63 taught the ENGINE that a preset may name a
sequence directly (`{"sequence": "id"}`) but the Studio still wrote
the long `harmonium.run` spelling. `presetMode()` now recognises both
and writes the short form. Old tiles keep working, which is the whole
point of recognising both.

Rule earned, and it is the third time this session: **ask who OWNS a
thing before asking where to put it.** The cast, groups, volumes and
now presets all answer "the activity" — and every time I have put one
of them on a shared surface instead, it has come back.

v0.63 — **A PRESET MAY NAME A SEQUENCE**, and the Bar learned to
lend the Pool its music.

Suresh asked how to pair two Sonos players and I offered three shapes —
a per-room control, a preset pair, or a whole activity. He picked the
preset ("LOVE the preset idea… for now we can handle it in our
actions"), which is the right answer for something used occasionally:
one tap, no state to read, nothing to clutter the page the rest of the
time. `media_player.join` (target = the COORDINATOR, `group_members` =
who joins it) and `media_player.unjoin`, verified live on the pair
before writing a line of config.

The engine change is one line and overdue: `firePreset` handled only
`action.service`, so a preset could not run a SEQUENCE — the exact
grammar activities, nav tiles and key bindings already speak. It can
now, and warm-start still applies (the activity comes up first, then
the sequence). Orchestration belongs HA-side; a preset that bonds two
speakers is a sequence, not a service call.

Placement is the part worth remembering. The tiles want to be where
the hand is — on the music controller — but that controller is SHARED,
and bar-specific tiles on it would leak into every room that ever uses
it. `when: { activity: listen_sonos }` is exactly the tool for that
(v0.36's per-activity content override), so the Speakers section
appears under the Bar's activity and nowhere else, with **no fork**.
A section whose tiles all filter out renders nothing at all, header
included — so the cost to every other room is zero.

Also: `media_player.bar` → **`media_player.sonos_bar`** and
`media_player.pool` → **`media_player.sonos_pool`** in the HA registry.
HA does not update references, so the sweep was manual — 11 in the
Harmonium config (including the `device_options` KEYS, which are entity
ids in key position and are exactly what a careless find-and-replace
misses) and two dashboard cards. Everything else that mentioned the old
ids pointed at `media_player.bar_2`, dead since v0.58.

And `bar_devices` became a real SUBPAGE: it had `class: group` and
`type: hub` right, but no `parent`, because *＋ Add page* doesn't ask
for one while *Add Nav Card* sets it automatically. Worth closing that
gap in the Studio — a page reachable from exactly one nav card should
adopt that page as its parent. Taxonomy note for the next reader:
`class` is the only field the ENGINE reads (the key policy); `type` is
the Studio's Hub-vs-Controller choice; `view_kind` is a derived label.
"Hub" just means "a page of tiles, not a controller".

v0.62 — **THE LIBRARY STOPS SLICING WHEN THE SLICES ARE ARBITRARY**
(Suresh: "what Sonos is returning is ALL FAVORITES and then we're
slicing them by category, which is useful, but sometimes artificial.
What's the difference between a coffee shop playlist and coffee shop
radio? Semantics.").

Method note first, because I got it wrong before I got it right: asked
how the chips were ordered, I answered from `favList` — the Music
Assistant *synthesized* path — when the Bar plays through
`media_player.bar`, the SONOS entity, so the real tree was running and
`favList` never fires. Asking the machine settled it in one call:
`media_player/browse_media` returns Albums · Playlists · Radio ·
Tracks, and since the engine has never sorted anything, that IS the
order. **When two code paths can produce the same screen, find out
which one ran before explaining it.**

(1) **`categories` on the browse tile** — `["Playlists","Radio",
"Albums","Tracks"]` reorders and filters the chips by title,
case-insensitively, on EVERY path (the Sonos tree, MA's flat tree, the
synthesized favourites). Absent, or matching nothing, leaves the source
order alone, so no existing tile changes.

(2) **The "All" chip**, first and selected by default, when the root is
the only one — i.e. when the categories ARE the whole library. It
concatenates every category in `categories` order, so the option that
sets the chip order also sets the grouping inside All. Each item
carries a **badge** naming the folder it came from (queue_music /
album / person / audiotrack / radio), keyed on the FOLDER rather than
`media_class` — Sonos reports its radio favourites as media_class
`genre`, so the folder is the more truthful label. Badges ride
alongside the children (`node.badges[i]`), never stamped onto them: the
child objects are the shared node cache, and mutating them left badges
behind in the single-category grids once you had visited All. Opt out
with `all: false`.

(3) **The roots row collapses to nothing when it holds one root and no
tiles of its own.** Suresh, of the lone Sonos badge: "What does the
favorite icon at the top do?" Nothing — Sonos's root has nine children
and eight are `media-source://`, which we hide, so it was a selector
with one option. It returns by itself when a second root exists.

(4) **No silent truncation.** The 200-per-node cap has always been
there; what was missing was saying so. A node now records `more`
(our slice plus HA's own `not_shown`) and the grid ends with
"221 shown · 50 more". The synthesized path says the same for the
integration's 100-per-category sensor cap, which cannot report its own
truncation — a full list is the only signal there is.

(5) **Drawers presume too.** v0.61 let the generated screens inherit an
activity from where they were opened; a DRAWER (`drawer: true` — the
Apps grid, the Music Library) is the same kind of destination, and
without it the library opened cold was blank. Its declared `parent` is
consulted before the history stack, so a cold open still resolves.
`rawScreen()` reads the config directly rather than via `screenOf`,
because `screenOf` generates the virtual screens and `groupScreen` asks
for the render activity — that way lies recursion.

Also v0.62, STUDIO: **the Roles dropdown stopped hiding the answer.**
Suresh: "In the drop down for Power Button, only get nobody or 'an
entity directly' … Volume Readout doesn't list Bar Sonos." Cause:
candidates were `cast.filter(c => devLib[c].roles[role])` — only
devices that ALREADY claim the role. The doctrine behind that is right
(a device declares what it can do) but the UI enforced it by making the
device invisible, so the only way forward looked like wiring a raw
entity — which is exactly the move that skips the library and leaves
nothing for the next room to inherit. Now the rest of the cast appears
below the claimants, each shown with the entity it WOULD use (its own
bundle, first entity whose domain the role accepts), labelled
"＋ <name> · <entity> — add the claim". Picking one writes the claim
onto the DEVICE and wires it in one gesture, and says so. The claim is
permanent, so every future cast of that device fills the role by
itself. Principle: **when the model says no, offer to change the
model — don't just hide the option.**

And the code finally learned the word the UI has used since v0.45.1:
the tab is **Roles**, but `jobCandidates` / `setJob` / `customJob` /
`dotJobs` / `tab === "jobs"` and a paragraph of copy still said Jobs.
All renamed. Suresh: "Its roles, not jobs."

Also: **the Studio's edits came home.** Suresh: "I made changes to the
workspace, how do we stop them getting overwritten." They were only
ever safe by accident — the next `reseed` with a repo config still
holding the old `screens.bar` tile array would have taken the room's
Devices section back. So `dist/config.json` ADOPTED the live store
wholesale (v10) and the `categories` edit went on top: his new "Device
Control (Expert)" nav card and `bar_devices` page, "Zone Amps", "Upper
Area Amp", "Entry & Gazebo Amp", and the `device_options` tile
curation. Repo and store now agree, which is the only state in which
reseed is harmless. **Until yaml round-trip exists, pulling the store
into the repo is a step in the deploy ceremony, not an afterthought.**
One casualty worth naming: the Studio recompiles `context` from
`wiring`, so `listen_sonos.context.power` — hand-authored by me,
pointing at the Onkyo, never wired to a device — is gone. Harmless
today (power is activity-scoped everywhere it matters), and the fix if
ever wanted is to wire `power` to the Bar Receiver in Jobs.

v0.61 — **THE PRESUMED ACTIVITY** (Suresh, on the Studio preview:
"As discussed, I should NEVER see this blank page. I want to see the
preview. I can always hit the power button to turn it on! But I want
to see it!"). Third time this complaint has come back, and each time
the cause was different — which is the point worth recording.

v0.48 fixed the TAPPED case (`pendingActivity`: you pressed the tile,
so render as that activity even before the select agrees). v0.60 fixed
the ASLEEP case (`SF_SEEN`: an entity that has never reported its
features is capable, not incapable). This is the third: **standing on
a controller with nothing running at all.** No activity means no
`$context`, so every `$context.*` tile resolved to null, hide-unwired
did its job on all of them, and the page rendered its "No activity is
active" apology. Correct by every local rule and useless.

Fix: `presumedActivity()` — if nothing is running, the page is drawn
as the activity that OWNS this surface (`activities.<id>.screen ===
S.screen`), showing that activity's devices in their real, off state.
`renderActivityId()` = running ?? presumed, and it replaces
`currentActivityId()` at exactly the render sites: `ctxFor`, the
`when` filter, the `devices`/`volumes`/`groups` generators, the
resubscribe check, `groupScreen`. Nowhere else. **Truth did not
move** — the End button, hold-Power's end, and the activity tile's own
ON state still ask `currentActivityId()`, so nothing claims to be
running that isn't. The safety argument is structural: the fallback
fires only where the old code had NO context, so it can only add to a
page that was previously blank.

Details worth keeping: (a) only the GENERATED screens (`detail:`,
`sources:`, `queue:`, `group:`, `keys:`) inherit a presumption from
the page they were reached through — a real page that owns no
activity (a room, a drawer) presumes nothing, or the guess leaks
backwards onto the room page. (b) A SHARED surface (one TV player,
many TV activities) can't be guessed from the surface alone, so the
room walked through disambiguates, nearest first, then config order —
verified with a synthetic two-room config: the same `controller:music`
presumes Bar or Games depending on which room you came through, and
retargets `$context.media_player` with it. (c) The **on-screen power
button** and the physical power tap now START the presumed activity,
which is his sentence made literal. That amends the 2026-07-23 "idle
tap does nothing" doctrine in exactly one place: a surface drawn as a
presumed activity. An idle room page presumes nothing and still does
nothing. (d) The honest indicator was already there and cost nothing:
`barTitle` renames to the activity only when it is genuinely running,
so "Bar · Music Media Player" means presumed and "Bar · Listen to
Sonos" means live.

Lesson: **"never show me a blank page" is not one bug.** It is a
standing requirement, and every subsystem that can produce emptiness
has to answer to it separately — the select, the capability probe, the
context. Engine-only; config stays v9, so this deploys with a push and
a reload, no reseed.

Also v0.61, STUDIO: **the return trip.** I asked whether the new cast →
device-library jump read as a shortcut or as losing your place, and it
was the latter — because the way back was a 12px "← back". Suresh:
"We need a *prominent* return to Bar>Activity Name when we jump in to
device library. Then it will feel like a shortcut. Hopefully it will
go to the open activity on the bar page!" So `openDeviceEditor(devId,
back)` now carries `{key, label, activityId}`, the library shows a
STICKY banner naming where it goes ("Bar · Listen to Sonos / back to
the cast you came from") that survives scrolling the whole device
list, and pressing it re-opens that exact activity card and scrolls to
it — reusing `app.focusActivity`, the mechanism a minted action draft
already used to come home. The return is scoped to one visit
(`selectSlice` drops it the moment you leave by any other road), so it
can never point somewhere stale. Rule of thumb earned: **a shortcut is
a round trip.** A one-way door is a detour no matter how good the
destination is.

v0.60 — **GROUPS ARE A PER-ACTIVITY VIEW, AND A PANEL IS NEVER
BLANK.** Two things, and the second is the one to remember.

(1) THE ZONE ROLE WAS THE WRONG LAYER. v0.59 made zones visible by
declaring them on the DEVICE (`roles.volume_zone`). Suresh killed it
with one question: "what if in another page I want them as individual
Volumes not hidden behind a Zone Group Tile. Do I create new pre-wired
devices for that?" No — a device is what it *is*; where its control
gets drawn is what the ACTIVITY decides. So `volume_zone` is
withdrawn and the cast became a mixed array: device ids AND group
objects.

    "cast": ["bar_sonos",
             {"group": "zones", "name": "Zones",
              "icon": "material:speaker_group", "shows": "volume",
              "members": ["bar_onkyo", "bar_onkyo_z2"]}]

A group is a nav card plus a generated page — the SAME mechanism as
Devices ▸ Add Nav Card, which is exactly how Suresh framed it ("we
ALREADY HAVE in devices >> Add Nav Card"). The one new idea is his:
"Maybe that's TYPE????" — `shows` says what the children render as.
`shows: volume` draws the control inline; `shows: device` (the
default AND the universal fallback) draws a launcher into that
device's own controller. His own boundary, kept verbatim in the
code: a control that fits in a tile is drawn; a surround-preset
picker doesn't fit, so it becomes the parent tile that launches the
child. Engine: `castMembers`/`castGroups`/`groupedDeviceIds`/
`groupChildTile` + a `groups` generator (context.js) and
`group:<id>` joining the virtual screens (details.js); `zones:` is
gone. A grouped device KEEPS ITS OTHER JOBS — the receiver sits in
the Zones group and is still the activity's `source_select`. Groups
are per-activity, so the SHARED controller carries one `{type:
groups}` tile and every room gets its own cards for free.

(2) FEATURE-GATING TURNED "ASLEEP" INTO "INCAPABLE." My own v0.57
`hidden()` work read `supported_features` live — and an off receiver
reports nothing, so the panel emptied itself. Suresh: "it is
infuriating… I never want to see a blank panel. I should always see
the page. Its up to me to turn it on if its off." Fixed with sticky
memory: `SF_SEEN` / `OPT_SEEN` in widgets/helpers.js remember the
union of every capability bitmask and the last non-empty option list
per entity, and an entity that has never answered is treated as
CAPABLE, not incapable. Absence of evidence is not evidence of
absence — the same rule the whole engine should follow when a device
is merely asleep.

(3) STUDIO CATCHES UP (the debt v0.59 left: "Where in the harmonium
ui is the zone stuff being set? I dont see it?"). ActivityCard's cast
now renders groups: ⊞ Add group, name/icon/`shows`, member ticks over
the whole cast, and a per-row "where is this drawn" select. Members
render as nested cast rows — same row shape, same badges, so the
`source_select` badge Suresh missed is now on the grouped receiver.
A member whose claim is missing for the chosen `shows` says so and
links to the fix rather than silently degrading. Every cast row's
NAME is now a doorway into the pre-wired device library (his point 4:
"If I click on a pre-wired item in the cast section, I should go to
its editing page"), landing on that device with the row open and a
← back link. `volumes`/`groups` joined the tile type list and the
workspace map's generator names; the minted Media Player carries a
`groups` tile. **studio.html is a real vite build again** — v0.59's
hand-patch is retired. Method note: the Jamaica clone has no
`node_modules`, so the build ran in the container against a staged
copy of `studio-src` and the artifact was written back.

Lesson, and it is the sharper form of v0.59's: inferred structure
cannot be taught — but structure declared at the wrong LAYER cannot
be reused. Ask whose decision it is before choosing where it lives.

v0.59 — **VOLUME ZONES ARE DECLARED, NOT INFERRED** (Suresh: "there
is no way to know zones exist? Or to set them… its not intuitive
right now"). v0.57.1 picked the master by reading the activity's
`wiring.volume` and called everything else "the rest". It worked and
it was invisible: nothing in the config said "this is a zone", so the
Studio could not show it and the user could not set it. Replaced by a
DEVICE role — `roles.volume` draws on the controller, `roles.volume_zone`
draws behind the Zones card. The `volumes` generator now takes
`role` (default `volume`) instead of `scope`; `zones:` asks for
`volume_zone`. One word per device, and it appears in the Studio's
device library beside Volume keys and Volume readout (ROLE_KEYS in
state.svelte.js + label/hint in DevicesEditor). Deliberately NOT added
to ActivityCard's own ROLES list or to castFromCtx — it is a property
of the device, not activity wiring, and offering it there would be a
control that does nothing. Lesson worth keeping: **inferred structure
cannot be taught.** If the UI should show it, the config has to say it.

v0.58 — **PROFILE CHROME, MEASURED DIALECTS, THE SONOS ENTITY.**
(1) STATUS BAR SIZING is a remote-profile decision: every metric in
`#bar` became a `--bar-*` custom property whose fallback is exactly
what shipped, and `remotes.<id>.style` layers a map of CSS custom
properties over the theme in applyConfig. A `tablet` profile carries
`bar-h: 100px`; `default` is untouched (Suresh: "Default is what we
have"). (2) FIRE TV (EMBEDDED) DIALECT — Prime never launched because
the `firetv` dialect named `com.amazon.firebatcore.deeplink.
DeepLinkRoutingActivity`; asking the TV (`cmd package resolve-activity
--brief -c android.intent.category.LEANBACK_LAUNCHER`) gave
`com.amazon.pyrocore.IgnitionActivity`. New `firetv_embedded` dialect
built from MEASURED components, carrying only the six apps actually
installed — the drawer stops offering buttons that do nothing. The CT
stick keeps `firetv`. Method note: **ask the device, do not port the
package list.** (3) The activity tile's ON line now reads "On · press
to open · hold to end" — `hold` always called requestEnd, the tile
just never said so. (4) `media_player.bar_2` (Music Assistant's player)
→ the Sonos integration's own `media_player.bar`; MA-Bar renamed
`media_player.ma_bar` for clarity. My misread of "the Sonos variant".

v0.57.1 — **ZONES ARE A VIEW + CACHE CORRECTNESS.** (1) `zones:`
joins `detail:`/`sources:`/`queue:`/`keys:` as a virtual screen —
the running activity's secondary volumes, generated on demand, so the
SHARED controllers carry one Zones card and every room gets its own
list without a fork. Cost, stated plainly: a virtual screen is
invisible to the Studio — it cannot be listed, previewed or edited.
(2) The `volumes` generator was bound to `act.screen === S.screen`,
so it produced nothing anywhere except the activity's own controller;
now it binds to the RUNNING activity wherever you stand. (3) Summary
nav cards read `rawTilesOf` and so could not see through a generator
("0 entities · 0 active"); they now expand while STANDING ON the
target (generators resolve $context against S.screen), depth-guarded
against a target that points back. (4) `hide_when_empty` on nav —
opt-in, so no existing card changes. (5) INTEGRATION: engine caching
was silently poisoning every deploy — HA serves www/ with long cache
headers, so a kiosk kept the engine it first saw while happily
re-fetching config.json, and a config naming a widget the old engine
never heard of renders as a tile labelled "undefined". Fix is the
versioned-asset pattern: unauthenticated `/api/harmonium/engine_version`
returns an 8-char SHA-1 OF THE FILE ON DISK (no version to remember to
bump), no-store; the entry stub asks for it and hands off to
`../index.html?v=<hash>`. Engine stays cacheable, its URL changes when
its bytes do. No per-device setup, no IPs — the tenth tablet inherits
it. ES5 stub with a 4s timeout and an unversioned fallback so a
mid-restart integration still boots the remote.

v0.57 — **VOLUMES GENERATE; WIDGETS SUPPRESS THEMSELVES** (Suresh:
"there might be 8 volumes… think of them as device tiles with a volume
role"). New `volumes` generator walks the activity's cast and emits one
control per device declaring a volume role, taking label and icon from
the DEVICE REGISTRY — so the shared controller stays generic and each
house names its own zones. `global.style.volume` (`compact` | `slider`
| `stepper`) picks the treatment, overridable per tile and per device
(`device_options[entity].volume_style`); the stepper's `.sldr` track was
ported into the volume widget so the two stop looking like unrelated
controls. New generic hook: a widget may declare `hidden(e, t)` and
vanish — `transport` when the device reports no play/pause/next/prev/
stop (an Onkyo at 69516 has no transport; drawing one is a lie, not a
control), `sources` without SELECT_SOURCE, `chips` when its option list
is empty, `stepper` (v0.58) when a volume range is not exposed. Unknown
state never hides; supported_features arrives with the first diff and
tileSig re-renders. New `sound_mode` CHIP_KIND puts MultiChannel Stereo
on the receiver's own page instead of bouncing it through Harmony IR.

v0.56.1 — **THE WEBVIEW FLOOR** (Fire OS 7 tablet, Fully Kiosk: blank
screen, engine chrome painted, nothing else). Amazon pins Fire HD 8
(KFONWI, Android 9) to `com.amazon.webview.chromium` **75** — and
`dumpsys webviewupdate` lists exactly one valid provider, so Google's
WebView cannot be installed over it and the ADB provider swap is
closed. The engine used `??` ×22 and `??=` ×1 (Chrome 80 / 85): a
single unparseable token throws a SyntaxError over the WHOLE script,
so the HTML shell paints and not one line of JS runs — which looks
exactly like a config bug. Fixed with `!= null` ternaries (NOT `||`,
which changes behaviour wherever 0 or "" is legitimate — and this is a
volume/brightness codebase). CSS: flex `gap` needs 84 and silently
collapses to zero, which on a touch surface means the D-pad and
transport render flush together; fixed additively — a boot probe sets
`html.nogap` only when flex gap is unsupported, and `styles/compat.css`
carries margin fallbacks scoped under it, so a modern engine matches
NOTHING and renders byte-identically. `inset: 0` (Chrome 87) → longhands.
**Baseline decided: the engine targets ES2019 / Chromium 75.** "Runs on
cheap Android remotes" is the product thesis; the Astrion and RS90 are
this class of hardware, and a vendor-frozen webview is the normal case,
not the exception. Verified by parsing the built artifact with acorn at
ecmaVersion 2019 and by measuring child-to-child spacing in every flex
container with and without the fallback (13/13 identical). Two bugs the
harness caught that review had not: the probe itself reported
"unsupported" on EVERY engine because a `height: 0` on the test element
clamps scrollHeight to 0, and two widget files still carried `??`
because they were staged after the sweep.

v0.56 — **THE REMOTE-CREATION SCREEN** (Suresh, verbatim: "I want a
'remote' creation screen where I specify the physical buttons of a
remote, in order… I should be able to add Custom Slots (Like Red,
Green, or '.', '..', '...') and Blanks. Then in next iteration of
capture, I can hit the remote key, and on the tile, press to assign
the physical key!"). Two halves, one data model — the profile's
`soft_layout` IS the remote's description, and the Studio and the
engine are just two ends of it.
(1) LAYOUT BUILDER — the ✎ soft-remote editor's cells stopped being
a closed dropdown: each slot is now an `<input list="softbtns">`,
free text over a datalist of the standard names. Custom slot names
type straight in and are ordinary strings in `soft_layout`; v0.54's
OPEN BUTTON VOCABULARY makes them first-class logical buttons the
moment a key emits one (bindable in any screen's `buttons:` map,
zero engine edits). Empty = a real blank spacer. One renderer for
both worlds (`defFor`): known name → its glyph + label, custom →
the name when it fits a key, else "•". Plus ＋ next to "Preview as":
mints a blank profile (`remotes.<id>` = touch/pointer + an EMPTY
keymap) — naming the remote is where describing one starts; the
keys arrive from the other half.
(2) CAPTURE-ASSIGN — the `keys:` virtual screen (v0.55's diagnostic
log) grew THE REMOTE: the profile's soft_layout rendered in order as
slot tiles (new `kslot` widget — in widgets/ because WIDGETS isn't
defined when core/ loads, the v0.51.1 lesson), blanks included and
faded. The flow is two gestures and no typing: press a key on the
physical remote (it becomes PENDING, named in the hint tile), tap
the slot it belongs to. A slot's sub line is its LEGEND — every raw
key currently routed to it, profile keymap plus this session's
unsaved assignments — and it lights the moment it has one, so the
unlearned buttons are the dark ones. 💾 Save GETs the workspace
config over the same authenticated Studio API the Studio uses,
merges into `remotes.<this device>.keymap` (inheriting the global
keymap once, so saving never silently narrows a profile that had
been riding it), POSTs it back for validate + deploy, and applies
the keys to the LIVE KEYMAP immediately — the next press already
routes. The v0.55 log survives underneath as "Recent keys", its
resolutions re-derived on every assignment.
LOOK: the slot grid had to read as a remote's face, not a noun
list. Slots wear the soft remote's plain-text glyph vocabulary (no
icon font between you and a diagnostic surface); a CUSTOM slot has
no glyph and promotes its own name to key size instead (`noglyph`
class via the widget's wire hook — the chassis always renders some
icon, "•" is its fallback, so the class hides it). Verified by
screenshot, not by assertion alone.
TESTS: smoke-studio §5b's selectors moved from `#soft select` to
the inputs and now set a CUSTOM name (Red → renders "Red/RED",
disabled until a key is captured for it) + §5c (＋ mints rs_90,
appears in the roster, selection restored); smoke-keys grew the
whole assign flow against a route-stubbed config API — described
remote (Red/Green/blank) renders, F7 pending, tap Red → sub F7 +
lit + log healed to "→ Red", Save posts `remotes.default.keymap.F7
= "Red"` with the inherited Escape→back intact, live KEYMAP.F7 is
Red, assignments drained. 14/14 green.
Ceremony: engine + Studio (no yaml) → bat + 🚀 (reseed OFF) +
Studio hard refresh. PARKED, unchanged (his "One day… V2 UX"):
photograph the physical remote and map hotspot areas onto the image.

v0.55.1 — **ROLLBACK #14** (cloud workspace only; G:\ and the live
remotes untouched). Deepest flavor again (~pre-v0.45: queue.js /
keycap.js gone, integration pre-_bind_ws, dist from Jul 24), struck
MID-SESSION between a passing battery and the next command.
Standard recovery: device tar (fresh name restore14.tgz) → stage →
md5 match (37e50854…) → fresh-dir extract → keep node_modules →
swap → 14-marker sweep all green → rebuild (engine byte-identical
to the shipped v0.55: 181,854) → 14/14. Nothing lost, nothing to
redeploy. Count now 14; the mirror ceremony continues to be the
whole disaster plan.

v0.55 — **THE KEY-CAPTURE HELPER** (Suresh: "we need a v1 capture
helper"). A VIRTUAL SCREEN — the queue: pattern — at `keys:`
(core/keycap.js): open it, press keys on whatever remote is paired
to the device, and every arriving event renders as a newest-first
row — raw key · code · keyCode, plus what the CURRENT profile's
keymap resolves it to; UNMAPPED rows wear the accent ring (those
are the codes you're hunting on a new remote). While the screen is
up the engine SWALLOWS all keys (a captured back must not
navigate) — exit is the title-bar ‹ chevron (DOM click, separate
path). Two doors: HOLD the ⓘ info icon 550ms (tap keeps the perf
flash — diagnostic lives where the family never trips on it), or
a nav tile via the Studio's Opens picker ("⌨ Key capture"), for
while a new remote is being learned. Rows cap at 60. smoke-keys
grew the section: swallow-proof (Escape stays), mapped shows
"→ back", F7 rings unmapped, chevron exits. 14/14 green. Flow for
the RS90: pair it → hold ⓘ → press its buttons → read codes →
type them into Remotes & keymaps. Ceremony: bat + 🚀 (no reseed —
engine+studio) + Studio hard refresh.

v0.54 — **OPEN BUTTON VOCABULARY + RELATIVE SEEK + THE SOFT REMOTE
IS YOURS** (Suresh: "dpad left hold and right hold to do RWD and
FFWD" + "we need to be able to edit how the buttons look in the
preview screen"). (1) The logical-button vocabulary is OPEN: act()'s
default case routes ANY bound button through the screen/global
buttons map (shared action grammar); unbound = deliberate no-op.
New remotes mint new names (left_hold/right_hold) with zero engine
edits. (2) {seek: ±N} action: HA's media_seek is absolute-only and
music players have no rewind service — the engine computes live
position (the progress bar's interpolation) and calls media_seek;
clamps [0, duration-1]. music.yaml binds left/right_hold to ∓15s;
tv.yaml to remote REWIND/FAST_FORWARD (androidtv keyevents —
platform probed live). Keymaps grew ","/"." → left/right_hold
(astrion inherits); the Astrion-side KeyMapper long-press mappings
are Suresh's half. (3) SOFT-REMOTE LAYOUT IS PROFILE DATA:
remotes.<id>.soft_layout (rows of logical buttons, null = blank),
edited IN PLACE via ✎ on the preview pane — cells become dropdowns,
＋ row/✕ row/reset, Done (beats the universal-remote integration's
"quirky" dashboard editor by being WYSIWYG where you already are).
Keys resolve by REVERSE keymap lookup from the PREVIEWED profile —
every soft button sends what THAT remote would send; a button the
profile can't emit renders disabled (the soft remote never lies).
HOLD latch shows only when something is holdable. PARKED (his V2
UX): photograph the physical remote and map hotspot areas — a
first-class "mirror the remote" experience; revisit when the RS90
lands. smoke-music §11 (scrub math, clamp, unbound-noop),
smoke-studio §5b (bottom row → mute · blank · menu). 14/14 green.
Ceremony: bat + 🚀 **reseed:true** (system.yaml + views changed) +
Studio hard refresh.

v0.53 — **SIX-POINT ROUND: OPEN FIELDS, SCRATCH RETIRED, SCROLL
PADDING, HOLD LATCH, TRI-STATE DOTS, THE VANISHED CAST** (Suresh's
batch). (1) "Why would we opine on +100? Open the fields up" — the
Music 1º/2º theme rows grew SIZE + WEIGHT (fs-m1/fw-m1, fs-m2/
fw-m2, each following its global unless set); the queue title's
derived +100 is GONE — it rides fw-m1 exactly. (2) SCRATCH
WORKSPACE RETIRED ("no point to it"): pill, manager row, publish
paths, localStorage autosave, normalizeScratch — all excised;
drafts + workspace duplication are the sandbox. Old hakr_scratch
entries are ignored. (3) SCROLL PADDING: navigate() now resets
grid.scrollTop (the grid KEEPS its scroll across innerHTML swaps,
so the previous page's position leaked in — that's the eaten
padding); scroll-padding-top/bottom on #grid makes hero jumps and
focus scrolls honor the gaps. (4) SOFT-REMOTE HOLD LATCH (his
mock): the separate BACK/HOME/PWR/MENU HOLD buttons are gone —
one ✚ HOLD latch below the keypad; latched = accent, holdable
keys wash pale (accent/25), next holdable press sends the hold
variant and releases. Mute stays in the ancillary row. (5) TAB
DOTS TRI-STATE: Inputs partially answered = LIGHTER green
(bg-ok/45, "a valid setting"), all = full green, none = hollow;
State finally gets a dot (lit when rules exist) beside its count.
(6) THE VANISHED CAST: yaml-era activities (his Listen to Music)
wire entities straight into $context — the dot derived from
context but the cast block only rendered cast/extra_devices, so
the entity was INVISIBLE. Legacy direct rows now render (role
chips + ⊞ pre-wire + ✕ unwires the roles). Battery reworked
(scratch section folded into the fast-path test; theme section
rides the exact fields), 14/14 green. Ceremony: bat + 🚀 (no
reseed — engine+studio only) + Studio hard refresh.

v0.52.1 — **TYPE HONORS THE THEME + MUSIC FACES** (Suresh: "I set
the Theme Primary and Secondary font, but the Play Queue doesn't
honor it… the main title needs ellipsis — not wrapping… at some
point we will want Primary and Secondary font for the music player
separately"). Diagnosed in-harness first: font FACE was already
inheriting — what didn't ride the theme was hardcoded WEIGHT/SIZE.
(1) Queue title: font-weight 700 → calc(var(--fw-1) + 100) (bolder
than the house, never a fixed number); (2) Now-Playing hero: .npt
17px/600 → fs-1+2px / fw-1; .npa/.npb → --font-2/--fs-2±1/--fw-2
(all defaults pixel-identical). (3) ELLIPSIS: qrow title AND
artist·album line get nowrap/hidden/ellipsis (.tile.row .txt
already min-width:0). (4) "At some point" = NOW (settings-not-
hardcoding): theme keys font-m1/font-m2 (--font-m1/--font-m2,
default = the global pair) restyle just the MUSIC PLAYER — screens
declare font_scope: music (music.yaml, music_library.yaml, the
queue's virtual screen) and navigate() toggles #app.scr-music;
compiler passes font_scope through (build_config.py); Studio stock
+ a v0.52.1 healer stamp it onto deployed stock copies; ThemeEditor
grew Music 1º/2º face inputs. smoke-music section 10 proves:
queue rides Courier@fw400 (300+100 — calc-in-font-weight works),
hero rides fw300, hub stays Georgia, ellipsis computed. 14/14
green. Ceremony: bat + 🚀 **reseed:true** (yaml views changed) +
Studio hard refresh.

v0.52 — **THE ICON PICKER** (Suresh: "everywhere we ask for an
icon we could have a search pane that showed the icon and its
name?"). Yes — and now it does. New IconPicker.svelte combobox
replaces the bare icon Input EVERYWHERE the Studio asks for an
icon: ActivityCard identity, TileRow, DevicesEditor, AppsEditor.
Type to search the FULL Material Symbols catalog (3,896 names,
bundled offline from the material-symbols npm package →
iconNames.js, +62KB in the built studio); every hit renders its
GLYPH beside its name in a 2-col dropdown; picking writes
`material:<name>`; free text (emoji, custom strings) stays legal
verbatim; a live preview chip shows the current icon. Material
Symbols font link added to studio-src/index.html (the engine
already ships it). The web gallery, for browsing outside the
Studio: fonts.google.com/icons (set to Material Symbols
Outlined — the ligature set the engine's `material:` grammar
uses). BUG EN ROUTE: ActivityCard used <IconPicker> without
importing it → "IconPicker is not defined" blanked the whole
card (smoke-studio's New-Activity input and smoke-devices'
cast picker both vanished — one missing import, two suite
failures). 14/14 green. Studio-only: ceremony = bat + Studio
hard refresh (no 🚀, no reseed).

v0.51.1 — **QUEUE ROWS, HIS MOCK** (Suresh: "we have more room
to play with"). Rows rebuilt as a dedicated qrow WIDGET: 56px
art left · bold title · "artist · album" joined on line two ·
▶ HARD RIGHT. And his "highlight stays with the old top row"
had a real cause: the ▶ was BAKED into the label at build time
and the rows carried no entity, so the player's track changes
never reached the screen — qrow rows now carry the player
entity (subscribes it) and isOn is the LIVE playing test
(title+artist, beating duplicate titles), so the mark and the
accent highlight ride renderStates with no rebuild; the screen
also opens FOCUSED on the playing row. Album added to both
adapter maps. GOTCHA: WIDGETS isn't defined when core/ files
load — qrow lives in widgets/qrow.js after registry.js.
smoke-music: qRows asserts live mark/sub/focus; new qLive
proves the ▶ MOVES on a track change without rebuild. 14/14
green. Ceremony: bat (dist only — engine) + 🚀.

v0.51 — **THE QUEUE + PULL RETIRED + THE FOLDER FLASH** (Suresh's
three). (1) Pull Music Here DITCHED ("too confusing") — tile
removed from music_library.yaml + STOCK, and a healer strips it
from deployed stock copies; the bar's band 1 now disappears
entirely in flat mode. (2) FOLDER FLASH fixed: on a root switch
whose L1 wasn't cached yet, the generator stamped the raw tree
roots into band 1 for the fetch's duration ("a row of folders
pops onto the top row… only on first click") — the L1-missing
branch now keeps the PREVIOUS bar; the real shape decides once
L1 lands. (3) THE QUEUE — his spec verbatim: queue icon beside
shuffle/repeat, full-row tiles, tap jumps to that song. The
queue is NOT in HA's standard media_player contract, so
core/queue.js speaks per-platform services via ADAPTER PROBING
(no name-guessing: first adapter whose call ANSWERS owns the
entity, cached; none answer → "Queue not available"). Probed
LIVE on his HA: Music Assistant = mass_queue.get_queue_items
{entity, limit_before/after} → items, jump = mass_queue.
play_queue_item {entity, queue_item_id} (the `entity`-not-
target 400 found empirically); Sonos = sonos.get_queue @entity
→ [{media_title/artist/album}], jump = sonos.play_queue
{queue_position} by list order (his deck amp's real 30-track
queue was the probe). New callServiceResp (return_response over
the socket), virtual queue:<mp> screen (1-col rows, ▶ marks the
playing title, artist on the sub line via new preset
sub_label), refetched fresh on every open. smoke-music: qOpen/
qRows/qJump (probe fall-through MA→Sonos, ▶ mark, positional
jump) + pull assertions retired. 14/14 green. Ceremony: bat
(dist + studio) + 🚀.

v0.50.3 — **FAVORITES PROMOTED + "DOORWAY" RETIRED** (Suresh's
three). (1) Pull Music Here re-explained (answer): music_
assistant.transfer_queue auto_play — yanks the playing MA queue
from wherever it is onto THIS room's player mid-song. (2)
FAVORITES PROMOTION: probed his live MA browse tree — NO
favorites filter exists in the HA contract (MA's "Show
Favorites" is an app-side toggle). But the integration's
sensors (sensor.harmonium_music_<cat>, hourly favorite=True)
carry exactly that — so a FLAT tree with populated sensors now
synthesizes the Sonos silhouette: ⭐ Favorites (sensor-fed
grid, THE DEFAULT root) + Music Library (the real tree as
chips). Sensor items play via standard media_player.play_media
(uri/media_type); sensors auto-subscribe on browse screens;
sensors empty → plain flat chips, non-MA players untouched.
BUG found mid-build: the tree-root defaulting stomped a sticky
__synth selection before the flat branch ran (Music Library
root un-clickable) — generator restructured: synthetic mode
re-enters FIRST, shared synth() renderer, common grid tail.
(3) "＋ Add doorway" → "＋ Add nav" (his call: no invented
vocabulary) — HubEditor buttons, empty-state copy ("a nav card
opens another page (or another workspace)"), WorkspaceMap
counts, TileRow hints; "New doorway" seed label → "New nav".
smoke-music grew favPromo/favPlay/favLib (default Favorites,
sensor grid count, standard play @cast player, root flip to the
real tree with cached chips). 14/14 green. Ceremony: bat (dist
+ studio) + 🚀.

v0.50.2 — **ONE LOOK FOR EVERY TREE + DOORWAYS BETWEEN WORLDS**
(Suresh's two). (1) WHY SONOS AND MA LOOKED DIFFERENT: the band
algorithm was honest about tree SHAPES — Sonos nests two levels
(Favorites/Music Library → categories), MA's top level IS the
categories, so MA got big folder tiles where chips belong. His
verdict ("Sonos is better") is now the rule: a FLAT tree (top
level all pure directories whose children are items) renders its
top level AS THE CHIPS — no roots row (the bar keeps just the
section's own tiles, e.g. Pull); chip select/CH/swipe route to
root selection in flat mode. Sonos unchanged. SCROLLBARS: the
fat native bar was a Chrome rule — ::-webkit-scrollbar styling
is IGNORED once scrollbar-width is set; both strips now use the
standard scrollbar-width:thin + scrollbar-color pair + 6px
breathing room below the tiles. DECK'S REDUNDANT TITLE: v0.50.2
healer drops the 118px banner from stock browse-era
music_library copies (Save & Deploy deck applies). (2) "WHERE
DID THE NAV TILES GO?" — nowhere: they're the Devices section's
"＋ Add doorway" button. What was truly missing: doorways BETWEEN
WORKSPACES. New `ws:<id>` nav target — engine navigate() leaves
for /local/harmonium/<id>/index.html (canonical peek, nothing
pinned; Studio preview flashes instead of desyncing), and the
doorway's "Opens" picker now lists other workspaces ("⇱ Deck
(workspace)"). Porch⇄Deck: add a doorway each way, pick the
workspace, Save & Deploy both. smoke-music grew flatTree/
flatChip (MA shape: roots row gone, Pull stays, chips drive the
grid). 14/14 green. Ceremony: bat (dist + studio) + 🚀.

v0.50.1 — **THE STALE SEED + ROLLBACK #13** (Suresh: "my music
assistant instance (in the porch) shows the old playlist
version"). ROOT CAUSE CHAIN: the porch is MAIN, whose runtime
comes from the integration STORE via harmonium.reseed — and
(a) every 🚀 this window ran reseed:false, (b) worse, dist/
config.json was NEVER part of the mirror ceremony, so G:\ held
an ANCIENT repo build and the bat (which robocopies dist
index.html + config.json) had been pushing it all along — the
one reseed that ran integrated STALE as fresh and adopted it as
base_main. FIX: pushed the true v0.50 build straight to
www/harmonium/config.json (ha_write_file) + harmonium.reseed —
merge3 gave music_library to the repo (store's old block vs a
base that lacked the key → conflict → repo wins); deployed main
shrank by exactly the sensor-block delta. CEREMONY AMENDED:
dist/config.json now mirrors to G:\ with every release — a yaml
round is bat + 🚀(reseed:true). ROLLBACK #13 mid-diagnosis
(deepest yet — tree fell to pre-v0.46; the "missing
workspaces.py" was its first symptom): standard G:\ restore
(restore13.tgz, hash 9c861a7d…, 9-marker sweep) then engine
rebuilt; bands re-verified green. Rollbacks are accelerating —
fresh-session offer stands; PROJECT.md + G:\ carry everything.

v0.50 — **THREE-BAND LIBRARY** (Suresh's mock: "90% of the time,
the user will want Favorites >> Something… top section fixed and
as vertically tight as possible"). The page-per-level crawl
becomes BANDS: band 1 (fixed, tight) = the curated tree top
(Favorites, Music Library…) PLUS the section's other tiles (Pull
Music Here moves into the bar — render.js diverts a browse
section's siblings to S.browse.barTiles); band 2 = the selected
root's children AS A CHIP STRIP — only when they are ALL pure
directories (can_expand && !can_play), which is what makes it
service-agnostic: Sonos gets Playlists/Albums/Tracks chips, a
Music-Assistant-shaped tree (root children ARE categories,
their children are items) skips the strip naturally; grid =
items only, AUTO-DESCENDED on open (root → first/default root →
first category — `default_root: <title>` tile setting for
taste), expandables drill IN PLACE (‹ up tile), playables play,
playable-only roots play straight from the band. NAVIGATION per
his three: chips strip horizontal-scrolls with a thin bar ·
CH▲▼ steps categories with wrap (before heroCycle in input.js)
· horizontal SWIPE on the grid steps too (pointer delta, 70px).
NEW #brbar between banner and grid (browseBar() builds bands,
selections sticky per session, player change resets);
music_library.yaml + STOCK drop the 118px banner (bands want
the pixels); browse item tiles go art-forward (58px, centered
column); FOUND IN TESTING: the full-height trailing ▶ zone ate
60% of a narrow 3-col tile — center taps PLAYED instead of
drilling; .brw tiles shrink it to a 28px corner badge.
smoke-music rewritten as the band flow (auto-descent 1-request
chain, curated roots, Pull in bar not grid, chip tap, CH step,
swipe wrap, play+pop, cached resume with ZERO requests, mixed
root hides chips, deep drill). 14/14 green. Ceremony: bat (dist
+ studio) + 🚀 — no restart.

v0.49.1 — **BROWSE FIELD FIXES + ROLLBACK #12** (Suresh's
screenshots: root full of Camera/TTS junk, tapping Favorites or
Music Library went nowhere, tiles showing "N"). INCIDENT FIRST:
container rolled back mid-round (tests/, studio-src/, yaml/,
browse.js gone — partial old snapshot); standard recovery from
G:\ (restore12.tgz, fresh-named, hash-verified c69e67f3…,
node_modules preserved, markers checked) — the mirror ceremony
pays for itself again. THE BUGS: (1) EMPTY ID ≠ ROOT — Sonos's
Favorites/Music Library root children carry media_content_id ""
which browseFetch treated as "no node → root", so the tap
re-served the cached root behind an ‹ up tile. Key is now
(type:id), null-node-only means root, and the request always
sends id ("" included) + type when a node is named. (2) ROOT
CURATION AS DATA (his ruling: "We only care about Favorites and
Music Library (but this should be a setting not hard coded)"):
HA's media-source:// plumbing (camera, TTS, image uploads,
radio browser) is the SERVER's junk drawer, not the player's
library — hidden at the root BY DEFAULT, identified by id
prefix (a fact, not a name); tile settings `media_sources:
true` keeps it, `include: [titles]` narrows further (advisory —
no match on another player's vocabulary → full list, never an
empty page). Both documented in music_library.yaml. (3) THE "N"
— brand wordmark thumbnails ("SONOS") were center-cropped by
object-fit:cover to their middle letter; browse thumbs now
carry icontain → object-fit:contain on a light chip.
smoke-music grew emptyIdReq/emptyIdDrill (Favorites with id ""
drills to its OWN children) + media-source curation assert
(Camera/TTS absent). 14/14 green. Ceremony: bat + 🚀 (engine
only — no restart).

v0.49 — **THE STANDARD LIBRARY** (Suresh's course correction:
"We mustn't be hardcoded to ma. There are many music services out
there — but all should cough up those lists"). The music library
now speaks HA's UNIVERSAL contract: `media_player/browse_media`
serves whatever tree the CAST PLAYER has (Sonos favorites, Music
Assistant, Plex, Squeezebox…), playback is the equally standard
`media_player.play_media`. ENGINE: new core/browse.js —
browseFetch over the live socket (send/pending callback), nodes
cached per (player, node), thumbnails signed via auth/sign_path
exactly like the HA frontend (absolute URLs pass through, 200-
child cap); `type: browse` generator in expandTile — categories
(Playlists/Albums/Artists…) ARE the tree's top level (his "how
do I switch" answered by design), ‹ up tile when deep, expand
drills, playables play, both-capable nodes get a ▶ trailing
zone; player change resets the trail; preset widget browse taps
navigate WITHIN the drawer (no pop), play still pops (one-shot).
music_library.yaml: sections collapse to Pull-Music-Here (MA
nicety, kept) + one browse tile; the MA category sensors still
publish but nothing stock depends on them. STUDIO: STOCK_MUSIC_
LIBRARY reshaped to match + v0.49 MIGRATION healer (stock
music_library still on sensor.harmonium_music_* upgrades;
custom copies untouched); v0.48.3's MA-twin seeder rule
REVERTED before it ever deployed — wrong layer, the native
player is the RIGHT claim under the standard contract (deck
needs NO dropdown fix now — his existing sonos_deck_amp device
just works). smoke-music rewritten around the browse contract
(mocked browse_media responses: root categories render, drill-
in doesn't pop, play_media@cast-player, resume + up, pull
intact, controller CH still track-skip). INCIDENT (#12-adjacent,
no rollback): a brace-blind python splice ate ~10k of
state.svelte.js (ensureStockControllers, starterConfig);
restored from G:\ via FRESH-NAMED tarball (the staging cache
served a stale Jul-21 relic — hazard confirmed again), edits
re-applied brace-matched. 14/14 green. Ceremony: bat + 🚀 (+ the
pending v0.48.3 restart — .py unchanged in v0.49 itself).

v0.48.3 — **ONE ADDRESS GRAMMAR + THE MA TWIN** (Suresh's three;
"I hate this" round). (1) CANONICAL URLS EVERYWHERE (his ruling:
"it should be workspacename/index.html everywhere"): main now
gets its own entry stub (/local/harmonium/main/index.html —
deploy() writes stubs for ALL workspaces incl. main; setup
ensures it immediately), the workspaces API path field says
main/ too, Studio address displays drop the main special-case,
and the engine's canonical rewrite is now UNIVERSAL: whatever
door you enter (bare path, stub, hidden pin), the bar ends at
<ws>/index.html — main included, never on fallback. His "bare
pulls up deck" was the hidden PIN from earlier provisioning —
now the bar says deck/index.html so the pin is visible; bare
stays only as the kiosk entry. (2) THE SILENT PLAYLIST, ACT II:
his Listen-to-Music activity existed and the healer had run —
but the seeder claimed media_player.sonos_deck_amp (NATIVE
Sonos) as the player, and music_assistant.* only accepts MA's
OWN players (media_player.ma_sonos_deck_amp sat right there).
SEEDER RULE: when the claimed player has an MA twin
(media_player.ma_<obj>; platform music_assistant when the
registry confirms), the twin takes the PLAYBACK claim, the
native keeps power/volume/source. Existing device fix is one
dropdown in the library. (3) ACCENT, TAKE TWO ("looks blah…
simply color the icon circle background"): v0.48.2's icon/sub
tint reverted; the accent now paints the ICON CIRCLE (identity,
not state), icon flips to bg ink for contrast; .tacc.row beats
the controls.css default circle (verified headless: porch
orange circle, dark ink). 14/14 green; workspace pin/peek
semantics proven intact. Ceremony: bat + RESTART (.py) + 🚀.

v0.48.2 — **ACCENT EARNS ITS KEEP + PROMOTE EVERYWHERE** (Suresh's
five). (1) POWER ROLE NOT INVALIDATED — layering clarified in its
effect copy: the role is the DEVICE-power channel (physical
short-press power via control-target policy + $context.power
tiles); the on-screen ⏻ ends/starts the ACTIVITY and needs no
wiring; hold-power stays the sledgehammer. No "Activity Off"
dropdown option — the activity path is the tap's job, not a
wiring choice. (2) TWO TABS TWO WORKSPACES (answer, no code):
bare /local/harmonium/ = the pinned/main world;
/local/harmonium/<ws>/index.html = that workspace as a PEEK
(pin=0 — no localStorage), so tabs coexist; #ws=X&pin=1 re-pins
a browser deliberately. (3) ACCENT NOW DOES SOMETHING: the
activity's accent color tints its tile's ON state (icon + status
line) — generator passes a.color, makeTile sets --tacc, grid.css
falls back to theme --on/--accent when unset (verified: porch
orange #d97b3a renders on the lit tile). (4) ⊞ PRE-WIRE on
directly-cast rows: mints a pre-wired device FROM the entity
(same seeder as the picker — siblings + claims), swaps it into
the cast in place of the bare entity, no library round-trip.
(5) THE SILENT PLAYLIST: deck's music page was a PRE-PURIFICATION
copy still hard-bound to the BASEMENT Sonos (baked context) —
new PURITY HEALER strips baked context from stock media surfaces
(tv/music/apps/music_library/media; custom copies keep theirs),
and firePreset now SAYS "No player wired — start an activity
that casts one" instead of shrugging when $context doesn't
resolve. Real fix on deck: a Listen-to-Music activity casting
the deck Sonos — activity context is what feeds the page.
14/14 green. Ceremony: bat (dist + studio) + 🚀 — no restart.

v0.48.1 — **TWO TRUTHS RECONCILED + BROWSER CHROME** (Suresh's
six, after the live-verified v0.48 deploy — his screenshots:
projector entities all off, tile "On"). (1+2) POWER MEANS THE
ACTIVITY: the on-screen button bar's power (widgets/buttons.js)
now toggles the ACTIVITY — end with the standard confirm when
running, full start sequence when not — so select and devices
move TOGETHER; physical short-press power keeps the v2
control-target policy (device power stays a deliberate physical
gesture). BROWSER CHROME: app-level ⌂ Home and ⏻ End join the
TITLE BAR (touch clients only — physical-key remotes keep a
clean bar; never crowds the grid), End rides endCurrentActivity's
confirm. (6) IMPLIED STATE — the flakiness killer: an activity
with NO authored state rule now derives truth LIVE from its
primary cast device's media_player (on/playing/paused/buffering/
idle), so manually powering a device off can never strand an ON
tile behind a stale select; never_off devices (Fire TV) are
exempt by their own trait — select stays truth there — and an
authored rule always wins. Witness entities auto-subscribe;
tap-to-open's select self-heal now works on implied truth too.
Studio State tab says it: mode "none" label becomes "Implied —
primary device's player (default)" + explanatory hint. (3) EYE
CALM: active builder tab gets the size bump + bg-tile lift;
directly-cast entity rows punched down to bg + 1px line border.
(4) The CONTROLLER·STOCK switch wasn't dead — it never pushed
the preview (toggleDevices/toggleTile now schedulePreview) and
its copy now says what it does (the cast's Devices section on
the controller). (5) PROMOTE A CLAIM: a role wired to a raw
entity that lives in a cast device's bundle grows "↥ save claim
to <device>" — the library learns the wiring (his adb-as-
volume_level case), every future cast fills the role itself.
smoke-v2 grew impliedState (stale select ignored, never_off
exempt, witness subscribed) + powerActivity (confirm-then-end
via room all_off; bar chrome visible). 14/14 green. Ceremony:
bat (dist + studio) + 🚀 — no restart (no .py).

v0.48 — **THE WORKSPACE BUG + THE TAP IS THE INTENT** (Suresh's
seven-point report). ROOT CAUSE of BOTH the ▶ Test 500 AND the
"tapped Watch Projector, nothing happened" flakiness — one bug:
the generated Start's `harmonium.set_activity` step carried no
`workspace`, the schema defaulted it to main, the deck activity
wasn't there, the script died at pos 1 (so no wake, no select
flip, no player). TWO-LAYER FIX (integration, .py — needs bat +
restart): (1) `_bind_ws` — handle_run deep-copies the sequence
and stamps its OWN workspace onto any nested harmonium.set_
activity/run step that doesn't name one (the remote injects ws
at its socket; HA-side script steps never pass through that
socket — recursion covers if/then/choose/repeat); explicit
workspace keys are respected, the STORED config is never
mutated (duplication stays clean). (2) set_activity's workspace
is now optional with NO default: unnamed → FIND THE OWNER
across all workspaces (unique → use it; ambiguous → error
naming them; user automations needn't know workspaces exist).
ENGINE — THE TAP IS THE INTENT (his ruling: "I should never see
that page. It should always fill in. The controller will show
that its off"): startActivity sets S.pendingActivity; current
ActivityId falls back to it whenever the select doesn't confirm
an activity — the player renders AS the tapped activity from
the tap onward (tiles show the devices' true off state), even
while the select lags or the start FAILS. Tile truth
(isActivityActive) untouched — select/device rules only; the
select confirming any activity outranks pending; next tap
overwrites. The empty-page hint now only greets sidebar
wanderers. STUDIO ROUND: (1) "loose" RETIRED (pre-wired is a
convenience, not a requirement — a bare entity is simply "cast
this entity"; castLoose→castDirect). (2) PREVIEW TOGGLE in the
tab bar (Controller · Room page) — flip the impersonated
preview to the room page without closing the card; controller
stays the default each open. (3) Cast picker moved BELOW the
directly-cast entity rows (input sits where new members land).
(4) Tabs FIRST-CLASS: 13.5px semibold ink-2 idle, bold + 3px
accent bar active, hover underline. (5) Alignment: Navigate-to
select + ＋ button restyled to the Select norm (h-38/rounded-4/
bg-field), row items-end→items-start (one-sided hint no longer
shoves its neighbour). smoke-v2 grew pendingFill (start fails →
player filled, no hint, select still wins); 14/14 green.

v0.47.8 — **"PRE-WIRED DEVICES" + SPOTLIGHT-PER-WORKSPACE**
(Suresh's two). (1) The library's devices are **Pre-wired
Devices** ("Physical" said what they correspond to, not what they
ARE; of his five candidates Pre-Wired wins: Compound is false for
the soundbar, Templated wrong — instances not templates,
Configured/Extended say nothing; Pre-Wired names the value — the
wiring knowledge arrives attached, claims ARE pre-answered wiring
questions, cast one and the roles fill themselves). Nav +
CenterPane header + builder footer + library intro copy reworded
around the definition. (2) SPOTLIGHT clarified: one per room PER
WORKSPACE — the select is a shared HA entity; remotes are windows
onto a workspace, two remotes pinning the same workspace SHARE the
spotlight (deliberate — one reality per room, the Harmony-hub
coherence); independent spotlights in one physical room = two
workspaces (works today, duplicated definitions the cost).
Studio-only ceremony: bat + hard refresh.

v0.47.7 — **PRIMARY-DEVICE STATE + THE TWO-TRUTHS ANSWER**
(Suresh's three). (1) NOT A BUG: the deck tile said ON because the
activity WAS on (his test taps started it, nothing ended it); the
controller's "Off" was the projector DEVICE's power state on Now
Playing. Activity state ≠ device state, both honest. Deck select
flipped off live via the fixed service (workspace routing ✓).
(2) "⚙ From primary device" button on the State tab: one click
writes state = primary's media_player claim in any_state
[on, playing, paused, buffering, idle] — right for devices that
genuinely power off (projector), and the tooltip says why it's
NOT the default (the Fire TV never powers off — watch_firetv
derives from display + input instead; select stays default).
(3) MULTI-ON answered: the SELECT is single-spotlight PER ROOM —
it's what this remote's keys/volume/context drive, not a claim
that only one thing is happening. Device-rule states are
independent of the select: music's any_state rules and
watch_firetv's display rules can BOTH be true and both tiles show
ON; the select just decides who owns the buttons. Rooms are
concurrent (one select each). Music-with-TV works today: both lit
when both derive state from devices; tap between them to move the
spotlight; confirm_switch guards the flip. Studio-only ceremony:
bat + hard refresh.

v0.47.6 — **NIGGLES ROUND: OFF, SET-ACTIVITY ROW, SERVICE PICKER**
(Suresh's three). (1) THE 500: ▶ Test failed with "workspace 'main'
has no activity 'off'" (traceback pulled live) — harmonium.
set_activity's docstring always promised "off ends the room" but
the activity lookup rejected it (off stopped being an activity in
v0.28). INTEGRATION FIX (.py — needs HA restart!): aid=="off" flips
the workspace's routing select(s) to off — optional `room` field
targets one hub, omitted = every select in the workspace (All-Off
semantics); schema gains vol.Optional("room"). Fixes ▶ Test on
all_off AND every generated Stop. (2) SET ACTIVITY is a first-class
sequence row: dropdown of the workspace's activities + "off — end
the room" — nobody hand-types harmonium.set_activity or ids again;
renames were ALWAYS safe (renameActivity's walkSetActivity updates
the steps) and the row's hint now says so; Target-entity mystery
answered: set_activity takes data only, no target — and the
Call-service row's Target label now reads "optional — some services
take data only". (3) SERVICE PICKER: /api/services loaded once
(app.services; free-text fallback), new ServicePicker combobox
(fixed-position dropdown, searches id + friendly name — "open
cover" finds cover.open_cover) replaces the raw service Input.
14/14 green. Ceremony: .py + studio (+ dist rebuilt) — bat, HA
RESTART (integration changed!), 🚀 script reseed ON, hard refresh.

v0.47.5 — **MUSIC GETS THE SAME TREATMENT** (Suresh: "we need it
fixed for music and anything else too"). Sweep result: library-
controller → content-screen refs were tv→apps (v0.47.4) and
music→music_library — nothing else. (1) music_library joins the
LIBRARY (library:true → config.controllers, drawer flag intact) —
the music player's library button now works in every workspace;
main is down to 3 content views (porch/comfort/overview).
(2) PURIFIED: music.yaml + music_library.yaml house context blocks
removed (the calling activity wires media_player — the music
activity's own context already does); the hardcoded
`activity: music` stamps in the drawer's preset tiles dropped
(house refs in a library view — reached from the player the
activity is active and $context resolves; a cold press no-ops
honestly). Category sensors (sensor.harmonium_music_*) stay:
integration-published, product-level. (3) STOCK_MUSIC_LIBRARY
mirror planted by ensureStockControllers when missing — existing
workspaces heal on load + Save & Deploy, same as the apps drawer.
Engine untouched (v0.47.4's canonicalization already resolves
stale navigate: music_library). smoke-music's entitiesFor address
updated. 14/14 green. NOTE: stale STOCK COPIES in existing
workspaces (deck's music controller still carries sonos context
defaults from its creation-time copy) are left alone — they work,
they're just house-flavored; delete the controller copy or
recreate the workspace for the pure one. Ceremony: config +
studio — bat, 🚀 script reseed ON, hard refresh, open each
workspace + Save & Deploy to plant the drawers.

v0.47.4 — **THE DRAWER JOINS THE LIBRARY** (Suresh: "The apps
drawer doesn't work - other buttons do!" — on deck). ROOT CAUSE:
the apps drawer was a CONTENT SCREEN (screens.apps, main only);
the player — a library controller shipped into every workspace —
referenced it, so its apps button dead-ended everywhere but main.
The keys worked because they're generated INTO the player. FIXES:
(1) views/apps.yaml gains library:true → compiles into
config.controllers (drawer flag + parent controller:tv intact),
travels with the player; main now 4 views. (2) ENGINE navigate()
canonicalizes a bare ref to "controller:<id>" when the screen is
missing but the library holds it — heals every stale
{navigate: apps} in deployed configs and menu_hold bindings
without touching them. (3) STOCK_APPS_DRAWER in the studio
(exact mirror of the compiled pure drawer) planted by
ensureStockControllers when absent — now also run in the load/
normalize chains, so EXISTING workspaces (deck) heal on next
Studio load + Save & Deploy. Battery shows tap→controller:apps,
back→controller:tv; 14/14 green. KNOWN SIBLING (parked): the
music controller's music_library drawer has the same
content-screen problem in non-main workspaces — same treatment
when music matters there. Ceremony: engine + config + studio —
bat, 🚀 script WITH reseed ON, hard refresh, then open deck in
Studio + Save & Deploy (plants the drawer there).

v0.47.3 — **SLIM THEMED SCROLLBAR** (Suresh: "Dont remember seeing
those scrollbars before" — they were ALWAYS there in desktop
browsers: #grid overflow-y:auto + zero scrollbar styling = stock
Windows bar; the kiosk's Android overlay bar auto-hides so it was
never seen on-device). 6px thumb on --tile-hi, transparent track,
Firefox scrollbar-width:thin. Engine-only; rides the next deploy.

v0.47.2 — **THE SELECT FOLLOWS THE ROOM** (Suresh's deck
split-brain, diagnosed live off his HA: rename New Room→Deck; the
page id followed (home→deck), the integration minted
select.…_deck_deck_activity and his tap ACTIVATED it (proving the
v0.47 startless fix works) — but global.activity_select still
named the OLD minted select (…_deck_home_activity, off, stale
options): the integration wrote truth to one select while the
remote read the other. ROOT CAUSE: the select's entity id EMBEDS
the room id inside a string — renameScreen's KEYS walk can't see
it. FIXES: (1) renameScreen rewrites the "_<oldId>_activity"
suffix on global.activity_select + screens' activity_state;
(2) normalizeSelect healer re-mints an activity_select naming a
nonexistent room when the repair is unambiguous (exactly one room
hub; mint pattern select.harmonium_[<ws>_]<room>_activity).
Immediate user fix for the already-split deck workspace: Code tab
activity_select → …deck_deck_activity, Save & Deploy (or just
reload after this ships — the healer repairs on load + next
save). Conceptual answer logged: controllers are PAGES — reachable
any time, filled in by the active activity; the activity tile does
activate+navigate. 14/14 green. Ceremony: studio-only — bat +
hard refresh (or script.harmonium_deploy_remotes, reseed off).

v0.47.1 — **ONE ADDRESS + THE EMPTY PAGE SPEAKS** (Suresh: "mixing
all types of different url syntaxes, blank controller" — reproduced
headless via the real stub before fixing). (1) CANONICAL ADDRESS:
a peeked workspace rewrites the bar to its dedicated URL
(<ws>/index.html) after config load — enter, refresh, share: always
the same address (refresh re-enters through the v0.38 stub; guard:
only when that ws actually loaded, never on fallback-to-main). The
Studio header chip (App.svelte — the missed third link) + remaining
copy now all say <ws>/index.html. Bare /local/harmonium/<ws> stays
a 403 FOREVER: HA core's static handler owns /local and serves no
directory index — not fixable from our side; the canonical URL is
the answer. (2) EMPTY-PAGE HINT (engine): a page with nothing to
render says why — controller: "No activity is active — start one
from its room page"; hub: "Nothing here yet — add activities or
tiles in the Studio, then Save & Deploy". FIELD NOTE: the deployed
deck workspace really has 0 activities (verified config.deck.json)
— his Watch Projector is an unsaved draft or another workspace;
the blank was honest, now it's articulate. 14/14 green. Ceremony:
engine + studio — bat, cache-clear, load_start_url, hard refresh.

v0.47 — **FIELD-TEST ROUND** (Suresh's five-point report from the
deck build-out). (1) STARTLESS ACTIVITIES ACTIVATE: startActivity
without a start action now calls harmonium.set_activity directly —
the activity becomes ACTIVE (display state + context) and the pure
player renders; orchestration is opt-in, not a prerequisite (was:
tap → nothing → select stayed off → "Watch Projector says off" +
blank controller body). (2) DEDICATED URLS were already real
(v0.38 stubs: www/harmonium/<ws>/index.html redirects into PEEK —
hash survives refresh, the address IS the workspace) — but the
Studio's links omitted index.html and HA 403s bare directories:
WorkspacesEditor + WorkspaceMap links/copy now say
/local/harmonium/<id>/index.html. (3) SETUP + DEVICES ARE ONE TAB
(Suresh: "It defaults to devices and then I tab (back) to setup"):
kind + Navigate-to + controller block + the cast in one Setup tab,
merged completion dot (screen set AND cast non-empty), builder
opens there. (4) INPUTS UN-GATED: input targets = every cast
device with a source_select/media_player claim PLUS loose
media_player entities — the LIVE source_list no longer gates the
question (a powered-off device hides its list; his projector +
Sonos were invisible); options harvested when present, "type a
source…" always offered; generator resolves loose entity keys.
14/14 suites green. Ceremony: engine + studio — bat, cache-clear,
load_start_url, Studio hard refresh (config unchanged, no reseed).

v0.46.3 — **THE COMMANDS CHANNEL IS PLUMBING** (Suresh's preview
screenshot: "Hisense Projector ADB · Off" rendered as a device
tile). The cast generator now SKIPS the entity wired to the
commands channel (same spirit as the remote.* skip) unless it also
plays media (Fire TV: one entity does both — stays) or
device_options[ent].tile === true forces it visible. Engine-only;
14/14 green. FIELD ANSWERS logged: workspace remote URL is
index.html#ws=<id> (one-time sticky pin; &pin=0 peeks) — /local/
harmonium/<id> 403s, it's not a path; blank workspaces inherit the
PHYSICAL-DEVICE LIBRARY by design (house-wide facts, workspaces
are remotes into the same house) — deployed config.deck.json
verified clean (activities {}, pure player, no TV Power) so the
projector-cast + TV Power preview was a STALE PRE-RECREATION
DRAFT (hard refresh clears); a simple single-entity device does
NOT need a library entry — loose is legitimate; the library earns
its place via reuse across activities + traits + multi-entity
claims. Ceremony: engine only — bat + Astrion cache-clear +
load_start_url.

v0.46.2 — **"PHYSICAL DEVICES" + ROLLBACK #11**. The library's UI
name is "Physical Devices" (Suresh's ask; "Compound" rejected — the
soundbar isn't compound, "physical" is true for every entry and
names the exact distinction from HA's per-integration fragments).
Nav slice + CenterPane header + builder footer link; config key
stays `devices`. ROLLBACK #11 mid-edit (tree to Jul 23/24 —
dialects.yaml vanished, state.svelte.js reverted; caught by a
failed patch assertion, NOT by markers — grep before trusting):
restored from G:\ (restore11.tgz), markers verified, patch
re-applied to the restored tree, smoke-devices navClick updated
for the new label. 14/14 suites green. Studio-only ceremony: bat +
Studio hard refresh.

v0.46.1 — **THE PLAYER PURIFIED + PREVIEW IMPERSONATION** (Suresh's
screenshots: preview showed Porch devices + TV Power under a
projector activity; Commands greyed as "not used"). Three fixes,
one root cause — the collapse made tv.yaml THE player but it still
carried Porch furniture: (1) tv.yaml + the apps drawer are PURE
$context now (house default context blocks REMOVED; the hardcoded
TV Power script tile moved out — re-add on a room page if wanted).
With no activity active the player honestly renders almost nothing.
(2) Which is why PREVIEW IMPERSONATION ships with it: while an
activity card is open, the Studio tells the preview to render AS
that activity (engine: harmonium_preview_activity message →
S.pvActivity, preview-only, wins over the live select;
currentActivityId guard) and parks it on the activity's landing
surface — what you edit is what you see: YOUR cast, YOUR dialect's
keys, YOUR apps. (3) CONSUMES-SCAN taught about generators: a
`type: keys` tile consumes `commands` implicitly (no literal
$context string to find) — the Roles strip and dim-state now tell
the truth. smoke-studio's liveEdit section updated (pure player
needs a live activity for tiles to exist). 14/14 suites green.
NOTE for pre-existing TEST WORKSPACES: they copied the old
house-flavored tv controller at creation — delete and recreate
them after deploying. Ceremony: engine + config + studio — bat,
reseed, cache-clear, load_start_url, Studio hard refresh + one
Save & Deploy.

v0.46 — **THE DIALECT ROUND: ONE PLAYER** (Suresh: "why is google
tv player another media player…" + naming ruling "sold" on
dialect). THE COLLAPSE: views/googletv.yaml RETIRED (_retired/) —
it was dialect knowledge frozen into a view. The TV Media Player
(controller:tv) is THE player: new "Device keys" section holds one
`{type: keys}` GENERATOR tile — the engine expands the ACTIVE
dialect's key catalog (classLaunch grammar, same as apps) over the
commands channel. Google TV activities get Settings/Search/All
apps/Quick settings/Live TV; firetv declares no catalog → the
section renders NOTHING and skips itself (empty sections drop,
heading included — hide-when-dialect-silent). Adding platform #4 =
pure data: one dialect entry (channels + keys + apps + forbidden),
zero new views. THE RENAME: app_classes → dialects / app_class →
dialect EVERYWHERE ("a dialect is a platform's whole vocabulary —
keys, launches, channels — not just its launcher grammar"; "class"
was overloaded ×3 internally, "device class" collides with HA's
device_class): yaml file app_classes.yaml → dialects.yaml (googletv
entry gains the VERIFIED key catalog + the full forbidden guardrail
list as data), compiler emits `dialects` + accepts legacy source
keys + renames context.app_class on collect, engine resolves
t.dialect||t.class → ctx.dialect||ctx.app_class over
CONFIG.dialects||CONFIG.app_classes (legacy configs keep working),
studio renamed across state/ActivityCard/DevicesEditor/AppsEditor/
TileRow (labels: "Dialect"), healer migrates stores (app_classes
merge → dialects, per-item key renames incl. view contexts + apps
tiles' class attr, controller:googletv screens → controller:tv,
stray googletv controller deleted; ordering bug found live:
normalizeApps minted an empty dialects {} first — migration now
MERGES). Stock GENERIC_MEDIA_CONTROLLER gains Device keys + Apps
generator sections (scratch workspaces get the one-player anatomy
too). smoke-googletv REWRITTEN for the one-player world: catalog
renders on controller:tv, Settings fires keyevent 176 at the ADB
entity, apps ride the drawer with the ACTIVITY's dialect overriding
the drawer's house default, unwired commands → tiles AND heading
gone + the player's own context declares no commands default.
14/14 suites green. Ceremony: engine + config + studio ALL changed
— bat, harmonium.reseed, Astrion cache-clear + load_start_url,
Studio hard refresh.

v0.45.2 — **THE LIBRARY IS A BYPRODUCT + THE PLATFORM FACT**
(Suresh's workflow critique: creating an activity forced a detour
to an "alien" Devices page; per-activity pseudo-devices piled up;
the ADB channel was "too much guesswork"). (1) UNIFIED CAST PICKER
in the builder's Devices tab — ONE box takes anything: library
devices (⊞ name · n claims), IMPLIED devices (⊞ stem-grouped
entity clusters ≥2 members, "will join your library"), raw
entities ("cast loose"). Picking an implied device MINTS the
bundle silently (Suresh: yes) + casts it + prefills roles — one
gesture, no page hop. Empty-state scold + forced "define devices →"
gone; the library link is a footnote. (2) LIBRARY DEMOTED to what
it's for — traits + claim corrections; intro copy says devices
"arrive here by themselves"; ← back doorway (prevKey). (3) CHANNEL
DECLARATIONS: app_classes googletv + firetv carry
`channels: {commands: {integration: androidtv, domain:
media_player, label: ADB channel}}` — dialect knowledge as data,
machine-read (first slice of the bundles-round promise).
(4) THE PLATFORM FACT: studio fetches the HA entity registry once
over the websocket (auth handshake, config/entity_registry/list →
app.registry entity→platform; 6s bail; failure degrades to the
old name-regex). seedDeviceFromEntity (shared by library seeding
AND picker minting) now claims by INTEGRATION: preferred pass =
push-state twins, androidtv media_player = hard commands
assignment, gap-fill pass covers androidtv-only devices (Fire TV).
Debate settled: commands stays ONE role (letters carry no
semantics; no device has two channels — a future second channel
gets a semantic name in the dialect); the activity author's
required clue-count is ZERO. (5) VALIDATION: device claims check
against the dialect declaration — "ADB channel ✓" / "⚠ wrong
channel" chips in the library; Roles-tab commands candidates
annotated "— ADB channel ✓". (6) Header per Suresh's ruling:
"Roles — which device fills each role in this activity · one
device per role". Snippet buttons → "Save cast as set / Use a
set". Vocabulary settled in debate: HA gives FRAGMENTS → a DEVICE
is the physical object reassembled → a CAST is devices grouped for
an experience → ROLES say who does what within it; "these devices
make up the cast for this activity" (never "the device").
smoke-devices proves the registry beats the name (deck_proj_2, no
_adb marker, platform androidtv → commands claim) via a faked HA
websocket. 14/14 suites green. Ceremony: studio + config — bat,
reseed, load_start_url, Studio hard refresh.

v0.45.1 — **ROLES TAB POLISH + system→commands** (Suresh's UX
debate: "Jobs is confusing… don't like the baby english"; ruling:
tab = "Roles", role = "Commands"). (1) The interview questions
REPLACED — control name leads, mono role key beside it, effect
line as tooltip (Now Playing `media_player` "the media tile,
transport, play/pause state" · Navigation `dpad` "arrows · select ·
back · home — physical remote keys pass through here" · Power
button · Volume keys · Volume readout · Source picker "whose input
list the Source tile offers" · Commands "app launches + system
keycodes"). Header states the doctrine settled in debate: "where
each control on the remote routes — ONE destination per control".
Plural lives where it belongs: Inputs (per-device input answers)
and Actions (per-device power) — the Source-picker tooltip says so
explicitly. Roles unconsumed by the target controller DIM (opacity
.55 + tooltip note), never hide — they matter again on a controller
switch. Same vocabulary applied to the Device library's claims
table. (2) ROLE KEY RENAMED system→commands THROUGHOUT (aggressive
— nothing in production): yaml (googletv controller ×many,
app_classes ×13, devices.yaml claims, dialect routing), studio
(ROLE_KEYS/ROLES/SLOT_DOMAINS), tests. Healer extended: store-side
configs migrate device claims + activity context/wiring/overrides
key-for-key AND swap baked "$context.system" strings in
screens/controllers (exact-value match, never substring). Engine
untouched ($context.* is generic). 14/14 suites green; built
config carries 23 $context.commands refs, zero stale system refs.
Ceremony: studio + config (engine bytes rebuilt but logic
unchanged) — bat, reseed, load_start_url, Studio hard refresh.

v0.45 — **THE DEVICE ROUND** (Suresh: "Nothing we have is in
production so we can be aggressive in getting this right" + "tabs
with a lit up dot when done" — the full UX-backwards overhaul from
docs/wizard.md, phase 2 shipped in one push). THE PIECES:
(1) FIRST-CLASS DEVICES — yaml/devices.yaml, a house-wide library:
one entry per PHYSICAL device (even when HA sees several
integrations — the projector bundle spans androidtv_remote + ADB),
role CLAIMS (role → member entity: what it CAN do) + traits
(never_off, wake, cold_start steps, wait_on/wait_timeout_s,
settle_s, dpad_commands, app_class). Seeded: fire_tv (never_off),
samsung_q90 (WOL cold-start + KEY_* dpad_commands as a TRAIT),
porch_soundbar, pergola_projector. (2) RENAME: hardware profiles
`devices`→`remotes` (engine boot.js reads remotes w/ legacy
fallback; studio slice key remotes; healer moves old configs).
(3) COMPILE LAYER, twice and kept in sync: activities declare
cast:[device ids] + wiring:{role: device_id|raw entity} →
compiled into the SAME context: map the engine has always read
(engine unchanged). Python compile_activity_devices (yaml authors)
= JS compileContext (studio, live on every edit). Explicit
exceptions live in `overrides` (role pins, app_class picks) and
always win. porch.yaml's watch_firetv/watch_smart REWRITTEN to the
new grammar — compiled contexts byte-identical to pre-v0.45
(verified by diff). (4) HEALER normalizeDevices: pre-v0.45 store
configs lift automatically — profiles move to remotes, every
activity's context becomes cast/wiring by matching the library's
claims (unmatched → raw-entity wiring; unreproducible → overrides);
runs before rebaseline, never dirties. (5) TABBED ACTIVITY BUILDER
replaces the ActivityCard middle: Setup · Devices · Jobs · Inputs ·
Actions · State, each with a COMPLETION DOT (green = answered) —
no step-wizard, every tab addressable (the audience is
HA-comfortable). Jobs asks the living-room questions ("Who plays
it?" "Who switches inputs?" "Who runs system commands?") over
cast-device candidates; raw entity stays one option deep. Inputs =
Harmony Q5/Q6 with "Leave it alone" always offered. (6) DEVICE
LIBRARY EDITOR (Model → Devices): claims table in the human
grammar, traits, seed-from-an-entity (siblings stem-matched,
jobs prefilled by domain, ADB twins → system, source_list →
source_select). (7) GENERATION per docs/wizard.md — the prime
directive holds: generated Start = set_activity → best-effort
wakes (continue_on_error) → cold-start-only blocks (WOL, wait,
settle) → conditional select_source from the Inputs answers;
generated Stop turns off ONLY what's checked (never_off devices
render 🔒 untouchable; nothing checked = state-clear only). Drafts
are ordinary editable Actions; once EDITED, regeneration mints a
_v2 beside it, never over it (generated_sig). State "⚙ From
inputs" derives the watch_firetv-shaped detection block (display
on + source in [answer]). (8) CONSUMES STRIP on Jobs: the
Navigate-to surface is scanned for $context.* refs — wired ● /
hollow ○ chips render the controller's contract at wiring time
("system unwired → its tiles hide"). (9) Suite #14 smoke-devices
(healer, library seeding, tabs+dots, compile parity through the
UI, consumes, generation incl. noPowerGuess) + smoke-studio
retargeted to the new tab grammar. 14/14 suites green. Ceremony:
studio + engine + config all changed — bat, harmonium.reseed,
Astrion cache-clear + load_start_url, Studio hard refresh.

v0.44.1 — **PLATFORM CONTROLLER PURIFIED** (Suresh: "Hard coding
to my devices means we can never ship this!"). The googletv
controller's context block (projector defaults) REMOVED —
views/googletv.yaml is now PURE $context: every slot is wired by
the calling activity's cast, nothing house-specific ships in the
platform layer. Doctrine settled: PLATFORM controllers/dialects
carry zero entity ids (they're the product); HOUSE yaml (tv.yaml
etc., his activities) is where entity ids legitimately live.
Consequence: the controller no longer works standalone — an
activity must cast + wire media_player/dpad/system (v0.32
hide-unwired governs, unassisted). smoke-googletv rewritten: the
defaults section is gone; unwired asserts every key tile hidden
AND pureNoDefaults (config carries no deck_hisense anywhere in
the controller). 13/13 suites green. Ceremony: config.json only —
bat, harmonium.reseed, Astrion load_start_url, Studio hard-refresh.
SAME SESSION, design captured in docs/wizard.md: the ACTIVITY
WIZARD (Harmony-style, UX-backwards) — living-room questions →
cast/roles/state-block/Start-Action draft. Prime directive: NEVER
guess power (Harmony's fatal flaw; the Fire TV is never turned
off) — no diff engine, generated Start Action is an editable
draft, power-off strictly opt-in. Depends on phase-2 bundles.

v0.44 — **GOOGLE TV: THE FIRST DIALECT + THE SYSTEM ROLE**
(Suresh's composite-device design, phase 1 of 3 — additive, no
migrations; source of truth = docs/google tv/* — every command
VERIFIED on the deck Hisense SmartLaser). ROLLBACK #10 mid-build
(src to Jul 23) — restored from G:\ (restore10.tgz), new yaml
preserved and re-based onto the CURRENT class grammar (the first
draft targeted the rolled-back engine's per-entity launch overrides;
v0.30's app_classes is the real mechanism and is exactly the
dialect concept). THE PIECES: (1) SYSTEM ROLE — the seventh role:
the COMMAND channel (the ADB entity). Studio offers the chip
(SLOT_DOMAINS media_player/remote); the engine needed NOTHING —
$context.system resolves generically and hide-unwired already
governs. (2) GOOGLETV APP CLASS (app_classes.yaml): 13 verified
apps, every launch `androidtv.adb_command` + `am start -n` via
$context.system — the remote transport routes bare packages through
market://launch (Play-Store roulette); ADB never bounces. BritBox
is ADB-only (britbox:// broke pairing during verification). fubo /
espn / britbox joined the identity registry. (3) GOOGLE TV PLAYER
controller (views/googletv.yaml): Media-Player anatomy + DEVICE
KEYS section — Settings 176 · Search 117 (the Google-TV keyboard
remap; 84 is voice search, lights the mic, deliberately absent) ·
All apps 284 · Quick settings 83 · Live TV 170 — preset tiles bound
to $context.system (unwired → hidden) + the googletv apps drawer +
cast; context defaults = the projector, so the page works
standalone. (4) DIALECT FILE (yaml/dialects/googletv.yaml): keys
catalog, forbidden list (mic-mute, power, HDMI-killers, PAIRING,
CEC), typed-search composite (117 → 6s → input text %s), quirks
(stale app_id heal, shared ADB key) — design record now,
machine-read in the bundles round. (5) smoke-googletv (suite #13):
wired keys render + voice absent, Settings fires keyevent 176 at
the ADB entity, Netflix launches am start (no market://), defaults
keep the page usable, truly-unwired hides every key tile. 13/13
suites green. NEXT PHASES: device bundles (first-class devices +
devices→remotes rename) then dialect-generated device pages.
Ceremony: config.json changed — bat, harmonium.reseed, Astrion
load_start_url, Studio hard-refresh (engine bytes unchanged).

v0.43.9b — id-follows-name made RETROACTIVE: any page whose id is
still the starter's "home" auto-follows the name (workspaces born
before v0.43.9 had already renamed the name, so the New-Room gate
left them stranded). Hero on existing pages heals with one flip of
its switch (toggleHero mints the banner). Studio-only.

v0.43.9 — **STARTER-PATH FIELD FIXES + ROLLBACK #9** (Suresh's four
reports, all blank-starter territory the harness under-exercised).
INCIDENT FIRST: ninth rollback (tree to Jul 24 again, ~40 min after
the v0.43.8b build — the probe rendered the PRE-v0.38 studio, which
is what exposed it); restored from G:\ (restore9.tgz), markers
verified. THE FIXES: (1) PAGE ID FOLLOWS THE NAME on the starter
page — pageIsAuto() now includes the shipped pair (id "home", name
"New Room"), so renaming the room renames the id and every ref
walks (was: "defaults to home, obviously non unique… doesn't
update"). (2) HERO ON BY DEFAULT — the starter room and ＋ Add page
pages are born with a banner (title + clock, self-fit); a page's
face shouldn't start invisible. (3) "HOME CHIP GOES TO" tells the
truth when it's the only page — a dim "this is the only page — the
chip has nowhere to go yet" instead of an empty select. (4) THE
"CORRUPTED" NEW-ACTIVITY CARD was the identity strip's FIXED grid
columns (190+44+170px) starving the 1fr name field at narrow center
widths (nav + preview leave ~500px on a laptop) — DISPLAY NAME
collapsed to a sliver, labels overlapped. Both identity strips
(ActivityCard + TileRow) are now flex-wrap with min-widths: fields
shrink gracefully and wrap to a second line instead of crushing.
Verified in a scratch-starter probe at 1280px: id follows (den),
hero on, note shows, name field 242px. smoke-studio green.
Studio-only: bat + Studio hard-refresh.

v0.43.8b — open item-card bodies (Watch Fire TV…) were still
bg-inset — now --color-tile-hi via a new knob (--ui-row-body-bg /
.ui-row-body) in the same settings block. Studio-only.

v0.43.8 — **STYLE SETTINGS ABSTRACTED + SIX NOTES + ROLLBACK #8.**
INCIDENT: eighth container rollback (full tree to Jul 24, caught by
marker-sweep when ActivityCard showed no tabs); recovered from G:\
via restore8.tgz — tar → extract → swap → markers → green. Live
studio.html was never wrong (built before the rollback). THE NOTES
(Suresh's img-1/img-2 side-by-side): (1) sidebar group headings
12px; (2) item rows (activities · presets · devices — one CardRow)
sit on --color-bg; (3) section accordion bodies on --color-tile-hi;
(4) "+ role" selects fixed at 96px — a native select otherwise
sizes to its LONGEST OPTION, which is why they ballooned unevenly;
(5) ＋ Add device button removed: picking in "add a device…" ADDS
immediately (addDevice clears the box for the next; combo test
updated — picked = joined the cast + box cleared); (6) presets and
devices styled identically for free via the shared components.
THE ABSTRACTION: all of it lives in the STUDIO UI SETTINGS section
of studio-src/src/app.css as variables + semantic classes
(--ui-fs-nav-heading · --ui-row-card-bg · --ui-sec-body-bg ·
--ui-role-select-w → .ui-nav-heading/.ui-row-card/.ui-sec-body/
.ui-role-select) — devs tune surfaces and control sizes in ONE
block, components reference the class names. Studio-only: bat +
Studio hard-refresh.

v0.43.7 — **SECTIONS BECOME ACCORDION CARDS** (Suresh: "children
(and settings too) inside the accordion body"). SectionHeader grew
into a container: one bordered card per section — washed title bar
(bottom border only while the body shows) + an inset body holding
the settings strip AND the rows, so the chevron folds the whole
thing as one object. HubEditor's six call sites became paired tags
with their content as children; the loose {#if !secFold} wrappers
are gone. HERO's chevron and its Section settings button now share
one state (its settings ARE its body — closed by default, no empty
strip). data-sec moved to the card root, so every test selector
([data-sec="Devices"] count, the Presets switch harness, the §11b2
fold round-trip) passes unchanged. Studio-only: bat + hard-refresh.

v0.43.6 — **SECTION HEADERS: TITLE TREATMENT + ACCORDION**
(Suresh: same washed-title look as the map's page cards, with an
accordion button at the end; built to roll back easily). (1) Every
SectionHeader (Hero · Activities · Presets · Devices · customs ·
Ungrouped) wears the item-card title bar: raised wash, hairline
border, 10px radius — one component, so one place to change back.
(2) ACCORDION chevron at the far end (after the add verbs): folds
the section's rows in the EDITOR only — pure UI state (secFold),
never written to config, resets on reload; hero has no fold (its
body is already behind Section settings). (3) ROLLBACK is written
into the component's comment: restore the one root-div class +
drop the `collapsed` prop; HubEditor's {#if !secFold.*} wrappers
then never hide anything. Tests: §11b2 folds Devices (Porch TV row
gone), expands (row back) — green with the full smoke-studio run.
Studio-only: bat + Studio hard-refresh.

v0.43.5 — **UI SETTINGS + MAP EVERYWHERE + WASHED TITLES.**
(1) FONTS KEPT (Suresh approved the +1 step: 12→13, 12.5→13.5,
13→14, base 14) and promoted into a labeled STUDIO UI SETTINGS
section at the bottom of studio-src/src/app.css — four variables
(--ui-fs-base/small/mono/body) that devtools can tune live and a
one-line map onto Tailwind's output; explicitly Studio-only
(config.theme → engine vars is the remote's separate system).
(2) EVERY workspace switch lands on the WORKSPACE MAP (not just
first load); the hidden preview still follows to the workspace's
home_screen so it's warm when a real editor opens. smoke-studio §8
enters the scratch starter room via nav ("New Room") — den preview
/ save routing / create flows all green unchanged. (3) MAP page
cards wear the item-card TITLE TREATMENT (Suresh, from the
ActivityCard screenshot): raised wash + bottom border on the title
row; controllers keep their plain cards. 12-suite battery not
rerun beyond smoke-studio (engine untouched). Studio-only: bat +
Studio hard-refresh.

v0.43.4 — **MAP: THE TREE, TOLD TRUTHFULLY** (Suresh: Porch
wrongly wore ROOT PAGE; root should lead, then children). The badge
had conflated two concepts: home_screen (where a remote BOOTS —
Porch, in the live config) and the hierarchy root (the parentless
top / global.main_home — Home). Now: ROOT PAGE (green) sits on the
true tree root only; the boot view, when it differs, wears its own
amber "BOOTS HERE" badge (titled with the engine's words: where a
remote lands on startup and Home). Cards SORT by tree depth — root
first, then children, then grandchildren (stable within a level,
main_home first among parentless) — so the map reads top-down like
the hierarchy it draws. The "it's the hub" empty-state line follows
the root, not the boot view. smoke-studio map asserts green.
Studio-only: bat + Studio hard-refresh.

v0.43.3 — **NAV GRACE PASS + ROLLBACK #7 RECOVERY.** INCIDENT:
seventh container rollback, mid-turn — the cloud workspace reverted
to a ~Jul-24 snapshot (state.svelte.js, TileRow, tests, docs,
engine dist, WorkspaceMap all gone or stale) while the desktop
bridge was down; the timing briefly misread as a token-file root
cause. RECOVERY: G:\ ground truth (every batch hash-verified) —
on-device tar → stage → extract to fresh dir → swap → marker
gauntlet (merge3/cardTab/v0.43.2/grid-gap/showUndo/WorkspaceMap
all present) → rebuild → 12 suites green. Cause, plainly: the
sandbox rehydrates from a stale disk snapshot when its container
migrates (correlates with bridge drops); mirror-every-batch is the
defense and it worked again. THE NAV, against Suresh's design-
intent side-by-side: (1) the wash READS now — active row is a
rounded amber-wash pill, label in accent-text semibold, filled
token, 2.5px inset bar; (2) type a step larger everywhere (rows
14px, children 13.5, headers 10.5, annotations 11.5; rows 38px,
rail 252px); (3) children clearly indented (46px + guide, no
token — Music Library / Apps / HVAC & Lights read as nested);
(4) quiet stock condensed to the intent's own words ("+ 5 stock
device pages", click expands); (5) DEFAULTS/CUSTOM subheads
dropped — the STOCK/EDITED badges already say it. Studio-only:
bat + Studio hard-refresh.

v0.43.2 — **NAV + MAP: THE ELEGANCE PASS** (Suresh: "Left menu
sidebar way too cramped… Apps and Music Library aren't defined
pages, they are children of the controllers… badges, color,
dividers. Come on. We got this!"). (1) NAV against mock 2a: rail
218→236px (the handoff's own number), rows 32→34px with air,
RIGHT-ALIGNED one-fact annotations ("3 activities", "rooms hub",
"library", "10 apps · 2 cl…") instead of cramming; EDITED badge
(accent wash) joins STOCK; quiet stock controllers CONDENSE into
one dim row ("Climate · Light · Cover · F…" — click expands, mock's
"Cover · Fan · Switch" line); group headers get real vertical
space; "Remotes & keymaps" and friends drop annotations that
forced truncation. Presentation only — slices() and every nav
contract untouched. (2) MAP: Apps and Music Library are NOT page
cards — a library drawer whose parent is a controller is that
controller's furniture, shown as clickable "→ Apps" / "→ Music
Library" chips on its card (plus section chips where the def has
them); pages count drops to the honest 3. (3) THE BIG ONE: the
phone preview HIDES on the map (mock 3a has no phone there — an
overview doesn't need one; iframe stays MOUNTED so engine state
and the test frame survive). The map takes the full width and
every truncation Suresh flagged ("HVAC & Lig…", "Watch …",
"opens Po…") resolves — full entity ids, full activity details.
(4) Controller cards: names untruncated (292px column), chips row,
sharing story. 12 suites green. Studio-only: bat + hard-refresh.

v0.43.1 — **MAP FIDELITY PASS** (Suresh: "spacing, font size,
white space and other touches are off… details matter" — rebuilt
against mock 02-workspace-map at full fidelity). (1) TITLE BLOCK:
"Main workspace" 20/600 + "5 pages · 3 activities · 7 controllers
· live at /local/harmonium/" + a PAGES caption line. (2) ROWS ARE
THE DETAIL (mock's core idea): every row is a bordered 8px-radius
shape — activity rows = accent dot + "n devices · opens <landing>",
preset rows = what they run (runs action · X / scene · Y /
service), device rows = domain token (CL/LT/ME…) + entity mono,
doorway rows = → token + "opens <page>"; generator tiles wear
WORDS not ids ("App grid", "Preset list" — m_pl read like debris).
(3) TRUNCATION DISCIPLINE: the name wins the space fight (min 35%,
id yields first), details truncate right; the doorway count moved
OUT of the tab strip (it clipped at card width) into a caption
under the rows — "4 doorways among them". (4) LEVEL CARDS: rows
area has a 3-row min-height so sibling cards sit level (mock:
"tabs keep the card one height whatever the page holds"); empty
pages get dashed borders + a sentence. (5) CONTROLLERS COLUMN
tells only stories: cards for controllers that are edited or used
by an activity ("Shared by X and Y — an edit here reaches both" /
"Used by X. Duplicate it to make a variant…"), untouched stock
collapses into ONE "Stock device pages" teach card. (6) EDIT IS
SOFT (Suresh's ruling over the mock's "Edit →"): quiet dim "Edit",
accent underline on hover, no arrow — everywhere on the map.
12 suites green. Studio-only: bat + Studio hard-refresh.

v0.43 — **REDESIGN FINAL ROUND: MAP · SIZING · REORDER · UNDO ·
DIRTY** ("I want everything fully implemented" — the remaining
handoff phases in one lift). (1) WORKSPACE MAP (§6.11 + §7.3
corrections, Suresh's default=yes): a read-only landing slice —
pinned nav row above ① Pages, page cards with badges (ROOT PAGE ·
in <parent> · n KEYS BOUND · DRAWER · IN CONTROLLER:x), an
Activities · Presets · Devices tab strip per card (doorways count
INSIDE Devices — "3 · 1 doorway", never a Tiles tab), three rows +
"+n more", SUBPAGES footer, and a Controllers row whose story is
sharing ("Shared by Watch Fire TV and Watch Smart TV — an edit
here reaches both"). Every card is an Edit → doorway into the real
editor; the Studio now OPENS on the map. (2) PAGE SETTINGS PANEL
(§6.4, honest v1 subset): one button under the page identity,
accent-bordered panel with Layout · Keys (n) · Advanced-glass
tabs. Layout = Grid columns segmented with a real SourceChip
(SET HERE ↔ Reset; FROM WORKSPACE when unset — engine default 2)
+ Tile height and Gap as px steppers writing theme vars
(workspace-wide, chipped FROM THEME) + the fall-through footer.
Keys = the whole key-mappings block (Home/Back/Power, bindings,
Drawer) moved in; Advanced = the config-level knobs (boot view,
paging, routing) off the page floor. ENGINE (2 lines): #grid and
.secgrid gap goes through var(--grid-gap, 10px) — theme["grid-gap"]
now real; tile-h always was. (3) REORDER & DELETE (§7.1): every
tile row grows a hover ⠿ drag handle (wrapper is draggable only
while the handle is held; drop reorders in-list) and a ··· menu —
Move up · Move down · Move to <section>… · Duplicate · Remove —
words, not glyphs. (4) UNDO TOAST: every Remove (tile or activity)
raises "Removed X · Undo" for 10 s; activity Remove first opens an
inline confirm NAMING its references (tiles, visibility rules,
sequences that set it). (5) DIRTY STATE (§7.2): ● Edited chips on
row headers from a canonical-JSON baseline of the last-saved
config — reordering alone doesn't mark, editing BACK to saved
clears the chip, Save & Deploy rebaselines everything.
(6) TESTS same-commit: map landing + Edit→ doorway (§2b), ···
reorder round-trip, Remove→Undo restore, chip on/off round-trip,
panel SET HERE↔Reset (§11e/f), §14 keys moved behind the panel;
§3 now ENTERS porch through the map like a user would. 12 suites
green. Deploy: ENGINE TOUCHED — push-to-ha.bat, then Astrion
cache-clear + load_start_url, then Studio hard-refresh (no
restart, no reseed — config.json unchanged).

v0.42 — **REDESIGN ROUND 4: ITEM-CARD GRAMMAR — EVERY TILE**
(handoff §6.6/6.8/6.9/6.10 — learn it once, know it everywhere).
TileRow rebuilt onto the R3 grammar; same component name and props,
so all four editors (Hub, View, Library) ride along untouched.
(1) IDENTITY STRIP on every tile: Display name · Icon · Id (the id
shows as a read-only chip — editing it lives under Advanced, per
the vocabulary rule that "tile id" never walks the primary path).
(2) FIRST TAB SPEAKS THE ITEM'S LANGUAGE: device → "The device"
(Entity + Tap + Hold — the hold select's empty option now SAYS
"Auto — controller:tv (from its activity)" instead of an em dash,
plus a read-only cast note: which activities cast this device and
wearing which roles); doorway → "Where it goes" (Opens + edit
page → / ＋ mint, contract preserved — the draft Keep/Discard flow
is byte-identical); preset → "What it does" (REAL editor at last:
On tap = Run an action (sequence) · Activate a scene · Call a
service, all compiling to the ONE action shape the engine already
fires — service+target+data, no config change; honors action.target
OR action.entity, whichever the tile speaks; Belongs-to-activity
select + warm-start sentence); generators/raw → "What it shows"
(apps class/include, cast-of + Unlink, entity pickers unchanged).
(3) SHARED STYLING TAB: Column span as a 1·2·3·4 segmented;
doorway style (auto/plain/image/summary) + image moved here —
"how the card renders; the page behind it is the same either way".
(4) ADVANCED AS GLASS: Type select (raw widgets still gated by
Advanced mode), Tile id, Show attribute (device), and the
always-on JSON. (5) TESTS same-commit: §11d probes the grammar
(fresh device → The device/Styling/Advanced walk, span segmented,
type select + JSON in glass, probe tile deleted after); §11c
doorway-mint contract passed UNCHANGED — the mint ＋ lives on the
doorway's default tab. 12 suites green; screenshots r4-device /
r4-preset / r4-doorway / r4-styling / r4-advanced in docs/design/.
Studio-only — engine untouched: deploy = push-to-ha.bat + Studio
hard-refresh.

v0.41 — **REDESIGN ROUND 3: ITEM-CARD GRAMMAR — ACTIVITYCARD**
(handoff phases 5 + 9b — one card, one grammar). (1) IDENTITY
STRIP: the old 2×2 identity grid became a compact always-visible
strip — Display name · Icon · Accent · Activity id (rename-on-
change kept) — so the card's "who am I" never scrolls away.
(2) TABS: the card body split into Devices & roles (device count
chip) · Start & stop · Controller · State (rule count chip);
active tab = inset accent underline; every pane is the old block
wrapped, no behavior rewritten. (3) ADVANCED AS GLASS: the gated
rawOpen JSON toggle is gone — a right-aligned glass tab (outlined-
square glyph) holds an always-present JsonArea, the escape hatch
made visible but visually "behind glass". (4) MOVES per handoff:
App class left the cast block for the Controller tab (with a
no-controller fallback line explaining why it's empty);
confirm_end became a proper Switch in Start & stop ("Confirm
before ending (press twice)"). (5) TESTS same-commit: cardTab()
helper clicks tab buttons by prefix; tab-clicks inserted before
every deep interaction (§10 start/stop picks, §10b create-page,
§11a linked/discard/edit-link); §11's open-card guard now detects
the tab bar — the old cast-input probe couldn't see it and was
double-clicking the card shut. 12 suites green; screenshots
r3-cast/r3-startstop in docs/design/. Studio-only — engine
untouched: deploy = push-to-ha.bat + Studio hard-refresh.

v0.40 — **REDESIGN ROUND 2: BLESSED SECTIONS** (handoff phase 4 —
the liturgy made physical). (1) ENGINE: sections honor
`enabled: false` — a switched-off section keeps its items in config
but stops rendering AND subscribing (rawTilesOf filter + render
skip); compiler passes the key untouched; merge3-safe. (2)
HUBEDITOR restructured onto the blessed model: Hero · Activities ·
Presets · Devices always present, in order, each a SectionHeader
(new component: [switch] title (count chip) ──rule── grid summary ·
Section settings · paradigm verb). Switch ON creates a missing
section; OFF greys content 50% (off ≠ empty). ＋ Add preset now
mints a real preset tile (was a device tile — latent bug); ＋ Add
doorway replaces "Add nav card" (vocabulary: doorways are how the
Devices zone points at more devices). Section-settings strip (v1
real knobs only): Heading, Jump label, Grid columns segmented with
inherit. Custom sections render with the same headers when they
exist; CREATING one is behind Advanced mode. Legacy flat tiles →
"Ungrouped". smoke-studio updated same-commit (doorway wording,
data-sec assertions) + NEW §14b: Presets switch off → preview loses
the tiles live → Save posts enabled:false → switch back heals
(3→0→3, harness-proven). 12 suites green. Deploy: bat (engine dist +
studio.html) + Astrion cache/reload + Studio refresh; config.json
unchanged → no reseed, no restart.

v0.39 — **REDESIGN ROUND 1: GRAPHITE RAILS FOUNDATION** (implementing
the Claude Design handoff at docs/design response/, phases 1–3 of its
plan; Suresh's calls: POWER column dropped — nothing in the model
behind it; FACE→PRIMARY with honest copy; SHOW→ON CONTROLLER — the
column header now says where the effect lands; Workspace map will be
default landing when built). (1) TOKENS: app.css = the handoff's
Graphite Rails system (surface/raised/sunk/field/glass, ink ramp,
per-theme amber #ffb300/#a86f00, note surfaces, radii/heights/
spacing/shadow tokens) with LEGACY ALIASES (tile/tile-hi/inset/hover)
so 28 unmigrated files keep rendering — migrate per-phase, then drop.
(2) PRIMITIVES to spec: Button (secondary/primary/quiet/danger,
radius 6, focus ring, disabled=greyed-never-removed), Input/Select
38px radius-4 field chrome; NEW IconButton, Segmented, NumberField
(px+stepper), SourceChip (inheritance provenance, v1 subset),
NoteStrip (teach strips, dismissible per editor). (3) COPY PASS:
worded snippet buttons ("Use snippet…"/"Save as snippet"); the
device-cast rows got PRIMARY / ON CONTROLLER switch columns with
headers (★/👁 glyphs gone; primary row tinted note-bg); honest
primary copy; teach strips on Hub + View editors; "Column span";
raw widget types + JSON escape hatches now gate behind (4) ADVANCED
MODE — a persisted switch pinned to the NavPane bottom. (5) FRAME:
52px surface header in three tiers (identity · state · one primary
action) — segmented workspace pills, address CHIP, ok-dot status,
Export/Import quiet, Revert bordered, Save & Deploy filled, Clear +
Save-Reload-Astrion behind ···. (6) NAVPANE: search + ⌘K, numbered
groups (① Pages ② Controllers ③ Building blocks ④ System) with
counts and rules, 18px type tokens (accent-filled when active,
accent-wash row + inset bar), child guides, STOCK badges, ＋ Add
page. smoke-studio's navClick + free-standing-title updated in the
same commit (guardrail). 12 suites green; both themes screenshot-
verified. Deploy: studio.html only — bat + Studio refresh, nothing
else. Rounds 2+ (blessed sections, item-card grammar, settings
surfaces, reorder/dirty, Workspace map) follow the handoff plan.

v0.38 — **/local/harmonium + THE PATH IS THE WORKSPACE** (Suresh:
"is our url strategy a good thing or a constraining thing?" →
discussed: hash-pin = identity-in-the-device, invisible state; paths
= identity-in-the-address, self-documenting — MORE aligned with the
dumb-renderer doctrine. And "break out of the prototyping space").
(1) DEPLOY HOME MOVED: www/remote-proto → www/harmonium
(/local/harmonium/). One-time integration-side migration copies
engine + config*.json on setup; a PERMANENT redirect stub overwrites
the old remote-proto/index.html (hash rides along) so the Astrion's
old start URL keeps booting untouched. push-to-ha.bat retargeted.
(2) PATH-PER-WORKSPACE: every non-main workspace gets a 3-line entry
stub at www/harmonium/<ws>/index.html (written by deploy(), removed
by retire()) that hands off to the SINGLE shared engine with
#ws=<id>&pin=0 — the path decides on every boot, nothing pinned, no
engine copies, no version skew; extra hash params (#device=) ride
through the stub. Workspaces API returns "path"; Studio: top-bar
link is the pretty address, Workspaces page rows link their
addresses, provisioning copy rewritten ("point the device at the
URL"; #ws= pin still supported). Harness-proven: /deck/ → WS=deck,
deck config, localStorage clean. 12 suites green + stub/redirect
python units. ROLLBACK #5 hit before this batch (container reverted
to Jul-21/23 wholesale) — fresh G:\ tar restore, v0.37.2 roll-up
hash re-verified before building. Deploy: NEW BAT first, HA restart,
reseed; Astrion needs nothing (redirect), Fully start URL can move
to /local/harmonium/ at leisure.

v0.37.2 — the Studio's "open the running app" link now follows the
CURRENT workspace (Suresh's catch) — as a PEEK: `#ws=<id>&pin=0`
boots that workspace for the load without provisioning the browser
(the bare #ws= pin would have silently made his desktop THE Bedroom
remote). Hash retained so F5 stays on the peek; tagged service calls
still route to the peeked workspace; scratch links to main (never
deploys), label shows /local/remote-proto/#<ws>. smoke-workspaces
§4b covers ws/pin/hash/tagging.

v0.37.1 — blank-starter create failed live ("unknown parent
'porch'"): the stock controller library rides into a new workspace by
doctrine, but tv/music carried their `parent:` — a CONTENT-graph edge
into the old workspace — and the (new) server-side create validation
caught it (scratch never validated, so it lurked). starterConfig now
strips `parent` from inherited stock controllers; smoke-studio §15
asserts noStaleParents + librarySurvived.

v0.37 — **NON-DESTRUCTIVE RESEED: THREE-WAY MERGE + BACKUP**
(Suresh: "every so often all my theme settings are reset" → root
cause: reseed = wholesale repo-wins overwrite, erasing all
Studio-side changes to main at EVERY deploy ceremony — the parked
yaml-round-trip gap drawing blood). merge3() in workspaces.py (pure,
HA-free, 10-scenario unit gauntlet): reseed keeps the repo build it
last integrated as the BASE (store.base_main) and merges per key —
repo unchanged since base → Studio's state stands (incl. Studio
DELETIONS); Studio unchanged → repo's state stands (incl. repo
deletions — Suresh's "no redundant superseded keys" requirement:
nothing rides back in); both changed → REPO WINS, dotted path logged.
Dicts recurse; lists/scalars atomic (a tiles array is one authored
thing). Merged result runs through _validate — invalid merge falls
back to the repo build, loudly. Outgoing main is snapshotted to
config.main.backup.json BEFORE every reseed; new
harmonium.restore_backup = one-deep undo (store + deployed file).
Reseed now also deploys the MERGED config to config.json (the live
file must match the store — remotes get the merge too; the repo's
dist/config.json is an input, not the live artifact). First reseed
after upgrade has no base → old replace semantics once, then
baselines. Seed-on-first-run also sets the base. Consequence: deploy
ceremonies stop destroying Studio work — theme re-applied once will
now SURVIVE; "harvest to yaml" becomes housekeeping. 12 suites green
(engine untouched). Deploy: Python changed → HA RESTART, then reseed
(this one baselines).

v0.36 — **SOURCE_SELECT ROLE + CAST CURATION** (Suresh: "clunky and
inconsistent… the title bar is almost impossible to touch… auto
device tiles too numerous and overlapping" — his design, discussed
then built). (1) The v0.35 TITLE-BAR INPUT BUTTON DIED after one day
(bar icons are fingertip-hostile on a remote): info_button /
sources_entity removed from engine, compiler, Studio, tv.yaml.
(2) SOURCE_SELECT is a sixth ROLE (media_player/dpad/power/volume/
volume_level/source_select): the stock controllers (tv, music,
GENERIC_MEDIA_CONTROLLER) carry a Source tile bound to
$context.source_select — the tile EXISTS IFF the activity wires the
role, which is just the hide-unwired doctrine doing its job (zero
new conditional logic). Sub line = current input; tap → the picker.
porch.yaml wires it: watch activities → the SAMSUNG (the display
owns inputs), music → the Sonos. sources widget default entity is
now $context.source_select. (3) CAST CURATION (his #1): per-device
visibility toggle in Setup — 👁 next to ★ — writes
activity.device_options[ent].tile = false; the devices generator
skips those; roles stay wired (ORTHOGONAL by design: hiding the
Samsung's redundant device tile does NOT kill its Source tile —
harness-proven). Sidecar shape = no migration, Setup snippets ride
along (export/import carry device_options). castFromCtx/castOf/
Studio castOf all include source_select. Studio ＋ Add device span-2
default kept. smoke-sources rewritten (role tile @samsung ·
hide-unwired when idle · sonos on music · curation drops ONLY the
samsung cast tile, Source survives) — 12 suites green. Deploy:
engine + config.json + studio (no Python → no restart; reseed yes).

v0.35 — **SOURCES V2 + MUSIC-LIBRARY SELF-HEAL** (Suresh's field
report: "Input Sources idea is too clunky… what we need is a new
type: Sources"). (1) SOURCES RETHOUGHT: the v0.33 inline generator
(a drawer full of input preset tiles) is GONE. `sources` is now ONE
tile (widgets/sources.js) — sub line shows the CURRENT input, tap →
`sources:<mp>` virtual detail (live source_list as chips, current
highlighted, pick → select_source, auto-back via stack). Apps
drawer's Inputs section and the Library's Sources category removed;
the music controller gained an m_src tile. (2) TITLE-BAR INPUT
BUTTON: `info_button: sources` (+ optional `sources_entity`) turns
the ⓘ into an input button — tv.yaml points it at $context.power
(the SAMSUNG's inputs: Fire TV/TV·HDMI — the display owns inputs,
not the streamer); everywhere else ⓘ stays. Studio: Title-bar icon
select on view editors, sources in the tile Type list. (3) MUSIC
LIBRARY EMPTY diagnosed live: the v0.31 MA startup race AGAIN —
after the v0.34 restart the first fetch got zeroes and sat for 15h.
sensor.py now: a failed/EMPTY read keeps the last data per category
(never blank a good library), retry cadence drops to 5 min while
all-empty, and EVENT_HOMEASSISTANT_STARTED triggers an immediate
re-fetch. Also verified: the library's category chips DO render and
tap in browsers — they were invisible because every section was
empty (empty sections hide, so no chips); with content back the
strip is the visual clue. (4) Studio ＋ Add device now defaults
span 2 (full width — his niggle). New smoke-sources suite (tile →
picker → select_source @sonos · tv ⓘ=input @samsung · home ⓘ=info ·
apps drawer Inputs gone) — 12 suites green. Deploy: sensor.py
changed → HA RESTART + reseed (config.json changed).

v0.34.1 — **SUBSCRIPTION POISONING + STATE-HEADER CSS** (found
during the v0.34 deploy ceremony + Suresh's screenshot). (1) THE
REAL "pages need a refresh" ROOT CAUSE: entitiesFor() subscribed
every string context value, and v0.32's `app_class: firetv` token is
not an entity — HA rejects the ENTIRE subscribe_entities message on
one malformed id, so every page whose context carries an app_class
(TV controller, Apps drawer) got ZERO live updates. The v0.33
watchdog only treated disconnects. Fix: only dot-containing context
values subscribe. (2) FIXED-WIDTH Select/Input: raw class
concatenation left `w-full` vs `w-64` to stylesheet order — the
State header's mode select swallowed its row, crushing the title
vertical and hiding the snippet controls (Suresh: "formatting broken,
no export/import"). Root fix: twMerge in Select + Input (passed
classes now always beat base); State/Setup headers get shrink-0 +
width-wrapped mode select (w-72), and the ⤵ import control is ALWAYS
visible — disabled with a "no snippets saved yet" hint instead of
vanishing when empty. Suresh's follow-up: header order is label →
mode dropdown → icons HARD RIGHT, and the ⤴/⤵ glyphs became proper
upload/download tray SVGs (upload = save to Snippets, download =
insert from Snippets; consistent bordered mini-buttons, invisible
native select overlaid on the download icon keeps the picker).
Verified by element screenshot.
CONTAINER ROLLBACKS #3 AND #4 hit mid-window (v0.33/v0.34 files
reverted to Jul-23/24 snapshots TWICE); both recovered from the G:\
mirror via on-device tar → stage → extract → hash-match
(6a49927b264e23b7) — the mirror-discipline doctrine is now
load-bearing. All 11 suites green; engine rebuild byte-matches the
mirrored fix (dbe4bb72…).

v0.34 — **WORKSPACES, FOR REAL** (Suresh's heavy lift: "more than
one workspace active — two remote controls in different rooms").
DOCTRINE: a workspace = one complete runtime config = one remote's
whole world; ALL workspaces are live at once. Main is the repo-built
one and keeps every legacy path byte-identical (config.json, bare
select ids, untagged service calls) — the Astrion notices nothing.
(1) STORE v2: `{workspaces:{id:cfg}, meta:{id:{name}}, order}` with
transparent legacy-wrap migration; new `workspaces.py` is pure
(HA-free) so the container unit-tests it directly. (2) DEPLOY: main →
config.json, others → config.<ws>.json beside it (the bat copies
only index.html+config.json — verified — so ws files survive pushes);
reseed = repo→main PLUS re-deploys every other ws file from the store
(self-heal). (3) ENGINE: `#ws=bedroom` provisioning param, sticky in
localStorage like #device=; loads config.<ws>.json, missing-file
falls back to main with a bar flash; ONE injection point in
callService tags harmonium.* calls with `workspace:` (main omits the
key). (4) SERVICES: run/set_activity take optional `workspace`;
sequences resolve per-workspace (two rooms can both have all_off).
(5) SELECTS: minted per workspace — main keeps
select.harmonium_<room>_activity EXACTLY (automations safe), others
get select.harmonium_<ws>_<room>_activity; new workspaces mint
IMMEDIATELY on create/save (platform hands its add-entities callback
back); create/duplicate/publish retargets select refs by prefix
rewrite server-side (string-level over the JSON — catches
activity_select, activity_state, and sequence pokes). (6) API:
config?ws= (no query = main = back-compat) + /api/harmonium/
workspaces CRUD (create from blank/duplicate/current-draft; rename =
display name only, id immutable; delete refuses main + removes the
deployed file). (7) STUDIO: Live/Scratch pills → dynamic roster
pills + Scratch; per-ws draft stash (unsaved edits survive
switching); System → Workspaces manager page (rows, rename inline,
2-press delete, create-and-deploy with provisioning hint); SCRATCH
DOCTRINE SHIFT: Save & Deploy now REFUSES on scratch (it was a
replace-live landmine) — publish it as a workspace instead; preview
passes its workspace so Test buttons hit the right world;
starterConfig mints ws-prefixed activity_select. Tests: NEW
smoke-workspaces (pin/tag/sticky/fallback/main-clean), smoke-studio
§15 (pills, per-ws save routing, manager, create), python unit run
of workspaces.py (migrate/retarget round-trip/room_hosts) — 11
suites green. NOTE: needs HA RESTART (integration .py changed).

v0.33 — **ROUND 2 OF THE FIELD REPORTS.** (1) Browser button bar =
Back|Home|Power: the buttons widget grew a `power` slot (control
target / $context.power toggle — NOT a keycode); menu dropped (the
dpad has it). (2) PRIME FIXED by research: Amazon moved the
launcher — `androidtv.adb_command` with `am start com.amazon.firebat/
com.amazon.firebatcore.deeplink.DeepLinkRoutingActivity` (the deep-
link router, HA community-verified 2024); Max's am-start also moved
to adb_command (remote.send_command never ran shell). (3) volume_2
ROLE REVERTED per Suresh ("wrong approach — add a device to a custom
controller instead"); the hide-unwired-context-tile doctrine STAYS.
(4) SOURCES/INPUTS: new `{type: sources}` generator — one preset per
source_list entry of the ctx media_player (include: curates); Apps
drawer became sections (Apps · Inputs — CH▲▼ hops them), Music
Library grew a Sources category. Fixed en route: bannerless pages
DISCARDED their section jumps at the buildHeroNav call site — jumps
now always register (strip stays banner-only); local `strip` var
shadowed the new param (engine-killing syntax error caught by
node --check). (5) STALENESS WATCHDOG for "pages need a refresh":
kiosk webviews doze and the socket dies silently — ping every 25s, a
silent minute force-closes to trigger reconnect; visibility-wake
resubscribes. (6) SNIPPETS (Suresh's spec): localStorage-backed
(global across workspaces AND reseed-proof), typed (setup = devices
& roles · state = state rules); ⤴ on the Setup/State title bars
exports with metadata, ⤵ offers compatible snippets; Model →
Snippets page groups by type (rename/edit/delete). All 10 suites
green; sources/prime/power/jumps harness-verified.

v0.23.1 (Suresh's live findings): (1) the Listen to Music activity
card CRASHED on open (props_invalid_value — music lacks confirm_end;
Switch bound undefined against a fallback) → function binding;
smoke-studio 10c now opens EVERY activity card. (2) the bare cast
generator used the ACTIVE activity even on surfaces it doesn't
target — music playing put the Sonos on the TV controller → the cast
now comes from the active activity ONLY when act.screen === this
surface, else from the screen's own default context (castFromCtx);
reproduced and verified against the live config pulled from HA.
Resync answer: bat + reseed = repo truth; Studio Revert = last saved.

v0.21.1 (Suresh's round-2 review): HOME-KEY dropdown filtered to
VIEWS only (no controllers/drawers/subordinate pages — "the only item
should be Home"), labeled by name; Room-view + Drawer switches grew
plain-words explanations; ✕ on an in-flight draft card = Discard
(same contract as the button); "＋ Add action" label; NAVIGATE TO
grouped — Controllers optgroup first, then Pages & views (drawers
excluded), names not ids; OWNER ROOM field removed from the activity
card (redundant inside the room's editor — data stays, reassignment
via Code tab / All activities).

v0.20.2 — **DELETE THIS PAGE** (gap Suresh hit deleting Test
Activity): Hub + View editors grew a danger button; deleteScreen()
is guarded — refuses while anything still points at the page and
NAMES the blockers (children by parent, tiles that open it, activity
navigate/ownership, home_screen/main_home), on success drops it from
screen_order and re-selects a surviving slice. Delete order for a
whole test activity: activity card ✕ → its sequences in Building
blocks (✕, now unguarded) → its page (Delete this page) → Save &
Deploy.

## Previous state (v0.13 groundwork, 2026-07-20)

v0.13: the `yaml/` v2 authoring model (Suresh's design: view-per-file,
rooms own activities, declarative state, control_target, input policy)
is adopted as plan of record — compiler gated into the build, apps
drawer authoring fixed (no arrow pass-through), and the ENGINE now
understands the v2 fields data-activated (control_target routing,
short-press-controls-target input policy, declarative activity state
eval with select self-heal). 7th smoke suite (smoke-v2)
proves both activation and dormancy. docs/authoring-ui.md designs the
user-facing builder (harmonia editor patterns + engine-iframe live
preview). v0.13.1: **v2 CONFIG IS LIVE** on the Astrion — build
recompiles yaml/ into dist/config.json (config/config.json frozen as
v1 fallback); screen ids porch/overview/music_library; key policy
DECIDED and encoded as data (short=app, hold=device, toggleable via
system.yaml short_press); activity truth device-derived via state
evals with the select as self-healing routing cache; apps drawer
passes only power. All 7 suites migrated and green.

## Previous state (v0.12, 2026-07-20)

v0.12: drawer screens pop after a pick (`drawer: true` on Apps +
Music Library), inline subs (`inlineSub` chassis flag — Volume and
plain Now Playing tiles carry their value on the title line,
right-aligned 15px), `confirm_switch` activity-switch guard (global
on, per-activity override), toned pulsing confirm cue — bar
title AND the screen's major (first) tile pulse red=off / accent=on
(v0.12.1-2); plain media tile back to two-line layout, per-activity `stop` wired for music
(`script.activity_music_stop` = state + media_stop on the Sonos), and
`script.activity_off` grown real orchestration (Samsung off, soundbar
pause, Sonos stop). Music activity/screens rewired to
`media_player.ma_sonos_basement`. Config v28. 6 suites green
(smoke-music covers drawer pop + switch confirm + inline sub).


v0.11.x ships the physical-key policy AND the shell-gesture contract:
screen classes + `parent`, tap-vs-hold Back/Home/Power/Menu via
distinct KeyMapper keycodes (taps on keydown — no webview hold
timers), class-scoped Power (room=All Off, group=page devices,
detail=immediate device toggle, activity=end; confirm for multi-device
scopes + long-press All Off), focus-follows VOL with the media/ARC
carve-out, mute + menu logical buttons, `buttons` bindings with
{navigate} (menu-hold → Apps drawer / Music Library), passthrough cue,
and the key-event debug card (off by default; `#debug=1`). Confirmed
Astrion key map lives in ha/README.md + schema v0.11.2. KeyMapper
TODOs: CH rocker → PageUp/PageDown, Menu long-press → `@`.
v0.10.x: music remote — art-hero Now Playing (artwork, metadata,
interpolated progress), transport ⏮⏯⏭ with ◀▶ roving, shuffle/repeat
mode bar, CH keys = next/prev track (per-screen `buttons` bindings),
Music drawer of self-maintaining MA favorites
(`sensor.porch_music_favorites` → `presets_from` + `$item`), and
"Pull Music Here" via `music_assistant.transfer_queue`. Also v0.9.x:
fan widget + percentage stepper kind; docs/cookbook.md (8 config-only
recipes). Repo `harmonium` is canonical (modular src/, zero-dep
build.mjs → single-file dist/, 6 Playwright smoke suites). Earlier
(v0.9): generated detail screens (`detail:<entity>` —
power/stepper/chips per domain, options from attributes), auto `tune`
trailing zones on device tiles, and the detail-screen VOL exception.
Earlier state (v0.8):

Deployed at `http://192.168.1.87:8123/local/remote-proto/` (HA `www/`)
and running on the Astrion as a Fully Kiosk start page. Working: 6
screens (Porch home w/ self-fitting hero + section jump strip, Watch TV,
Apps, Music, Rooms mock, Comfort); device profiles w/ capability-based
tile visibility (`#device=astrion` / Fully sniff); activity tiles with
real state; presets w/ ensure-activity; trailing-action slot (Now
Playing → Apps drawer); transport row; device button bar; D-pad
passthrough on the TV screen (physical keys → device, touch → UI);
per-activity context switching incl. Fire TV vs Samsung command sets;
ARC-split volume (commands → TV, level → soundbar); home ladder;
hold-power All Off; confirm-to-end; token provisioning via
input_text + script (HA-as-clipboard); perf readout. Engine refactored
v0.8: TIMING tunables, shared DPAD_CAPTURE, wireTaps, trail-id helpers,
architecture header.

HA-side objects created by this project:
- `input_select.porch_activity` (off / watch_firetv / watch_smart / music)
- `script.activity_watch_firetv` / `_watch_smart` / `_music` / `_off`
  / `_music_stop` — all real now. watch_* are WARM-START SAFE
  (v0.12.3): the wake sequence (WOL button
  `button.samsung_wired_wol_d4_9d_c0_2c_e5_bf` — SmartThings `turn_on`
  cannot wake a standby Samsung; field-verified on in ~1.5s — plus
  remote.turn_on + wait-for-on) runs ONLY when the Samsung is off, the
  TV input switches ONLY when not already on a Fire TV source, and the
  Fire TV is NEVER sent Home (it feeds a second TV; the harmonia
  "Fire TV → Home" on_start step kicked the user out of live content
  on a warm start — field bug). A stale activity state now self-heals
  on tap: warm start = state flip + screen open, zero disruption. `_off` = Samsung off + Sonos stop, NEVER
  touches the Fire TV or the ARC soundbar (TV owns it) (it feeds a second TV — harmonia reference:
  on_stop is Samsung off only); starts also select the right TV
  source (Fire TV / Prime Video) after a wait-for-on;
  `_music_stop` = per-activity stop for music
- `automation.porch_sync_activity_state_from_devices` — Fire TV
  "playing" flips the activity ONLY with corroborating evidence
  (Samsung on AND source in [Fire TV, TV/HDMI]); without the guard a
  background-playing Fire TV re-flipped the activity to on within
  ~10s of every All Off, wedging the state machine ("can't turn it
  back on — it thinks it's on"). Now the FULL harmonia state model,
  both directions: Samsung-on maps source→activity, Samsung-off ends
  either TV activity, Sonos playing/idle-15s starts/ends music; ARC soundbar removed from the automation entirely (v0.12.2)
- `sensor.porch_music_favorites` (trigger template sensor in
  configuration.yaml: MA get_library favorites → list attribute;
  refresh on HA start / hourly / `harmonium_refresh_favorites` event)

Known gaps / deliberate debts:
- Material Symbols font loads from Google CDN (self-host or inline SVG in v1)
- Widget steps (brightness ±10%, setpoint ±1°) are constants, not config
- Fire TV/Smart TV favorites-apps grid not built yet (next design topic)
- Config still file-based (custom integration replaces this)
- Astrion Fully Kiosk device entities exist (`*.astrion1_*`) for remote
  URL push once the device is online

## Shell strategy note (2026-07-19)

Fully Kiosk is **featureweight, not renderweight**: rendering is the same
System WebView either way; its cost is the service layer (admin server on
:2323, sensor loop feeding the `astrion1_*` entities, motion/screensaver/
MQTT). Decision: **keep Fully during development** — `load_url` hot-swap,
remote screenshots, and restart-browser are our dev harness — but slim it
(disable motion detection, screensaver, MQTT; stretch sensor interval).
The **minimal APK shell remains the endgame**: single Activity + WebView,
frontend in APK assets (instant boot, no network fetch), native onKeyDown
(retires KeyMapper), wake-lock, ~2-5MB, no services. Trigger to pull the
APK forward: Astrion visibly struggling under Fully even with our page
(watch boot-ms readout / scroll feel). Token provisioning on kiosk devices
uses the URL-hash trick (`#host=…&token=…`, also accepted as query params;
trimmed + quote-stripped, stored then stripped from the URL) — never typed
on-device; paste via Fully's web admin from a desktop.

**Auth onboarding (product):** LLAT-in-URL is DEV ONLY — real users won't
paste 180-char tokens. Ladder for v1+: (1) HA's native OAuth login flow
(`home-assistant-js-websocket` getAuth — user signs in with HA credentials
on the device once; refresh token stored and auto-renewed); (2) HA's
Trusted Networks auth provider for dedicated LAN devices — zero-touch;
(3) best UX, needs our custom integration: TV-app-style pairing — remote
shows a short code, user approves it in the HA UI, integration mints and
delivers the token over the paired channel.

## Roadmap (rough order)

1. TV/media screen deep-dive: favorites/app-launch widget
   (`select_source`), media detail, per-activity favorite sets
2. Custom HA integration: config storage + websocket delivery + remotes
   as HA devices (battery/presence/current-screen entities)
3. v1 frontend: Svelte + forked ha-fusion widgets on our state bus;
   self-hosted icons; declarative community-widget tier
4. Shells: minimal APK (assets-embedded frontend, native keys),
   WPE/Cog image for Pi-class devices
5. Editor: HA sidebar panel (drag-drop), plus one-way Lovelace importer

## Competitive frame

- **Unfolded Circle**: validates local-first + profiles/activities model;
  closed Qt UI layer is its bottleneck — our open widget layer is the moat.
- **Haptique/Cantata**: wants to BE the brain (HA demoted to peripheral);
  useful as market proof and possibly as target hardware, not a platform.
- **ha-fusion / Lovelace / TileBoard**: donor parts, perf baseline, and
  cautionary tales respectively.
