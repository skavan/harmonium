# Screen Definition Schema — Draft 0.1

*Purpose: The config contract: every key a screen, tile, activity or device can carry, with semantics. Audience: config authors going beyond the Studio, and engine developers.*

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

## Addendum v0.13 — v2 authoring model lands in the engine (2026-07-20)

The `yaml/` directory is now the PLAN OF RECORD for authoring: one
self-contained YAML document per view, `system.yaml` for hidden
infrastructure, compiled to runtime JSON by `yaml/build_config.py`
(gated in `node build.mjs` — a failing `--check` fails the build).
The engine learned the v2 fields, all DATA-ACTIVATED — under the live
v1 config nothing changes (proven by smoke-v2's dormancy test):

- **`screen.control_target`** `{label, navigation, power, volume,
  pass_through: [keys]}` — which entity physical keys drive, and which
  keys pass through. Supersedes `dpad_passthrough` (still honored);
  the active activity's `controls` map is the fallback.
- **`config.input.physical_buttons`** — `short_press:
  "control_target"` routes tap-Back/Home/Power to the target on views
  that pass those keys; `hold: {back: app_back, home: room_home,
  power: activity_end}` gives the holds to the app. This is the
  REVERSE of the v0.11 shipped doctrine — both are now pure data, the
  config picks.
- **`activities.*.state`** — harmonia evals as data: `entities` list +
  `on: {all|any: [conds]}` or `{any_state: [...]}`; conds support
  entity/attribute/state/equals/in/not_in. When present, activity
  truth is DERIVED from devices; the input_select becomes a routing
  cache. State entities auto-join every screen subscription. Tapping a
  tile that is eval-ON with a stale select silently heals the select
  (engine-side sync — the beginning of the end for the sync
  automation).
- `presentation: drawer` (authoring) → `drawer: true` (runtime).

Seventh suite: tests/smoke-v2.mjs. See docs/authoring-ui.md for the
editor design this enables.

## Addendum v0.13.1 — v2 CONFIG GOES LIVE (2026-07-20)

The Astrion now runs the COMPILED v2 config (`yaml/` → `config.v2.json`
→ deployed `config.json`). `node build.mjs` recompiles yaml/ on every
build and ships it as dist/config.json; `config/config.json` is frozen
as the v1 reference/fallback. What changed live:

- **Screen ids**: home→`porch`, rooms→`overview`, music_drawer→
  `music_library`. Drawer parents are now their openers (apps→tv,
  music_library→music) — the Home ladder climbs sensibly.
- **Key policy is DATA and stays as shipped** (Suresh's call): `input.
  physical_buttons: short_press: app, hold: {back/home: control_target,
  power: all_off}` — tap = app, hold = device, toggleable by flipping
  `short_press: control_target` in system.yaml. Roles control_target/
  all_off are served by the v1 switch (identical behavior); the
  alternate mode is smoke-v2-tested.
- **Activity truth is now DEVICE-DERIVED** via the `state:` evals
  (Samsung on + source rules; Sonos any_state). Tiles read the
  harmonia truth directly; the input_select is a routing cache kept
  honest by the sync automation AND the tap self-heal.
- **Drawer key rule**: apps passes only `power` through
  (`pass_through: [power]`) — device-back on a drawer is a silent
  trap; tap-Back escapes the drawer.
- Known nit: drawers compile to class `group`, so a power TAP on a
  drawer flashes "Nothing to switch" (preset tiles have no entities) —
  harmless; will be resolved when power routing moves fully to
  control_target.

All 7 suites migrated to v2 ids and green. smoke-nav's home-key check
now presses F1 (';' has been home_hold on the astrion since v24 — the
old test comment was stale).

## Addendum v0.14 — STUDIO PREVIEW HANDSHAKE + INTEGRATION (2026-07-21)

The engine grew a **preview mode** and the repo grew the **custom
integration + Harmonium Studio** — the editor whose canvas is the
engine itself.

**Engine `#preview=1`** (inert on the kiosk — nothing sets the flag
there): skips the config fetch and instead applies configs pushed by
its PARENT frame over same-origin postMessage. `applyConfig(cfg,
device?)` was extracted from boot for this (device resolve → CAPS/
KEYMAP → theme → dbg → stack reset → navigate home → resubscribe), so
re-injection on every keystroke is a full clean re-render. Protocol:

    parent → engine  { type: "harmonium_config", config, device? }
    parent → engine  { type: "harmonium_key", key }   synthetic keydown+keyup
    engine → parent  { type: "harmonium_ready" }
    engine → parent  { type: "harmonium_applied", screen }
    engine → parent  { type: "harmonium_error", message }

Preview still calls `connect()` — the canvas renders LIVE entity
states, because the token is shared same-origin via localStorage
(`hakr_token`) with the deployed remote. `device` provisioning param
is NOT persisted in preview (no cross-contamination of the kiosk's
stored identity), and the URL is not rewritten. Hardening that fell
out: `screenOf()` and `subscribeFor()` now null-guard, so a bad
injected config degrades silently and the next good config heals —
the live-edit loop can't kill the canvas.

**Integration** (`integration/custom_components/harmonium/`, installed
by hand — HA won't let us write custom_components via API; see
integration/README.md): single-instance config-flow integration that
(1) owns the runtime config in HA storage (`.storage/harmonium.config`,
seeded on first run from the deployed config.json), (2) serves
authenticated GET/POST `/api/harmonium/config` where POST = validate →
store → deploy to `www/remote-proto/config.json` — `_validate()`
mirrors build_config.py's structural checks (screen refs, tile id
uniqueness, activity refs, parent refs), (3) serves the Studio at
`/harmonium-static/studio.html`, and (4) registers the
**Harmonium Studio** iframe sidebar panel (admin-only).

