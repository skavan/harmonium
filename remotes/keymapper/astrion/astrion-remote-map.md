# Astrion Remote Key Map

GENERATED from `data.json` — do not hand-edit; rerun
`python gen-map-docs.py` after mappings change (refresh
`data.json` from the newest `key_mapper.zip` first).

| Physical key/action | Input keycode | Input Android constant | Scancode | Output/action | Output keycode / package | Output Android constant | Scope |
|---|---:|---|---:|---|---|---|---|
| Back press | 4 | `KEYCODE_BACK` | 158 | `[` | `71` | `KEYCODE_LEFT_BRACKET` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Volume Up press | 24 | `KEYCODE_VOLUME_UP` | 115 | `+` | `81` | `KEYCODE_PLUS` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Volume Down press | 25 | `KEYCODE_VOLUME_DOWN` | 114 | `-` | `69` | `KEYCODE_MINUS` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Menu press | 82 | `KEYCODE_MENU` | 139 | `#` | `18` | `KEYCODE_POUND` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| F8 press | 138 | `KEYCODE_F8` | 66 | Open Fully Kiosk Browser | `de.ozerov.fully` | — | global |
| F9 press | 139 | `KEYCODE_F9` | 67 | Open File Manager | `com.mediatek.filemanager` | — | global |
| F10 press | 140 | `KEYCODE_F10` | 68 | Open HaRemote | `com.aiks.HaRemote` | — | global |
| F11 press | 141 | `KEYCODE_F11` | 87 | Open Key Mapper | `io.github.sds100.keymapper` | — | global |
| Volume Mute press | 164 | `KEYCODE_VOLUME_MUTE` | 113 | `` ` `` | `68` | `KEYCODE_GRAVE` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Back long-press | 4 | `KEYCODE_BACK` | 158 | Android Go back | — | — | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Channel Up long-press | 92 | `KEYCODE_PAGE_UP` | 104 | `'` | `75` | `KEYCODE_APOSTROPHE` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| Channel Down long-press | 93 | `KEYCODE_PAGE_DOWN` | 109 | `/` | `76` | `KEYCODE_SLASH` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| F1 long-press | 131 | `KEYCODE_F1` | 59 | Android Go home | — | — | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| F2 long-press | 132 | `KEYCODE_F2` | 60 | `=` | `70` | `KEYCODE_EQUALS` | group “FullyKiosk” — Fully Kiosk Browser in foreground |
| F11 long-press | 141 | `KEYCODE_F11` | 87 | Open Android Browser | `com.android.browser` | — | global |

## Notes

- `press` is `clickType: 0`; `long-press` is `clickType: 1` — the configured long-press delay is 600 ms.
- Scope “global” = the mapping fires everywhere (the app-launcher keys — they are the road back to Fully from any other app). Grouped mappings inherit their group's constraints.
- The bottom glyph row (💡 lightbulb / curtains / ♪ music / climate) emits `F4`–`F7` and is deliberately NOT KeyMapper-mapped — F-keys reach the webview raw, and harmonium's astrion profile names them `light` / `cover` / `music` / `climate` (they match the device-photo skin's hotspots). Bind what they do in the Studio: Page settings → Keys. See docs/cookbook/hardware-keys.md.
- Physical labels derive from the Android `KeyEvent` constants; the labels printed on the remote may differ. Scancodes are lower-level input-device codes.
