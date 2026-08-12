# Harmonium Cookbook

Config-only recipes. Every recipe here is: edit `config.json`, bump
`version`, deploy, reload. **No code.** (The last recipe covers the one
case where code IS needed — an unsupported domain — and shows how small
that is.)

The deploy step is always the same, so it's stated once:

> **Deploy:** copy `dist/config.json` (or the edited config) to HA
> `/config/www/remote-proto/`, then press
> `button.astrion1_load_start_url`. If a change doesn't appear, press
> `button.astrion1_clear_browser_cache` first.

---

## Recipe 1 — Add a fan, with presets when available

Goal: a fan tile on the Comfort screen. Tap toggles it; the state line
shows speed; opening its detail gives power, a speed slider, and —
*only if the fan supports them* — preset buttons (low/medium/high/auto
or whatever the fan actually reports).

**Step 1. Find the entity id.**
HA → Developer Tools → States → search "fan". Say it's
`fan.porch_fan`. While you're there, glance at its attributes: if you
see `preset_modes: [...]`, the presets will appear; if not, that row
simply won't exist. You configure nothing either way.

**Step 2. Choose where it lives.**
Open `config.json` → `screens` → `comfort` → `tiles` (or any Devices
section — those use `"columns": 1` so tiles render as full-width rows).

**Step 3. Add one tile object.**

```json
{
  "id": "c_fan",
  "type": "fan",
  "entity": "fan.porch_fan",
  "icon": "material:mode_fan",
  "label": "Porch Fan",
  "span": 2
}
```

**Step 4. There is no step 4.** Everything below arrives automatically:

- State line: `On · 60%` (or the preset name when speed isn't reported);
  amber when running; speed meter along the bottom.
- Tap the body → toggle. Hold select (D-pad) → speed capture (▲▼).
- A ⚙ settings zone appears on the tile's right edge (auto-trailing:
  the engine sees a detail-capable entity). It opens
  `detail:fan.porch_fan` — a **generated** page: power button, speed
  slider + −/+, and the preset buttons **read live from the fan's own
  `preset_modes` attribute**. A fan with no presets shows no preset
  row; a fan that gains presets after a firmware update shows them with
  zero config changes.
- On that detail page, the physical VOL keys nudge fan speed (the
  detail-screen VOL exception).
- The entity is auto-subscribed — it joined the screen, so it joined
  the websocket filter. Nothing to register.

**Step 5.** Bump `"version"`, deploy, reload.

Optional extras:
- Also count it in the room page's summary nav card: with no explicit
  `entities` list the card derives its counts LIVE from its target
  page's tiles, so it follows automatically; pin `grp_hvac.entities`
  only to curate.
- Don't want the ⚙ zone? `"trailing": false` on the tile.
- Want the tile to open something else entirely?
  `"trailing": { "icon": "material:tune", "action": { "navigate": "somewhere" } }`.

---

## Recipe 2 — Add an app to the Apps drawer

`screens.apps.tiles` — copy any entry, change three strings:

```json
{ "id": "ap_plex", "type": "preset", "icon": "material:play_circle",
  "label": "Plex",
  "action": { "service": "media_player.select_source",
              "target": "$context.media_player",
              "data": { "source": "Plex" } } }
```

`source` must match the player's `source_list` attribute exactly
(Developer Tools → States). `$context.media_player` means the same
tile works under Watch Fire TV and Watch Smart TV.

## Recipe 3 — Add a home-screen favorite (Harmony-style)

Same preset tile, placed in the home Presets section, plus one field:
`"activity": "watch_firetv"`. That's ensure-activity: pressed from a
cold room, it starts the whole activity, waits for it to come up, THEN
launches the app.

## Recipe 4 — Add an activity

1. Best path: build it in the STUDIO (＋ Add activity — devices,
   roles, draft-confirm actions, minted control page). Hand-authoring
   instead? Give it a `start` sequence whose first step is
   `harmonium.set_activity` — the minted select updates itself.
2. Config `activities` block:

```json
"play_vinyl": {
  "name": "Play Vinyl",
  "start": "script.activity_play_vinyl",
  "screen": "music",
  "confirm_end": true,
  "context": { "media_player": "media_player.turntable",
               "volume": "media_player.ma_soundbar_porch" }
}
```