**Studio v1** (`studio/studio.html`, single file like everything
else): slice nav (screens.* / activities / global / input / devices /
theme) → JSON textarea per slice → debounced parse into a DRAFT →
whole draft re-injected into the engine iframe on every valid edit.
Invalid JSON flags red and never clobbers the draft. Soft remote
sends the REAL Astrion keycodes (`harmonium_key`), so key policy is
testable in the chair. Device selector re-injects as any device
profile. Save & Deploy posts the draft; Save + Reload Astrion also
presses the kiosk's cache-clear + load-start-URL buttons via REST
(button entity ids configurable, localStorage `hakr_cachebtn` /
`hakr_reloadbtn`). Token = the shared `hakr_token`, prompted once.

Ninth suites: tests/smoke-preview.mjs (handshake: ready / applied /
re-inject / synthetic-key focus / bad-config survive+recover) and
tests/smoke-studio.mjs (real engine in the iframe, HA API stubbed by
Playwright routes: load, nav slices, live edit visible in preview,
soft key moves focus, bad JSON flagged, Save posts the edited draft).

Known limits (v1 by design): Studio edits the COMPILED runtime
config, not yaml/ (port keepers back to yaml/ or build.mjs overwrites
them on next deploy); textarea JSON now, harmonia-style form editors
(Setup/State/Actions) are phase 2 of docs/authoring-ui.md.

## Addendum v0.14.1 — STUDIO v2: VISUAL EDITORS (2026-07-21)

Studio rebuilt on **Svelte 5 + Tailwind 4 + vendored shadcn-style
components (bits-ui)** — `studio-src/` is a Vite project whose build
emits ONE self-contained studio.html (vite-plugin-singlefile) into the
integration's `studio/` dir. The engine remains zero-dep vanilla; the
Studio is where UI complexity is allowed to live.

Central pane is now **Visual | Code** per slice (the HA card-editor
convention; Code = raw JSON escape hatch, always available, always
full-fidelity). Visual editors in this cut, all binding straight into
the reactive draft (any change → debounced re-inject into the live
engine preview):

- **Room** — name, activity select, home view, main home, view order
  (chips), confirm-switch + debug toggles.
- **Views** — name/class/parent/drawer, control_target form (label,
  navigation/power/volume, pass_through key chips), and the tile
  lists (sectioned or flat): per-tile card with type/id/label/icon/
  entity-or-activity-or-target/span, reorder/duplicate/delete,
  "All fields (JSON)" expander for full fidelity.
- **Activities** — the harmonia Activity card reborn: identity
  (name/id-rename/icon/accent color), start/stop scripts,
  navigate-after-start, room view, confirm-end, **Setup** ($context
  slots with live entity pickers fed from /api/states), **State**
  (mode select: from-select / ALL rules / ANY rules / any_state;
  condition rows entity·attribute·op(state is/equals/in/not in)·value
  with chip lists for in/not_in), controls JSON expander.

Entity pickers are datalist-backed from the live HA state registry
(free text still allowed — $context.* etc.). Input policy / devices /
theme slices remain Code-only this round. smoke-studio updated: visual
room rename + code-tab label edit both survive into the saved POST.

## Addendum v0.15 — SEQUENCES ARE FIRST-CLASS (2026-07-21)

Suresh's doctrine, straight from HA's own tap_action philosophy: "if a
user has a script — fine. one action — great. multiple actions —
super." So orchestration moves INTO the config:

- **`config.sequences`** — Building blocks. Named sequences in plain
  HA action syntax (`actions:` list — service calls, delay,
  wait_for_trigger, if/then, anything cv.SCRIPT_SCHEMA takes),
  authored per-room in the view file (`sequences:` in porch.yaml,
  compiler stamps `room`), stored in the runtime config.
- **Execution is HA-SIDE**: the integration's `harmonium.run` service
  (field: `sequence`) validates with cv.SCRIPT_SCHEMA and executes
  with HA's own script engine (`helpers.script.Script`, mode
  restart). The remote NEVER runs orchestration — a sleeping kiosk or
  dropped wifi can't half-configure the TV. `harmonium.reseed`
  reloads the store from the deployed config.json after a file-copy
  push.
- **Activity `start`/`stop` are now ACTION REFS**: `sequence:<id>`
  (first-class) or a plain `script.<x>` entity (2nd-class citizen,
  supported forever). Engine routes in `runActionRef()`; compiler and
  integration `_validate` both check sequence refs.
- **Ported 1:1 from the hand-written scripts** (doctrine comments
  intact — warm-start-safe wake, Fire-TV-never-touched, ARC out of
  scope): firetv_on, smart_tv_on, music_on, music_stop, all_off. The
  HA `script.activity_*` entities remain as untouched fallback.
- **Studio**: new Building blocks page (typed action rows — Call
  service / Run script / Delay / Wait for / Custom JSON — reorder,
  alias, per-step summaries, used-by, ▶ Test = harmonium.run of the
  SAVED copy); Start/Stop on the Activity card are ActionPickers
  (optgroups: building blocks / HA scripts / custom). Plus the
  annotated-screenshot fixes: entity fields are real dropdowns of
  compatible entities (EntityPicker select mode w/ custom escape for
  $context.*), Room editor gained the Hero card form
  (image/opacity/heights/clock/rooms-chip) and a Room functions shelf
  ("off" is a special function, not a standard activity), and the
  legacy Activity-state-select field moved behind Advanced (the
  integration will own that entity in a coming phase — that's the
  answer to "why do we need this?").

## Addendum v0.15.1 — APP REGISTRY + ROOM SECTIONS (2026-07-21)

