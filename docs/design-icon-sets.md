# Icon sets — mdi:, phu:, and friends

Status: **SHIPPED (2026-08-31, 0.87).** A beta user asked for [Custom Brand Icons](https://github.com/elax46/custom-brand-icons) (`phu:`); the same mechanism should carry `mdi:` (every HA user's muscle memory) and any future set. Slots into 0.87 beside the entity-controls presentation work.

## Constraints (the thesis applies)

- The engine's icon vocabulary today is `material:` names (the Material Symbols font) + image paths. Icons inherit the theme's text color — any new mechanism must keep that, or brand icons break in dark/light themes.
- Fast cold boot on 2017-era webviews is the whole thesis. MDI is ~7,000 icons; `phu:` is ~1,500. Shipping a full set — as a webfont (~400 KB+) or a path bundle — to render the six icons a house actually uses is off the table.
- Set sources differ: `phu:` is a Lovelace JS module (SVG path data inside JS); MDI has npm path packages; future sets are unknowable. The engine must not know any of this.

## The design: files are the wiring, masks are the tint

**Engine (one small, set-agnostic change):** an icon `"<set>:<name>"` that isn't `material:` resolves to `/local/harmonium/icons/<set>/<name>.svg` and renders as a **CSS-masked block** (`-webkit-mask-image: url(...)`; background: `currentColor`) — so it tints exactly like a font icon, in every theme, and a missing file falls back to the tile's default glyph the way a missing app logo already falls back to icon+name. `-webkit-mask` is supported by the Chromium 61 floor. No fetch-and-inline machinery, no path registry, no per-set knowledge in the engine — an icon is a file, the file name is the wiring, exactly the app-logos doctrine.

**Works day one, by hand:** drop `sonos.svg` into `config/www/harmonium/icons/phu/` and type `phu:sonos` in any Icon field. That alone answers the user ask.

**Tooling (the convenience layer, phased):**

1. **The distiller** — at deploy, the integration scans the workspace configs for set-prefixed icon names and materializes any missing SVGs into `www/harmonium/icons/<set>/`, extracting path data from the set's installed source: for `phu:`, parse the user's installed `custom-brand-icons.js` module (it's path data in JS — a regex-able format, version-pinned by a fingerprint check); for `mdi:`, a bundled index of path data for the icons referenced (fetched at distill time from the set's package, or vendored per-icon on demand). Same per-file ownership stamp as skins/logos: a user's hand-replaced icon is never overwritten.
2. **Studio support** — the IconPicker accepts `<set>:<name>` free-typed (validation: warn when the file doesn't exist and the distiller doesn't know the set), and the preview renders the mask.
3. **A curated starter pack** is explicitly NOT shipped — sets are pulled per-house, per-reference. Nothing global gets heavier.

## Rulings (Suresh, 2026-08-30)

- **Leverage HA's installed packs.** The user installs an icon pack the normal HA way (HACS); Harmonium distills from the installed artifact — for `phu:`, the module at `www/community/custom-brand-icons/`. Harmonium never redistributes a set.
- **Priority:** this whole feature queues BEHIND the entity-controls keynote. The engine mask-slice may land early only if it costs the keynote nothing.

## Forks — RULED (Suresh, 2026-08-31)

1. **Distiller scope:** "support anything HA has installed" — not phu-first. The distiller carries a SOURCES registry keyed by set prefix; each entry detects its installed artifact and serves name→path. v1 ships `phu:` (the HACS module at `www/community/custom-brand-icons/`) and `mdi:` (HA's OWN frontend bundles every MDI path as JSON — `hass_frontend/static/mdi/*.json` — so no network and no vendoring, present on every install). A future set is one registry entry.
2. **Unknown set / missing file:** silent per-icon fallback on the remote (the neutral glyph, remembered so kiosks never re-request); a visible warning chip on the Studio's icon preview, with the fix in its tooltip.
3. **Coloring:** the mask flattens to one theme color by design; the image slot remains the full-color escape hatch. No new mechanism.

**Shipped 2026-08-31** (0.87): engine mask slice (`iconHtml` + `.icmask`, probe-img fallback), `custom_components/harmonium/icons.py` (ref scan, sources registry, per-file ownership stamps — a hand-replaced SVG is never overwritten), distillation hooked into every deploy (never blocks it), IconPicker preview + warning. Fences: `tests/probe-icon-sets.mjs` (8) + `tests/test-icon-distill.py` (12).

## Non-goals

Loading Lovelace frontend modules into the engine; shipping any full icon set; a color-preserving inline-SVG renderer (the image path covers it); set support in the `material:` namespace (it stays the font).
