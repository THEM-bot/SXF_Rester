# 开放 API 令牌路径与解析（macOS / Linux / WSL / Git Bash）
# SSOT：reference/upload/token-store.md — 供 upload-demo.sh、fetch-metadata.sh、token-store.sh 点源

YXT_TOKEN_ENV_NAME='YXT_OPEN_API_TOKEN'
YXT_TOKEN_DIR="${HOME}/.yanxiaotong"
YXT_TOKEN_SUBDIR="${YXT_TOKEN_DIR}/tokens"
YXT_SESSION_SUBDIR="${YXT_TOKEN_DIR}/sessions"
YXT_TOKEN_FILE="${YXT_TOKEN_DIR}/YXT_OPEN_API_TOKEN"
_YXT_LIB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
YXT_SKILL_ROOT=$(cd "${_YXT_LIB_DIR}/../../../.." && pwd)

yxt_env_slug() {
  case "$1" in
    本地) echo local ;;
    UAT) echo uat ;;
    生产) echo prod ;;
    *) return 1 ;;
  esac
}

yxt_env_lookup() {
  local environment="${1:?environment required}"
  local field="${2:-base_url}"
  node "${YXT_SKILL_ROOT}/tools/env-session.mjs" lookup --environment "$environment" --field "$field"
}

yxt_token_file_for_env() {
  local env="$1"
  local slug
  slug=$(yxt_env_slug "$env") || return 1
  echo "${YXT_TOKEN_SUBDIR}/${slug}"
}

yxt_token_store_info() {
  echo "env=${YXT_TOKEN_ENV_NAME}"
  echo "dir=${YXT_TOKEN_DIR}"
  echo "tokens_dir=${YXT_TOKEN_SUBDIR}"
  echo "legacy=${YXT_TOKEN_FILE}"
  echo "platform=$(uname -s 2>/dev/null || echo posix)"
  echo "display=~/.yanxiaotong/tokens/"
  echo "homedir=${HOME}"
}

read_yxt_token_file_at() {
  local f="$1"
  [ -f "$f" ] || return 1
  sed 's/^\xEF\xBB\xBF//' "$f" | tr -d '\r' | head -n1
}

read_yxt_legacy_token_file() {
  read_yxt_token_file_at "$YXT_TOKEN_FILE"
}

read_legacy_session_token() {
  local session_path="$1"
  [ -f "$session_path" ] || return 1
  awk -F': ' '/^token:/ { sub(/^[ \t]+/, "", $2); print $2; exit }' "$session_path" | tr -d '\r'
}

read_session_last_environment() {
  local session_path="$1"
  [ -f "$session_path" ] || return 1
  awk -F': ' '/^last_environment:/ { sub(/^[ \t]+/, "", $2); print $2; exit }' "$session_path" | tr -d '\r'
}

resolve_yxt_token() {
  local cli="${1:-}"
  local session_path="${2:-}"
  local environment="${3:-}"
  if [ -n "$cli" ]; then printf '%s' "$cli"; return 0; fi
  if [ -n "${YXT_OPEN_API_TOKEN:-}" ]; then printf '%s' "$YXT_OPEN_API_TOKEN"; return 0; fi
  if [ -n "$environment" ]; then
    local env_file
    env_file=$(yxt_token_file_for_env "$environment" 2>/dev/null || true)
    if [ -n "$env_file" ]; then
      local from_env_file
      from_env_file=$(read_yxt_token_file_at "$env_file" 2>/dev/null || true)
      if [ -n "$from_env_file" ]; then printf '%s' "$from_env_file"; return 0; fi
    fi
    local legacy last_env
    legacy=$(read_yxt_legacy_token_file 2>/dev/null || true)
    if [ -n "$legacy" ] && [ -n "$session_path" ]; then
      last_env=$(read_session_last_environment "$session_path" 2>/dev/null || true)
      if [ "$last_env" = "$environment" ]; then
        save_yxt_token "$legacy" "$environment"
        delete_yxt_token_file_legacy
        printf '%s' "$legacy"
        return 0
      fi
    fi
    return 1
  fi
  local from_file
  from_file=$(read_yxt_legacy_token_file 2>/dev/null || true)
  if [ -n "$from_file" ]; then printf '%s' "$from_file"; return 0; fi
  from_file=$(read_legacy_session_token "$session_path" 2>/dev/null || true)
  if [ -n "$from_file" ]; then printf '%s' "$from_file"; return 0; fi
  return 1
}

