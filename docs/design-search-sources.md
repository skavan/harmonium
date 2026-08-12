# Design — search sources

**Status:** **phases 1 and 2 BUILT (v0.69, 2026-08-09)** — engine +
Studio source + `tests/smoke-search.mjs`, mirrored to `G:\`, not yet
pushed to any house. Phases 3 (the Sonos index) and 4 (scope chip and
derived tabs) are still design only.
**Measured on:** CT / Cat Rock, `192.168.1.87`, engine v0.68.7, config v2 (Porch).
**Supersedes:** the `search` block as it exists today (v0.66–v0.68.3), which
stays working throughout — every step below is additive.

---

## 1. What's wrong today

Search is opt-in per browse tile and declared like this (Jamaica, live):

```json
{ "id": "lib", "type": "browse",
  "search": { "engine": "music_assistant",
              "entity": "media_player.ma_bar",
              "classes": ["artist","album","track","playlist"],
              "config_entry": "01KK4WSP09VCQ4G6PY95KTFP4R",
              "limit": 25 } }
```

Three problems, in increasing order of importance.

**It's invisible when absent.** CT's tile is `{ "id": "lib", "type": "browse" }`.
No `search` key → `B.qmp` is null → `browse.js` never renders the magnifier
chip. There is no message, no disabled state, nothing to notice. The feature
simply isn't there and the config gives no hint that it could be.

**It puts a house device inside a stock controller.** `controllers.music_library`
is shared library code — it travels into every workspace of every house. v0.44.1
purified the platform controllers precisely so they'd carry zero entity ids;
v0.46.1 did the same for the player. `search.entity` walked one straight back in.
Suresh, 2026-08-09: *"It's hardcoding a device inside a stock controller. This
should be provided by context."*

**It conflates four different kinds of decision** in one block: which engine
answers, which entity it runs on, what scope to ask for, and how deep to dig.
Only two of those are decisions a *house* makes; one is a fact about a *device*
and one is a preference.

---

## 2. Measurements — do not re-derive these

Everything below was measured on CT with read-only calls on 2026-08-09.

### 2a. The three engines, same query (`love`)

| | **Sonos native** | **MA via HA's generic call** | **MA via its own service** |
|---|---|---|---|
| call | `media_player.search_media` | `media_player.search_media` | `music_assistant.search` |
| entity | `media_player.sonos_basement` | `media_player.ma_sonos_basement` | n/a — `config_entry_id` |
| returned | **521 items** | 35 items | exactly `limit` |
| classes | **track only** | 7 classes × **5 each** | whichever `media_type` asks |
| honours `media_filter_classes`? | **no** — asked album/artist/playlist, still got 521 tracks | n/a | yes |
| source ids | `x-file-cifs://HELIOS/Music/…` | `library://` + `spotify--KaE6qkdp://` | `library://` (`library_only`), + providers without |
| depth control | none | none — 5 is the hard ceiling | `limit` |
| metadata | title + id | browse-shaped | rich: `artists[]`, `album{}`, `image`, `favorite` |

**"Sonos can't search" is false here.** That claim is written into
`core/browse.js`'s doctrine comment and it was true of Jamaica's Bar Sonos,
which has no local library share. CT's Sonos indexes a NAS and answers 521
uncapped hits. It is a *house* fact, not a platform fact, and the code should
stop asserting it.

### 2b. Capability flags cannot be trusted here

`supported_features`: native Sonos `8321599`, MA `8322623`. The difference is
exactly `1024` — `VOLUME_STEP`. **Both** set bit 22 (`4194304`,
`SEARCH_MEDIA`). The flag cannot tell apart two players that behave completely
differently.

Worse: **every node of the Sonos browse tree reports `can_search: false`**
while `search_media` on the same entity returns 521 results.

Consequence: never gate search on a capability flag. Gate it on declaration,
or on a source that has actually answered.

### 2c. The Sonos browse tree

Root: **Favorites**, **Music Library**, then seven `media-source://` apps
(AI generated images, Camera, Image, Image upload, My media, Radio Browser,
Text-to-speech) — already hidden at the root by the v0.49.1 curation rule.

```
Music Library →  Contributing Artists  A:ARTIST
                 Artists               A:ALBUMARTIST
                 Albums                A:ALBUM
                 Genres                A:GENRE
                 Composers             A:COMPOSER
                 Tracks                A:TRACKS
                 Playlists             A:PLAYLISTS
                 Folders               S:

Favorites     →  Playlists  object.container.playlistContainer
                 Radio      object.item.audioItem.audioBroadcast
                 Tracks     object.item.audioItem.musicTrack
```

