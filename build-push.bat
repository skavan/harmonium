@echo off
setlocal
rem ============================================================
rem  build-push -- THE ROUTINE DEPLOY: build Studio + engine, push both.
rem  No integration .py, so no Home Assistant restart. Use
rem  push-all.bat when the integration changed (it says so).
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

echo [1/4] Building the Studio...
pushd "%REPO%studio-src"
call npm run build
if errorlevel 1 goto :failed
popd

echo.
echo [2/4] Building the engine...
pushd "%REPO%"
call node build-engine.mjs
if errorlevel 1 goto :failed

echo.
echo [3/4] Pushing the engine to %HOUSE%...
call "%REPO%push.bat" %HOUSE% engine
if errorlevel 1 goto :failed

echo.
echo [4/4] Pushing the Studio to %HOUSE%...
call "%REPO%push.bat" %HOUSE% studio
if errorlevel 1 goto :failed

echo.
echo  ------------------------------------------------------------
echo   Deployed to %HOUSE%. Now:
echo     remote:  clear browser cache, then load start URL
echo     Studio:  hard-refresh the tab (Ctrl+F5)
echo   No Home Assistant restart needed.
echo  ------------------------------------------------------------
goto :end

:failed
popd 2>nul
echo  ************************************************************
echo   FAILED -- read the message above. Nothing else was pushed.
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
