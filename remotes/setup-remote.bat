@echo off
REM launcher: runs the PowerShell version, bypassing execution policy so
REM double-click works. All args pass straight through (e.g. -Target, -Name).
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-remote.ps1" %*
REM pause ONLY when double-clicked from Explorer (so the window stays up to
REM read), never when run from an existing terminal.
echo %cmdcmdline% | find /i "%~nx0" >nul && pause
endlocal