**Favorites → Playlists is 13 items:** three Spotify favourites
(`FV:2/16` Coffee Shop Alternative, `FV:2/24` Discover Weekly,
`FV:2/25` Release Radar) and ten Sonos saved queues (`SQ:0`–`SQ:9`).

**Music Library → Albums is 697 items, returned in ONE call, `not_shown: 0`.**

| serialisation | bytes | per item |
|---|---|---|
| full browse JSON | 322,119 | 462 |
| slim + thumbnail | 192,477 | 276 |
| slim, no thumbnail | **71,689** | **103** |

Two things follow. Sonos hands back a whole category in a single request, so a
"crawl" of every category is roughly **eight requests total** — a Refresh
button that finishes while you watch, not an overnight job. And the category
nodes are *small*: tens of KB. Only Tracks is large (order 1.8 MB slim), and
Tracks is the one node we don't need, because live Sonos search already covers
tracks, uncapped.

### 2d. Instance facts

- CT Music Assistant config entry: `01KKZBZ5P5KEYZCEFZQW0GBCKR`
- Jamaica's: `01KK4WSP09VCQ4G6PY95KTFP4R` — **instance-specific, never copy between houses**
- CT MA players are `media_player.ma_sonos_<room>`; natives are `media_player.sonos_<room>`

---

## 3. Prior art: the Mediocre media player card

Running on CT today (`mediocre-hass-media-player-cards`, dashboards `ma-player`
and `dashboard-temp`). Its config is worth copying because it solved the same
problem:

```json
"search_enabled": true,
"media_players": [
  { "entity_id": "media_player.ma_sonos_dining_room",
    "ma_entity_id": "media_player.ma_sonos_basement" }
],
"media_browser": [
  { "entity_id": "media_player.ma_sonos_basement",
    "media_types": [ "playlists", "tracks", "artists", "albums", "radio" ] } ]
```

Three lessons:

1. **It does not auto-detect.** You name the MA entity yourself. The "smart
   toggle" is `search_enabled` — a plain boolean, used `true` on one dashboard
   and `false` on the other.
2. **`ma_entity_id` lives inside the player's own entry**, beside
   `can_be_grouped` and `ma_favorite_button_entity_id`. It is treated as a fact
   about that speaker, not a property of the card.
3. **`media_types` is declared per player**, with names and icons — the tab set
   is a property of the source, not a global.

---

## 4. The model: sources

Stop calling anything a fallback. There are **sources**; a house has some
subset; the UI shows what answered.

| source | mechanism | answers | latency | works offline |
|---|---|---|---|---|
| `ma` | `music_assistant.search`, two waves | every class, `limit`-deep, rich metadata | seconds | no |
| `index` | crawled browse tree, cached HA-side | favourites, saved queues, artists, albums, genres, composers, playlists | instant | **yes** |
| `player` | `media_player.search_media` on the cast player | whatever that platform does — Sonos: uncapped NAS tracks | live | no |

CT has all three. A Sonos-and-NAS house with no Music Assistant has two, and
`index` is the only thing that gives it artist/album search — which is what
makes the index **first class rather than an optimisation**. An MA-only house
has one.

The index also owns something nothing else can see: `FV:` and `SQ:` are
Sonos-side objects. Music Assistant has no knowledge of them. Those thirteen
playlists are browsable today and unsearchable, and they are the ones guests
reach for.

---

## 5. Layering: the claim belongs to the device

### Where the pointer goes

`media_player.ma_sonos_basement` is not a property of the music library page.
It is a fact about the physical speaker: *this box's searchable index lives at
that entity*. That is exactly the shape of a **claim** in the Pre-wired Devices
library, alongside `media_player`, `volume_level`, `source_select` and
`commands`.

So: **`search` becomes a role.** A device claims it once; every activity that
casts that device inherits it; the stock controller says `$context.search` and
names nothing. This is also what the Mediocre card does — `ma_entity_id` sits
in the player's entry.

Resolution order, matching how the engine resolves everything else
(explicit → derived → nothing):

1. **Controller override** — an explicit `search` block on a *custom*
   controller. Wins. This is the escape hatch and the way to pin something odd.
2. **Activity override** — `overrides` on the activity, for the one activity
   that needs a different answer.
3. **Device claim** — `$context.search`, wired once in the library. The normal
   path.
4. **Nothing** — no magnifier. Not an error; a page that honestly cannot search.

### Why not auto-detect

Because §2b: the capability flag is set on players that return nothing useful,
and unset on nodes that search fine. Auto-detection would have enabled search on
Jamaica's Bar Sonos and produced a permanently empty result page.

### Why the claim is not the v0.49 heuristic

