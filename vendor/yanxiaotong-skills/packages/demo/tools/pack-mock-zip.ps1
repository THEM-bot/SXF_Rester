# pack-mock-zip.ps1 - ZIP with forward slashes for Linux unzip. See reference/pack/zip-output.md.
# Prefer tools/pack-mock-zip.mjs on Windows Agent (avoids PS 5.1 UTF-8 parser issues).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/pack-mock-zip.ps1 -Source dist -OutZip out.zip
param(
    [Parameter(Mandatory = $true, HelpMessage = "产物根目录，例如 Vite 的 dist")]
    [string] $Source,
    [Parameter(Mandatory = $true, HelpMessage = "输出 .zip 的完整或相对路径")]
    [string] $OutZip
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Resolve-OutPath {
    param([string] $P)
    if ([System.IO.Path]::IsPathRooted($P)) { return [System.IO.Path]::GetFullPath($P) }
    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $P))
}

$sourceFull = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath $sourceFull -PathType Container)) {
    Write-Error "Source is not a directory: $sourceFull"
}

$indexPath = Join-Path $sourceFull 'index.html'
if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    Write-Error @"
打包失败：源目录根下缺少 index.html，禁止打出无内容 Demo 包。
路径：$sourceFull
要求：须存在非空（去掉 BOM/空白后仍有内容）的 index.html。请补全页面后重试。
"@
}
$indexInfo = Get-Item -LiteralPath $indexPath
if ($indexInfo.Length -eq 0) {
    Write-Error @"
打包失败：index.html 为空，禁止打出无内容 Demo 包。
路径：$indexPath
要求：index.html 去掉 BOM/空白后须有可见内容。请补全页面后重试。
"@
}
$raw = [System.IO.File]::ReadAllText($indexPath)
$raw = $raw -replace '^\uFEFF', ''
if ([string]::IsNullOrWhiteSpace($raw)) {
    Write-Error @"
打包失败：index.html 为空，禁止打出无内容 Demo 包。
路径：$indexPath
要求：index.html 去掉 BOM/空白后须有可见内容。请补全页面后重试。
"@
}

$outFull = Resolve-OutPath -P $OutZip
$parent = Split-Path -Parent $outFull
if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}
if (Test-Path -LiteralPath $outFull) {
    Remove-Item -LiteralPath $outFull -Force
}

$zipStream = [System.IO.File]::Open(
    $outFull,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::ReadWrite
)
$zip = New-Object System.IO.Compression.ZipArchive(
    $zipStream,
    [System.IO.Compression.ZipArchiveMode]::Create
)
try {
    $files = [System.Collections.Generic.List[string]]::new()
    Get-ChildItem -LiteralPath $sourceFull -Recurse -File | ForEach-Object { $files.Add($_.FullName) }
    if ($files.Count -eq 0) {
        Write-Error "No files under source: $sourceFull"
    }
    $prefixLen = $sourceFull.Length
    foreach ($filePath in $files) {
        $rel = $filePath.Substring($prefixLen)
        if ($rel.StartsWith('\') -or $rel.StartsWith('/')) { $rel = $rel.Substring(1) }
        $entryName = $rel -replace '\\', '/'
        $entry = $zip.CreateEntry(
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        )
        $entryStream = $entry.Open()
        $readStream = [System.IO.File]::OpenRead($filePath)
        try {
            $readStream.CopyTo($entryStream)
        }
        finally {
            $readStream.Close()
            $entryStream.Close()
        }
    }
}
finally {
    if ($null -ne $zip) { $zip.Dispose() }
    if ($null -ne $zipStream) { $zipStream.Close() }
}

Write-Host "Wrote: $outFull" -ForegroundColor Green
exit 0
