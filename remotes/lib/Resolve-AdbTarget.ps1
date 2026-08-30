# ============================================================
# Resolve-AdbTarget.ps1  -  shared adb device resolver
#
# Dot-source this, call Resolve-AdbTarget, then run adb through
# the returned connection object. It handles USB *or* wireless
# ADB uniformly, so no remote script has to reinvent the "which
# device?" logic (the old .bat files each had a fragile copy).
#
#   . "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"     # from remotes\*
#   . "$PSScriptRoot\remotes\lib\Resolve-AdbTarget.ps1"  # from repo root
#   $conn = Resolve-AdbTarget -Target $Target
#   function adbx { & $conn.Adb @($conn.Target) @args }
#   adbx shell settings get system user_rotation
#
# -Target may be:
#   (empty)         interactive pick; remembers your last choice
#   a unit name     from remotes\units.json  (e.g. "Den Astrion")
#   an IP / host    wireless  (":5555" added if you omit the port)
#   a USB serial    -s <serial>
#
# units.json (gitignored - your addresses never enter the repo;
# copy units.example.json to start) lets the picker show NAMES.
# ============================================================

function Get-RepoRoot {
    # this file is <repo>\remotes\lib\Resolve-AdbTarget.ps1
    return (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
}

function Get-Adb {
    $repo = Get-RepoRoot
    $bundled = Join-Path $repo 'tools\adb\adb.exe'
    if (Test-Path $bundled) { return $bundled }
    $sys = Get-Command adb -ErrorAction SilentlyContinue
    if ($sys) { return $sys.Source }
    throw "adb.exe not found. Put adb.exe (+ AdbWinApi.dll, AdbWinUsbApi.dll) in tools\adb\, or install platform-tools on PATH."
}

function Get-Units {
    $repo = Get-RepoRoot
    $f = Join-Path $repo 'remotes\units.json'
    if (-not (Test-Path $f)) { return @() }
    try { return @(Get-Content $f -Raw | ConvertFrom-Json) }
    catch { Write-Warning "remotes\units.json is not valid JSON - ignoring it."; return @() }
}

function Get-ConnectedDevices {
    param($Adb)
    $devs = @()
    foreach ($line in (& $Adb devices 2>$null)) {
        if ($line -match '^\s*$' -or $line -match '^List of devices') { continue }
        $p = $line -split '\s+'
        if ($p.Count -ge 2 -and $p[1] -eq 'device') { $devs += $p[0] }
    }
    return $devs
}

function ConvertTo-Spec {
    param([string]$Target, $Units)
    if (-not $Target) { return @{ Kind = 'usb'; Serial = $null; Label = 'USB device' } }
    $u = $Units | Where-Object { $_.name -and ($_.name.ToLower() -eq $Target.ToLower()) } | Select-Object -First 1
    if ($u) {
        $port = if ($u.port) { [int]$u.port } else { 5555 }
        return @{ Kind = 'wifi'; HostName = $u.ip; Port = $port; Label = $u.name }
    }
    if ($Target -match ':') {
        $h, $p = $Target -split ':', 2
        return @{ Kind = 'wifi'; HostName = $h; Port = [int]$p; Label = $Target }
    }
    if ($Target -match '^\d{1,3}(\.\d{1,3}){3}$' -or $Target -match '\.') {
        return @{ Kind = 'wifi'; HostName = $Target; Port = 5555; Label = $Target }
    }
    return @{ Kind = 'usb'; Serial = $Target; Label = "USB $Target" }
}

function Invoke-Picker {
    param($Adb, $Units, $Connected, [string]$Last)
    $opts = @()
    foreach ($d in $Connected) {
        $u = $Units | Where-Object { $_.ip -and ("$($_.ip):5555" -eq $d) } | Select-Object -First 1
        $lbl = if ($u) { "$($u.name)  [$d]" } else { "$d  [connected]" }
        $opts += @{ label = $lbl; target = $d }
    }
    foreach ($u in $Units) {
        if (-not $u.ip) { continue }
        if ($Connected -contains "$($u.ip):5555") { continue }
        $opts += @{ label = "$($u.name)  [$($u.ip)  wireless - will connect]"; target = $u.name }
    }
    $opts += @{ label = 'Enter an IP / host manually...'; target = '__manual__' }
    $opts += @{ label = 'USB (the one device plugged in)'; target = '__usb__' }

    Write-Host ''
    Write-Host 'Which remote?'
    $default = $null
    for ($i = 0; $i -lt $opts.Count; $i++) {
        $o = $opts[$i]
        $isLast = ($o.target -eq $Last) -or ($o.target -eq '__usb__' -and $Last -eq 'usb')
        $mark = ''
        if ($isLast) { $mark = ' *'; $default = ($i + 1) }
        Write-Host ('  {0}) {1}{2}' -f ($i + 1), $o.label, $mark)
    }
    $promptText = if ($default) { "Choice [$default]" } else { 'Choice' }
    do {
        $ans = Read-Host $promptText
        if (-not $ans -and $default) { $ans = "$default" }
    } until ($ans -match '^\d+$' -and [int]$ans -ge 1 -and [int]$ans -le $opts.Count)

    $sel = $opts[[int]$ans - 1]
    switch ($sel.target) {
        '__manual__' { return (Read-Host 'IP or host (port optional, default 5555)') }
        '__usb__'    { return '' }
        default      { return $sel.target }
    }
}

function Resolve-AdbTarget {
    param([string]$Target)
    $adb   = Get-Adb
    $units = Get-Units
    $repo  = Get-RepoRoot
    $lastFile = Join-Path $repo 'remotes\.last-target'

    if (-not $Target) {
        $connected = @(Get-ConnectedDevices $adb)
        $last = if (Test-Path $lastFile) { (Get-Content $lastFile -Raw).Trim() } else { '' }
        # frictionless: exactly one device, nothing remembered -> just use it
        if ($connected.Count -eq 1 -and -not $last -and $units.Count -eq 0) {
            $Target = $connected[0]
        } else {
            $Target = Invoke-Picker -Adb $adb -Units $units -Connected $connected -Last $last
        }
    }

    $spec = ConvertTo-Spec -Target $Target -Units $units

    if ($spec.Kind -eq 'wifi') {
        $hostport = "$($spec.HostName):$($spec.Port)"
        Write-Host "== connecting to $hostport ..."
        & $adb connect $hostport | Out-Null
        $targetArgs = @('-s', $hostport)
        $remember = $hostport
    }
    elseif ($spec.Serial) {
        $targetArgs = @('-s', $spec.Serial)
        $remember = $spec.Serial
    }
    else {
        $targetArgs = @()
        $remember = 'usb'
    }

    $state = (& $adb @targetArgs get-state 2>$null | Select-Object -First 1)
    if ("$state".Trim() -ne 'device') {
        throw "No device answering for '$($spec.Label)'. Plug the remote in over USB and approve the on-device prompt, or enable wireless ADB (Blue) and pass its IP."
    }

    # ro.serialno is the device's hardware serial - stable across reboots and
    # reflashes, identical over USB or wireless. It is the reliable identity to
    # match a unit on (an IP can change; a serial does not).
    $serial = ''
    try { $serial = ("$((& $adb @targetArgs shell getprop ro.serialno 2>$null | Select-Object -First 1))").Trim() } catch { }

    # match a unit: by serial (best), else the USB transport serial, else ip
    # (wifi), else the name that was typed.
    $unit = $null
    if ($serial)                 { $unit = $units | Where-Object { $_.serial -and ($_.serial -eq $serial) } | Select-Object -First 1 }
    if (-not $unit -and $spec.Serial) { $unit = $units | Where-Object { $_.serial -and ($_.serial -eq $spec.Serial) } | Select-Object -First 1 }
    if (-not $unit -and $spec.Kind -eq 'wifi') { $unit = $units | Where-Object { $_.ip -eq $spec.HostName } | Select-Object -First 1 }
    if (-not $unit -and $Target)  { $unit = $units | Where-Object { $_.name -and ($_.name.ToLower() -eq "$Target".ToLower()) } | Select-Object -First 1 }

    try { Set-Content -Path $lastFile -Value $remember -NoNewline -ErrorAction SilentlyContinue } catch { }
    $idnote = if ($serial) { " (serial $serial)" } else { "" }
    if ($unit) { Write-Host "== using: $($unit.name)$idnote  [type=$($unit.type) keymap=$($unit.keymap)]" }
    else       { Write-Host "== using: $($spec.Label)$idnote  (no units.json match)" }

    return [pscustomobject]@{ Adb = $adb; Target = $targetArgs; Label = $spec.Label; Serial = $serial; Unit = $unit }
}