**`config.apps`** (authored in yaml/apps.yaml, house-level): an app is
an IDENTITY (name/icon) + default `source` name; LAUNCH is per-device,
resolved at render time: explicit `launch[<media_player>]` override →
auto (source name present in the device's live `source_list`) →
hidden on that device. Override dialects: plain string (source or
package name), `sequence:<id>` (building block, runs HA-side via
harmonium.run), or an HA-ish action object. Dialects proven by the
ur_firetv/ur_samsung universal-remote cards: Netflix is
`select_source: Netflix` on the Samsung but `com.netflix.ninja` on the
Fire TV; Prime on Fire TV needs KEYCODE_PROG_RED; Max needs adb am
start.

**Engine**: new generated tile `type: apps` (expandTile, same
machinery as presets_from) — one preset tile per registry app
launchable on the tile's `$context.media_player`; availability rides
the live source_list on the normal subscription, so installing an app
on the device grows the drawer by itself. The apps drawer view is now
ONE generator tile (`apps_grid`) instead of ten hand-authored preset
tiles.

**Studio**: Apps page under Model (identity, default source, live
"auto on" chips per device, override editor with source/sequence/HA
action kinds). Room editor now also owns the room view's non-activity
tile sections — Presets, Devices, and custom GROUPS (add/rename/
delete sections, tiles with reorder/dup/delete) — completing the
harmonia Room-card trio. Plus this round's structure fixes: accordion
sections, boot-view/rooms-hub/paging demoted to Advanced with honest
labels (screen_order is the CH◀▶ paging order — the old caption was
wrong), activity ↑↓ reorder, nav views sub-grouped with a divider
before Model.

## Addendum v0.16 — TAXONOMY v2: HUB / CONTROLLER (2026-07-21)

Suresh's collapse, adopted: the four view classes were really TWO
structural types plus bindings plus toggles.

- **`type: hub`** — a launcher page: optional hero, sections
  (activities/presets/devices/custom groups), tiles. `room: true`
  marks a ROOM'S hub (and the house rooms-overview) → room-scope key
  policy (Power = All Off). A "group" no longer exists as a kind — it
  is a hub without `room:`, optionally `presentation: drawer`.
- **`type: controller`** — a control surface bound to its context
  (activities flow through it via `$context`); generated
  `detail:<entity>` pages are controllers with a fixed single-entity
  binding.

The engine's key policy still consumes `class` — the COMPILER derives
it (hub+room→room, hub→group, controller→activity), so the engine is
untouched and the legacy `kind:` vocabulary keeps compiling. All view
files migrated to the new vocabulary. Studio View editor: the Class
dropdown is gone; Type (Hub/Controller) + "Room hub" switch write
`type`/`room` and re-derive `class`.

**Per-activity content overrides on a shared controller** (`when:`):
one Watch TV page serves many activities; tiles can now opt in/out —
`when: {activity: watch_smart}` (show only then) /
`when: {not_activity: [...]}`. Filtering rides visibleTile and the
structural signature, so the grid refreshes on activity switches.
Covered in smoke-v2.

Also this round: preview follows the Studio selection
(harmonium_navigate message; re-injection keeps the current screen
instead of bouncing home), and the apps drawer is CURATED — the apps
tile's ordered `include:` list picks which registry apps a drawer
offers (live: netflix, youtube, youtubetv). Workspaces (multiple
configs per Studio, switcher in the title bar) are designed and
deferred to v2.

## Addendum v0.16.1 — ANATOMY-COMPLETE HUBS, NESTED SUBORDINATES (2026-07-21)

- **Every hub, same anatomy**: canonical section ROLES
  (activities/presets/devices/custom) — compiler infers them for
  existing configs and normalizes flat tile lists into a devices
  section, so Comfort's editor is IDENTICAL to Porch's with Hero /
  Activities / Presets switched off (and switchable on). Activity
  ownership is now open to ANY hub (v1 caveat: one shared routing
  select until the integration mints per-hub selects).
- **Subordinate pages nest inside their openers**: drawers edit
  inline within their controller (Watch TV ⌞ Apps, Music ⌞ Library);
  group-tile pages open from their tile ("edit page →", ↑ breadcrumb
  back). The nav shows only structural top level: hubs + controllers.
  STORAGE is unchanged — subordinates remain real screens (navigation
  targets, shareable later); only presentation nests.
- **One thing, one name**: a group tile's page follows the tile's
  label (comfort renamed "HVAC & Lights" to match its opener); group
  tiles' summary entities now DERIVE live from their target page's
  tiles (baked duplicate list removed from porch.yaml; engine
  groupEntities()).

## Addendum v0.16.2 — LIBRARY TYPE, NAV RETURN, WORKSPACE SAFETY (2026-07-21)

- **`type: library`** — third structural type: a simple PICKER page
  (content + grid + button mapping; pick-and-leave drawer behavior
  built in; compiles to the proven class group + drawer semantics —
  engine untouched). Apps and Music Library migrated. The Studio's
  LibraryEditor asks exactly three questions: what's on it (apps
  include list or preset tiles), grid columns, and which buttons pass
  through. The full hub anatomy was overkill for pickers — nobody
  edits a drawer's hero.
- **Subordinate pages returned to the nav, indented** (⌞) under their
  opener — hiding them entirely made Comfort "vanish". Group pages sit
  under their hub; libraries under their controller. The controller
  editor links to its libraries as chips instead of embedding a full
  editor.
- **Workspaces-mini + Export/Import/Clear** (header): Live | Scratch
  tabs — Scratch is a sandbox autosaved to the browser
  (localStorage hakr_scratch), for building from a clean start
  without touching the live config; the starter keeps
  remotes/keymaps/theme/input and wipes content. ⤓ Export downloads
  the current workspace's draft as full-fidelity JSON; ⤒ Import loads
  one; ✦ Clear resets to the starter. Save & Deploy still writes the
  ONE live store from either tab (deliberate; the status bar shouts
  when on Scratch). Full multi-workspace (own stores + deploy paths)
  remains the v2 design.

## Addendum v0.17 — THE INPUT_SELECT IS DEAD (2026-07-21)

Phase two of the integration: **Harmonium mints its own routing
selects.** New `select` platform — one `select.harmonium_<room>_activity`
per activity-owning hub, options = the hub's activity ids (+ off),
built from the stored config, state restored across restarts
(RestoreEntity). New first-class service **`harmonium.set_activity`**
(field: activity) — flips the owning hub's select, room inferred from
the activity's owner. Sequences' "Set activity state" steps now call
it (no entity ids in the step at all); porch's `activity_state` points
at the minted select; the engine's tap self-heal became
select-domain-agnostic (one line). The hand-made
`input_select.porch_activity` helper is now UNREFERENCED by the live
path — the HA sync automation gets retargeted to the minted select at
deploy, and the helper + old activity_* scripts can be deleted at
leisure. New activity-owning hubs get their select after an
integration reload. Studio: Building blocks grouped by owner room,
duplicate buttons for sequences AND steps, visibly-editable step
names; scratch starter pre-wires its minted select id.

