# Astrion Remote (v2 setup): KISS Launcher, Key Mapper via IME, Wireless ADB and scrcpy

This guide turns an Astrion HA100 into a flexible Home Assistant remote while keeping the lightweight stock experience available on demand. It installs Fully Kiosk before Key Mapper, uses KISS Launcher as the Home app, drives the hardware keys through **Key Mapper's input-method (IME) path** — which is reboot-proof on this hardware where Expert Mode is not — and adds separate, audio-confirmed controls for enabling and disabling wireless ADB.

Once wireless ADB is enabled, the internal USB-C cable can be removed, the rear cover reinstalled, and the remote can sit in its charging cradle. It can then be managed with ordinary ADB or viewed and controlled from Windows with scrcpy.

> **Read this if you are debugging keys that die after a reboot:** the full investigation, root cause, dead ends, and the reasoning behind the IME choice live in `key-input-findings.md` beside this file. The short version: on this remote Key Mapper's **Expert Mode** does not survive a reboot (its shell bridge cannot be recreated at boot); the **IME path** does. This guide uses the IME path deliberately.

## Credits

Builds on Brad Sanders' [Astrion Remote for Home Assistant guide](https://community.home-assistant.io/t/astrion-remote-for-home-assistant-sideloading-fully-kiosk-button-remapping-guide/1008570). Follow its general preparation through the initial ADB and sideloading stages. The workflow here deliberately differs at the Key Mapper stage: **use the IME method with the Key Mapper GUI Keyboard, not Expert Mode.**

## Tested software

- Astrion HA100 running Android 8.1
- Fully Kiosk Browser 1.60.1
- Key Mapper `keymapper-4.0.5-foss.apk`
- **Key Mapper GUI Keyboard 1.4.6** (`keymapper-gui-keyboard-1.4.6.apk`) — the visible keyboard that lets the KM IME both inject keycodes AND show a layout for typing. Installed via Aurora Store -- although you could just sideload the APK.
- Aurora Store `AuroraStore-4.8.4.apk`
- KISS Launcher by Neamar `3.26.0 (224)`, installed through Aurora
- scrcpy 4.1 on Windows

## Why the IME path (and not Expert Mode)

Key Mapper detects hardware keys via its accessibility service (reboot-proof) but must also **inject** a keycode into Fully's webview for keys the system would otherwise consume (volume, mute, back). Injection needs a backend:

- **Expert Mode** uses a shell-privileged bridge started by `sh /data/user_de/0/io.github.sds100.keymapper/start.sh`. Only an adb shell can create that process, and nothing in normal boot recreates it — so after every reboot the bridge is gone and those keys die until an adb shell runs `start.sh` again. On this hardware there is no way to do that automatically without root (wireless ADB itself does not survive reboot and cannot be enabled without root/shell). **Dead end — do not use Expert Mode here - it worked on an older firmware and Astrion v1 hardware, but it failed on a brand new v2 remote (identical except for firmware version).**
- **The IME path** injects through a Key Mapper input method, which the system starts at boot like any keyboard — reboot-proof. Its only cost is that the default invisible "Key Mapper Basic Input Method" leaves you with no on-screen keyboard, which the **GUI Keyboard** solves.

## The layout: KISS as Home, and the four colour keys

**KISS Launcher is the Home app instead of HARemote — deliberately.** HARemote is a full webview app, and when it is the Home app it never lets the device idle: it holds a partial wake lock that keeps the CPU awake, which drains the battery fast enough to matter on a remote that is meant to live in a cradle. KISS is a tiny, near-empty launcher, so with it as Home the Astrion behaves like an ordinary Android device — it sleeps, wakes, and charges normally. HARemote stays installed and is one tap (or the Red key) away whenever you want the remote UI; it simply is not the thing holding the device awake.

The four coloured keys are the standing navigation, wired into the Key Mapper config (the full key-by-key list, including the decoded wireless-ADB shell commands, is in [`keymapper/v2/astrion-remote-map.md`](keymapper/v2/astrion-remote-map.md)):

