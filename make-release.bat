@echo off
rem ============================================================
rem  DOUBLE-CLICK ME to prepare a RELEASE (v0.83.4 -- the HACS
rem  TREE-INSTALL story; zip_release retired: HACS validated the
rem  git tree and required custom_components\ at the repo ROOT
rem  anyway, so the tree IS the release now). In order:
rem      1. build the STUDIO   (studio-src -> studio.html, lands
rem         inside custom_components\harmonium via finish.mjs)
rem      2. build the ENGINE   (src/ -> dist\index.html)
rem      3. copy the engine INTO the integration
rem         (custom_components\harmonium\engine\index.html) --
rem         the integration self-deploys it to www\ on HA startup,
rem         which is how a HACS install gets an engine at all
rem
rem  Publishing (all on GitHub, no assets to attach):
rem      1. git add -A  &&  git commit  &&  git push
rem      2. create a GitHub RELEASE with tag v<version>
rem         (must match manifest.json "version")
rem      HACS installs custom_components\harmonium from that tag.
rem
rem  This does NOT push anything to any house. Your push-*.bat
rem  workflow is untouched; the ownership stamp in packaging.py
rem  keeps the self-deployer from ever reverting a manual push.
rem ============================================================
setlocal
set "HARMONIUM_NOPAUSE=1"

echo [1/3] Building the Studio...
pushd "%~dp0studio-src"
call npm run build
if errorlevel 1 goto :failed
popd

echo.
echo [2/3] Building the engine...
pushd "%~dp0"
call node build-engine.mjs
if errorlevel 1 goto :failed

echo.
echo [3/3] Bundling the engine into the integration...
if not exist "custom_components\harmonium\engine" mkdir "custom_components\harmonium\engine"
copy /y "dist\index.html" "custom_components\harmonium\engine\index.html" >nul
if errorlevel 1 goto :failed

for /f "usebackq tokens=2 delims=:, " %%v in (`findstr /c:"\"version\"" "custom_components\harmonium\manifest.json"`) do set "VER=%%~v"
echo.
echo  ------------------------------------------------------------
echo   Release tree is ready (manifest version %VER%).
echo   To publish:
echo     1. git add -A  ^&^&  git commit -m "v%VER%"  ^&^&  git push
echo     2. on GitHub: Releases -^> Draft new release -^> tag v%VER%
echo        (no files to attach -- HACS installs from the tag)
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
