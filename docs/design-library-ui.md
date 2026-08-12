# Design — the library surface, and a correction

**Status:** design, 2026-08-09. Nothing built. Revised twice after
review: no third scope (§3), view toggle at the head of the chip strip
(§2), and **§5 — the cast player decides, sources declare routing**,
which supersedes the house-level framing in both documents.
**Reads with:** `docs/design-search-sources.md`. Section 1 below
**corrects** that document; sections 2–4 replace what it said about the
search UI.

---

## 1. CORRECTION — phase 3 does not need Python

`design-search-sources.md` §6 puts the Sonos crawl in the integration,
on the strength of one line I wrote in the same document — *"the engine
reads an index, it never builds one."* Suresh challenged it and the
challenge holds. That line is a preference, not a constraint, and it
was doing more work than it had earned.

**The crawl needs nothing new.** The engine already calls
`media_player/browse_media` (`browseFetch`), already caches nodes,
already signs thumbnails. Walking eight category nodes is the same call
it makes for the tree today, eight times instead of two.

**Storage was the real reason, and localStorage covers it.** The
storage-tiers decision (PROJECT.md, v0.20 era) rejected browser storage
*as truth* — per-device divergence, cache-clear loss, invisible to HA —
but explicitly reserved it as an instant-on cache. An index is a cache:
derived from Sonos, rebuildable in seconds. It is precisely the case
that exception was written for. Sizes are not close to the limit —
71.7 KB for 697 albums against a ~5 MB origin quota, so even the
~1.8 MB track list would fit.

| | engine + localStorage | integration + Python |
|---|---|---|
| crawl | possible today | new code |
| refresh | on open when stale, plus a Refresh control | nightly too |
| shared across remotes | no, each keeps its own | yes |
| visible in HA | no | yes, as a sensor |
| survives a cache-clear | **no** | yes |
| risk to the golden master | none | integration fails to load if wrong |
| testable in the harness | **yes** | no |

The only real losses are sharing and cache-clear survival. Each remote
crawling its own copy is eight requests finishing in seconds. The
cache-clear wipe matters more — clear-cache is part of the deploy
ceremony — but it self-heals: index missing or older than N hours on
opening the library triggers a re-crawl, so the cost is a few seconds
on first open after a push, once.

**Revised plan: build phase 3 engine-side.** If sharing and scheduling
later prove worth it, moving the crawl into the integration swaps the
*producer* and leaves the reader untouched. Keep the index format
stable from the start so that stays true.

**A second reason the index earns its place**, found in the field: MA
returned nothing for `mama mia` because the track is *Mamma Mia*.
Remote services match literally. A local index is the only place we can
be forgiving — case and diacritic folding, token-order independence,
and a tolerance for one wrong letter. That is a real capability, not a
consolation.

---

## 2. The browse surface is cramped, and the magnifier is in the wrong band

Observed on the Astrion (480×800): the category strip overflows —
`ARTISTS ALBUMS TRACKS PLAYLISTS RADIO STATIONS PO…` — while the roots
row carries only *Favorites* and *Music Library* and a large empty
space beside them.

**The magnifier is misplaced.** It currently sits at the head of the
chip strip, which reads as "search is a category". It isn't; it is a
mode switch, a sibling of *Favorites* and *Music Library* — a different
answer to "where am I looking", not "which slice of here". Moving it
into the roots row is both truer and free: it reclaims chip width
exactly where the chips are running out.

**The empty space at the right of the roots row should hold a view
toggle.** A three-column art grid is right for albums and wrong for 697
artists sorted by name — art the source often doesn't have, three names
per row, and a D-pad forced to hunt left and right. A dense
one-column list with a small thumbnail is far better for *finding*, and
it is the shape a D-pad wants: one axis.

Proposed, and worth treating as one change:

    roots row:   [★ Favorites] [♫ Music Library]  [🔍 Search]
    chip strip:  [▦]  ARTISTS  ALBUMS  TRACKS  PLAYLISTS  RADIO  …

