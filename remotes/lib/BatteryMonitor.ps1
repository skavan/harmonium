# Shared helpers for battery-mon-start.ps1 and battery-mon-report.ps1.

function Get-BatteryMonRunsRoot {
    return (Join-Path (Split-Path -Parent $PSScriptRoot) 'battery-runs')
}

function ConvertFrom-BatteryMonDump {
    param([string[]]$Lines)

    $values = @{}
    foreach ($line in $Lines) {
        if ($line -match '^\s*([^:]+):\s*(.*)$') {
            $values[$Matches[1].Trim()] = $Matches[2].Trim()
        }
    }
    return $values
}

function Save-BatteryMonAdbOutput {
    param(
        [string]$Adb,
        [string[]]$Selector,
        [string[]]$Command,
        [string]$Path,
        [switch]$AllowFailure
    )

    $output = @(& $Adb @Selector @Command 2>&1)
    $exitCode = $LASTEXITCODE
    @($output | ForEach-Object { "$_" }) | Out-File -FilePath $Path -Encoding utf8
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "adb command failed (exit $exitCode): $($Command -join ' ') - see $Path"
    }
    return [pscustomobject]@{
        Lines = @($output | ForEach-Object { "$_" })
        ExitCode = $exitCode
    }
}

function Write-BatteryMonState {
    param($State, [string]$RunDirectory, [string]$ActiveStatePath)

    $json = $State | ConvertTo-Json -Depth 6
    $json | Set-Content -Path (Join-Path $RunDirectory 'run.json') -Encoding utf8
    if ($ActiveStatePath) {
        $json | Set-Content -Path $ActiveStatePath -Encoding utf8
    }
}
