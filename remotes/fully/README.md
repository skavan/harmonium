# Fully Kiosk settings — the clone file

*Purpose: One import instead of forty toggles — the field-proven
Fully Kiosk configuration for Harmonium hardware remotes, captured
from the reference Astrion (Fully 1.60.1, 2026-08-21). Audience:
anyone provisioning a new remote.*

## Files

- `remote-fully-settings.json` — the canonical, device-neutral
  settings. Import this on a NEW remote.
- `astrion-fully-settings.json` — the raw export it was distilled
  from (kept as provenance; contains the reference house's
  encrypted PINs and start URL, so prefer the canonical file).

## Using it on a new remote

1. Push it: `adb push remote-fully-settings.json /sdcard/`
2. Fully → Settings → Other Settings → **Import Settings from
   File** → pick it. (Fully reads/writes settings files in the
   **root of `/sdcard`**, not Download — its own Export lands
   there too.)
3. Personalize the three fields the file deliberately blanks:
   - **Start URL** → `http://<your-ha>:8123/local/harmonium/index.html#device=<profile-id>`
     (`#device=` pins which remote profile the engine uses — e.g.
     `astrion`, `rs90`; it stores itself and strips from the URL).
   - **Kiosk exit PIN** (Kiosk settings) — set your own.
   - **Remote admin password** (Remote Administration) — set your
     own.
4. License the device (Fully PLUS), grant Device Admin when asked
   (that's how Fully switches the screen off — `force-lock`), and
   allow autostart/battery-optimization exemption per
   `docs/GETTING-STARTED.md` §5.

## The settings that ARE the doctrine (don't casually flip these)

| Setting | Value | Why |
|---|---|---|
| `kioskMode` / `singleAppMode` | **false** | Harmonium remotes are NOT locked kiosks: the launcher F-keys/dots must be able to leave Fully, and KeyMapper must be reachable. |
| `disableOtherApps` | **false** | Set false for intent, but it is **kiosk-gated** (inert while `kioskMode` is false) — not the cause of Fully covering other apps here. Astrion export shipped it `true`; harmless with kiosk off. |
| Fully "Display over other apps" (`SYSTEM_ALERT_WINDOW`) | **granted** | Fully REQUIRES it (re-prompts the instant it's revoked) — it guards the kiosk and paints the battery-alert overlay banner (blueprint → `notify` → Fully overlay). Leave it granted. Consequence: **Fully re-asserts itself over other apps** — expected kiosk behavior, not a bug to fix. |

**"I need to reach KeyMapper but Fully covers it"** (2026-08-23, resolved): daily use never needs this; only mapping edits do, and they're rare. Don't fight Fully's overlay/foreground guarding — just get Fully out of the way for the minute you're editing: `adb shell am force-stop de.ozerov.fully`, do your KeyMapper work (it now stays on top), then relaunch Fully (`adb shell monkey -p de.ozerov.fully 1`, or the dot-• key). No permission changes, no lost features.
| `runInForeground`, `launchOnBoot`, `restartOnCrash`, `restartAfterUpdate` | true | The remote always boots into the engine and self-heals. |
| `keepScreenOn` + `timeToScreenOffV2: 300` | true / 300 s | Fully owns the screen: stays on while in use, off after 5 min via its Device Admin. |
| `preventSleepWhileScreenOff` | **false** | Deep sleep is the battery story — never hold the device awake with the screen off (see the wake-lock section of hardware-keys). |
| `disableVolumeButtons`, `disableHomeButton`, `disableStatusBar`, `disableContextMenu` | true | Android chrome stays out of the way; volume/home reach the engine as KeyMapper-emitted keys, not OS actions. |
| `enableBackButton` | true | Back participates in the KeyMapper doctrine instead of being swallowed. |
| `webviewDebugging` | true | chrome://inspect over adb works on every remote — the field-debug lifeline. |
| `websiteIntegration` (JS interface) | false | The engine talks to HA directly; it does not use Fully's JS API. The battery blueprint rides the Fully Kiosk **HA integration** (remote admin, enabled) instead. |
| `remoteAdmin` + `remoteAdminLan` | true | The HA Fully integration (battery sensors, cache clear, TTS) and browser admin at `http://<remote-ip>:2323`. |

Everything else in the file is Fully's default or cosmetic. When a
setting earns doctrine status (a device needed it changed for a
reason), change it HERE, note why in this table, and re-import on
the fleet — this file is the truth, individual devices are copies.

Captured from Fully **1.60.1**; Fully renames keys occasionally, so
after a major Fully upgrade re-export the reference device and diff.
