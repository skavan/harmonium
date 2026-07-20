# Screen Definition Schema — Draft 0.1

Working design for the remote's screen/config format. Stored by the custom
integration in HA storage, delivered to remotes over websocket
(`get_config` / `subscribe_config`). The renderer treats this as data —
no logic ships in the config.

## Design principles

1. **Renderer stays dumb.** No templating language, no expressions, no
   conditionals in the client. Anything dynamic beyond entity state binding
   is done HA-side (template sensors, scripts) and surfaced as an entity.
   This keeps the client tiny and pushes complexity to hardware that can
   afford it.
2. **Subscriptions are derivable.** The entity list a screen needs must be
   computable from its definition by static inspection: tile entities +
   screen context + `extra_entities`. The client subscribes to the current
   screen's set (plus a small global set), nothing more.
3. **D-pad is first-class, touch is bonus.** Every screen must be fully
   operable with focus navigation. Touch coordinates are never required.
4. **Activities live in HA.** An "activity" here is only a binding:
   a script to call + a screen to show + context. The orchestration logic
   is an ordinary HA script.
5. **Familiar vocabulary.** Action objects use a subset of HA's
   `tap_action` grammar (`call-service`, `navigate`, `activity`, `none`)
   so HA users read it fluently. This is *not* Lovelace compatibility —
   just borrowed vocabulary.

## Top level

```yaml
version: 1

theme:
  mode: dark            # dark | light | auto
  accent: "#ffb300"

global:
  status_entities:       # always-subscribed, e.g. status bar
    - binary_sensor.alarm_armed
  buttons: {}            # hardware button map, see Buttons

profiles: {}             # per-remote assignment
activities: {}           # activity bindings
screens: {}              # the screens themselves
```

## Profiles

A remote identifies itself with its device id and receives one profile.

```yaml
profiles:
  living_room_astrion:
    match: { device: "astrion-a1b2" }   # reported by the shell
    home_screen: home
    screens: [home, tv, lights, climate]  # ordered; also the L/R page order
    sleep:
      timeout: 20s
      wake_screen: last     # last | home | <screen id>
```

## Screens

```yaml
screens:
  lights:
    name: Lights
    grid:
      columns: 2          # small portrait screens; keep it simple
    context: {}           # optional, see Context
    initial_focus: tile_ceiling
    extra_entities: []    # subscribed but not rendered (rarely needed)
    buttons: {}           # per-screen hardware overrides
    tiles:
      - id: tile_ceiling
        type: light
        entity: light.living_room_ceiling
        label: Ceiling
        span: 2           # full width
      - id: tile_lamp
        type: light
        entity: light.reading_lamp
      - id: tile_movie
        type: script
        entity: script.movie_lighting
        icon: mdi:movie-open
      - id: nav_home
        type: nav
        target: home
        icon: mdi:home
```

### Tile types (v1 widget set)

| type       | 2-way | select behavior                          |
|------------|-------|------------------------------------------|
| `light`    | yes   | press = toggle, **hold = capture** (up/down = brightness, back = release) |
| `switch`   | yes   | press = toggle                           |
| `cover`    | yes   | capture: up/down = open/close, select = stop |
| `climate`  | yes   | capture: up/down = setpoint              |
| `media`    | yes   | capture: transport keys map to player    |
| `sensor`   | no    | select = no-op (skipped in focus order unless `focusable: true`) |
| `script`   | yes   | press = run                              |
| `scene`    | yes   | press = apply                            |
| `activity` | yes   | press = start activity                   |
| `nav`      | —     | press = navigate                         |
| `group`    | yes   | renders an HA group/label as one tile    |

Any tile may override defaults with explicit actions:

```yaml
- id: tile_custom
  type: switch
  entity: switch.fan
  on_select: { action: call-service, service: fan.increase_speed,
               target: { entity_id: fan.bedroom } }
  on_hold:   { action: navigate, target: fan_detail }
```

## Focus / D-pad model

**Default: spatial.** Focus order is derived from grid geometry — up/down/
left/right move to the nearest tile in that direction. No config needed for
normal layouts.

**Overrides:** per-tile escape hatch for odd layouts:

```yaml
- id: tile_lamp
  focus: { down: nav_home, right: tile_movie }
```

