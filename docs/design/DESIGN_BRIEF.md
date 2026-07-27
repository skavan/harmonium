# Harmonium Studio — Design Brief

**For:** Claude Design (Anthropic Labs)
**Repo:** https://github.com/skavan/harmonium (branch `main`)
**Scope:** Visual + UX redesign of **Harmonium Studio** — the browser-based editor at `studio-src/`. The remote/kiosk engine (`src/`) is **out of scope** (it's end-user themable and has its own design language).
**Author:** Suresh Kavan · July 2026

---

## 1 · What Harmonium is

Harmonium is an instant-on, wall-mounted universal remote for Home Assistant — think "Logitech Harmony reborn as a self-hosted web app." A single-file engine runs on cheap Android kiosks (5" screens) and in browsers. **Harmonium Studio** is the companion editor: a Home Assistant panel where the owner designs their remotes — pages, activities (Watch TV, Listen to Music), device wiring, key bindings, apps, themes, and multiple *workspaces* (one per remote/room).

The Studio works well and is feature-complete for v1. It is also visibly an engineer's tool: dense, monochrome-gray, small glyph buttons, forms all the way down. This brief asks for design directions that make it **intuitive and attractive** without changing what it does.

## 2 · Current anatomy (see `screenshots/` alongside this brief)

Three fixed panes, header bar on top:

- **Header:** product name · workspace pills (Main / Deck / Scratch) · address link · status line · theme toggle · Export/Import/Clear/Revert · **Save & Deploy** (primary action) · Save + Reload Astrion.
- **Left — NavPane** (`lib/NavPane.svelte`): a single scrolling list of "slices" grouped **Views / Controllers / Model / System**, with nesting glyphs (⌞), truncated subtitles, and an ＋ Add view row.
- **Center — CenterPane** (`lib/CenterPane.svelte` + `lib/editors/*`): breadcrumb, **Visual | Code** tab pair, then one editor per slice. The workhorses:
  - `HubEditor` (a room page: banner/hero settings, activity cards, sections of tiles, key bindings) — *01-hub-editor.png*
  - `ActivityCard` (Setup devices & roles · controls · State rules · snippet ⤴⤵) — *02-activity-card.png*
  - `ViewEditor` (controller pages) — *03-controller-editor.png*
  - `AppsEditor` (app master list + device classes) — *04-apps-editor.png*
  - `ThemeEditor` — *05-theme-editor.png*
  - `WorkspacesEditor` — *06-workspaces.png*
  - `SnippetsEditor`, `SequencesEditor` (action builder) — *07*, *08*
- **Right — PreviewPane** (`lib/PreviewPane.svelte`): the REAL engine in an iframe inside a phone bezel, live-updating with every edit, plus a soft remote (Back/Home/Power/Vol/CH/D-pad buttons) that injects key events. This pane is sacred — keep it, restyle only its chrome. *(In the screenshots the phone shows raw icon names — the Material Symbols font wasn't available offline; in production it renders icons.)*

## 3 · Tech constraints (hard)

- **Svelte 5 (runes) + Tailwind CSS 4** + `bits-ui` + `tailwind-variants` + `tailwind-merge` — i.e. the shadcn-svelte stack. Proposals should stay in this system (shadcn-svelte component patterns are welcome).
- Builds to a **single self-contained `studio.html`** (vite-plugin-singlefile) served by a Home Assistant integration inside an iframe panel. No external CDNs at runtime; fonts must be inlined or system.
- **Light and dark themes** via `data-theme` on `<html>`; current tokens in `studio-src/src/app.css`.
- Reusable primitives live in `lib/components/` (Button, Input, Select, Chips, CardRow, SectionFold, Field, EntityPicker, JsonArea, TileRow, ActivityCard). A redesign should refine these primitives, not fork per-screen styles.
- A Playwright test suite drives the UI by element ids and visible text — layouts can change freely; ids and core interaction contracts should survive.
- Implementation will be done by Claude Code working in this repo, incrementally, one editor at a time. Deliverables that map cleanly onto the existing component list hand off best.

## 4 · Known pain points (owner's words)

1. "Not that intuitive or attractive" overall — reads as a dev tool, not a product.
2. Tiny glyph-only buttons (⤴ ⤵ ⧉ ✕ ★ 👁) with meaning only in tooltips.
3. The NavPane is a wall of similar rows; hierarchy (rooms → pages → drawers, stock vs custom controllers) is conveyed by indent glyphs and gray micro-text.
4. The ActivityCard is the most important surface and the most overloaded: devices, role chips, per-device toggles, controls, state-rule builder, and snippets all in one scroll.
5. Header rows inside cards have had recurring layout crowding (label + dropdown + icon clusters).
6. Forms lack visual rhythm: everything is the same weight, same gray, same density; no empty states, no onboarding affordances for first-run.
7. JSON escape hatches (Code tab, "All fields (JSON)") are necessary but visually equal to primary paths.

## 5 · What we want from Claude Design

1. **2–3 distinct visual directions** for the Studio (moodboard + one hero screen each). Taste anchors: Linear, Raycast, Figma's own property panels — crisp, quiet, confident; NOT glassmorphism, NOT dashboard-gaudy.
2. A **design token system**: color palette (light + dark), type ramp, spacing scale, radii, elevation, state colors — expressed as CSS variables / Tailwind theme values.
3. **Component kit specs** for the primitives listed above, with hover/focus/disabled/danger states and real labels replacing bare glyphs where it matters.
4. **Redesigned mockups of four key screens:** Hub editor with an activity card open (02), the controller editor (03), Workspaces (06), and the NavPane treatment.
5. **UX suggestions welcome** on: NavPane hierarchy, progressive disclosure in ActivityCard, empty/first-run states, and the header-bar action cluster. Terminology and information model are FIXED (workspaces, views, controllers, activities, roles, actions, snippets — these names stay).

## 6 · Non-goals

- No framework changes, no multi-file output, no external services.
- Don't redesign the remote engine UI inside the phone preview.
- Don't rename concepts or restructure the underlying config model.
- No feature additions — this is skin and flow, not scope.

## 7 · Where things live

| Thing | Path |
|---|---|
| Studio source | `studio-src/src/` (App.svelte, lib/NavPane · CenterPane · PreviewPane, lib/components/, lib/editors/) |
| Studio tokens/theme | `studio-src/src/app.css` |
| Build | `cd studio-src && npm run build` → `integration/custom_components/harmonium/studio/studio.html` |
| Current screenshots | `docs/design/screenshots/` (01–08, referenced above) |
| Engine (out of scope) | `src/` → `dist/index.html` |
| Project history & doctrine | `docs/PROJECT.md` |

*Live instance runs on a private LAN (Home Assistant at 192.168.1.87) — not publicly reachable; work from the repo + screenshots.*
