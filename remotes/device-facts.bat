@echo off
REM launcher: runs the PowerShell version, bypassing execution policy so
REM double-click works. All args pass straight through (e.g. -Target).
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0device-facts.ps1" %*
echo %cmdcmdline% | find /i "%~nx0" >nul && pause
endlocal