**Capture mode:** the one non-obvious mechanic. Widgets that adjust a
range (light, climate, cover, media) can *capture* the D-pad:

- focused → **hold select** (or press, per widget default) → widget enters
  captured state (visually distinct)
- while captured, direction keys go to the widget, not navigation
- **back** (or select again) releases capture

Capture behavior is intrinsic to the widget type — config never has to
describe it, which keeps definitions short and behavior consistent.

**Screen edges:** left/right at grid edge pages between screens in profile
order (configurable off via `page_on_edge: false`).

## Context

Screens (and activities) may bind named context slots. Hardware button
maps reference them, so one global button map serves every activity.

```yaml
screens:
  tv:
    context:
      media_player: media_player.living_room_shield
      volume: media_player.denon_avr
```

```yaml
global:
  buttons:
    vol_up:   { action: call-service, service: media_player.volume_up,
                target: { entity_id: $context.volume } }
    vol_down: { action: call-service, service: media_player.volume_down,
                target: { entity_id: $context.volume } }
    play:     { action: call-service, service: media_player.media_play_pause,
                target: { entity_id: $context.media_player } }
    power:    { action: activity, target: off }
    home:     { action: navigate, target: home }
```

`$context.<slot>` is the **only** substitution in the entire schema — a
single key lookup, not a template language. If a slot is unbound on the
current screen, the button is a no-op (and the renderer can show a hint).

## Activities

```yaml
activities:
  watch_tv:
    name: Watch TV
    start: script.activity_watch_tv    # HA script does the orchestration
    stop:  script.activity_all_off
    screen: tv                          # navigate here on start
    context:                            # merged over the screen's context
      volume: media_player.denon_avr
  off:
    name: All Off
    start: script.activity_all_off
    screen: home
```

Starting an activity = fire `start` script, navigate to `screen`, apply
`context`. Nothing else. State of "which activity is active" — if wanted
for UI highlighting — is an HA `input_select` the scripts maintain, bound
like any entity.

## Hardware buttons

Three layers, most specific wins:

1. widget capture (while a widget holds the D-pad)
2. per-screen `buttons:`
3. `global.buttons`

Button ids are logical names (`vol_up`, `power`, `red`, `dpad_up`…). The
platform shell owns the mapping from physical keycodes to logical ids
(per-device quirk table in the shell, not in user config).

## Subscription derivation (informative)

For screen S, the client subscribes to:
`tiles[].entity ∪ context values ∪ extra_entities ∪ global.status_entities`
via `subscribe_entities` with `entity_ids`. On navigation it diffs the
sets — unsubscribe/resubscribe only the delta. Optional prefetch of
adjacent screens' sets after idle.

## Addendum — decisions adopted in v0.3 (2026-07-18)

**Activity lifecycle.** Select on an OFF activity = start (script + navigate
+ context). Select on a RUNNING activity = open its screen — never stop.
Ending is deliberate: hold on the activity tile, or the global `power`
button (ends whichever activity is running). `confirm_end: true` on an
activity enables an inline two-press confirm: the tile flips to a red
"Press again to end" state for 5s. No modal dialogs, ever.

**Activity state is HA truth.** `global.activity_select` names an
`input_select` that activity scripts set as their FIRST step. Tiles bind
active-state to it (`state_value` defaults to the activity id). This
solves shared-hardware ambiguity (two TV activities on one TV) and gives
exclusivity for free — starting one activity's script transitions from
whatever was running.

**Per-activity context.** The active activity's `context` overlays the
screen's `context`. Tiles may bind `entity: "$context.<slot>"` — one TV
screen serves Watch Fire TV and Watch Smart TV with different media
players, D-pad targets (`dpad`), and command maps (`dpad_commands`, e.g.
Samsung's KEY_UP vs Fire TV's UP). Subscriptions re-derive and
resubscribe automatically when the activity changes.

**Sections.** A screen may use `sections: [{title?, tiles}]` instead of a
flat `tiles` list. Headers are non-focusable. Devices live in a
scroll-down "Devices" section on activity screens — not behind long-press
(hold is already spent on capture and end-activity).

