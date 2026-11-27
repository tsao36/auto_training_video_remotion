$ErrorActionPreference = 'Stop'

function Assert-CommandAvailable([string]$Name, [string]$InstallHint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found on PATH. $InstallHint"
    }
}

Assert-CommandAvailable 'node' 'Install Node.js 20 or newer, then rerun this installer.'
Assert-CommandAvailable 'npm' 'Repair the Node.js installation so npm is available, then rerun this installer.'
Assert-CommandAvailable 'ffmpeg' 'Install FFmpeg and add it to PATH, then rerun this installer.'
Assert-CommandAvailable 'ffprobe' 'Install FFmpeg with ffprobe and add it to PATH, then rerun this installer.'

$nodeMajor = [int]((& node -p "Number(process.versions.node.split('.')[0])").Trim())
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required; detected Node.js $(& node --version)."
}

$browserPaths = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
if (-not ($browserPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)) {
    throw 'Microsoft Edge or Google Chrome is required for local Remotion rendering.'
}

$launcherPath = (Get-Item -LiteralPath (Join-Path $PSScriptRoot 'start.bat')).FullName
$desktopPath = [Environment]::GetFolderPath('DesktopDirectory')
if (-not (Test-Path -LiteralPath $desktopPath -PathType Container)) {
    throw 'The Windows desktop folder could not be located.'
}

$assetPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'RemotionTrainingStudio'
$iconPath = Join-Path $assetPath 'studio.ico'
$shortcutPath = Join-Path $desktopPath 'Remotion Training Studio.lnk'
New-Item -ItemType Directory -Path $assetPath -Force | Out-Null

Add-Type -AssemblyName System.Drawing
function New-StudioBrush([string]$Color) {
    [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($Color))
}

$bitmap = [Drawing.Bitmap]::new(256, 256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$png = [IO.MemoryStream]::new()
$background = New-StudioBrush '#14233A'
$frame = New-StudioBrush '#30D8BF'
$play = New-StudioBrush '#DFFF68'
try {
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.FillPie($background, 8, 8, 240, 240, 0, 360)
    $graphics.FillRectangle($frame, 44, 72, 168, 112)
    $graphics.FillRectangle($background, 75, 84, 106, 88)
    foreach ($top in 84, 116, 148) {
        $graphics.FillRectangle($background, 53, $top, 13, 24)
        $graphics.FillRectangle($background, 190, $top, 13, 24)
    }
    $graphics.FillPolygon($play, [Drawing.Point[]]@(
        [Drawing.Point]::new(108, 98),
        [Drawing.Point]::new(108, 158),
        [Drawing.Point]::new(160, 128)
    ))
    $bitmap.Save($png, [Drawing.Imaging.ImageFormat]::Png)
    $imageBytes = $png.ToArray()
} finally {
    $play.Dispose()
    $frame.Dispose()
    $background.Dispose()
    $png.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

# An ICO directory stores 256-pixel dimensions as zero and can point to a PNG image.
$icon = [IO.BinaryWriter]::new([IO.File]::Create($iconPath))
try {
    $icon.Write([uint16]0)
    $icon.Write([uint16]1)
    $icon.Write([uint16]1)
    $icon.Write([uint32]0)
    $icon.Write([uint16]1)
    $icon.Write([uint16]32)
    $icon.Write([uint32]$imageBytes.Length)
    $icon.Write([uint32]22)
    $icon.Write($imageBytes)
} finally {
    $icon.Dispose()
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'Launch Remotion Training Studio'
$shortcut.Save()
Write-Output "Desktop shortcut created: $shortcutPath"