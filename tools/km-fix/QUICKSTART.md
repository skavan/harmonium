# KM Fix — build, install, test (no USB required)

Your machine's specifics, used throughout:

- Project: `G:\Documents\Code 2025\repos\HA-2026\harmonium\tools\km-fix`
- ADB (in your scrcpy folder): `D:\Program Files\Android\scrcpy-win64-v4.1`
- Remote (new Astrion HA100): `192.168.1.36:5555`

The case is screwed shut, so there is NO USB. The plan works around that:
adb is used ONCE (to install), while wireless is up right now. After that,
kmfix runs on the device — launched by Fully at boot, or tapped from KISS —
so no reconnect is ever needed post-reboot.

Use **Command Prompt** (not PowerShell). Each block is copy-paste-able.

---

## 0. Confirm wireless ADB is up RIGHT NOW (before you reboot anything)

```bat
cd /d "D:\Program Files\Android\scrcpy-win64-v4.1"
adb connect 192.168.1.36:5555
adb -s 192.168.1.36:5555 shell echo alive
```

- Prints `alive` → good, wireless is up. Continue.
- Fails → the bridge is down. On the remote: open Key Mapper from KISS and run
  your wireless-ADB-ON action, then retry. (This only works while the bridge is
  still alive from an earlier `start.sh` this session — so do NOT reboot the
  remote until AFTER step 3 has installed kmfix.)

---

## 1. Build the APK

```bat
cd /d "G:\Documents\Code 2025\repos\HA-2026\harmonium\tools\km-fix"
build-apk.bat
```

Produces:

```text
G:\Documents\Code 2025\repos\HA-2026\harmonium\tools\km-fix\app\build\outputs\apk\debug\app-debug.apk
```

---

## 2. Install + grant (over the live wireless link — no USB)

```bat
cd /d "D:\Program Files\Android\scrcpy-win64-v4.1"
adb -s 192.168.1.36:5555 install -r "G:\Documents\Code 2025\repos\HA-2026\harmonium\tools\km-fix\app\build\outputs\apk\debug\app-debug.apk"
adb -s 192.168.1.36:5555 shell pm grant com.skavan.kmfix android.permission.WRITE_SECURE_SETTINGS
adb -s 192.168.1.36:5555 shell dumpsys package com.skavan.kmfix | findstr WRITE_SECURE_SETTINGS
```

Last line must show `granted=true`. Once this is done, the APK and its
permission are on the device permanently — you never need adb again for it.

---

## 3. Quick sanity check — tap it once, on the device, while keys still work

On the remote, from KISS, find **Harmonium KM Fix** in the app list and tap it.
The screen flashes nothing (it's invisible) — that's correct. It runs the
bounce and exits after ~10 seconds. Buttons should keep working (a no-op bounce
when they're already fine). This just proves the app launches and the permission
is live. If you want to watch it work, over the still-live wireless link:

```bat
adb -s 192.168.1.36:5555 logcat -c
```
tap the icon, wait ~12 s, then:
```bat
adb -s 192.168.1.36:5555 logcat -d -s HarmoniumKmFix:I *:S
```
You want to see `Unbound Key Mapper` then `Rebound Key Mapper ... Finished`.

---

## 4. Wire it into Fully

On the remote: **Fully Kiosk → Settings → Advanced Web Settings → Application to
Run on Start in Foreground (PLUS)**, set to exactly:

```text
com.skavan.kmfix
```

---

## 5. THE TEST — reboot, hands off

Reboot the remote (hold power, or over the still-live link:
`adb -s 192.168.1.36:5555 shell reboot`). Let it come all the way back to KISS,
wait ~15 seconds (8 s helper delay + Fully paint), touch nothing, then press a
mapped arrow/volume key.

- **Buttons work, nothing else done** → SOLVED. Reboots self-heal. Finished.
- **Buttons dead** → go to step 6 (the on-device manual test) before giving up.

---

## 6. If the boot run didn't take — manual on-device test (still no USB)

The keys are dead, but KISS is the home screen and responds to touch. From KISS,
tap the **Harmonium KM Fix** icon by hand. Wait ~12 seconds. Press a mapped key.

- **Buttons wake up when you tap the icon** → the bounce works, it just fired too
  early at boot. Fix: raise the delay. Tell me and I'll bump `STARTUP_DELAY_MS`
  to 12000 (or you edit it in
  `app\src\main\java\com\skavan\kmfix\KmFixService.java`), rebuild (step 1). To
  reinstall the new build you need wireless up again — revive the bridge first
  (Key Mapper action from KISS), then step 2's install line.
- **Buttons STILL dead even after tapping the icon** → it's not a bind-timing
  race; kmfix can't fix this unit. Stop — we go to firmware or the USB floor.
  Tell me and we'll write up the finding.

---

## Notes

- The only adb-dependent steps are 2 (install) and reinstalling after an edit.
  Both need wireless up, which needs the bridge alive — so keep the bridge up
  (don't reboot) until kmfix is installed and wired into Fully.
- After that, kmfix is fully on-device: Fully launches it at boot, KISS can
  launch it by hand. No cable, no adb, ever, for normal operation.