**Styling doctrine.** Theme = design tokens (`theme` map → CSS custom
properties; future: align token names with HA theme variables). Banner is
a screen-level object (image, opacity, height, time). Icons:
`material:<name>`, `icon_image: <url>`, or emoji. Community widgets will
get a curated utility-class whitelist, not arbitrary CSS.

**Tile strategy.** One chassis (slots: icon, label, state line, meter,
hint + focus/capture plumbing), many adapters (the widget catalog).
Non-tile "panel widgets" (passthrough pad, transport rows) are allowed
but rare.

**Trailing action (chassis slot, v0.7).** Any tile may declare
`trailing: { icon, action }` — rendered as a full-height touch zone
(~60px) on the tile's right edge with its own focus stop (D-pad Right
from the tile body lands on it; Select runs the action). Actions use the
generic grammar: `{ navigate: <screen> }` or `{ service, target, data }`.
Canonical use: the TV screen's Now Playing tile trails into the Apps
screen (the "apps drawer" — a screen, not an overlay, per
pickers-are-screens). Occasional-use pickers get an edge affordance, not
a permanent grid section.

## Addendum — decisions adopted in v0.8 (2026-07-19)

**D-pad passthrough (Harmony rule).** A screen may declare
`dpad_passthrough: <entity|$context.slot>`. On devices whose profile has
the `physical_dpad` capability, PHYSICAL up/down/left/right/select/back
go straight to that entity (through the command map, so
`dpad_commands` swaps UP → KEY_UP per activity) — during an activity the
hardware D-pad simply IS the device's D-pad. **Touch is never
intercepted**: taps on tiles always drive the UI, even on a passthrough
screen. Physical `home`/`power` are also never passed through — they
belong to the system (home ladder, All Off).

**Two homes, named.** *Device home* is a touch affordance (the on-screen
ring's corner in browsers, the button bar on hardware remotes) sending
the device's HOME command. *System home* is the physical home key and
`nav` tiles: ladder = activity screen → room page → `global.main_home`.

**Button bar widget (`buttons`).** Transport-style panel widget with 2-4
configurable slots: `{ type: buttons, entity: $context.dpad,
buttons: [info, menu, back, home] }`. Each slot is a logical dpad key
resolved through the same command map as everything else. Use with
`only: physical_dpad` to give hardware remotes touch access to keys the
hidden ring would have provided.

**Action grammar (shared).** Anywhere an `action` object appears
(presets, trailing slots): `{ navigate: <screen> }` or
`{ service: dom.svc, target|entity, data }` — resolved with `$context`
substitution. One grammar, one runner.

**Engine tunables.** Gesture timings (hold 450ms, power-hold 600ms,
confirm window 5s, ensure-activity poll 300ms) live in one `TIMING`
constant — future shell/config setting, per open question 4.

## Addendum — device strategy adopted in v0.9 (2026-07-19)

**Tap semantics are zone-deterministic, never stateful.** A tap on a
device tile's body always performs the primary action (toggle a light,
play/pause a player). The tile's trailing zone always goes deeper.
"Select first, act when selected" was rejected: it makes one gesture
mean two things depending on invisible focus state.

**Detail screens are GENERATED, not authored.** Any device tile leads to
`detail:<entity_id>` — a virtual screen composed from three generic
primitives: `power` (big round homeassistant.toggle), `stepper` (big
−/value/+ bound to one range: setpoint °, brightness %, volume %,
position %), and `chips` (option pills whose choices come from the
entity's OWN attributes — `hvac_modes`, `fan_modes`, `preset_modes`,
`source_list`, `effect_list` — so they always match what the device
supports; a chips row with no options hides itself). Domain
compositions: climate = power+setpoint+mode+fan+preset; light =
power+brightness+effect; media_player = power+transport+volume+source;
cover = position; fan = power+preset; switch = power. A tile can
override with `detail: <screen_id>` for a hand-authored screen (the
Comfort screen pattern); `trailing: false` suppresses the entry.

**Entry affordance.** Device tiles (light/climate/media with a
detail-capable entity) automatically grow a `tune` (settings) trailing
zone → their detail screen. Explicit `trailing` config always wins
(e.g. Now Playing trails to Apps instead).

