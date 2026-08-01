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

## Current state (v0.14 Studio, 2026-07-21)

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
