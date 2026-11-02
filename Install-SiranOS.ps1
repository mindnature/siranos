# SiranOS Windows per-user installer. No administrator rights, no Google account.
# This script must be launched from the downloaded and extracted release folder.
[CmdletBinding()]
param([switch]$NoPrompt, [switch]$SkipCodex, [switch]$SkipSchedule)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Info([string]$message) { Write-Host "[SiranOS] $message" -ForegroundColor Cyan }
function Warn([string]$message) { Write-Host "[SiranOS] $message" -ForegroundColor Yellow }
function Fail([string]$message) { throw $message }
function Invoke-Node([string]$nodePath, [string[]]$arguments) {
  & $nodePath @arguments
  if ($LASTEXITCODE -ne 0) { Fail "SiranOS command failed ($LASTEXITCODE): $($arguments -join ' ')" }
}
function Find-Node {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue | Where-Object { $_.CommandType -eq 'Application' } | Select-Object -First 1
  if (-not $command) { return $null }
  $versionText = & $command.Source --version
  if ($LASTEXITCODE -ne 0 -or "$versionText" -notmatch '^v(\d+)\.(\d+)') { return $null }
  $major = [int]$matches[1]; $minor = [int]$matches[2]
  if ($major -gt 22 -or ($major -eq 22 -and $minor -ge 13)) { return $command.Source }
  return $null
}
function Download-Node([string]$runtimeRoot) {
  # SHA-256 from the official Node.js v22.16.0 release checksum manifest.
  $version = '22.16.0'
  $arch = [string]$env:PROCESSOR_ARCHITECTURE
  if ($arch -eq 'ARM64') { $suffix='arm64'; $checksum='31e885dcd06355f67b4be8cca86464270d83d0f5b8d4e3d4369c16ed22a5f4fa' }
  elseif ($arch -eq 'AMD64') { $suffix='x64'; $checksum='21c2d9735c80b8f86dab19305aa6a9f6f59bbc808f68de3eef09d5832e3bfbbd' }
  elseif ($arch -eq 'x86') { $suffix='x86'; $checksum='c23e16ffddd95ef45272549675a8f87480b3a0a900bebb94c277ff11ba99ec06' }
  else { Fail "Unsupported processor architecture: $arch" }
  $folderName = "node-v$version-win-$suffix"
  $nodeExecutable = Join-Path (Join-Path $runtimeRoot $folderName) 'node.exe'
  if (Test-Path -LiteralPath $nodeExecutable -PathType Leaf) { return $nodeExecutable }
  if (-not (Test-Path -LiteralPath $runtimeRoot)) { New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null }
  $zip = Join-Path $env:TEMP ("siranos-node-" + [guid]::NewGuid().ToString('N') + '.zip')
  $stage = Join-Path $env:TEMP ("siranos-node-stage-" + [guid]::NewGuid().ToString('N'))
  $url = "https://nodejs.org/dist/v$version/$folderName.zip"
  try {
    Info "Node.js is missing or too old; downloading portable Node.js $version from nodejs.org (no admin required)."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip -TimeoutSec 120
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
    if ($actual -ne $checksum) { Fail 'Node.js SHA256 mismatch; installation stopped before extraction.' }
    New-Item -ItemType Directory -Path $stage | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
    $source = Join-Path $stage $folderName
    if (-not (Test-Path -LiteralPath (Join-Path $source 'node.exe') -PathType Leaf)) { Fail 'Downloaded Node.js archive is missing node.exe' }
    $target = Join-Path $runtimeRoot $folderName
    if (Test-Path -LiteralPath $target) { Fail 'Incomplete Node.js runtime folder exists; do not overwrite it automatically.' }
    Move-Item -LiteralPath $source -Destination $target
    return $nodeExecutable
  }
  finally {
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
}
function Confirm-Schedule {
  if ($SkipSchedule) { return $false }
  if ($NoPrompt) { return $false }
  $reply = Read-Host 'Enable daily 09:00 Windows scheduled checks? Reports stay weekly/monthly. Type YES to enable'
  return ($reply -ceq 'YES')
}

try {
  Info 'Installing SiranOS local second brain (Windows; per-user; no Google required).'
  if (-not [Environment]::Is64BitOperatingSystem -and $env:PROCESSOR_ARCHITECTURE -ne 'x86') { Fail 'Unsupported Windows environment.' }
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'bridge\cli.mjs') -PathType Leaf)) {
    Fail 'Missing bridge/cli.mjs. Extract the entire ZIP before double-clicking Install-SiranOS.cmd.'
  }
  $local = [Environment]::GetFolderPath('LocalApplicationData')
  if (-not $local) { Fail 'Cannot resolve LOCALAPPDATA.' }
  $apps = Join-Path $local 'Programs\SiranOS'
  $app = Join-Path $apps 'App-0.5.1'
  $state = Join-Path $local 'SiranOS\state-0.5.1'
  $marker = Join-Path $app 'siranos-install-marker.json'
  $node = Find-Node
  if (-not $node) { $node = Download-Node (Join-Path $apps 'Runtime') }
  Info "Node.js found: $node"
  Invoke-Node $node @('--version')

  # Never overwrite an existing directory unless it was created by this installer.
  if (Test-Path -LiteralPath $app) {
    if (-not (Test-Path -LiteralPath $marker)) { Fail "Unknown existing app directory: $app. Please move or inspect it manually." }
    $m = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
    if ($m.product -ne 'SiranOS' -or $m.version -ne '0.5.1') { Fail 'Installed application marker does not match; refusing to overwrite.' }
    Info 'Existing 0.5.1 application installation detected; reusing files without overwriting.'
  } else {
    if (-not (Test-Path -LiteralPath $apps)) { New-Item -ItemType Directory -Path $apps -Force | Out-Null }
    $stageApp = Join-Path $apps ('.install-stage-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stageApp | Out-Null
    try {
      # Source tree is the extracted, synthetic-only distribution. Never copy knowledge files or private databases.
      foreach ($name in @('bridge','docs','extension','examples','tests','.github','scripts','README.md','AGENTS.md','SECURITY.md','LICENSE','package.json','.gitignore','Install-SiranOS.ps1','Install-SiranOS.cmd','一键安装说明.txt')) {
        $src = Join-Path $PSScriptRoot $name
        if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination $stageApp -Recurse -Force }
      }
      if (-not (Test-Path -LiteralPath (Join-Path $stageApp 'bridge\cli.mjs') -PathType Leaf)) { Fail 'Staged installation is incomplete.' }
      $installation = @{product='SiranOS';version='0.5.1';installedAt=[DateTime]::UtcNow.ToString('o')}
      [IO.File]::WriteAllText((Join-Path $stageApp 'siranos-install-marker.json'),($installation|ConvertTo-Json),[Text.Encoding]::UTF8)
      Move-Item -LiteralPath $stageApp -Destination $app
    }
    finally { if (Test-Path -LiteralPath $stageApp) { Remove-Item -LiteralPath $stageApp -Recurse -Force -ErrorAction SilentlyContinue } }
  }
  $env:SIRANOS_HOME = $state
  $cli = Join-Path $app 'bridge\cli.mjs'
  $mcp = Join-Path $app 'bridge\mcp.mjs'
  if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { Fail 'Installed application missing bridge/cli.mjs.' }

  # Keep existing knowledge data untouched. Choose a fresh folder if old unknown data is present.
  $documents = Join-Path $env:USERPROFILE 'Documents'
  $root = Join-Path $documents 'SiranOS'
  $alreadyConfigured = Join-Path $state 'workspace.json'
  if (-not (Test-Path -LiteralPath $alreadyConfigured) -and (Test-Path -LiteralPath $root)) {
    $first = Get-ChildItem -LiteralPath $root -Force -ErrorAction Stop | Select-Object -First 1
    if ($first) {
      $root = Join-Path $documents 'SiranOS-New'
      if (Test-Path -LiteralPath $root) { Fail 'Both SiranOS and SiranOS-New already exist; choose a workspace manually to avoid modifying existing data.' }
      Warn "An existing SiranOS folder was detected. A separate workspace will be created: $root"
    }
  }
  Info 'Creating the local knowledge workspace.'
  if (Test-Path -LiteralPath $alreadyConfigured) { Invoke-Node $node @($cli,'init') }
  else { Invoke-Node $node @($cli,'init','--root',$root,'--frequency','weekly') }
  Invoke-Node $node @($cli,'tick')
  Invoke-Node $node @($cli,'workspace-status')

  $codexConnected = $false
  if (-not $SkipCodex) {
    $codex = Get-Command codex.exe,codex.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($codex) {
      # Never replace a user-defined MCP server with the same name.
      $foundExisting = $false
      try {
        $null = & $codex.Source mcp get siranos --json 2>$null
        $foundExisting = ($LASTEXITCODE -eq 0)
      } catch {
        # `codex mcp get` returns an error for a missing entry; do not fail installation.
        $foundExisting = $false
      }
      if ($foundExisting) {
        Warn 'Codex already has a server named siranos. Leaving the existing entry unchanged; inspect `codex mcp get siranos --json`.'
      } else {
        Info 'Registering SiranOS local MCP in Codex.'
        & $codex.Source mcp add siranos --env "SIRANOS_HOME=$state" -- $node $mcp
        if ($LASTEXITCODE -ne 0) { Warn 'Codex MCP registration failed. SiranOS core installation remains usable.' }
        else { $codexConnected = $true; Info 'Codex MCP registered.' }
      }
    } else { Warn 'Codex CLI not detected. SiranOS is installed; Codex MCP can be connected later with `node bridge/cli.mjs integration`.' }
  }

  $scheduleInstalled = $false
  if (Confirm-Schedule) {
    try { Invoke-Node $node @($cli,'schedule-install'); $scheduleInstalled = $true }
    catch { Warn "Scheduled task was not installed: $($_.Exception.Message)" }
  } else { Info 'Scheduled task not enabled (you may enable it later with Codex).' }

  $result = & $node $cli workspace-status | Out-String | ConvertFrom-Json
  $effectiveRoot = $result.root
  Write-Host "`nSiranOS installed successfully." -ForegroundColor Green
  Write-Host "Program files: $app"
  Write-Host "Private index: $state"
  Write-Host "Knowledge folder: $effectiveRoot"
  Write-Host "Codex MCP added: $codexConnected"
  Write-Host "Daily scheduled checks enabled: $scheduleInstalled"
  Write-Host 'Put files in 01_资料收件箱, then ask Codex to search your SiranOS history.'
  # Optional desktop shortcut: user-owned .lnk with Unicode-safe path; not required for core install.
  try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if ($desktop -and (Test-Path -LiteralPath $desktop)) {
      $shell = New-Object -ComObject WScript.Shell
      $shortcut = $shell.CreateShortcut((Join-Path $desktop 'SiranOS Second Brain.lnk'))
      $shortcut.TargetPath = 'explorer.exe'
      $shortcut.Arguments = '"' + $effectiveRoot + '"'
      $shortcut.Description = 'Open your local SiranOS private second brain'
      $shortcut.Save()
    }
  } catch { Warn "Could not create a desktop shortcut: $($_.Exception.Message)" }
  if (-not $NoPrompt) {
    $reply = Read-Host 'Open the knowledge folder now? (Y/n)'
    if ($reply -ne 'n' -and $reply -ne 'N') { Start-Process -FilePath 'explorer.exe' -ArgumentList @($effectiveRoot) }
  }
  exit 0
} catch {
  Write-Host "`n[SiranOS] INSTALLATION INCOMPLETE: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Existing user data was not intentionally deleted. Fix the error and rerun the installer.' -ForegroundColor Yellow
  exit 1
}
