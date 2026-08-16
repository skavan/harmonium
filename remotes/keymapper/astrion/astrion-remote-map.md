# Astrion Remote Key Map

This table documents the enabled mappings in `data.json`.

| Physical key/action | Input keycode | Input Android constant | Scancode | Output/action | Output keycode / package | Output Android constant |
|---|---:|---|---:|---|---|---|
| F11 press | 141 | `KEYCODE_F11` | 87 | Open Key Mapper | `io.github.sds100.keymapper` | — |
| F8 press | 138 | `KEYCODE_F8` | 66 | Open Home Assistant Minimal | `io.homeassistant.companion.android.minimal` | — |
| F9 press | 139 | `KEYCODE_F9` | 67 | Open Fully Kiosk Browser | `de.ozerov.fully` | — |
| F10 press | 140 | `KEYCODE_F10` | 68 | Open HaRemote | `com.aiks.HaRemote` | — |
| Volume Up press | 24 | `KEYCODE_VOLUME_UP` | 115 | `+` | 81 | `KEYCODE_PLUS` |
| Volume Down press | 25 | `KEYCODE_VOLUME_DOWN` | 114 | `-` | 69 | `KEYCODE_MINUS` |
| F7 press | 137 | `KEYCODE_F7` | 65 | Open Android Browser | `com.android.browser` | — |
| Volume Mute press | 164 | `KEYCODE_VOLUME_MUTE` | 113 | `` ` `` | 68 | `KEYCODE_GRAVE` |
| Menu press | 82 | `KEYCODE_MENU` | 139 | `9` | 18 | `KEYCODE_9` |
| Back press | 4 | `KEYCODE_BACK` | 158 | `[` | 71 | `KEYCODE_LEFT_BRACKET` |
| Back long-press | 4 | `KEYCODE_BACK` | 158 | `]` | 72 | `KEYCODE_RIGHT_BRACKET` |
| F1 long-press | 131 | `KEYCODE_F1` | 59 | `;` | 74 | `KEYCODE_SEMICOLON` |
| F2 long-press | 132 | `KEYCODE_F2` | 60 | `=` | 70 | `KEYCODE_EQUALS` |

## Notes

- A normal press is represented by `clickType: 0` in the configuration.
- A long press is represented by `clickType: 1`; the configured long-press delay is 600 ms.
- Physical key names are based on the Android `KeyEvent` constants associated with each input keycode. The labels printed on the remote may differ.
- Scancodes are lower-level input-device codes and provide an additional way to identify each key.
