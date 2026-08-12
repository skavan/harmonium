@echo off
setlocal EnableExtensions
rem ============================================================
rem  Harmonium -- pull a house's LIVE config into the repo as a
rem  snapshot.  One direction only: HA to repo.
rem
rem    pull-config <house>
rem
rem  Config is authored in the Studio and owned by that house's
rem  Home Assistant. These copies are a BACKUP AND A RECORD --
rem  something to read, diff and restore from by hand if a house
rem  loses its config. Nothing in the push path reads them, which
rem  is the point: a snapshot can never leak into the wrong house.
rem ============================================================

set "REPO=%~dp0"
set "HOUSE=%~1"
if "%HOUSE%"=="" goto :usage
if not exist "%REPO%houses\%HOUSE%.cmd" goto :nohouse
call "%REPO%houses\%HOUSE%.cmd"

if not exist "%DST%configuration.yaml" goto :noshare
set "MARK=%DST%www\harmonium\.house"
if not exist "%MARK%" goto :nomark
set "FOUND="
set /p FOUND=<"%MARK%"
if /I not "%FOUND%"=="%HOUSE_ID%" goto :wronghouse

if not exist "%REPO%houses\%HOUSE_ID%\" mkdir "%REPO%houses\%HOUSE_ID%"
echo.
echo  Snapshotting %HOUSE_NAME% config to houses\%HOUSE_ID%\
robocopy "%DST%www\harmonium" "%REPO%houses\%HOUSE_ID%" config.json config.*.json /NJH /NJS /NDL
if ERRORLEVEL 8 goto :copyfail
echo.
echo  Done. These are a record, not an input -- nothing pushes them back.
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 0

:nohouse
echo.
echo  ERROR: no profile for house "%HOUSE%".
echo  Known houses:
for %%f in ("%REPO%houses\*.cmd") do echo     %%~nf
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1

:noshare
echo.
echo  ERROR: %DST% does not look like a Home Assistant config share.
echo  Expected house: %HOUSE_NAME%  at  %HA_URL%
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1

:nomark
echo.
echo  ERROR: %MARK% missing -- cannot confirm which house this share is.
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1

:wronghouse
echo.
echo  ***  STOP  ***  %DST% says it belongs to "%FOUND%", not "%HOUSE_ID%".
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1

:copyfail
echo.
echo  ERROR: robocopy failed -- read its output above.
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1

:usage
echo.
echo  usage:  pull-config ^<house^>
echo.
echo  Known houses:
for %%f in ("%REPO%houses\*.cmd") do echo     %%~nf
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1
