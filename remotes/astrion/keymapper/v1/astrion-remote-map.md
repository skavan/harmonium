# Astrion Remote Key Map (v1)

GENERATED from `key_mapper.zip` — do not hand-edit; rerun
`python ../gen-map-docs.py v1` after mappings change.

## KeyMapper rules (what the buttons are remapped to)

| Physical key/action | Input keycode | Input Android constant | Scancode | Output/action | Output keycode / package | Output Android constant | Scope |
|---|---:|---|---:|---|---|---|---|
| Back press | 4 | `KEYCODE_BACK` | 158 | `[` | `71` | `KEYCODE_LEFT_BRACKET` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Volume Up press | 24 | `KEYCODE_VOLUME_UP` | 115 | `+` | `81` | `KEYCODE_PLUS` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Volume Down press | 25 | `KEYCODE_VOLUME_DOWN` | 114 | `-` | `69` | `KEYCODE_MINUS` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Menu press | 82 | `KEYCODE_MENU` | 139 | `#` | `18` | `KEYCODE_POUND` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Red (F8) press | 138 | `KEYCODE_F8` | 66 | Open Fully Kiosk Browser | `de.ozerov.fully` | — | global |
| Green (F9) press | 139 | `KEYCODE_F9` | 67 | Open File Manager | `com.mediatek.filemanager` | — | global |
| Blue (F10) press | 140 | `KEYCODE_F10` | 68 | Open HaRemote | `com.aiks.HaRemote` | — | global |
| Yellow (F11) press | 141 | `KEYCODE_F11` | 87 | Open Key Mapper | `io.github.sds100.keymapper` | — | global |
| Volume Mute press | 164 | `KEYCODE_VOLUME_MUTE` | 113 | `` ` `` | `68` | `KEYCODE_GRAVE` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Back long-press | 4 | `KEYCODE_BACK` | 158 | `]` | `72` | `KEYCODE_RIGHT_BRACKET` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| D-pad Left long-press | 21 | `KEYCODE_DPAD_LEFT` | 105 | `,` | `55` | `KEYCODE_COMMA` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| D-pad Right long-press | 22 | `KEYCODE_DPAD_RIGHT` | 106 | `.` | `56` | `KEYCODE_PERIOD` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Menu long-press | 82 | `KEYCODE_MENU` | 139 | `@` | `77` | `KEYCODE_AT` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Channel Up long-press | 92 | `KEYCODE_PAGE_UP` | 104 | `'` | `75` | `KEYCODE_APOSTROPHE` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Channel Down long-press | 93 | `KEYCODE_PAGE_DOWN` | 109 | `/` | `76` | `KEYCODE_SLASH` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Home (F1) long-press | 131 | `KEYCODE_F1` | 59 | `=` | `70` | `KEYCODE_EQUALS` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Power (F2) long-press | 132 | `KEYCODE_F2` | 60 | `F12` | `142` | `KEYCODE_F12` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Yellow (F11) long-press | 141 | `KEYCODE_F11` | 87 | Open Android Browser | `com.android.browser` | — | global |

## Raw keys (no KeyMapper rule — they reach Harmonium directly)

| Physical key | Emits | What Harmonium does |
|---|---|---|
| D-pad ▲ ▼ ◀ ▶ | Arrow keys | move panel focus · drive the device on TV pages |
| OK (center) | Enter | activate the focused card · hold = grab the D-pad |
| Home (F1) tap | `F1` | Harmonium home — up one level |
| Power (F2) tap | `F2` | power — end/start the page's activity (confirm) |
| Channel ▲/▼ tap | PageUp / PageDown | jump sections · on TV pages: borrow the D-pad for the panel |
| Lightbulb·REW (F4) | `F4` | astrion profile: Lights shortcut · v2 recipe: ⏮ previous |
| Curtains·Play/Pause (F5) | `F5` | astrion: Covers shortcut · v2: ⏯ |
| Music·Stop (F6) | `F6` | astrion: Music shortcut · v2: ⏹ |
| Climate·FWD (F7) | `F7` | astrion: Climate shortcut · v2: ⏭ next |

## Notes

- `press` is `clickType: 0`; `long-press` is `clickType: 1` — the configured long-press delay is 600 ms.
- Scope “global” = the mapping fires everywhere. Grouped mappings inherit their group's constraints.
- **The colour keys are consumed by Key Mapper, not passed to Harmonium** (they never reach the webview): Red opens Fully Kiosk Browser; Green opens File Manager; Blue opens HaRemote; Yellow opens Key Mapper (long-press: opens Android Browser).
- The hold gestures land on: `]` = hold-Back, `=` = hold-Home, `F12` = hold-Power (All Off).
- Physical labels derive from the Android `KeyEvent` constants; the labels printed on the remote may differ.
