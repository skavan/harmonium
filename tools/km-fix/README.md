# Harmonium KM Fix

Harmonium KM Fix is a one-shot Android helper for the Key Mapper accessibility-service startup race on the new-firmware Astrion HA100 (Android 8.1).

It is the sibling of `tools/ime-fix` (which bounces the *input method* on the RS90). This one bounces the *accessibility service*, because the Astrion's failure is at a different layer.

## The failure it repairs

On the affected Astrion unit, after a reboot Key Mapper's accessibility service comes up **bound but inert**: a mapped Volume press falls through to the system (the Android volume panel appears, sometimes with an extra "Accessibility" slider row) instead of being consumed and remapped. The service is running; it was wired to an input pipeline that was not ready when it bound at boot.

Removing Key Mapper from `enabled_accessibility_services` and then adding it back forces a fresh bind against a now-ready pipeline, which restores interception. This APK performs that un-bind / re-bind automatically after the system settles, then kills itself.

## Why this is root-free (and the ADB self-heal was not)

`enabled_accessibility_services` is a **secure setting**. `WRITE_SECURE_SETTINGS` — granted once over ADB — permits writing it. Nothing here touches `service.adb.tcp.port` or restarts adbd, so it needs no root and no shell-privileged bridge. That wall (enabling wireless ADB requires root or an already-privileged shell) is exactly why an APK cannot self-heal the *bridge* path; the accessibility bounce avoids it entirely.

If the Astrion's failure turns out NOT to be a bind-timing race — i.e. the firmware broke accessibility key-filtering outright — this helper runs cleanly and changes nothing. It is a safe no-op in that case, never a regression.

## Runtime sequence

1. Fully Kiosk launches `com.skavan.kmfix` via **Application to Run on Start in Foreground (PLUS)**.
2. The translucent launcher activity starts the worker service and calls `finishAndRemoveTask()`.
3. The service waits `STARTUP_DELAY_MS` (8000 ms) for boot to settle.
4. It reads `enabled_accessibility_services`; if Key Mapper is absent it logs and exits.
5. It writes the list **without** Key Mapper (un-bind).
6. It waits `BOUNCE_GAP_MS` (1200 ms).
7. It writes the **original** list back (re-bind) and sets `accessibility_enabled=1`.
8. It stops the service and calls `Process.killProcess`.

No persistent service, notification, activity, or helper survives.

## Build

Identical toolchain to `tools/ime-fix`:

- Windows, Java 16-compatible, Android SDK Platform 31 under `%LOCALAPPDATA%\Android\Sdk` (or `ANDROID_HOME`).

```bat
cd /d "G:\Documents\Code 2025\repos\HA-2026\harmonium\tools\km-fix" & build-apk.bat
```

Output: `tools\km-fix\app\build\outputs\apk\debug\app-debug.apk`.

## Install and authorize

```bat
adb install -r app\build\outputs\apk\debug\app-debug.apk & adb shell pm grant com.skavan.kmfix android.permission.WRITE_SECURE_SETTINGS
```

The grant survives reboots and `adb install -r` upgrades; re-grant after an uninstall/reinstall or a permissions clear.

## Manual test (before trusting it at boot)

With Key Mapper's key detection currently DEAD (post-reboot, bridge down), launch the helper by hand and watch whether the buttons come back WITHOUT running `start.sh`:

```bat
adb shell am force-stop com.skavan.kmfix & adb shell monkey -p com.skavan.kmfix 1 & timeout /t 11 /nobreak & adb logcat -d -s HarmoniumKmFix:I *:S
```

Then press a mapped arrow/volume key.

- **Buttons work** → the bounce is the cure. Wire it into Fully (below) and do the boot test.
- **Buttons still dead** → the failure is not a bind race; kmfix cannot fix it. Fall back to firmware or the USB-on-reboot floor.

A successful log looks like:

```text
Started; waiting 8000ms for the system to settle
enabled_accessibility_services=io.github.sds100.keymapper/...MyAccessibilityService
Unbound Key Mapper; wrote=; changed=true
Rebound Key Mapper; changed=true; current=io.github.sds100.keymapper/...
Finished; exiting process
```

## Fully Kiosk configuration

Set **Settings → Advanced Web Settings → Application to Run on Start in Foreground (PLUS)** to:

```text
com.skavan.kmfix
```

Foreground, not the background startup list (same reason as imefix — background start was unreliable on the tested hardware).

## Boot test

Reboot the remote, touch nothing, wait ~15 s (8 s settle + Fully paint), then press the mapped keys. Alive without any PC intervention = solved. If it needs the delay lengthened, raise `STARTUP_DELAY_MS` in `KmFixService.java`, rebuild, reinstall.

## Tuning

- `STARTUP_DELAY_MS` — raise if the bounce fires before the input pipeline is ready.
- `BOUNCE_GAP_MS` — raise if the framework has not fully torn the service down before the re-bind.

## Scope

Astrion HA100 only (this specific firmware revision). The OLD Astrion does NOT need this and must NOT get it — it survives reboots natively and is the reference specimen. The RS90 uses `tools/ime-fix` (IME path), a different mechanism.
