# Harmonium v0.85.8

A small release on top of v0.85.7 — one new service, photo presets, and three fixes, no schema changes. If you're on 0.85.7: update in HACS, restart Home Assistant (the new service lives in the integration), open the Studio, Save & Deploy once. Remotes on the versioned Start URL pick the new engine up on their own.

One rule worth knowing: engine updates reach a running remote automatically, config changes don't. After a config-only change (a Studio save, an edited activity), a remote shows it on its next load — when you want it now, use Fully's Load Start URL. That's the intended flow, not a bug.

## Added

- **`harmonium.run_preset` — fire a preset from anywhere in Home Assistant.** Any preset tile you've placed on a screen can now be called from an automation, a script, a dashboard button, or a wall switch, and it behaves exactly like tapping the tile: if the preset belongs to an activity that isn't running, Harmonium starts that activity first (select flips, the activity's Start action runs), then fires the preset. If the activity is already running, it just fires the preset — no restart, no interruption. This is the difference from `set_activity` with `start: true`, which runs the Start action unconditionally.

  ```yaml
  service: harmonium.run_preset
  data:
    preset: tile_pfh5        # the tile's id — Studio → the preset card → Advanced
    # workspace: main        # only needed if the same id exists in more than one workspace
  ```

  The preset's action data is passed through verbatim, so anything that works from the tile works from the service — Music Assistant radio and playlists, TV channels with nested `media:` payloads, `$context` targets resolved from the activity, and sequence actions. Browse shortcuts and empty presets can only be tapped on a remote and say so if called. Generated favorites tiles (from `presets_from`) are minted at render time and aren't addressable this way.

- **TV app logos.** The apps drawer now shows real channel logos. Harmonium ships a logo pack (21 services — Netflix, Prime Video, YouTube, Disney+, Max, and the rest of the catalog) that deploys to `www/harmonium/apps/` on restart, and every app tile becomes a uniform channel-poster card (290:218, the Roku store shape) with rounded corners, two per row as before. An app with no logo — including your own custom apps — falls back to its icon and name, centered in the same box, so the grid stays even. To use your own art for an app, set an image path on the app in Studio → Apps; your file wins over the shipped logo, and a logo you replace in `www/harmonium/apps/` is preserved across updates (same per-file ownership stamp as skins and sounds). Note one behavior change: an app's `image` used to render as a small icon stamp — it is now the full logo card. Adding logos for your own apps is one file with the right name — see [App logos](../cookbook/app-logos.md).

- **Fire TV: four more built-in apps.** Hulu, Fubo TV, ESPN, and BritBox joined the stock Fire TV app catalog, launch commands verified on real hardware, logos included. New installs get them out of the box; if you already have the Fire TV dialect in your config, add them in Studio → TV Apps for now — an update that delivers stock catalog additions to existing installs automatically is the headline of the next release.

- **Per-activity view tuning — restyle a built-in page without forking it.** An activity can now carry a `views` map (Advanced JSON on the activity) that adjusts a page's layout while that activity is the one on screen. Any grid key works: `columns`, `tile_width`, `tile_h`, `row_h`, `tile_style`, `max_width`. The built-in page itself is never edited, so it stays locked, keeps healing, and keeps receiving stock updates — and the same shared page can look different per activity (the apps drawer 2-up for the TV, 3-up for the console).

  ```json
  "views": { "apps": { "columns": 3 } }
  ```

  The key is the page id from the Studio's Page-id field.

- **A scroll cue.** When a page has more below the fold, a small orange triangle floats at the bottom center of the screen. It disappears when you reach the end, and it rides above the TV/volume strips when those are showing. It's purely a hint — taps pass straight through it.

- **Photo presets.** A preset tile can now carry an `image`, and it becomes the same full-bleed photo card a room/nav tile is — picture edge to edge, name overlaid, icon retired. `image_opacity` and `label_pos` work exactly as they do on nav cards, and the per-tile `css_vars` font knobs apply as everywhere else. In the Studio, the preset card's Styling tab has the Image, Image opacity, and Label position fields; the opacity and position knobs appear once an image is set. A preset without an image is unchanged, and `icon_image` keeps its old meaning — a small art stamp in the icon slot, not a photo card. If a photo URL stops loading (remote artwork, network drop), the tile falls back to its icon square instead of showing a broken image.

## Fixed

- **Now Playing could stop updating after a track change.** Four related causes, all fixed: the progress bar on the default Art Hero card only moved when a state update happened to arrive (the 1-second ticker skipped the hero style); a player that serves one artwork URL whose *content* changes per track never re-fetched the cover; a transient artwork-fetch failure right after a track change could lock the placeholder in; and the black-artwork detector remembered its verdict per URL, so one dark cover flagged that URL forever. Artwork and the progress bar now follow the *track*: when it changes, everything re-evaluates.
- **RS90: clicking REW/FWD in the Studio preview seeked ±15s instead of changing tracks.** The stock RS90 skin's transport hotspots were wired to the hold (seek) behavior; a tap on the physical buttons is previous/next. The hotspots now match the hardware. (Heals automatically unless you've replaced the skin with your own photo.)
- **Now Playing shows app names, not package names.** A player that reports its running app as a raw package (`com.britbox.us.firetv`) now displays the app's name from your TV Apps list (`BritBox`) — Harmonium maps the package strings in your launch entries back to their app identities. Players that already report a real name are untouched, and packages Harmonium doesn't know pass through as before.
- **Preview tooltips no longer call working keys dead.** The key tooltips now know the engine's built-in meanings for the transport keys (previous / play-pause / stop / next drive the running music from any page) and for hold-◀/hold-▶ (seek ∓15s on music pages) — previously they reported "nothing on this page" for keys that work fine.

Full details of everything in the 0.85.7 line: [release-notes-v0.85.7.md](release-notes-v0.85.7.md) — including the breaking hold-key changes if you're coming from 0.85.6.
