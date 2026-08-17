# Handoff: Harmonium Studio redesign

**Target repo:** `skavan/harmonium`, branch `main`, scope `studio-src/` only.
**Source brief:** `docs/design/DESIGN_BRIEF.md` (revision with §5 "paradigm first").
**Design reference:** `Harmonium Studio Directions.dc.html` in this folder — open it in a browser.
**Author of this package:** Claude Design · July 2026

---

## 1 · Overview

A visual and structural redesign of Harmonium Studio. No new features, no framework
change, no config-model change. Three things change:

1. **A token system** (light + dark) replacing the current ad-hoc greys — direction
   **"Graphite Rails"**: quiet, hairline, near-monochrome, amber as the only accent.
2. **The page editor becomes four blessed sections** — Hero → Activities → Presets →
   Devices — each with a switch, a count, a paradigm verb, and its own settings strip.
   Sub-page doorways are device cards; the words "section" (as a user-created thing),
   "zone" and "tile" leave the primary path.
3. **One item-card grammar.** Every activity, preset, device and doorway opens into the
   same concertina row: identity strip → tabs → Advanced behind glass. Learn it once,
   know it everywhere.

## 2 · About the design files

`Harmonium Studio Directions.dc.html` is a **design reference created in HTML** — a
static prototype of look and structure. It is not production code and must not be
copied into the repo. The job is to recreate these designs in the Studio's existing
environment: **Svelte 5 (runes) + Tailwind CSS 4 + bits-ui + tailwind-variants**,
refining the primitives in `studio-src/src/lib/components/` rather than forking
per-screen styles.

The file is a canvas document: turns are stacked newest-first, each option carries a
visible id badge. **Turns 6–9 are current. Turns 1–5 are superseded** and kept only for
history — where they conflict, later turns win. The authoritative ids are:

| id | What it shows |
|---|---|
| `2a` | Light theme, full three-pane frame, NavPane treatment |
| `3a` | Workspace map (landing screen) — but read §7.3 below for corrections |
| `6a` | Hub editor: section headers, Page settings panel, Section settings strip, ··· menu |
| `6b` | Item Styling tab · sizing model · reorder & delete patterns |
| `7a` | Activity open (full-width concertina) |
| `7b` | Device open + its Styling and Advanced tabs |
| `7c` | Field-by-field mapping from today's device editor |
| `8a` | The nine changes vs. today's editors, with rationale |
| `8b` | Activity card: identity strip, Devices & roles, Start & stop, Controller |
| `8c` | Preset card with its action fields |
| `9a` | Start & stop tab, final layout with icon buttons |
| `9b` | Snippet placement · App class in Controller |
| `9c` | Icon-button states · dirty dots · snippet variants |

## 3 · Fidelity

**High fidelity.** Colours, type sizes, spacing, radii and control heights in this
package are final and should be matched. Copy strings shown in the mocks are intended
copy — use them verbatim unless they contradict the config model.

Two things are deliberately *not* specified: iconography (the Studio uses Material
Symbols, already available at runtime — swap the placeholder glyphs `✎ ＋ ⤴ ⤵ ⠿ ▸ ▾`
for the real icons) and the phone preview's internals (out of scope, engine-owned).

## 4 · Design tokens

Full stylesheet in `tokens.css` in this folder — it is a drop-in replacement for
`studio-src/src/app.css` and keeps the existing structure (dark in `@theme`, light in
`[data-theme="light"]`).

