[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8001
)

$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $serviceRoot '.venv\Scripts\python.exe'

Push-Location $serviceRoot
try {
    if (-not (Test-Path -LiteralPath $venvPython)) {
        throw 'Run scripts\setup-local.ps1 before starting the backend.'
    }
    & $venvPython -c 'from app.main import app'
    if ($LASTEXITCODE -ne 0) {
        throw 'The backend could not load. Run scripts\setup-local.ps1 and review its output.'
    }
    Write-Host "API docs: http://127.0.0.1:$Port/docs"
    Write-Host 'Keep this terminal open while using the demo. Press Ctrl+C to stop.'
    & $venvPython -m uvicorn app.main:app --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw 'The backend stopped with an error. Review the output above.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
