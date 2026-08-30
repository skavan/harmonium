# ============================================================
# pull-keymapper.ps1  [-Target <name|ip|serial>]  [-Type <astrion|rs90>]  [-Keymap <v1|v2>]
#
# Grabs a Key Mapper backup off a remote into the repo, into the
# per-type / per-version folder  remotes\<type>\keymapper\<keymap>\ .
# USB or wireless is handled by the shared resolver; -Type and
# -Keymap come from the chosen unit in units.json when you pick a
# named remote, so different remotes (and different config
# versions) never share a file.
#
#   pull-keymapper.bat                          pick a remote (uses its type/keymap)
#   pull-keymapper.bat -Target "Old Astrion"    -> remotes\astrion\keymapper\v1\key_mapper.zip
#   pull-keymapper.bat -Type astrion -Keymap v2 explicit, no units.json needed
#
# ONE-TIME on the device first (Key Mapper has no headless export
# intent): Key Mapper > Settings > "Change automatic backup
# location" > Change > save the .zip into Download.
# GOTCHA: Key Mapper does NOT reliably rewrite that backup when your
# maps change. BEFORE EACH PULL, re-open that same "Change automatic
# backup location" dialog > Change > re-save key_mapper.zip into
# Download, so it captures your latest maps. Only the NEWEST match is
# pulled, saved as key_mapper.zip. After pulling, this prints a neutral contents
# summary (map count + sound count) so you can confirm you grabbed
# the config you expected.
# ============================================================
param([string]$Target, [string]$Type, [string]$Keymap)

. "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"
$conn = Resolve-AdbTarget -Target $Target
function adbx { & $conn.Adb @($conn.Target) @args }

if (-not $Type)   { if ($conn.Unit -and $conn.Unit.type)   { $Type   = $conn.Unit.type }   else { $Type = 'astrion'; $assumed = $true } }
if (-not $Keymap) { if ($conn.Unit -and $conn.Unit.keymap) { $Keymap = $conn.Unit.keymap } else { $Keymap = 'v2'; $assumed = $true } }
if ($assumed) {
    Write-Host ""
    Write-Host "   !! No units.json match for this device (serial $($conn.Serial))."
    Write-Host "   !! Assuming  type=$Type  keymap=$Keymap . If that is wrong, Ctrl-C now and"
    Write-Host "   !! either add this remote to remotes\units.json (with its 'serial'), or"
    Write-Host "   !! pass -Type / -Keymap. (Nothing is overwritten either way - see below.)"
    Write-Host ""
}

$out = Join-Path $PSScriptRoot "$Type\keymapper\$Keymap"
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

Write-Host "== looking for Key Mapper backup zips in /sdcard/Download"
$listing = adbx shell ls -t /sdcard/Download 2>$null
$newest = $listing | Where-Object { $_ -match 'key' -and $_ -match '\.zip\s*$' } | Select-Object -First 1
if (-not $newest) {
    Write-Host "   none found. On the remote: Key Mapper > Settings >"
    Write-Host "   'Change automatic backup location' > Change > save the"
    Write-Host "   .zip into Download, then rerun this."
    exit 1
}
$newest = "$newest".Trim()
$dest = Join-Path $out 'key_mapper.zip'
# NEVER overwrite: archive any existing backup with a timestamp first.
if (Test-Path $dest) {
    $ts = Get-Date -Format 'yyyy-MM-dd_HHmm'
    $archive = Join-Path $out "key_mapper.$ts.zip"
    Move-Item -LiteralPath $dest -Destination $archive -Force
    Write-Host "   existing backup kept as key_mapper.$ts.zip (not overwritten)"
}
Write-Host "   pulling $newest"
adbx pull "/sdcard/Download/$newest" "$dest"
if ($LASTEXITCODE -ne 0) { Write-Host "   pull failed."; exit 1 }

# report what actually landed - a sounds-less auto-backup and a full
# manual backup look identical by name, so make the difference visible.
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($dest)
    $maps = '?'
    $dj = $zip.Entries | Where-Object { $_.Name -eq 'data.json' } | Select-Object -First 1
    if ($dj) {
        $sr = New-Object System.IO.StreamReader($dj.Open())
        $txt = $sr.ReadToEnd(); $sr.Close()
        try { $maps = @(($txt | ConvertFrom-Json).keymap_list).Count } catch { }
    }
    $snd = @($zip.Entries | Where-Object { $_.FullName -like 'sounds/*' -and $_.Length -gt 0 }).Count
    $zip.Dispose()
    Write-Host ""
    Write-Host "   contents: $maps key maps, $snd embedded sound(s)."
} catch { }
Write-Host ""
Write-Host "== saved to: remotes\$Type\keymapper\$Keymap\key_mapper.zip  - commit it."

# offer to re-render the human-readable docs (map .md + KeyCodes .xlsx) from
# this backup. Prompted, never automatic - the generated docs are versioned
# artifacts you commit, so regenerating is a deliberate, reviewable change.
$gen = Join-Path $PSScriptRoot "$Type\keymapper\gen-map-docs.py"
if (Test-Path $gen) {
    $ans = Read-Host "Regenerate map docs (.md + .xlsx) for $Type/$Keymap from this backup? (y/N)"
    if ($ans -match '^(y|yes)$') {
        $py = Get-Command python -ErrorAction SilentlyContinue
        if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
        if ($py) { & $py.Source $gen $Keymap }
        else { Write-Host "   python not found - run it yourself: python $Type\keymapper\gen-map-docs.py $Keymap" }
    }
}
Write-Host "done."
