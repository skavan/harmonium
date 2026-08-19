# Theming

*Purpose: Accent, radius, fonts — per workspace and per device. Audience: users.*

**Outcome:** the remote in your colors — accent, surfaces, corner
radius — plus a wall tablet you can read from across the room.

## Where theme lives

The theme is part of the config — pure data, per workspace — under
*System → Theme* in the Studio. Design tokens drive everything:
`accent` (the focus ring, active washes, meters), `bg` and `tile`
(surfaces), `radius` (corner rounding), `wash` (the translucent
active-state tint). Change the accent and every focus ring, active
card, meter and wash follows; there is no per-tile color styling to
chase.

The preview re-renders as you type, so tune it against your real
pages — the music controller with album art is the honest test of an
accent.

The ☾/☀ toggle in the Studio header themes the **Studio's own
chrome** only — the preview keeps the engine's theme, because the
remote has no light mode unless you build one.

## Per-device legibility

A wall tablet across the room and a remote in your hand want
different type sizes from the same config. Device profiles carry
display options (*System → Remotes & keymaps*); the hand-authored
form — `remotes.<id>.style`, a per-device map of theme CSS variables
(type size included) that never forks the workspace — is in
[the config reference](../screen-schema.md).

Controllers can also scope fonts (`font_scope`) so, e.g., the music
controller's now-playing type scales independently of the grid.

## Icons and art

Tiles take Material Symbols names (`material:music_note`) or an
image. Presets prefer an app's own artwork where the app library has
it; activity cards take an icon + color each (set in the activity's
Setup tab).

## Notes

- Theme is per **workspace** — the bedroom tablet's world can be
  warm-dim while the porch remote stays high-contrast.
- The engine ships dark-first for OLED remotes and living rooms;
  nothing stops a light theme, but you're choosing every surface
  yourself.