### Colour — dark (default)

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#0e1013` | app background |
| `--color-surface` | `#16191e` | cards, nav, header |
| `--color-raised` | `#1c2026` | card headers, secondary buttons |
| `--color-field` | `#101318` | input interiors |
| `--color-line` | `#262b33` | hairlines, borders |
| `--color-line-strong` | `#313842` | button borders |
| `--color-ink` | `#e6e9ee` | primary text |
| `--color-ink-2` | `#c3c9d2` | secondary text |
| `--color-dim` | `#8b94a1` | helper text, labels |
| `--color-faint` | `#5f6773` | placeholders, disabled |
| `--color-accent` | `#ffb300` | primary action, selection |
| `--color-accent-ink` | `#1a1400` | text on accent |
| `--color-accent-wash` | `rgba(255,179,0,.11)` | selected row |
| `--color-ok` | `#4caf7d` | connected, deployed, dirty dot |
| `--color-danger` | `#e0655f` | remove, destructive |
| `--color-glass` | `#131519` | Advanced tab fill |

### Colour — light (`[data-theme="light"]`)

| Token | Value |
|---|---|
| `--color-bg` | `#f4f5f7` |
| `--color-surface` | `#ffffff` |
| `--color-raised` | `#f7f8fa` |
| `--color-sunk` | `#eceef1` |
| `--color-field` | `#ffffff` |
| `--color-line` | `#dcdfe4` |
| `--color-line-strong` | `#cfd4db` |
| `--color-ink` | `#1c2128` |
| `--color-ink-2` | `#3f4753` |
| `--color-dim` | `#646c78` |
| `--color-faint` | `#9aa1ab` |
| `--color-accent` | `#a86f00` |
| `--color-accent-ink` | `#ffffff` |
| `--color-accent-text` | `#8c5c00` (accent-coloured text on white) |
| `--color-accent-wash` | `rgba(168,111,0,.10)` |
| `--color-ok` | `#1e7d43` |
| `--color-danger` | `#c02f2f` |
| `--color-glass` | `#f2f3f5` |
| `--color-note-bg` | `#fdf8ee` / `--color-note-line` `#eee2c9` (teach strips, warnings) |

Amber darkens to `#a86f00` in light for AA contrast on white. Accent text on light
surfaces uses `#8c5c00`.

### Type

Two families only: `system-ui, -apple-system, "Segoe UI", sans-serif` and
`ui-monospace, Menlo, Consolas, monospace`. **Mono is reserved for machine values** —
entity ids, page ids, paths, JSON — so the eye learns to skip them.

| Role | Spec |
|---|---|
| Page title (breadcrumb) | 15px / 600 / -0.01em |
| Section heading | 16px / 600 / -0.01em |
| Card title (open item) | 15px / 600 |
| Row title (collapsed item) | 13px / 600 |
| Body, field values | 13px / 400 |
| Helper text | 11px / 1.4 / `--color-dim` |
| Field label | 10px / 600 / .12em uppercase / `--color-dim` |
| Nav group label | 10px / 600 / .13em uppercase |
| Machine value | 11–12px mono |

### Spacing, radius, elevation

- Base 4px. Common gaps: 6 · 8 · 10 · 12 · 16 · 22.
- Radius: `4` inputs · `6` buttons and small controls · `8` rows · `9–10` cards · `999` chips.
- Control heights: **38px** fields and icon buttons · 34px small icon buttons · 32px nav rows · 19×32px switches (15px knob).
- Elevation: no shadows in-page. Depth is a surface step plus a 1px line. Cards may take
  `0 1px 2px rgba(28,33,40,.05)`; only truly floating things (menus, dropdowns, the drag
  ghost) take `0 12px 28px rgba(28,33,40,.18)`.
- Focus: 1px accent border + 3px accent wash ring (light) / 2px accent outline at 55%
  opacity, 2px offset (dark).

## 5 · Vocabulary (enforced)

| Say | Never say |
|---|---|
| Page, activity, preset, device, doorway, controller, action, snippet, workspace | tile (primary path), zone, slice |
| Grid columns (page + section) | columns (item), across |
| Column span (item, integer 1…n) | span (as a label), width fraction |
| Tile height / gap, in px | Compact / Standard / Tall |
| Section settings | zone settings |
| Page settings | Basics |

