@echo off
rem == device-facts.bat ==============================================
rem First step for ANY new remote: capture the device's identity and
rem the versions that matter, over adb (one device plugged in, or
rem pass a serial:  device-facts.bat SERIAL).
rem Paste the output into the session / docs - this block is the
rem fact sheet the profile, skin viewport, and runbook build on.
rem (2026-08-21, born with the RS90 provisioning round.)

setlocal
rem adb ships IN the repo (tools\adb) so a fresh clone just works;
rem a system adb on PATH is the fallback (same rule as setup-remote.bat).
set "ADB=%~dp0..\tools\adb\adb.exe"
if exist "%ADB%" goto :adbok
set ADB=adb
where adb >nul 2>&1 || (echo adb.exe not found - expected at tools\adb\adb.exe & exit /b 1)
:adbok
if not "%~1"=="" set ADB="%ADB%" -s %~1
if "%~1"=="" set ADB="%ADB%"

echo == identity ======================================================
%ADB% shell getprop ro.product.manufacturer
%ADB% shell getprop ro.product.model
%ADB% shell getprop ro.build.version.release
%ADB% shell getprop ro.build.fingerprint

echo == display (skin viewport math: CSS px = px / (density/160)) =====
%ADB% shell wm size
%ADB% shell wm density

echo == webview (the engine's runtime) ================================
echo    current provider (what actually runs):
%ADB% shell "dumpsys webviewupdate | grep -i 'Current WebView package'"
echo    stock package:
%ADB% shell "dumpsys package com.android.webview | grep -iE 'versionName|codePath'"
echo    google package (absent lines = not installed):
%ADB% shell "dumpsys package com.google.android.webview | grep -iE 'versionName|codePath'"

echo == app versions ==================================================
echo Fully Kiosk:
%ADB% shell "dumpsys package de.ozerov.fully | grep versionName"
echo KeyMapper:
%ADB% shell "dumpsys package io.github.sds100.keymapper | grep versionName"
echo Stock remote UI (RS90 cantata; Astrion HaRemote):
%ADB% shell "dumpsys package com.cantata.remote | grep versionName"
%ADB% shell "dumpsys package com.aiks.HaRemote | grep versionName"

echo == wake locks (should be quiet at idle) ==========================
%ADB% shell "dumpsys power | grep -iE 'suspendblocker|mHolding'"
endlocal
