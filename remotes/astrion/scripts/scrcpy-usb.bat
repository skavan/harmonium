@echo off
setlocal

scrcpy -d

if errorlevel 1 (
    echo.
    echo Unable to start scrcpy. Connect exactly one USB Android device,
    echo enable USB debugging, and accept the debugging prompt on the device.
    pause
)

endlocal
