# Harmonium — HA Lightweight Remote Framework

*Purpose: The living document: intent, core thesis, decisions log, and the current-era changelog (newest first). Audience: maintainers; the deep history is in archive/docs/project-history.md.*

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

## Current state (v0.83.11 pending, 2026-08-17 — THE BIG-FILE SPLIT: ActivityCard + __init__.py)

His ask after committing v0.83.10: "Big lift now is getting those
huge code files into manageable world class code." Scope agreed via
AskUserQuestion: **the big two, behavior-preserving** (mechanical
splits, no logic changes; polish = structure and headers only).
Deploy note: `.py` changed → **HACS/copy + HA RESTART** on next
deploy; manifest + ENGINE_V → **0.83.11** (first integration change
after the v0.83.10 tag); STUDIO_V → 0.83.11 b35.

- **ActivityCard.svelte 2,513 → 411 lines** + seven files under
  `components/activity/`: SetupTab (1,077 — the cast, picker, groups,
  ⚙ presentation panels, snippets, ＋ page mint), ControllerTab (380 —
  bands, label slots, presets), RolesTab (204), ActionsTab (212 — the
  generators), StateTab (195), InputsTab (64), lib.js (57 — the shared
  role vocabulary). The spine keeps identity strip, tab bar +
  completion dots, cast/wiring derivations, preview impersonation,
  delete/rename; each tab receives ONE `card` context object (getters
  over the shared $deriveds + the cross-tab verbs). Every moved block
  extracted VERBATIM by line range from the pristine file.
  - Dead pre-cast-era code dropped (grep-proven zero references):
    devicesOn/toggleDevices, newDev/addDevice/removeDevice/
    setPrimary/toggleRole/ensureDevices, CTX_SLOTS, rawOpen.
  - ONE new lifecycle: tabs unmount on switch now, so transient tab
    UI state (picker query, open panels) resets — and SetupTab sweeps
    an open ⚙ panel on the way out ($effect teardown → closePres),
    or the editPres backfill (name:"", sub:"") would persist as
    intentional blanks. probe-activity-tabs asserts the round-trip.
  - **probe-activity-tabs.mjs NEW**: walks all 7 tabs of a real card
    (signature content + zero pageerrors — the net for Svelte's
    unknown-identifiers-compile-as-globals trap), opens a ⚙ panel,
    switches away, saves, asserts a.present unchanged vs fixture.
- **__init__.py 930 → 266 lines** + three modules: `store.py` (126 —
  json/text helpers, deploy-dir migration, HarmoniumStore, engine
  fingerprint), `api.py` (362 — the four HTTP views + validate_config),
  `services.py` (255 — run/reseed/restore_backup/set_activity behind
  register_services(hass, hstore, entry_data, mint) + remove_services).
  Handler bodies verbatim; helpers that now cross module boundaries
  lost the underscore (validate_config, engine_fingerprint, read_json,
  write_json, write_text, migrate_deploy_dir).
  - **tests/test-integration-split.py NEW** (plain python): stubs HA,
    imports every module for real, validates the CT fixture clean +
    catches a broken config, exercises _bind_ws stamping and the
    register/remove service wiring — 12/12.
- **Verified end to end**: vite build green; smoke-studio 107 true /
  0 false; ALL studio probes at baseline (ctrltab, import, spkgroups,
  stock-heal, virgin, collapse, band-order, volstyle, upload);
  engine battery 20/20 errs clean; probe-vol-ux / nogap / wake at
  baseline. ARCHITECTURE (integration file map + card-spine note),
  tests/README (probes section) updated.
- Remaining large files (documented, next candidates): SetupTab
  (1,077 — cohesive, but PresPanel/CastPicker could peel off),
  state.svelte.js (1,673 facade), PreviewPane (991), HubEditor (797),
  TileRow (779), generators.js (766).

## Current state (v0.83.10 pending, 2026-08-17 — the punchlist round: volume truth + mute + doc hygiene)

His morning punchlist (`archive/docs/status-review.md`, 7 items), all
executed. Engine + manifest → **0.83.10** (first change after the
v0.83.9-Beta tag). Deploy = `push-engine.bat` only — no `.py` changed,
no HA restart owed.

- **#1 VOLUME JUMP-BACK FIXED** ("It jumps forward like 5pts and then
  jumps back like 3"): the tap was optimistic +5% but the device's real
  step is smaller, so the HA echo yanked the display back. Now
  `volume.js` holds the optimistic value per level-entity for 1800ms
  (`VOL_OPT`) — a disagreeing echo inside the window is noted but NOT
  shown; at lapse, truth is adopted. The disagreement also TEACHES the
  device's real step (`VOL_STEP` = |echo − truth₀|/taps, clamped
  0.005–0.12), so the second tap onward moves by the device's actual
  increment. Feels accurate after one echo.
- **#7 MUTE, twice over** ("In a browser, Mute is a problem"):
  (a) clicking the volume tile's speaker ICON now toggles mute
  (optimistic glyph flip + `volume_mute`); (b) the mute KEY is
  focus-aware — a focused volume tile (or volume-kind stepper) wins
  over `$context.volume`, so with the Receiver tile selected, mute
  hits the receiver; unfocused it hits the Volume role. Fixing this
  exposed an engine bug: `trailBase()` mangled non-trail ids — now
  strips only when the id actually ends with the trail suffix.
- **probe-vol-ux.mjs NEW** — drives both: optimistic 45% → echo 42%
  ignored during hold → 42% adopted after → next tap 44% (learned 2%
  step); icon-click mute call+glyph; focused-mute targets the
  receiver, unfocused the role. Green; battery 20/20.
- **#6 docs/scripts.md NEW** — all ten root `.bat`s + build scripts
  tabled (daily drivers / backups / build); verdict: none redundant
  (pull-config takes a named house, pull-my-config the default;
  push.bat is the guarded engine under the family). CONTRIBUTING
  links it.
- **#3 KeyMapper in GETTING-STARTED §5** — "skip the button-by-button
  setup": his unpacked `remotes/keymapper/astrion/` (zip + md map +
  xlsx) documented; `push-keymapper.bat` → KeyMapper ⋮ → Restore.
- **#2 beta-gaps refreshed** — new Status block (2026-08-17): beta is
  LIVE on .88, P0 trio struck through as SHIPPED (pairing v0.81, HACS
  v0.83.4, docs v0.83); open items now honestly: mute hardware overlay
  (§6.6), volume_step trait (§6.5), section folding (§6.8).
