$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputPath = Join-Path (Split-Path $projectRoot -Parent) 'GhostType-GTekSD-v1.69-Firefox.zip'
$stagingPath = Join-Path $env:TEMP ('GhostType-Firefox-' + [guid]::NewGuid().ToString('N'))

New-Item -ItemType Directory -Path $stagingPath | Out-Null

try {
  foreach ($file in @('sidepanel.html', 'sidepanel.js', 'styles.css', 'content.js')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stagingPath $file)
  }

  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Destination (Join-Path $stagingPath 'manifest.json')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'background.js') -Destination (Join-Path $stagingPath 'background.js')

  foreach ($folder in @('_locales', 'icons')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination (Join-Path $stagingPath $folder) -Recurse
  }

  if (Test-Path $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
  }

  Push-Location $stagingPath
  try {
    Compress-Archive -Path @(
      'manifest.json',
      'background.js',
      'content.js',
      'sidepanel.html',
      'sidepanel.js',
      'styles.css',
      '_locales',
      'icons'
    ) -DestinationPath $outputPath -CompressionLevel Optimal
  } finally {
    Pop-Location
  }

  $archive = [System.IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    $entryNames = @($archive.Entries | ForEach-Object FullName)
    foreach ($requiredEntry in @('manifest.json', 'background.js', '_locales/en/messages.json', 'icons/icon128.png')) {
      if ($entryNames -notcontains $requiredEntry) {
        throw "Firefox archive is missing required entry: $requiredEntry"
      }
    }

    $manifestEntry = $archive.GetEntry('manifest.json')
    $reader = [System.IO.StreamReader]::new($manifestEntry.Open())
    try {
      $manifest = $reader.ReadToEnd() | ConvertFrom-Json
    } finally {
      $reader.Dispose()
    }

    if (
      $manifest.version -ne '1.69' -or
      $manifest.side_panel -or
      $manifest.permissions -contains 'sidePanel' -or
      $manifest.browser_specific_settings.gecko.data_collection_permissions.required -notcontains 'none' -or
      -not $manifest.sidebar_action.default_panel
    ) {
      throw 'Firefox manifest validation failed.'
    }
  } finally {
    $archive.Dispose()
  }

  Write-Output "Created and verified Firefox package: $outputPath"
  Write-Output "Archive entries: $($entryNames.Count); size: $((Get-Item $outputPath).Length) bytes."
} finally {
  if (Test-Path $stagingPath) {
    Remove-Item -LiteralPath $stagingPath -Recurse -Force
  }
}
