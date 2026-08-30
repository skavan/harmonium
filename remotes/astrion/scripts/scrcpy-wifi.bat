@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scrcpy-wifi.ps1" %*
echo %cmdcmdline% | find /i "%~nx0" >nul && pause
endlocal
