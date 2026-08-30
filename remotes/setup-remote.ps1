# ============================================================
# setup-remote.ps1  [-Target <name|ip|serial>]
#
# One-time Android prep for a remote (Astrion HA100 and kin),
# run BEFORE provisioning keys with push-keymapper. USB or
# wireless is handled by the shared resolver.
#
# What it sets, and why:
#   1. accelerometer_rotation 0 - the Astrion's accelerometer
#      otherwise flips the kiosk when the remote is picked up
#   2. user_rotation 0          - display pinned to portrait (0)
#   3. display density - REPORTED, NEVER CHANGED (Suresh, 2026-08-22:
#      "we shouldn't fix what isn't broken"). The HA100 ships a
#      factory density-220 override and the whole astrion profile
#      is built on 220 - this only WARNS if an HA100 lost it and
#      prints the one command to restore it by hand.
#
# NOT here on purpose: making Fully the home launcher (a battery
# win, but the stock launcher component varies BY FIRMWARE, so the
# safe recipe records your current home first - a judgment step).
# The two-command recipe + do-not-brick warning is in
# docs/cookbook/hardware-keys.md, "The stock app's wake lock".
# ============================================================
param([string]$Target)

. "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"
$conn = Resolve-AdbTarget -Target $Target
function adbx { & $conn.Adb @($conn.Target) @args }

Write-Host "== locking display rotation to portrait"
adbx shell settings put system accelerometer_rotation 0 | Out-Null
adbx shell settings put system user_rotation 0 | Out-Null
Write-Host "   accelerometer_rotation is now: $((adbx shell settings get system accelerometer_rotation) -join '')"
Write-Host "   user_rotation is now:          $((adbx shell settings get system user_rotation) -join '')"

Write-Host "== display density (report only - nothing is changed)"
$model = "$((adbx shell getprop ro.product.model) -join '')".Trim()
$density = "$((adbx shell wm density) -join ' ')".Trim()
Write-Host "   model:   $model"
Write-Host "   $density"
if ($model -match 'HA100') {
    if ($density -match '220') {
        Write-Host "   OK: density 220 - matches the astrion profile."
    } else {
        Write-Host "   *** WARNING: this HA100 is NOT at density 220. The astrion"
        Write-Host "   profile (skin viewport 349x581, layout, Studio preview) is"
        Write-Host "   built on the factory 220 override. Restore it yourself with:"
        Write-Host "       adb shell wm density 220"
    }
}

Write-Host ""
Write-Host "done. Next: push-keymapper.bat for the key wiring, then"
Write-Host "docs\GETTING-STARTED.md section 5 for Fully Kiosk. For a"
Write-Host "new-firmware Astrion, use the IME + GUI Keyboard path in"
Write-Host "remotes\astrion2\README.md (Expert Mode does not survive reboot)."
