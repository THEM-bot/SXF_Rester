#Requires -Version 5.1
<#
.SYNOPSIS
  研效通 Demo 一键上传（D03/D04）：multipart + verify + 可选回写本地会话。

.NOTES
  **Windows 专用**（HttpClient，避免 curl -F 中文 metadata 乱码）。
  **macOS / Linux / WSL**：请用同目录 `upload-demo.sh`。
  地址 SSOT：`tools/lib/env-registry.json`（经 env-session lookup）。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('d03', 'd04')][string]$Mode,
  [Parameter(Mandatory)][ValidateSet('生产', 'UAT', '本地')][string]$Environment,
  [Parameter(Mandatory)][string]$ZipPath,
  [string]$Token,
  [string]$Name,
  [string]$DemoId,
  [string]$BusinessDomainName,
  [string]$AppServiceName,
  [string]$BusinessDomainId,
  [string]$AppServiceId,
  [string]$ProjectRoot,
  [switch]$SaveSession,
  [switch]$NoVerify
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packRoot = Split-Path -Parent $toolsDir
$legacySessionPath = Join-Path $packRoot 'reference/upload-session.local.md'
$verifyJs = Join-Path $packRoot 'scripts/verify-upload-response.js'
. (Join-Path $toolsDir 'lib/token-path.ps1')

$baseUrl = Get-YxtEnvField -Environment $Environment -Field base_url
$previewOrigin = Get-YxtEnvField -Environment $Environment -Field web_origin

function Rewrite-AccessUrlPreview {
  param([string]$Url)
  if (-not $Url -or -not $previewOrigin) { return $Url }
  try {
    $u = [Uri]$Url
    return ($previewOrigin.TrimEnd('/') + $u.PathAndQuery)
  } catch { return $Url }
}

function Strip-ExperienceFullscreenFlags([string]$Url) {
  if (-not $Url) { return $Url }
  if ($Url -notmatch '[?&]exp=(1|true)(&|$)') { return $Url }
  $out = $Url
  $out = $out -replace '&f=1', '' -replace '\?f=1&', '?' -replace '\?f=1$', ''
  $out = $out -replace '&expFs=1', '' -replace '\?expFs=1&', '?' -replace '\?expFs=1$', ''
  return $out
}

function Normalize-AccessUrlForDelivery {
  param([string]$Url)
  return (Strip-ExperienceFullscreenFlags (Rewrite-AccessUrlPreview $Url))
}

function Build-DemoDetailShareUrl {
  param([string]$DemoId)
  if (-not $DemoId -or -not $previewOrigin) { return '' }
  return ($previewOrigin.TrimEnd('/') + '/app/requirements/demos?d=' + [Uri]::EscapeDataString([string]$DemoId))
}

function Invoke-VerifyJson([string]$json) {
  if ($NoVerify) { return }
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.UTF8Encoding]::new($false))
    & node $verifyJs $tmp
    if ($LASTEXITCODE -ne 0) { throw 'verify-upload-response failed' }
  } finally {
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
  }
}

function Invoke-MultipartUpload([string]$Url, [string]$Token, [string]$ZipPath, [string]$MetadataJson) {
  $client = New-Object System.Net.Http.HttpClient
  $client.DefaultRequestHeaders.Add('X-Open-Api-Token', $Token)
  $content = New-Object System.Net.Http.MultipartFormDataContent
  if ($MetadataJson) {
    $metaContent = New-Object System.Net.Http.StringContent($MetadataJson, [System.Text.Encoding]::UTF8, 'application/json')
    $content.Add($metaContent, 'metadata')
  }
  $fileBytes = [System.IO.File]::ReadAllBytes($ZipPath)
  $fileContent = New-Object System.Net.Http.ByteArrayContent(,( [byte[]]$fileBytes ))
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/zip')
  $content.Add($fileContent, 'file', [System.IO.Path]::GetFileName($ZipPath))
  $response = $client.PostAsync($Url, $content).GetAwaiter().GetResult()
  $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  return @{ HttpCode = [int]$response.StatusCode; Body = $body }
}

if (-not (Test-Path $ZipPath)) { throw "Zip not found: $ZipPath" }
if (-not $baseUrl) { throw "Unknown environment: $Environment" }

if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }

$session = Read-YxtSession -Environment $Environment -LegacyPackSessionPath $legacySessionPath -ProjectRoot $ProjectRoot
if (-not $Token) { $Token = Resolve-YxtToken -CliToken '' -SessionPath $legacySessionPath -Environment $Environment }
if (-not $Token) {
  throw 'Token required: -Token, YXT_OPEN_API_TOKEN, or per-environment file under .yanxiaotong\tokens\'
}

