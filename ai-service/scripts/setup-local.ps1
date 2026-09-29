[CmdletBinding()]
param(
    [string]$PythonPath,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $serviceRoot '.venv\Scripts\python.exe'

function Assert-SupportedPython([string]$Executable) {
    & $Executable -c "import sys; print('Python:', sys.version.split()[0]); sys.exit(0 if sys.version_info[:2] in ((3, 11), (3, 12)) else 1)"
    if ($LASTEXITCODE -ne 0) {
        throw 'Use Python 3.11 or 3.12 for this project. Pass -PythonPath with its executable path. Existing environments are never deleted automatically.'
    }
}

Push-Location $serviceRoot
try {
    if (-not (Test-Path -LiteralPath $venvPython)) {
        if ($CheckOnly) {
            throw 'Project environment is missing. Run scripts\setup-local.ps1 first.'
        }
        if (-not $PythonPath) {
            $launcher = Get-Command py -ErrorAction SilentlyContinue
            if ($launcher) {
                foreach ($version in @('-3.11', '-3.12')) {
                    try {
                        $candidate = & $launcher.Source $version -c 'import sys; print(sys.executable)' 2>$null
                    } catch {
                        continue
                    }
                    if ($LASTEXITCODE -eq 0) {
                        $PythonPath = $candidate
                        break
                    }
                }
            }
        }
        if (-not $PythonPath) {
            $PythonPath = (Get-Command python -ErrorAction Stop).Source
        }
        Assert-SupportedPython $PythonPath
        & $PythonPath -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the project environment.' }
    }

    Assert-SupportedPython $venvPython
    Write-Host "Environment: $venvPython"
    if (-not $CheckOnly) {
        & $venvPython -m pip install --disable-pip-version-check --timeout 15 --retries 1 -r requirements.txt
        if ($LASTEXITCODE -ne 0) {
            throw 'Dependency installation failed. If the log shows WinError 10013 or a socket permission error, run this script in a local terminal permitted to access PyPI. Retrying inside a network-restricted execution environment will not fix it.'
        }
    }

    $checkImports = @'
import importlib.util
import sys
modules = ('fastapi', 'uvicorn', 'pydantic', 'openai', 'chromadb', 'multipart', 'dotenv', 'httpx')
missing = [name for name in modules if importlib.util.find_spec(name) is None]
print('Missing dependencies: ' + ', '.join(missing) if missing else 'Required packages found.')
sys.exit(bool(missing))
'@
    & $venvPython -c $checkImports
    if ($LASTEXITCODE -ne 0) {
        throw 'Dependencies are incomplete. Run scripts\setup-local.ps1 without -CheckOnly in a terminal that can download packages.'
    }
    & $venvPython -m pip check
    if ($LASTEXITCODE -ne 0) { throw 'Dependency conflicts were found; review the pip output above.' }
    & $venvPython -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) { throw 'Project tests failed; review the test output above.' }

    if (-not $CheckOnly -and -not (Test-Path -LiteralPath '.env')) {
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
    }
    Write-Host 'Environment checks passed. Start the backend with scripts\start-local.ps1.'
    Write-Host 'Real AI and image recognition still require an API key and USE_MOCK_LLM=false in .env.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
