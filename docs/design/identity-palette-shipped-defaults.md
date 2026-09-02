# Harmonium accent palette — SHIPPED defaults (2026-09-02)

For Claude Design: this is where the build LANDED after eight rounds of on-panel iteration from your "identity palette — presets activities V1" canvas. Several numbers moved because they were measured on the real device (a 480×800 Astrion panel rendering 349 logical px), which outranks any canvas. Recut the design doc from these values.

## The panel truth (unchanged laws)

480×800 physical, 349 logical px wide. Span-2 tile = 325 px; preset 3-up cell ≈ 102×60 (full-bleed, deliberately not the control trio's 92). Focus is a 2 px amber ring — the most important pixel on screen — so the palette reserves two hue arcs: 40°–110° (the ring's amber) and 170°–240° (sRGB clips chroma 0.14 through the cyans). Focus on a washed tile is the RING ALONE; the wash never changes on focus.

## The palette (8 slots, precomputed oklch → sRGB at build time)

Coral 20° · Fern 127° · Jade 145° · Indigo 272° · Violet 299° · Orchid 326° · Rose 353° · Slate (chroma 0, default). Badge = oklch(0.68 0.15 H); wash = oklch(0.55 0.14 H). A slot is a NAME in config (`accent: "indigo"`); a custom hex (`color`) is second-class — held forever, never zapped by picking a slot. Every hue survives sRGB at chroma ≥ 0.138 with < 1° drift; that law is fenced.

## Style vocabulary (final names — Studio labels in parentheses)

Config values: `basic | tint | bloom | title | title-tint | title-bloom`. Activities offer the first three (Basic / Tint / Bloom). Presets offer all six, labeled **Icon basic / Icon tint / Icon bloom / Title / Title + tint / Title + bloom** — the prefix is what the tile leads with. Style ladder: tile's own → section's → silent basic.

## Wash geometry & alphas — THE SHIPPED DEFAULTS (panel-tuned)

Activity bloom (badge-anchored radial, the A2 treatment):
- ellipse **180 × 100 px at 34px→now 64 px from the left edge, 50% vertical** — canvas said 150/34; the panel wanted the glow centered under the badge circle and spread wider
- fade to zero at **72%** of the ellipse
- alpha **0.3 resting / 0.4 running** — its own pair (`--awash-a/--awash-a-on`), SPLIT from presets because the physical panel renders far hotter than a computer screen (canvas 0.5/0.75 read as neon on-device)

Preset pool (bottom-left radial on Title-mode cells): **88% × 117% of the cell at 20% 100%, fade 78%, alpha 0.75** (`--wash-a-on` — presets have no resting state). These ARE the canvas proportions; they survived on-panel review unchanged.

Flat tint (activities and presets alike): **0.15 resting / 0.25 running** (canvas had no tint pair; 0.5 → 0.25 → 0.15 over three "too strong" reviews). A1 rule: under a flat tint the 13px status line rides full `--text` (AA), going accent only when running.

All of it is knob-driven CSS custom properties, settable per section, per theme, or per tile: `--bloom-w/-h/-x/-fade`, `--pbloom-w/-h/-fade`, `--awash-a/-on`, `--wash-a-on`, `--wash-a-tint/-on`.

## Washes — two rendering laws the canvas never needed

Every wash layer is painted `no-repeat` AND on the **border box**: the tiles wear a 2px transparent border (the focus ring's seat), and a padding-box gradient either wraps into that strip (showing the bloom's opposite edge) or leaves it bare (a dark rim that reads as a wrong corner radius). Both were pixel-diagnosed on device; both are fenced.

## Title-mode cells

Name leads: 14px/600, two lines max, bottom-aligned so one- and two-line names share a baseline. The icon survives as an **18 px mark, top-right at 10 px inset, slot-colored** (`--title-mark` knob resizes all marks at once). Cells keep their band's height — the text styles never shrink the tile.

## Icons (new since the canvas)

Set icons (phu:/mdi: brand packs) are em-scaled (1em box) AND **ink-fit at render**: each icon's path bounding box is measured once and its viewBox re-cut to the material live-area ratio (ink ≈ 86% of the box), so pack padding never shrinks them next to Material glyphs. WIDE marks (wordmark logos, e.g. firetv, sonos) fit by the geometric mean of their ink at TRUE aspect — the host box widens to match, so a right-anchored Title mark sits flush at the same 10px inset as a material mark. Icons paint currentColor: the slot tints the tile glyph via `--tacc` (badge color), independent of the wash triplet (`--idw`). Knobs: `--ic-scale` (default 1, set icons only), `--preset-lbl` (Icon-mode preset label size, default 11px; weight rides the global `--fw-1`).

## Interaction laws carried from the control language (unchanged)

The badge never changes with state — resting is already full color. Running lifts one knob (the wash alpha) and turns the status line accent — accent-as-text is state, accent-as-ring is navigation, never both in one role. Chromium 61 floor: everything precomputed or var()-driven; no oklch, no clamp, no clip-path animation at runtime.

## What to recut

The V1 canvas's activity bloom panel (use 180/100 at 64px, fade 72%, alpha 0.3/0.4 on a dark `#171e27` tile), its alpha ladder (three pairs now: activity bloom, preset pool, flat tint), the style names (Icon-prefixed for presets), and add the Title-mark and ink-fit icon rules, which the canvas predates. Everything else in V1 held up.
