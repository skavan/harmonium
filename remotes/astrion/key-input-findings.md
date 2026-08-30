# Astrion HA100 (new firmware) — hardware key input: the full investigation

Status: **RESOLVED 2026-08-29.** The working answer is at the top; the investigation, dead ends, and the alternative architecture we proved but did not need are below so no future session re-walks this. This unit is a NEW Astrion HA100 that took a firmware update during setup; the OLD Astrion, on byte-identical software, never had this problem — the firmware revision is the only variable left standing (see "The old-remote divergence").

## The one-paragraph answer

On this remote, Key Mapper's **Expert Mode** does not survive a reboot, because Expert Mode runs on a shell-privileged bridge (`start.sh`) that only an adb shell can create and nothing in normal boot recreates. Key detection (accessibility) survives a reboot fine; the only thing that dies is **keycode injection into the webview** — which is why the launcher/shell keys (colored buttons) kept working while the "Input KEYCODE" keys (volume, mute, back) went dead. The fix is to inject through Key Mapper's **input-method (IME) path** instead of the bridge — an IME is a normal service the system starts at boot, so it is reboot-proof — and to install the **Key Mapper GUI Keyboard** so the IME has a visible layout (the invisible "Key Mapper Basic Input Method" injects but leaves you with no on-screen keyboard).

## The working configuration (reboot-proof)

1. Key Mapper → Settings → **Key event actions → "Key Mapper input method"** (NOT Expert Mode).
2. Install the **Key Mapper GUI Keyboard** (`io.github.sds100.keymapper.inputmethod.latin`, tested 1.4.6; Aurora failed, sideloaded the APK).
3. Enable it in **Manage keyboards**, and make it the **default input method** — its component is `io.github.sds100.keymapper.inputmethod.latin/.LatinIME`. It both injects (it is a Key Mapper IME) and shows keys (it has a layout).
4. Set `show_ime_with_hard_keyboard=1` (Android 8 hides the on-screen keyboard when it thinks a physical keyboard — the KM IME — is attached; this flag overrides that).
5. Key Mapper needs the **DND access** grant for the volume/mute mappings specifically (`adb shell cmd notification allow_dnd io.github.sds100.keymapper`) — same as the RS90.

Adb one-liners (over the live link) for 3 and 4:

```
adb -s <remote> shell ime enable io.github.sds100.keymapper.inputmethod.latin/.LatinIME
adb -s <remote> shell ime set    io.github.sds100.keymapper.inputmethod.latin/.LatinIME
adb -s <remote> shell settings put secure show_ime_with_hard_keyboard 1
```

Verified: survived 3 consecutive cold reboots with keys AND keyboard both live and `default_input_method` staying on the GUI keyboard.

## The residual race — "imefix v2" (not built yet, may not be needed)

Across the reboots during setup the behaviour varied (keys dead until Key Mapper was foregrounded once; then keys-but-no-keyboard; then both clean). Once the config settled (GUI keyboard default + show_ime flag) three reboots ran clean, so the variance was most likely the config still settling. BUT a boot-arming race may remain: the accessibility service can come up bound-but-inert (we saw its serviceInfo with empty `eventTypes` right after boot), and foregrounding Key Mapper once "armed" it.

