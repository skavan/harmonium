# Design — Layered catalogs ("the spread model")

Status: **BUILT (core, 2026-08-27 overnight) — staged for v0.86.0, not tagged.** Shipped in this pass: `catalogs.py` (spread merge, subtract, fingerprints in JS-parity, lift-out), the store wiring (get_ws merges; subtract at every write boundary — Studio POST, workspace create, reseed, restore_backup), the one-shot stamped migration with per-workspace backups and post-migration redeploy, `catalog-history.json` (per-entry fingerprints + "__absent__" markers, generated alongside stock-history), and the Studio's per-entry provenance (stock/edited chips, ↺ reset, Hidden built-ins rows) in the Apps editor. Tests: `tests/test-layered-catalogs.py` (34 checks incl. the +4 acceptance case), `tests/probe-catalog-provenance.mjs`. Two deliberate scope notes: (1) lift-out is run-once BY THE STAMP — its pass is all-or-nothing, so a failed run retries from unchanged data, but it must never run on an already-lifted layer (documented in the code); (2) the plant-if-absent healers for dialects/app identities become naturally inert under the merge (nothing is ever absent from an effective config) — their formal retirement waits for 0.86.1. The fork-outdated shout badge shipped as the "edited — differs from built-in" chip + reset; the compare-diff view remains 0.86.1.

Original spec below, all rulings closed 2026-08-27. Suresh's ruling: "My master list should propagate. If I add a new app (and logo), that's a benefit. A user's list should spread over it, so the final list is my list (...users list)."

Guiding doctrine for this work, his words: we only have a few users and we're building a world-class engine — **do what's right, not what's backward-convenient.** A migration that asks users to export and reimport is acceptable if the clean design demands it; and whether or not it does, **every export carries the stock generation it was authored against** so an import can always know what it's looking at.

## The principle

The effective catalog is the stock catalog with the user's catalog spread over it — literally the language's own semantics:

```
effective = { ...stock, ...user }
```

Stock never enters the user's config. The user's layer stores only what they added, changed, or removed. Ownership becomes structural instead of inferred: if a key is in the user layer, it is theirs, by definition. This is the config-data version of the skins path split ("ownership is positional") and it is what the lock, the heals, the fingerprints, and the referee have all been approximating inside a single flat config.

## Why now

The seed-once model fossilizes. `starter-config.json` copies the stock apps and dialects into the user's config at first install; from then on the copy is user-owned and nothing we ship can reach it. Adding five apps to the "supported list" today means: fresh installs get them, every existing install gets nothing. The v0.85.8 logo pack made this visible — logos deploy to every install (files flow), but the catalog entries they belong to do not (config doesn't). amc and starz sit shipped-but-dark for exactly this reason.

## The model

### Layers

