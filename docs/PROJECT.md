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