`span`, `tile id` and `type` remain config keys and appear **only** inside Advanced tabs
and JSON. Playwright element ids and existing interaction contracts must survive
unchanged — layouts may move freely, ids may not.

## 6 · Screens

### 6.1 Application frame — `App.svelte`

Header 52px, `--color-surface`, 1px bottom line. Left to right: 20px accent square +
"Harmonium Studio" (600/14, "Studio" in dim) · workspace pills (segmented, 3px padded
track, active pill filled accent) · address chip (mono 12, field bg, 6px radius) ·
status line (6px ok dot + sentence, dim) · **spacer** · Export · Import (plain dim text
buttons) · 1px divider · Revert (bordered) · **Save & Deploy** (filled accent, 9/14
padding) · ··· overflow.

Behind ···: Clear, Save + Reload Astrion, theme toggle. Three tiers by consequence:
identity left, state middle, one primary action right.

Body: `grid-template-columns: 236px 1fr 384px` — NavPane · CenterPane · PreviewPane.

### 6.2 NavPane — `lib/NavPane.svelte`

- Search field at top with `⌘K` hint chip.
- A pinned **Workspace map** row above the groups.
- Groups become a numbered task order: **① Pages · ② Controllers · ③ Building blocks ·
  ④ System**, each with a count and a hairline rule.
- Rows 32px, 6px radius, 8px horizontal padding, 9px gap. Each row carries an 18px
  rounded-square type token (`V` `C` `A` `S`) in `--color-sunk`; the active row's token
  is filled accent and the row takes `--color-accent-wash` with a 2px accent inset bar.
- Children indent to 25px with a 1px vertical guide at x=16.
- Stock vs edited is a 9px uppercase badge (`STOCK` bordered dim, `EDITED` bordered
  accent) — not grey micro-text.
- Bottom of the rail: **Advanced mode** switch, off by default.

### 6.3 Page editor — `lib/editors/HubEditor.svelte`

Breadcrumb bar 50px: `pages / home /` (mono dim) · page name (15/600) · id chip ·
spacer · **Page settings** button · Visual|Code segmented.

Optional **teach strip** below it: `--color-note-bg`, 16px round "i", one sentence
explaining what this object is, a "Show me →" link, dismissible per editor.

Then the four sections, always in this order and always present:

```
[switch] Hero        (count)  ─────────────  [Section settings]
[switch] Activities  (count)  ─────────────  [Section settings] [＋ Add activity]
[switch] Presets     (count)  ─────────────  [Section settings] [＋ Add preset]
[switch] Devices     (count)  ─────────────  [Section settings] [＋ Add device]
```

Section header: 32×19 switch, then title **16/600**, then a count chip (11/500, sunk
pill), then a 1px rule filling the row, then the inherited grid summary as dim text
("3 cols · 64px"), then Section settings, then the primary add button (filled accent).

**Off ≠ empty.** A switched-off section keeps its items, greys them to 50%, dashes their
borders, and stops rendering on the remote. An empty section shows its verb and one
explanatory sentence.

### 6.4 Page settings panel

Opens in place under the breadcrumb; accent 1px border, `0 3px 10px rgba(168,111,0,.11)`.
Tabs: **Page settings · Layout · Style · Keys (n)** + Advanced (glass, right-aligned).

Layout tab, three columns:
- **Grid columns** — segmented 1 2 3 4.
- **Tile height** — number field, px suffix, up/down stepper, min 44 note.
- **Gap** — number field, px.
Plus a footer strip: "Values fall through Theme → Workspace → Page → Section → Item"
and a "Reset page to inherited" link.

Every settings field carries a **source chip**: `FROM THEME` / `FROM WORKSPACE` /
`FROM PAGE` / `FROM SECTION` (dim, bordered) or `SET HERE` (accent wash) with a Reset
link beside it.

### 6.5 Section settings strip

