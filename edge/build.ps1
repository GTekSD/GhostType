$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputPath = Join-Path (Split-Path $projectRoot -Parent) 'GhostType-GTekSD-v2.69-Edge-Add-ons.zip'
$stagingPath = Join-Path $env:TEMP ('GhostType-Edge-' + [guid]::NewGuid().ToString('N'))

New-Item -ItemType Directory -Path $stagingPath | Out-Null

try {
  foreach ($file in @('sidepanel.html', 'sidepanel.js', 'styles.css', 'content.js', 'background.js')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stagingPath $file)
  }

  foreach ($folder in @('_locales', 'icons', 'fonts')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination (Join-Path $stagingPath $folder) -Recurse
  }

  $manifestPath = Join-Path $stagingPath 'manifest.json'
  $manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw | ConvertFrom-Json
  $manifest.PSObject.Properties.Remove('key')
  $manifest.PSObject.Properties.Remove('update_url')
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 100),
    [System.Text.UTF8Encoding]::new($false)
  )

  if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
  }

  foreach ($localePath in Get-ChildItem -LiteralPath (Join-Path $stagingPath '_locales') -Directory) {
    $messagesPath = Join-Path $localePath.FullName 'messages.json'
    $messages = Get-Content -LiteralPath $messagesPath -Raw | ConvertFrom-Json
    if ($messages.shortDesc.message.Length -gt 190) {
      throw "Edge Add-ons description for locale '$($localePath.Name)' exceeds 190 characters."
    }
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
      'icons',
      'fonts'
    ) -DestinationPath $outputPath -CompressionLevel Optimal
  } finally {
    Pop-Location
  }

  $archive = [System.IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    $entryNames = @($archive.Entries | ForEach-Object FullName)
    foreach ($requiredEntry in @('manifest.json', 'background.js', 'content.js', 'sidepanel.html', '_locales/en/messages.json', 'icons/icon128.png', 'icons/icon512.png', 'fonts/inter-latin.woff2', 'fonts/jetbrains-mono-latin.woff2', 'fonts/OFL-Inter.txt', 'fonts/OFL-JetBrains-Mono.txt')) {
      if ($entryNames -notcontains $requiredEntry) {
        throw "Edge Add-ons archive is missing required entry: $requiredEntry"
      }
    }

    $manifestEntry = $archive.GetEntry('manifest.json')
    $reader = [System.IO.StreamReader]::new($manifestEntry.Open())
    try {
      $packagedManifest = $reader.ReadToEnd() | ConvertFrom-Json
    } finally {
      $reader.Dispose()
    }

    if (
      $packagedManifest.version -ne '2.69' -or
      $packagedManifest.key -or
      $packagedManifest.update_url -or
      -not $packagedManifest.side_panel.default_path -or
      $packagedManifest.permissions -notcontains 'sidePanel'
    ) {
      throw 'Edge Add-ons manifest validation failed.'
    }
  } finally {
    $archive.Dispose()
  }

  Write-Output "Created and verified Edge Add-ons package: $outputPath"
  Write-Output "Archive entries: $($entryNames.Count); size: $((Get-Item $outputPath).Length) bytes."
} finally {
  if (Test-Path -LiteralPath $stagingPath) {
    Remove-Item -LiteralPath $stagingPath -Recurse -Force
  }
}
