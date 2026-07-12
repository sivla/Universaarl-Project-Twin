[CmdletBinding()]
param(
  [ValidateSet('Start', 'Status', 'Stop')][string]$Action = 'Start',
  [switch]$OpenBrowser,
  [string]$SourceRepo,
  [string]$StableBranch = 'codex/universaarl-projekt',
  [ValidateRange(1, 65535)][int]$Port = 4173,
  [ValidateRange(5, 300)][int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot ".runtime\twin-local-$Port"
$metadataPath = Join-Path $runtimeRoot 'process.json'
$stdoutPath = Join-Path $runtimeRoot 'stdout.log'
$stderrPath = Join-Path $runtimeRoot 'stderr.log'
$launcherPath = Join-Path $PSScriptRoot 'run-twin-server.ps1'
$url = "http://127.0.0.1:$Port/"
$healthUrl = "http://127.0.0.1:$Port/api/health"

function Get-TwinHealth {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ne 200 -or $response.Headers['X-Universaarl-Service'] -ne 'project-twin') { return $false }
    $body = $response.Content | ConvertFrom-Json
    return $body.application -eq 'project-twin' -and $body.status -eq 'bereit'
  } catch { return $false }
}

function Test-PortOccupied {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return $task.Wait(500) -and $client.Connected
  } catch { return $false } finally { $client.Dispose() }
}

function Read-Metadata {
  if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) { return $null }
  try { return Get-Content -LiteralPath $metadataPath -Raw -Encoding utf8 | ConvertFrom-Json } catch { return $null }
}

function Test-OwnedProcess([object]$metadata) {
  if ($null -eq $metadata -or -not $metadata.pid -or -not $metadata.instanceId) { return $false }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($metadata.pid)" -ErrorAction SilentlyContinue
  if ($null -eq $process) { return $false }
  return $process.CommandLine -like "*$([string]$metadata.instanceId)*" -and $process.CommandLine -like '*run-twin-server.ps1*'
}

function Test-Descendant([int]$ChildPid, [int]$RootPid) {
  $seen = @{}
  $current = $ChildPid
  while ($current -gt 0 -and -not $seen.ContainsKey($current)) {
    if ($current -eq $RootPid) { return $true }
    $seen[$current] = $true
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $current" -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $false }
    $current = [int]$process.ParentProcessId
  }
  return $false
}

function Stop-OwnedTree([object]$metadata) {
  if (-not (Test-OwnedProcess $metadata)) { throw 'Der gespeicherte Prozess gehört nicht nachweislich zu diesem Twin-Starter. Es wurde nichts beendet.' }
  $rootPid = [int]$metadata.pid
  $listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $listener -and -not (Test-Descendant ([int]$listener.OwningProcess) $rootPid)) {
    throw "Port $Port gehört nicht zum gespeicherten Twin-Prozess. Es wurde nichts beendet."
  }
  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  function Stop-Children([int]$ParentPid) {
    foreach ($child in @($all | Where-Object { [int]$_.ParentProcessId -eq $ParentPid })) {
      Stop-Children ([int]$child.ProcessId)
      Stop-Process -Id ([int]$child.ProcessId) -Force -ErrorAction SilentlyContinue
    }
  }
  Stop-Children $rootPid
  Stop-Process -Id $rootPid -Force -ErrorAction SilentlyContinue
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  while ((Test-PortOccupied) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
  if (Test-PortOccupied) { throw 'Der eigene Twin-Prozess wurde beendet, aber der Port ist weiterhin belegt.' }
  Remove-Item -LiteralPath $metadataPath -Force -ErrorAction SilentlyContinue
}

try {
  if ($Action -eq 'Status') {
    if (Get-TwinHealth) { Write-Host "Project Twin ist bereit: $url"; exit 0 }
    if (Test-PortOccupied) { Write-Error "Port $Port ist belegt, antwortet aber nicht als gesunder Project Twin."; exit 2 }
    Write-Error 'Project Twin läuft derzeit nicht.'; exit 1
  }

  if ($Action -eq 'Stop') {
    $metadata = Read-Metadata
    if ($null -eq $metadata) { Write-Error 'Es ist kein vom lokalen Starter erzeugter Twin-Prozess registriert. Es wurde nichts beendet.'; exit 1 }
    Stop-OwnedTree $metadata
    Write-Host 'Der eigene lokale Project Twin wurde beendet.'
    exit 0
  }

  if (Get-TwinHealth) {
    Write-Host "Project Twin ist bereits bereit: $url"
    if ($OpenBrowser) { Start-Process $url }
    exit 0
  }
  if (Test-PortOccupied) { Write-Error "Port $Port ist bereits durch einen fremden oder ungesunden Dienst belegt. Es wurde nichts gestartet oder beendet."; exit 2 }

  if ([string]::IsNullOrWhiteSpace($SourceRepo)) { $SourceRepo = $env:UABC_SOURCE_REPO }
  if ([string]::IsNullOrWhiteSpace($SourceRepo)) { $SourceRepo = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '..\Universaarl Projekt BC Basic')) }
  if (-not (Test-Path -LiteralPath $SourceRepo -PathType Container)) { Write-Error 'Das konfigurierte BC-Basic-Repository ist nicht verfügbar.'; exit 1 }
  if ($StableBranch -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$' -or $StableBranch.Contains('..') -or $StableBranch.Contains('//')) { Write-Error 'Der konfigurierte Freigabebranch ist ungültig.'; exit 1 }

  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  Remove-Item -LiteralPath $metadataPath -Force -ErrorAction SilentlyContinue
  $instanceId = [Guid]::NewGuid().ToString('N')
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File', "`"$launcherPath`"",
    '-ProjectRoot', "`"$projectRoot`"",
    '-SourceRepo', "`"$SourceRepo`"",
    '-StableBranch', "`"$StableBranch`"",
    '-InstanceId', $instanceId,
    '-Port', [string]$Port
  )
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  $metadata = [ordered]@{ schemaVersion = 1; pid = $process.Id; instanceId = $instanceId; port = $Port; projectRoot = $projectRoot; startedAt = [DateTime]::UtcNow.ToString('o') }
  $temporaryMetadata = "$metadataPath.tmp"
  $metadata | ConvertTo-Json | Set-Content -LiteralPath $temporaryMetadata -Encoding utf8
  Move-Item -LiteralPath $temporaryMetadata -Destination $metadataPath -Force

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Get-TwinHealth) {
      Write-Host "Project Twin ist bereit: $url"
      if ($OpenBrowser) { Start-Process $url }
      exit 0
    }
    if ($process.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  if (Test-OwnedProcess $metadata) { Stop-OwnedTree $metadata }
  Write-Error "Project Twin wurde innerhalb von $TimeoutSeconds Sekunden nicht gesund. Die Protokolle liegen unter .runtime/."
  exit 1
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