3. An activity tile on the home screen:
   `{ "type": "activity", "activity": "play_vinyl", ... }`.

The context overlay does the rest: the shared screen retargets its
Now Playing/volume/D-pad to this activity's devices, including
per-activity `dpad_commands` if the device speaks a different command
dialect (see `watch_smart` for the Samsung KEY_* example).

## Recipe 5 — Per-entity quirks (`entity_options`)

Top-level map keyed by entity id, for display-layer corrections:

```json
"entity_options": {
  "cover.maestroscreen_04_fr": { "invert_position": true }
}
```

`invert_position`: the displayed value becomes *deployment* — a
retracted outdoor screen reads "Closed · 0%"; slider, −/+, VOL, meter
all follow. Services are never inverted.

## Recipe 6 — Show a tile only on some devices

Tiles filter on device-profile capabilities:

- `"unless": "physical_dpad"` — hide on hardware remotes (the
  on-screen D-pad ring does this).
- `"only": "physical_dpad"` — hardware remotes only (the info/menu/
  back/home button bar does this).

Profiles live in `devices`; the remote picks its profile via
`#device=astrion` or Fully Kiosk auto-detection.

## Recipe 7 — A new screen, reachable from anywhere

Add it to `screens`, then link to it: a `nav` tile
(`{ "type": "nav", "target": "myscreen" }`), a trailing action
(`"action": { "navigate": "myscreen" }`), or an activity's `"screen"`.
Back (status-bar chevron / physical key) works automatically; add the
screen to `screen_order` only if it should participate in ◀▶ paging.

---

## Recipe 8 — Music favorites that maintain themselves

Goal: a Music drawer whose tiles ARE your Music Assistant favorites —
heart a playlist in MA, it appears on the remote; unheart it, it
disappears. No config edits ever again.