- **Stock layer** — ships with the integration (the stocklib twin keeps the Studio's copy in sync, as today), versioned by generation. Read-only everywhere.
- **User layer** — lives in storage, per workspace. The only thing the Studio ever saves. Contains additions (new keys), forks (stock keys the user edited), and tombstones (stock keys the user removed).

### Merge grain: per-entry replace, never deep merge

If the user has touched an entry, the whole entry is theirs — a fork, same doctrine as controllers and skins. Deep field-merge would produce "something changed under me" surprises, which the ownership doctrine explicitly rejects. The cost of forking — a forked entry stops receiving stock fixes — is what the fork-outdated shout exists for (known gap #2 in design-stock-ownership.md becomes first-class here).

The grain, per catalog:

| Catalog | Merge unit |
|---|---|
| `apps` (master identities) | one app entry (`apps.netflix`) |
| `dialects.<id>.apps` | one launch entry (`dialects.firetv.apps.netflix`) |
| `dialects.<id>.keys` | one key entry |
| `dialects.<id>.dpad_commands` | the whole block (already healed as one unit today) |
| `dialects.<id>` scalar fields (name, wake, wake_delay, channels, forbidden, capabilities) | per field, stock supplies silent ones |

So a dialect is a two-level merge: the dialect map merges per dialect id; inside a stock dialect, the sub-catalogs merge per entry and the scalars per field. A user dialect id we never shipped is theirs wholesale.

**RULED (2026-08-27): per-field for dialect scalars stands**, as a blessed exception to the per-entry doctrine. The concrete case that decides it: a user who bumps `wake_delay` on googletv must keep receiving googletv's new stock apps — a whole-dialect fork would let one one-line tweak freeze a platform's catalog forever, recreating the exact disease this design cures.

### Tombstones (RULED: `null` in place, hidden list derived)

A user who removes a stock app must stay rid of it. The user layer records the removal as the key set to `null` (`"netflix": null` = "hide the stock entry"); the merge drops null-valued keys after the spread. The spelling sits exactly where the entry would be, which is what makes the nested catalogs clean — `dialects.firetv.apps.prime: null` lands inside their firetv block with no addressing scheme. Removing a user-added entry is just deleting it from the user layer; no tombstone needed. The Studio derives a "hidden" list by walking the user layer for tombstones, so everything a user has hidden is visible and un-hidable in one place without a second structure.

**Considered and declined: a separate mask layer** (`effective = {...stock, ...user, ...mask}`). Spread can only add and overwrite, never delete, so a mask is really a subtraction list applied after the merge. Its one genuine win — a single visible "here's everything you've hidden" — is recoverable by deriving that view from the in-place tombstones. Its costs are real: the merge stops being one operation per catalog, and the mask needs path addressing (`dialects.firetv.apps`) to reach nested catalogs. More work than value; declined 2026-08-27.

Also considered and declined: `{ "hidden": true }` as the tombstone value — self-documenting in raw JSON, but it is an object that looks like a fork entry, so every consumer of the merge would have to special-case it.

### Derived classes (RULED 2026-08-30 — "clone the FireTV, edit the dpad stuff, call it FireTV-SE")

A user dialect whose id is not stock may carry `derived_from: <stock id>`. It is a LIVE DERIVATION, not a dead copy: the layer stores only its deltas, and it resolves with the same two-level merge an edited stock dialect uses — against the **shipped** parent. So a new stock app appears in every derivative automatically; the derivative's edited entries win forever; its removals are tombstones and never resurrect. This is the spread applied one level out, and it is what makes sendevent/fast-dpad tuning first-class: derive `firetv`, replace the `dpad_commands` block with action objects, repoint the activities — everything else keeps tracking stock.

Rules, all ruled together: **one level deep** — `derived_from` must name a stock id; an unknown or non-stock parent makes the entry the user's own, passed through untouched. **Spread over shipped, never over edits** — a user's edited copy of the parent has no effect on any derivative (no action at a distance). **The parent can't be pulled out from under you** — a user-layer tombstone of the parent hides the parent alone; derivatives read the stock layer directly. (A parent *retired from the shipped catalog* would drop a derivative to deltas-only — accepted; catalog-history could supply the last-shipped shape if that day ever comes.) **The Studio seeds a derivative from the effective parent** (what you see), and `subtract_config()` reduces it to deltas + marker on every save — the never-write-merged contract holds one level out, and the marker (never a stock key) is what keeps the entry alive in the layer. The honest trade: a derivative cannot be frozen-by-design; frozen-by-accident was the disease, and a "detach" verb can be added later if genuinely frozen forks are ever wanted.

### Where the merge happens

One canonical point: the integration. The store's read path returns the effective config (merged); the deployed/served config the engine reads is already effective, so **the engine does not change at all**. The Studio is the one layer-aware consumer: it loads both layers (a new API shape), renders provenance, and saves ONLY the user layer. The services (run_preset, set_activity) read through the same store path and see the effective config for free.

The hard contract: **nothing may ever write a merged config back as the user layer.** The Studio save path sends deltas by construction. Any other writer (restore_backup, import, the raw config API) must either be layer-aware or write through a subtract-stock step (remove entries byte-identical to current stock, keep the rest). This contract gets its own probe.

### Migration — the one-shot lift-out (the risky step)

Existing configs already contain the seeded stock, so on day one everything would read as user-forked and nothing would flow. On first load at 0.86.0, per catalog, per entry:

1. Entry's fingerprint matches ANY shape ever shipped (the existing stock-history registry — this is exactly what it was built for) → **lift out**: delete from the user layer; stock supplies it from now on.
2. Entry differs under a stock id → **keep**: it stays in the user layer as a fork, preserved verbatim, and becomes shout-eligible.
3. Stock key entirely absent from the user's config (they deleted it before 0.86) → **write a tombstone**, so the update does not resurrect a curated deletion.
4. User-only ids → untouched.

One-shot, stamped (the config records the migration generation), automatic backup first through the existing backup machinery. The migration is pure and gets fixture probes against real starter-history generations, per the referee's precedent.

### Studio UX

The exact grammar already built for controllers, applied per row: stock entries render with the lock and are inert; the fork door copies the entry into the user layer under the same id (in-place fork — ids must stay stable because dialect refs and logos key on them) and unlocks it; **↺ Reset to stock** deletes the user entry; deleting a stock entry writes a tombstone with an undo. Every row shows its provenance (stock / fork / yours / hidden), and the diag view answers "which layer did this come from" per app — without that, "why is Netflix showing" becomes unanswerable support mail.

### Ordering

Merged order = stock order, then user additions in their own order. A forked entry keeps its stock position. An explicit order knob is deferred — noted as a likely future ask, not built in 0.86.0.

## Scope

**v0.86.0: `apps` + `dialects` only.** Self-contained, highest benefit, smallest blast radius, and the piece that is actively hurting. What retires with it: the plant-if-absent healers for dialects and app identities (subsumed by the merge). What stays: the referee and the heals for the not-yet-layered families (controllers, skins, remote profiles), which migrate to layers in later releases one family at a time, each with its own lift-out. Controllers are the biggest win and the biggest risk; they go second, never first.

## Consequences worth stating

- **RULED:** exported/shared configs are deltas plus the stock generation they were authored against — always, no exceptions; an import against a different generation warns. "Flatten on export" (a merged standalone snapshot) is declined for 0.86.0: importing a flattened config would mark every entry as a user fork and freeze it against stock updates, so flatten is at most a future sharing format, never a backup format.
- **RULED:** the fork-outdated shout badge ships IN 0.86.0. The migration itself creates forks (every entry a user ever edited survives the lift-out as one), so day one of 0.86.0 is the moment the install base suddenly has forks that can rot — the badge (cheap: fork + generation data already exists) ships with the release; the richer compare-diff view may trail in 0.86.1.
- starter-config.json shrinks toward what it really is: the starter workspace (screens, activities, sequences) — not a copy of the stock catalogs. The catalogs move to the stock layer proper.

## Test plan

Pure merge probes (spread + tombstones + two-level dialect grain), migration fixtures built from real starter-history generations (lift-out, fork-keep, tombstone inference, stamp idempotence — running twice changes nothing), the never-write-merged contract probe (Studio round-trip saves only deltas; restore/import paths subtract), engine parity (drawer contents identical pre/post migration for an untouched config), and the resurrection guard (tombstoned stock app stays gone across two stock updates).

## Rulings (2026-08-27 — all former open questions closed)

1. Tombstones: `null` in place; the Studio derives the hidden list from them. A separate mask layer and the `{ "hidden": true }` spelling were considered and declined (reasoning under Tombstones above).
2. Dialect scalars: per-field merge, a blessed exception to the per-entry doctrine (reasoning under Merge grain above).
3. The fork-outdated shout badge ships in 0.86.0; the richer compare-diff view may trail in 0.86.1.
4. Exports are deltas + stock generation, always; no flatten in 0.86.0.
5. Doctrine: few users, world-class engine — do what's right. A migration that asks users to export and reimport is acceptable if the clean design demands it; the automatic lift-out remains the goal, the escape hatch is allowed.

The spec is build-ready.