The view toggle takes **the slot the magnifier vacates**, at the head
of the chip strip (Suresh's placement). That is the right home: the
chips choose which slice you are looking at, and this chooses how that
slice is drawn — the two belong together, and it is a per-category
control sitting next to the categories.

**It cycles, and that is fine here** — grid → list → back. The reason
cycling works for view and fails for scope is worth stating, because it
is the general rule: **a cycling control is honest when its state is
visible in the thing it controls.** Tap the view icon and the answer is
the whole screen redrawing; you cannot be confused about where you
landed. Cycle the scope and the state is invisible — the results look
the same either way, and you are left inferring which well you just
searched. Same widget, opposite verdict.

The view choice is a preference, sticky for the session like `qkb`, and
should be remembered **per category** — grid for Albums, list for
Artists is what most people converge on. Persist it per remote profile
rather than globally: the tablet and the Astrion want different
defaults.

---

## 3. The search canvas: four small targets, two of them ambiguous

Observed problems, all correct:

1. **No focus affordance.** The query line is a `<span>`, not an input,
   so there is no caret — nothing says "your typing lands here".
2. **Four small icons in one row** — ⌫, ✕, keyboard, ✕ — on a surface
   driven by a thumb or a D-pad.
3. **Two ✕s**, one clearing text and one closing search, indistinguishable.

### The fix: move destructive keys onto the keyboard, leave two targets

    ┌────────────────────────────────────────────────┐
    │ 🔍  mama mia▌                        [⌨]  [✕]  │
    └────────────────────────────────────────────────┘

- **A caret.** A 2px accent bar after the text, CSS-blinking. Costs
  nothing, works with the button grid, and answers (1) without needing
  a real `<input>`. (When the native-input work lands for touch
  profiles, it brings a real caret and this one hides.)
- **⌫ moves onto the keyboard**, beside `space`, where a thumb already
  is and where every phone keyboard puts it. **Hold = clear all**,
  which retires the clear-✕ entirely.
- **The row keeps two controls**: keyboard show/hide, and a single ✕
  that means **close search** and nothing else. One ✕, one meaning.

That takes the row from four ambiguous targets to two unambiguous ones,
and both can be made noticeably larger with the freed width.

### Scope stays TWO. Phase 3 does not add a third

An earlier draft of this said the Sonos index would need its own scope
chip. That was wrong, and it was wrong for the same reason the Python
constraint was — carrying a decision forward without re-checking what
it rested on.

**Scope is about REACH, not about source.** *My library* vs *Everything*
is Music Assistant's `library_only` flag: the same engine, asked to
look further. A source is plumbing.

The dedup fear that made me want a third chip only applies to the part
of the Sonos index that OVERLAPS Music Assistant — the Music Library
categories, which index the same NAS under different uris
(`library://track/16202` vs `x-file-cifs://…`). But the index's real
value, as §2 of the search design already established, is **`FV:` and
`SQ:` — Sonos favourites and saved queues, which MA cannot see at
all.** No overlap, no duplicates, nothing to separate. Those results
merge into the normal answer like any other kind.

So:

- **Index favourites and saved queues** — merge, no new control.
- **Index the Music Library categories only for a house with no Music
  Assistant**, where nothing else can answer and there is nothing to
  collide with. That house also has no `library_only`, so the scope
  control correctly hides itself, exactly as it does today.

Two scopes, one segmented pair, unchanged. And **no cycling** — see
below for where cycling does belong.

### The keyboard eats the results

With the keyboard up there is room for roughly one result tile. Do not
auto-hide it — the user may still be typing, and a surface that moves
under you is worse than a small one. The honest fix is making the
toggle obvious, which the two-target row does. Worth revisiting only if
it still bites after that.

---

## 4. Build order

The UI changes and phase 3 are one piece of work, in this order, so the
index never gets built behind a layout that is about to move:

1. **Search row** — caret, ⌫-on-keyboard with hold-to-clear, single ✕.
   Self-contained; fixes today's confusion whatever else happens.
2. **Roots row** — magnifier out of the chip strip, view toggle into the
   empty space; grid/list rendering, sticky per category per profile.
3. **Scope cycles** on narrow, segmented on wide — done before the third
   source exists, so adding it changes data and not layout.
4. **Phase 3** — crawl, localStorage cache with `built_at`, index as the
   third source, Refresh control, forgiving local matching.

Each step is testable in the harness against real Sonos response shapes
(`design-search-sources.md` §2c has them, and the appendix reproduces
them).

---

## 5. THE CAST PLAYER DECIDES — sources declare routing

**This supersedes every "does this house have Music Assistant" framing
in these documents, including §3 above and `design-search-sources.md`
§4.** Suresh: *"It's not a house thing… isn't it a player choice? When
I choose an MA Player, I can never have Sonos results right?"*

Correct, and it exposes a hole in the role model. `media_player`
(playback) and `search` (who answers) were modelled as independent
roles. They are not. **What you can usefully search is bounded by what
the cast player can actually play.** A result that cannot be routed to
the speaker is not a result.

### The matrix, for one Sonos speaker with an MA twin

| cast player | `FV:` / `SQ:` favourites & saved queues | Sonos NAS search | MA results |
|---|---|---|---|
| native `sonos_<room>` | plays natively | 521 uncapped, tracks only | track/album/playlist/show/episode via the `spotify:` share-link bridge (v0.66 `brSpotifyUri`); **artist cannot** share-link; `library://` needs the twin |
| `ma_sonos_<room>` | **cannot play at all** | n/a — MA search supersedes | everything, all classes, `limit`-deep |

### Why native cast becomes the right default — once phase 3 exists

Casting native gets close to the superset already: Sonos's own
favourites and saved queues, its NAS index, and MA's catalogue reaching
it through the share-link bridge. The two gaps are Spotify **artists**
(Sonos cannot share-link one) and MA's `library://` ids.

The second gap is mostly illusory: `library://` items are the ripped
CDs, and the *same files* are reachable as `x-file-cifs://` through
Sonos's own NAS index — which is exactly what phase 3 crawls. So the
index is not merely "favourites for a house without MA". **It is what
makes casting the native player strictly better**, by supplying
artist / album / playlist browsing and NAS content in ids the native
player can actually play.

Which makes Suresh's conclusion — *"we should never choose the MA
player, it's a subset"* — true **after** phase 3, and not quite true
before. Worth stating in that order, because it is also the argument
for building phase 3 at all.

What casting MA still buys, and what is lost by not: Spotify artists,
MA's own podcasts / audiobooks / radio, `transfer_queue`
("Pull Music Here"), the MA queue, and MA-side grouping. Against that,
MA takes the speaker over with a single stream — the Sonos app shows
"Music Assistant" and a tiny rolling buffer, so **guests lose their
view**. On a house where guests use the Sonos app, that settles it.

### The silent side effect to fix first

Today, casting native Sonos and tapping an MA `library://` result falls
back to the MA player, which takes the speaker over. The real Sonos
queue disappears and the app shows a single stream — **with no warning
of any kind**. Given that guests using the Sonos app is the stated
reason Bar presets play natively, this is the cardinal sin of the
system happening invisibly.

### The model to build

Replace "which sources does this house have" with: **each source
declares how its ids reach the cast player.**

    native      the cast player plays this id directly
    bridged     a known conversion applies (MA spotify--… -> spotify:…)
    fallback    only playable by handing off to another entity,
                which EVICTS the cast player's queue
    none        cannot be played here

Then:

- `native` and `bridged` results appear normally.
- `fallback` results are **marked**, and taking one either warns or is
  a deliberate two-step — never a silent hand-off.
- `none` results are not offered.

This also retires the last of the house-level framing: a house without
Music Assistant is not a special case, it is simply a player with fewer
routes. The rule is uniform, and it is per player, per result.

### Consequence for the search row

Routing state has to be *visible* somewhere — most likely a small mark
on the result tile, possibly a line near the scope control. That means
§3's search-row layout is not finally settled: finish the routing model
first, then lay the row out once, knowing everything it must carry.

### Revised build order

1. **Routing model** — sources declare `native` / `bridged` /
   `fallback` / `none`; mark or suppress accordingly; kill the silent
   queue eviction. Testable in the harness.
2. **Search row** — caret, ⌫-on-keyboard with hold-to-clear, single ✕,
   plus wherever routing marks land.
3. **Roots row** — magnifier up to band 1, view toggle into the slot it
   vacates, grid/list sticky per category per profile.
4. **Phase 3** — crawl, localStorage cache with `built_at`, forgiving
   local matching, Refresh. Native cast becomes the default worth
   recommending.