v0.48.3 added an MA-twin *seeder rule* — if `media_player.ma_<object_id>`
exists, claim it for playback — and v0.49 reverted it as the wrong layer. That
verdict stands and this doesn't reopen it. The difference: a heuristic **guesses
at runtime, every time**; a claim is **asserted once by a human and stored**.
The device seeder may still *offer* the twin as a prefilled default — that's a
suggestion in an editor, not an inference in the engine.

### Disabling

Two honest forms, both needed:

- **Don't claim it** on the device — that house/device simply has no search.
- **A per-surface switch** on the controller, the `search_enabled` analogue, for
  "this device can search but this page shouldn't offer it". Suresh has used
  exactly this on the Mediocre card, `true` on one dashboard and `false` on
  another, so it is not hypothetical.

Forcing a whole custom controller copy just to turn search off is too heavy —
that was the v0.23 lesson about `surface.devices: false`.

---

## 6. The index pipeline

### What to crawl

**Crawl:** Favorites (Playlists, Radio, Tracks), Music Library → Artists,
Albums, Genres, Composers, Playlists. Roughly eight requests, tens of KB.

**Do not crawl:** `A:TRACKS`. Order 1.8 MB, and live Sonos search already
answers track queries uncapped and instantly. Indexing it buys offline track
search only — a real but separate feature, and the reason the storage design
below leaves room for it.

**Do not crawl** the `media-source://` roots. They're HA's junk drawer and are
already hidden.

### Where it runs

The integration, not the engine. **The engine reads an index; it never builds
one.** Crawling, scheduling and staleness are HA-side, exactly like the config
and the music sensors.

`sensor.py` already is this pipeline for Music Assistant (v0.31): a
`DataUpdateCoordinator` calling `music_assistant.get_library` per category,
hourly, publishing `sensor.harmonium_music_<category>` with an `items`
attribute slimmed to `name/uri/media_type/image` and marked `_unrecorded`,
tolerant of a first load with MA absent, retrying every 5 minutes while empty,
re-fetching on `EVENT_HOMEASSISTANT_STARTED`. The Sonos index is the same
coordinator with `media_player/browse_media` as the source.

### Storage

Split by size — the existing v0.31 caveats apply and 72 KB is too much for a
state attribute (it lives in the state machine and is copied on every write):

- **Small sets** (favourites, saved queues, playlists — a few KB):
  `sensor.harmonium_sonos_<category>`, `items` attribute, `_unrecorded`.
  Same shape as the music sensors, rides the existing subscription.
- **Large sets** (artists, albums, genres, composers — tens of KB, and tracks
  later at ~1.8 MB): a JSON file under `www/harmonium/`, which the integration
  already writes to and the engine already fetches from. No new plumbing.

Record `built_at` in both, so age is displayable rather than mysterious.

### Refresh

- A service — `harmonium.refresh_index` — callable from a tile in the library
  and from the Studio.
- A nightly schedule. Not hourly: the content changes when *he* changes it.
- **Visible age** in the UI. "Why isn't my new playlist here" must be
  answerable by looking, not by guessing.

---

## 7. UI

### Scope, not merge

A scope chip on the query line: **My Library · Everything · Sonos**.

Two reasons this beats the current invisible merge.

*Comprehension.* The two waves already run library-first-then-providers and
merge silently (§8). That is the right default for "find me this song" and the
wrong behaviour for "why isn't my CD in here" — the user cannot see which well
was dry.

*Correctness.* MA's `library://track/16202` and the Sonos index's
`x-file-cifs://…` are the same song under different uris, and the per-kind
dedup keys on `uri`. Merge them blindly and every ripped track appears twice.
A scope sidesteps it entirely; a cross-source dedup would need fuzzy
title+artist matching, which is a much bigger promise.

Default to the merged *My Library → Everything* behaviour that exists today.

### Tabs derived from the source

Show a kind's tab when that source can answer it — or is still loading it — and
drop it otherwise. A Sonos-live search fills Tracks and nothing else; three
permanently empty tabs is the current design's fault, not Sonos's.

