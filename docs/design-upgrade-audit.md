# Design: the Upgrade Audit — never overwrite, always disclose

*2026-09-05 — seeded by Suresh, mid-testing: "I'm a bit worried users will get left behind and not 'upgrade' or redo the bits that adhere to the latest iteration. Do you think, upon an upgrade they should get an audit report?" — with a sketch (`_to_delete/audit-report.md`): a version pair up top, numbered findings ("4 Stock Controllers have been upgraded. Your custom controllers remain intact but sit on an older base."), each with a Recommendation.*

## Why this is the missing half of the referee

The heal doctrine **causes** the drift it now needs to disclose, deliberately. The referee never overwrites: a fork is legitimized, a legacy pin is kept, a pre-lock in-place edit becomes the user's own copy. That is the right law — nothing a user made is ever silently destroyed — and its price is that every release widens the gap between what a long-time user runs and what ships. Nobody chooses to fall behind; they are simply never told. So the audit is not a feature bolted onto upgrades; it is the referee's second clause: **never overwrite** stays defensible only when paired with **always disclose**.

The corollary sets the tone: the audit reports *facts the heal already computed*, in plain words, with a door to act on each — it never nags, never guesses, and an uneventful release must produce no report at all (an audit that fires every release trains people to dismiss it).

## The raw material already exists — and is thrown away

Every line of the sketch's first two findings is computed today and discarded after one status-bar sentence:

- `refereeController` returns a verdict per stock id — `kept` / `healed` / `legitimized` — and `classifyController` knows the finer grain (`current` / `pristine` / `edited` / `fork` / `absent`). Healed means "the built-in moved under you"; the gens say from where to where.
- `forked_by_update` already carries the fork story on the controller itself: `{ from_gen, stock_gen }` — "your copy, preserved; the built-in has moved on."
- `NORMALIZE_REPORT` (`{ variants, pins, pinsKept }`) counts the pinned-dialect heal's rungs, including the ambiguous pins kept as loose ends.
- `STOCK_HISTORY` fingerprints every shape ever shipped per unit id — which is how the audit can say *how far* behind a fork's base is, not just that it is behind.
- The app-identity drift (starter ↔ stocklib accents) is one reconciliation away from being a countable finding.

The build is therefore mostly: **stop discarding.** Collect verdicts into a report object during normalize, stamp it with the version pair, persist it, render it.

## The report, concretely

One object, assembled in `normalizeConfig`/`healStockGen` and friends, stored per upgrade:

```json
{
  "from": "0.86.0", "to": "0.87.0", "at": "2026-09-05T14:02:11Z",
  "findings": [
    { "kind": "stock_healed", "ids": ["tv", "music", "apps", "media_player"],
      "gens": { "tv": [7, 8] } },
    { "kind": "fork_behind", "id": "tv_custom_01", "variant_of": "tv",
      "base_gen": 6, "stock_gen": 8,
      "action": "reset_to_stock" },
    { "kind": "pins_kept", "count": 1, "where": "roles tab" },
    { "kind": "observation", "text": "3 pages predate the accent system — they render exactly as before." }
  ],
  "dismissed": false, "checked": []
}
```

Laws:

1. **Findings are gen arithmetic; observations are heuristics.** A line earns the word *Recommendation* only when backed by the referee's own numbers (a fork whose `variant_of` stock moved past its base; a kept pin; a healed stock). Style-era guesses ("your pages reflect the old, basic tile styling") render as observations — informative, no verb, no urgency — because a wrong recommendation costs the trust the whole report runs on.
2. **Empty renders as nothing.** No banner, no entry, no dot. The trigger is the version pair changing AND findings being non-empty.
3. **Quiet by default.** A one-line banner on Studio load ("Upgraded 0.86 → 0.87 — 4 things worth a look"), opening a panel; never a modal. Dismissable; re-openable from the ⋯ menu; items check off (`checked`) as the user visits their doors.
4. **Every finding carries its door.** `fork_behind` → the fork's editor (Reset to built-in already exists); `pins_kept` → the Roles tab; `stock_healed` → nothing to do, stated as such ("updates keep it current — no action"). A finding with no door is an observation by definition.
5. **The report is per-workspace and persisted in the config** (a small `audit` key, last report only), not localStorage — the user who upgrades on the desktop and reviews on the laptop must see the same report. Save & Deploy carries it; dismissing writes `dismissed: true`.

## Where the version pair comes from

The integration's manifest version is the truth for `to`. `from` is a `last_audited_version` stamped into the config by the previous audit (absent = first audit = report suppressed and the stamp written, so a fresh install never opens with a report about nothing). Stock gens do the per-finding arithmetic; the manifest pair is only the headline.

## Phase 2 — the rebase button (the only line that closes the gap)

The sketch's "reset to stock and apply your custom changes" is a real three-way merge, and it is *possible* precisely because `STOCK_HISTORY` keeps every shipped shape: the fork's base shape (its `from_gen` fingerprint) is on record, so the user's delta = fork − base, replayable onto the current stock at tile granularity (ids are stable; a tile edited in the delta wins over the same id's stock change, with the collision listed). Offered as "⟲ Rebase onto the new built-in" beside Reset, producing a NEW fork so the old one survives regret. This ships after the report has proven itself — it is the only action that actually closes the drift rather than describing it, and also the only one that can be wrong, so it arrives with its own probe battery and an undo.

## Open questions (for ruling)

1. Does the audit also cover the ENGINE side of an upgrade (new laws like drawer-serves-opener changing behavior without touching the config)? Leaning: a short "what changed in behavior" section fed from a hand-written per-release list in the repo — the release notes distilled to one line each — clearly separated from the config findings.
2. Should `stock_healed` list at all, or only aggregate? Leaning: aggregate ("4 built-ins updated — no action"), expandable.
3. Retention: last report only, or a small history? Leaning: last only — the config is not a logbook.

## Shipped (2026-09-06, v1)

Built to the leanings: engine-side behavior gets a hand-written line per release (`studio-src/src/lib/release-behavior.js`, rendered as its own "What changed in behavior" section); `stock_healed` aggregates ("N built-ins updated — no action", names + gen pairs inline); retention is last-report-only.

The pieces: `HEAL_REPORT` (stocklib) — healStockGen files every referee verdict instead of discarding it; `buildAuditFindings` assembles stock_healed / fork_behind (gen arithmetic vs the CURRENT stock) / legitimized / pins_kept, with the normalize counts (modernized spellings, cast-order folds) as observations; `assembleUpgradeAudit` (state, at boot) stamps `last_audited_version` and writes the `audit` object into saved+draft alike (the normalize doctrine — rides the next Save & Deploy without reading as an edit); `UpgradeAudit.svelte` renders the one-line banner + expandable panel, doors included (fork_behind → its editor), dismissal into the draft so it persists per-workspace across machines. First sight of a version writes the stamp and shows nothing; same version shows nothing; empty findings show nothing.

Phase 2 (the rebase button) stays parked per the design. Fenced end-to-end in probe-upgrade-audit.mjs: the banner pair, the Recommendation + open-it door, behavior lines, dismiss-and-save persistence, the no-stamp first sight, and same-version silence.
