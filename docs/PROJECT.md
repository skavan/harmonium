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

## Current state (v0.12, 2026-07-20)

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