- **#4 purpose/audience stamps** — every live doc now opens with
  *Purpose: … Audience: …* (~30 files: CONTRIBUTING, SECURITY, docs/*,
  the whole cookbook, houses/README, tests/README). Files never
  touched this session were re-staged FRESH from the device first
  (the stale-mirror trap, §HANDOFF).
- **#5 Group Players docs**: verified already covered —
  creating-an-activity §8 has the Speakers/groups walkthrough from
  the v0.83.7 rounds; no gap found.

## Current state (2026-08-17 — THE CLEANUP, overnight, s0.83.9 b34)

Suresh: "We need to clean up the project… Lets make this a world
class repo." Executed overnight; **nothing deleted — everything
retired moved to `archive/` (tracked) or `_to_delete/` (scratch).
He commits in the morning (`git add -A` detects the renames).**

- **archive/ created** (with a README index): the whole `yaml/`
  authoring era incl. `build.mjs` and his workspace extracts ·
  `config-v1/` (the frozen v1 config) · design history (Studio
  redesign brief+mocks, the external design handoff, both library/
  search design docs, google-tv research, pasted-image scratch) ·
  retired docs (authoring-ui, config-guide, wizard, cookbook-v1,
  status-review, todo-remote-pairing, ha-activities-v1) · session
  dumps (~70 MB) · `images/` source art (~140 MB incl. the topaz
  upscales). NOTE: archiving does not shrink clones — that needs a
  git history rewrite (the harmonium-alpha maneuver), proposed, not
  done.
- **build-engine.mjs is self-contained** — STYLES/SCRIPTS lists live
  in it now (byte-identical output verified); `build.mjs` retired;
  tests/run.sh repointed.
- **PROJECT.md split**: pre-v0.83 changelog (5,272 lines) →
  `archive/docs/project-history.md`; the living doc is 1,263 lines.
- **Docs refreshed**: README (cookbook table synced incl. the
  deep-dive/remote-map/wipe rows, status paragraph now v0.83.9-era,
  dead cookbook.md pointer replaced with screen-schema),
  CONTRIBUTING (archive paths, retired-build note), ARCHITECTURE
  (Studio-owns-config diagram, current API list incl. upload +
  workspaces + pairing, truthful state-layer description, legacy
  compiler section dropped), cookbook README, HANDOFF (§1/§2/§5
  archive pointers, docs map rewritten), new `ha/README.md`
  (firetv-on.json documented; v1 reference archived).
- **STATE LAYER SPLIT (the "no file is too large" pass)**:
  `studio-src/src/lib/stocklib.js` NEW — the pure half (5 stock
  shapes + gen counters, healers, starterConfig, the whole
  normalize* chain; ~770 lines, zero reactive-state references,
  workspace passed as a parameter). `state.svelte.js` 2,290 → 1,673
  lines, re-exporting from stocklib with thin wrappers so every
  component import is untouched. Verified: vite build + smoke-studio
  106/0 + probe-import / upload / spkgroups / ctrltab / collapse /
  virgin / stock-heal all green; engine battery 20/20.
- **Not executed (recommendations for a supervised round)**:
  ActivityCard.svelte (2,513 lines) split into per-tab child
  components; `__init__.py` (930) → api.py/views split; git-history
  rewrite to actually shrink clones of the big archived media.
- STUDIO_V → 0.83.9 b34 (build changed, behavior identical).

## Current state (v0.83.9 TAGGED as v0.83.9-Beta, 2026-08-16 — dialect WAKE, s0.83.9 b33)

Suresh pushed the release as **v0.83.9-Beta** — note the tag string
does NOT equal manifest "0.83.9" (the releasing.md exact-match rule);
if HACS shows a phantom update after install, retag as plain
v0.83.9. If it was marked pre-release, HACS needs Redownload →
pick-version to see it.

v0.83.8 TAGGED and released; this opens 0.83.9 (manifest + ENGINE_V
bumped; his call via the version question).

- **DIALECT WAKE BEFORE APP LAUNCH** (his: FireTV app presets while
  the box dozes — "it actually does the app change but screen
  remains blank or screen saver. I find the back button works"):
  a dialect may declare `wake` — `"key:<id>"` borrows an entry from
  its OWN keys catalog (his case: `wake: "key:back"`), anything else
  rides the classLaunch grammar — plus optional `wake_delay` ms
  (default 600, TIMING.wakeDelay). The apps generator stamps the
  resolved action on every launcher tile; firePreset gates on the
  player's REPORTED state at tap time (off/idle/standby/unavailable/
  unknown) → fire wake, wait the gap, then launch. An awake player
  is never poked (a stray Back could back out of a running app);
  a dialect without wake behaves byte-for-byte as before. Studio:
  the dialect card grew "Wake before launch" + "Wake → launch gap"
  fields (JSON accepted for arbitrary actions). probe-wake.mjs NEW:
  asleep → BACK then Netflix 401ms later · playing → launch only ·
  wake-less dialect → launch only.
- To USE it on CT: Model → Apps & dialects → your firetv dialect →
  Wake before launch = `key:back` (its keys catalog already has
  back) → Save & Deploy. **Engine + .py untouched-restart: engine
  push only — no HA restart for this round so far.**

## Current state (v0.83.8 SHIPPED, 2026-08-16 — image upload + the Poster + apps 2-up + import chooser, s0.83.8 b32)

- **PREVIEW TOOLTIPS NAME THE PHYSICAL KEY** (his: "On Astrion
  hover, show Physical Key info -- i.e. F1, F11 where applicable"):
  every soft key / photo hotspot title now carries `key ‹F1›` from
  the reverse-keymap lookup, and the hold variant names its key too
  (‹› quoting because the Astrion's back/home keys ARE "[" and "]").
- **THE CREATE-GROUP DOOR GOT ITS RETURN TRIP** (his: "I don't get
  the return to Activity option"): Model → Speaker Groups now shows
  the same "← back to <page>" chip the Actions door has, whenever
  you arrived from a room page — one tap back to the activity card.
- Console noise triage (his paste): the "BT UI: … is loaded use the
  other" flood and the button-card double-define DOMException are
  OTHER HACS frontend cards (better-thermostat-ui-card ×
  universal-remote-card, button-card) — HA loads every Lovelace
  resource on every panel including ours, so they appear under
  harmonium-studio:1. Not ours; nothing to fix in Harmonium.
- OPEN (design agreed pending his answer): app-launch WAKE — a
  dialect-level `wake` entry the engine fires before an app launch
  when the context player reports off/idle/standby.

- **IMPORT ASKS WHERE (his: "When I import a workspace it overrites
  main. It should give the choice … we don't allow the import of the
  full workspace (it should, and which workspaces to import)")**:
  Import now parses the file and opens a DESTINATION dialog instead
  of stomping the current draft. Single config → into this
  workspace's draft (safe default; Save & Deploy to keep) · replace
  another workspace (stored + deployed immediately, labeled in red)
  · a new workspace. Whole-house bundles (the "All workspaces"
  export) are now importable: a tick-list per workspace — existing
  ids replaced, missing ids created (server create-with-config;
  freed stamped ids keep their address). Single exports now carry a
  **`_workspace: {id, name}` stamp** (his "we don't actually store
  the workspace name in the json, which is a mistake") — stripped on
  import, used to preselect the right destination ("this file is
  deck" → replace deck). ImportDialog.svelte NEW; probe-import.mjs
  NEW (unstamped single → dialog + create · stamped single →
  replace-deck preselected · bundle → 1 replaced + 1 created ·
  export stamp). workspaces.md documents the doors.

- **UPLOADS MOVED OUT OF THE WIPE ZONE (his call: "Are you sure we
  want our uploaded hero images inside harmonium?")**: hero/banner
  uploads now land in **www/images/ (/local/images/…)** — the
  house's own picture folder, outside the integration's deploy tree,
  which the wipe doc deletes wholesale. Device-photo skins stay at
  www/harmonium/skins/ (Harmonium furniture; re-upload after a
  wipe — wipe doc updated to say both halves out loud). .py changed
  again — same restart covers it.
- **POSTER: ~12px SHORTER** (corrected read — his clarification:
  "the Poster panel was too big, pushing the transport down so it
  got clipped. The Poster needs to be 8-12px shorter"; the artless
  shrink was always fine): pad 4→2, art/progress margins 12→8,
  trail 12→10 — with-art card 505→493px, transport fits above the
  fold; artwork itself untouched; an artless card shrinks naturally
  (the briefly-built placeholder/constant-size machinery is
  REVERTED — misread). probe-np-poster asserts trimmed ≤496 + bare
  shrinks + no placeholder.
- **STAMP CONVENTION** (his: "Why is it 0.83.30 when my release
  seems to want to be 0.83.8?"): STUDIO_V is now
  `"<release> b<n>"` — the footer reads **s0.83.8 b31**, release
  first, per-build fingerprint after (the counter continues the old
  line and never resets). releasing.md documents it.
- STUDIO_V → **0.83.8 b31**; battery 20/20; smoke-studio 106/0;
  probe-nogap / probe-apps-grid / probe-upload-studio /
  probe-import green.


v0.83.7 tagged and live on .88 (virgin install passed); this round
opens 0.83.8 (manifest + ENGINE_V bumped). **The .py changed — the
deploy needs an HA restart.**

- **STUDIO IMAGE UPLOAD (beta-gaps P1 #7 — SHIPPED)**: authenticated
  `POST /api/harmonium/upload` in the integration (multipart; kind
  image|skin; 8 MB cap; png/jpg/webp/gif whitelist + magic-byte
  sniff; slugified name; tmp+rename write; **409 on an existing name
  unless overwrite** — a user's picture is never silently replaced)
  lands files under www/harmonium/images/ (skins/) and returns the
  /local/… path. Studio: UploadBtn.svelte — a 📤 button that is also
  a DROP TARGET — on the Hero banner Image field (fills the field,
  marks the draft) and in the skin map toolbar ("photo…", repoints
  skin.image). The 409 path confirms then retries with overwrite.
  probe-upload-studio.mjs drives the real drop → 409 → confirm →
  overwrite → field filled.
- **NOW PLAYING "POSTER" (his found-in-the-wild screenshot: "I think
  we build this. With a Bar underneath for the Library")**:
  np_style "poster" — stacked big centered artwork (72%, square,
  rounded), title/artist/album centered under it, a REAL progress
  bar with the 0:36 / 4:19 clock (new npClock; the shared 1s ticker
  now walks .poster too), and the chassis trailing restyled as a
  FULL-WIDTH bar named after its destination (trlbl reads the
  target screen's name — "Music Library", "Apps"). No transport, no
  volume — those are bands. Same render() slots as the heroes, only
  the geometry differs. probe-np-poster.mjs green (incl. the
  ticking clock).
- **"Art wash" HIDDEN from the NP select** ("I think we can hide
  the Art Wash option") — the engine still honors wash and a config
  already on it shows "Art wash — full-bleed (legacy)" so the
  select never lies; it's just not offered fresh.
- **APPS GRID 2-UP** ("lets make this grid 2 x 2 (bigger tiles,
  text) and get the alignment right"): STOCK_APPS_DRAWER →
  grid.columns 2, **gen 2** (healStockGen upgrades house copies on
  next Studio load); GENERIC_MEDIA_CONTROLLER's Apps section
  likewise (gen 2); starter-config.json patched. The apps generator
  stamps cls "app" so ONLY app launchers grow: 38px glyph / +10px
  art, 14px label, min-height 96, centered. probe-apps-grid.mjs
  asserts the true 2×2.
- **THE STRETCH, ROUND 3 (it recurred ON s0.83.26)**: the live
  imgW measure fixed X but Y was still COMPUTED (imgW × natural
  aspect — imgNat is one more stale-able input). Now the iframe
  scales each axis to the CLIP BOX'S OWN measured size
  (bind:clientWidth/Height on the aperture div) — the transform
  can no longer disagree with the layout it lives in. Plus the P1
  #9 capture protocol automated: any >2% anamorphic skew
  console.warns every input (sx/sy/clip/imgNat/rect/viewport).
- **P1 #9 SOLVED — THE OVAL WAS `html.nogap` ALL ALONG** (his
  DevTools dig: `html.nogap .trow > * + * { margin-left: 26px }`
  live on modern Chrome; play button 84×84 in CSS, 71×84 drawn;
  killing either the margin or the gap cured it). Chain: the
  flex-gap compat probe (boot.js) measured two zero-height divs and
  read `scrollHeight === 1` as "supported" — but an iframe inside a
  display:none subtree gets NO LAYOUT, scrollHeight 0, so the
  engine booting behind a hidden preview pane (hard-refresh path)
  concluded "no flex gap" and latched `nogap` forever. compat.css
  margins then stacked ON TOP of the working gap, the transport row
  overflowed, and the un-guarded circle squashed. ↻ reloads with
  the pane visible → probe reads right → "fixes itself". Why the
  Studio transform was always exonerated-then-suspected: the skew
  really was 0 — the stretch lived INSIDE the engine. Fix: the
  probe's divs get real heights so the states are distinguishable
  (3 = gap works · 2 = genuinely ignored · 0 = no layout yet →
  RETRY until layout exists, never guess); insurance: `.trow
  .dpbtn/.trbig { flex: 0 0 auto }` — a wrong nogap may overflow
  the row but can never make the circle oval. probe-nogap.mjs NEW
  (direct boot · hidden-boot-then-reveal · forced-nogap circle
  guard); battery 20/20. The skew strip stays as a tripwire.
- **THE SKEW STRIP (s0.83.28 — "Still oval. No warnings in log")**:
  he confirmed s0.83.27 AND the oval after a hard refresh (↻ cures
  it), console clean — so the diagnostic moved ON SCREEN. A red
  strip renders under the photo whenever the engine's scale is >2%
  anamorphic, from TWO independent measurements: "bound" (the
  clipW/clipH the transform uses) and "drawn" (the iframe's real
  getBoundingClientRect box, sampled 1/s — catches a lie from ANY
  input). Oval WITH the strip → the numbers on it name the guilty
  input. Oval WITHOUT the strip → the transform is uniform and the
  stretch lives upstream (photo/pane/compositor), a different hunt.
  Headless sanity: silent at the true rect (0.77% — the known
  rect-vs-viewport delta), loud on a rigged aperture (40.1%, both
  measurements agreeing). Also learned: probes measuring preview
  geometry must LEAVE the Workspace-map slice first — the pane is
  display:none there and every rect reads 0.
- STUDIO_V → **0.83.28**; battery 20/20, smoke-studio 106/0,
  probe-np-poster / probe-apps-grid / probe-upload-studio NEW,
  regression probes at baseline.

## Current state (v0.83.7 TAGGED, 2026-08-16 — KeyMapper landed, release prepped)

- **KeyMapper scripts, battle-tested on his machine**: three field
  bugs found and fixed in one sitting — (a) the empty-arg dot test
  (`echo %~1` prints "ECHO is on." — WITH A DOT — sending the bare
  run hunting a blank :5555); (b) `for /f ('command')` cannot launch
  a space-quoted adb path ("The system cannot find the path
  specified") → temp-file listing + Windows-side findstr; (c) the
  filter said "keymapper" but the real export is **key_mapper.zip**
  → loose *key*·*.zip match. Final shape: USB-FIRST (bare run uses
  the plugged-in device; IP only for adb-over-wifi), adb ships in
  the repo (tools/adb, three files, committed), push verifies the
  zip landed. hardware-keys.md §Backing up KeyMapper rewritten.
- **docs/release-notes-v0.83.7.md** written — paste into the GitHub
  release. make-release.bat confirmed current (studio build → engine
  build → engine bundled into the integration; publish = commit +
  tag matching manifest, no assets).
- Release steps handed to Suresh (see the chat / HANDOFF): pull
  KeyMapper zip + commit → make-release.bat → commit/push → GitHub
  release tag v0.83.7 → HACS update on .88 + restart + virgin
  sanity (volume keys!) → .87 restart for the .py changes.

## Current state (v0.83.7 pending, 2026-08-16 — the stretch pinned + KeyMapper portability, s0.83.26)

- **THE STRETCH, CAUGHT ON CAMERA (P1 #9)**: his 814×2600 shot shows
  the transport's 84×84 play circle as an OVAL — only a non-uniform
  transform can do that, and the skinned preview's iframe scale is
  the only one in the system. Engine exonerated; fonts theory dead.
  The scale math assumed a hard 340px photo width while the photo +
  aperture size in percent of the pane — now measured live
  (bind:clientWidth → imgW, both scale terms). Next occurrence
  protocol in beta-gaps: tap ↻ FIRST — survives ↻ + dies on browser
  refresh = stale transform inputs.
- **KEYMAPPER TRAVELS WITH THE REPO** ("Is there a way to pull
  them?"): pull-keymapper.bat <ip> [name] pulls every KeyMapper
  backup zip from /sdcard/Download into remotes/keymapper/<name>/
  (one-time manual step per export: Back up all → save via the
  Files target — the share sheet's Bluetooth lead is a decoy; no
  headless export intent exists, root would be needed for the data
  dir) + bonus adb backup attempt; push-keymapper.bat <ip> [zip]
  pushes the newest committed zip to a NEW remote and opens
  KeyMapper for the two-tap Restore. hardware-keys.md §Backing up
  KeyMapper documents the flow.
- STUDIO_V → **0.83.26**; ctrltab/nits2/smoke-studio green.

## Current state (v0.83.7 pending, 2026-08-16 — last tidy-ups, s0.83.25)

His five on s0.83.24.

- **#1 NP plain card**: the source gets its own line under the state
  ("Playing" / "Music Assistant Queue") — sub returns state + "\n" +
  source, .tile.wgt-media .sub is white-space: pre-line.
- **#2 volume placeholder for LOOSE wiring**: defaultBandLabel falls
  back to the wired entity's friendly name (then deslugged id) when
  no device claims it — "MA Basement", not "Volume".
- **#3 launcher counts moved to the SUB line** (grouplaunch dropped
  inlineSub) — the title no longer clips against "3 available · 0
  linked".
- **#4a Cast-group cards row** shows a summary — the cast's group
  names, or "none yet — ⊞ Add group in the cast".
- **#4b BUG**: Cast-group cards Off was hiding PROMOTED
  where:"controls" tiles — they merely share the groups generator.
  The band switch now gates the NAV CARDS only (groupsOff scopes
  castGroups, the promoted pass always runs).
- **#5 LOOSE ENTITIES CAN GROUP**: engine groupChildTile renders
  entity members (control per ⚙, device row otherwise); grouped
  loose entities LEAVE the Devices section (groupedIds filter);
  the Studio group ticks now offer extra_devices entities (live
  names), grouped extras nest under the group card (with ✕ untick
  rows), and GROUP CARDS render BELOW the cast rows ("I dont think
  it should sit above the primary role devices").
- **Verified**: probe-group-loose.mjs NEW (entity-member nav card +
  group page rows · grouped light leaves Devices · band Off keeps
  the promoted Deck Amp), full battery 20/20, smoke-studio 106/0.
  STUDIO_V → **0.83.25**.

## Current state (v0.83.7 pending, 2026-08-16 — hero round 2 + the aligned tab, s0.83.24)

His verdict on the panel hero: "It's pretty good. We lost the
original display, bring it back! But this new one should be the
default! ... replacing the icon with the same right side library we
had in the original artwork....but this time, make the background
the dark wash ... Even better if we can fade in that grey."

- **"wash" style — the original hero returns**: dimmed full-bleed
  artwork + the 64px thumb, as its own np_style value ("Art wash —
  full-bleed" in the Studio select). The PANEL stays the default
  for art:true / "art". media.js: npMode knows "wash"; wire adds
  .wash; render splits image treatment (panel src vs bg-wash+thumb);
  the 1s progress ticker walks .art AND .wash.
- **The panel's library trail is the full-height right zone
  again** — original ergonomics — but drawn as a FADE-IN of the
  card's dark wash over the art's edge (gradient 0 → .82), accent
  glyph riding it, 92px wide, :active accent, focus = inset ring
  (border dropped entirely — the transparent 2px border painted a
  hairline seam at the fade's left edge over the masked art, found
  in the probe screenshot).
- **Column discipline on the Controller tab** (his tidy-up note:
  "Lets have all the labels align and the other stuff follow"):
  fixed-width columns — arrows 24px · band name 186px · switch
  88px · label slot 158px (empty spacer where a band has no slot) —
  then the row's selects follow; the label input moved BEFORE the
  selects; the NP Auto option shortened to fit its select.
- **Verified**: probe-np-styles wash stage (class, bg-wash set,
  thumb static) + all stages green; battery 20/20; both heroes
  screenshot-checked; ctrltab + smoke-studio 106/0 after the
  realign. STUDIO_V → **0.83.24**. Docs §8 updated.

## Current state (v0.83.7 pending, 2026-08-16 — ART HERO v2, engine-only)

His mini-media-player screenshot: "we wanted a tile that allowed the
Track data to have space. With an album on one side and a library
selector on the other, there's not much space left."

- **The art is a RIGHT PANEL now**: npimg absolutely positioned,
  full height, ~58% width, full opacity at the right edge and
  CSS-masked to fade into the tile toward the text — the old
  dimmed full-tile wash + 64px thumb are gone, so the words sit on
  clean background at the SAME font sizes (npt/npa/npb untouched).
  npwrap padding trimmed (2px/4px). Progress bar unchanged.
- **The library click survives as a floating glass button**: the
  chassis trailing (the stock music NP tile's accent library jump)
  restyled ON the hero only — bottom-right over the art,
  rgba-glass, z-index above the panel; the full-height right
  column (which was eating the art's best half) is gone on art
  tiles. :active/focus states kept.
- Verified: probe-np-styles still green (hero title/artist/
  progress), full battery 20/20, visual shot (/tmp render) sent.
  Engine-only — STUDIO_V stays 0.83.22.

## Current state (v0.83.7 pending, 2026-08-16 — the truth round, s0.83.22)

His five on s0.83.21 plus the dead volume keys.

- **DEAD VOLUME KEYS (the big one)**: nav→FireTV, volume→Samsung,
  and neither hardware nor soft VOL did anything. Root cause: VOL
  routing lived ONLY in `global.buttons` config — the fixture has
  the bindings, the STARTER CONFIG never did, so fresh installs
  ship dead volume keys. Fixed at the ENGINE level (doctrine: VOL
  is always audio): unbound vol_up/vol_down now default to
  media_player.volume_up/down on `$context.volume` — the mute
  pattern; a config binding still wins. Starter config also gained
  the explicit bindings. input.js + starter-config.json.
- **#3 VOLUME BAND = THE VOLUME ROLE** (his definition, agreed):
  the band-label override applies ONLY to the tile whose entity is
  the activity's wired volume; every other volume tile is
  per-device — volumes-cast rows (bandGen unless ve ===
  context.volume), PROMOTED controls (groupChildTile/looseShowTile
  now stamp bandGen — typing a band label had renamed his promoted
  Receiver), loose shows-tiles. Deselecting in the cast remains the
  way to remove a promoted control.
- **#2 "Hero seems the same as Standard"**: it WAS — the stock
  music controller's surface tile says art:true, so Auto/Standard
  already drew the hero. np_style gained **"plain"** (Standard
  card, suppresses art:true) and the Studio select is honest:
  Auto — the surface's choice / Standard card / Slim row / Art
  hero.
- **#1 slim autoscroll**: overflowing "Title — Artist" marquees
  end-to-end and back (CSS alternate loop, distance measured into
  --npshift; re-measured only when the line changes).
- **#4 truthful placeholders**: each label slot's placeholder shows
  what the band ACTUALLY says today (defaultBandLabel: authored
  tile label / wired-volume device name / speaker-group name /
  section title), so "blank" no longer lies.
- **#5 Presets + Devices slots**: those bands are their SECTION
  HEADINGS — band_labels.presets/devices override sec.title in
  render.js ("" = no heading).
- **Verified**: probe-np-styles extended (plain-beats-art, marquee
  class + shift, promoted-Receiver exemption, wired-volume-only
  label, heading override + removal), probe-ctrltab (placeholder
  selector). Battery 20/20, all probes green, smoke-studio 106/0.
  STUDIO_V → **0.83.22**. Docs: creating-an-activity §8 label-slot
  paragraph rewritten; hardware-keys.md notes the VOL default.

## Current state (v0.83.7 pending, 2026-08-15 late — dressing round, s0.83.21)

His three on s0.83.20: the stretch again, the Controller-tab hints,
and "3 renderers" for Now Playing.

- **#1 stretch (P1 #9, still no repro)**: hedged twice — engine
  boot.js forces ONE re-render on document.fonts.ready (a refresh
  cures the stretch, which smells like layout measured before fonts
  settle), and the preview toolbar gained **↻** beside 📷 (reloads
  the ENGINE iframe only — the one-tap cure). If it recurs on
  s0.83.21+ the fonts theory is dead → 📷 + stamp.
- **#2 band-label slots**: the italic hint text is gone (hover
  keeps it — row title attr). Single-tile bands (np, transport,
  modes, volume, sources, speakers) each carry a small label input:
  `surface.band_labels.<band>` — typed text renames the band's tile
  on the remote for THIS activity, **empty = NO label** (.lbl:empty
  collapses), ↺ restores the default. Engine: `surfDressTile()`
  (context.js) applied in BOTH derivations (render pipeline +
  tilesOf — renderStates re-derives there; an undressed twin fed
  sub()/render() the wrong tile, caught by probe). Per-item bands
  (volumes cast, presets, devices) keep their own names — the
  volumes generator stamps `bandGen` and the pass skips it.
- **#3 THREE NOW-PLAYING RENDERERS**: media tile `style` —
  *Standard* (the card), **slim** (one-liner: graphic_eq indicator,
  accent while playing, "Title — Artist", chassis trailing/library
  jump intact, queueing message rides the line), **art** (the
  existing art:true hero — background art, npt/npa/npb at the same
  font sizes, live progress, no transport/volume — style:"art" is
  now its first-class name). Ladder: tile.style → surface.np_style
  (a Select on the Controller tab's Now Playing row) → default.
- **Verified**: probe-np-styles.mjs NEW (three shapes + band_labels
  override + ""-collapse + volumes-cast names untouched),
  probe-ctrltab extended (hints gone, label input + Slim select →
  POSTed band_labels/np_style). Battery 20/20, all probes green,
  smoke-studio 106/0. STUDIO_V → **0.83.21**.

## Current state (v0.83.7 pending, 2026-08-15 night — the volume-row round, s0.83.20)

His five on the deployed s0.83.19 (screenshots from .87).

- **#1 stepper gap**: the −/track/+ row sat tight under the title —
  `.steprow.vol { padding-top: 6px }`, the same breath the fat
  slider's track takes.
- **#2 + #3 THE VOLUME ROW**: every grouping-card member row now
  carries `[−] [fat track with the % INSIDE it] [+]` under the name
  line (rslrow / rslpct; −/+ = optimistic nudge + volume_up/down at
  the member; slider = direct volume_set). Always out on the
  spkgrp: screen (the old thin trim track and the loose name-row %
  are gone — alignment tidies itself); on the INLINE card his
  choice (2): tap the player's NAME to reveal/hide its row —
  per-member, session-local (GRP_EXPANDED), collapsed rows keep the
  little % beside joined names.
- **#4**: the Controller-tab Players select gained **＋ Create
  group…** → jumps to Model → Speaker Groups (selectSlice, the
  actions-door pattern), surface untouched.
- **#5 Cast-group cards**: walked through in chat (⊞ Add group in
  the cast → named sub-set of cast DEVICES → nav card on the
  controller → generated group: page; vs Speaker Groups =
  workspace-wide join targets for the running stream).
- **Verified**: probe-speaker-groups (volrow: % in track, −/+ at
  the member), probe-grouping (inline expand: hidden at rest → tap
  shows row → slider sets only that member → tap hides),
  probe-spkgroups-studio (the __new door renders the editor, saved
  config unchanged). Battery 20/20, smoke-studio 106/0.
  STUDIO_V → **0.83.20**.

## Current state (v0.83.7 pending, 2026-08-15 evening — first-sight fixes, s0.83.19)

His screenshots of the new spkgrp screen, minutes after the deploy.

- **#1 the big left icon**: the spkgrp screen's card rendered in ROW
  mode (columns-1 screen), hanging the icon in a full-height left
  column. `brRow: false` on the generated tile → the card chassis:
  icon on the title line, sub inline. probe-speaker-groups asserts
  notRow / iconInTop / subInline.
- **#3 Draws-as vs Volume style overlap**: "Volume − / +" was a
  second volume entry in Draws-as while Volume style offered
  stepper too — and shows:volume + style:stepper was silently
  IGNORED by groupChildTile/looseShowTile (compact drawn instead).
  Unified: ONE Draws-as entry (*Volume control*), the style select
  picks the shape — groupChildTile/looseShowTile now route
  style:stepper to the stepper tile; legacy `shows:"stepper"`
  stays honoured engine-side and the Studio sweeps it to
  volume+style:stepper on load (normalizePresentShows). The
  "slightly squashed" fat bar: .sldr.inrow height now 46px,
  matching the −/+ buttons exactly. probe-volstyle-unify.mjs NEW
  (stepper shape / slider shape / legacy alias);
  probe-spkgroups-studio now seeds a legacy entry and asserts the
  sweep lands volume+stepper in the POST. Battery 20/20,
  smoke-studio 106/0. STUDIO_V → **0.83.19**.
- His **#2 arrived truncated** ("On the inline,") — asked.

## Current state (v0.83.7 pending, 2026-08-15 afternoon — SPEAKER GROUPS + the stepper shape)

"OK - do the grouping work" — the building block from his morning
proposal, plus the unanswered half of his #4 (Slider vs Stepper
"pretty much identical... Maybe Volume Stepper is like Compact
except a fat slider bar").

- **SPEAKER GROUPS**: `CONFIG.speaker_groups.<id> = { name,
  entities }` — named, workspace-level joinable-player sets,
  deliberately independent of any cast (cast = "what the activity
  uses"; group = "what is joinable" — the amplifier-receiver stays
  out, the MA players outside the cast get in). The speakers band
  points at one via the tile's `group:` or the activity's
  `surface.speakers_group` (Controller-tab select), with
  `mode`/`surface.speakers_mode`: **launcher** (slim grouplaunch
  tile, "5 available · 2 linked", lit when linked; select →
  generated `spkgrp:<id>` screen) or **inline** (the full card in
  place). Group-fed defaults to launcher, cast-fed stays inline —
  deployed configs render unchanged.
- **The spkgrp: screen** (details.js, VIRTUAL_PREFIX member): the
  grouping card with `sliders: true` — a fat trim track per player
  (direct volume_set, join state irrelevant — trim BEFORE linking),
  levels always visible, master row shown as the anchor
  (join/vlink hidden, accent name). Master resolution: the
  (presumed) activity's player resolved at screen build — NOT left
  as `$context` (an unwired $context hides the tile in
  visibleTile) — else the card's new `grpMaster()` fallback:
  coordinating member → playing member → first listed; the
  gmaster anchor un-sticks if the master changes as states arrive.
- **Volume link scope**: stays PER-DEVICE (his question) — the
  whole point is the bedroom speaker holding its own level while
  the patio pair rides; a global toggle would re-create the
  slam-everything behavior the delta math exists to avoid.
- **STEPPER VOLUME = ITS OWN SHAPE** (his design): "Vol n%" on the
  title line (inline sub — wgt-stepper CSS now hides only the
  block sub), the fat track IN the − / + row (`.sldr.inrow`,
  flex:1), no second track, no big numeral; muted → "Muted" +
  dimmed track; −/+ still step; other stepper kinds untouched.
  Four volume styles, four shapes.
- **Studio (s0.83.18)**: Model → **Speaker Groups** editor (slice +
  CenterPane route + SpeakerGroupsEditor.svelte: add/rename-slug/
  delete with dangling-reference sweep, EntityPicker player rows
  media_player-filtered, used-by subtitle); Controller tab Speakers
  row gained the **Players** (cast / named groups) and **Card**
  (Launcher/Inline, auto label follows the group choice) selects
  via setSurfKey.
- **Verified**: probe-speaker-groups.mjs NEW (launcher + counts
  live via mutable-STATES mock, spkgrp screen rows/trims, join at
  the ACTIVITY's master from outside the group, trim hits one
  member, inline mode, no-activity fallback master = coordinator),
  probe-stepper-vol.mjs NEW (shape/drag/step/mute; brightness kind
  keeps the big numeral), probe-spkgroups-studio.mjs NEW (editor
  mints group + typed players; Controller selects; Save & Deploy
  POST carries speaker_groups + surface.speakers_group — the guard
  against a future normalize sweep eating the new top-level key).
  Full battery 20/20, all 17 probes green, smoke-studio 106/0.
- Ship: same pending v0.83.7 — make-release.bat → push-all.bat →
  hard-refresh (s0.83.18).

## Current state (v0.83.7 pending, 2026-08-15 — controller-tab feedback round)

His five (six) notes on the fresh Controller tab, plus a follow-up
mid-round: "In grouped media players, one can link the player(s) and
a separate toggle should be to link their volume."

- **#1 Band reordering**: each band row on the Controller tab has
  ↑↓ move buttons; the order is stored as
  `a.surface.band_order` (array of band keys). Engine:
  `surfOrderTiles()` in context.js permutes the BAND tiles within
  their section pre-expansion (render.js) — non-band tiles keep
  their exact slots, generators keep identity, <2 band tiles = no-op,
  unlisted bands trail in source order. Per-activity, like every
  surface preference.
- **#4 Volume % said twice**: slider-mode volume tiles showed
  "Vol 76%" on the title line AND "76%" center. The center readout
  owns the number now — slider-mode `sub` returns "" (muted included:
  the glyph + dimmed track carry it). Compact mode keeps "Vol n%" /
  "Muted" titles — its meter has no numeral.
- **#5 Preset pickers**: the preset Service field is a searchable
  dropdown (new ServicePicker `prefer` prop — media_player.* services
  rank first), and Target Entity prefers the cast's entities
  (ActivityCard passes deviceList(); HubEditor derives
  `pageCastEnts` from its owned activities for page presets).
- **#3 "Group cards" row** meant the nav cards for cast groups made
  with ⊞ Add group — relabeled **"Cast-group cards"** to kill the
  collision with his proposed Speaker Groups block.
- **VOLUME LINK (the follow-up)**: joined rows on the grouping card
  carry a second toggle — volume link. Default linked; unlinked
  members keep playing in the group but the group-volume slider
  skips them (and the track averages only the linked set). Client-
  side session state (like a pre-link trim), sticky across
  unjoin/rejoin. Master always linked (its level is the volume band).
- **Verified**: probe-band-order.mjs NEW (default order · flipped
  per band_order with a wedged non-band tile holding its slot ·
  single-band no-op), probe-ctrltab.mjs extended (↑↓ writes
  band_order into the POST; row selectors updated for the arrow
  column), probe-grouping.mjs extended (vlink toggle only on joined
  rows · unlinked member skipped by the slider · relink rides
  again), probe-mute.mjs extended (slider-mode sub "" + compact
  "Muted"/"Vol n%"). Battery 20/20; smoke-studio 106/0; all feature
  probes green. STUDIO_V → **0.83.17**.
- **Docs**: creating-an-activity.md §8 — arrows paragraph,
  Cast-group cards, the volume-link sentence;
  activity-controller.png re-shot (arrow column visible).
- **#2 Speaker Groups building block**: design discussion open (his
  proposal: named groups like "Outdoor Music Players", launcher tile
  "5 available · 0 linked" → group card, or inline mode) — no code
  yet, proposal sent back.
- Ship: same pending v0.83.7 — make-release.bat → push-all.bat →
  restart HA → hard-refresh (s0.83.17).

## Current state (v0.83.7 pending, 2026-08-14 evening — THE CONTROLLER TAB)

Suresh: "I think our entire paradigm needs an important change. What
if I don't want to control multiple players. What if I do. Should we
have a controller tab, (in activities) where we turn knobs and
settings for a given controller?" Yes — and it's the missing Harmony
question ("what does the screen show while this runs?"), built as
per-activity preferences on the SHARED surface. Presets folded in
(his sub-question: yes — tab count stays even).

- **The mechanism**: `a.surface` — the per-activity home
  surface.devices pioneered in v0.48 — now carries a switch per
  band: np, transport, modes, volume (+volume_style), speakers,
  groups, sources, presets, devices. Absent = Auto = the band's own
  rules (zero migration, zero first-run change); false = off, for
  THIS activity only. The stock surface stays shared and healable;
  the preference exports/duplicates with the activity. Custom
  copies remain for structural surgery — the tab says so.
- **Engine**: generator bands (volumes/speakers/groups/presets/
  devices) gate pre-expansion in generators.js (srfOff); fixed
  singletons (media→np, transport, mediabtns→modes, sources,
  volume incl. stepper-volume) gate in visibleTile on
  controller-class screens only — room pages unaffected. The
  volume-style ladder gained the activity rung: tile → member ⚙ →
  device_options → ACTIVITY surface.volume_style → theme/global.
- **Studio**: the Presets tab became the **Controller** tab (same
  slot, keeps the preset count badge). Contents: the controller
  strip (moved OUT of Setup — Setup is back to identity + cast +
  navigate-to with a one-line signpost), band rows derived from
  what the target controller ACTUALLY renders (walk its tiles;
  only present bands get a row), Auto/Off switch each + the volume
  style select, and the whole presets editor folded beneath. Tab
  dot = any override present or presets exist.
- **ALSO: the grouping card reads loose entities now** (same
  evening, his screenshot: two raw media_players cast, no
  pre-wired devices, no card): the speakers generator collects the
  wired context.media_player + extra_devices + legacy a.devices
  media_player.* entries too, and rows without a baked name pick
  up live friendly_name on first state (probe-grouping-loose.mjs —
  his exact shape).
- **Verified**: probe-ctrl-bands.mjs (engine: off hides
  transport/volume/speakers while Now Playing stays; Auto returns
  all), probe-ctrltab.mjs (Studio: tab in place, strip moved, all
  9 rows on the gen-2 music stock, toggle → POSTed
  a.surface.{band}:false, presets folded, Setup strip gone).
  Battery 20/20; all 10 probes green; smoke-studio 106/0.
  STUDIO_V → **0.83.16**.
- **Docs**: creating-an-activity.md §8 rewritten as "Controller —
  what the screen shows" (strip / band switches / presets), tab
  list + Setup section updated; full screenshot set re-shot
  (activity-controller.png new, activity-presets.png retired).
- Ship: same pending v0.83.7 — make-release.bat → push-all.bat →
  restart HA → hard-refresh (s0.83.16).

## Current state (v0.83.7 pending, 2026-08-14 afternoon — the queue round)

Suresh: "try and knock a few off — over to you." Three came off:

- **THE SPEAKER GROUPING CARD SHIPPED** (beta-gaps §3, P1 #4 — the
  oldest open feature). Engine: new `WIDGETS.grouping`
  (src/widgets/grouping.js, registered in build.mjs) — the cast's
  players as rows, join/unjoin toggle per member against the MASTER
  (standard HA contract: truth = the master's `group_members`;
  join = media_player.join at the master, leave = unjoin at the
  member; no platform sniffing — Sonos native and MA both honor
  it), plus a GROUP VOLUME slider that moves every joined member by
  the SAME DELTA from the group average — offsets preserved, the
  mini-media-player lesson. Optimistic everywhere, house style.
  New generator type `speakers` expands from the RUNNING activity's
  cast (every media_player claim; authored `entities` list wins) —
  fewer than two players = no card. STOCK_MUSIC → **gen 2** with
  `{id:"spk", type:"speakers"}` after the volume band; healStockGen
  upgrades every non-variant copy on load (parent preserved, custom
  copies untouched). Probes: tests/probe-grouping.mjs (render/
  join-at-master/unjoin-at-member/delta-math — drag to 0.8 over a
  0.3+0.7 group → 0.6 and 1.0-clamped, unjoined speaker untouched)
  and tests/probe-stock-heal.mjs (gen-1 → gen-2 heal with parent
  kept). One hardening: setPointerCapture wrapped (synthetic
  pointer events carry no id).
- **ONE VERSION IN THE HEADER** (Suresh: "We show TWO version
  #'s!"): the header now shows only the s-stamp; integration and
  deployed-engine versions moved into its tooltip. probe-stock-heal
  asserts zero v-chips.
- **SMOKE-STUDIO SELECTOR REFRESH** (the six pre-existing falses,
  backlogged since the collapse round): "Activities — owned by this
  room" → the ＋ Add activity anchor; the dead `startPicker: false`
  placeholder → a real used-by assertion; 'Watch TV' → 'TV Media
  Player' (stock rename); the doorway→nav wording sweep (Add nav /
  New nav / new_nav). smoke-studio now **106 true, 0 false**.
- Full battery 20/20; all seven feature probes green. STUDIO_V →
  **0.83.15**. NOT built: the true factory-reset door — deferred
  pending Suresh's verdict on "Clear to a fresh start…".
- Ship: same pending v0.83.7 release — make-release.bat →
  push-all.bat → restart HA → hard-refresh (header reads
  **s0.83.15**, one number). The grouping card appears on any music
  controller whose running activity casts 2+ players.

## Current state (v0.83.7 pending machine build, 2026-08-14 — the overnight round)

Suresh's docs/status-review.md (three items, two screenshots) +
"one more pass" on the activity deep-dive, worked overnight:

- **MUTE INDICATOR** (engine, review #1 "no on remote indicator of
  mute status"): the volume widget now reads `is_volume_muted` from
  the reporting entity (level_entity when split, else the command
  entity). Muted → title line says "Muted", the slider-mode center
  % becomes an accent `volume_off` glyph, and the track/meter fill
  drops to 30% opacity (the level stays visible so unmuting lands
  where you expect). Unmuted → everything returns. volume.js
  volMuted() + render(); controls.css `.vmute` / `.muted i`.
  ENGINE_V → **0.83.7**. Probe: tests/probe-mute.mjs (both
  directions via live state diff); full battery 20/20.
- **THE SOUNDBAR INPUTS ROW** (Studio, review #2 "Why is the
  soundbar not showing in the input sources?"): inputTargets
  filtered on the role KEYS source_select/media_player — a soundbar
  cast only for volume/volume_level never got an Inputs row even
  though its claims point at a media_player with a real source list
  (HDMI/optical/BT). New inputEnt() helper: source_select claim,
  else media_player claim, else ANY claimed media_player.* entity —
  used by both the Inputs tab and the generated Start's
  switch-if-needed step, so they always agree. STUDIO_V →
  **0.83.11**. Probe: tests/probe-inputs-soundbar.mjs (fixture's
  porch_soundbar, volume-only claims → row appears with its
  sources); probe-virgin + probe-collapse re-run green.
- **THE STRETCHED FIRST-LOAD** (review #3, "toggling the preview
  view seems to fix it"): could NOT reproduce headlessly —
  tests/probe-stretch.mjs (kept in repo) opens the Watch Fire TV
  card cold with the astrion skin and measures the photo-mode
  iframe before/after the Controller↔Room-page toggle: layout
  349×581 and transform identical both times. Suspects that survive:
  slow photo/asset load on real LAN (imgNat default is the old
  1280×4084 aspect — only 0.1% off, shouldn't be visible), or a
  stale cached studio.html. FIELD DIAGNOSTIC for next occurrence:
  when it looks stretched, press 📷 — if the PNG is ALSO stretched
  the engine content is wrong (viewport), if the PNG is clean it's
  Studio-side compositing; and note the footer s-stamp. Logged in
  beta-gaps.
- **THE SCOPED STOP** (same round, Suresh reading the generated
  step: "It sets Room to Off. But what if there is another activity
  running?"): the generated Stop's `harmonium.set_activity off`
  carried NO room — and the integration's off-with-no-room is
  ALL-OFF, every select in the workspace. On a one-room box it
  looked right; on CT it would have ended every room in the house.
  buildStopActions now stamps `room: a.room_view`. Existing
  hand-authored sequences (music_stop, all_off) keep their bare
  form — all_off's is the point. Probe:
  tests/probe-stop-scope.mjs (generate → Save → POSTed step reads
  {activity:"off", room:"porch"}). NOTE: within a room only one
  activity runs at a time (one select), so ending the room IS
  ending this activity; the room scope is what was missing.
- **THE STOP IS CONDITIONAL NOW** (revision, same day — Suresh: "a
  room can run MORE than one activity at a time… If I long press
  Watch TV, I want Watch TV turned off. Not the whole room."): the
  scoped off gained a guard — the generated Stop clears the room's
  routing ONLY `if` the select still holds THIS activity
  (condition: state == activity id on the minted select, computed
  from the workspace-prefixed pattern; duplication retargets it).
  Model made explicit: the select is the FOCUS (controller, keys,
  context — one activity), device truth is what lights tiles
  (several at once). Ending Watch TV while Music holds the room now
  powers off Watch TV's checked devices and touches nothing else.
  probe-stop-scope.mjs verifies the full if/then shape. The
  first-class multi-activity question → beta-gaps design note.
- **THE #4 ERROR, FOUND IN .87's LOG**: "workspace 'main' has no
  sequence 'porch_watch_fire_tv_stop'" — the long-press ran the
  DRAFT's stop ref while harmonium.run reads the SAVED store; he
  hadn't deployed the freshly generated Stop. Not a bug — the
  draft/saved seam — but the error now says so: handle_run's
  message adds "if you just created it in the Studio, Save & Deploy
  first (the remote, the preview's taps, and ▶ Test all run the
  SAVED copy)".
- **THE $device SUBSCRIBE LEAK** (found in the same log, unreported:
  4× "Entity ID $device is an invalid entity ID" on 08-13): one
  unresolved token in subscribe_entities and HA rejects the WHOLE
  message — the page then gets no state updates (the 2026-07-26
  failure class again, new door). entitiesFor() now has an EXIT
  GUARD: only ids with a dot and no $-token leave the function.
- **THE ICON FONT GATE** (Suresh: "font and display are messed up.
  A page refresh clears it"): Material Symbols loads from Google
  after first paint, so icons render as ligature TEXT
  ("play_circle") until it lands — and stayed that way on slow
  fetches. app.css hides `.material-symbols-outlined` until
  App.svelte confirms the font via `document.fonts.load()` (adds
  `.fonts-ok` on <html>; 3s fallback so a blocked font degrades to
  ligature text, never to invisible icons). STUDIO_V → **0.83.12**.
- **Doc stranger pass** (creating-an-activity.md): added "open the
  Studio from the HA sidebar" grounding + a ten-step "route you'll
  take" checklist up front, prefer-the-⊞-rows guidance in the cast
  picker, what "reload the remote" concretely means (browser
  refresh / Fully Kiosk / Save+Reload Astrion), and a
  "picker can't find my device" troubleshooting entry (HA-side
  registry, not Harmonium config).
- Ship (morning): `node build-engine.mjs` + `cd studio-src && npm
  run build` on the machine → make-release copies the engine into
  custom_components → commit + tag **v0.83.7** (manifest bump still
  needed at that point: 0.83.6 → 0.83.7) → HACS update on .88.

## Docs: the activity deep-dive (2026-08-13)

**docs/cookbook/creating-an-activity.md** — Suresh: "every step,
every knob, every option, with screenshots." The long-form twin of
activities.md (cross-linked both ways; cookbook README row added).
Written from a full source walk of ActivityCard.svelte, so every
control is documented at code level: the five concepts (state vs
orchestration, host pages, the pre-wired library with
claims/dialect/traits, cast vs roles, shared controllers), the
identity strip, tri-state tab dots, Setup (kind, navigate-to +
page minting, controller strip, the cast picker's three row kinds,
primary rules, understudy/no-claim annotations, the full ⚙
presentation vocabulary incl. intentional-blank semantics, groups,
snippets), all 8 roles as a table with claim-promotion (＋ add the
claim / ↥ save claim), Inputs, Actions (exact generated Start/Stop
step shapes, the never-guess-power directive, the _v2
no-overwrite rule, the no-stop fallback chain), Presets, the four
State modes + both generators, Advanced, save/test truths, and six
troubleshooting entries. **Eleven screenshots** shot headlessly
from the REAL Studio (s0.83.10 build) running the CT fixture —
tests/shoot-activity.mjs (kept in the repo; element-cropped
CardRow shots, stubbed live states so Inputs/pickers show real
material) → docs/media/activity-*.png @2x.

## Current state (s0.83.10 Studio, 2026-08-13 — pending machine build)

s0.83.10 — **COLLAPSIBLE COLUMNS** (Suresh: "hide/collapse columns…
especially the 1st column and the preview column"; local for now, no
release tagged). Two header icon toggles next to the theme button —
**◧** folds the 252px nav column, **◨** folds the 372px preview
column — and the center editor takes the width. Buttons dim at 40%
opacity when their column is hidden; tooltips explain both states.
Choices persist per browser (`hakr_studio_nav_hide` /
`hakr_studio_pv_hide`). Both panes are HIDDEN, never unmounted: the
NavPane keeps ⌘K search alive, and the preview keeps the engine
iframe's state (same rule the workspace-map slice already used —
pvHide just rides it). Probe (tests/probe-collapse.mjs): nav
252→0→252 px, preview iframe zero-width but the engine frame alive,
localStorage persisted, state survives reload with dimmed buttons,
no console errors. STUDIO_V → **0.83.10**. Ships with the next
`cd studio-src && npm run build` + tag; no integration change.

## Current state (v0.83.6, 2026-08-13)

v0.83.6 — **THE BUNDLED SKIN** (fourth .88 field report: "No photo
for astrion"). v0.83.5's starter seeded the astrion *profile*
(keymap, capabilities) but the device-photo skin needs
`www/harmonium/skins/astrion.png` — which a fresh box doesn't have,
and the skin block wasn't in the starter either.

- `custom_components/harmonium/skins/astrion.png` now ships in the
  integration (the real 1.9MB 814×2600 export, copied repo-side from
  skins/). Setup deploys every bundled skin to
  `www/harmonium/skins/` — **only if absent, NEVER overwriting** (a
  user's own photo of their own remote always wins); non-fatal
  OSError doctrine, same as the engine deploy. Simulated: fresh
  deploy ✓, idempotent re-run ✓, user-modified file survives ✓.
- starter-config.json's astrion profile gained the full **skin
  block** (SKIN_ASTRION verbatim from PreviewPane: image path,
  viewport 349×581, screen 10.07/3.764/80.59/41.77 with the
  field-trued y, all 23 buttons). PreviewPane derives the photo
  straight from `profile.skin`, so a fresh install's Studio lands
  previewing ON the photo with zero clicks. Probe
  (tests/probe-starter-skin.mjs): boot with the seeded config →
  device defaults to astrion, photo img present, engine renders
  home in the aperture, status "loaded — 1 views", no errors;
  starter still passes _validate clean.
- **.88 note**: its store was seeded by v0.83.5 WITHOUT the skin,
  and the seed (correctly) never reruns on a populated store. After
  the v0.83.6 restart deploys the PNG, one click applies the skin
  there: Preview as astrion → **🖼 device photo** (the preset) →
  Save & Deploy. Fresh installs after v0.83.6 need nothing.
- **Log-visibility lesson from the v0.83.5 verify**: the seed logs
  at INFO and HA's Settings→Logs UI shows WARNING+ — "nothing in
  logs" is the expected sight of a SUCCESSFUL seed. The real check
  is `/local/harmonium/config.json` answering with JSON.
- manifest → **0.83.6**.

## Current state (v0.83.5, 2026-08-13)

v0.83.5 — **THE VIRGIN STUDIO** (the .88 stranger-path test keeps
earning its keep). v0.83.4 installed and the engine deployed — the
pairing banner even lit up — but the Studio opened DEAD: red
"no config found (API 404, /local fallback failed: HTTP 404)" and an
empty editor. On a fresh install there is nothing stored and nothing
deployed, so both doors 404 and boot() just returned. The README
promises "look around the starter config"; the virgin path delivered
an error banner instead.

- **Virgin boot mints the starter** (state.svelte.js, s0.83.9): the
  exact branch "API answered 404 AND /local fallback failed" is now
  read as *fresh install, empty store* — not an error. boot() loads
  `starterConfig()` into the editor as a draft, lands on the
  workspace map, and the status pill says: "fresh install — starter
  workspace loaded (a draft). Look around, then Save & Deploy to
  create your config; remotes can load it after that." First Save &
  Deploy POSTs main (the API creates main on POST), which writes the
  store AND deploys config.json. `app.virgin` clears on save.
- **THE SECOND LATENT BUG, caught before the field hit it**: from an
  EMPTY draft, `starterConfig()`'s stock drawers are PLANTED by
  ensureStockControllers (not copied from live) — and a planted
  drawer carries its stock `parent` (`controller:tv` /
  `controller:music`) pointing at controllers the blank config
  doesn't have. The integration's `_validate` rejects dangling
  parents, so the very first Save & Deploy would have 422'd. Fixed
  with a navigable-set sweep at the end of starterConfig(): any
  `parent` whose target isn't in THIS config is dropped. (Same class
  as the "unknown parent" bug from the first live workspace-create —
  this was its virgin-path twin.)
- **Probe-verified end-to-end** (tests/probe-virgin.mjs, kept in the
  repo): stubbed API (config 404, empty roster, /local 404) + real
  engine in the preview → boots to the map with the fresh-install
  status (no red), preview renders the starter's home hub, Save &
  Deploy POSTs, and the posted config runs through the REAL
  `_validate` (extracted verbatim) → **zero problems**. Full
  smoke-studio re-run: identical results to the pre-change baseline
  (six pre-existing selector-drift falses noted below — not
  regressions).
- **THE SERVER-SIDE STARTER SEED** (same release, Suresh's call:
  "if there is no config, we should create one; if there is one, we
  leave it alone"): the integration now bundles
  `custom_components/harmonium/starter-config.json` and
  async_setup_entry seeds it when the store is empty AND nothing is
  deployed — saving the store, deploying config.json, and writing
  the main/ stub in one setup pass. The three doors, in order: store
  has workspaces → touched by NOTHING (updates never overwrite);
  store empty + config.json deployed → the existing adopt-from-
  deployed path; store empty + nothing deployed → bundled starter.
  Non-fatal like the engine deploy (bad/missing starter = logged
  warning, Studio's s0.83.9 virgin fallback still covers it; the
  seed validates through `_validate` before it commits).
- **What's IN the starter** (extracted from the fixture's system
  layer, verified house-free): input policy, `default` + `astrion`
  remote profiles with their full keymaps (34 keys), theme, the app
  master list (13 apps) + all 3 dialects (firetv/tizen/googletv),
  and the ENTIRE stock controller library — tv, music, apps,
  music_library, climate, light, cover, fan, switch (all
  $context-driven; only generic service names inside). tv/music's
  `parent: porch` content edges stripped; apps→controller:tv and
  music_library→controller:music survive (targets present). Content
  zeroed: devices, entity_options, activities, sequences; screens =
  one "New Room" home hub. This fixes what the Studio-side starter
  couldn't: it has no STOCK_TV and ships `apps: {}` from an empty
  draft — the bundled starter has the full library.
- **Verified**: starter passes the real `_validate` (zero problems);
  the real engine renders it headlessly (tests/probe-starter-engine.
  mjs — screen=home, "New Room", no errors); the seed branch
  simulated across all four cases (virgin → save+deploy; adoption →
  starter stays out; populated store → untouched; starter file
  missing → non-fatal warn). `_write_json` mkdirs parents, so the
  seed survives a box with no www/ at all.
- **Ordering truth for a fresh install**, now moot but documented: a
  remote can PAIR before the first save (the broker is
  config-independent) — and with the seed, it renders the starter
  home hub immediately instead of 404ing. The Studio opens on a real
  stored config; its virgin branch remains as the safety net.
- manifest → **0.83.5**; STUDIO_V → **0.83.9**. Studio-only change:
  machine steps are `cd studio-src && npm run build`, commit + push,
  tag v0.83.5, HACS update on .88, hard-refresh the Studio (check
  the `s0.83.9` stamp).
- Backlog note: smoke-studio.mjs has six stale assertions
  (activitiesOwned, startPicker, nameInput, added, draftBanner,
  pageMade) — selector drift from the v0.83.x UI rounds, false on
  the untouched baseline too. Needs a selector refresh pass, not a
  code fix.

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

---

*The changelog continues — every round from v0.82.1 back to the
first prototype — in
[`archive/docs/project-history.md`](../archive/docs/project-history.md).*
