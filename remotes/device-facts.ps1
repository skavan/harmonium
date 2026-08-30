# ============================================================
# device-facts.ps1  [-Target <name|ip|serial>]
#
# First step for ANY new remote: capture the device's identity
# and the versions that matter, over adb. USB or wireless is
# handled by the shared resolver. Paste the output into the
# session / docs - this block is the fact sheet the profile,
# skin viewport, and runbook build on.
# (born 2026-08-21 with the RS90 provisioning round.)
# ============================================================
param([string]$Target)

. "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"
$conn = Resolve-AdbTarget -Target $Target
function adbx { & $conn.Adb @($conn.Target) @args }

Write-Host "== identity ======================================================"
Write-Host "   serial (put this in units.json):"
adbx shell getprop ro.serialno
adbx shell getprop ro.product.manufacturer
adbx shell getprop ro.product.model
adbx shell getprop ro.build.version.release
adbx shell getprop ro.build.display.id
adbx shell getprop ro.build.fingerprint

Write-Host "== display (skin viewport math: CSS px = px / (density/160)) ====="
adbx shell wm size
adbx shell wm density

Write-Host "== webview (the engine's runtime) ================================"
Write-Host "   current provider (what actually runs):"
adbx shell "dumpsys webviewupdate | grep -i 'Current WebView package'"
Write-Host "   stock package:"
adbx shell "dumpsys package com.android.webview | grep -iE 'versionName|codePath'"
Write-Host "   google package (absent lines = not installed):"
adbx shell "dumpsys package com.google.android.webview | grep -iE 'versionName|codePath'"

Write-Host "== app versions =================================================="
Write-Host "Fully Kiosk:"
adbx shell "dumpsys package de.ozerov.fully | grep versionName"
Write-Host "Key Mapper:"
adbx shell "dumpsys package io.github.sds100.keymapper | grep versionName"
Write-Host "Key Mapper GUI Keyboard (astrion v2 IME path):"
adbx shell "dumpsys package io.github.sds100.keymapper.inputmethod.latin | grep versionName"
Write-Host "Stock remote UI (RS90 cantata; Astrion HaRemote):"
adbx shell "dumpsys package com.cantata.remote | grep versionName"
adbx shell "dumpsys package com.aiks.HaRemote | grep versionName"

Write-Host "== input methods (astrion v2: GUI keyboard should be default) ===="
Write-Host "   default:"
adbx shell settings get secure default_input_method
Write-Host "   enabled:"
adbx shell settings get secure enabled_accessibility_services

Write-Host "== wake locks (should be quiet at idle) =========================="
adbx shell "dumpsys power | grep -iE 'suspendblocker|mHolding'"
