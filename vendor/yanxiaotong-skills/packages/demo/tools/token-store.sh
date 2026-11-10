#!/usr/bin/env bash
# 开放 API 令牌本地存储（macOS / Linux / WSL · 无 Node 时的备选）。
# 首选：node tools/token-store.mjs（跨平台）
# SSOT：reference/upload/token-store.md
set -euo pipefail

TOOLS_DIR=$(cd "$(dirname "$0")" && pwd)
PACK_ROOT=$(cd "$TOOLS_DIR/.." && pwd)
LEGACY_PACK_SESSION="$PACK_ROOT/reference/upload-session.local.md"
# shellcheck source=lib/token-path.sh
. "$TOOLS_DIR/lib/token-path.sh"

ACTION="${1:-info}"
shift || true

TOKEN_CLI=""
ENVIRONMENT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN_CLI="${2:-}"; shift 2 ;;
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 info|resolve|write|delete|mask [--token <t>] [--environment 生产|UAT|本地]" >&2
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

mask_token() {
  local t="${1:-}"
  if [ -z "$t" ]; then echo '（未配置）'; return; fi
  if [ "${#t}" -le 12 ]; then echo 'ehub_live_…****'; return; fi
  echo "${t:0:9}…${t: -4}"
}

case "$ACTION" in
  info)
    yxt_token_store_info
    ;;
  resolve)
    t=$(resolve_yxt_token "$TOKEN_CLI" "$LEGACY_PACK_SESSION" "$ENVIRONMENT" || true)
    [ -n "$t" ] || { echo 'No token: set YXT_OPEN_API_TOKEN, save with --environment, or pass --token' >&2; exit 1; }
    printf '%s' "$t"
    ;;
  write)
    [ -n "$TOKEN_CLI" ] || { echo 'write requires --token' >&2; exit 1; }
    [ -n "$ENVIRONMENT" ] || { echo 'write requires --environment 生产|UAT|本地' >&2; exit 1; }
    save_yxt_token "$TOKEN_CLI" "$ENVIRONMENT"
    f=$(yxt_token_file_for_env "$ENVIRONMENT")
    echo "OK: $f"
    ;;
  delete)
    delete_yxt_token "$ENVIRONMENT"
    if [ -n "$ENVIRONMENT" ]; then
      echo "OK: token removed for $ENVIRONMENT"
    else
      echo 'OK: all saved tokens removed'
    fi
    ;;
  mask)
    t=$(resolve_yxt_token "$TOKEN_CLI" "$LEGACY_PACK_SESSION" "$ENVIRONMENT" || true)
    mask_token "$t"
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    exit 1
    ;;
esac
