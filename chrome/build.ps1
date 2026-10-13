$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputPath = Join-Path (Split-Path $projectRoot -Parent) 'GhostType-GTekSD-v3.69-Chrome-Web-Store.zip'
$stagingPath = Join-Path $env:TEMP ('GhostType-Chrome-' + [guid]::NewGuid().ToString('N'))

New-Item -ItemType Directory -Path $stagingPath | Out-Null

try {
  foreach ($file in @('background.js', 'content.js', 'sidepanel.html', 'sidepanel.js', 'styles.css')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stagingPath $file)
  }

  $manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw | ConvertFrom-Json
  $manifest.PSObject.Properties.Remove('key')
  [System.IO.File]::WriteAllText(
    (Join-Path $stagingPath 'manifest.json'),
    ($manifest | ConvertTo-Json -Depth 100),
    [System.Text.UTF8Encoding]::new($false)
  )

  foreach ($folder in @('_locales', 'icons', 'fonts')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination (Join-Path $stagingPath $folder) -Recurse
  }

  if (Test-Path -LiteralPath $outputPath) {
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
      'icons',
      'fonts'
    ) -DestinationPath $outputPath -CompressionLevel Optimal
  } finally {
    Pop-Location
  }

  $archive = [System.IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    $entryNames = @($archive.Entries | ForEach-Object FullName)
    foreach ($requiredEntry in @('manifest.json', 'background.js', 'content.js', 'sidepanel.html', 'sidepanel.js', '_locales/en/messages.json', 'icons/icon128.png', 'icons/icon512.png', 'fonts/inter-latin.woff2', 'fonts/jetbrains-mono-latin.woff2', 'fonts/OFL-Inter.txt', 'fonts/OFL-JetBrains-Mono.txt')) {
      if ($entryNames -notcontains $requiredEntry) {
        throw "Chrome Web Store archive is missing required entry: $requiredEntry"
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
      $manifest.version -ne '3.69' -or
      $manifest.key -or
      -not $manifest.update_url -or
      -not $manifest.side_panel.default_path
    ) {
      throw 'Chrome Web Store manifest validation failed. The upload manifest must not contain the development key.'
    }

    foreach ($check in @(
      @{ Path = 'sidepanel.html'; Text = 'Text Snippets' },
      @{ Path = 'sidepanel.html'; Text = 'clearAllTextsBtn' },
      @{ Path = 'sidepanel.js'; Text = 'function clearAllTextInputs()' },
      @{ Path = 'content.js'; Text = 'targetElement.dispatchEvent(new FocusEvent("focus"))' }
    )) {
      $entry = $archive.GetEntry($check.Path)
      $reader = [System.IO.StreamReader]::new($entry.Open())
      try {
        $content = $reader.ReadToEnd()
      } finally {
        $reader.Dispose()
      }
      if (-not $content.Contains($check.Text)) {
        throw "Chrome Web Store archive validation failed: '$($check.Text)' not found in $($check.Path)."
      }
    }
  } finally {
    $archive.Dispose()
  }

  Write-Output "Created and verified Chrome Web Store package: $outputPath"
  Write-Output "Archive entries: $($entryNames.Count); size: $((Get-Item $outputPath).Length) bytes."
} finally {
  if (Test-Path -LiteralPath $stagingPath) {
    Remove-Item -LiteralPath $stagingPath -Recurse -Force
  }
}
