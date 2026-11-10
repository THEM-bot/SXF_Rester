# 开放 API 令牌路径与解析（Windows · PowerShell 5.1+）
# SSOT：reference/upload/token-store.md — 供 upload-demo.ps1、fetch-metadata.ps1、token-store.ps1 点源

$script:YxtTokenEnvName = 'YXT_OPEN_API_TOKEN'
$script:YxtTokenDir = Join-Path $env:USERPROFILE '.yanxiaotong'
$script:YxtSessionSubDir = Join-Path $script:YxtTokenDir 'sessions'
$script:YxtTokenSubDir = Join-Path $script:YxtTokenDir 'tokens'
$script:YxtTokenFile = Join-Path $script:YxtTokenDir 'YXT_OPEN_API_TOKEN'

$script:YxtEnvSlug = @{
  '本地' = 'local'
  'UAT'  = 'uat'
  '生产' = 'prod'
}

$script:YxtSkillRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))

function Get-YxtEnvField {
  param(
    [Parameter(Mandatory)][string]$Environment,
    [string]$Field = 'base_url'
  )
  $envSession = Join-Path $script:YxtSkillRoot 'tools\env-session.mjs'
  $out = & node $envSession lookup --environment $Environment --field $Field
  if ($LASTEXITCODE -ne 0) { throw "Unknown environment: $Environment" }
  return ("$out").Trim()
}

function Get-YxtTokenFileForEnvironment {
  param([Parameter(Mandatory)][string]$Environment)
  $slug = $script:YxtEnvSlug[$Environment]
  if (-not $slug) { throw "Unknown environment: $Environment" }
  Join-Path $script:YxtTokenSubDir $slug
}

function Get-YxtTokenStoreInfo {
  param([string]$Environment)
  if ($Environment) {
    $file = Get-YxtTokenFileForEnvironment -Environment $Environment
    [PSCustomObject]@{
      Env         = $script:YxtTokenEnvName
      Dir         = $script:YxtTokenDir
      TokensDir   = $script:YxtTokenSubDir
      Environment = $Environment
      Slug        = $script:YxtEnvSlug[$Environment]
      File        = $file
      Platform    = 'win32'
      DisplayPath = $file
      Homedir     = $env:USERPROFILE
    }
    return
  }
  [PSCustomObject]@{
    Env         = $script:YxtTokenEnvName
    Dir         = $script:YxtTokenDir
    TokensDir   = $script:YxtTokenSubDir
    LegacyFile  = $script:YxtTokenFile
    Platform    = 'win32'
    DisplayPath = $script:YxtTokenSubDir
    Homedir     = $env:USERPROFILE
  }
}

function Read-YxtLegacyTokenFile {
  if (-not (Test-Path -LiteralPath $script:YxtTokenFile)) { return '' }
  $raw = [System.IO.File]::ReadAllText($script:YxtTokenFile, [System.Text.UTF8Encoding]::new($false))
  return $raw.Trim().TrimStart([char]0xFEFF)
}

function Resolve-YxtToken {
  param(
    [string]$CliToken,
    [string]$SessionPath,
    [string]$Environment
  )
  if ($CliToken) { return $CliToken.Trim() }
  $fromEnv = $env:YXT_OPEN_API_TOKEN
  if ($fromEnv) { return $fromEnv.Trim() }
  if ($Environment) {
    $envFile = Get-YxtTokenFileForEnvironment -Environment $Environment
    if (Test-Path -LiteralPath $envFile) {
      $raw = [System.IO.File]::ReadAllText($envFile, [System.Text.UTF8Encoding]::new($false))
      return $raw.Trim().TrimStart([char]0xFEFF)
    }
    $legacy = Read-YxtLegacyTokenFile
    if ($legacy -and $SessionPath -and (Test-Path -LiteralPath $SessionPath)) {
      foreach ($line in Get-Content -LiteralPath $SessionPath -Encoding UTF8) {
        if ($line -match '^last_environment:\s*(.*)$') {
          if ($Matches[1].Trim() -eq $Environment) {
            Save-YxtToken -Token $legacy -Environment $Environment
            if (Test-Path -LiteralPath $script:YxtTokenFile) {
              Remove-Item -LiteralPath $script:YxtTokenFile -Force
            }
            return $legacy
          }
          break
        }
      }
    }
    return ''
  }
  if (Test-Path -LiteralPath $script:YxtTokenFile) {
    return (Read-YxtLegacyTokenFile)
  }
  if ($SessionPath -and (Test-Path -LiteralPath $SessionPath)) {
    foreach ($line in Get-Content -LiteralPath $SessionPath -Encoding UTF8) {
      if ($line -match '^token:\s*(.*)$') { return $Matches[1].Trim() }
    }
  }
  return ''
}