- **Red → Fully Kiosk** — the "road home" back to the Harmonium remote UI. Press it from anywhere to return to the controller.
- **Green → KISS Launcher** — the Home launcher / Android home screen.
- **Blue → wireless ADB ON** (long-press → **OFF**) — a short press enables wireless ADB and plays a connected sound; a long press disables it and plays a disconnected sound. See section 15.
- **Yellow → Key Mapper** — the recovery/settings route. Foregrounding Key Mapper re-arms it if the keys ever misbehave.

## Files to prepare on the Windows PC

- Android SDK Platform-Tools (`adb`)
- `Fully-Kiosk-Browser-v1.60.1.apk`
- `keymapper-4.0.5-foss.apk`
- **`keymapper-gui-keyboard-1.4.6.apk`**
- `AuroraStore-4.8.4.apk`
- The Astrion Key Mapper config for the version you're setting up: `keymapper/v2/key_mapper.zip` (IME path, this guide) or `keymapper/v1/key_mapper.zip` (Expert Mode). See `keymapper/README.md`.
- `assets/USBConnect.ogg`, `assets/USBDisconnect.ogg`
- scrcpy, if desktop mirroring/control is wanted

> **Didn't clone the repo?** You can do this whole setup with a handful of files pulled from GitHub. The one file you truly need is **`remotes/astrion/keymapper/v2/key_mapper.zip`** — the Key Mapper mappings, which already **embed the two wireless-ADB sound files**, so you can skip the `.ogg`s unless you build the mappings by hand (section 12). Optional: **`remotes/fully/remote-fully-settings.json`** (import into Fully for the tuned settings), and the `remotes/*.bat` / `*.ps1` scripts if you want the resolver-based pull/push. The APKs and scrcpy listed above are external downloads, not in the repo.

## 1. Out-of-box setup

1. Connect the remote to Wi-Fi.
2. Connect HARemote to Home Assistant with a long-lived access token (treat it like a password).
3. Install any firmware update offered. (Note: the firmware revision matters — see `key-input-findings.md`. On an updated unit the IME path below is required; Expert Mode will not persist.)

## 2. Enable Developer Mode

Swipe down → Set → System Settings → System → About phone → tap **Build number** seven times → back to Developer options → enable **USB debugging**.

## 3. Access USB-C and authorize the PC