This also splits today's overloaded `classes` into the two things it actually
means: *what to ask for* (a scope preference) and *what can come back* (a fact
about the source, like the card's `media_types`).

### What must not regress

Hard-won and not to be touched casually — v0.68.1 shipped two fixes that
cancelled each other and it took testing them one at a time to find:

- the **350 ms debounce**, so a search fires per query and not per keystroke;
- **`brEcho`** — a keystroke repaints the query *text* only, never the page;
- the **`seq` guard**, so a slow answer to an old query can never overwrite a
  newer one;
- **one grid render at search start**, which is what paints "Searching…";
- **`capped[]`**, the no-silent-truncation rule — kinds that came back full say
  the well is deeper.

---

## 8. What exists today, for reference

`context.js` sets the gate when a `type: browse` tile is expanded:

```js
const sQ = t.search || (t.search_entity ? { entity: t.search_entity } : null);
B.qmp     = sQ && sQ.entity ? resolveEntity(sQ.entity) : null;
B.qengine = (sQ && sQ.engine) || (B.qmp ? "music_assistant" : "");
B.qclasses= (sQ && sQ.classes) || ["artist","album","track","playlist"];
B.qentry  = (sQ && sQ.config_entry) || "";
B.qlimit  = (sQ && +sQ.limit) || 0;
```

`browse.js` renders the magnifier chip only `if (B.qmp)`, and the two waves are:

```
per kind:  library_only: true    local, fast, painted on arrival
           library_only: false   providers, slow, merged as they arrive
dedup per kind by uri; library above catalogue; capped judged on wave 2 only
```

`config_entry` is what lifts the 5-per-class ceiling (§2a). It likely need not
be authored at all: HA's entity registry maps an entity to its
`config_entry_id`, and the Studio already fetches that registry (v0.45.2, to
claim devices by integration). Deriving it from the resolved search entity would
remove the last instance-specific string from the config.

---

## 9. Config shape (target)

Device library — the normal path, one place, house-wide:

```json
"devices": {
  "sonos_basement": {
    "claims": {
      "media_player": "media_player.sonos_basement",
      "search":       "media_player.ma_sonos_basement"
    } } }
```

Stock controller — pure, names nothing:

```json
{ "id": "lib", "type": "browse", "search": { "entity": "$context.search" } }
```

Per-surface switch, and the custom-controller override:

```json
"search": false
"search": { "entity": "media_player.ma_bar", "sources": ["ma", "index:sonos"] }
```

Deliberately boring. No generator grammar, no indirection: a list of named
sources and an entity. The `presets` generator was parked for being cryptic —
*"the page you look at isn't the page you edit"* — and this must not repeat it.

---

## 10. Open decisions

1. **Index tracks too?** Live search covers them today. Indexing buys offline
   track search at ~1.8 MB. Deferred, not refused — the file store exists for it.
2. **Is the no-MA house a target?** Answered yes ("It's first class"), which is
   why `index` is a source and not an optimisation. Re-confirm before building
   the crawler, because it sets how much polish the index UI deserves.
3. **Does `classes` split into ask-for vs can-answer?** §7 says yes; needs a
   name for the second one (`media_types`, following the card, is fine).
4. **Where does the per-surface switch live in the Studio** — the browse tile's
   editor, or the controller's settings panel?

---

## 11. Build plan

Each phase ships and is useful alone. Nothing here is started.

**Phase 1 — the claim.** `search` role in `SLOT_DOMAINS`; device-library claim;
stock `music_library` tile rebound to `$context.search`; resolution order §5.
Ships CT's search with no entity id anywhere in a stock controller, and fixes
the doctrine violation. Engine + Studio + config. Smallest useful change.

**Phase 2 — derive `config_entry`.** Resolve it from the search entity via the
entity registry; keep the explicit key as an override. Removes the last
instance-specific string.

**Phase 3 — the index.** Integration crawler on the existing coordinator; the
storage split of §6; `harmonium.refresh_index`; `built_at`. Engine reads the
sensors/file as a source. This is where `FV:`/`SQ:` become searchable.

**Phase 4 — scope and tabs.** The scope chip, per-source tab derivation, index
age in the UI, per-surface switch in the Studio.

Ceremony per phase, per `houses/README.md`: build, `push <house> all`, restart
HA only if `.py` changed, hard-refresh the Studio, reload the remote. Never
`harmonium.reseed`.

---

## Appendix — reproducing the measurements

All read-only. `entity_id` is CT's; substitute per house.

```
media_player.search_media   entity_id=media_player.sonos_basement
                            search_query=love                            -> 521 tracks
media_player.search_media   entity_id=media_player.ma_sonos_basement
                            search_query=love                            -> 35 (7 x 5)
music_assistant.search      config_entry_id=01KKZBZ5P5KEYZCEFZQW0GBCKR
                            name=love media_type=[track] limit=25
                            library_only=true                            -> 25 library:// tracks

ws  media_player/browse_media  entity_id=media_player.sonos_basement     -> roots
ws  media_player/browse_media  media_content_type=library
                               media_content_id=""                       -> 8 categories
ws  media_player/browse_media  media_content_type=favorites_folder
                               media_content_id=object.container.playlistContainer
                                                                         -> 13 playlists
ws  media_player/browse_media  media_content_type=album
                               media_content_id=A:ALBUM                  -> 697 albums
```