**Detail layout doctrine (v0.9.1, after on-device review).** Row 1 is a
`dbar`: on-screen Back (left) and the power toggle (right) in one
compact row — detail screens always have a touch exit. NO text
headings on detail rows: a small dim icon in the top slot marks each
row's meaning (thermostat / light_mode / volume_up / hvac / mode_fan…).
Rows are chrome-light (no state line, tight padding). Option buttons
are preset-tile sized — a 3-up grid of 56px buttons, not small pills.

**Per-entity display options (v0.9.5).** Top-level
`entity_options: { <entity_id>: {...} }` — display-layer knobs keyed by
entity, consulted by widgets and detail generation. First option:
`invert_position` (covers): the DISPLAYED value becomes deployment
(100 − HA position) and the state word flips (retracted projector
screen reads "Closed · 0%"); slider, −/+, VOL, and meter all follow via
the inverted get/set pair. Cover SERVICES (open/stop/close, toggle) are
never inverted.

**Covers are not on/off (v0.9.4, D-pad model revised v0.9.6).** A
cover's detail opens with an Open / Stop / Close button row
(`coverbtns`) instead of a power toggle — Stop matters mid-travel.
D-pad: while the row is merely FOCUSED, ◀▶ move a roving highlight
across the three buttons (Stop is the default) and select presses the
highlighted one; ▲▼ leave the row via normal spatial nav. This is a
new chassis mechanism — a widget `keys` map that claims ◀▶ on focus
without entering capture — for widgets that ARE a horizontal row of
buttons. The `cover` tile type gives list/grid placement: tap =
cover.toggle, position meter, auto-trail to detail. Devices sections
use `columns: 1` by convention — device tiles render as full-width
list rows (labels + state + trail all fit). Vertical sliders run
300px tall — position deserves the real estate.

**Navigation consistency (v0.9.3).** BACK is global and lives in ONE
place: a chevron in the status bar, left of the title, shown whenever
there is history — on every screen, config or virtual. Per-screen Back
tiles are retired (apps screen, detail top bar). HOME is a different
job — a destination, not an unwinding — served by the physical home
key's ladder and optional `nav` Home tiles; pressing Home RESETS
history (chevron hides). Detail screens therefore open with just the
power toggle. The status bar is also contractually ONE line: title
ellipsizes, and the perf readout's boot-time freezes at first paint
(it is a boot metric, not an uptime counter).

**Grid overflow guard (v0.9.3).** Grid columns are
`minmax(0, 1fr)` and tile labels ellipsize — a tile whose content
min-width exceeds its column (trailing zone + long label on a
half-width tile) shrinks instead of bursting the viewport.

**Sliders (v0.9.2).** Bounded 0-100 stepper kinds carry a fat slider
track above the −/value/+ row: horizontal for brightness and volume,
VERTICAL for cover position (matches the physical metaphor). Drag or
tap sets the value proportionally — optimistic fill during the drag,
service calls throttled (~150ms) with a final send on release; the fill
resyncs from entity state when the finger lifts. The −/+ buttons remain
as the precision control. Temperature stays stepper-only (unbounded
range; ±1° taps are the natural gesture).

**D-pad on detail.** The stepper takes initial focus; select captures,
then ▲▼ adjusts. Chips capture with ◀▶ cycling (and applying) options.

**VOL exception (deliberate).** On a device's detail screen — and ONLY
there — physical VOL keys nudge that device's primary range (brightness,
setpoint, volume, position). Everywhere else VOL remains room/activity
audio, unconditionally.

## Open questions

1. Grid: fixed 2-col with spans is enough for remotes — but do we want
   rows with explicit heights for media screens (album art)?
2. `group` tile: expand HA groups client-side (needs member list from
   registry) or require the user to enumerate? Leaning: server expands at
   config-delivery time (integration resolves it, client stays dumb).
3. Per-screen `buttons` vs per-activity — is screen granularity enough?
   (Current design says yes: activities set context + screen; screen
   carries the overrides.)
4. Long-press duration, repeat-rate for held volume keys — shell setting
   or schema? Leaning shell.
5. Import: a `lovelace import` command generating draft screens from an
   existing dashboard — v1 or v1.5?

## Addendum v0.10 — Music screen, generated presets, $item (2026-07-20)

