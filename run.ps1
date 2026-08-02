<#
  MarketMind - single-command launcher.

      .\run.ps1

  Sets up anything missing (venv, Python deps, npm deps, backend\.env), picks
  free ports, then runs the API and the web app together. Ctrl+C stops both.
#>
$ErrorActionPreference = 'Stop'
# Invoke-WebRequest renders a progress bar while it runs. Under a redirected /
# non-interactive host (exactly what this script gets when launched via
# Start-Process -RedirectStandardOutput, e.g. from a terminal wrapper) that
# progress write can itself throw — even after the server already responded
# 200 OK — which a global 'Stop' preference turns into a silent failure. This
# is the standard fix. (We also avoid Invoke-WebRequest for the readiness
# check below entirely, using a raw TCP probe instead, for the same reason.)
$ProgressPreference = 'SilentlyContinue'

$root     = Split-Path -Parent $MyInvocation.MyCommand.Definition
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venvPy   = Join-Path $backend '.venv\Scripts\python.exe'
$api      = $null

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

function Get-FreePort([int]$start) {
    foreach ($p in $start..($start + 25)) {
        $busy = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if (-not $busy) { return $p }
    }
    throw "No free port found near $start."
}

# Raw TCP connect check — avoids Invoke-WebRequest's progress-stream issues
# under headless hosts (see note above) and is faster on failure than an HTTP
# request's own timeout.
function Test-TcpPort([string]$Hostname, [int]$Port, [int]$TimeoutMs = 400) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($Hostname, $Port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne($TimeoutMs) -and $client.Connected) {
            $client.EndConnect($iar)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

try {
    # ---------- backend deps ----------
    if (-not (Test-Path $venvPy)) {
        Write-Step 'Creating Python virtual environment'
        python -m venv (Join-Path $backend '.venv')
    }

    & $venvPy -c "import fastapi, uvicorn, yfinance" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Step 'Installing backend dependencies (first run, 1-2 min)'
        & $venvPy -m pip install --quiet --disable-pip-version-check --upgrade pip
        & $venvPy -m pip install --quiet --disable-pip-version-check -r (Join-Path $backend 'requirements.txt')
    }

    # ---------- config ----------
    $envFile = Join-Path $backend '.env'
    if (-not (Test-Path $envFile)) {
        Write-Step 'Creating backend\.env from template'
        Copy-Item (Join-Path $backend '.env.example') $envFile
        Write-Host '    Market data works with no keys. AI features need one:' -ForegroundColor Yellow
        Write-Host '    Free key -> https://aistudio.google.com/apikey  (set GEMINI_API_KEY in backend\.env)' -ForegroundColor Yellow
    }

    # ---------- frontend deps ----------
    if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
        Write-Step 'Installing frontend dependencies (first run, ~1 min)'
        Push-Location $frontend
        try { npm install --silent } finally { Pop-Location }
    }

    # ---------- start API on a free port ----------
    $apiPort = Get-FreePort 8000
    if ($apiPort -ne 8000) {
        Write-Host "    Port 8000 is in use by another app; using $apiPort instead." -ForegroundColor Yellow
    }
    Write-Step "Starting API on http://127.0.0.1:$apiPort"
    $api = Start-Process -FilePath $venvPy `
        -ArgumentList '-m', 'uvicorn', 'main:app', '--port', "$apiPort" `
        -WorkingDirectory $backend -PassThru -NoNewWindow

    # Probe 127.0.0.1, NOT localhost: on Windows "localhost" resolves to ::1 first
    # and uvicorn binds IPv4-only, so every localhost probe would time out.
    # TCP-level check (see Test-TcpPort above) — not an HTTP request — so it
    # can't be derailed by Invoke-WebRequest's progress-stream quirk.
    $ready = $false
    foreach ($i in 1..60) {
        if ($api.HasExited) { break }
        if (Test-TcpPort '127.0.0.1' $apiPort) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        if ($api.HasExited) { throw "API process exited on startup. See the output above." }
        throw "API did not become ready on port $apiPort. See the output above."
    }
    Write-Host "    API ready - docs at http://127.0.0.1:$apiPort/docs" -ForegroundColor Green

    # ---------- start web app (foreground) ----------
    # Tells vite.config.js where to proxy /api, so a shifted API port still works.
    # 127.0.0.1 (not localhost) for the same IPv6 reason — Node also prefers ::1.
    $env:VITE_BACKEND_URL = "http://127.0.0.1:$apiPort"
    Write-Step 'Starting web app - open the URL below. Ctrl+C stops both.'
    Push-Location $frontend
    try { npm run dev } finally { Pop-Location }
}
finally {
    if ($api -and -not $api.HasExited) {
        Write-Step 'Stopping API'
        cmd /c "taskkill /PID $($api.Id) /T /F" 2>&1 | Out-Null
    }
}
