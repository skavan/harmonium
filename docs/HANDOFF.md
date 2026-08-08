# HANDOFF — session ended 2026-08-06 (v0.68.6 built, awaiting push)

Read `docs/PROJECT.md` first; it is the living document. This file is
the bridge from the last session to the next one.

## READ THIS FIRST — the next push

`push-to-ha.bat` → `harmonium.reseed` → reload the remote.
**No HA restart needed** — nothing here touches `.py`.
Carries engine **v0.68.6** + config **v28** — the three Bar music
presets on the ROOM page in a proper `role: "presets"` section, three
across; `include` on the presets generator; and the generator now
stamps the owning ACTIVITY on each tile, so firePreset's v0.12
warm-start finally applies to generated presets. The three
hand-rolled `bar_play_*` sequences are deleted — the chassis does it.
**The Studio also changed** (`HubEditor.roleOf` now knows the
`presets` type): source only, so `npm run build` in `studio-src/`
when convenient. See v0.68.5 and v0.68.6 in PROJECT.md.

Before this, engine v0.68.3 + config v26 were deployed, reseeded and
audited, and the repo adopted the live store wholesale — including his
Studio deletion of the Bar's "Games Room" nav card, which the merge
correctly preserved.

Previously (v25, deployed): engine **v0.68.3** + config **v25**. Engine: the surface-owner
rule (a music controller is no longer supplied by a running Xbox), the
"Searching…" line that v0.68.1's own speed fix had suppressed, and
two-wave search (library first, providers second). Config v25 restores
the full 13-app googletv catalogue on top of v24's Google TV repair:
the renamed ADB entity, the `adb shell` prefix stripped from all 18
googletv commands, `dialect: googletv` added to both Games contexts,
direct power with an outcome-guarded IR fallback. (v0.68.2 pruned the
googletv app catalogue to the 4 installed; v0.68.3 RESTORED all 13 —
it is his shared reference library, not one TV's inventory.) See
v0.68.2 and v0.68.3 in PROJECT.md. The Studio is SOURCE-only
this time: `studio-src/…/TileRow.svelte` gained the two new search
fields, so run `npm run build` in `studio-src/` when convenient. Your
`studio.html` is current and was NOT touched — see the near-miss note
under v0.67.3 in PROJECT.md.

Config v20 was built by **adopting the live store wholesale** and then
editing — so his Studio work (the Bar › Devices reorder, the new "Bar"
card on the Games page, the Zone Amps cut from `games_music`) is
already in the repo and the merge has nothing to fight. Diff
`config.main.backup.json` against the merged result afterwards; that
audit is routine.

**Answered:** search was never favourite-scoped — HA's generic
`search_media` simply caps at 5 per kind with no dial. v0.67.3 asks
Music Assistant's own service instead (`config_entry` + `limit` on the
browse tile) and gets 25. See v0.67.3 in PROJECT.md.

**Untested on hardware (v0.68.2):** the Google TV cold-start path.
`media_player.turn_on` is the primary and the IR toggle is the guarded
fallback, but I could not switch off a television he might have been
watching, so which of the two actually wakes it from cold is unknown.
Watch it once and delete the loser. Also unproven: ADB `input keyevent
243` for HDMI1 — it would replace the last Harmony dependency in that
room, and ADB is now confirmed alive, so it is a 10-second test.

**Search speed, answered (v0.68.3):** the floor was the Spotify
round-trip. `library_only: true` returns instantly, so each kind is now
asked twice — library first, providers second, deduped by uri. If the
provider wave still drags, the remaining levers are `limit` (25) and
fewer `classes`, both one field on the browse tile in the Studio.

**Watch for on the panel:** the MA config-entry id is baked into
config (`controllers.music_library` → tile `lib` → `search`). If MA is
ever removed and re-added in HA, that id changes and search silently
falls back to the shallow path. The Studio now shows the field.

## Where things stand

- **Jamaica (192.168.1.95) is installed and daily-usable.** Integration
  loaded, Studio in the sidebar. **Two rooms now** — Bar (2
  activities) and Games Room (3), the second built 2026-08-06.
  **Running** engine **v0.67.3** / config **v19** on the machine
  (pushed, reseeded and audited 2026-08-06 20:56 UTC; HA restarted so
  the v0.67.1 minting `.py` is finally the code in memory).
  **v0.68 engine / config v22 was pushed, reseeded and audited
  2026-08-07 15:2x UTC** (zero-difference merge) and RUN on the
  tablet — his five notes became v0.68.1.
  **Engine v0.68.5 / config v27 is LIVE (reseeded + audited
  2026-08-07); engine v0.68.6 / config v28 awaits
  `push-to-ha.bat` + `harmonium.reseed`, no restart.** The GAMES ROOM is parked: he ran
  out of time and never tested it on hardware, and he has removed its
  nav card from the Bar page. The BAR is working well and is where the
  next session should start.
  The Studio's `studio.html` is CURRENT and untouched; only
  `studio-src/…/TileRow.svelte` changed, awaiting a `npm run build`.
  v0.67 / config v16 was pushed and reseeded 2026-08-06; the Games
  Room's select was minted by an integration reload. Includes his own
  Studio edits (a "Device Control (Expert)" nav card into the
  `bar_devices` subpage, "Zone Amps", renamed amps, tile curation).