The USB-C port is inside the remote (under a removable strip; two screws at the bottom on some units). Connect to the PC, run `adb devices`, accept the authorization prompt on the remote (if asked, I wasn't), and confirm the state is `device`. **Do not reinstall the cover until the reboot test in step 14 passes** — from a cold boot, USB is the only privileged way back in.

## 4. Install Fully Kiosk first

```bat
adb install Fully-Kiosk-Browser-v1.60.1.apk
```

Do not make Fully the Home app.

## 5. Install Key Mapper (do not configure yet)

```bat
adb install keymapper-4.0.5-foss.apk
```

## 6. Install the Key Mapper GUI Keyboard

This is the visible keyboard that lets the Key Mapper IME both inject keycodes and show a layout for typing. You can install it from **Aurora Store** in step 7 (this is what the tested unit did — search Aurora for "Key Mapper GUI Keyboard"), or sideload it now:

```bat
adb install keymapper-gui-keyboard-1.4.6.apk
```

## 7. Install Aurora Store and KISS Launcher

```bat
adb install AuroraStore-4.8.4.apk
adb shell monkey -p com.aurora.store -c android.intent.category.LAUNCHER 1
```

Complete Aurora setup, open it once to grant all permissions, set it to anonymous mode.  
Then, from inside Aurora, search for and install **KISS Launcher** by **Neamar** (`3.26.0`), open it once to grant all permissions.  
Or download the apk and `adb install fr.neamar.kiss_224.apk`

## 8. Then goto System Settings>Apps&Notification>Advanced>Default Apps>

Set **KISS** as the Home app (replacing HARemote). See "The layout" above for why KISS — not HARemote — is the Home app. If you did not sideload the **Key Mapper GUI Keyboard** in step 6, install it from Aurora now as well.

## 9. Reserve an IP for the remote and note its serial

`adb shell ip link show wlan0` → note the `link/ether` MAC → make a DHCP reservation. `adb shell ip -f inet addr show wlan0` to get the devices IP Address. Substitute that address everywhere this guide uses `<remote-ip>`.  
Run `adb shell getprop ro.serialno` and record the serial somewhere safe — it is the stable id that routes this remote in units.json, and it matters once you have more than one remote (see "Managing the remote" below). **Lock the display to portrait, remote-wide** (do this on USB — it's the same thing `remotes/setup-remote.ps1` does): the Astrion's accelerometer otherwise flips the kiosk when the remote is picked up.

```bat
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
```

Verify: `adb shell settings get system user_rotation` → `0`. (`user_rotation` is 0/1/2/3 = 0°/90°/180°/270°; `0` is portrait on the HA100. `accelerometer_rotation 0` turns auto-rotate off so it stays put.)

Since you are still plugged into USB, you might as well reboot the remote.

## 10. Prepare Key Mapper — the IME path

1. Launch Key Mapper from KISS. Enable the **Accessibility Service**; disable battery optimization and allow run in background.
2. Grant the two permissions the mappings need, over ADB:
  ```bat
   adb shell pm grant io.github.sds100.keymapper android.permission.WRITE_SECURE_SETTINGS
   adb shell cmd notification allow_dnd io.github.sds100.keymapper
  ```
   (The DND grant is required specifically for the volume/mute mappings, same as the RS90.)
3. Key Mapper → Settings → **Key event actions → "Key Mapper input method"** (NOT Expert Mode).
4. Enable the Key Mapper input methods, then set the default over ADB. This HA100 build has **no "Default keyboard" picker in Settings**, so ADB is the way. In **Manage keyboards** you will see several IMEs — set them to match a working remote:
  - **Key Mapper GUI Keyboard** — **ON**. This is the one you make the default: it both injects the remapped keycodes AND shows a keyboard for typing.
  - **Key Mapper Input Method** — **ON** (the basic KM IME; leave it enabled, as the working unit has it).
  - **Android Keyboard (AOSP)** — leave **ON** as a plain-typing fallback.
  - Anything else (e.g. Japanese IME) — off; it does not matter.  
   Enabling is just the toggles above; **making one the default** is separate, and on this build only ADB does it (with the status bar off, the on-screen IME switcher usually will not appear either). The **second** line is the "make default" step:
  ```bat
   adb shell ime enable io.github.sds100.keymapper.inputmethod.latin/.LatinIME
   adb shell ime set    io.github.sds100.keymapper.inputmethod.latin/.LatinIME
  ```
   Confirm it took: `adb shell settings get secure default_input_method` → `io.github.sds100.keymapper.inputmethod.latin/.LatinIME`.
5. Force Android 8 to show the on-screen keyboard even with the IME "physical keyboard" active:
  ```bat
   adb shell settings put secure show_ime_with_hard_keyboard 1
  ```

## 11. Import the Harmonium mappings (recommended)

**Push the backup to the remote, then restore it in Key Mapper.** Over USB you do **not** need `units.json` yet — it is only for addressing a remote by name over **wireless** later (see "Managing the remote"). Push it either way:

- **With the scripts:** `remotes\push-keymapper.bat -Type astrion -Keymap v2` (uses the connected remote).
- **Raw adb** (no clone, no scripts): `adb push key_mapper.zip /sdcard/Download/` — point it at wherever you saved `remotes/astrion/keymapper/v2/key_mapper.zip`.

Then on the remote, launch Keymapper (via KISS or adb xxx), then **→ menu (⋮) → Import **→ pick `key_mapper.zip` from Downloads. Confirm the mappings are enabled. The mappings keep their normal "Input KEYCODE" actions — the IME path is what makes those actions work and persist. For exactly what every key does, see the generated map `keymapper/v2/astrion-remote-map.md`.

The v2 backup **embeds its two sound files** (`USBConnect.ogg`, `USBDisconnect.ogg`), so importing it brings the complete configuration in one step: the four colour-key actions, the volume/mute/back injections, AND the wireless-ADB ON/OFF controls with their confirmation sounds already attached. If you import, you are done here — skip section 12 (building by hand). (Keeping the sounds inside the backup is the whole point: there is no separate copy step.)

## 12. Building the mappings by hand (only if you are not importing)

Skip this entirely if you imported in section 11. Do this only if you are constructing the configuration from scratch — and the sound files below matter only if you want the audible wireless-ADB confirmation (that is, only if you want wireless ADB at all; see section 15 for what it is for).

First copy the two OGGs onto the device:

```bat
adb push assets\USBConnect.ogg /sdcard/Download/USBConnect.ogg
adb push assets\USBDisconnect.ogg /sdcard/Download/USBDisconnect.ogg
```

Then wire the two wireless-ADB controls in Key Mapper, each as a shell action **plus** a Play sound action pointing at the OGG you just pushed:

- **Blue key (F10)** → shell action, then Play sound `USBConnect.ogg`:
  ```
  sh -c 'if [ "$(getprop service.adb.tcp.port)" != "5555" ]; then setprop service.adb.tcp.port 5555; setprop ctl.restart adbd; fi'
  ```
- **Long-press Blue (F11)** → shell action, then Play sound `USBDisconnect.ogg`:
  ```
  sh -c 'if [ "$(getprop service.adb.tcp.port)" = "5555" ]; then setprop service.adb.tcp.port -1; setprop ctl.restart adbd; fi'
  ```

(These are launch/shell actions and are independent of the keycode-injection path.)

## 13. Configure Fully Kiosk

Fully is already installed (step 4); now license and configure it — do this before the reboot test. Most of it is far easier from your PC once Remote Administration is on, so the shape is: turn remote admin on at the device, then finish everything from the `:2323` web admin.

**First, give yourself a Start URL to point at.** In Harmonium (the Studio), create at least a basic room page for this remote — an empty one is fine; you just need a page so its URL exists. You paste that URL into Fully at the end.

**Launch Fully** from **KISS** (with your mappings loaded, tap **Green** for KISS and **Red** for Fully), or over ADB:

```bat
adb shell monkey -p de.ozerov.fully -c android.intent.category.LAUNCHER 1
```

**Initial permissions:**

1. Confirm the permissions Fully requests.
2. On the Quick Start Settings screen, click **Start Using Fully**.
3. Swipe from the left edge for the Fully menu / settings.

**Register a Fully Plus license.** One-time ~$10 per device; it unlocks the features this build relies on — **Remote Administration**, **Start on Boot**, and the battery/reload the Home Assistant integration uses. In Fully: menu → **Get the PLUS version** (or buy at [fully-kiosk.com](http://fully-kiosk.com) with the Device ID in hand, then enter the key). Remote admin and autostart are unavailable without it.

**Enable Remote Administration** — Settings → **Remote Administration**:

1. **Enable** it.
2. Set a **Remote Admin Password** (needed for the `:2323` web admin and the Home Assistant Fully integration).
3. Note the address it shows: **`http://<remote-ip>:2323`**.
4. Grant every Android permission Fully asks for — it prompts for these and re-prompts if any is revoked: **Display over other apps**, **Usage access**, **Modify system settings**, **Install unknown apps**.

**Now get out of the on-device settings and finish from the PC.** While Fully is the foreground app, Key Mapper remaps the Back key (Back → `[`), so you cannot back out of Fully's own settings screens with the remote. Do **not** fight it, and do **not** `am force-stop` Key Mapper — force-stopping disables its accessibility service, which then stays off (even across a reboot) until you re-enable it. Just reboot:

1. `adb reboot`. The remote comes up on **KISS**, Key Mapper intact.
2. Launch Fully again from KISS (**Red**), or `adb shell monkey -p de.ozerov.fully 1`. It opens on its welcome page — you set the real Start URL from the web admin next.
3. If prompted for more permissions - grant them all!

**Finish the Fully config from your PC's browser at `http://<remote-ip>:2323**` (log in with the admin password) — much easier than the device:

1. **Import the tuned settings in one shot:** **Send Command to Device → Upload & Import Settings File →** upload `remotes/fully/remote-fully-settings.json`. It applies every doctrine setting and, because it omits the three device fields, leaves your Start URL / kiosk PIN / admin password untouched. (Alternative — set the four that matter most by hand: **Start on Boot** ON; **Screen Off Timeout** 300 s with **Keep Screen On**; **Disable Status Bar** ON; **Disable Volume Buttons** ON. The full doctrine list is in `remotes/fully/README.md`.)
2. **Set the Start URL:** in the web admin, open the menu (☰) → **Settings → Web Content Settings → Start URL** → paste this remote's Harmonium page:
  ```
   http://<ha-host>:8123/local/harmonium/main/index.html#page=<page>&device=<device-profile>
  ```
   `#device=` picks the remote profile the engine uses (e.g. `astrion`); `#page=` is the page it opens on (e.g. `porch`). The engine stores both and strips them from the URL. Substitute your HA host/IP for `<ha-host>`, then save.
3. **Load it:** **Send Command to Device → Load Start URL** (or **Restart Fully App**). Fully leaves its welcome page and loads Harmonium. The first load shows Harmonium's **pairing screen** — approve the pairing in Harmonium to connect the remote to Home Assistant.

**Reboot once more** (`adb reboot`) to bring Key Mapper back, and confirm the remote boots straight into Harmonium. Then continue to the reboot test.

## 14. THE reboot test (do before sealing the case)

```bat
adb reboot
```

Let it boot fully into Fully, touch nothing, then check:

1. **Volume, Mute, Back drive Harmonium** immediately (injection survived the reboot).
2. **Tap a text field → the GUI keyboard appears** (typing survived).
3. `adb shell settings get secure default_input_method` still reads `io.github.sds100.keymapper.inputmethod.latin/.LatinIME`.

Run it 2-3 times. If all reboots are clean, the IME path is solid — move on to wireless ADB and the final checks (section 15) before you seal the case. If a reboot ever comes up with keys dead, that is a residual boot-arming race — see the "imefix v2" note in `key-input-findings.md` (a Fully-launched boot helper that re-selects the GUI keyboard IME; a SEPARATE helper from the RS90's imefix).

## 15. Wireless ADB, final checks, and sealing the case

Wireless ADB is how you manage and mirror the remote once the USB-C cable is gone and the cover is back on. The provided Key Mapper config wires it to the Blue key: **a short press on Blue turns wireless ADB ON** (and plays the connected sound), and **a long-press on Blue turns it OFF** (and plays the disconnected sound). So a single tap of Blue should give you a familiar "connected" chime.

**Disconnect the USB-C cable before you test, or the test proves nothing** — with USB still attached you cannot tell whether the wireless path is actually the thing working.

1. Unplug USB-C.
2. Press **Blue** once. You should hear the connected sound.
3. From the PC: `adb connect <remote-ip>:5555`, then `adb -s <remote-ip>:5555 get-state` → `device`.

Then confirm it is genuinely settled:

- **Reboot the remote a couple of times.** Wireless ADB does not survive a reboot by design (the port setting clears at boot), so after each reboot press **Blue** again and confirm you hear the sound and can reconnect. Two or three clean cycles means the toggle is reliable.
- **Test Volume Up and Volume Down on a Harmonium page** — they should change the volume through the remote UI. This exercises the IME injection path in real use, not just at the login screen.
- **Confirm a keyboard appears when you tap a system-provided search or entry box** — for example a search field in Android Settings or in KISS. Harmonium's own screens provide their own on-screen entry, so test against a *system* text box, not a Harmonium one.

Once you are comfortable it is settled and working: **reinstall the rear cover, seat the remote in its charging cradle, and confirm it charges.** After this the cable and case are back to stock and the remote is managed entirely over wireless ADB (and scrcpy, below).

## Managing the remote: units.json and pull-keymapper

After setup, the remote is driven from the `remotes/` scripts rather than by hand-typing ADB addresses. They share one resolver that finds a remote over USB or wireless, so no LAN address is hardcoded — and none is committed to the repo.

**units.json** is your private registry of remotes. Copy `remotes/units.example.json` to `remotes/units.json` (gitignored, so your LAN details stay out of the repo) and list each remote:

- `name` — a label you choose; it is what the picker shows.
- `type` — `astrion` or `rs90`; the folder under `remotes/`.
- `keymap` — the Key Mapper config version, `v1` or `v2`; the folder under `remotes/<type>/keymapper/`. Changing this and re-pushing IS the upgrade — a choice, never forced.
- `serial` — the device's `ro.serialno`, its stable hardware id. This is what routes a connected remote to its entry: reliable over USB or wireless, and it never changes, unlike an IP. Get it from `remotes\device-facts.bat`, or `adb devices`.
- `ip` + `port` — for wireless ADB (omit for USB-only).

With units.json in place, `push-keymapper`, `pull-keymapper`, `device-facts`, and `remotes\scrcpy.bat` all accept a remote by name, IP, or serial — or show a picker — and route to the right device automatically.

**pull-keymapper** grabs the current Key Mapper backup off a remote into `remotes/<type>/keymapper/<keymap>/`. It never overwrites: if a `key_mapper.zip` is already there it is timestamp-archived first (`key_mapper.YYYY-MM-DD_HHMM.zip`). After pulling it prints a neutral contents summary (map count + embedded sound count) so you can confirm you grabbed the config you expected, and offers to regenerate the map docs (`<keymap>/astrion-remote-map.md` and `KeyCodes Astrion.xlsx`).

One-time on the device first (Key Mapper has no headless export): Key Mapper → Settings → **Change automatic backup location** → save the `.zip` into Download. From then on Key Mapper rewrites that backup on every change, so the device copy is always current.

**push-keymapper** does the reverse — it pushes the repo's `key_mapper.zip` for the chosen version onto the remote's Download folder, ready to import in Key Mapper (section 11).

## Desktop mirroring with scrcpy

[scrcpy](https://github.com/Genymobile/scrcpy) is a free, open-source tool that mirrors and controls an Android device from a desktop over ADB — handy for driving the Astrion from the PC once the cover is on and there is no other screen. Download a release from its GitHub page and unzip it; the tested setup keeps it at `D:\Program Files\Android\scrcpy-win64-v4.1`.

The shared helper calls `scrcpy` by name, so **the scrcpy folder must be on your Windows PATH** — add `D:\Program Files\Android\scrcpy-win64-v4.1` (or wherever you unzipped it) to the PATH environment variable.

Run `remotes\scrcpy.bat` and choose the remote through the same picker as the pull/push tools. It handles either the one connected USB device or wireless ADB (a `units.json` name, an IP, or the remembered last), so there is no hardcoded address. Wireless ADB must be on first (press **Blue**). Pass `-Target <name|ip|serial>` to skip the picker.

## Recovery notes

- Key Mapper shows **"1 warning — accessibility service needs to be turned on"** (all mappings dead): this is what happens if Key Mapper was `am force-stop`ed — Android disables a force-stopped app's accessibility service and it stays off through reboots. Tap **Fix** in Key Mapper (or Settings → Accessibility → Key Mapper) to re-enable it.
- Keys dead after a reboot: this should not happen on the IME path once step 14 is clean. If it does, foregrounding Key Mapper once (Yellow) arms it; the durable fix is the imefix-v2 helper.
- No keyboard on a text box: `default_input_method` has probably reverted to the basic KM IME — re-run the `ime set` for the GUI keyboard (step 10.4) and confirm `show_ime_with_hard_keyboard` is 1.
- The four colour keys are the recovery routes too: **Yellow** foregrounds Key Mapper (arms it if keys misbehave), **Green** returns to KISS, **Red** launches Fully, **Blue** toggles wireless ADB. See "The layout" above.
- Keep the Key Mapper backup and the manual mapping notes accessible before experimenting.

## Included / referenced files

- `README.md` — this guide
- `key-input-findings.md` — the full investigation and the reasoning behind the IME path
- `keymapper/v1/`, `keymapper/v2/` — the two Key Mapper config versions (see `keymapper/README.md`); each has a generated [`astrion-remote-map.md`](keymapper/v2/astrion-remote-map.md) + `KeyCodes Astrion.xlsx` (the full key map)
- `remotes\scrcpy.bat`, `assets/USBConnect.ogg`, `assets/USBDisconnect.ogg`
