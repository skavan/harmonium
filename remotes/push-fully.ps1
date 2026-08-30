# ============================================================
# push-fully.ps1  [-Target <name|ip|serial>]  [-File <path>]
#
# Pushes a Fully Kiosk settings file to a remote for import.
# USB or wireless is handled by the shared resolver. Defaults to
# the tracked, device-neutral canonical
# remotes\fully\remote-fully-settings.json ; -File overrides.
#
#   push-fully.bat                            pick a remote (pushes the canonical)
#   push-fully.bat -Target "New Astrion (den)"
#   push-fully.bat -File remotes\fully\astrion-fully-settings-raw.json
#
# Fully reads settings files from the ROOT of /sdcard. After the
# push, finish the IMPORT on the device (Fully has no headless
# import): Remote Admin > Export/Import Settings > the import icon >
# pick the file  (or on-device: Fully menu > Settings > Import
# Settings from File). The canonical omits startURL / kiosk PIN /
# admin password, so importing it leaves those three untouched -
# set them once on a NEW remote (see remotes\fully\README.md).
# ============================================================
param([string]$Target, [string]$File)

. "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"
$conn = Resolve-AdbTarget -Target $Target
function adbx { & $conn.Adb @($conn.Target) @args }

if (-not $File) { $File = Join-Path $PSScriptRoot 'fully\remote-fully-settings.json' }
if (-not (Test-Path $File)) { Write-Host "no settings file at: $File  (pass -File <path>)."; exit 1 }

$base = Split-Path -Leaf $File
Write-Host "== pushing $base to /sdcard/ (root)"
adbx push "$File" "/sdcard/$base"
if ($LASTEXITCODE -ne 0) { Write-Host "push failed - check the connection and rerun."; exit 1 }
$landed = adbx shell ls /sdcard/ 2>$null | Where-Object { $_ -match [regex]::Escape($base) }
if (-not $landed) { Write-Host "push did not land on the device - rerun."; exit 1 }
Write-Host "== $base is in the root of /sdcard on the device."
Write-Host "== finish the IMPORT on the device (Fully has no headless import):"
Write-Host "   Remote Admin (http://<remote-ip>:2323) > Export/Import Settings > import icon > pick $base,"
Write-Host "   or on-device: Fully menu (swipe from left edge, PIN) > Settings > Import Settings from File."
Write-Host "   On a NEW remote, then set Start URL, Kiosk PIN, and Remote Admin password (see remotes\fully\README.md)."
Write-Host "done."