- **v0.63 was deployed and reseeded** 2026-08-05, verified
  byte-identical to the repo; v0.64 supersedes it and is queued.
- **The repo config MATCHES the live store** (v0.62 adopted it
  wholesale before editing). That is what made the reseed safe:
  his Studio work — the "Device Control (Expert)" nav card, the
  `bar_devices` page, "Zone Amps", the renamed amps, the tile curation
  — is in `dist/config.json`, so the merge has nothing to fight.
- What v0.60 was: **cast groups** (a per-activity view — `{"group":…,
  "shows":…, "members":[…]}` in the cast, one nav card + a generated
  `group:<id>` page), the retirement of v0.59's `volume_zone` device
  role, sticky `SF_SEEN`/`OPT_SEEN` so a sleeping device keeps its
  page, and the Studio UI for all of it.
- What v0.62 is: the media library stops slicing when the slices are
  arbitrary — an **All** chip (badged by source folder), `categories`
  to reorder/filter the chip strip, a roots row that collapses when it
  holds one root, and **no silent truncation** (both caps now say so).
  Drawers presume an activity like the generated screens do. Studio
  side: the **Roles** dropdowns now list the WHOLE cast — a device that
  hasn't claimed the role appears as "＋ <name> · <entity> — add the
  claim", which mints the claim on the device and wires it in one go.
  And the code stopped saying "jobs" where the UI says Roles.
- What v0.65 is: **library SEARCH with an on-screen keyboard.** The
  magnifier is the first chip; search mode swaps the bands for a query
  line + QWERTY grid, and the chips become the KINDS the answer holds.
  **Sonos cannot search** — `search_entity` on the browse tile names
  the Music Assistant player that can (`media_player.ma_bar`), and
  results play there because the ids are MA's.
- What v0.64 is: **presets belong to the ACTIVITY**, not the shared
  controller. `activities.<id>.presets` + a `{type: "presets"}`
  generator, and a **Presets tab** on the activity card in the Studio
  (TileRow reused, so the full preset editor comes free). Supersedes
  v0.63's `when`-scoped tiles on `controllers.music`.
- What v0.63 was: a preset may name a SEQUENCE directly; the
  Bar↔Pool join/unjoin presets; the sonos_bar / sonos_pool renames;
  `bar_devices` got its `parent`.
- What v0.61 is: **the presumed activity** — a controller with nothing
  running now draws as the activity that owns it, in its off state,
  instead of the "No activity is active" apology, and its power button
  starts that activity. Truth (End button, hold-Power, tile ON state)
  did not move. Plus the Studio's **return trip**: the cast → device
  library jump now carries a sticky "← Bar · Listen to Sonos" banner
  that re-opens and scrolls to that activity card. Full entries in
  PROJECT.md.
- Home/CT is untouched by this session. Everything below was authored
  against the Jamaica clone at
  `G:\Local Documents\Code 2025\repos\harmonium` (dragonfly-evo).
- v0.56 shipped as it stood; v0.56.1 → v0.63 were built and deployed
  here. v0.61 onwards are verified headless but not yet FIELD-tested —
  see the open list.

## What the GAMES ROOM is (new, 2026-08-06 — UNTESTED on hardware)

Built from the `games-*` dashboards and their scripts. Every device was
off at build time, so **nothing here has been exercised against the
real room.**

| | |
|---|---|
| Watch Google TV | `media_player.turn_on` DIRECT, then IR `PowerToggle` only if the TV never answered in 8s, then HOME over ADB (v0.68.2) |
| Play Xbox | console via `media_player.turn_on` on the MA renderer, TV direct + guarded IR, **HDMI1 still over Harmony IR** (ADB keyevent 243 unproven), Onkyo on, Onkyo → `Game` |
| Listen to Music | the **Pool Sonos alone** — v0.67.4 took the Onkyo out entirely (his: "in games/pool the onkyo is not involved at all in Sonos") |
| Master volume | GTV: the TV itself · Xbox: the Onkyo · Music: the Pool Sonos |

