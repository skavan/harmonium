# GitHub release body — v0.85.8

---

One new service, photo presets, TV app logos, and three fixes on top of v0.85.7. Update in HACS, restart Home Assistant, open the Studio, Save & Deploy once; remotes on the versioned Start URL update themselves. (Engine updates reach a running remote automatically; config-only changes show on its next load — use Fully's Load Start URL when you want them now.)

**New: `harmonium.run_preset`.** Fire any preset tile from an automation, a script, a dashboard button, or a wall switch — it behaves exactly like tapping the tile. If the preset's activity isn't running, Harmonium starts it first; if it's already running, the preset just fires — no restart, no interruption. Action data passes through verbatim, so Music Assistant radio/playlists, TV channels with nested `media:` payloads, `$context` targets, and sequences all work.

```yaml
service: harmonium.run_preset
data:
  preset: tile_pfh5   # the tile's id — Studio → the preset card → Advanced
```

**New: photo presets.** Give a preset tile an `image` and it becomes the same full-bleed photo card a room/nav tile is — picture edge to edge, name overlaid. `image_opacity` and `label_pos` work as on nav cards, and the Studio's preset Styling tab has the fields. A preset without an image is unchanged; a photo URL that stops loading falls back to the icon square.

**New: TV app logos.** The apps drawer shows real channel logos — a shipped pack of 21 covers the whole stock catalog, deployed to `www/harmonium/apps/` on restart. App tiles become uniform channel-poster cards (Roku store shape, rounded corners, two per row); an app with no logo falls back to icon + name in the same box. Your own image path on an app wins over the shipped logo, and adding a logo for a custom app is one correctly named file — see [App logos](https://github.com/skavan/harmonium/blob/main/docs/cookbook/app-logos.md).

**New: four more built-in Fire TV apps.** Hulu, Fubo TV, ESPN, and BritBox joined the stock Fire TV catalog (verified on hardware, logos included). New installs get them out of the box; existing configs can add them in Studio → TV Apps until the next release delivers stock additions automatically.

**New: per-activity view tuning.** An activity's `views` map (Advanced JSON) adjusts any page's layout — columns, tile sizes — while that activity is on screen, without editing or forking the built-in page: `"views": { "apps": { "columns": 3 } }`.

**New: a scroll cue.** When a page has more below the fold, a small orange triangle floats at the bottom center; it disappears at the end of the scroll and rides above the TV/volume strips.

**Now Playing could stop updating after a track change.** The progress bar on the default Art Hero card only moved when a state update happened to arrive, and artwork could wedge on the previous track (or on the placeholder) for players that serve one artwork URL whose content changes per track. Artwork and the bar now follow the track — when it changes, everything re-evaluates.

**RS90: REW/FWD in the Studio preview seeked ±15s instead of changing tracks.** The stock RS90 skin's transport hotspots fired the hold (seek) behavior; a tap on the physical buttons is previous/next. Fixed to match the hardware; heals automatically unless you've replaced the skin with your own photo.

**Now Playing shows app names, not package names** — a player reporting `com.britbox.us.firetv` displays `BritBox`, mapped from your TV Apps list; already-friendly names and unknown packages pass through unchanged.

**Preview tooltips no longer call working keys dead** — they now know the engine's built-in transport and seek meanings.

Full notes: [release-notes-v0.85.8.md](https://github.com/skavan/harmonium/blob/main/docs/releases/release-notes-v0.85.8.md). Coming from 0.85.6? Read the [v0.85.7 notes](https://github.com/skavan/harmonium/blob/main/docs/releases/release-notes-v0.85.7.md) first — that's where the breaking hold-key changes live.
