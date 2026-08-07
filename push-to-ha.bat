@echo off
rem ============================================================
rem  Harmonium: push repo build artifacts to Home Assistant
rem  JAMAICA (dragonfly-evo)
rem  G:\Local Documents\Code 2025\repos\harmonium
rem      ->  H:\  (\\192.168.1.95\config)
rem  Run after Claude updates the repo. Restart HA if the
rem  integration (custom_components) changed.
rem  v0.38: engine + config now live at www\harmonium
rem  (/local/harmonium/). www\remote-proto keeps only the
rem  integration-written redirect stub - the bat no longer
rem  touches it.
rem ============================================================
set "SRC=G:\Local Documents\Code 2025\repos\harmonium"
set "DST=H:\"

if not exist "%DST%configuration.yaml" (
  echo.
  echo  ERROR: %DST% does not look like the HA config share.
  echo  Map H: to \\192.168.1.95\config first, then re-run.
  echo.
  pause
  exit /b 1
)

echo Pushing integration (custom_components\harmonium)...
robocopy "%SRC%\integration\custom_components\harmonium" "%DST%custom_components\harmonium" /MIR /XD __pycache__ /NJH /NJS /NDL

echo Pushing engine + config (www\harmonium)...
robocopy "%SRC%\dist" "%DST%www\harmonium" index.html config.json /NJH /NJS /NDL

echo.
echo Done. If integration files changed, restart Home Assistant
echo (or ask Claude to - it can call ha_restart).
pause