**Assumptions to check first:**

1. **Music source — ANSWERED, and I had it wrong.** I built
   `games_music` by analogy with the Bar's, where the Sonos really does
   feed the receiver, so the Onkyo was threaded through its wiring,
   context, devices, state and both sequences. It isn't involved at
   all. v0.67.4 removed every trace. **Now watch the ON state**: truth
   used to be "receiver powered AND on the CD input"; with no receiver
   the Sonos is the only witness, so it is
   `{any_state: [playing, paused]}` — an idle Sonos will read as off,
   and pending-impersonation (v0.48) carries the UI until the first
   note.
2. **HDMI1 — ANSWERED: IR, and only IR.** ADB cannot switch the input
   of a TV that is asleep, because ADB needs it awake. His own
   `script.hisense_xbox_on` uses Harmony `InputHdmi1` (cold) /
   `HDMI1` (already on) and that is now what the sequence does. The
   ADB entity stays wired as the `commands` role for in-activity keys,
   where the TV is by definition already on — that part is still
   unproven and is the next thing to watch.
3. **Two TV entities, two MACs — the ADB one is the WITNESS, not a
   power route.** WOL is gone (it fired at 22:07 on 2026-08-06 and woke
   nothing; the `cold_start` trait is deleted).
   `media_player.games_room_tv` (androidtv_remote, `7c:b3:7b:…`) does
   power, keys and apps; `media_player.android_games_tv_192_168_1_41`
   (androidtv/ADB, `64:ae:f1:…`) does the input switch. His own legacy
   script used the ADB entity as the Hisense's state proxy, which is
   the evidence they are one television with two NICs. If they turn
   out to be two different boxes, the ADB keyevent is aimed at the
   wrong one.
4. **THE XBOX IS NEVER POWERED — CONFIRMED BY FIELD TEST**, and it is
   my omission, not a fault. `games_xbox_on` wakes the TV, switches
   HDMI1, powers the receiver and selects GAME. Nothing in it addresses
   the console, because `media_player.xbox` is a **Music Assistant**
   player, not the Xbox integration — the old script turned it on and probably woke nothing.
   The new sequence leaves it alone. If the Xbox needs waking, that is
   an open question.

## What the Bar is

Two activities, five devices, five sequences, and exactly one
bar-specific controller fork.

| | |
|---|---|
| Watch Fire TV | Hisense **Fire TV** (the TV *is* the streamer), ARC → Yamaha YAS-207 soundbar |
| Listen to Sonos | Sonos → Onkyo TX-NR6100 (main + Zone 2 "Entry & Gazebo") |
| Master volume | the Sonos itself, on the controller; both Onkyo levels sit in a **Zone Amps** cast group (v0.60) |
| Fork | `controller:bar_tv` — only because the YAS-207's sound modes are IR through a Harmony device named "Yamaha Amp" |

Everything else is stock library + config. The games room should be
mostly device description rather than screen building.

## Deploy ceremony (Jamaica)

1. `push-to-ha.bat` — SRC/DST already pointed at this machine, and it
   aborts with a clear message if `H:` is not the config share.
2. `harmonium.reseed` — **only when `dist/config.json` changed.** Three-
   way merge, snapshots first; `harmonium.restore_backup` is the
   one-deep undo. An engine-only change needs nothing here.
3. **No cache clear.** v0.57.1's versioned-asset stub does it: the
   entry stub asks `/api/harmonium/engine_version` for a hash of the
   deployed engine and hands off to `../index.html?v=<hash>`.
4. Restart HA only when `custom_components/harmonium/*.py` changed.
5. Studio (`studio.html`) is a browser-cached `.html` — hard-refresh
   that tab after pushing it.

## Open, in the order I would pick them up

1. **FIELD-TEST THE GAMES ROOM.** Built blind — every device was off.
   Start with *Watch Google TV* (fewest moving parts, no IR): does WOL
   + `media_player.turn_on` actually wake the Hisense, and does HOME
   land? Then Xbox (the IR input switch is the risk), then Music (check
   the Sonos assumption above). See "What the Games Room is".
2. **Fire TV D-pad latency (~1 s/key).** `screencap_interval: 0` and
   `get_sources: false` are both applied — those were the two levers
   HA has. If it is still a second per key the remaining suspects are
   the network path and the TV's own SoC, not Home Assistant. Unproven
   either way; Suresh was testing when the session ended.
3. **Does the Sonos master slider move the room?** If that Port has a
   FIXED line-out its volume does nothing, and the master should go
   back to `bar_onkyo` — the zones arrangement is unaffected.
