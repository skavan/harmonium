# ============================================================
# battery-mon-report.ps1  [-Run <run-folder-or-run.json>]
#
# Finishes the active run created by battery-mon-start.ps1 and
# captures batterystats, wake/power state, CPU info, and a bugreport.
# ============================================================
param([string]$Run)

. "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"
. "$PSScriptRoot\lib\BatteryMonitor.ps1"

$runsRoot = Get-BatteryMonRunsRoot
$activeStatePath = Join-Path $runsRoot '.active.json'
if ($Run) {
    $candidate = $Run
    if (-not [IO.Path]::IsPathRooted($candidate)) { $candidate = Join-Path $runsRoot $candidate }
    if (Test-Path $candidate -PathType Container) { $candidate = Join-Path $candidate 'run.json' }
    $statePath = $candidate
} else {
    $statePath = $activeStatePath
}

if (-not (Test-Path $statePath -PathType Leaf)) {
    throw "No active battery run was found. Start one with battery-mon-start.bat."
}
try { $state = Get-Content -Raw $statePath | ConvertFrom-Json }
catch { throw "The battery run state is unreadable: $statePath" }
if ($state.status -ne 'running') {
    throw "This battery run is already marked '$($state.status)': $($state.runDirectory)"
}

$runDirectory = "$($state.runDirectory)"
if (-not (Test-Path $runDirectory -PathType Container)) {
    if ((Split-Path -Leaf $statePath) -eq 'run.json') { $runDirectory = Split-Path -Parent $statePath }
    else { throw "The run folder no longer exists: $runDirectory" }
}

$adb = Get-Adb
$recordedSelector = @($state.selector)
if ($recordedSelector.Count -eq 0) { $recordedSelector = @('-d') }
$transport = Get-BatteryMonTransportKind -RecordedTransport "$($state.transport)" -Selector $recordedSelector
$selector = @($recordedSelector)

if ($transport -eq 'usb') {
    $usbTransport = Find-ConnectedAdbDeviceByHardwareSerial -Adb $adb -HardwareSerial "$($state.serial)" -UsbOnly
    if ($usbTransport) {
        $selector = @('-s', $usbTransport)
        Write-Host "== found the monitored remote on USB: $usbTransport"
    } else {
        # Compatibility for schema-1 runs without a recorded hardware serial.
        $recordedState = @(& $adb @recordedSelector get-state 2>$null)
        if ($LASTEXITCODE -ne 0 -or "$($recordedState | Select-Object -First 1)".Trim() -ne 'device') {
            $serialNote = if ($state.serial) { " (hardware serial $($state.serial))" } else { '' }
            throw "This run started over USB. Reconnect the same remote$serialNote by USB, approve the debugging prompt if shown, then rerun."
        }
    }
} elseif ($selector.Count -ge 2 -and $selector[0] -eq '-s' -and "$($selector[1])" -match ':') {
    Write-Host "== reconnecting wireless ADB to $($selector[1])"
    $connectOutput = @(& $adb connect $selector[1] 2>&1)
    $connectExit = $LASTEXITCODE
    @($connectOutput | ForEach-Object { "$_" }) | Out-File (Join-Path $runDirectory 'report-connect.txt') -Encoding utf8
    if ($connectExit -ne 0) {
        throw "Could not reconnect. Enable wireless ADB on the remote (on Astrion, press Blue), then rerun."
    }
}

$stateCheck = @(& $adb @selector get-state 2>&1)
if ($LASTEXITCODE -ne 0 -or "$($stateCheck | Select-Object -First 1)".Trim() -ne 'device') {
    if ($transport -eq 'usb') {
        throw "The monitored remote is not answering over USB. Reconnect it and approve the debugging prompt if shown, then rerun."
    }
    throw "The monitored remote is not answering. Enable wireless ADB (on Astrion, press Blue), then rerun."
}

Write-Host "== collecting final battery and process diagnostics from $($state.label)"
$batteryResult = Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'battery') -Path (Join-Path $runDirectory 'end-battery.txt')
$battery = ConvertFrom-BatteryMonDump $batteryResult.Lines
if (-not $battery.ContainsKey('level')) { throw "Android did not report an ending battery level." }
$endLevel = [int]$battery['level']
$endedAt = [DateTimeOffset]::Now

Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'power') -Path (Join-Path $runDirectory 'end-power.txt') | Out-Null
Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'cpuinfo') -Path (Join-Path $runDirectory 'end-cpuinfo.txt') | Out-Null
Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'pm', 'list', 'packages', '-U') -Path (Join-Path $runDirectory 'end-packages-with-uids.txt') | Out-Null
Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'batterystats') -Path (Join-Path $runDirectory 'batterystats.txt') | Out-Null
Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'batterystats', '--checkin') -Path (Join-Path $runDirectory 'batterystats-checkin.csv') | Out-Null

$bugreportName = 'bugreport.zip'
$bugreportPath = Join-Path $runDirectory $bugreportName
if (Test-Path $bugreportPath) {
    $bugreportName = 'bugreport-' + $endedAt.ToString('yyyy-MM-dd_HHmmss') + '.zip'
    $bugreportPath = Join-Path $runDirectory $bugreportName
}
Write-Host "== collecting Android bugreport (this can take several minutes)"
& $adb @selector bugreport $bugreportPath 2>&1 |
    Tee-Object -FilePath (Join-Path $runDirectory 'bugreport-command.txt')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $bugreportPath)) {
    throw "Bugreport collection failed. The other reports were saved; rerun battery-mon-report.bat to retry."
}

$elapsed = $endedAt - [DateTimeOffset]::Parse("$($state.startedAt)")
$drop = [double]$state.startLevel - $endLevel
$rate = if ($elapsed.TotalHours -gt 0) { $drop / $elapsed.TotalHours } else { 0 }
$summary = @(
    'Remote battery-monitor report'
    "Device: $($state.label)"
    "Started: $($state.startedAt)"
    "Ended: $($endedAt.ToString('o'))"
    ('Elapsed: {0:N2} hours' -f $elapsed.TotalHours)
    "Battery: $($state.startLevel)% -> $endLevel% (drop $drop points)"
    ('Average discharge: {0:N3} percentage points/hour' -f $rate)
    "Bugreport: $bugreportName"
    ''
    'For process attribution, load bugreport.zip into Battery Historian and inspect:'
    'Device Power Estimates, Userspace Wakelock, CPU Running vs Screen, jobs, alarms, and App Stats.'
    'Treat vendor estimated mAh as approximate; long screen-off wake locks and CPU time are stronger evidence.'
)
$summary | Set-Content -Path (Join-Path $runDirectory 'REPORT.txt') -Encoding utf8

$state.status = 'reported'
$state | Add-Member -NotePropertyName endedAt -NotePropertyValue $endedAt.ToString('o') -Force
$state | Add-Member -NotePropertyName endLevel -NotePropertyValue $endLevel -Force
$state | Add-Member -NotePropertyName bugreport -NotePropertyValue $bugreportName -Force
$activeForThisRun = $false
if (Test-Path $activeStatePath) {
    try {
        $activeState = Get-Content -Raw $activeStatePath | ConvertFrom-Json
        $activeForThisRun = ("$($activeState.runDirectory)" -eq "$($state.runDirectory)")
    } catch { }
}
$activePathToUpdate = if ($activeForThisRun) { $activeStatePath } else { '' }
Write-BatteryMonState -State $state -RunDirectory $runDirectory -ActiveStatePath $activePathToUpdate

Write-Host ""
$summary | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "All reports saved to: $runDirectory"
