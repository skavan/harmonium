# Component specs

Every measurement is final. Tokens refer to `tokens.css`. States listed as
rest → hover → focus → disabled → danger; omit states a component can't reach.

---

## Button

| Variant | Fill | Border | Text | Padding | Radius |
|---|---|---|---|---|---|
| Primary | `--color-accent` | none | `--color-accent-ink` 12/600 | 9px 14px | 6 |
| Secondary | `--color-surface` | 1px `--color-line-strong` | `--color-ink` 12/500 | 8px 12px | 6 |
| Quiet | transparent | none | `--color-dim` 12/500 | 8px 10px | 6 |
| Danger | transparent | 1px `--color-danger-line` | `--color-danger` 12/500 | 8px 12px | 6 |

- Hover: secondary/quiet gain `--color-sunk` fill and `--color-line-strong` border;
  primary darkens 6%.
- Focus: `--ring-focus` plus a 1px accent border.
- Disabled: `--color-raised` fill, `--color-faint` text, no border change, no pointer.
- **Never ship a glyph-only button on a primary path.** Where a label won't fit, use the
  icon button below with a tooltip *and* an accessible name.

## Icon button

38×38, radius 6, 1px `--color-line-strong`, surface fill, glyph 15–17px in
`--color-ink-2`. Compact variant 34×34 for section-header snippet actions.
Hover `--color-sunk`. Disabled: `--color-raised` fill, `--color-line` border,
`--color-faint` glyph — **disabled, never removed**, so field rows don't reflow.

Pairs always appear in the same order: `✎ edit` then `＋ add`.

## Input / Select

Height 38, radius 4 (fields) or 6 (in button groups), 1px `--color-line-strong`,
`--color-field` fill, 13/400 text, 11px horizontal padding. Mono 12px when the value is
a machine value. Placeholder `--color-faint`.

- Focus: 1px `--color-accent` border + `--ring-focus`.
- Inherited numeric value: render the inherited number in `--color-faint` (not a
  placeholder attribute) with a source chip beside the label; typing replaces it and
  flips the chip to `SET HERE` + a Reset link.
- Select chevron `▾` in `--color-dim`, 11px inset.
- Helper text sits **under** the field: 11px/1.4 `--color-dim`. Keep every existing
  helper sentence from the current editor — restyle, don't delete.

## Number field (px)

Input + a `px` suffix in `--color-dim` + a two-button stepper on the right, divided by a
1px line, each half 5px 9px. Width 132px. Min 44 enforced for tile height with an
inline note.

## Switch

32×19 track, radius 999, 15px knob inset 2px. On `--color-accent` with an
`--color-accent-ink` knob (dark theme) or white knob (light). Off `--color-line-strong`
track. Label sits right of the switch at 13/400; a secondary clause follows in
11px `--color-dim`. Small variant 26×16 with a 12px knob for in-table columns.

## Chip / role chip

Radius 999, 6px 10px, 11/500. Selected: accent fill, accent-ink text, trailing `✕`.
Unselected: surface fill, 1px `--color-line-strong`, `--color-ink-2`. Add-affordance:
1px dashed `--color-line-strong`, `--color-dim`, label `＋ role`.

Badge variant (STOCK / EDITED / DOORWAY / ROOT PAGE): radius 4, 4–5px padding,
9–10px/500, .05–.08em tracking. Neutral = bordered dim; accent = accent wash + accent
text; ok = ok wash + ok text.

## Segmented control

Track `--color-sunk`, radius 7, 3px padding. Items 8–9px vertical, 13–16px horizontal,
12–13px/500. Active item: accent fill, accent-ink text, radius 5. Used for grid columns
(1 2 3 4), column span (1…n), Drawer|Push, Visual|Code, workspace pills.

For grid columns the items may carry proportional bar glyphs above the number
(2 bars / 3 bars / 4 bars) — decorative, 8px tall, 2px gap.

## CardRow (collapsed item)