**The music-preset problem.** A TV preset is `select_source` with a
stable string. A music preset is CONTENT — playlists, stations, albums
— with three complications: addressing (raw `media_content_id`s are
opaque per-integration URIs; nobody hand-writes them into config),
liveness (favorites change weekly; static tiles rot), and intent
(replace queue vs play-next vs append). Music Assistant collapses the
addressing problem (`music_assistant.play_media` takes readable names
and stable `library://` uris, plus `enqueue` and `radio_mode`); the
liveness problem is solved by the pipeline below.

**The favorites pipeline (HA is the brain, MA is the source of truth,
the remote just renders).** A trigger-based template sensor —
`sensor.porch_music_favorites` — refreshes on HA start + hourly + on a
`harmonium_refresh_favorites` event, calls `music_assistant.get_library`
(favorite playlists + favorite radio, capped), and publishes
`attributes.favorites = [{name, uri, media_type, image}]` (all plain
strings — enums are cast, media_type derived from the uri, so HA
renders a native list). The sensor rides the NORMAL entity
subscription: it joins the websocket filter like any entity on-screen,
and since favorites change rarely it costs ~zero traffic. Heart
something in MA → it's on the remote within the hour (or instantly via
the refresh event).

**`presets_from` + `$item.*` (new tile type + substitution).** A
`presets_from` tile expands at render time into one generated `preset`
tile per element of an entity's LIST attribute:

```json
{ "id": "mfav", "type": "presets_from",
  "entity": "sensor.porch_music_favorites", "attribute": "favorites",
  "item": { "label": "$item.name", "icon_image": "$item.image",
            "icon": "material:music_note", "activity": "music" },
  "action": { "service": "music_assistant.play_media",
              "target": "$context.media_player",
              "data": { "media_id": "$item.uri",
                        "media_type": "$item.media_type" } } }
```

Rules: `"$item.<field>"` is the ONLY substitution (whole-string values,
any depth) — the per-row sibling of `$context.<slot>`. The `item`
template maps row fields onto tile keys (constants pass through, so
`"activity": "music"` gives every generated tile ensure-activity);
`action` is substituted per row. Generated ids are `<id>_<index>`.
`icon_image: null` falls back to `icon`. `limit` caps expansion
(default 48). Generated tiles are REAL tiles: spatial focus, D-pad
select, capability filters all apply. The source entity is subscribed
automatically (raw tiles join the filter even though expansion
replaces them). Structural liveness: renderStates keeps a signature of
the expanded tile set and re-renders the grid when the source
attribute changes it — patch-in-place covers everything else. The
widget is generic on day one: anything HA can publish as a list
attribute (scenes, scripts, rooms) can become tiles with zero engine
changes — this is the shape of the community declarative-widget tier.

**Music screen anatomy.** The TV screen's center of gravity is the
D-pad (navigating a foreign UI); music has no foreign UI, so its
center of gravity is Now Playing + transport + content. Consequences:
NO dpad_passthrough (tiles must stay reachable); the transport tile
adopts the coverbtns roving model (◀▶ move a highlight across
prev / play-pause / next while the row is focused — a double-ring
highlight that reads on both dark and accent buttons — select presses
it, play-pause default); Now Playing upgrades to an ART HERO.

**Art hero (`media` tile + `"art": true`).** Artwork thumb
(`entity_picture`, hidden on load error or idle), title / artist /
album lines (`media_title`, `media_artist`/`media_series_title`,
`media_album_name`/`app_name`/`source`), and a live progress meter:
HA only sends `media_position` on state changes, so the engine
interpolates from `media_position_updated_at` with one shared 1s
ticker that touches only visible art heroes — never a full re-render.
The hero trails into the Music drawer (explicit `trailing` beats the
auto-detail trail).

