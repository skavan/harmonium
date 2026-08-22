# Harmonium IME Fix

Harmonium IME Fix is a one-shot Android helper for the Fully Kiosk and KeyMapper
startup race on the Astrion Android 12 remote.

At boot, KeyMapper can initialize before Fully Kiosk is ready. KeyMapper remains
selected as the input method, but its key mappings do not work. Manually changing
the input method to LatinIME and back to KeyMapper repairs the mappings:

```bat
adb shell ime set com.android.inputmethod.latin/.LatinIME & adb shell ime set io.github.sds100.keymapper/.system.inputmethod.KeyMapperImeService
```

This APK performs the equivalent reset automatically after Fully starts, then
stops its service and kills its own process.

## Proven Device

- Android release: 12
- Android API level: 31
- Latin IME: `com.android.inputmethod.latin/.LatinIME`
- KeyMapper IME: `io.github.sds100.keymapper/.system.inputmethod.KeyMapperImeService`
- APK package: `com.skavan.imefix`
- Logcat tag: `HarmoniumImeFix`

## Runtime Sequence

1. Fully Kiosk launches `com.skavan.imefix` using its **Application to Run on
	 Start in Foreground (PLUS)** setting.
2. The APK's translucent launcher activity starts the short-lived worker service.
3. The launcher activity immediately calls `finishAndRemoveTask()`.
4. The service waits 5 seconds for Fully and KeyMapper startup to settle.
5. It selects Android LatinIME through `Settings.Secure.DEFAULT_INPUT_METHOD`.
6. It waits 500 milliseconds.
7. It selects KeyMapper's IME through the same secure setting.
8. It stops the service and calls `Process.killProcess(Process.myPid())`.

There is no persistent service, notification, activity, or helper process after
the sequence finishes. KeyMapper's IME remains active, while Fully Kiosk is the
visible application.

## Fully Kiosk Configuration

Open Fully Kiosk settings and set **Application to Run on Start in Foreground
(PLUS)** to:

```text
com.skavan.imefix
```

The foreground option is intentional. On the tested device, Fully's background
startup list did not reliably launch the helper. Although Fully calls this package
in the foreground, its activity is translucent and closes immediately.

## Project Locations

All source and build support files live under:

```text
tools\ime-fix\
```

Important files:

| Location | Purpose |
| --- | --- |
| `tools\ime-fix\README.md` | This canonical setup and operations guide |
| `tools\ime-fix\build-apk.bat` | Windows build entry point; locates the standard local Android SDK |
| `tools\ime-fix\gradlew.bat` | Reproducible Windows Gradle wrapper |
| `tools\ime-fix\gradlew` | Gradle wrapper for Unix-like systems |
| `tools\ime-fix\gradle\wrapper\` | Pinned Gradle 7.6.4 wrapper configuration and bootstrap JAR |
| `tools\ime-fix\settings.gradle` | Gradle project and repository configuration |
| `tools\ime-fix\build.gradle` | Pins Android Gradle Plugin 7.4.2 |
| `tools\ime-fix\gradle.properties` | Gradle JVM and Android build settings |
| `tools\ime-fix\app\build.gradle` | Package, version, and Android SDK levels |
| `tools\ime-fix\app\src\main\AndroidManifest.xml` | Permission, launcher activity, and worker service declarations |
| `tools\ime-fix\app\src\main\java\com\skavan\imefix\LaunchActivity.java` | Invisible entry point launched by Fully |
| `tools\ime-fix\app\src\main\java\com\skavan\imefix\ImeFixService.java` | Delay, two-step IME reset, logging, shutdown, and process exit |
| `tools\ime-fix\app\build\outputs\apk\debug\app-debug.apk` | Generated installable APK |

Generated `.gradle` and `build` directories are ignored by the repository's root
`.gitignore`. Rebuild the APK after cloning because the generated APK is not
tracked by Git.

## Build Requirements

- Windows
- Java 16 or another version compatible with Gradle 7.6.4 and AGP 7.4.2
- Android SDK Platform 31
- Android SDK under `%LOCALAPPDATA%\Android\Sdk`, or `ANDROID_HOME` set to its
	actual location

From Windows Command Prompt:

```bat
cd /d "G:\Documents\Code 2025\repos\HA-2026\harmonium\tools\ime-fix" & build-apk.bat
```

Successful output is written to:

```text
G:\Documents\Code 2025\repos\HA-2026\harmonium\tools\ime-fix\app\build\outputs\apk\debug\app-debug.apk
```

## Install and Authorize

The APK requires `WRITE_SECURE_SETTINGS`. Android does not grant this permission
through its normal application UI, so grant it once over ADB after installation.

From the APK project directory in Windows Command Prompt:

```bat
adb install -r app\build\outputs\apk\debug\app-debug.apk & adb shell pm grant com.skavan.imefix android.permission.WRITE_SECURE_SETTINGS
```

The permission normally survives reboots and `adb install -r` upgrades. Grant it
again after uninstalling and reinstalling the package or clearing its permissions.

## Manual Test

Launch the package exactly as an ordinary launcher would, wait for the 5.5-second
sequence, and read the selected IME:

```bat
adb shell am force-stop com.skavan.imefix & adb shell monkey -p com.skavan.imefix 1 & timeout /t 7 /nobreak & adb shell settings get secure default_input_method
```

Expected final value:

```text
io.github.sds100.keymapper/.system.inputmethod.KeyMapperImeService
```

Confirm that the helper process has exited:

```bat
adb shell pidof com.skavan.imefix
```

The expected result is blank output.

## Logs

Clear old logs, launch the APK, wait, and display only its records:

```bat
adb logcat -c & adb shell monkey -p com.skavan.imefix 1 & timeout /t 7 /nobreak & adb logcat -d -s HarmoniumImeFix:I *:S
```

A successful run contains messages equivalent to:

```text
Started; waiting for Fully Kiosk to settle
Selected com.android.inputmethod.latin/.LatinIME; changed=true
Selected io.github.sds100.keymapper/.system.inputmethod.KeyMapperImeService; changed=true
Finished; exiting process
```

## Troubleshooting

### Fully does not launch the helper

Use **Application to Run on Start in Foreground (PLUS)**, not the background
startup list. Confirm that the exact package name is `com.skavan.imefix`.

### Permission error in logcat

Run:

```bat
adb shell pm grant com.skavan.imefix android.permission.WRITE_SECURE_SETTINGS
```

### Final IME is not KeyMapper

Confirm both installed IME component names:

```bat
adb shell ime list -s
```

The expected output is:

```text
com.android.inputmethod.latin/.LatinIME
io.github.sds100.keymapper/.system.inputmethod.KeyMapperImeService
```

### Mapping still fails after boot

Run the manual test and then test the mapped keys. If the manual run fixes the
problem but boot does not, increase `STARTUP_DELAY_MS` in `ImeFixService.java`,
rebuild, and reinstall. The tested value is 5000 milliseconds.

## Verified Result

The APK was built and tested on the connected Android 12 device. Both secure
setting writes returned `true`, the final selected IME was KeyMapper, and
`pidof com.skavan.imefix` returned no process after completion.