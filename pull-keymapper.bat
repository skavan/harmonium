@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM pull-keymapper.bat [name-or-ip] [name]
REM
REM Grabs KeyMapper backups off a remote into the repo, so the
REM key wiring travels with the code instead of living only on
REM one Astrion.
REM
REM USB (the normal case - remote plugged in):
REM   pull-keymapper.bat              -> remotes\keymapper\astrion\
REM   pull-keymapper.bat porch        -> remotes\keymapper\porch\
REM Over the network (only if you use ADB-over-wifi):
REM   pull-keymapper.bat 10.0.0.23 porch
REM
REM ONE-TIME on the device first (KeyMapper has no headless
REM export intent): KeyMapper > Settings > "Change automatic
REM backup location" > Change > save key_mapper.zip into the
REM Download folder. From then on KeyMapper rewrites that backup
REM on every mapping change, so the device copy is always
REM current and this script needs no manual export at all.
REM ("Export all" is a dead end on the Astrion: its share sheet
REM offers no save-to-files target, so it jumps straight to the
REM Bluetooth picker.)
REM
REM The save dialog suffixes "(2)"/"(3)" instead of overwriting
REM (deleting from within it is not possible), so this script
REM pulls only the NEWEST match, saved locally under the stable
REM name key_mapper.zip - suffixed names never enter the repo;
REM git is the version history. Device-side copies are left
REM alone; tidy them with the remote's File Manager if the
REM pileup bothers you.
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

REM first arg with a dot = an IP (network mode); otherwise it's the name.
REM (empty arg must skip the test: bare `echo %%~1` prints "ECHO is
REM on." - which CONTAINS A DOT and sent us hunting a blank :5555)
set SER=
set NAME=%~1
if "%~1"=="" goto :noip
echo %~1| findstr "\." >nul
if errorlevel 1 goto :noip
set NAME=%~2
"%ADB%" connect %~1:5555
set SER=-s %~1:5555
:noip
if "%NAME%"=="" set NAME=astrion

"%ADB%" %SER% get-state >nul 2>&1
if errorlevel 1 (
  echo.
  echo no device answering. Plug the remote in over USB - check
  echo "adb devices" shows it and the on-device ADB prompt was
  echo approved - or pass its IP if you use ADB-over-wifi.
  exit /b 1
)

set OUT=%~dp0remotes\keymapper\%NAME%
if not exist "%OUT%" mkdir "%OUT%"

echo == looking for KeyMapper backup zips in /sdcard/Download
REM list to a temp file - `for /f ('command')` chokes on the quoted
REM adb path - then filter loosely: contains "key" AND ends .zip
REM (his export is key_mapper.zip, underscore and all)
"%ADB%" %SER% shell ls -t /sdcard/Download 2>nul > "%TEMP%\km_ls.txt"
findstr /i "key" "%TEMP%\km_ls.txt" | findstr /i "\.zip" > "%TEMP%\km_hits.txt"
REM ls -t = newest first, so the FIRST hit is the current backup
set NEWEST=
for /f "usebackq delims=" %%f in ("%TEMP%\km_hits.txt") do (
  if "!NEWEST!"=="" set "NEWEST=%%f"
)
if "!NEWEST!"=="" (
  echo    none found. On the remote: KeyMapper ^> Settings ^>
  echo    "Change automatic backup location" ^> Change ^> save
  echo    key_mapper.zip into Download, then rerun this.
  exit /b 1
)
echo    pulling !NEWEST!
"%ADB%" %SER% pull "/sdcard/Download/!NEWEST!" "%OUT%\key_mapper.zip"
if errorlevel 1 (
  echo    pull failed.
  exit /b 1
)
echo == saved as remotes\keymapper\%NAME%\key_mapper.zip - commit it.
echo done.