**Music drawer.** 3-col screen: "Pull Music Here"
(`music_assistant.transfer_queue`, auto_play — yanks whatever is
playing elsewhere in the house onto this room's player) + the
`presets_from` favorites grid (artwork thumbnails via `icon_image`).
Tapping a favorite from cold runs ensure-activity (music starts,
navigate lands on the music screen) then plays.

## Addendum v0.10.1 — CH keys, per-screen buttons, mode bar (2026-07-20)

**Per-screen logical-button bindings.** A screen may carry a `buttons`
map that OVERRIDES `global.buttons` for logical keys while that screen
is up — entries are the same `{service, entity|target, data}` grammar.
New logical keys `ch_up` / `ch_down` (physical CH rocker; keymap:
`PageUp` / `PageDown` — point KeyMapper's CH hardware keys at those).
The music screens bind CH to `media_next_track` / `media_previous_track`
on `$context.media_player`; CH is unbound elsewhere (for TV-channel use
later, bind it on the tv screen — or leave it to the on-screen ring's
command-map path). The VOL detail-screen exception still runs before
the binding lookup.

**Transport icons** are `skip_previous` / `skip_next` — the row is a
track switcher, not a scrubber (rew/ff misread on music).

**`mediabtns` widget** — mode bar: shuffle + repeat for the tile's
player. Tap toggles shuffle (`shuffle_set`) / cycles repeat
(`repeat_set` off→all→one→off); ◀▶ rove while focused (default:
shuffle), select presses. Accent icon = mode active; the repeat button
renders `repeat_one` when repeat is "one". Self-truthing: state comes
off the entity's `shuffle`/`repeat` attributes each render.

**Music screen composition (v19)** — hero / transport / modes / volume.
The per-screen Home tile is GONE (Home remains the physical key ladder
and the status-bar contract); nav reconsideration is the next design
topic.

## Addendum v0.11 — Physical-key policy by screen class (2026-07-20)

Born from field pain: "I find myself hitting the wrong buttons all the
time." The fix: physical keys carry a POLICY PER PAGE CLASS, not one
global behavior.

**Screen classes.** Every screen has a class — explicit `"class"` in
config, else inferred (generated `detail:` → detail; `dpad_passthrough`
→ activity; home/banner screens → room; else group). New screen key
`"parent"` names the screen Home climbs to (multi-room proof).

| Key | room | group | detail | activity |
|---|---|---|---|---|
| Home (tap) | system home (`parent`) | parent room | parent room | parent room |
| Back (tap) | previous page | previous page | previous page | previous page |
| Home/Back (HOLD) | — | — | device key if a dpad context exists | DEVICE home/back |
| Power | activity end, else All Off (confirm) | page devices off/on (confirm) | device toggle (immediate) | end activity (confirm) |
| VOL | activity/room audio | focused device's range | the device's range | focused device / audio |
| D-pad | screen nav | screen nav | screen nav | device (passthrough) |

**Tap-vs-hold Back & Home.** Tap is ALWAYS UI (Back unwinds history,
Home ladders via `parent`, resetting history). HOLD (450ms) sends the
DEVICE's back/home key through the command map — only on screens with
a device target (`dpad_passthrough` or context `dpad`); elsewhere hold
degrades to tap. Passthrough now claims only arrows+select; Back left
the claim set. The on-screen `buttons` bar remains the touch affordance
for device back/home/info/menu.

**Power scope = blast radius.** Confirmation only where the radius is
big: room/group/activity get two-press confirm (tile red or status-bar
prompt via `barConfirm`); a single device on its detail page toggles
immediately (reversible). Group scope = the page's switchable entities
(light/switch/fan/climate/media_player — covers excluded, they don't
"off"). Room with nothing running: two-press → All Off script.

**VOL focus-follows (supersedes the v0.9 detail-only exception).**
Focused device tile with a primary range → VOL nudges it (brightness /
setpoint / position / speed). MEDIA CARVE-OUT: a focused media tile
keeps the context audio path ($context.volume) — never volume_set on
the focused player — so ARC/CEC routing survives. Non-device focus →
activity/room audio. Detail screens behave as before.

**Passthrough cue.** 2px accent rule under the status bar + gamepad
glyph beside the title whenever passthrough is live — the sign that
arrows drive the device and hold-Back/Home send device keys.

## Addendum v0.11.1 — The shell owns gestures (2026-07-20, field fix)

Field report from the Astrion killed the in-engine hold timers:
KeyMapper-injected keys do NOT deliver reliable keyup / hold timing to
the webview. Keyup-gated taps (v0.11 Back/Home, Power since forever)
and press-duration detection simply never fired on-device, while
keydown-fired actions always worked.

**Doctrine: taps fire on KEYDOWN; hold gestures belong to the SHELL.**
KeyMapper's long-press feature maps a held physical key to a DISTINCT
keyboard key, which the engine treats as its own logical button — zero
timing logic in the webview, and the future APK shell does the same in
native onKeyDown. New logical buttons + keymap:

| Physical gesture | KeyMapper sends | Logical | Action |
|---|---|---|---|
| Back tap | `[` | back | UI back |
| Back long-press | `{` | back_hold | DEVICE back (degrades to tap w/o device ctx) |
| Home tap | `]` or `;` | home | UI home ladder |
| Home long-press | `}` | home_hold | DEVICE home |
| Power tap | `p` (NOT F2 — never reached the webview) | power | class-scoped power |
| Power long-press | `o` | power_hold | All Off, no confirm |
| Mute | `m` | mute | toggle mute on $context.volume (ARC-aware); overridable via `buttons` maps |
| CH ± | `PageUp`/`PageDown` | ch_up/ch_down | per-screen bindings |

Exception: select keeps its in-engine keyup+timer hold-capture — Enter
delivers proper key pairs and the gesture is field-verified.

Also v0.11.1: the TV screen's `buttons` bar slims to two DEVICE keys
(back · home) — wide mode-bar-style buttons, matching shuffle/repeat;
and the key listeners ignore events targeted at form inputs (the auth
overlay could never type keymapped letters before).

## Addendum v0.11.2 — Gesture matrix + debug card (2026-07-20)

**Gestures belong to the shell (final form).** KeyMapper assigns a
DISTINCT keycode per press type (short / long / double); the engine is
a pure keycode→logical-button table. Cost model: long-press mappings
are cheap (short fires on release); double-press taxes every single
press by the disambiguation window — use rarely, never on nav keys.
The confirmed Astrion matrix (raw emissions documented in the old
astrion-harmonia dashboard-hotkeys card, verified by the debug card):

| Physical | Tap | Long |
|---|---|---|
| Back | `[` → UI back | `]` → device BACK |
| Home | `F1` → UI home ladder | `;` → device HOME |
| Power | `F2` → class-scoped power | `=` → All Off (two-press confirm) |
| Menu | `#` → device MENU | `@` → Apps drawer (music screens: Music Library) |
| Mute | `` ` `` → mute toggle (ARC path) | — |
| VOL ± | `+`/`-` | unmapped: auto-repeat ramp |
| CH ^/v | `PageUp`/`PageDown` → per-screen bindings | — |
| OK | Enter → select; hold-capture stays ENGINE-side (Enter delivers true key pairs) | — |

New logical buttons: `menu` (device MENU via the context dpad),
`menu_hold`, `power_hold`, plus the earlier `back_hold`/`home_hold`/
`mute`/`ch_*`. The `buttons` binding grammar (global + per-screen) now
accepts `{navigate: <screen>}` alongside service actions — menu_hold is
just a binding (`apps` globally, `music_drawer` on the music screen).
Service bindings with an unresolved `$context` target are a NO-OP
(never an untargeted broadcast call).

**Key-event debug card.** `global.debug: true` (or URL `#debug=1`,
sticky; `#debug=0` clears) shows a monospace card under the status bar
logging raw keydown/keyup/keypress in capture phase — key, code,
keyCode, repeat flag, mapped logical button, inter-event ms. The tool
that turned "buttons don't work" into a two-line keymap fix.

## Addendum v0.12 — Drawers pop, values ride the title line, switches confirm (2026-07-20)

**`drawer: true` (screen-level).** A drawer screen (Apps, Music
Library) is a pick-one-and-leave surface: after any preset tile on it
fires, the engine flashes the picked label in the status bar and pops
back to where the drawer was opened from (history pop; falls back to
`parent`). Rationale: on a drawer the physical keys drive the UI by
design, so without the pop the user has to Back out by hand after
every pick. `firePreset` resolves its `$context` target *eagerly* so
the deferred ensure-activity path still targets the drawer's own
context after navigation.

**`inlineSub` (widget flag, chassis-rendered).** A widget may opt its
state line onto the TITLE line — right-aligned, 15px, `.sub.subin`
inside `.top` — instead of burning a second line. Opted in: `volume`
(always) and `media` in plain (non-art) mode. Grid rows (columns: 1)
keep the two-line layout. Saves a full line on the TV screen's Volume
and Now Playing tiles.

**`confirm_switch` (global + per-activity).** Starting an activity
while a DIFFERENT one runs usually ends the running one (the HA
scripts are exclusive), so with `global.confirm_switch: true` the
engine asks first via the status bar ("Press again to switch to X",
5s window). Per-activity `confirm_switch: true|false` overrides the
global. Opening the already-active activity never asks. The guard
lives in `startActivity` (returns false while pending), so activity
tiles AND activity-ensuring presets both honor it.

**Per-activity `stop` in the field.** `activities.music.stop` now
names `script.activity_music_stop` (clear state + `media_stop` on the
basement Sonos, touch nothing else) — ending Music no longer powers
off the TV. `script.activity_off` (the All-Off fallback) also stops
the basement Sonos alongside TV-off and soundbar-pause.

**Music rewired.** The music activity + music/music_drawer screens
target `media_player.ma_sonos_basement` (was ma_soundbar_porch) for
both `media_player` and `volume` slots.

## Addendum v0.12.1 — Confirm bar tones + reference-true activity scripts (2026-07-20)

**Toned confirm bar.** The status-bar two-press confirm now PULSES for
the whole 5s window: red (`--danger`) when the pending action turns
things OFF (All Off, end activity, group power-off), accent when it
turns things ON (group power-on, activity switch). `barConfirm(key,
msg, tone)` — tone `"off"` (default) | `"on"`; `flashBar(msg, tone,
ms)` gained the class + duration plumbing (`.cfm-off`/`.cfm-on` on
`#bar .name`, `cfmpulse` keyframes). The pulse stops the instant the
second press lands.

**Activity scripts mirror the harmonia dashboard reference.**
- watch_firetv start: state → Fire TV to Home → wake Samsung (wired
  WOL button + remote.turn_on, both best-effort) → wait for `on`
  (≤6s) → select_source "Fire TV".
- watch_smart start: state → wake (same) → wait → select_source
  "Prime Video".
- All Off: Samsung off + soundbar pause + Sonos stop — it NEVER
  touches the Fire TV (it feeds a second TV; harmonia on_stop =
  Samsung off only).

**Sync automation = full harmonia state model, both directions.**
ON: Fire TV playing counts only with Samsung on + source in
[Fire TV, TV/HDMI]; Samsung turning on maps source→activity (Fire TV
sources → watch_firetv, anything else → watch_smart, only from off);
Sonos playing → music (only from off). OFF: Samsung off ends either
TV activity; Sonos idle 15s ends music. A Fire TV playing into a dark
TV is background noise, never evidence.

## Addendum v0.12.2 — Major-tile confirm + layout fix (2026-07-20)

**Confirm cue moved to the MAJOR tile.** The bar title is too small to
carry a warning on a remote (and long prompts clip), so a two-press
confirm now ALSO pulses the screen's first tile — full red border+wash
(pending OFF) or accent (pending ON), same `cfmpulse` animation. Bar
text still shows the message; the tile is the signal. Cleared the
instant the second press lands or the 5s window expires.

**Media tile un-inlined.** The plain Now Playing tile is back to the
two-line layout — inlining "Playing · YouTube" onto the title line
crushed the label to "Now P…" on 320px. `inlineSub` remains on the
volume tile only (short value, reads fine).

**Soundbar fully out of scope.** It's ARC-controlled by the TV: the
TV powers it, the TV's volume keys drive it. Removed from
`script.activity_off` and from the sync automation's triggers.

## Addendum v0.12.3 — Warm-start-safe activity scripts (2026-07-20)

Field bug: activity state was stale (music) while live Fire TV viewing
was underway; tapping "Watch Fire TV" ran the start script, whose
harmonia-derived first step — Fire TV → Home — killed the live
content. Doctrine now: **start scripts must be idempotent against a
live room.** watch_firetv/watch_smart gate the whole wake sequence on
"Samsung is off", switch the TV input only when it isn't already on
the target source, and never send the shared Fire TV to Home. Net
effect: starting an activity that is effectively already live is a
free state correction (select flips, screen opens, devices untouched).