4. ~~Scope the MA search~~ — **DONE in v0.66.** Kept here only for the
   reasoning (full version in PROJECT.md's DESIGN NOTE):
   - pass `media_filter_classes: [artist, album, track, playlist]` to
     `media_player/search_media` — his original list, and what keeps
     MA's generated playlists / recommendations / audiobooks out. He
     likes MA but finds it "almost too overwhelming"; the scope IS the
     answer to that.
   - **play results on the SONOS entity, not MA.** MA returns
     `spotify--<instance>://track/<id>`; the tail is a real Spotify
     base-62 id, so `spotify:track:<id>` falls out and HA's Sonos
     integration accepts `spotify:` URIs as-is. This puts playback on
     the same entity the controller already displays — no second
     player, no handoff to explain, and the HA box leaves the audio
     path. `library://…` results do NOT convert (no Spotify
     equivalent): play those via MA or filter them out, but be honest
     about the split.
   - expose the backend as a visible SETTING even though there is one
     option today — his words: "there is no plan B today, but it may
     come". Not a control (v0.62's one-option rule); a declaration of
     which engine answers, and the seam plan B slots into.
   Shipped as a `search` block on the browse tile + a Studio editor.
   **Artist is deliberately NOT convertible** — SoCo's share-link regex
   covers album/episode/playlist/show/track only.
5. **Field-test SEARCH.** Driven headless against mocked MA payloads
   (real ones captured first), but not used at the bar. Open questions
   only the room answers: are the keys big enough on the Fire tablet
   (they size off `--kb-*`, so `remotes.tablet.style` can grow them
   without a code change), and does searching from the Astrion's D-pad
   feel possible or pointless? And the one thing NOT yet proven on
   hardware: that Sonos actually accepts `spotify:album:<id>` from
   `media_player.play_media`. The code path is verified from HA's and
   SoCo's source, and this household has Spotify linked (Spotify
   playlists are Sonos favourites), but no note has been played through
   it. **That is the first thing to try** — pick any album from a
   search and listen.
6. **Field-test the library changes.** The All chip, badges, chip
   order and the collapsed roots row were driven headless against the
   REAL Sonos payloads (captured from `media_player/browse_media` on
   `media_player.bar`), but nobody has used them at the bar. Open
   question that only the room can answer: is All the right DEFAULT
   chip, or should it be present-but-not-selected?
7. **Field-test the groups UI.** Built and driven in a headless
   browser against the real Bar config (add a group, name it, pick
   `shows`, move devices in and out, the claim-missing note, the cast →
   library doorway) — but nobody has used it at the bar yet. The
   question to answer there is UX flow, not correctness: does the Zones
   card land where the hand expects it, and does "edit" on a group read
   as an edit or as a trap?
8. **Virtual screens are still invisible to the Studio.** `group:<id>`
   cannot be listed or previewed there — though unlike `zones:`, its
   *data* is fully editable in the activity's cast, which was the
   actual complaint. Revisit only if a third generated view appears.
9. **yaml/ round-trip, still.** Jamaica has NO yaml authoring model —
   `dist/config.json` is hand-built and the Studio edits the compiled
   config. **Running `node build.mjs` in this clone recompiles `yaml/`
   (the Porch model) over `dist/config.json` and would wipe the Bar.**
   The engine half of the build is safe; the config half is not.
   **The working discipline until it lands (v0.62):** before touching
   `dist/config.json`, read the DEPLOYED one off HA and adopt it — the
   store is where the user's Studio edits live, and the repo is only a
   safe merge source when it already contains them.
10. **Landscape / hero zones** — designed, not built. See PROJECT.md
   and the two mockups Suresh produced: one control becomes the stage,
   the rest go to a side rail. `initial_focus` already picks a primary
   on detail pages; formalising it as `hero` makes one concept serve
   both focus and layout. Open questions recorded: screens that are
   all-hero (apps grid), whether the rail scrolls, hubs opting out.

## The house is RENTED — the entity model (2026-08-05)

Guests join the wifi, open their own Sonos app, and play through these
speakers. Sonos has no ownership and no locking: **one transport per
speaker, last writer wins.** Nothing we build changes that, so the rule
is *display honesty, not arbitration* — the remote shows the truth of
the speaker and never editorialises about who is driving.

| job | entity |
|---|---|
| display + control | the **Sonos** entity (`media_player.sonos_bar`) |
| search | the **MA** entity (`media_player.ma_bar`) — the only searcher |
| playback | **Sonos** where the id converts, MA otherwise |