Height ~42, surface fill, 1px `--color-line`, radius 8, 11px gap, 11px 14px padding.
Contents: chevron `▸` (`--color-faint`) · 24px icon or colour swatch · title 13/600 ·
mono id or summary in `--color-faint` · spacer · dim summary tail · hover-revealed
`⠿` handle at the left and `↑ ↓ ···` at the right.

Hover: border `--color-line-strong`, `--shadow-card`.

## SectionFold (open item card)

Radius 9–10, 1px `--color-line-strong`, `--shadow-card`.

1. **Header** — `--color-raised` fill, 1px bottom line, 13px 15px padding: chevron `▾`,
   swatch, title 15/600, mono subtitle, spacer, `● Edited` chip, labelled actions
   (`↑ Move up`, `↓ Move down`, `Duplicate`, `Remove`), or `···` when narrow.
2. **Identity strip** — `--color-surface` at 60% between header and tabs, 11px 15px:
   name field, icon field, accent swatch, id chip. Present on every tab.
3. **Tab bar** — 8px 12px 0 padding, 1px bottom line. Tab 12/500 `--color-dim`,
   9px 10px. Active 12/600 accent + `inset 0 -2px 0 accent`. Count follows the label in
   `--color-faint`. A 6px `--color-ok` dot precedes the label when that tab is dirty.
4. **Advanced tab** — right-aligned after a flexible spacer, `--color-glass` fill,
   1px `--color-line` on top/left/right, radius 6 6 0 0, `--color-dim` text, a 10px
   outlined square instead of an icon. Its body keeps the glass fill.
5. **Body** — 14–16px padding, 11–14px gaps.

## Section header (page editor)

`[switch] [title 16/600] [count chip] [1px rule, flex] [grid summary, dim 11] [Section settings] [＋ Add …]`

Count chip: `--color-sunk` pill, 11/500 `--color-dim`, 5px 8px. Grid summary reads
"3 cols · 64px". The add button is primary in Activities and secondary elsewhere only if
the section is off; otherwise all four are primary.

## Source chip

`FROM THEME` · `FROM WORKSPACE` · `FROM PAGE` · `FROM SECTION` — 9/500, .05em, radius 4,
`--color-glass` fill, 1px `--color-line`, `--color-dim`.
`SET HERE` — accent wash fill, no border, `--color-accent-text`, followed by a
`Reset` link (12/500 accent text).

## Note strip

`--color-note-bg` fill, 1px `--color-note-line`, radius 8, 11–14px padding. A 16px round
outlined "i" (or "!") in accent, then 12px/1.45 text in a warm dim, then optional
right-aligned action. Used for teach strips, the shared-controller warning, and
shadowing-CSS notices.

## Menu (···)

Floating panel 212px, surface fill, 1px `--color-line-strong`, radius 9,
`--shadow-float`, 5px padding. Items 9px 10px, radius 6, 12/500, with a leading glyph
column and a trailing shortcut in 10px mono `--color-faint`. Hover `--color-sunk`.
Divider: 1px `--color-line` inset 6px. Destructive item in `--color-danger`.

## Confirm dialog

Surface card, radius 8, `--shadow-float`, 12px padding, 9px gaps: title 12/600, body
11/1.5 dim naming what else references the item, then two equal-width buttons —
Cancel (secondary) and the destructive verb (filled `--color-danger`, white text).

## EntityPicker

Standard input with a mono value and a `▾`. When empty: `add a device…` in
`--color-faint` mono. Always paired with a 38px `＋` icon button, never a text link.

## JsonArea

Mono 11–12/1.5, `--color-field` fill, 1px `--color-line`, radius 6, 10px padding. Lives
only inside Advanced tabs. When a key in it shadows a Styling control, render a note
strip directly beneath naming the conflict.

## PreviewPane chrome

Header row: 6px ok dot · "Live preview" 12/500 dim · spacer · device select
(secondary button, `astrion ▾`). Phone bezel: 300×508, radius 26, `--color-ink` fill in
light / `#000` in dark, 1px `--color-line-strong`, 9px padding, inner screen radius 19.
Soft-remote grid: 3 columns, 7px gap, 38px buttons, secondary styling, `OK` filled ink.
**The iframe contents are out of scope — chrome only.**
