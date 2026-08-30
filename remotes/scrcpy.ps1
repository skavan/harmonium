# ============================================================
# scrcpy.ps1  [-Target <name|ip|serial>]
#
# Mirrors and controls a remote with scrcpy. USB or wireless is
# handled by the same shared picker as the other remotes tools.
# ============================================================
param([string]$Target)

$scrcpy = Get-Command scrcpy.exe -ErrorAction SilentlyContinue
if (-not $scrcpy) {
    Write-Host "scrcpy.exe not found. Add the scrcpy folder to your Windows PATH, then notify or restart Explorer so it inherits the change."
    exit 1
}

. "$PSScriptRoot\lib\Resolve-AdbTarget.ps1"
$conn = Resolve-AdbTarget -Target $Target
$selector = @($conn.Target)

# An unqualified USB choice means the one physical Android device. Keep that
# explicit for scrcpy so a remembered wireless ADB connection cannot win.
if ($selector.Count -eq 0) { $selector = @('-d') }

$destination = if ($selector[0] -eq '-s') { $selector[1] } else { 'USB device' }
Write-Host "== scrcpy -> $destination"
& $scrcpy.Source @selector
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "scrcpy could not open $destination. For wireless, enable ADB on the remote first; for USB, connect one device and approve debugging."
    exit $LASTEXITCODE
}
