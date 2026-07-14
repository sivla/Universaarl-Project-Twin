[CmdletBinding()]
param(
  [ValidateSet('Start', 'Status', 'Stop')][string]$Action = 'Start',
  [switch]$OpenBrowser,
  [string]$Config,
  [ValidateRange(1, 65535)][int]$Port = 4173,
  [ValidateRange(5, 300)][int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$starter = Join-Path $PSScriptRoot 'twin-local.mjs'
$arguments = @($starter, $Action.ToLowerInvariant(), '--port', [string]$Port, '--timeout', [string]$TimeoutSeconds)
if (-not [string]::IsNullOrWhiteSpace($Config)) { $arguments += @('--config', $Config) }
if ($OpenBrowser) { $arguments += '--open' }

Push-Location -LiteralPath $projectRoot
try {
  & node @arguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