if ($Mode -eq 'd03') {
  if (-not $Name -and $session.d03.name) { $Name = $session.d03.name }
  if (-not $Name) { throw 'D03 requires -Name or d03.name in session file' }
  if (-not $BusinessDomainName -and $session.d03.businessDomainName) { $BusinessDomainName = $session.d03.businessDomainName }
  if (-not $AppServiceName -and $session.d03.appServiceName) { $AppServiceName = $session.d03.appServiceName }
  if (-not $BusinessDomainId -and $session.d03.businessDomainId) { $BusinessDomainId = $session.d03.businessDomainId }
  if (-not $AppServiceId -and $session.d03.appServiceId) { $AppServiceId = $session.d03.appServiceId }
  $metaObj = @{ name = $Name }
  if ($BusinessDomainId) { $metaObj.businessDomainId = $BusinessDomainId }
  if ($BusinessDomainName) { $metaObj.businessDomainName = $BusinessDomainName }
  if ($AppServiceId) { $metaObj.appServiceId = $AppServiceId }
  if ($AppServiceName) { $metaObj.appServiceName = $AppServiceName }
  $meta = $metaObj | ConvertTo-Json -Compress -Depth 3
  $result = Invoke-MultipartUpload "$baseUrl/api/open/demos/package-upload" $Token $ZipPath $meta
} else {
  if (-not $DemoId -and $session.d04.demo_id) { $DemoId = $session.d04.demo_id }
  if (-not $DemoId) { throw 'D04 requires -DemoId or d04.demo_id in session file' }
  $result = Invoke-MultipartUpload "$baseUrl/api/open/demos/$DemoId/package-upload" $Token $ZipPath $null
}

$httpCode = $result.HttpCode
$body = $result.Body
$curlExit = if ($httpCode -eq 200) { 0 } else { 1 }

if ($body) {
  try { Invoke-VerifyJson $body } catch { Write-Warning $_.Exception.Message }
}

$status = 'failed'
if ($body) {
  try {
    $parsed = $body | ConvertFrom-Json
    if ($parsed.success -eq $true -and $parsed.data) {
      $status = 'ok'
      $accessUrl = $parsed.data.accessUrl
      $demoIdOut = $parsed.data.demoId
      $demoCode = $parsed.data.demoCode
      if ($accessUrl) { $accessUrl = Normalize-AccessUrlForDelivery $accessUrl }
    } elseif ($parsed.message) {
      $status = "failed ($($parsed.message))"
    }
  } catch { $status = 'failed (invalid JSON)' }
}

if ($SaveSession -and $httpCode -eq 200 -and $parsed.success -eq $true) {
  $session.last_environment = $Environment
  $session.updated_at = (Get-Date).ToString('o')
  if ($Mode -eq 'd03') {
    $session.d03.name = $Name
    if ($BusinessDomainName) { $session.d03.businessDomainName = $BusinessDomainName }
    if ($AppServiceName) { $session.d03.appServiceName = $AppServiceName }
    if ($BusinessDomainId) { $session.d03.businessDomainId = $BusinessDomainId }
    if ($AppServiceId) { $session.d03.appServiceId = $AppServiceId }
  } else {
    if (-not $session.d04) { $session.d04 = @{} }
    $session.d04.demo_id = if ($demoIdOut) { "$demoIdOut" } elseif ($DemoId -match '^\d+$') { $DemoId } else { '' }
    $session.d04.demo_code = if ($demoCode) { "$demoCode" } elseif ($DemoId -match '^DEMO-') { $DemoId } else { '' }
  }
  Write-YxtSession -Data $session -Environment $Environment -ProjectRoot $ProjectRoot
}

$snippet = if ($body.Length -gt 400) { $body.Substring(0, 400) + '...' } else { $body }
$ok = ($httpCode -eq 200) -and ($status -eq 'ok')
Write-Host "[agent] zip=$ZipPath http=$httpCode" -ForegroundColor DarkGray
Write-Host "[agent] snippet=$snippet" -ForegroundColor DarkGray
if ($ok) {
  Write-Host "上传成功。流程结束。"
  Write-Host ""
  Write-Host "| 项目 | 内容 |"
  Write-Host "|------|------|"
  if ($demoIdOut) { Write-Host "| Demo 编号 | $demoIdOut |" }
  if ($demoCode) { Write-Host "| Demo 编码 | $demoCode |" }
  $link = if ($accessUrl) { $accessUrl } else { '（响应未返回）' }
  Write-Host "| 访问链接 | $link |"
  $detail = Build-DemoDetailShareUrl $demoIdOut
  if ($detail) { Write-Host "| 详情页链接 | $detail |" }
} else {
  Write-Host "上传失败。"
  Write-Host ""
  Write-Host "原因：$status"
  Write-Host ""
  Write-Host "未返回有效访问链接，请勿使用猜测链接。"
}

if (-not $ok) { exit 1 }
exit 0
