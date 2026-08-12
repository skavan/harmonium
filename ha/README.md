# HA-side objects Harmonium depends on

The engine is a dumb renderer; these objects on the Home Assistant side
are the brain. All of them exist in the Porch installation today.

## Helpers

- `input_select.porch_activity` — options: `off`, `watch_firetv`,
  `watch_smart`, `music`. THE source of truth for "which activity is
  running". Referenced by `global.activity_select` in config.json.
- `input_text.porch_remote_token` (mode: password, max 255) — transient
  clipboard for kiosk provisioning (see below).

## Scripts (root scripts.yaml, loaded via `script ui: !include scripts.yaml`)

Each activity script sets the input_select AS ITS FIRST STEP, then does
device orchestration:

- `script.activity_watch_firetv` — select→watch_firetv; TV on/HDMI, etc.
- `script.activity_watch_smart` — select→watch_smart; Samsung smart hub
- `script.activity_music` — select→music; Music Assistant start
- `script.activity_off` — select→off; everything off (also fired by
  hold-power "All Off")
- `script.provision_porch_remote` — reads the token helper server-side
  and calls `fully_kiosk.load_url` with
  `.../index.html#host=…&token={{ states('input_text.porch_remote_token') | trim }}&device=astrion`,
  then clears the helper. The token never transits chat or the remote's
  keyboard.

## Automations

- `automation.porch_sync_activity_state_from_devices` — covers
  device-initiated starts: Fire TV → playing sets `watch_firetv`;
  soundbar → playing while select==off sets `music`.

## Fully Kiosk (dev harness on the Astrion, 192.168.1.37)

- `button.astrion1_load_start_url` — reload the remote onto a fresh build
- `button.astrion1_clear_browser_cache` — bust /local/ caching
- Services target the DEVICE: pass `device_id` in data, not entity_id.

## Config quirks worth remembering

- `configuration.yaml` uses `script: !include_dir_merge_named scripts/`
  AND `script ui: !include scripts.yaml` — API-written scripts land in
  root scripts.yaml and load via the labeled include.
- The ha-mcp write allowlist covers `www/`, `themes/`,
  `custom_templates/`, `dashboards/` — NOT configuration.yaml or
  `scripts/`.

## Music favorites pipeline (v0.10)

- `sensor.porch_music_favorites` — trigger-based template sensor in
  `configuration.yaml` (`template:` block). Triggers: HA start, hourly,
  and the `harmonium_refresh_favorites` event (fire it to force a
  refresh — e.g. from an automation on MA library changes). Actions:
  two `music_assistant.get_library` calls (favorite playlists limit 24,
  favorite radio limit 12, `config_entry_id` of the MA entry) with
  response variables; publishes `attributes.favorites` as a native list
  of `{name, uri, media_type, image}`. All values cast to plain strings
  and `media_type` derived from the uri — MA returns enum objects,
  which would break HA's native-type attribute rendering (the list
  arrives as a Python-repr STRING instead of JSON; symptom: drawer
  renders zero tiles).
- Gotcha: the sensor first registered as `..._2` because a deleted UI
  template helper had briefly claimed the object id — fixed by an
  entity-registry rename. The UI template-helper flow silently DROPS
  `triggers`/`actions`/`attributes` keys (state-based only), which is
  why this lives in YAML.
- The remote's Music drawer renders this sensor via `presets_from`
  (see docs/screen-schema.md v0.10); play actions call
  `music_assistant.play_media` on `$context.media_player`, and
  "Pull Music Here" calls `music_assistant.transfer_queue`.

## Astrion KeyMapper — CH rocker (v0.10.1)

Map the Astrion's CH+ / CH− hardware keys to keyboard `PageUp` /
`PageDown` in KeyMapper. The engine turns those into logical
`ch_up`/`ch_down`, which the music screens bind to next/previous track
(per-screen `buttons` map in config). Until KeyMapper is updated the
CH rocker simply does nothing on the remote.

## Astrion KeyMapper — REQUIRED mappings (v0.11.1)

The engine has NO in-webview hold timers (injected keys don't deliver
reliable keyup). KeyMapper must send these keyboard keys:

- D-pad: arrows + Enter (existing) · VOL ± → `+` / `-` (existing)
- Back tap → `[` · Back LONG-PRESS → `{`
- Home tap → `]` · Home LONG-PRESS → `}`
- Power tap → `p`  (⚠ replace the old F2 mapping — F2 never reached
  the webview, which is why power "never worked")
- Power LONG-PRESS → `o` (All Off)
- Mute → `m`
- CH+ → `PageUp` · CH− → `PageDown`

Long-press = KeyMapper's own long-press trigger on the same physical
key, bound to the alternate character.

## Astrion physical keys — CONFIRMED map (v0.11.2, from the old
## astrion-harmonia dashboard-hotkeys card + on-device debug card)

| Physical | Emits | Harmonium logical | Action |
|---|---|---|---|
| D-pad | Arrows/Tab/Enter | up/down/left/right/select | nav / passthrough |
| VOL ± | `+` / `-` | vol_up/vol_down | focus-follows VOL |
| Back tap | `[` | back | UI back |
| Back long-press | `]` | back_hold | DEVICE back |
| Home tap | `F1` | home | UI home ladder |
| Home long-press | `;` | home_hold | DEVICE home |
| Mute | `` ` `` (backtick) | mute | toggle mute, ARC path |
| Menu | `#` | menu | DEVICE menu (needs next engine deploy) |
| Power | `F2` | power | class-scoped power |
| — | `o` (map if wanted) | power_hold | All Off |
| CH ± | map to PageUp/PageDown | ch_up/ch_down | per-screen bindings |

No KeyMapper changes required for Back/Home/Mute/Menu/Power — the raw
emissions are mapped engine-side now. The earlier v0.11.1 table's
`{`/`}`/`p` mappings remain as synonyms.
