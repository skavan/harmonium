@echo off
REM Finish the active battery run and collect attribution reports + bugreport.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0battery-mon-report.ps1" %*
echo %cmdcmdline% | find /i "%~nx0" >nul && pause
endlocal