## Addendum v0.19 — DEVICE TILES (2026-07-22)

Suresh's cut, after discussing Harmonia's device cards: **a device
tile is ONE entity** — multi-entity wiring stays where it already
lives (activity roles, controller pages). New tile type
`{type: device, entity: <id>}`; everything else resolves from the
entity's domain. Tap = the domain's obvious verb: play/pause a
playing/paused media_player, toggle a light/switch/fan. **No clean
verb (an OFF media player, a thermostat, a remote) → open the
device's page** — starting things properly is the activity's job
(warm-start doctrine), never a naked turn_on from a tile. Touch
LONG-PRESS (new 550ms pointer gesture, any widget may declare
`hold`; physical-remote holds untouched) → the page. The page is
INFERRED: the view of the activity claiming this entity as primary
(`context.media_player`/`dpad`); `target:` overrides, `tap:`
(play_pause | toggle | open) overrides the verb. Porch ships
`dev_tv` + `dev_music` (Fire TV deliberately absent — it feeds the
OTHER TV; a tap would pause someone else's show). Studio: "device"
tile type (entity picker auto-fills the label from the friendly
name, Tap + Opens selects); combobox domain chips always include the
control domains (media_player, remote, light, switch, climate).
smoke-device.mjs (10th suite) proves render/verb/no-verb/override/
hold. Deferred: hold on verb-less lone entities (v1: nothing),
detail levels (summary/standard/expanded), HA device-registry
seeding.

### v0.19.1 — device-first Studio flow

New tiles default to `type: device`. The device form leads with Name
+ Entity (icon/label auto-fill from the entity; `device_class: tv` →
material:tv), then Tap action / Hold action in HA speak with the
inferred page named in the hint. `attr: <name>` (Studio: "Show
attribute (advanced)") renders that attribute as the tile sub instead
of the smart summary. Compiler fix: `device` joined the devices-role
whitelist (a section of device tiles was stamped `custom`, doubling
the Studio's Devices fold).

### v0.20 — control-page mint, cast generator, Unlink

`{type: devices, activity: <id>}` is the CAST GENERATOR: expands to
one device tile per cast member (activity.devices, else derived from
role wiring), primary first, friendly-name labels, device_class-aware
icons. The activity editor's ＋ next to "Navigate to (after start)"
mints a controller page carrying it (control_target → $context, Now
Playing when the primary is a media_player) and links a.screen.
Studio's ⛓ Unlink replaces the generator with baked device tiles — a
snapshot you own that no longer follows the cast.

### v0.20.1 — the mint produces the Watch-TV anatomy

Minted control pages are control surfaces, not noun grids: Now
Playing + Transport (media_player role), device buttons/Remote pad
(dpad role, only/unless physical_dpad), Volume (+level_entity for the
ARC split), then a titled columns:1 Devices section with the cast
generator. pass_through prefills the full key set and
dpad_passthrough is stamped when a dpad role exists. The cast
generator and Unlink skip remote.* entities — the Remote pad is
their representation.

### v0.20.2 — page deletion

"Delete this page" (Hub + View editors) calls guarded deleteScreen():
refuses and names blockers while referenced (children, opener tiles,
activity navigate/ownership, home anchors); on success removes the
page from screen_order and re-selects a surviving slice.

## Addendum v0.21 — polish phase 1 (2026-07-23)

Sidebar: VIEWS / CONTROLLERS / MODEL / SYSTEM (controllers have
their own home; libraries nest under them). Slice keys view.*;
Building blocks → Actions. View ids follow the name slug until
hand-pinned. Key-centric view metadata: Home = page:<parent>,
Back = UI back, POWER = idle: nothing · running: tap confirms the
end · hold ends immediately (engine change — the old idle-tap
All-Off confirm and hold confirm are gone). ＋-minted Start/Stop
actions are DRAFTS: Confirm & link / Discard in the Actions editor,
return-to-origin either way. Agreed direction for phase 2:
controllers as a library of $context-bound surfaces (caller passes
context + cast), per-activity overrides, Save-as-variant.

## Addendum v0.22 — the controller library (2026-07-23)

`config.controllers` holds shared control surfaces addressed as
`controller:<id>` (yaml: `library: true` on a view; refs rewritten at
compile). They resolve through screenOf() like detail: screens; the
active activity's context overlay parameterizes them, its cast feeds
a bare `{type: devices}` generator, and the title bar names the
activity. tv/music migrated verbatim as TV Media Player / MA Media
Player; drawers parent to controller: refs. Studio edits them under
CONTROLLERS (rename/delete guarded, ⧉ Duplicate variant); custom
controller SCREENS remain the escape hatch.

### v0.23 — lazy instancing

Stock controllers carry the bare cast generator (no baked entities).
Per-activity accordion on Navigate-to: `activity.surface.devices:
false` suppresses the generator for that caller; "Create custom copy"
materializes `<stock>__<activity>` (variant_of lineage, generator
stamped) and relinks; "use stock" reverses and reaps the orphan.
Sidebar: Controllers → Defaults / Custom. Device widget is
detailable (⚙ trail → generated detail screens).

## Addendum v0.24 — domain controllers (2026-07-23)

The detail compositions are config now: stock domain controllers
(controllers.<domain>, `domain` marker, "$device"-bound tiles) ship
from the compiler and are guaranteed by the Studio. detailScreen
resolution: per-device custom (variant_of=domain + entity) → stock
def → hardcoded fallback. Editing the stock edits every device's
page; "Custom copy for device" forks one. entity_options stay the
cross-cutting per-device switches (options fold on the stock page).

## Addendum v0.25 — nav cards (2026-07-24)

`group` / `room` / `nav` tiles are ONE type now:

```yaml
- id: grp_hvac
  type: nav
  style: summary        # auto (default) | plain | image | summary
  label: HVAC & Lights
  target: comfort       # any view; ＋ in the Studio mints one
  image: /local/x.jpg   # used by image style (and auto, when set)
```

Styles: `plain` = icon+label button (old nav) · `image` = full-bleed
photo (old room; `nav-image` class carries the CSS) · `summary` =
live "n entities · k active" derived from the target page's tiles
(old group; explicit `entities:` still overrides) · `auto` resolves
image (tile has one, or target is a room) → summary (target has
entities) → plain. Only summary cards subscribe the derived
entities. The compiler hard-migrates old types (NAV_MIGRATE) and
validates `target` against navigable views; the Studio heals stored
configs (normalizeNavTiles). Studio flow: sections offer "＋ Add
device · ＋ Add nav card"; a nav card's ＋ mints the page and jumps
in as a PAGE DRAFT (Keep / Discard — discard unlinks and deletes),
the same contract as ＋-minted actions; the activity's ＋ Create
control page drafts the same way. Sidebar gained "＋ Add view".

## Addendum v0.26 — hosting is inferred (2026-07-24)

No more Room-view toggle. A page that owns activities IS a room —
the `room: true` field remains in the wire format as the STICKY host
marker: stamped when the page gains its first activity (Studio /
compiler inference), kept until the page is deleted. Consequences of
the marker: the integration mints `select.harmonium_<id>_activity`
for it (sticky — survives losing all activities, sits at "off";
`global.main_home` is excluded), Auto Power means end-the-running-
activity there, and it lists as a top-level place in the Studio.

Power is a per-page setting now:

```yaml
power: activity   # optional — end the running activity (confirm/hold)
power: devices    # optional — switch this page's devices off/on
# absent = Auto: hosts → activity · plain page → devices;
# controllers pass Power to the device; detail pages toggle theirs
```


## Addendum v0.28 — key bindings, All Off retired (2026-07-24)

`screen.buttons` / `global.buttons` entries use the ONE action
grammar (same as presets and trailing slots):

```yaml
buttons:
  power_hold: { sequence: all_off }        # run a named Action
  menu_hold:  { navigate: apps }           # go to a page
  ch_up:      { service: media_player.media_next_track,
                entity: $context.media_player }
```

Hold-Power resolution: screen binding → global binding → derived
default (end the running activity immediately; idle = nothing). An
activity with no stop falls back to its owner page's power_hold
binding (then global). The special "off" activity NO LONGER EXISTS —
the compiler and Studio migrate it into the owner view's
buttons.power_hold; the select's "off" option is minted regardless.
Bindable keys in the Studio table: power_hold, menu_hold, vol_up,
vol_down, ch_up, ch_down, mute.


## Addendum v0.30 — app classes (2026-07-24)

```yaml
apps:                      # MASTER LIST — identity only
  netflix: { name: Netflix, icon: material:movie }
app_classes:               # DEVICE CLASSES — launch dialects
  firetv:
    name: Fire TV
    apps:
      netflix: { source: com.netflix.ninja }
      prime:   { action: remote.send_command, entity: $context.dpad,
                 data: { command: KEYCODE_PROG_RED } }
      custom:  { sequence: my_action }
```

An apps tile resolves its class: tile `class:` (literal or $context
ref) → `$context.app_class` (set per activity in Setup) → the only
class when exactly one exists → empty. The class entry IS the
curation; `include:` filters/orders it. `source:` sugar targets
$context.media_player; action entities default there too. The old
per-entity `launch:` map and source_list launchability are gone.


## Addendum v0.31 — music library categories (2026-07-24)

The integration publishes `sensor.harmonium_music_<category>`
(playlists/artists/albums/tracks/radio; favorites only, hourly from
Music Assistant; `items` = [{name, uri, media_type, image}]). The
library view renders one labeled section per category via
`presets_from` — the header strip chips are the on-screen category
menu. Keys: unbound CH▲▼ on any page with 2+ labeled sections steps
between them (screen/global `buttons` bindings always win); MENU
tours them (wraps) when no device menu target resolves. Stepping
remembers its own position per page (`S.heroAt`).

---

# Addenda — v0.57 → v0.64

Everything below is live in the engine and validated by the
integration. It post-dates the body of this document.

## `volumes` — the volume generator

```json
{ "id": "vol", "type": "volumes" }
```

Walks the running activity's `cast` and emits ONE volume control per
device that declares the named role. Label and icon come from the
**device registry** (`devices.<id>.name` / `.icon`), which is what lets
a shared controller stay generic while each house names its own zones.

| field | default | meaning |
|---|---|---|
| `role` | `"volume"` | which device role to draw — see below |
| `style` | `global.style.volume` | `compact` \| `slider` \| `stepper` |
| `activity` | the running one | pin to a specific activity id |

Per-device override: `activities.<id>.device_options[<entity>]` takes
`volume: false` (skip it) and `volume_style` (this device only).

A room with eight zones authors nothing: add the device, give it a
volume role, cast it.

A device that a **group** draws (below) is skipped here — its control
lives on the group's page instead.

`volume_level` means "where the slider reads truth when it differs from
who takes the keys" (the ARC split).

## Cast groups (v0.60)

`activities.<id>.cast` is a MIXED array: device ids and group objects.

```json
"cast": ["bar_sonos",
         { "group": "zones", "name": "Zones",
           "icon": "material:speaker_group", "shows": "volume",
           "members": ["bar_onkyo", "bar_onkyo_z2"] }]
```

| field | default | meaning |
|---|---|---|
| `group` | *required* | the group id — `group:<id>` addresses its page |
| `name` / `icon` | id / `material:widgets` | what the nav card shows |
| `members` | `[]` | device ids this group draws |
| `shows` | `"device"` | what each child renders as — table below |
| `style` | `"summary"` | the nav card's style |
| `target` | — | point at an AUTHORED page instead of the generated one |
| `grid.columns` | `1` | the generated page's grid |

`shows` binds each child to one device role:

| `shows` | child tile | role |
|---|---|---|
| `device` | launcher into the device's own controller | — |
| `volume` / `stepper` | the level control inline | `volume` |
| `power` | power button | `power` |
| `media` / `transport` | Now Playing / transport | `media_player` |
| `sources` | input picker | `source_select` |

A member missing that claim falls back to `device` — the launcher is
always available and always correct, so a group never renders an empty
tile. A grouped device KEEPS ITS OTHER JOBS: it can sit in the group and
still be the activity's `source_select`.

Groups are per ACTIVITY, so a shared controller carries one generator
and never names a group:

```json
{ "id": "grp", "type": "groups" }
```

which emits one `nav` card per group (`hide_when_empty: true`), pointed
at `group:<id>` unless the group declares its own `target`.

## `group:<id>` — a virtual screen

`navigate("group:zones")` renders that group from the RUNNING activity's
cast: its members, each drawn as `shows`. Virtual, like `detail:<entity>`,
`sources:<entity>`, `queue:<entity>` and `keys:` — generated at render
time, not authored. (It replaces v0.57.1's `zones:`, which is gone.)

**Known cost:** a virtual screen is invisible to the Studio's page list
— it cannot be previewed or edited there. The group's *data*, though, is
fully editable: Studio → the activity → Setup → the cast.

## `browse` additions (v0.62)

```json
{ "id": "lib", "type": "browse",
  "categories": ["Playlists", "Radio", "Albums", "Tracks"] }
```

| field | default | meaning |
|---|---|---|
| `categories` | source order | reorder AND filter the chip strip by title, case-insensitive. Unlisted chips drop. Matching nothing = no change |
| `all` | `true` | the synthetic **All** chip, first, when the tree has exactly one root — every category concatenated in `categories` order, each item badged with the folder it came from |
| `include` | — | (v0.49.1) narrows the ROOTS row by title |
| `media_sources` | `false` | keep HA's `media-source://` roots (hidden by default) |
| `default_root` | first expandable | root to select on open, by title |
| `search_entity` | — | the player SEARCH runs on (v0.65). No magnifier without it |
| `search` | — | the block form (v0.66/v0.67.3) — engine, player, kinds, and how deep. See below |

Two things the engine does NOT do: **sort** (chips and items arrive in
the source's order — Sonos hands back Albums/Playlists/Radio/Tracks and
that is what you see unless `categories` says otherwise), and **hide
truncation**. A node caps at 200 children and the grid ends with
"N shown · M more"; the synthesized favourites path says the same at
the integration's 100-per-category sensor cap.

**Search (v0.65).** `media_player/search_media` is the backend, and it
is not always the same player as the tree: **Sonos returns nothing**,
while the Music Assistant player driving the same speaker answers
fully — and its content ids only play THERE. So `search_entity` names
one player that both searches and plays:

```json
{ "id": "lib", "type": "browse", "search_entity": "media_player.ma_bar" }
```

The magnifier appears as the first chip. In search mode the chip strip
becomes the KINDS the answer contains (All · Playlists · Artists · …,
from each result's `media_class`) and filters client-side; the grid is
the results, rendered exactly like tree items. Typing works from the
on-screen keyboard, from a real keyboard (every printable key —
remote buttons keep arrows/Enter/F-keys/punctuation), and ⌫ / Escape
delete and close. Queries debounce and are sequence-guarded.

The ROOTS row renders only when it carries a real choice — more than
one root, or a tile of its own ("Pull Music Here"). One root is not a
choice.

**Search, declared (v0.66) and made deep (v0.67.3).** The flat
`search_entity` still works; the block form says more:

```json
"search": {
  "engine": "music_assistant",
  "entity": "media_player.ma_bar",
  "classes": ["artist", "album", "track", "playlist"],
  "config_entry": "01KK4WSP09VCQ4G6PY95KTFP4R",
  "limit": 25
}
```

| key | default | meaning |
|---|---|---|
| `engine` | `music_assistant` when `entity` is set | WHICH engine answers. One option today; a declaration, not a control |
| `entity` | — | the player that SEARCHES (results still play wherever the id converts) |
| `classes` | artist, album, track, playlist | the scope. Never ASKING for generated playlists, audiobooks and recommendations is the cure for "almost too overwhelming" |
| `config_entry` | — | **which** Music Assistant, by config-entry id. Present → the engine calls `music_assistant.search` directly; absent → HA's generic `media_player/search_media` |
| `limit` | 25 | results per kind. Only meaningful with `config_entry` |

Why `config_entry` exists: HA's generic `search_media` caps at **5 per
class** and takes no limit argument — asking for tracks alone still
returns five. Music Assistant's own service takes `limit`, but it is
addressed by config entry rather than by player. So the tile declares
it; the engine adapts MA's `{artists, albums, tracks, playlists, …}`
reply into ordinary browse items (`uri` IS a `media_content_id`), and
everything downstream — badges, thumbnails, drill-in, the v0.66 Sonos
share-link rewrite — is none the wiser. Buckets come back in the order
`classes` declares them, so the chip strip reads the way you wrote it.
When a kind returns FULL the grid ends with "There's more — add a word
to narrow it down", scoped to the kind you are filtered to.

The id lives in Settings → Devices & Services → Music Assistant, in
the URL. Removing and re-adding the integration changes it, and search
then falls back to the shallow path — the Studio shows the field
(browse tile → Music Assistant entry) so it can be repaired.

## `trailing` — the tile's right-edge action (v0.28; emphasis v0.68.1)

```json
"trailing": { "icon": "material:library_music",
              "emphasis": "accent",
              "action": { "navigate": "music_library" } }
```

| key | default | meaning |
|---|---|---|
| `icon` | `material:chevron_right` | the glyph |
| `action` | — | the standard action grammar (navigate / sequence / service) |
| `emphasis` | quiet | `"accent"` inverts it — accent fill, background-coloured glyph, wider (`--trail-w-acc`, 76px). For a trail that is a DESTINATION rather than a detail |

`trailing: false` suppresses the implicit ⚙ a detailable device tile
would otherwise get.

## Screen `grid` — and the WIDE size class (v0.68)

```json
"grid": { "columns": 2, "tile_style": "card", "tile_width": 220, "max_width": 760 }
```

| key | default | meaning |
|---|---|---|
| `columns` | 2 | how many columns AT THE REFERENCE WIDTH (480, the remote). Read as a statement of tile SIZE, not a count to obey everywhere |
| `tile_style` | from `columns` | `row` (icon left, text right) or `card`. Absent, it falls back to `columns === 1`, so existing pages are unchanged |
| `tile_width` | derived | px. Overrides the size implied by `columns` — say this when you want a specific density regardless of the declared count |
| `max_width` | none | px. "My width means a COLUMN, not a wall" — the page stays centred at this width when wide. Controllers want it; room pages and the library do not |

A section may carry `columns`, `tile_style` and `tile_width` of its
own; absent, it inherits the screen's.

**The size class.** `html.wide` is set when the viewport is at least
**840 × 600**. Two dimensions on purpose: a phone in landscape is
~844×390 and would pass a width-only test, then be handed a layout
meant for 800px of height. The Astrion and the Haptique are 480×800,
so they never match; nothing below documented as "wide" can reach
them. `#app`'s 520px cap lifts only under `html.wide`.

**What wide actually does.** It re-derives the column COUNT from the
tile SIZE the declared `columns` implies at 480:

| viewport | rooms (`columns: 1`) | controllers (2) | library (3) |
|---|---|---|---|
| 480 (remote) | 1 × 456px | 2 × 223px | 3 × 145px |
| 1280 (tablet) | 2 × 623px | 5 × 243px | 8 × 148px |

Tiles stay the size a fingertip expects; there are simply more of
them. Nothing vertical changes — both the remote and a landscape
tablet are 800px tall.

**`span` scales with the grid.** `span: 2` was authored in a 2-column
world, where it meant "the whole row". At 5 columns, read literally, it
would mean "two fifths". So span N of a declared C covers the same
FRACTION of the rendered count, and N >= C is full width at any size.
`span: 1` is never scaled.

## `presets` — the activity's own shortcuts (v0.64)

```json
{ "id": "acts_presets", "type": "presets" }
```

Emits one tile per entry in the RUNNING (or presumed) activity's
`presets` array. The controller names none of them, so a shared
surface serves every room:

```json
"activities": {
  "listen_sonos": {
    "presets": [
      { "id": "sp_pool_on", "type": "preset", "icon": "material:pool",
        "label": "Add the Pool", "action": { "sequence": "bar_pool_join" } },
      { "id": "coffee", "type": "preset", "icon": "material:local_cafe",
        "label": "Coffee House",
        "action": { "service": "media_player.select_source",
                    "target": "$context.media_player",
                    "data": { "source": "Coffeehouse Rock" } } }
    ]
  }
}
```

Entries are ordinary tile objects — every preset field still applies,
including `activity:` for a Harmony-style warm start. `action` accepts
`{sequence: <id>}` (v0.63) as well as the usual `{service, target,
data}`. `{ "type": "presets", "activity": "<id>" }` pins a specific
activity instead of the running one.

A room whose activity has no presets renders nothing here — the
section vanishes, header included.

### `include` + activity stamping (v0.68.6) — PARKED, not in use

> **Status: parked (2026-08-08).** The engine supports all of this and
> it is tested, but NOTHING in the shipped config uses it — the Bar's
> playlist row was flattened to three plain `preset` tiles. Keep it for
> the shared-controller case it was built for; do not reach for it to
> put three known shortcuts on one known page.
>
> **Why it was parked.** Authoring became two hops. The page holds a
> generator that names an activity and an `include` list of ids; the
> tiles themselves live in `activities.<id>.presets[]`, which in the
> Studio is a different editor entirely. So the page you are looking at
> is not the page you edit, the ids in `include` have to stay in sync
> by hand, and what renders carries a composite id
> (`bar_presets_sp_marley`) that appears nowhere in the config. Suresh,
> looking at the result: *"Its so cryptic."* He was right. The
> indirection pays for itself only when the surface genuinely cannot
> know its own content — a shared music controller serving every room —
> and costs more than it earns anywhere else.
>
> The flat form is in "Cover art on a preset" below: `type: "preset"`
> tiles authored directly in the section, each declaring its own
> `activity` (so the warm start survives), `navigate`, and artwork.
> Same rendering, same behaviour, one hop.

Two additions let a ROOM page carry an activity's shortcuts before that
activity is running — the Harmony "favorite" pattern: one tap starts
the activity AND plays the thing.

```json
{ "id": "bar_presets", "type": "presets",
  "activity": "listen_sonos",
  "include": ["sp_marley", "sp_easy", "sp_pop"] }
```

- **`include`** — an ordered list of preset `id`s. Only those are
  emitted, **in the order given** (not config order). Unknown ids are
  dropped silently, so pruning the activity's `presets` array can
  never blank the page. Omit `include` and you get all of them.
- **activity stamping** — every emitted tile carries
  `activity: <the generator's activity>`. That is what makes
  `firePreset`'s v0.12 warm start apply: tap while the activity is
  cold and the engine runs `startActivity` first, polls the activity's
  declared truth, and fires the action only once it confirms.

Emitted ids are `<generator id>_<preset id>` (`bar_presets_sp_marley`),
so the same preset can appear on two surfaces without colliding.

**The warm-start budget is ~12s** (40 × `TIMING.presetPoll`). If the
activity's `state.on` rule has not become true by then, the tile
flashes *"Activity didn't start"* and the action never fires. An
activity whose truth depends on a slow AV receiver — power on, then
settle on the right input — can easily miss that window from cold, and
the symptom is a preset that "does nothing". Two ways out:

- give the activity a truth rule its devices satisfy quickly, or
- author the preset **without** `activity` (a plain `preset` tile in
  the section rather than the generator), so it fires immediately and
  leaves starting the activity to the activity tile.

Note also that `startActivity` navigates to the activity's `screen`,
so a cold tap leaves the room page for the controller — by design, but
worth knowing when the music does not follow.

### `navigate` — where the tap leaves you (v0.68.7)

An optional tile-level field on any `preset`. The `action` says WHAT to
fire; `navigate` says where you END UP.

```json
{ "id": "sp_marley", "type": "preset",
  "icon": "material:sunny", "label": "Bob Marley",
  "navigate": "controller:music",
  "action": { "service": "media_player.play_media",
              "entity": "media_player.sonos_bar",
              "data": { "media_content_type": "favorite_item_id",
                        "media_content_id": "FV:2/99" } } }
```

Two decisions, declared separately, because the same preset wants a
different landing on a room page than in a drawer.

- Applied **at tap time**, not inside the deferred `run()` — the tap
  IS the intent (the `S.pendingActivity` rule), so the surface changes
  immediately and a slow warm start never yanks the page out from
  under a finger seconds later.
- It lands last, so it **wins over** `startActivity`'s own
  `activity.screen` jump, and over the drawer pop-back in
  `WIDGETS.preset.select`.
- An unknown screen id is a no-op inside `navigate()` — you stay where
  you are; the page never blanks.

Not to be confused with `action: { navigate: <screen> }`, which is the
whole action (go there, fire nothing). `navigate` alongside `action`
does both.

### Cover art on a preset — `icon_image` + `cls: "art"` (v0.68.7)

`icon_image` has always overridden `icon`. On a preset it renders at
**42px** — right for an app logo, where the image is a LABEL. A
playlist is the other case: the cover IS the thing you are picking.
`cls: "art"` opts that tile into the art-forward stack — 84px cover
(100px under `html.wide`), 12.5px label, taller tile.

This is also the SHIPPED shape of the Bar's playlist row — a plain
`preset` tile sitting directly in `screens.bar.sections[role=presets]`,
declaring everything about itself in one place:

```json
{ "id": "bar_marley", "type": "preset", "cls": "art",
  "label": "Bob Marley",
  "icon": "material:sunny",
  "icon_image": "https://image-cdn-ak.spotifycdn.com/image/ab67706c…",
  "activity": "listen_sonos",
  "navigate": "controller:music",
  "action": { "service": "media_player.play_media",
              "entity": "media_player.sonos_bar",
              "data": { "media_content_type": "favorite_item_id",
                        "media_content_id": "FV:2/99" } } }
```

`activity` is declared per tile rather than stamped by a generator, so
the warm start is unchanged AND it is visible in the tile's own editor.

Opt-in rather than "any preset with an image", because the apps drawer
carries images too and wants the stamp.

**Always declare `icon` as well.** Cover art is a REMOTE url — a
Spotify CDN, a Sonos coordinator, an MA thumbnail. The panel is a wall
tablet: the internet drops, a favourite is re-added under a new id, a
coordinator reboots. A broken-image glyph where the art was is the
same failure as a blank panel, so `iconHtml` stamps `data-fbk` on the
`<img>` and a document-level capturing `error` listener swaps in the
declared glyph. Verified: with every CDN request aborted, all three
tiles fall back to their material icons at full size and the row keeps
its height.

Sonos favourite ids come from the media browser —
`media_player/browse_media` with
`media_content_type: "favorites_folder"`, `media_content_id:
"object.container.playlistContainer"`. Each child carries
`media_content_id` (`FV:2/99`), which is stable across renames, and a
`thumbnail` url — that thumbnail is the `icon_image` above.

## `nav` additions

- `hide_when_empty: true` — a **summary** card whose target resolves to
  zero entities hides itself. Opt-in; existing cards are unaffected.
- Summary cards now see THROUGH generators. `navTargetEntities` expands
  the target's tiles while standing on the target (generators resolve
  `$context` against `S.screen`), depth-guarded against a target that
  points back.

## Widget self-suppression — `hidden(e, t)`

A widget adapter may declare `hidden(entity, tile)` and vanish when the
device cannot do the thing it draws. Unknown state NEVER hides —
`supported_features` arrives with the first diff and `tileSig`
re-renders, so the filtered set settles on its own.

| widget | hides when |
|---|---|
| `transport` | no PAUSE / PLAY / NEXT / PREV / STOP |
| `sources` | no SELECT_SOURCE |
| `stepper` (kind `volume`) | no VOLUME_SET / STEP / MUTE |
| `chips` | its option list is empty |
| `nav` | `hide_when_empty` and an empty summary |

This is why an AV receiver's generated detail page has no transport row
and a Fire TV's has no volume slider: drawing a control the device
cannot perform is a lie, not a control.

## `sound_mode` chip kind

`CHIP_KINDS.sound_mode` reads `sound_mode_list` / `sound_mode` and calls
`media_player.select_sound_mode`. Present on every generated
`media_player` detail page and hidden (by the rule above) wherever the
device publishes no list.

## `global.style`

```json
"global": { "style": { "volume": "slider" } }
```

House-wide presentation defaults. Currently one key, `volume`.

## `remotes.<id>.style` — profile chrome

A map of CSS custom properties applied OVER the theme when that remote
profile is active. Every status-bar metric falls back to what shipped,
so an unstyled profile renders unchanged.

```json
"remotes": {
  "tablet": {
    "capabilities": ["touch", "pointer"],
    "style": { "bar-h": "100px", "bar-fs": "30px", "bar-icon": "34px",
               "bar-btn-w": "64px", "bar-btn-h": "56px" }
  }
}
```

Available: `--bar-h`, `--bar-pad`, `--bar-gap`, `--bar-fs` (title),
`--bar-sub`, `--bar-icon`, `--bar-btn-w`, `--bar-btn-h`, `--bar-dot`.

A hardware remote wants the compact bar; a wall tablet across the room
wants a header you can read standing up. Same config, different profile.

## Engine baseline

The engine targets **ES2019 / Chromium 75**. No `??`, no `??=`, no `?.`,
no flex `gap` without the `html.nogap` fallback in `styles/compat.css`,
no `inset` shorthand. Cheap Android remotes ship vendor-frozen webviews;
that is the normal case, not the exception. See PROJECT.md v0.56.1.
