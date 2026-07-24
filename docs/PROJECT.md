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
