@echo off
setlocal
rem ============================================================
rem  push-engine -- ENGINE ONLY (dist\index.html) to your default
rem  house. No Studio, no Python: no HA restart, ever.
rem
rem  Works on YOUR default house. The default is one line in
rem  houses\default.txt (e.g. "ct"), naming a profile in
rem  houses\<name>.cmd. Forked the repo? Two small files:
rem      1. copy houses\example.cmd to houses\<yourhouse>.cmd
rem         and fill in the four values
rem      2. echo yourhouse> houses\default.txt
rem  Both are gitignored -- your house details never leave your
rem  machine. See houses\README.md for the whole model.
rem ============================================================
set "REPO=%~dp0"
if not exist "%REPO%houses\default.txt" goto :nodefault
set /p HOUSE=<"%REPO%houses\default.txt"
if "%HOUSE%"=="" goto :nodefault

set "HARMONIUM_NOPAUSE=1"
call "%REPO%push.bat" %HOUSE% engine
if errorlevel 1 goto :failed
echo.
echo   Engine pushed to %HOUSE%. On the remote: clear browser
echo   cache, then load start URL (a remote showing old behaviour
echo   is a stale cache, not a bug).
goto :end

:failed
echo  ************************************************************
echo   PUSH FAILED -- nothing was copied. Read the message above.
echo  ************************************************************
goto :end

:nodefault
echo.
echo  No default house set. Create two small files:
echo    1. houses\^<yourhouse^>.cmd   (copy houses\example.cmd)
echo    2. houses\default.txt containing just:  yourhouse
echo  Then re-run. See houses\README.md.
echo.
pause
exit /b 1

:end
echo.
pause