If a future reboot comes up with keys dead, the cure is an **IME-bounce boot helper** — the imefix pattern (`tools/ime-fix`) launched by Fully at boot, waits for settle, then `ime set` the GUI keyboard (or bounces AOSP→GUI). **This would be a SEPARATE, SECOND helper, not the existing imefix** — imefix as it stands is built and needed for the **RS90** (it bounces the default IME between AOSP LatinIME and the KM basic IME for the RS90's boot race). The Astrion helper would bounce to the GUI keyboard component instead. Call it what it is when built (e.g. `tools/ime-fix-astrion` / kmfix retargeted); do not repurpose the RS90 one.

## Why the obvious fixes were wrong (dead ends, so nobody re-pays them)

- **The `pm grant WRITE_SECURE_SETTINGS` "fix" from the old cookbook is for Expert Mode enablement, not persistence.** Granting it does not make the Expert bridge survive a reboot; the bridge is a shell-uid process, not a permission.
- **Downgrading to Key Mapper 4.0.5 does not help.** 4.0.5 shows the SAME `start.sh` Expert-Mode command as 4.3.1; the bridge dies at reboot on both. The 4.0.5-vs-4.3.1 difference was a red herring. (Backups are forward-compatible only — a 4.3.1 export will not import into 4.0.5, so a downgrade also means rebuilding mappings.)
- **The accessibility capability is not missing.** `dumpsys accessibility` shows `capabilities=105` on BOTH remotes (105 = 1 retrieve-window-content + 8 FILTER_KEY_EVENTS + 32 perform-gestures + 64 fingerprint-gestures). The filter-key-events bit is present; consume was never the problem — injection was.
- **`persist.adb.tcp.port` / self-healing wireless ADB is out.** Network adb does not survive a reboot on this hardware (confirmed by the astrion-custom repo for the same HA100), and enabling adb-over-tcp needs root or a shell (Wirebug confirms root is required to write the tcp port and restart adbd). A boot-launched APK therefore has NO privileged foothold — the catch-22 that killed the "APK enables wireless adb then runs start.sh" idea.
- **A tiny APK cannot turn wireless debugging on.** Same reason: `service.adb.tcp.port` is writable only by root/shell; `WRITE_SECURE_SETTINGS` does not reach it. Key Mapper only appears to enable wireless adb because its shell action runs THROUGH the live bridge — with the bridge down that action is dead too.
- **kmfix (accessibility unbind/rebind) was built but was not the cure.** `tools/km-fix` bounces `enabled_accessibility_services`; it did not revive injection because injection (not the accessibility bind) was the dead function. Kept in the repo; not the answer here.
- **The Android-11 "auto-switch keyboard when typing" option does not exist on 8.1** — it requires Android 11. That is why the invisible basic KM IME left us with no keyboard, and why the GUI Keyboard (a visible IME) is the 8.1 answer rather than auto-switch.

## The old-remote divergence

Old Astrion, byte-identical Key Mapper + mappings, reboots clean every time — and it has had the **Key Mapper Input Method enabled all along**. The reconciliation that fits every fact: the old remote has been injecting through the IME path (reboot-proof) the whole time, while the new remote's setup put it on Expert Mode (bridge, dies). The remaining hard difference between the units is the firmware revision the new one updated to. Compare `getprop ro.build.display.id` on both if it ever matters; do not flash firmware to "fix" it (user ruling — the revision difference is real and flashing carries MTK brick risk).

## The alternative architecture we PROVED but did not need (held in reserve)

Before the IME path landed, we proved a completely different, injection-free channel end to end, and it is worth keeping for the display-less-remote / `harmonium.press` future (beta-gaps §6.7):

- Fully Kiosk's REST API (`http://<ip>:2323/?cmd=loadUrl&url=javascript:...&password=…`) executes JS in the engine's webview. Verified: `flashBar('BRIDGE OK','on')` showed, and `act('vol_up',true)` fired a real Harmonium volume-up.
- So a hardware key could reach Harmonium with NO keycode injection at all: Key Mapper action → (something that hits Fully's REST) → JS → the engine's own `act()` / a stable `window.hkey(name)` hook.
- The blocker for making THIS the everyday path: Fully has no intent interface (REST only) and Key Mapper has no native HTTP action, so it would need a tiny INTERNET-only helper APK to make the localhost REST call. We did not build it because the IME path solved the problem with zero new code.
- Value retained: this is the real mechanism behind `harmonium.press` — HA/engine-side key resolution that works on ANY remote regardless of injection backend. If we ever want hardware keys to be truly backend-independent (or to support remotes with no working IME injection), add `window.hkey()` to the engine and the INTERNET helper, and this is the design.

## Reference facts gathered on the way

- Key Mapper GUI Keyboard component: `io.github.sds100.keymapper.inputmethod.latin/.LatinIME`. Basic (invisible) KM IME: `io.github.sds100.keymapper/.system.inputmethod.KeyMapperImeService`. AOSP: `com.android.inputmethod.latin/.LatinIME`.
- `settings delete secure enabled_accessibility_services` clears it (Android 8's `settings put ... ""` errors "bad arguments").
- Recovery ritual while debugging (no USB, case shut): the color keys' launch/shell actions survive reboot, so Key Mapper can be brought up (Yellow) and its wireless-ADB-ON action run BY HAND from the app — but only works once the bridge is alive; from cold boot the only privileged on-ramp is USB. This is why the case should not be sealed until the config is proven.
