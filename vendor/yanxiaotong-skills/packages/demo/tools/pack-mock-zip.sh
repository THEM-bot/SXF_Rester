#!/usr/bin/env bash
# 在已安装 zip(1) 的环境（Linux、macOS、WSL、Git Bash）中打与 Linux `unzip` 兼容的包。
# 见同目录 pack-mock-zip.ps1、reference/pack/zip-output.md。Windows 用 .ps1；Linux/macOS/WSL 用本脚本（需 zip(1)）。
# 用法:
#   bash tools/pack-mock-zip.sh path/to/dist path/to/out.zip
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <source_dir> <out.zip>" >&2
  exit 1
fi
if ! command -v zip >/dev/null 2>&1; then
  echo "zip(1) is not in PATH. On Windows without zip, use tools/pack-mock-zip.ps1" >&2
  exit 1
fi
SRC=$1
OUT=$2
if [ ! -d "$SRC" ]; then
  echo "Not a directory: $SRC" >&2
  exit 1
fi
INDEX="$SRC/index.html"
if [ ! -f "$INDEX" ]; then
  echo "打包失败：源目录根下缺少 index.html，禁止打出无内容 Demo 包。" >&2
  echo "路径：$SRC" >&2
  echo "要求：须存在非空（去掉 BOM/空白后仍有内容）的 index.html。请补全页面后重试。" >&2
  exit 1
fi
# 去 BOM/空白后须有内容；0 字节 / 仅空白均拦截
CONTENT=$(tr -d '\r\n\t\v\f ' < "$INDEX" | tr -d '\357\273\277' || true)
if [ ! -s "$INDEX" ] || [ -z "$CONTENT" ]; then
  echo "打包失败：index.html 为空，禁止打出无内容 Demo 包。" >&2
  echo "路径：$INDEX" >&2
  echo "要求：index.html 去掉 BOM/空白后须有可见内容。请补全页面后重试。" >&2
  exit 1
fi
PARENT=$(cd "$(dirname "$OUT")" 2>/dev/null && pwd || true)
if [ -z "$PARENT" ]; then
  echo "Invalid output path: $OUT" >&2
  exit 1
fi
OUT_ABS="${PARENT}/$(basename "$OUT")"
mkdir -p "$(dirname "$OUT_ABS")"
rm -f "$OUT_ABS"
( cd "$SRC" && zip -r -q "$OUT_ABS" . )
echo "Wrote: $OUT_ABS"
