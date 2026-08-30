@echo off
REM Start a battery-discharge attribution run. Pass -Target to skip the picker.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0battery-mon-start.ps1" %*
echo %cmdcmdline% | find /i "%~nx0" >nul && pause
endlocal