function Save-YxtToken {
  param(
    [Parameter(Mandatory)][string]$Token,
    [Parameter(Mandatory)][string]$Environment
  )
  $t = $Token.Trim()
  if (-not $t) { throw 'Token is empty' }
  $target = Get-YxtTokenFileForEnvironment -Environment $Environment
  $dir = Split-Path -Parent $target
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  [System.IO.File]::WriteAllText($target, "$t`n", [System.Text.UTF8Encoding]::new($false))
  $user = $env:USERNAME
  if ($user) {
    & icacls $target /inheritance:r /grant:r "${user}:F" 2>$null | Out-Null
  }
  if (Test-Path -LiteralPath $script:YxtTokenFile) {
    Remove-Item -LiteralPath $script:YxtTokenFile -Force
  }
}

function Remove-YxtToken {
  param([string]$Environment)
  if ($Environment) {
    $f = Get-YxtTokenFileForEnvironment -Environment $Environment
    if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force }
    return
  }
  if (Test-Path -LiteralPath $script:YxtTokenSubDir) {
    foreach ($slug in $script:YxtEnvSlug.Values) {
      $f = Join-Path $script:YxtTokenSubDir $slug
      if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force }
    }
  }
  if (Test-Path -LiteralPath $script:YxtTokenFile) {
    Remove-Item -LiteralPath $script:YxtTokenFile -Force
  }
}

function Get-YxtProjectSlug {
  param([string]$ProjectRoot)
  $p = if ($ProjectRoot) { $ProjectRoot } else { (Get-Location).Path }
  $p = [System.IO.Path]::GetFullPath($p)
  if ($env:OS -match 'Windows') { $p = $p.ToLowerInvariant() }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($p))
  $hex = [BitConverter]::ToString($bytes).Replace('-', '').ToLower()
  return $hex.Substring(0, 16)
}

function Get-YxtSessionFileForEnvironment {
  param(
    [Parameter(Mandatory)][string]$Environment,
    [string]$ProjectRoot
  )
  $envSlug = $script:YxtEnvSlug[$Environment]
  if (-not $envSlug) { throw "Unknown environment: $Environment" }
  $projSlug = Get-YxtProjectSlug -ProjectRoot $ProjectRoot
  Join-Path (Join-Path $script:YxtSessionSubDir $envSlug) $projSlug
}

function Parse-YxtSessionText {
  param([string]$Text)
  $s = @{ last_environment = ''; d03 = @{}; d04 = @{}; updated_at = '' }
  $section = $null
  foreach ($line in ($Text -split "`r?`n")) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }
    if ($line -match '^(\w+):\s*(.*)$' -and $line -notmatch '^\s') {
      $section = $Matches[1]
      $val = $Matches[2].Trim()
      if ($section -eq 'last_environment' -or $section -eq 'updated_at') {
        $s[$section] = $val
      }
      continue
    }
    if ($line -match '^\s{2}(\w+):\s*(.*)$' -and $section -in 'd03', 'd04') {
      $s[$section][$Matches[1]] = $Matches[2].Trim()
    }
  }
  return $s
}