**Do not bind the controller to the MA player.** When a guest plays
from their phone, MA reports idle while the Sonos entity carries their
title, artist and artwork — so an MA-bound controller would go BLANK
exactly when the room is busiest, which is the failure mode he has made
me fix three times.

Two rejected ideas, so nobody rebuilds them: a **takeover confirm**
("Bar is playing X — press again") cannot know the request wasn't ours
without HA's state-change `context`, which the engine doesn't subscribe
to; and a **"the receiver is off" hint** aims a message at someone
holding a phone in another room. Both are argued out in PROJECT.md.

A trap worth remembering: the Bar "Sonos" is a Port feeding the Onkyo,
not a speaker. A guest playing to it while the receiver is off gets
SILENCE and concludes the house is broken. Auto-waking the amp is an HA
automation about the house — explicitly out of Harmonium's scope.

## Entity naming (2026-08-05)

The Bar's Sonos was renamed in the HA registry:
`media_player.bar` → **`media_player.sonos_bar`** and
`media_player.pool` → **`media_player.sonos_pool`**. HA does NOT update
references, so the sweep was done by hand: the Harmonium config (11
occurrences — roles, context, device_options KEYS, the `devices` list,
state rules, the `bar_devices` tile) and two dashboard cards
(`dashboard-screwaround`, `games-home`). Nothing else referenced it; the
`bar-music` / `games-music` dashboards and
`script.bar_receiver_sonos_music_off` all point at `media_player.bar_2`,
which is a DEAD id (MA-Bar became `media_player.ma_bar` back in v0.58) —
they were already broken and are legacy.

**The pairing pair is BAR + POOL** (Suresh corrected me: not the games
room). `bar_pool_join` / `bar_pool_leave` sequences drive
`media_player.join` / `unjoin`, surfaced as two presets in a
**Presets** section on the music controller — which carries only a
`{type: "presets"}` generator; the tiles themselves live on
`activities.listen_sonos.presets` (v0.64) and are edited in the
Studio's new **Presets** tab on the activity card. Only these two
speakers — not the Bedroom / Office / Upper Bar.

**There is no Sonos in the Games Room.** Its media players are the
Onkyo Games (+ Zone 2), the Android Games TV, a games-room TV and a
Harmony hub. The `games-music` dashboard's own note explains how music
gets there today: "For music in games room, turn on and set input to
CD". The five Sonos units are Bar, Bedroom, Office, Pool, Upper Bar.

Still ugly, if a tidy-up is ever wanted: the Upper Bar SONOS is
`media_player.upper_bar_upper_bar` because Music Assistant claimed the
clean `media_player.upper_bar` first.

## Environment notes worth not rediscovering

- **The tablet is a dead end by design.** Fire HD 8 10th gen, Fire OS 7,
  WebView pinned at Chromium 75, one valid provider. Any Fire OS 8
  (Android 11) or cheap Android 10+ tablet runs the engine untouched.
  The engine now targets that floor anyway — see v0.56.1.
- **Provision the tablet onto its profile**:
  `…/main/index.html#device=tablet` (the 100px header lives there;
  `default` is unchanged).
- **`localStorage` is per ORIGIN.** `homeassistant.local:8123` and
  `192.168.1.95:8123` are different worlds — token, device profile and
  workspace all live per-origin. Pick one address for the house.
- **How the Studio gets rebuilt from this clone.** There is no
  `node_modules` here and `npm run build` dies on missing `vite`. The
  working recipe (v0.60, and it is much better than string surgery):
  stage the whole `studio-src` tree into the agent container, `npm ci`
  there, edit, `npx vite build`, verify the bundle boots headless
  against the REAL `dist/config.json`, then write `build/index.html`
  back to `integration/custom_components/harmonium/studio/studio.html`
  and the touched sources back to `studio-src/`. `finish.mjs` does that
  last copy on a normal machine; in the container it is manual.
- **`device_stage_files` silently reuses a stale local copy** when the
  target path already exists. Delete it first. This nearly deployed the
  Porch config over the Bar once.
- **Two Onkyos**: `TX-NR6100-Bar` and `TX-NR6100-Games` are two config
  entries of ONE `onkyo` integration — not duplicates. The extra
  `onkyo_tx_nr6100_*` entities are Google Cast discovering the same
  receivers' Chromecast endpoints. Nothing to retire. (I claimed
  otherwise mid-session and was wrong.)
- `diag.html` sits beside the engine at `/local/harmonium/diag.html` —
  ES5, reports webview version, per-feature syntax support, config
  fetch and localStorage. It is how the Chromium 75 floor was found;
  worth keeping for the next strange device.