Opens under its own section header; white card, 9px radius, three columns: **Grid
columns** (segmented, with proportional bar glyphs), **Tile height** (px stepper),
**Header** (text field + show/hide switch, collapse-when-empty switch), and a quiet
`Advanced · style overrides` row.

### 6.6 Item cards — the grammar

All four item types use one component. Structure, top to bottom:

1. **Row header** — chevron, 24px icon/colour swatch, title (15/600 when open, 13/600
   collapsed), a mono subtitle (`activity · watch_firetv`), spacer, then labelled
   actions: `↑ Move up` `↓ Move down` `Duplicate` `Remove` (danger outline). A green
   `● Edited` chip appears here when the item is dirty.
2. **Identity strip** — always visible on every tab: name field, icon field, accent
   swatch, id chip. Never behind a tab.
3. **Tab bar** — 12px labels, 9/10 padding, active gets `inset 0 -2px 0 accent` and
   accent colour, counts in dim. A 6px `--color-ok` dot precedes the label of any tab
   holding unsaved edits. **Advanced** is always last, right-aligned, glass-filled
   (`--color-glass`, dim text, 10px outlined square in place of an icon, radius 6 6 0 0).
4. **Tab body** — 14–16px padding.

Tab sets:

| Item | Tabs |
|---|---|
| Hero | What it shows · Styling · Advanced |
| Activity | Devices & roles · Start & stop · Controller · State · Styling · Advanced |
| Preset | What it does · Styling · Advanced |
| Device | The device · Styling · Advanced |
| Doorway | Where it goes · Styling · Advanced |

