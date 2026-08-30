# ============================================================
# pull-fully.ps1  [-Target <name|ip|serial>]  [-Type <astrion|rs90>]
#
# Grabs a Fully Kiosk settings export off a remote into the repo.
# USB or wireless is handled by the shared resolver; -Type comes
# from the chosen unit in units.json when you pick a named remote.
#
# ASSUMES THE EXPORT ALREADY EXISTS on the device. Fully has no
# headless export, so FIRST, on the remote, tap Export:
#   Remote Admin (http://<remote-ip>:2323) > Export/Import Settings
#   > Export Settings   (or on-device: Fully menu > Settings >
#   Export Settings to File). Fully writes it to the ROOT of
#   /sdcard as  fully-settings.json .
#
#   pull-fully.bat                            pick a remote (uses its type)
#   pull-fully.bat -Target "New Astrion (den)"
#
# Lands the raw export at remotes\fully\<type>-fully-settings-raw.json
# (gitignored - it carries the LAN start URL and the encrypted PIN /
# admin password). It then OFFERS to distill it into the tracked,
# device-neutral canonical remotes\fully\remote-fully-settings.json
# (omitting startURL / kioskPinEnc / remoteAdminPasswordEnc) via
# fully\distill-fully.py .
# ============================================================
param([string]$Target, [string]$Type)

. "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"
$conn = Resolve-AdbTarget -Target $Target
function adbx { & $conn.Adb @($conn.Target) @args }

if (-not $Type) { if ($conn.Unit -and $conn.Unit.type) { $Type = $conn.Unit.type } else { $Type = 'astrion'; $assumed = $true } }
if ($assumed) { Write-Host "   (no units.json match for serial $($conn.Serial) - assuming type=$Type; pass -Type to change)" }

$src = '/sdcard/fully-settings.json'
Write-Host "== looking for $src on the device"
$exists = adbx shell ls $src 2>$null
if (-not ("$exists" -match 'fully-settings\.json')) {
    Write-Host "   not found. On the remote, Export first:"
    Write-Host "   Remote Admin (http://<remote-ip>:2323) > Export/Import Settings > Export Settings,"
    Write-Host "   or on-device: Fully menu (swipe from left edge, PIN) > Settings > Export Settings to File."
    Write-Host "   Fully writes it to the root of /sdcard. Then rerun this."
    exit 1
}

$out = Join-Path $PSScriptRoot 'fully'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }
$raw = Join-Path $out "$Type-fully-settings-raw.json"
Write-Host "   pulling $src"
adbx pull "$src" "$raw"
if ($LASTEXITCODE -ne 0) { Write-Host "   pull failed."; exit 1 }
Write-Host "== saved raw export to: remotes\fully\$Type-fully-settings-raw.json  (gitignored)"

try {
    $j = Get-Content -Raw $raw | ConvertFrom-Json
    if ($j.startURL) { Write-Host "   startURL: $($j.startURL)" }
} catch { }

$canon   = Join-Path $out 'remote-fully-settings.json'
$distill = Join-Path $out 'distill-fully.py'
$ans = Read-Host "Distill into the canonical remote-fully-settings.json (omit startURL / PIN / admin password)? (y/N)"
if ($ans -match '^(y|yes)$') {
    $py = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
    if ($py -and (Test-Path $distill)) {
        & $py.Source $distill $raw $canon
        Write-Host "   review before committing:  git diff remotes/fully/remote-fully-settings.json"
    } elseif (-not $py) {
        Write-Host "   python not found - distill by hand: copy the raw file to remote-fully-settings.json and delete startURL, kioskPinEnc, remoteAdminPasswordEnc."
    } else {
        Write-Host "   fully\distill-fully.py missing - distill by hand (delete the 3 device keys)."
    }
}
Write-Host "done."
