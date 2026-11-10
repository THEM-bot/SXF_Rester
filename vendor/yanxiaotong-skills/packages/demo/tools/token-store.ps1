#Requires -Version 5.1
<#
.SYNOPSIS
  Open API token local store (Windows fallback when Node unavailable).
  Prefer: node tools/token-store.mjs (cross-platform)
  SSOT: reference/upload/token-store.md
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('info', 'resolve', 'write', 'delete', 'mask')]
  [string]$Action = 'info',
  [string]$Token,
  [ValidateSet('生产', 'UAT', '本地')]
  [string]$Environment
)

$ErrorActionPreference = 'Stop'
$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packRoot = Split-Path -Parent $toolsDir
$legacySessionPath = Join-Path $packRoot 'reference/upload-session.local.md'
. (Join-Path $toolsDir 'lib/token-path.ps1')

function Mask-YxtToken([string]$Value) {
  $t = $Value.Trim()
  if (-not $t) { return '(not configured)' }
  if ($t.Length -le 12) { return 'ehub_live_...****' }
  return "$($t.Substring(0, 9))...$($t.Substring($t.Length - 4))"
}

switch ($Action) {
  'info' {
    $i = Get-YxtTokenStoreInfo -Environment $Environment
    if ($Environment) {
      $exists = Test-Path -LiteralPath $i.File
      [PSCustomObject]@{
        env         = $i.Env
        dir         = $i.Dir
        tokensDir   = $i.TokensDir
        environment = $i.Environment
        file        = $i.File
        platform    = $i.Platform
        homedir     = $i.Homedir
        displayPath = $i.DisplayPath
        exists      = $exists
      } | ConvertTo-Json
    } else {
      Get-YxtTokenStoreInfo | ConvertTo-Json
    }
  }
  'resolve' {
    $t = Resolve-YxtToken -CliToken $Token -SessionPath $legacySessionPath -Environment $Environment
    if (-not $t) {
      Write-Error 'No token: set YXT_OPEN_API_TOKEN, save with -Environment, or pass -Token'
    }
    Write-Output $t
  }
  'write' {
    if (-not $Token) { throw 'write requires -Token' }
    if (-not $Environment) { throw 'write requires -Environment 生产|UAT|本地' }
    Save-YxtToken -Token $Token -Environment $Environment
    $f = Get-YxtTokenFileForEnvironment -Environment $Environment
    Write-Host "OK: $f"
  }
  'delete' {
    Remove-YxtToken -Environment $Environment
    if ($Environment) {
      Write-Host "OK: token removed for $Environment"
    } else {
      Write-Host 'OK: all saved tokens removed'
    }
  }
  'mask' {
    $src = if ($Token) { $Token } else { Resolve-YxtToken -CliToken '' -SessionPath $legacySessionPath -Environment $Environment }
    Write-Host (Mask-YxtToken $src)
  }
  default { throw "Unknown action: $Action" }
}
