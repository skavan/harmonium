@echo off
setlocal EnableExtensions
rem ============================================================
rem  Harmonium -- push CODE to a house.  NEVER a config.
rem
rem    push <house> [engine|studio|integration|all|init]
rem
rem  Houses are profiles in houses\*.cmd, so adding a third,
rem  fourth or tenth house is one small file -- nothing here is
rem  hard-coded to any of them.
rem
rem  THE RULE THIS SCRIPT EXISTS TO ENFORCE:
rem    code -- engine, integration, Studio -- lives in the repo
rem    and is the same everywhere;  config -- rooms, activities,
rem    presets -- lives in each house's Home Assistant and is
rem    NEVER pushed from the repo.  That is why no mode of this
rem    script copies config.json.  To take a snapshot of a
rem    house's live config INTO the repo, use pull-config.bat.
rem
rem  STYLE NOTE: error paths are labels, not parenthesised
rem  if-blocks. cmd expands %VARS% when it PARSES a block, so a
rem  value containing a bracket -- a house name, a path -- ends
rem  the block early and the script dies with a syntax error
rem  before it ever runs. Labels sidestep that entirely.
rem
rem  RESTARTS ARE EARNED, NOT ASSUMED. Home Assistant only
rem  reloads Python on restart; studio.html and the engine are
rem  static files it re-serves on the next request. But
rem  studio.html LIVES INSIDE custom_components\harmonium, so a
rem  Studio-only round used to look exactly like an integration
rem  round and this script cried wolf every time. It now probes
rem  the .py files with `robocopy /L` -- list-only, copies
rem  nothing -- and asks for a restart only when one actually
rem  differs. `push <house> studio` skips the question entirely.
rem ============================================================

set "REPO=%~dp0"
set "HOUSE=%~1"
set "WHAT=%~2"
if "%HOUSE%"=="" goto :usage
if "%WHAT%"=="" set "WHAT=engine"

if not exist "%REPO%houses\%HOUSE%.cmd" goto :nohouse
call "%REPO%houses\%HOUSE%.cmd"

if not exist "%DST%configuration.yaml" goto :noshare
if /I "%WHAT%"=="init" goto :init

rem ---- is it the house we THINK it is? -----------------------
rem  Houses get mapped to the same drive letter at different
rem  times. The letter is not identity; this marker is.
set "MARK=%DST%www\harmonium\.house"
if not exist "%MARK%" goto :nomark
set "FOUND="
set /p FOUND=<"%MARK%"
if /I not "%FOUND%"=="%HOUSE_ID%" goto :wronghouse

echo.
echo  house   : %HOUSE_NAME%   [%HOUSE_ID%]
echo  target  : %DST%    %HA_URL%
echo  pushing : %WHAT%       -- config.json is never touched
echo.

set "NEEDRESTART="
if /I "%WHAT%"=="engine"      goto :engine
if /I "%WHAT%"=="all"         goto :engine
if /I "%WHAT%"=="studio"      goto :studio
if /I "%WHAT%"=="integration" goto :pyprobe
goto :badmode

:engine
echo  --- engine: dist\index.html to www\harmonium ---
robocopy "%REPO%dist" "%DST%www\harmonium" index.html /NJH /NJS /NDL
if ERRORLEVEL 8 goto :copyfail
if /I "%WHAT%"=="all" goto :pyprobe
goto :done

:studio
echo  --- studio: studio.html only, no Python, no restart ---
robocopy "%REPO%integration\custom_components\harmonium\studio" "%DST%custom_components\harmonium\studio" studio.html /NJH /NJS /NDL
if ERRORLEVEL 8 goto :copyfail
goto :done

:pyprobe
rem  LIST-ONLY probe: /L makes robocopy report what it WOULD do
rem  and copy nothing. Exit code 1..7 means at least one .py is
rem  new or different, which is the only thing a restart fixes.
robocopy "%REPO%integration\custom_components\harmonium" "%DST%custom_components\harmonium" *.py /S /L /NJH /NJS /NDL /NC /NS >nul
if ERRORLEVEL 8 goto :copyfail
if ERRORLEVEL 1 set "NEEDRESTART=1"
goto :integration

:integration
echo  --- integration: custom_components\harmonium, incl. studio.html ---
robocopy "%REPO%integration\custom_components\harmonium" "%DST%custom_components\harmonium" /MIR /XD __pycache__ /NJH /NJS /NDL
if ERRORLEVEL 8 goto :copyfail
goto :done

:done
echo.
echo  Done -- %HOUSE_NAME%.
if defined NEEDRESTART goto :saidrestart
echo  No Python changed -- NO Home Assistant restart needed.
echo  Hard-refresh the Harmonium Studio tab to pick up studio.html.
goto :tail

:saidrestart
echo  Integration Python CHANGED: restart Home Assistant, then
echo  hard-refresh the Harmonium Studio tab.

:tail
echo  Remote picks up a new engine on its next reload: clear cache + load start URL.
echo.
echo  Reminder: do NOT run harmonium.reseed. Config is authored in the
echo  Studio and lives in HA; dist\config.json is the TEST FIXTURE.
echo.
rem  A double-click wrapper sets HARMONIUM_NOPAUSE so you only
rem  press a key once.
if not defined HARMONIUM_NOPAUSE pause
exit /b 0

:init
if not exist "%DST%www\harmonium\" mkdir "%DST%www\harmonium"
>"%DST%www\harmonium\.house" echo|set /p="%HOUSE_ID%"
echo  Marked %DST%www\harmonium\.house = %HOUSE_ID%
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
echo  Map it to this house's config share first:
echo      %HOUSE_NAME%
echo      %HA_URL%
echo  then re-run.
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1

:nomark
echo.
echo  ERROR: %MARK%
echo  is missing, so this share cannot prove which house it is.
echo  Refusing to copy anything.
echo  If you are certain %DST% is this house, run:  push %HOUSE% init
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1

:wronghouse
echo.
echo  ***  STOP  ***
echo  You asked to push to %HOUSE_ID% -- %HOUSE_NAME%
echo  but %DST% says it belongs to "%FOUND%".
echo  Nothing has been copied. Check your drive mapping.
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1

:copyfail
echo.
echo  ERROR: robocopy failed. Nothing can be assumed about what
echo  reached %DST% -- read its output above before re-running.
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1

:badmode
echo.
echo  ERROR: unknown mode "%WHAT%"
goto :usage

:usage
echo.
echo  usage:  push ^<house^> [engine^|studio^|integration^|all^|init]
echo.
echo     engine        dist\index.html to www\harmonium        [default]
echo     studio        studio.html only -- never needs a restart
echo     integration   custom_components\harmonium; restart only if .py changed
echo     all           engine + integration
echo     init          stamp this share with the house marker, one time
echo.
echo  Known houses:
for %%f in ("%REPO%houses\*.cmd") do echo     %%~nf
echo.
if not defined HARMONIUM_NOPAUSE pause
exit /b 1
