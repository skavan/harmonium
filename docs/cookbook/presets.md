# Presets

**Outcome:** a row of one-tap buttons — *Netflix*, *YouTube TV*,
*Porch 30%* — that launch apps, run scenes, or fire any service call.

## What a preset is

One tile, one action, in the shared action grammar the whole engine
uses: `{ navigate }`, `{ sequence }`, or `{ service, entity, data }`.
A preset can also name an activity — press *Netflix* and the engine
starts *Watch Fire TV* first if it isn't running, then launches the
app. That's the Harmony favorite-button experience.

## 1. Add one

On your page: **Presets section → + Add preset**. Name, icon (or an
app's own artwork), and the action:

- **An app**: pick from the app library (Building blocks → Apps —
  per-platform launch links live there, so *Netflix* knows how to
  launch on a Fire TV vs. a Samsung).
- **A scene/script**: any `scene.turn_on` / `script.turn_on` — the
  *Porch 30%* pattern.
- **Anything else**: raw service + target + data in the editor.

Presets render three-up by default; the section settings change
columns. Placement follows the page liturgy — presets sit between
activities and devices, on Main and on every workspace alike.

## 2. Reuse them: snippets

Any preset exports as a **snippet** (⤴ *Export snippet* on the
preset, ⤵ *Import snippet…* wherever you want it back). Snippets are
how you carry a proven preset between pages, workspaces, or houses —
they live under Building blocks → Snippets.

## 3. Dynamic presets

A `presets_from` tile generates presets from an entity's attributes
(e.g. music favorites from the integration's
`sensor.harmonium_music_*` sensors — see the
[config recipes](../cookbook.md) for the hand-authored form). The
generated tiles behave like hand-placed presets, but maintain
themselves.

## Troubleshooting

- **The preset flashes an error in the bar** — that's HA's own error
  text, surfaced deliberately (silence is a bug). The service call is
  wrong for that entity; test it in HA's Developer Tools first.
- **App preset does nothing on this remote** — the app's launch link
  for *this* platform is missing in the app library; add it there
  rather than hardcoding a service in the preset.
