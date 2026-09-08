# Harmonium v0.83.8 — Posters, Pictures & Provenance

A quality-of-life release: Now Playing gained the big-art Poster,
the Studio learned to receive pictures, imports finally ask where
they're going — and the oldest ghost in the project (the stretched
play button) was caught and killed for good.

## Now Playing: the Poster

A fourth renderer, picked per activity on the Controller tab:
**Poster — big art + progress**. Large centered artwork, the track
under it, a real progress bar with elapsed/total times ticking live,
and a full-width Library bar beneath — no transport or volume inside
the card, those stay their own bands. Sized so the transport tile
fits right below it. (The old *Art wash* renderer still works for
configs that chose it, but it's no longer offered fresh.)

## Upload pictures from the Studio

No more Samba or file editors to get a hero image onto the box: the
banner editor's Image field (and the skin map toolbar) now carry an
**upload button that's also a drop target**. Pictures land in
`/config/www/images/` — *outside* Harmonium's own folder, so a
wipe-and-reinstall can never eat your photos — and the `/local/…`
path drops straight into the field. Size-capped, type-checked, and
an existing filename asks before being replaced.

## Import that asks where

Importing a config no longer overwrites the workspace you happen to
be standing in. A dialog offers: this workspace's **draft** (review,
then Save & Deploy), **replace** another workspace outright, or a
**new workspace**. Whole-house bundles (the "All workspaces" export)
are now importable too, with a tick-list per workspace — existing
ids replaced, missing ones created. Single exports now carry a
`_workspace` stamp naming where they came from, and the import
dialog uses it to preselect the right destination.

## The oval play button, solved

The long-hunted "vertically stretched play button" in the Studio
preview was the engine's flex-gap compat probe misfiring when the
preview booted hidden — it latched the old-webview margin fallbacks
on top of the working gap and squashed the transport row. The probe
now distinguishes "no layout yet" from "gap unsupported" (and
retries instead of guessing), the play circle carries flex insurance
so no spacing bug can ever squash it again, and the preview shows a
red diagnostic strip if its scale ever goes anamorphic.

## Also in this release

- **Apps drawer is 2-up**: bigger tiles, bigger labels, properly
  centered — a clean grid for TV app launchers.
- The Studio build stamp in the footer now reads
  `s<release> b<build>` (e.g. `s0.83.8 b31`) — release first,
  per-build fingerprint after.
- Cookbook grew *Cutting a release* and *Wipe & reinstall* pages.

---

Full detail: `docs/PROJECT.md`. Upgrading: HACS → Update → pick
v0.83.8 → **restart Home Assistant** (this release adds an API
endpoint) → hard-refresh the Studio (expect `s0.83.8` in the
footer) → Save & Deploy once so the apps-grid upgrade writes
through.
