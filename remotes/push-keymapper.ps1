# ============================================================
# push-keymapper.ps1  [-Target <name|ip|serial>]  [-Type <astrion|rs90>]  [-Keymap <v1|v2>]  [-Zip <path>]
#
# Provisions a remote with a saved Key Mapper config version:
# pushes remotes\<type>\keymapper\<keymap>\key_mapper.zip to the
# device and opens Key Mapper for the two-tap finish (Restore >
# pick from Downloads). Type/keymap come from the chosen unit in
# units.json; -Zip overrides the source outright.
#
#   push-keymapper.bat                           pick a remote (uses its type/keymap)
#   push-keymapper.bat -Target "New Astrion (den)"   -> deploys astrion v2
#   push-keymapper.bat -Type astrion -Keymap v1  deploy the old Expert-Mode config
#
# Upgrading a remote is a CHOICE: point its units.json entry at a
# different keymap (v1->v2) and push - nothing is forced.
# ============================================================
param([string]$Target, [string]$Type, [string]$Keymap, [string]$Zip)

. "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"
$conn = Resolve-AdbTarget -Target $Target
function adbx { & $conn.Adb @($conn.Target) @args }

if (-not $Zip) {
    if (-not $Type)   { if ($conn.Unit -and $conn.Unit.type)   { $Type   = $conn.Unit.type }   else { $Type = 'astrion'; $assumed = $true } }
    if (-not $Keymap) { if ($conn.Unit -and $conn.Unit.keymap) { $Keymap = $conn.Unit.keymap } else { $Keymap = 'v2'; $assumed = $true } }
    if ($assumed) { Write-Host "   (no units.json match - assuming type=$Type keymap=$Keymap; pass -Type/-Keymap to change)" }
    $Zip = Join-Path $PSScriptRoot "$Type\keymapper\$Keymap\key_mapper.zip"
}
if (-not (Test-Path $Zip)) { Write-Host "no backup at: $Zip  (pass -Zip <path>, or pull one first)."; exit 1 }

$base = Split-Path -Leaf $Zip
Write-Host "== pushing $base  ($Type/$Keymap)"
adbx push "$Zip" "/sdcard/Download/$base"
if ($LASTEXITCODE -ne 0) { Write-Host "push failed - check the connection and rerun."; exit 1 }
$landed = adbx shell ls /sdcard/Download 2>$null | Where-Object { $_ -match [regex]::Escape($base) }
if (-not $landed) { Write-Host "push did not land on the device - rerun."; exit 1 }
Write-Host "== on the device: $base is in Downloads."
Write-Host "== opening Key Mapper - finish there: menu > Restore > pick $base"
adbx shell monkey -p io.github.sds100.keymapper -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "done."
