# Creating a dialect

*Purpose: Teach Harmonium a new streaming platform — its app launches, its extra keys, its wake — worked end to end for an Apple TV. Audience: users with a device the stock dialects don't cover.*

**Outcome:** an Apple TV whose Apps drawer launches Netflix and
friends by name, whose sleeping screen wakes before a launch, and
whose extra keys ride the same grammar — all data, no engine code.

## What a dialect is

Harmonium ships three dialects — **Fire TV**, **Google TV**, and
**Samsung Tizen** — and a dialect is nothing more than a JSON entry
describing how one *platform* does three things:

1. **launch an app** (`apps`) — the curation *is* the list: an app
   entry existing means the drawer offers it;
2. **press keys the remote doesn't have** (`keys`) — Settings,
   Search, a screensaver key: each becomes a tile in the device-keys
   band;
3. **wake up** (`wake`) — fired automatically before an app launch
   when the player reports asleep (`off`/`idle`/`standby`). Since
   v0.84.1 this **defaults to `media_player.turn_on`** on the
   context player, so most dialects never declare it; set
   `"wake": false` to opt out, or declare your own action.

Which dialect an activity speaks comes from its context
(`dialect` / `app_class` in the activity's context, or per-tile),
and when the config has exactly one dialect it's assumed. App
*identity* (names, icons, artwork) lives once in the shared
`apps` registry at the top level — a dialect entry only supplies
the platform-specific launch.

Today dialects are edited on the **Code tab** (System → the
`dialects` map); a visual editor is on the roadmap.

## The launch grammar (one of four shapes per app)

```jsonc
"netflix": { "source": "Netflix" }          // media_player.select_source
"prime":   "sequence:prime_launch"          // run a named Harmonium Action
"max":     { "action": "androidtv.adb_command",   // any HA action —
             "entity": "$context.media_player",   // entity defaults to the
             "data": { "command": "am start …" } } // context player
"hulu":    { "service": "media_player.play_media", // full HA-style call
             "entity": "$context.media_player",
             "data": { "media_content_id": "…", "media_content_type": "app" } }
```

`source` is the workhorse: if the platform's HA integration exposes
app names in the player's source list, one line per app is the
whole job.

## Worked example: an Apple TV

The [Apple TV integration](https://www.home-assistant.io/integrations/apple_tv/)
gives you a `media_player` (whose **source list is the installed
apps** — exactly what `source:` wants) and a `remote` for
key presses. So the dialect is short:

```jsonc
"dialects": {
  "appletv": {
    "name": "Apple TV",
    "apps": {
      "netflix": { "source": "Netflix" },
      "disney":  { "source": "Disney+" },
      "youtube": { "source": "YouTube" },
      "max":     { "source": "Max" },
      "music":   { "source": "Music" },
      "appletv": { "source": "TV" }
    },
    "keys": {
      "screensaver": {
        "name": "Screensaver", "icon": "material:wallpaper",
        "action": "remote.send_command",
        "entity": "$context.dpad",
        "data": { "command": "wakeup" }
      }
    }
  }
}
```

Notes on the choices:

- **No `wake` declared** — the default (`media_player.turn_on` on
  the context player) is right for an Apple TV, and the asleep-state
  gate means an awake box is never poked.
- The app *ids* (`netflix`, `disney`…) match the shared `apps`
  registry, so the drawer reuses the same names and icons your
  Fire TV entries already have. An id the registry doesn't know
  falls back to the entry's own `name`/`icon`.
- The `keys` entries target `$context.dpad` (the activity's wired
  `remote` entity) with the Apple TV integration's
  [command names](https://www.home-assistant.io/integrations/apple_tv/#remote)
  — `up`, `menu`, `home`, `wakeup`, `suspend` and friends.
- Exact source names: check the player's `source_list` attribute in
  *Developer tools → States* — spelling must match.

Wire it up: give your Watch Apple TV activity a context of
`"dialect": "appletv"` (Activity → Inputs/context, or just have one
dialect and skip it), point the Apps drawer's tile at the activity,
and the launcher tiles appear — wake included.

## Testing without the couch

The Studio preview runs the real engine: open the Apps drawer page
in the preview, click a launcher, and watch the service call in
*Developer tools → Events* (or just watch the box). The
`smoke-googletv` pattern in `tests/` shows how the dialect expands
if you want to probe yours headlessly.

## Share it

A good dialect is fifteen lines that save the next person an
evening. PRs adding stock dialects (Roku, webOS, Kodi, Shield…)
are very welcome — one entry in the starter config plus a line in
this doc's table of shapes.
