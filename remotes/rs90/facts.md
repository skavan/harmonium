# RS90 — device fact sheet

*Purpose: Ground truth captured from the hardware (via
`device-facts.bat`), the numbers the rs90 profile, skin and runbook
are built on. Audience: maintainers.*

Captured 2026-08-21, pre-factory-reset, firmware as shipped.

| Fact | Value |
|---|---|
| Manufacturer / model | Haptique **RS90** |
| Android | **12** (`SP1A.210812.016`, build 2025-07-02, targetSdk floor 31) |
| Build fingerprint | `Cantata/Haptique/RS90:12/SP1A.210812.016/20250702:user/release-keys` |
| Brand codename | **Cantata** — hence the stock UI package `com.cantata.remote` |
| LCD | 480×800 physical @ density 220 → **349×582 CSS px, DPR 1.375** (engine diag reports 350×582 @ 1.38 — same number, rounded) |
| WebView | `com.android.webview` **91.0.4472.114** — the firmware's provider whitelist contains ONLY this package; a sideloaded `com.google.android.webview` is never a candidate (verified via `dumpsys webviewupdate` + a refused `cmd webviewupdate set-webview-implementation`). **Do not chase Fully's "update WebView" nag** — 91 is a generation newer than the Astrion's webview and the engine is happy on far less. |
| Fully Kiosk | 1.60.1 (nags about the webview; the Astrion's Fully doesn't — version diff TBD when the Astrion is next on USB) |
| KeyMapper | 4.0.5-foss (backup schema db 22 / app 247 — identical to the Astrion's, so generated backup zips restore cleanly) |
| Stock remote UI | `com.cantata.remote` 3.7 — it is BOTH the remote UI and the device's launcher/home app. **Trap: the "OPUS 1" UI mode** (selectable via the Haptique Config phone app) renders as an app-launcher-style Apps page — easily mistaken for "the remote UI crashed back to a launcher." It hadn't; switch the UI mode off in Config and the classic room UI returns. Rooms/configs are built on the phone in **Haptique Config** and pushed to the remote (local, no cloud dependency). The firmware GMS is signature-invalid (uncertified) — cantata logs a warning and carries on; ignore it. |
| Firmware notes | The earlier "`com.aiks.HaRemote` 2.5 baked into Haptique firmware" claim is **retracted as unverified**: dumpsys prints an updated system app's versionName TWICE (current + hidden factory copy), so the RS90's "3.7 / 2.5" pair was almost certainly cantata current+factory — the Astrion showed the same double-line (1.4.1 / 1.0.38). Settle it someday with `pm list packages \| grep aiks` on the RS90. Standing rule regardless: never `pm disable` system remote apps. **Fleet fact (from a virgin Sanytron user's HA100, 2026-08-21): the Astrion's density-220 override is FACTORY** (physical 200 + shipped override), and **Astrion webview state of knowledge** (2026-08-22): the reference unit RUNS a factory **Google WebView 136** (`/system/priv-app/NWebView_x15`, installed 2026-02-02 — never sideloaded); EVERY Astrion also carries dormant stock **Chromium 61** (`com.android.webview` 61.0.3163.98) — which is the engine's enforced syntax floor (`tests/probe-syntax-floor.mjs`). A fleet unit's earlier readout proved only the 61 *package* exists — and the DECISIVE control (2026-08-22): the reference unit, fed that same old one-liner, produces the fleet unit's output **line for line** while actually running the factory 136. The one-liner cannot distinguish the units; there is currently NO evidence any two Astrions differ, and the working presumption is that this firmware's units all run the factory 136 (`device-facts.bat` now asks all three webview questions; the one remaining check, if a fleet volunteer ever offers, is the read-only `adb shell dumpsys webviewupdate`). Bonus confirmation from the same control run: the Astrion's cantata grep prints NOTHING — so yesterday's "1.4.1 / 1.0.38" pair was indeed HaRemote's updated-system double-line, as retracted above. The RS90's Android 12 whitelist is locked to its stock 91 — no upgrade possible, none needed. |

## Key inventory (what the buttons emit)

Raw to the webview, no KeyMapper needed: **Power=F1, Home=F2** (SWAPPED
vs the Astrion — never copy its keymap), **Mic=F5, ScreenCast=F6,
Source=F7, Settings=F8**, dots **• •• ••• = F9 F10 F11**, CH▲▼ =
PageUp/PageDown, D-pad = arrow keys, OK = DPAD_CENTER (Enter).

Android keycodes needing KeyMapper interception (all field-proven
interceptable — same pattern as the Astrion): Back (4), Menu (82),
Volume Up/Down (24/25), Mute (164), and the transport row
MEDIA_REWIND/PLAY_PAUSE/FAST_FORWARD (89/85/90).

Full mapping set: `remotes/rs90/keymapper/` (generated `data.json` +
restorable `key_mapper.zip` + `rs90-remote-map.md`).

**THE RS90 KEY STACK — RESOLVED 2026-08-22 (one full day; full
forensics in `remotes/rs90/key-research.md`).** Four independent
layers had to be right; getting all four is the runbook:

1. **Launcher must NOT be cantata.** The stock `com.cantata.remote`
   runs as the home app and grabs the physical keys at boot — with
   it as home, every KeyMapper-defined key is dead. Fix: install a
   dumb launcher (**KISS Launcher**, FOSS via Aurora), set it Home
   → Always. cantata stays installed, launched on demand from a dot
   key. With KISS home, all raw keys + most mapped keys work.
2. **KeyMapper uses the INPUT METHOD path, never Expert Mode.**
   Expert Mode is a TRAP here — never needed and its
   wireless-debugging re-arm causes the boot ADB dialogs. Setup:
   accessibility service on; **enable + SELECT the Key Mapper
   keyboard** (injection path); tick **auto-switch to normal
   keyboard when typing**; grant DND access once
   (`adb shell cmd notification allow_dnd io.github.sds100.keymapper`)
   — the **volume/mute** triad needs it or those three stay dead.
   Triggers Any-device (harmless; NOT the bug — see below).
3. **The boot IME-injection race (the real reboot-killer).** At
   boot KeyMapper's IME is selected before the input pipeline is
   ready, so injected key events are silently dropped — capture,
   consume and inject all succeed in the KeyMapper log, but nothing
   reaches the webview. Proven cause, not the device-id theory:
   triggers were already "Any device" and it still died; the fix is
   re-SELECTING the IME once (bounce to LatinIME and back). The
   device-id known-issue #5 was a RED HERRING (tested, failed).
4. **The bounce is automated by our own APK: `com.skavan.imefix`**
   (`tools/ime-fix/`, built with gradle; source + full runbook in
   `tools/ime-fix/README.md`). Fully's **"Application to Run on
   Start in Foreground (PLUS)"** = `com.skavan.imefix` → it waits
   ~5s, writes `Settings.Secure.default_input_method` to LatinIME
   then back to KeyMapper, then kills its own PID. Self-timed to
   Fully launch, one-shot, no persistent service, no root, no Play
   billing. Needs `WRITE_SECURE_SETTINGS` granted once via adb.
   (Termux was tried and FAILED: non-root Termux can't run
   `settings`/`ime` — "Failed transaction 2147483646"; only the
   Java-API path an APK uses works.)

Symptom-mask note that cost hours: with injection dead, keys flow
raw into Fully, whose `disableVolumeButtons: true` (Astrion
doctrine) swallows volume — "volume does nothing at all" was TWO
configs interlocking, not a second thief. cantata is fully
acquitted of media-session theft.

Doctrine note (rewritten 2026-08-26 — the original "Back is
FLIPPED vs the Astrion" scheme predates the input-routing doctrine
and was never what shipped):
Back is IDENTICAL to the Astrion — tap emits `[` (back: routed by
page, device on TV pages, app elsewhere), long-press emits `]`
(back_hold: always the app). Hold gestures likewise match the
Astrion's outputs: Home long → `=` (home_hold), Power long → `F12`
(power_hold / All Off). The ONE thing that never matches is the
trigger side: **Power=F1, Home=F2 here — mirrored** — so the
KeyMapper rules bind the holds to the opposite F-keys from the
Astrion's. Full doctrine: `docs/HARMONIUM-INPUT-ROUTING.md`.