Two halves. **HA half** (one-time): a trigger-based template sensor
that calls `music_assistant.get_library` (favorite playlists + radio)
on HA start / hourly / on the `harmonium_refresh_favorites` event, and
publishes `attributes.favorites = [{name, uri, media_type, image}]`.
See `ha/README.md` for the exact YAML and its two gotchas (cast the
enum fields to strings or the attribute arrives as a repr-string, and
don't try the UI template helper — it silently drops triggers).

**Remote half** (pure config): one `presets_from` tile in a drawer
screen:

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

`$item.<field>` pulls from each row; constants pass through — so
`"activity": "music"` makes every favorite a Harmony-style
ensure-activity press (from cold: starts the music activity, lands on
the music screen, then plays). Add a "Pull Music Here" preset beside
it (`music_assistant.transfer_queue`, `auto_play: true`) and moving
the party from the deck to the porch is one tap.

The pattern generalizes: `presets_from` renders ANY entity's list
attribute as tiles. Scenes published by a template sensor, a
per-person shortcut list, top-N scripts — same tile, different sensor.

---

## Recipe 9 — Tuck part of the cast behind one card (a group)

Goal: the Bar Receiver and Entry & Gazebo get their own levels, without
adding two more sliders to a controller that already has one.

A **group** is a per-activity view over some of the cast. It renders as
one nav card on the controller and a generated page behind it — the same
thing as Devices ▸ Add Nav Card. The devices stay exactly what they
were; only *where their control is drawn* changes.

**Step 1. Cast the devices** as usual (Studio → the activity → Setup).
Each device just declares what it can do:

```json
"bar_onkyo_z2": {
  "name": "Entry & Gazebo",
  "icon": "material:speaker_group",
  "roles": { "volume": "media_player.tx_nr6100_zone_2",
             "volume_level": "media_player.tx_nr6100_zone_2" }
}
```

**Step 2. ⊞ Add group**, name it, tick its members. That writes a group
object into the cast beside the device ids:

```json
"cast": ["bar_sonos",
         { "group": "zones", "name": "Zones",
           "icon": "material:speaker_group", "shows": "volume",
           "members": ["bar_onkyo", "bar_onkyo_z2"] }]
```

There is no step 3. The card appears the moment the group has members
and hides itself again when it doesn't.

**`shows` is the whole design decision.** It says what the children
render as:

| `shows` | Child tile | Needs the claim |
|---|---|---|
| `device` (default) | launcher into that device's own controller | — |
| `volume` / `stepper` | the level control inline | `volume` |
| `power` | a power button | `power` |
| `media` / `transport` | Now Playing / transport | `media_player` |
| `sources` | the input picker | `source_select` |

The rule behind the table: a control that fits in a tile is drawn there;
anything that needs more room becomes a launcher, because that is what
the device's own page is for. A missing claim never breaks the page — it
falls back to the launcher, and the Studio says so on the row.

**A grouped device keeps its other jobs.** The receiver can sit in the
Zones group *and* be the activity's Source picker; the group governs the
presentation of the thing it draws, nothing else.

The name on each tile is the DEVICE's name and the group lives in the
ACTIVITY, so the shared controller serves every room without a fork:
this house says "Entry & Gazebo", the next one says whatever it calls
its second zone. Eight zones cost the same as one.

## Recipe 10 — Make a wall tablet legible from across the room

Goal: a 100px header on the tablet, the compact bar everywhere else.

**Step 1. Give the tablet its own profile** (`remotes`):

```json
"tablet": {
  "capabilities": ["touch", "pointer"],
  "style": { "bar-h": "100px", "bar-pad": "0 22px", "bar-fs": "30px",
             "bar-icon": "34px", "bar-btn-w": "64px", "bar-btn-h": "56px" }
}
```

**Step 2. Point the device at it**, once:

    .../main/index.html#device=tablet

Stored in `localStorage`, stripped from the URL. `default` is untouched,
so a hardware remote keeps the compact chrome.

`style` is a plain map of CSS custom properties layered over the theme.
Every bar metric falls back to what shipped, so an unstyled profile
renders identically — this cannot regress a remote you did not touch.

## Recipe 11 — Teach a platform's real app links

Goal: the Apps drawer launches what is actually installed, not what the
dialect hopes is installed.

**Ask the device rather than porting a package list.** Over ADB:

    pm list packages | grep -iE 'avod|firebat|netflix'
    cmd package resolve-activity --brief \
        -c android.intent.category.LEANBACK_LAUNCHER com.amazon.firebat

The second command prints the launcher component — on a Hisense Fire TV
that is `com.amazon.firebat/com.amazon.pyrocore.IgnitionActivity`, not
the `firebatcore.deeplink.DeepLinkRoutingActivity` the stock `firetv`
dialect names. Same package, different Fire OS build. `LEANBACK_LAUNCHER`
matters: TV apps often have no plain `LAUNCHER` activity.

Then add a dialect with the measured components and list ONLY the apps
that resolved:

```json
"firetv_embedded": {
  "name": "Fire TV (embedded)",
  "channels": { "commands": { "integration": "androidtv",
                              "domain": "media_player" } },
  "apps": {
    "prime": { "action": "androidtv.adb_command",
               "entity": "$context.media_player",
               "data": { "command": "am start -n com.amazon.firebat/com.amazon.pyrocore.IgnitionActivity" } }
  }
}
```

Point the device at it (`devices.<id>.dialect`) and the drawer renders
exactly the apps that work — an app the dialect omits is an app the
drawer never offers, which is better than a button that does nothing.

---

## When config isn't enough: an unsupported domain

Everything above needed zero code because a `fan` widget exists in the
catalog. If you hit a domain with no widget (say `vacuum`), the gap is
deliberately small — this is the extensibility surface:

1. `src/widgets/vacuum.js` — one file, ~20 lines: an adapter object
   with `sub` (state line), `isOn`, `select` (primary tap), optionally
   `meter`, `capture`, `detailable: true`. Use `fan.js` as the model.
2. One line in `build.mjs`'s SCRIPTS list.
3. Optionally a detail composition in `src/core/details.js`
   (`DETAIL_TILES.vacuum`) built from the existing primitives
   (power / stepper / chips).
4. `node build.mjs`, run `tests/run.sh`, deploy `dist/`.

In the v1 integration era this becomes the community declarative-widget
tier; for now it's a pull request measured in tens of lines.