**Styling** is identical everywhere: column span (segmented 1…n generated from the
section's grid columns), height (px, inherited value shown greyed with a source chip),
icon, accent, Show label, Show state line. Controls an item can't honour are hidden, not
disabled.

**Advanced** holds: tile id, type, show attribute, style overrides (CSS-in-JSON), and
`All fields (JSON)`. A style override that shadows a Styling control shows an inline
note saying so.

Only one item is open at a time; shift-click keeps a second open.

### 6.7 Activity card specifics — `lib/components/ActivityCard.svelte`

**Devices & roles.** A section sub-header carries the snippet pair — `⤵ Use snippet…`
and `⤴ Save as snippet` (worded when the row has space, 34px icon buttons when not).
The device table has three named switch columns with headers: **FACE · SHOW · POWER**
(replacing today's ★ / 👁 / ⊘ glyphs). The Face row is tinted with the note background.
Role chips are filled accent with an ✕; `＋ role` is a dashed chip. Below: an entity
combobox plus a 38px `＋` button.

**Start & stop.** Three stacked rows, each 38px field + 38px `✎` + 38px `＋`, all ending
flush right: *When it starts, run* (Action picker), *When it ends, run* (`— none —`
placeholder; pencil disabled, not hidden), *Then go to* (controller picker). Then
`Confirm before ending` switch with "press Power twice" as helper text.

**Controller.** Controller picker + `STOCK` badge + ✎ ＋; a note banner when the surface
is shared ("editing it also changes Watch Smart TV") with a **Create custom copy**
filled button; **App class** select (moved here from the device cast); auto-populate
switch.

**State.** Mode select, watched-entity chips, condition rows, `＋ Add condition`, and its
own snippet pair in the sub-header.

### 6.8 Preset card

`What it does` tab: **On tap** select (Open an app · Run action · Activate scene · Press
a key · Go to a page · Call a service) + a target picker that swaps with the choice +
`✎ edit`; an `Ask before running` switch; and a scope sentence ("This preset belongs to
Watch Fire TV, so it only appears while that activity is running") with a
`Move to page →` link. Type and Tile id are in Advanced.

### 6.9 Device card

`The device` tab: Name, Entity (with "icon, verbs and the page it opens all follow the
entity"), Tap, Hold — opens (`Auto — controller:tv` rather than an em dash when
inherited). Plus a read-only note: which activities cast this device and with what roles.
Icon and span move to Styling; tile id, type, show attribute to Advanced.

Devices render as **full-width rows** in the editor even when the section's grid columns
is 1 — editor layout and remote layout are independent.

### 6.10 Doorway card

A device card whose destination is a page. `DOORWAY` badge, arrow glyph in the icon
slot, and tab 1 = **Where it goes**: destination page select, how it opens
(Drawer | Push segmented), after-one-tap behaviour.

### 6.11 Workspace map — new read-only editor

The landing slice, pinned above ① Pages in the nav. Two columns of page cards plus a
controllers column. Each page card: header (icon token, name, id, `Edit →`), badge row
(`ROOT PAGE` / `in Home` / `n KEYS BOUND` / `CONFIRM SWITCH`), a tab strip
**Activities · Presets · Devices** with counts, up to three rows of the active tab plus
`+n more`, and a SUBPAGES footer. Controllers column shows sharing ("Shared by Watch
Fire TV and Watch Smart TV — an edit here reaches both").

Reachable, read-only, built entirely from the existing config. See §7.3 for corrections
to what the mock shows.

## 7 · Interactions

### 7.1 Reorder and delete

Three ways in, one destructive path:
1. **Drag** the `⠿` handle (appears on hover, left of every item). Drop targets
   highlight; dragging between sections of the same kind is allowed.
2. **↑ ↓ buttons** on the hovered or open row — the touch-friendly path, and the one
   Playwright drives. Keyboard `⌘↑` / `⌘↓`.
3. **··· menu** with words: Move up · Move down · Move to section… · divider ·
   Duplicate · Remove (danger).

Remove is the only red control on a row and never sits adjacent to Duplicate without a
divider. Removing an item referenced elsewhere opens a confirm naming the references.
Undo lives in a toast for 10s; nothing is destructive until Save & Deploy.

### 7.2 Dirty state

A 6px `--color-ok` dot marks any tab with unsaved edits, and a `● Edited` chip appears
in the item's row header so collapsed rows show it too. Cleared on Save & Deploy. Green
means "you did this" — red stays danger, amber stays inheritance.

### 7.3 Corrections to the mocks

Where the design file and this README disagree, **this README wins**:

- `3a` page cards show a **Tiles** tab — remove it. The tabs are Activities · Presets ·
  Devices, and doorways count inside Devices ("5 · 1 doorway").
- `3b` shows a "sections with switches" stack including Subpages and Tiles — superseded
  entirely by `6a`. Subpages are not a section.
- Turn 5 uses "zone settings" and fraction presets (¼ ⅓ ½) — superseded by turn 6's
  "Section settings" and numeric grid columns / px heights.

## 8 · Open questions for the client

1. Is `span` per item only, or can a section force uniform widths?
2. Does the engine's grid support 4 across on a 5″ kiosk, or is 3 the practical ceiling?
3. Do page-level rules include anything beyond grid + CSS? Anything else gets a tab in
   the Page settings panel.
4. If two activities share a stock controller but need different app classes, App class
   stays on the activity and is labelled "App class for this activity" — confirm.
5. Is a device row's `span` meaningful while its section is 1-column?

## 9 · Files in this bundle

| File | What it is |
|---|---|
| `README.md` | This document — self-sufficient spec |
| `tokens.css` | Drop-in replacement for `studio-src/src/app.css` |
| `COMPONENTS.md` | Per-primitive specs with states |
| `IMPLEMENTATION_PLAN.md` | Ordered work, mapped to repo files |
| `Harmonium Studio Directions.dc.html` | The visual reference (open in a browser) |

## 10 · Assets

None. No images, no icon files, no fonts ship with this package — the Studio's existing
Material Symbols and system font stacks cover everything. The placeholder glyphs in the
HTML (`✎ ＋ ⤴ ⤵ ⠿`) stand in for Material Symbols: `edit`, `add`, `download`, `upload`,
`drag_indicator`.
