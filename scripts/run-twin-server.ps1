[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectRoot,
  [Parameter(Mandatory = $true)][string]$SourceRepo,
  [Parameter(Mandatory = $true)][string]$StableBranch,
  [Parameter(Mandatory = $true)][string]$InstanceId,
  [Parameter(Mandatory = $true)][ValidateRange(1, 65535)][int]$Port
)

$ErrorActionPreference = 'Stop'
$env:UABC_SOURCE_REPO = $SourceRepo
$env:UABC_STABLE_BRANCH = $StableBranch
$env:UABC_TWIN_INSTANCE_ID = $InstanceId
$env:UABC_INTEGRATION_COMMIT = $null
$env:UABC_INTEGRATION_TREE = $null
Set-Location -LiteralPath $ProjectRoot
& npm.cmd run dev -- --host 127.0.0.1 --port $Port --strictPort
exit $LASTEXITCODE
