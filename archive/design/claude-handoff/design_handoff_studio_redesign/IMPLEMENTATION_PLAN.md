# Implementation plan

Ordered so each step is shippable on its own and nothing later invalidates anything
earlier. Repo paths are relative to `studio-src/src/`.

---

## 1 · Tokens and primitives  ·  *foundation, everything inherits it*

**Files:** `app.css`, `lib/components/Button.svelte`, `Input.svelte`, `Select.svelte`,
`Chips.svelte`, plus a new `IconButton.svelte`, `NumberField.svelte`, `SourceChip.svelte`,
`NoteStrip.svelte`, `Segmented.svelte`.

- Replace `app.css` with `tokens.css` from this bundle.
- Rework the primitives against the token names; add the four new ones.
- Both themes must be correct before anything else is styled — light is not an
  afterthought here, the amber changes value between them.

**Done when:** every existing screen renders in both themes with no hard-coded hex left
in a component.

## 2 · Copy pass  ·  *pure text, no new components*

**Files:** every editor under `lib/editors/`.

- Apply the vocabulary table in README §5.
- Give every glyph-only control a label: `↑ Move up`, `↓ Move down`, `Duplicate`,
  `Remove`, `Use snippet…`, `Save as snippet`.
- Add the empty-state sentence + single verb to every list that can be empty.
- Add the per-editor teach strip (one sentence, dismissible, restorable from a `?`).

**Done when:** no tooltip is load-bearing and no list renders as a blank panel.

## 3 · Frame, header, NavPane

**Files:** `App.svelte`, `lib/NavPane.svelte`.

- Header split by consequence, overflow behind `···`.
- NavPane: search + `⌘K`, numbered groups ① Pages ② Controllers ③ Building blocks
  ④ System, 18px type tokens, 1px child guides, STOCK/EDITED badges, Advanced-mode
  switch pinned to the bottom.
- Keep every element id the Playwright suite uses.

## 4 · Sections in the page editor

**Files:** `lib/editors/HubEditor.svelte`, new `SectionHeader.svelte`.

- Four fixed sections in render order: Hero · Activities · Presets · Devices.
- Each with a switch, 16/600 title, count chip, rule, grid summary, Section settings,
  and its `＋ Add …` verb.
- Off keeps items and greys them; empty shows the verb and a sentence.
- Doorways render as device cards inside Devices — delete any separate subpages UI.

## 5 · The item card grammar  ·  *the biggest single win*

**Files:** new `ItemCard.svelte` (header + identity strip + tab bar + slotted body),
refactor `lib/components/ActivityCard.svelte`, `TileRow.svelte`, `CardRow.svelte`,
`SectionFold.svelte` onto it.

- Tab sets per README §6.6.
- Identity strip on every tab.
- Advanced tab always last, glass-styled, holding tile id / type / show attribute /
  style overrides / All fields (JSON).
- One card open at a time; shift-click for two.

Then fill the bodies, in this order because it is the order of risk:
1. Activity — Devices & roles (FACE/SHOW/POWER columns, role chips, snippet pair).
2. Activity — Start & stop (three 38px rows, `✎` `＋`, confirm switch).
3. Activity — Controller (shared-surface banner, Create custom copy, App class,
   auto-populate).
4. Activity — State (mode, watched entities, condition rows, its own snippet pair).
5. Device / Doorway / Preset tab-1 bodies.
6. The shared Styling tab.

## 6 · Sizing model and settings surfaces

**Files:** new `PageSettingsPanel.svelte`, `SectionSettings.svelte`; `Field.svelte`.

- Page settings panel: Page settings · Layout · Style · Keys · Advanced.
- Section settings strip: grid columns, tile height, header, overrides.
- Item Styling: column span segmented from the section's grid columns, height px.
- Source chips + Reset on every inheritable field; inherited numbers rendered greyed in
  the field, never as an empty box.

## 7 · Reorder, delete, dirty state

**Files:** `ItemCard.svelte`, a small `useReorder` helper, toast host in `App.svelte`.

- Drag handle, ↑↓ buttons, ··· menu with words, `⌘↑`/`⌘↓`.
- Confirm dialog naming references; 10s undo toast.
- Green dirty dot on tabs and a `● Edited` chip in row headers; cleared on
  Save & Deploy.

## 8 · Workspace map

**Files:** new `lib/editors/WorkspaceMap.svelte`, nav entry above ① Pages.

Read-only, built from the existing config. Page cards with the
Activities · Presets · Devices tab strip and counts, badge row, SUBPAGES footer;
controllers column with sharing notes. Becomes the default landing slice.

## 9 · Polish

- Preview tether: hovering an editor row outlines what it draws in the phone, and back.
- First-run checklist on the map until complete.
- Focus-visible pass, keyboard order, `aria-label` on every icon button.

---

## Guardrails

- **Ids and interaction contracts survive.** Layout can move anywhere; the Playwright
  suite drives by id and visible text — where visible text must change (README §5),
  update the test in the same commit.
- **No config-model change.** `span`, `tile`, `type` stay exactly as they are on disk;
  only their presentation moves behind Advanced.
- **Single-file build must still pass:** `cd studio-src && npm run build` →
  `integration/custom_components/harmonium/studio/studio.html`. No CDN fonts, no runtime
  network fetches.
- **One primitive, many screens.** If a screen needs a variant, add it to the primitive
  in `lib/components/` — never a local style block in an editor.
