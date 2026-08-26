# RS90 Remote Key Map

GENERATED from `data.json` — do not hand-edit; rerun
`python gen-map-docs.py` after mappings change (refresh
`data.json` from the newest `key_mapper.zip` first).

**THE MIRROR: Power=F1, Home=F2 — the opposite of the Astrion.**
Same emitted hold vocabulary, opposite trigger keys.

## KeyMapper rules (what the buttons are remapped to)

| Physical key/action | Input keycode | Input Android constant | Scancode | Output/action | Output keycode / package | Output Android constant | Scope |
|---|---:|---|---:|---|---|---|---|
| Back press | 4 | `KEYCODE_BACK` | 158 | `[` | `71` | `KEYCODE_LEFT_BRACKET` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Volume Up press | 24 | `KEYCODE_VOLUME_UP` | 115 | `+` | `81` | `KEYCODE_PLUS` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Volume Down press | 25 | `KEYCODE_VOLUME_DOWN` | 114 | `-` | `69` | `KEYCODE_MINUS` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Menu press | 82 | `KEYCODE_MENU` | 139 | `#` | `18` | `KEYCODE_POUND` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Dot • (F9) press | 139 | `KEYCODE_F9` | 67 | Open Fully Kiosk Browser | `de.ozerov.fully` | — | global |
| Dot •• (F10) press | 140 | `KEYCODE_F10` | 68 | Open KISS Launcher | `fr.neamar.kiss` | — | global |
| Dot ••• (F11) press | 141 | `KEYCODE_F11` | 87 | Open Key Mapper | `io.github.sds100.keymapper` | — | global |
| Volume Mute press | 164 | `KEYCODE_VOLUME_MUTE` | 113 | `` ` `` | `68` | `KEYCODE_GRAVE` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Back long-press | 4 | `KEYCODE_BACK` | 158 | `]` | `72` | `KEYCODE_RIGHT_BRACKET` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Menu long-press | 82 | `KEYCODE_MENU` | 139 | `@` | `77` | `KEYCODE_AT` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Play/Pause long-press | 85 | `KEYCODE_MEDIA_PLAY_PAUSE` | 164 | `MediaStop` | `86` | `KEYCODE_MEDIA_STOP` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Rewind long-press | 89 | `KEYCODE_MEDIA_REWIND` | 168 | `,` | `55` | `KEYCODE_COMMA` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Fast Forward long-press | 90 | `KEYCODE_MEDIA_FAST_FORWARD` | 208 | `.` | `56` | `KEYCODE_PERIOD` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Channel Up long-press | 92 | `KEYCODE_PAGE_UP` | 104 | `'` | `75` | `KEYCODE_APOSTROPHE` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Channel Down long-press | 93 | `KEYCODE_PAGE_DOWN` | 109 | `/` | `76` | `KEYCODE_SLASH` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Power (F1) long-press | 131 | `KEYCODE_F1` | 59 | `F12` | `142` | `KEYCODE_F12` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Home (F2) long-press | 132 | `KEYCODE_F2` | 60 | `=` | `70` | `KEYCODE_EQUALS` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Dot ••• (F11) long-press | 141 | `KEYCODE_F11` | 87 | Run Harmonium IME-Fix | `com.skavan.imefix` | — | global |

## Raw keys (no KeyMapper rule — they reach Harmonium directly)

| Physical key | Emits | What Harmonium does |
|---|---|---|
| D-pad ▲ ▼ ◀ ▶ | Arrow keys | move panel focus · drive the device on TV pages |
| OK (center) | Enter | activate the focused card · hold = grab the D-pad |
| Power (F1) tap | `F1` | power — end/start the page's activity (confirm) |
| Home (F2) tap | `F2` | Harmonium home — up one level |
| Channel ▲/▼ tap | PageUp / PageDown | jump sections · on TV pages: borrow the D-pad for the panel |
| Mic (F5) | `F5` | rs90 profile: `mic` — bindable in the Studio |
| ScreenCast (F6) | `F6` | rs90 profile: `screencast` — bindable |
| Source (F7) | `F7` | rs90 profile: `source` — bindable |
| Settings (F8) | `F8` | rs90 profile: `settings` — bindable |
| REW / Play-Pause / FWD tap | MediaRewind / MediaPlayPause / MediaFastForward | prev / play-pause / next on the running music |

## Notes

- `press` is `clickType: 0`; `long-press` is `clickType: 1` — the configured long-press delay is 600 ms.
- Scope “global” = the mapping fires everywhere (the dot keys — they are the road back to Fully from any other app). Grouped mappings inherit their group's constraints.
- The hold gestures land on: `]` = hold-Back (app back, always), `=` = hold-Home (app home, always), `F12` = hold-Power (All Off) — identical outputs to the Astrion's; only the trigger side mirrors (hold-Home is an F2 rule here, an F1 rule there). Taps route by page — device on TV pages, app elsewhere (docs/HARMONIUM-INPUT-ROUTING.md).
- Transport HOLDS: Rewind long `,` = seek back, Fast Forward long `.` = seek forward, Play/Pause long = MediaStop.
- The dot row is global (fires anywhere — the road back to Fully): • F9 → Fully, •• F10 → KISS launcher, ••• F11 → KeyMapper; ••• LONG → Harmonium IME-Fix (manual re-bounce of the input method if a boot ever leaves keys dead — rs90-facts.md has the four-layer runbook).
- Physical labels derive from the Android `KeyEvent` constants; the labels printed on the remote may differ. Scancodes are lower-level input-device codes.
