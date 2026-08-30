# scrcpy over wireless ADB - pick the remote via the shared resolver
# (units.json names, an IP, or the remembered last). No hardcoded address.
param([string]$Target)
. "$PSScriptRoot\..\..\lib\Resolve-AdbTarget.ps1"
$conn = Resolve-AdbTarget -Target $Target
$dev = $conn.Target[1]   # the 'host:port' from @('-s','host:port')
if (-not $dev) { Write-Host "This launcher is for wireless devices. For USB use scrcpy-usb.bat."; exit 1 }
Write-Host "== scrcpy -> $dev"
scrcpy -s $dev
if ($LASTEXITCODE -ne 0) { Write-Host ""; Write-Host "scrcpy could not open $dev. Is wireless ADB on (Blue) and scrcpy on PATH?" }
