#Requires -Version 5.1
<#
.SYNOPSIS
  Open API metadata (M01 domains / M03 app-services) for D03 selection.
.NOTES
  Windows fallback. Prefer tools/fetch-metadata.mjs on Agent.
#>[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('domains', 'app-services')][string]$Kind,
  [Parameter(Mandatory)][ValidateSet('生产', 'UAT', '本地')][string]$Environment,
  [string]$Token,
  [string]$BusinessDomainId,
  [string]$Keyword,
  [int]$Current = 1,
  [int]$Size = 50,
  [switch]$FetchAll,
  [int]$PickIndex,
  [ValidateSet('list', 'json')][string]$OutputFormat = 'list'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packRoot = Split-Path -Parent $toolsDir
$legacySessionPath = Join-Path $packRoot 'reference/upload-session.local.md'
. (Join-Path $toolsDir 'lib/token-path.ps1')

$baseUrl = Get-YxtEnvField -Environment $Environment -Field base_url

function Invoke-MetadataGet([string]$Url, [string]$Token) {
  $client = New-Object System.Net.Http.HttpClient
  $client.DefaultRequestHeaders.Add('X-Open-Api-Token', $Token)
  $response = $client.GetAsync($Url).GetAwaiter().GetResult()
  $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  return @{ HttpCode = [int]$response.StatusCode; Body = $body }
}

function Build-QueryString([hashtable]$Params) {
  $pairs = @()
  foreach ($key in $Params.Keys) {
    $val = $Params[$key]
    if ($null -eq $val -or "$val" -eq '') { continue }
    $pairs += ('{0}={1}' -f [uri]::EscapeDataString($key), [uri]::EscapeDataString("$val"))
  }
  if ($pairs.Count -eq 0) { return '' }
  return '?' + ($pairs -join '&')
}

if ($Kind -eq 'app-services' -and -not $BusinessDomainId) {
  throw 'app-services requires -BusinessDomainId (from a prior domains query)'
}

if (-not $baseUrl) { throw "Unknown environment: $Environment" }

if (-not $Token) { $Token = Resolve-YxtToken -CliToken '' -SessionPath $legacySessionPath -Environment $Environment }
if (-not $Token) {
  throw 'Token required: -Token, YXT_OPEN_API_TOKEN, or per-environment file under .yanxiaotong\tokens\'
}

$query = @{
  current = $Current
  size    = $Size
}
if ($Keyword) { $query.keyword = $Keyword }
if ($FetchAll) { $query.fetchAll = 'true' }

if ($Kind -eq 'domains') {
  $apiId = 'M01'
  $apiLabel = 'business-domains'
  $path = '/api/open/metadata/business-domains'
} else {
  $apiId = 'M03'
  $apiLabel = 'app-services'
  $path = '/api/open/metadata/app-services'
  $query.businessDomainId = $BusinessDomainId
}

$url = "$baseUrl$path$(Build-QueryString $query)"
$result = Invoke-MetadataGet $url $Token
$httpCode = $result.HttpCode
$body = $result.Body

if ($httpCode -ne 200) {
  Write-Host "[agent] api=$apiId http=$httpCode" -ForegroundColor DarkGray
  Write-Host "元数据拉取失败：HTTP $httpCode"
  if ($body) { Write-Host "[agent] snippet=$($body.Substring(0, [Math]::Min(400, $body.Length)))" -ForegroundColor DarkGray }
  exit 1
}

$parsed = $null
$records = @()
$total = 0
try {
  $parsed = $body | ConvertFrom-Json
  if ($parsed.success -ne $true) {
    $msg = if ($parsed.message) { $parsed.message } else { 'success=false' }
    Write-Host "[agent] api=$apiId success=false" -ForegroundColor DarkGray
    Write-Host "元数据拉取失败：$msg"
    exit 1
  }
  if ($parsed.data) {
    $total = [int]$parsed.data.total
    if ($parsed.data.records) { $records = @($parsed.data.records) }
  }
} catch {
  Write-Host "[agent] invalid JSON" -ForegroundColor DarkGray
  Write-Host "元数据拉取失败：响应不是有效 JSON"
  exit 1
}

if ($records.Count -eq 0) {
  Write-Host "[agent] api=$apiId total=0" -ForegroundColor DarkGray
  Write-Host "元数据拉取失败：没有可选记录，请勿手填编号"
  exit 1
}

if ($PickIndex -gt 0) {
  if ($PickIndex -gt $records.Count) {
    Write-Error "PickIndex $PickIndex out of range (1..$($records.Count))"
  }
  $picked = $records[$PickIndex - 1]
  if ($OutputFormat -eq 'json') {
    $picked | ConvertTo-Json -Compress -Depth 3
  } else {
    Write-Host "[agent] picked index=$PickIndex id=$($picked.id)" -ForegroundColor DarkGray
    Write-Host "已选择：$($picked.name)"
  }
  exit 0
}

if ($OutputFormat -eq 'json') {
  @{
    api         = $apiId
    kind        = $Kind
    environment = $Environment
    total       = $total
    records     = $records
  } | ConvertTo-Json -Compress -Depth 5
  exit 0
}

Write-Host "[agent] api=$apiId total=$total env=$Environment" -ForegroundColor DarkGray
Write-Host '请选择（回复序号）：'
for ($i = 0; $i -lt $records.Count; $i++) {
  $n = $i + 1
  $r = $records[$i]
  Write-Host "$n. $($r.name)"
}
exit 0
