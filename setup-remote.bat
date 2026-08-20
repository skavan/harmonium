@echo off
setlocal
REM ============================================================
REM setup-remote.bat [ip]
REM
REM One-time Android prep for a remote (Astrion HA100 and kin),
REM run BEFORE provisioning keys with push-keymapper.bat.
REM
REM What it sets, and why:
REM   1. accelerometer_rotation 0  - the Astrion's accelerometer
REM      otherwise flips the kiosk when the remote is picked up
REM   2. user_rotation 0           - and the display stays pinned
REM      to standard portrait (0 degrees)
REM
REM NOT in this script on purpose: making Fully the device's home
REM launcher (a real battery win - the stock app holds a wake lock
REM that blocks deep sleep). The stock launcher's component name
REM varies BY FIRMWARE, so the safe procedure records your unit's
REM current home before switching - a judgment step that belongs
REM in your hands, not a script's. The two-command recipe (and a
REM do-not-brick warning) is in docs/cookbook/hardware-keys.md,
REM section "The stock app's wake lock".
REM
REM USB (the normal case - remote plugged in):
REM   setup-remote.bat
REM Over the network (only if you use ADB-over-wifi):
REM   setup-remote.bat 10.0.0.23
REM ============================================================

REM adb ships IN the repo (tools\adb) so a fresh clone just works;
REM a system adb on PATH is the fallback.
set "ADB=%~dp0tools\adb\adb.exe"
if exist "%ADB%" goto :adbok
set ADB=adb
where adb >nul 2>&1 && goto :adbok
echo adb.exe is missing. Copy adb.exe, AdbWinApi.dll and
echo AdbWinUsbApi.dll into tools\adb\ (any scrcpy or
echo platform-tools folder has them), then rerun.
exit /b 1
:adbok

set SER=
if "%~1"=="" goto :nodev
"%ADB%" connect %~1:5555
set SER=-s %~1:5555
:nodev

"%ADB%" %SER% get-state >nul 2>&1
if errorlevel 1 (
  echo.
  echo no device answering. Plug the remote in over USB - check
  echo "adb devices" shows it and the on-device ADB prompt was
  echo approved - or pass its IP if you use ADB-over-wifi.
  exit /b 1
)

echo == locking display rotation to portrait
"%ADB%" %SER% shell settings put system accelerometer_rotation 0
"%ADB%" %SER% shell settings put system user_rotation 0
echo    accelerometer_rotation is now:
"%ADB%" %SER% shell settings get system accelerometer_rotation
echo    user_rotation is now:
"%ADB%" %SER% shell settings get system user_rotation

echo.
echo done. Next steps for a fresh remote: push-keymapper.bat for
echo the key wiring, then docs\GETTING-STARTED.md section 5 for
echo Fully Kiosk (autostart + battery optimization off). Worth
echo reading while you're here: the wake-lock/launcher battery
echo tweak in docs\cookbook\hardware-keys.md (manual, two
echo commands - see why in the header of this script).
