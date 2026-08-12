@echo off
rem ============================================================
rem  DOUBLE-CLICK ME to cut a RELEASE BUNDLE (v0.82 — the HACS
rem  story). In order:
rem      1. build the STUDIO   (studio-src -> studio.html, lands
rem         inside the integration via finish.mjs)
rem      2. build the ENGINE   (src/ -> dist\index.html)
rem      3. copy the engine INTO the integration
rem         (custom_components\harmonium\engine\index.html) --
rem         the integration self-deploys it to www\ on HA startup,
rem         which is how a HACS install gets an engine at all
rem      4. zip the integration -> release\harmonium.zip with the
rem         integration files at the ZIP ROOT (what HACS
rem         zip_release expects)
rem
rem  Publishing (manual, once the GitHub repo is live):
rem      git tag v<version>  (must match manifest.json "version")
rem      create a GitHub release for the tag and attach
rem      release\harmonium.zip  (hacs.json names it)
rem
rem  This does NOT push anything to any house. Your push-*.bat
rem  workflow is untouched; the ownership stamp in packaging.py
rem  keeps the self-deployer from ever reverting a manual push.
rem ============================================================
setlocal
set "HARMONIUM_NOPAUSE=1"

echo [1/4] Building the Studio...
pushd "%~dp0studio-src"
call npm run build
if errorlevel 1 goto :failed
popd

echo.
echo [2/4] Building the engine...
pushd "%~dp0"
call node build-engine.mjs
if errorlevel 1 goto :failed

echo.
echo [3/4] Bundling the engine into the integration...
if not exist "integration\custom_components\harmonium\engine" mkdir "integration\custom_components\harmonium\engine"
copy /y "dist\index.html" "integration\custom_components\harmonium\engine\index.html" >nul
if errorlevel 1 goto :failed

echo.
echo [4/4] Zipping release\harmonium.zip ...
if not exist "release" mkdir "release"
if exist "release\harmonium.zip" del "release\harmonium.zip"
powershell -NoProfile -Command "Compress-Archive -Path 'integration\custom_components\harmonium\*' -DestinationPath 'release\harmonium.zip' -Force"
if errorlevel 1 goto :failed

for /f "usebackq tokens=2 delims=:, " %%v in (`findstr /c:"\"version\"" "integration\custom_components\harmonium\manifest.json"`) do set "VER=%%~v"
echo.
echo  ------------------------------------------------------------
echo   release\harmonium.zip is ready (manifest version %VER%).
echo   To publish:
echo     1. git tag v%VER%  and push the tag
echo     2. create a GitHub release for it
echo     3. attach release\harmonium.zip to the release
echo   HACS users then install/update from the release.
echo  ------------------------------------------------------------
goto :end

:failed
popd 2>nul
echo  ************************************************************
echo   RELEASE FAILED -- read the message above. Nothing published.
echo  ************************************************************

:end
echo.
pause