function Read-YxtSession {
  param(
    [Parameter(Mandatory)][string]$Environment,
    [string]$LegacyPackSessionPath,
    [string]$ProjectRoot
  )
  $empty = @{ last_environment = $Environment; d03 = @{}; d04 = @{}; updated_at = '' }
  $file = Get-YxtSessionFileForEnvironment -Environment $Environment -ProjectRoot $ProjectRoot
  if (Test-Path -LiteralPath $file) {
    return Parse-YxtSessionText ([System.IO.File]::ReadAllText($file, [System.Text.UTF8Encoding]::new($false)))
  }
  $envSlug = $script:YxtEnvSlug[$Environment]
  $flat = Join-Path $script:YxtSessionSubDir $envSlug
  if (Test-Path -LiteralPath $flat -PathType Leaf) {
    $legacyFlat = Parse-YxtSessionText ([System.IO.File]::ReadAllText($flat, [System.Text.UTF8Encoding]::new($false)))
    Write-YxtSession -Data $legacyFlat -Environment $Environment -ProjectRoot $ProjectRoot
    Remove-Item -LiteralPath $flat -Force
    return $legacyFlat
  }
  if ($LegacyPackSessionPath -and (Test-Path -LiteralPath $LegacyPackSessionPath)) {
    $legacy = Parse-YxtSessionText ([System.IO.File]::ReadAllText($LegacyPackSessionPath, [System.Text.UTF8Encoding]::new($false)))
    if ($legacy.last_environment -eq $Environment) {
      Write-YxtSession -Data $legacy -Environment $Environment -ProjectRoot $ProjectRoot
      Remove-Item -LiteralPath $LegacyPackSessionPath -Force
      return $legacy
    }
  }
  return $empty
}

function Write-YxtSession {
  param(
    [Parameter(Mandatory)][hashtable]$Data,
    [Parameter(Mandatory)][string]$Environment,
    [string]$ProjectRoot
  )
  $file = Get-YxtSessionFileForEnvironment -Environment $Environment -ProjectRoot $ProjectRoot
  $dir = Split-Path -Parent $file
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $d03 = $Data.d03
  if (-not $d03) { $d03 = @{} }
  $d04 = $Data.d04
  if (-not $d04) { $d04 = @{} }
  $root = if ($ProjectRoot) { [System.IO.Path]::GetFullPath($ProjectRoot) } else { '' }
  $projSlug = if ($root) { Get-YxtProjectSlug -ProjectRoot $root } else { '' }
  $text = @"
# yanxiaotong-demo upload session ($Environment)
# token → $env:USERPROFILE\.yanxiaotong\tokens\
# project: $root
# project_slug: $projSlug

last_environment: $Environment

d03:
  name: $($d03.name)
  businessDomainId: $($d03.businessDomainId)
  businessDomainName: $($d03.businessDomainName)
  appServiceId: $($d03.appServiceId)
  appServiceName: $($d03.appServiceName)

d04:
  demo_id: $($d04.demo_id)
  demo_code: $($d04.demo_code)

updated_at: $($Data.updated_at)
"@
  [System.IO.File]::WriteAllText($file, $text, [System.Text.UTF8Encoding]::new($false))
}

function Remove-YxtSession {
  param(
    [string]$Environment,
    [string]$LegacyPackSessionPath,
    [string]$ProjectRoot
  )
  if ($Environment -and $ProjectRoot) {
    $f = Get-YxtSessionFileForEnvironment -Environment $Environment -ProjectRoot $ProjectRoot
    if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force }
    return
  }
  if ($Environment) {
    $envSlug = $script:YxtEnvSlug[$Environment]
    $envDir = Join-Path $script:YxtSessionSubDir $envSlug
    if (Test-Path -LiteralPath $envDir) { Remove-Item -LiteralPath $envDir -Recurse -Force }
    return
  }
  if (Test-Path -LiteralPath $script:YxtSessionSubDir) {
    Remove-Item -LiteralPath $script:YxtSessionSubDir -Recurse -Force
  }
  if ($LegacyPackSessionPath -and (Test-Path -LiteralPath $LegacyPackSessionPath)) {
    Remove-Item -LiteralPath $LegacyPackSessionPath -Force
  }
}
