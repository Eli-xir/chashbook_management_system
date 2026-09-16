$ErrorActionPreference = 'Stop'

$frontendRoot = Join-Path $PSScriptRoot 'frontend'
$backendRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'cashbook_backend_run\backend'
$pythonExe = Join-Path $backendRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $pythonExe)) { throw "Backend Python not found: $pythonExe" }
$nodeExe = (Get-Command node -ErrorAction Stop).Source

function Wait-Http([string]$Url, [string]$Service, [string]$ErrorLog) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (Test-Path -LiteralPath $ErrorLog) { Get-Content -LiteralPath $ErrorLog -Tail 15 | Write-Host }
    throw "$Service did not start. Check $ErrorLog"
}

Write-Host 'Checking the Cashbook database (cashbook-pg, port 5433)...'
$containerState = & docker inspect cashbook-pg --format '{{.State.Running}}' 2>$null
if ($LASTEXITCODE -ne 0) {
    throw 'Open Docker Desktop and make sure the existing cashbook-pg container is available. This script never replaces or resets the database.'
}
if ($containerState -ne 'true') {
    & docker start cashbook-pg
    if ($LASTEXITCODE -ne 0) { throw 'Could not start cashbook-pg. Open Docker Desktop and try again.' }
}
$databaseReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec cashbook-pg pg_isready -U postgres -d cashbook_dev *> $null
    if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
    Start-Sleep -Seconds 1
}
if (!$databaseReady) { throw 'PostgreSQL is not ready yet. Check cashbook-pg in Docker Desktop.' }

if (!(Get-NetTCPConnection -State Listen -LocalPort 8001 -ErrorAction SilentlyContinue)) {
    Write-Host 'Starting backend on port 8001...'
    Start-Process -FilePath $pythonExe -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001') -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $backendRoot 'service.log') -RedirectStandardError (Join-Path $backendRoot 'service-error.log')
}
Wait-Http 'http://127.0.0.1:8001/health' 'Backend' (Join-Path $backendRoot 'service-error.log')

if (!(Get-NetTCPConnection -State Listen -LocalPort 5173 -LocalAddress '127.0.0.1' -ErrorAction SilentlyContinue)) {
    Write-Host 'Starting frontend on port 5173...'
    Start-Process -FilePath $nodeExe -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory $frontendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $frontendRoot 'service.log') -RedirectStandardError (Join-Path $frontendRoot 'service-error.log')
}
Wait-Http 'http://127.0.0.1:5173/' 'Frontend' (Join-Path $frontendRoot 'service-error.log')
$proxy = Invoke-RestMethod -Uri 'http://127.0.0.1:5173/api/health' -TimeoutSec 5
if ($proxy.ok -ne $true) { throw 'The frontend API proxy is not reaching Cashbook. Check frontend/vite.config.ts.' }
Write-Host ''
Write-Host 'Cashbook is ready: http://127.0.0.1:5173' -ForegroundColor Green
Write-Host 'Database contents were preserved. You can close this startup terminal.'
