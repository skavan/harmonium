# ============================================================
# battery-mon-start.ps1  [-Target <name|ip|serial>] [-Force]
#
# Starts a clean Android batterystats window and records the chosen
# device so battery-mon-report can finish the run in a new terminal.
# Generated data stays under remotes\battery-runs\ (gitignored).
# ============================================================
param([string]$Target, [switch]$Force)

. "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"
. "$PSScriptRoot\lib\BatteryMonitor.ps1"

$runsRoot = Get-BatteryMonRunsRoot
if (-not (Test-Path $runsRoot)) {
    New-Item -ItemType Directory -Path $runsRoot | Out-Null
}
$activeStatePath = Join-Path $runsRoot '.active.json'

if (Test-Path $activeStatePath) {
    try { $previous = Get-Content -Raw $activeStatePath | ConvertFrom-Json }
    catch { throw "The battery monitor state is unreadable: $activeStatePath" }
    if ($previous.status -eq 'running' -and -not $Force) {
        Write-Host "A battery run is already active:"
        Write-Host "   device:  $($previous.label)"
        Write-Host "   started: $($previous.startedAt)"
        Write-Host "   folder:  $($previous.runDirectory)"
        Write-Host "Run battery-mon-report.bat first, or pass -Force to begin a separate run."
        exit 1
    }
}

$conn = Resolve-AdbTarget -Target $Target -PreferUsb
$adb = $conn.Adb
$selector = @($conn.Target)
if ($selector.Count -eq 0) { $selector = @('-d') }
$transport = Get-BatteryMonTransportKind -RecordedTransport "$($conn.Transport)" -Selector $selector

$label = if ($conn.Unit -and $conn.Unit.name) { "$($conn.Unit.name)" } else { "$($conn.Label)" }
if (-not $label) { $label = 'remote' }
$safeLabel = ($label -replace '[^A-Za-z0-9._-]+', '-').Trim('-')
if (-not $safeLabel) { $safeLabel = 'remote' }
$preparedAt = [DateTimeOffset]::Now
$runDirectory = Join-Path $runsRoot (($preparedAt.ToString('yyyy-MM-dd_HHmmss')) + '-' + $safeLabel)
New-Item -ItemType Directory -Path $runDirectory | Out-Null

Write-Host "== checking battery state on $label"
$batteryResult = Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'battery') -Path (Join-Path $runDirectory 'start-battery.txt')
$battery = ConvertFrom-BatteryMonDump $batteryResult.Lines
if (-not $battery.ContainsKey('level')) {
    throw "Android did not report a battery level - see $runDirectory\start-battery.txt"
}

$acPowered = ($battery['AC powered'] -eq 'true')
$usbPowered = ($battery['USB powered'] -eq 'true')
$wirelessPowered = ($battery['Wireless powered'] -eq 'true')
if ($acPowered -or $wirelessPowered -or ($usbPowered -and $transport -ne 'usb')) {
    throw "The remote still reports external power. Remove it from the cradle/unplug it, then rerun."
}
if ($usbPowered -and $transport -eq 'usb') {
    Write-Warning "The remote is powered through the USB data connection. This is allowed for setup; the script will ask you to disconnect it after the baseline is ready."
} elseif ("$($battery['status'])" -ne '3') {
    Write-Warning "Battery status is '$($battery['status'])', not Android's usual discharging code (3). The run will continue because vendor firmware can report this differently."
}
$startLevel = [int]$battery['level']
if ($startLevel -lt 100) {
    Write-Warning "Battery starts at $startLevel%, not 100%."
}

Write-Host "== saving baseline diagnostics"
Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'power') -Path (Join-Path $runDirectory 'start-power.txt') | Out-Null
Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'cpuinfo') -Path (Join-Path $runDirectory 'start-cpuinfo.txt') | Out-Null
Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'pm', 'list', 'packages', '-U') -Path (Join-Path $runDirectory 'packages-with-uids.txt') | Out-Null

Write-Host "== resetting batterystats and enabling full wake-lock history"
Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'batterystats', '--reset') -Path (Join-Path $runDirectory 'batterystats-reset.txt') | Out-Null
$wakeHistory = Save-BatteryMonAdbOutput -Adb $adb -Selector $selector -Command @('shell', 'dumpsys', 'batterystats', '--enable', 'full-wake-history') -Path (Join-Path $runDirectory 'full-wake-history.txt') -AllowFailure
if ($wakeHistory.ExitCode -ne 0) {
    Write-Warning "This Android build did not accept full-wake-history. Normal batterystats collection is still active."
}

if ($transport -eq 'usb') {
    Write-Host ""
    Write-Host "USB BASELINE READY"
    Write-Host "Disconnect the USB cable now. Waiting for $label to disconnect ..."
    do {
        Start-Sleep -Milliseconds 250
        $usbState = @(& $adb @selector get-state 2>$null)
        $usbStillConnected = ($LASTEXITCODE -eq 0 -and "$($usbState | Select-Object -First 1)".Trim() -eq 'device')
    } while ($usbStillConnected)
    Write-Host "== USB disconnected; the discharge clock starts now"
}
$startedAt = [DateTimeOffset]::Now

$state = [pscustomobject]@{
    schema = 2
    status = 'running'
    startedAt = $startedAt.ToString('o')
    runDirectory = $runDirectory
    label = $label
    serial = "$($conn.Serial)"
    selector = @($selector)
    transport = $transport
    startLevel = $startLevel
}
Write-BatteryMonState -State $state -RunDirectory $runDirectory -ActiveStatePath $activeStatePath

Write-Host ""
Write-Host "BATTERY RUN STARTED"
Write-Host "   device: $label"
Write-Host "   level:  $startLevel%"
Write-Host "   output: $runDirectory"
Write-Host ""
if ($transport -eq 'usb') {
    Write-Host "USB is disconnected. Do not charge/reboot, and use the remote normally."
    Write-Host "After 24-48 hours, reconnect this same remote by USB and run:"
    Write-Host "   battery-mon-report.bat"
    Write-Host "Wireless ADB can remain off for the entire run."
} else {
    Write-Host "For an honest standby measurement: turn wireless ADB off (on Astrion, long-press Blue),"
    Write-Host "do not use scrcpy, do not charge/reboot, and use the remote normally."
    Write-Host "After 24-48 hours, press Blue to restore wireless ADB and run:"
    Write-Host "   battery-mon-report.bat"
}
