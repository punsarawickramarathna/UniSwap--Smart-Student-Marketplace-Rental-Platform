[CmdletBinding()]
param(
    [string]$Command = "reset"
)

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot
$VenvDir = Join-Path $RootDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$FrontendDir = Join-Path $RootDir "frontend"
$BackendDir = Join-Path $RootDir "backend"

function Show-Usage {
    Write-Host "Usage: .\run.ps1 [clean|install|start|reset]"
    Write-Host ""
    Write-Host "  clean    Remove Python, test, and frontend build caches"
    Write-Host "  install  Create the virtual environment and install dependencies"
    Write-Host "  start    Start the backend and frontend development servers"
    Write-Host "  reset    Clean caches, install dependencies, and start the app"
    Write-Host ""
    Write-Host "Run without a command to use reset."
}

function Get-PythonCommand {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        return @{ File = "py"; Prefix = @("-3") }
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
        return @{ File = "python"; Prefix = @() }
    }
    throw "Python 3 is required and was not found in PATH."
}

function Assert-NodeVersion {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or
        -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "Node.js and npm are required and were not found in PATH."
    }
    $nodeVersion = [version](& node -p "process.versions.node")
    $nodeSupported = (
        ($nodeVersion.Major -eq 22 -and $nodeVersion -ge [version]"22.22.2") -or
        ($nodeVersion.Major -eq 24 -and $nodeVersion -ge [version]"24.15.0") -or
        $nodeVersion.Major -ge 26
    )
    if (-not $nodeSupported) {
        Write-Warning "The frontend recommends Node.js 22.22.2+, 24.15+, or 26+; continuing with the installed version."
    }
}

function Remove-IfPresent([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Start-ServerProcess([string]$FilePath, [string]$Arguments, [string]$WorkingDirectory) {
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = $Arguments
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Could not start $FilePath."
    }
    return $process
}

function Clear-Caches {
    Write-Host "Cleaning caches..."
    Get-ChildItem -LiteralPath $BackendDir -Directory -Recurse -Force |
        Where-Object { $_.Name -in @("__pycache__", ".pytest_cache") } |
        Sort-Object { $_.FullName.Length } -Descending |
        ForEach-Object { Remove-IfPresent $_.FullName }

    @(
        (Join-Path $RootDir ".coverage"),
        (Join-Path $RootDir "htmlcov"),
        (Join-Path $BackendDir ".coverage"),
        (Join-Path $BackendDir "htmlcov"),
        (Join-Path $FrontendDir ".pytest_cache"),
        (Join-Path $FrontendDir "dist")
    ) | ForEach-Object { Remove-IfPresent $_ }
}

function Install-Dependencies {
    $python = Get-PythonCommand
    Assert-NodeVersion

    & $python.File @($python.Prefix) -c "import sys; raise SystemExit(sys.version_info < (3, 10))"
    if ($LASTEXITCODE -ne 0) {
        throw "Python 3.10 or newer is required."
    }

    if (-not (Test-Path -LiteralPath $VenvPython)) {
        if (Test-Path -LiteralPath $VenvDir) {
            Write-Host "Recreating the virtual environment for Windows..."
            & $python.File @($python.Prefix) -m venv --clear $VenvDir
        }
        else {
            Write-Host "Creating the Python virtual environment..."
            & $python.File @($python.Prefix) -m venv $VenvDir
        }
        if ($LASTEXITCODE -ne 0) { throw "Could not create the Python virtual environment." }
    }

    Write-Host "Installing backend dependencies..."
    & $VenvPython -m pip install -r (Join-Path $BackendDir "requirements-dev.txt")
    if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }

    Write-Host "Installing frontend dependencies..."
    Push-Location $FrontendDir
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
    }
    finally {
        Pop-Location
    }

    $envFile = Join-Path $RootDir ".env"
    if (-not (Test-Path -LiteralPath $envFile)) {
        Copy-Item -LiteralPath (Join-Path $RootDir ".env.example") -Destination $envFile
        Write-Host "Created .env from .env.example. Update its values before using the backend."
    }
}

function Start-Servers {
    if (-not (Test-Path -LiteralPath $VenvPython)) {
        throw "Dependencies are not installed. Run .\run.ps1 install first."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
        throw "Dependencies are not installed. Run .\run.ps1 install first."
    }
    Assert-NodeVersion

    Write-Host "Backend: http://localhost:8000"
    Write-Host "Frontend: http://localhost:5173"
    Write-Host "Press Ctrl+C or Q to stop both servers."

    $backend = $null
    $frontend = $null
    $stopRequested = $false
    $controlCAsInputChanged = $false
    $originalControlCAsInput = $false

    try {
        $originalControlCAsInput = [Console]::TreatControlCAsInput
        [Console]::TreatControlCAsInput = $true
        $controlCAsInputChanged = $true
    }
    catch {
        # Input may be redirected. Server-exit monitoring still works in that case.
    }

    try {
        $backend = Start-ServerProcess $VenvPython `
            "-m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" $BackendDir
        $frontend = Start-ServerProcess "cmd.exe" `
            "/d /s /c npm.cmd run dev -- --host 0.0.0.0" $FrontendDir

        while (-not $stopRequested -and -not $backend.HasExited -and -not $frontend.HasExited) {
            if ($controlCAsInputChanged -and [Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true)
                $controlC = $key.Key -eq [ConsoleKey]::C -and
                    ($key.Modifiers -band [ConsoleModifiers]::Control)
                if ($controlC -or $key.Key -eq [ConsoleKey]::Q) {
                    $stopRequested = $true
                    continue
                }
            }
            Start-Sleep -Milliseconds 250
            $backend.Refresh()
            $frontend.Refresh()
        }

        if ($stopRequested) { $serverStatus = 130 }
        elseif ($backend.HasExited) { $serverStatus = $backend.ExitCode }
        else { $serverStatus = $frontend.ExitCode }
    }
    finally {
        foreach ($process in @($backend, $frontend)) {
            if ($null -ne $process -and -not $process.HasExited) {
                & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
            }
        }
        if ($controlCAsInputChanged) {
            [Console]::TreatControlCAsInput = $originalControlCAsInput
        }
    }

    if ($serverStatus -eq 130) { return }
    if ($serverStatus -ne 0) {
        throw "A development server stopped with exit code $serverStatus."
    }
}

switch ($Command.ToLowerInvariant()) {
    "clean" { Clear-Caches }
    "install" { Install-Dependencies }
    "start" { Start-Servers }
    "reset" {
        Clear-Caches
        Install-Dependencies
        Start-Servers
    }
    { $_ -in @("help", "-h", "--help") } { Show-Usage }
    default {
        Show-Usage
        throw "Unknown command: $Command"
    }
}