save_yxt_token() {
  local t="${1:?Token is empty}"
  local environment="${2:?Environment required}"
  t=$(printf '%s' "$t" | tr -d '\r\n')
  [ -n "$t" ] || return 1
  local target
  target=$(yxt_token_file_for_env "$environment") || return 1
  mkdir -p "$(dirname "$target")"
  printf '%s\n' "$t" >"$target"
  chmod 600 "$target" 2>/dev/null || true
  delete_yxt_token_file_legacy
}

delete_yxt_token_file_legacy() {
  [ -f "$YXT_TOKEN_FILE" ] && rm -f "$YXT_TOKEN_FILE"
}

delete_yxt_token() {
  local environment="${1:-}"
  if [ -n "$environment" ]; then
    local f
    f=$(yxt_token_file_for_env "$environment" 2>/dev/null || true)
    [ -n "$f" ] && [ -f "$f" ] && rm -f "$f"
    return 0
  fi
  if [ -d "$YXT_TOKEN_SUBDIR" ]; then
    for slug in local uat prod; do
      [ -f "${YXT_TOKEN_SUBDIR}/${slug}" ] && rm -f "${YXT_TOKEN_SUBDIR}/${slug}"
    done
  fi
  delete_yxt_token_file_legacy
}

yxt_session_file_for_env() {
  local env="$1"
  local project_root="${2:-$(pwd)}"
  if ! command -v node >/dev/null 2>&1; then
    echo "node is required for session path resolution" >&2
    return 1
  fi
  node "${_YXT_LIB_DIR}/resolve-session-path.mjs" file "$env" "$project_root"
}

yxt_migrate_legacy_pack_session() {
  local environment="$1"
  local legacy_pack_path="$2"
  local project_root="${3:-$(pwd)}"
  local file env_slug flat
  file=$(yxt_session_file_for_env "$environment" "$project_root") || return 1
  [ -f "$file" ] && return 0
  env_slug=$(yxt_env_slug "$environment") || return 1
  flat="${YXT_SESSION_SUBDIR}/${env_slug}"
  if [ -f "$flat" ]; then
    mkdir -p "$(dirname "$file")"
    cp "$flat" "$file"
    chmod 600 "$file" 2>/dev/null || true
    rm -f "$flat"
    return 0
  fi
  [ -n "$legacy_pack_path" ] && [ -f "$legacy_pack_path" ] || return 1
  local last_env
  last_env=$(read_session_last_environment "$legacy_pack_path" 2>/dev/null || true)
  [ "$last_env" = "$environment" ] || return 1
  mkdir -p "$(dirname "$file")"
  cp "$legacy_pack_path" "$file"
  chmod 600 "$file" 2>/dev/null || true
  rm -f "$legacy_pack_path"
}

delete_yxt_session() {
  local environment="${1:-}"
  local legacy_pack_path="${2:-}"
  local project_root="${3:-}"
  if [ -n "$environment" ] && [ -n "$project_root" ]; then
    local f
    f=$(yxt_session_file_for_env "$environment" "$project_root" 2>/dev/null || true)
    [ -n "$f" ] && [ -f "$f" ] && rm -f "$f"
    return 0
  fi
  if [ -n "$environment" ]; then
    local env_slug env_dir
    env_slug=$(yxt_env_slug "$environment" 2>/dev/null || true)
    if [ -n "$env_slug" ]; then
      env_dir="${YXT_SESSION_SUBDIR}/${env_slug}"
      if [ -d "$env_dir" ]; then
        rm -rf "$env_dir"
      elif [ -f "$env_dir" ]; then
        rm -f "$env_dir"
      fi
    fi
    return 0
  fi
  if [ -d "$YXT_SESSION_SUBDIR" ]; then
    rm -rf "$YXT_SESSION_SUBDIR"
  fi
  [ -n "$legacy_pack_path" ] && [ -f "$legacy_pack_path" ] && rm -f "$legacy_pack_path"
}
