$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
foreach ($process in $processes) {
    $commandLine = $process.CommandLine
    $isProjectVite = $commandLine -match "vite" -and
        $commandLine -match [regex]::Escape($projectRoot)

    if ($isProjectVite) {
        Write-Host "Stopping existing project Vite process $($process.ProcessId)"
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
