$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$selected = @(
  'typewriter', 'aurora-bg',
  'audio-pulse', 'beat-pulse-grid',
  'arrow-annotate', 'connector-lines',
  'device-mockup-zoom', 'multi-device-lineup',
  'card-stack-3d', 'text-extrude-3d',
  'grain-gradient-bg', 'dither-field-bg',
  'text-animator', 'shape-layer',
  'code-reveal', 'caption-bumper',
  'transition-card-flip', 'chromatic-aberration-wipe',
  'data-story', 'browser-flow'
)
$registryBase = 'https://remotionui.com/r/presets/default'
$lockPath = Join-Path $root 'remotion-ui-lock.json'
$packagePath = Join-Path $root 'package.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$lock = Get-Content $lockPath -Raw | ConvertFrom-Json
if (-not $lock.files) { $lock | Add-Member -MemberType NoteProperty -Name files -Value ([pscustomobject]@{}) }
$visited = [System.Collections.Generic.HashSet[string]]::new()
$items = [System.Collections.Generic.List[object]]::new()
$npmDependencies = [System.Collections.Generic.HashSet[string]]::new()

function Get-RegistryName([string]$name) {
  return $name -replace '^@remotionui/', ''
}

function Resolve-Item([string]$name) {
  $id = Get-RegistryName $name
  if (-not $visited.Add($id)) { return }
  $url = "$registryBase/$id.json"
  $raw = (Invoke-WebRequest -UseBasicParsing -Uri $url).Content
  $item = $raw | ConvertFrom-Json
  if ($item.name -ne $id) { throw "Registry identity mismatch for $id" }
  $items.Add($item)
  foreach ($dependency in @($item.registryDependencies)) {
    Resolve-Item ([string]$dependency)
  }
  foreach ($dependency in @($item.dependencies)) {
    [void]$npmDependencies.Add([string]$dependency)
  }
}

foreach ($id in $selected) { Resolve-Item $id }

$pendingWrites = [System.Collections.Generic.List[object]]::new()
foreach ($item in $items) {
  foreach ($file in @($item.files)) {
    $relative = [string]$file.target
    $target = Join-Path $root $relative
    $tracked = $lock.files.PSObject.Properties[$relative]
    if ((Test-Path $target) -and -not $tracked) {
      throw "Refusing to overwrite untracked file: $relative"
    }
    $pendingWrites.Add([pscustomobject]@{
      Item = [string]$item.name
      Path = $target
      Relative = $relative
      Content = [string]$file.content
    })
  }
}

foreach ($write in $pendingWrites) {
  $directory = Split-Path $write.Path -Parent
  if (-not (Test-Path $directory)) { [void](New-Item -ItemType Directory -Path $directory -Force) }
  [System.IO.File]::WriteAllText($write.Path, $write.Content, $utf8)
  $bytes = [System.IO.File]::ReadAllBytes($write.Path)
  $sha = ([System.Security.Cryptography.SHA256]::Create()).ComputeHash($bytes)
  $hash = -join ($sha | ForEach-Object { $_.ToString('x2') })
  $entry = [pscustomobject]@{ component = $write.Item; sha256 = $hash }
  $existing = $lock.files.PSObject.Properties[$write.Relative]
  if ($existing) { $existing.Value = $entry } else { $lock.files | Add-Member -MemberType NoteProperty -Name $write.Relative -Value $entry }
}

[System.IO.File]::WriteAllText($lockPath, (($lock | ConvertTo-Json -Depth 12) + "`n"), $utf8)

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$knownDependencies = @{}
foreach ($section in @('dependencies', 'devDependencies')) {
  if ($package.$section) {
    foreach ($property in $package.$section.PSObject.Properties) {
      $knownDependencies[$property.Name] = $true
    }
  }
}
$missingDependencies = @($npmDependencies | Where-Object { -not $knownDependencies.ContainsKey($_) }) | Sort-Object

[pscustomobject]@{
  Selected = $selected
  RegistryItems = @($items | ForEach-Object { $_.name })
  FilesWritten = @($pendingWrites | ForEach-Object { $_.Relative })
  MissingNpmDependencies = $missingDependencies
} | ConvertTo-Json -Depth 10
