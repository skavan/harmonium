# Astrion / HA100 — physical keys and what they emit

The companion to `rs90-facts.md`. What each PHYSICAL key on the
Astrion sends into the webview (via Expert Mode mappings), and what
the two stock profiles do with it. Keep this current — the F-numbers
are meaningless without the key they came from.

## Physical key → emitted key

| Physical key | Emits | astrion profile | astrion2 profile |
|---|---|---|---|
| Home | `F1` | Harmonium home (up one level) | same |
| Power | `F2` | power (end activity, confirm) | same |
| Lightbulb / REW | `F4` | Lights shortcut (`light`) | ⏮ previous track (`prev`) |
| Curtains / Play-Pause | `F5` | Covers shortcut (`cover`) | ⏯ (`play_pause`) |
| Music / Stop | `F6` | Music shortcut (`music`) | ⏹ (`stop`) |
| Climate / FWD | `F7` | Climate shortcut (`climate`) | ⏭ next track (`next`) |
| Red | `F8` | app launcher: **Fully** (KeyMapper) | same |
| Green | `F9` | app launcher: File Manager (KeyMapper) | same |
| Blue | `F10` | app launcher: HaRemote (KeyMapper) | same |
| Yellow | `F11` | app launcher: Key Mapper · long: Browser | same |

The F4–F7 row is the same four physical keys read two ways — the
astrion profile takes the domain-shortcut labels (lightbulb,
curtains, music, climate), astrion2 takes the transport labels
(REW, play/pause, stop, FWD). Pick the profile that matches how the
remote is actually labeled/used; don't mix the two keymaps.

**Color keys (F8–F11) never reach Harmonium on the shipped
KeyMapper profile** — they are global app launchers (Red = Fully,
the road home from any app). Delete those KeyMapper rules if you
want a color key in the Studio instead; it then arrives raw as its
F-key and is bindable via `buttons` (page-level or workspace-wide):
`"F8": { "navigate": "porch" }`, a sequence, a service call. The
engine treats any unbound key as a deliberate no-op.

## Hold gestures (Expert Mode emits a DISTINCT key)

| Gesture | Should emit | Meaning |
|---|---|---|
| Back long-press | `]` | Harmonium back — always |
| Home long-press | `=` | Harmonium home — always |
| Power long-press | `F12` (KEYCODE_F12, 142) | end activity / All Off |
| Menu long-press | `@` | menu_hold (the music drawer) — added 2026-08-26 for RS90 parity |

`F12` was chosen because no physical key emits it and it cannot be
typed into a text field (the old `o` could). If long-press Power
does nothing, the Expert Mode rule is missing or still emits the
pre-v0.85.7 `=` — which now means Home.

## Other keys (raw, no mapping needed)

D-pad arrows, OK (Enter), CH▲/CH▼ (PageUp/PageDown), Back tap
(`[`), volume +/− and mute arrive raw. Full logical map:
`docs/HARMONIUM-INPUT-ROUTING.md`; the live per-page map is on the
remote's ⓘ page.

## Related

- Sideloading + Expert Mode setup: `docs/cookbook/hardware-keys.md` §0
- RS90 (different animal — keys swapped, no Expert Mode):
  `rs90-facts.md` — note **RS90 Power=F1 / Home=F2, the mirror of
  this table.**
