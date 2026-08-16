@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM push-keymapper.bat [ip] [zip]
REM
REM Provisions a NEW remote with the saved key wiring: pushes the
REM newest backed-up KeyMapper zip from the repo onto the device
REM and opens KeyMapper for the two-tap finish (Restore > pick the
REM file from Downloads).
REM
REM USB (the normal case - remote plugged in):
REM   push-keymapper.bat                 (newest zip under remotes\keymapper)
REM   push-keymapper.bat remotes\keymapper\astrion\key_mapper.zip
REM Over the network (only if you use ADB-over-wifi):
REM   push-keymapper.bat 10.0.0.23
REM ============================================================

set "ADB=%~dp0tools\adb\adb.exe"
if exist "%ADB%" goto :adbok
set ADB=adb
where adb >nul 2>&1 && goto :adbok
echo adb.exe is missing. Copy adb.exe, AdbWinApi.dll and
echo AdbWinUsbApi.dll into tools\adb\ (any scrcpy or
echo platform-tools folder has them), then rerun.
exit /b 1
:adbok

REM an arg with a dot and no .zip = an IP; otherwise it's the zip path.
REM (empty arg must skip the tests - see pull-keymapper.bat)
set SER=
set ZIP=%~1
if "%~1"=="" goto :noip
echo %~1| findstr /i "\.zip" >nul
if not errorlevel 1 goto :noip
echo %~1| findstr "\." >nul
if errorlevel 1 goto :noip
set ZIP=%~2
"%ADB%" connect %~1:5555
set SER=-s %~1:5555
:noip
if "%ZIP%"=="" (
  for /f "delims=" %%f in ('dir /b /s /o-d "%~dp0remotes\keymapper\*.zip" 2^>nul') do (
    if not defined ZIP set ZIP=%%f
  )
)
if not defined ZIP (
  echo no backup zip found under remotes\keymapper\ - run pull-keymapper.bat first.
  exit /b 1
)

"%ADB%" %SER% get-state >nul 2>&1
if errorlevel 1 (
  echo.
  echo no device answering. Plug the remote in over USB - check
  echo "adb devices" shows it and the on-device ADB prompt was
  echo approved - or pass its IP if you use ADB-over-wifi.
  exit /b 1
)

echo == pushing "%ZIP%"
for %%f in ("%ZIP%") do set BASE=%%~nxf
"%ADB%" %SER% push "%ZIP%" "/sdcard/Download/!BASE!" || exit /b 1
REM verify it landed (same temp-file trick as the pull - `for /f`
REM chokes on the quoted adb path)
"%ADB%" %SER% shell ls /sdcard/Download 2>nul > "%TEMP%\km_push.txt"
findstr /i /c:"!BASE!" "%TEMP%\km_push.txt" >nul || (
  echo push did not land on the device - check the cable and rerun.
  exit /b 1
)
echo == on the device: !BASE! is in Downloads.
echo == opening KeyMapper - finish there:
echo    ... menu ^> Restore ^> pick !BASE! from Downloads
"%ADB%" %SER% shell monkey -p io.github.sds100.keymapper -c android.intent.category.LAUNCHER 1 >nul 2>&1
echo done.
