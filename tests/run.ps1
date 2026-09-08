$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$previousNodeOptions = $env:NODE_OPTIONS
Push-Location $repo

try {
    if (-not (Test-Path 'node_modules\playwright-core')) {
        npm install --no-save --no-package-lock playwright-core
        if ($LASTEXITCODE -ne 0) { throw 'Failed to install playwright-core.' }
    }

    $browser = Get-ChildItem "$env:LOCALAPPDATA\ms-playwright\chromium-*\chrome-win64\chrome.exe" -ErrorAction SilentlyContinue
    if (-not $browser) {
        node node_modules\playwright-core\cli.js install chromium --no-shell
        if ($LASTEXITCODE -ne 0) { throw 'Failed to install Chromium.' }
    }

    node build-engine.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Engine build failed.' }

    $server = Start-Process python -ArgumentList '-m', 'http.server', '8482', '--directory', 'dist' -PassThru -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            Invoke-WebRequest 'http://127.0.0.1:8482/index.html' -UseBasicParsing -TimeoutSec 1 | Out-Null
            break
        } catch {
            if ($server.HasExited) { throw 'The test server exited before it was ready.' }
            [Threading.Thread]::Sleep(100)
        }
    }
    if ($attempt -eq 20) { throw 'The test server did not become ready.' }

    $env:NODE_OPTIONS = "$previousNodeOptions --import=./tests/playwright-portable.mjs".Trim()

    foreach ($suite in Get-ChildItem 'tests\smoke-*.mjs' | Sort-Object Name) {
        Write-Host "== $($suite.Name)"
        node $suite.FullName
        if ($LASTEXITCODE -ne 0) { throw "$($suite.Name) failed." }
    }
} finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id }
    if ($null -eq $previousNodeOptions) {
        Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    } else {
        $env:NODE_OPTIONS = $previousNodeOptions
    }
    Pop-Location
}