#!/usr/bin/env bash
# 研效通 Demo 一键上传（D03/D04）：macOS / Linux / WSL / Git Bash。
# Windows 请用同目录 upload-demo.ps1（HttpClient，避免 curl 中文 metadata 乱码）。
# 依赖：curl、node（verify-upload-response.js）
#
# 用法:
#   bash tools/upload-demo.sh --mode d03 --environment 本地 \
#     --zip /path/demo.zip --token ehub_live_xxx --name "演示包" \
#     --business-domain-name "IT部-平台组" --app-service-name "研效通-平台组" \
#     --save-session
#
#   bash tools/upload-demo.sh --mode d04 --environment 本地 \
#     --zip /path/demo.zip --token ehub_live_xxx --demo-id DEMO-xxx --save-session
set -euo pipefail

TOOLS_DIR=$(cd "$(dirname "$0")" && pwd)
PACK_ROOT=$(cd "$TOOLS_DIR/.." && pwd)
LEGACY_PACK_SESSION="$PACK_ROOT/reference/upload-session.local.md"
VERIFY_JS="$PACK_ROOT/scripts/verify-upload-response.js"
# shellcheck source=lib/token-path.sh
. "$TOOLS_DIR/lib/token-path.sh"

MODE=""
ENVIRONMENT=""
ZIP_PATH=""
TOKEN=""
NAME=""
DEMO_ID=""
BUSINESS_DOMAIN_NAME=""
APP_SERVICE_NAME=""
BUSINESS_DOMAIN_ID=""
APP_SERVICE_ID=""
SAVE_SESSION=0
NO_VERIFY=0
PROJECT_ROOT=""

usage() {
  echo "Usage: $0 --mode d03|d04 --environment 生产|UAT|本地 --zip <path> [options]" >&2
  echo "  --token --name --demo-id --business-domain-name --app-service-name" >&2
  echo "  --business-domain-id --app-service-id --save-session --no-verify --project-root" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --zip) ZIP_PATH="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --name) NAME="${2:-}"; shift 2 ;;
    --demo-id) DEMO_ID="${2:-}"; shift 2 ;;
    --business-domain-name) BUSINESS_DOMAIN_NAME="${2:-}"; shift 2 ;;
    --app-service-name) APP_SERVICE_NAME="${2:-}"; shift 2 ;;
    --business-domain-id) BUSINESS_DOMAIN_ID="${2:-}"; shift 2 ;;
    --app-service-id) APP_SERVICE_ID="${2:-}"; shift 2 ;;
    --save-session) SAVE_SESSION=1; shift ;;
    --no-verify) NO_VERIFY=1; shift ;;
    --project-root) PROJECT_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

[ -n "$MODE" ] && [ -n "$ENVIRONMENT" ] && [ -n "$ZIP_PATH" ] || usage

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node is required (verify-upload-response.js)" >&2
  exit 1
fi
if [ ! -f "$VERIFY_JS" ]; then
  echo "missing $VERIFY_JS" >&2
  exit 1
fi
if [ ! -f "$ZIP_PATH" ]; then
  echo "Zip not found: $ZIP_PATH" >&2
  exit 1
fi

base_url_for_env() {
  yxt_env_lookup "$1" base_url
}

BASE_URL=$(base_url_for_env "$ENVIRONMENT") || { echo "Unknown environment: $ENVIRONMENT" >&2; exit 1; }

[ -n "$PROJECT_ROOT" ] || PROJECT_ROOT=$(pwd)

yxt_migrate_legacy_pack_session "$ENVIRONMENT" "$LEGACY_PACK_SESSION" "$PROJECT_ROOT"
SESSION_FILE=$(yxt_session_file_for_env "$ENVIRONMENT" "$PROJECT_ROOT")

session_get() {
  local section="$1" key="$2"
  [ -f "$SESSION_FILE" ] || return 0
  awk -v sec="$section" -v k="$key" '
    $0 ~ "^" sec ":" { in_sec=1; next }
    in_sec && /^[a-zA-Z0-9_]+:/ { in_sec=0 }
    in_sec && $0 ~ "^  " k ":" {
      sub(/^  [^:]+:[ ]*/, "")
      gsub(/^[ \t]+|[ \t]+$/, "")
      print
      exit
    }
  ' "$SESSION_FILE"
}

session_get_root() {
  local key="$1"
  [ -f "$SESSION_FILE" ] || return 0
  awk -v k="$key" '$0 ~ "^" k ":" { sub(/^[^:]*:[ ]*/, ""); print; exit }' "$SESSION_FILE"
}

write_session_file() {
  local env="$1" updated="$2"
  local d03_name="$3" d03_bdi="$4" d03_bdn="$5" d03_asi="$6" d03_asn="$7"
  local d04_id="$8"
  local d04_code="${9:-}"
  mkdir -p "$(dirname "$SESSION_FILE")"
  cat >"$SESSION_FILE" <<EOF
# yanxiaotong-demo upload session ($env)
# token → ~/.yanxiaotong/tokens/

last_environment: $env

d03:
  name: $d03_name
  businessDomainId: $d03_bdi
  businessDomainName: $d03_bdn
  appServiceId: $d03_asi
  appServiceName: $d03_asn

d04:
  demo_id: $d04_id
  demo_code: $d04_code

updated_at: $updated
EOF
  chmod 600 "$SESSION_FILE" 2>/dev/null || true
}

if [ -z "$TOKEN" ]; then
  TOKEN=$(resolve_yxt_token "" "$LEGACY_PACK_SESSION" "$ENVIRONMENT" || true)
fi
[ -n "$TOKEN" ] || {
  echo "Token required: --token, YXT_OPEN_API_TOKEN, or ~/.yanxiaotong/tokens/{local|uat|prod}" >&2
  exit 1
}

if [ "$MODE" = "d03" ]; then
  [ -n "$NAME" ] || NAME=$(session_get d03 name || true)
  [ -n "$NAME" ] || { echo "D03 requires --name or d03.name in session" >&2; exit 1; }
  [ -n "$BUSINESS_DOMAIN_NAME" ] || BUSINESS_DOMAIN_NAME=$(session_get d03 businessDomainName || true)
  [ -n "$APP_SERVICE_NAME" ] || APP_SERVICE_NAME=$(session_get d03 appServiceName || true)
  [ -n "$BUSINESS_DOMAIN_ID" ] || BUSINESS_DOMAIN_ID=$(session_get d03 businessDomainId || true)
  [ -n "$APP_SERVICE_ID" ] || APP_SERVICE_ID=$(session_get d03 appServiceId || true)

  META_JSON=$(node - "$NAME" "$BUSINESS_DOMAIN_ID" "$BUSINESS_DOMAIN_NAME" "$APP_SERVICE_ID" "$APP_SERVICE_NAME" <<'NODE'
const [name, bdi, bdn, asi, asn] = process.argv.slice(1);
const o = { name };
if (bdi) o.businessDomainId = bdi;
if (bdn) o.businessDomainName = bdn;
if (asi) o.appServiceId = asi;
if (asn) o.appServiceName = asn;
process.stdout.write(JSON.stringify(o));
NODE
)

  META_TMP=$(mktemp)
  trap 'rm -f "$META_TMP"' EXIT
  printf '%s' "$META_JSON" >"$META_TMP"

  RESP=$(curl -sS -w $'\n%{http_code}' -X POST "$BASE_URL/api/open/demos/package-upload" \
    -H "X-Open-Api-Token: $TOKEN" \
    -F "metadata=<${META_TMP};type=application/json" \
    -F "file=@${ZIP_PATH}")
else
  [ -n "$DEMO_ID" ] || DEMO_ID=$(session_get d04 demo_id || true)
  [ -n "$DEMO_ID" ] || { echo "D04 requires --demo-id or d04.demo_id in session" >&2; exit 1; }

  RESP=$(curl -sS -w $'\n%{http_code}' -X POST "$BASE_URL/api/open/demos/${DEMO_ID}/package-upload" \
    -H "X-Open-Api-Token: $TOKEN" \
    -F "file=@${ZIP_PATH}")
fi

HTTP_CODE=$(printf '%s' "$RESP" | tail -n1)
BODY=$(printf '%s' "$RESP" | sed '$d')

if [ "$NO_VERIFY" -eq 0 ] && [ -n "$BODY" ]; then
  TMP_JSON=$(mktemp)
  printf '%s' "$BODY" >"$TMP_JSON"
  node "$VERIFY_JS" "$TMP_JSON" || echo "warn: verify-upload-response failed" >&2
  rm -f "$TMP_JSON"
fi

WEB_ORIGIN=$(yxt_env_lookup "$ENVIRONMENT" web_origin) || true
PARSED=$(WEB_ORIGIN="$WEB_ORIGIN" node - "$BODY" <<'NODE' || true
const origin = process.env.WEB_ORIGIN || '';
function rewritePreview(url) {
  if (!origin || !url) return url;
  try {
    const u = new URL(url);
    return origin.replace(/\/$/, '') + u.pathname + u.search + u.hash;
  } catch {
    const p = url.startsWith('/') ? url : '/' + url;
    return origin.replace(/\/$/, '') + p;
  }
}
function stripFs(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    const exp = u.searchParams.get('exp');
    if (exp === '1' || exp === 'true') {
      u.searchParams.delete('f');
      u.searchParams.delete('expFs');
      return u.toString();
    }
  } catch {}
  return url;
}
function detailUrl(demoId) {
  if (!origin || !demoId) return '';
  return origin.replace(/\/$/, '') + '/app/requirements/demos?d=' + encodeURIComponent(demoId);
}
try {
  const b = JSON.parse(process.argv[1]);
  if (b.success && b.data) {
    const id = b.data.demoId || '';
    const au = stripFs(rewritePreview(b.data.accessUrl || ''));
    console.log([id, b.data.demoCode || '', au, detailUrl(id)].join('\t'));
    process.exit(0);
  }
  console.log('\t\t\t');
  process.exit(1);
} catch { console.log('\t\t\t'); process.exit(1); }
NODE
)

IFS=$'\t' read -r DEMO_ID_OUT DEMO_CODE ACCESS_URL DETAIL_URL <<<"$PARSED" || true
STATUS="失败"
if [ "$HTTP_CODE" = "200" ] && [ -n "${DEMO_ID_OUT}${DEMO_CODE}" ]; then
  STATUS="成功"
fi

if [ "$SAVE_SESSION" -eq 1 ] && [ "$STATUS" = "成功" ]; then
  UPDATED=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%S+00:00")
  D04_SAVE_ID="${DEMO_ID_OUT:-}"
  D04_SAVE_CODE="${DEMO_CODE:-}"
  [ "$MODE" = "d04" ] && [ -n "$DEMO_CODE" ] && D04_SAVE_CODE="$DEMO_CODE"
  [ "$MODE" = "d04" ] && [ -n "$DEMO_ID_OUT" ] && D04_SAVE_ID="$DEMO_ID_OUT"
  write_session_file "$ENVIRONMENT" "$UPDATED" \
    "${NAME:-}" "${BUSINESS_DOMAIN_ID:-}" "${BUSINESS_DOMAIN_NAME:-}" \
    "${APP_SERVICE_ID:-}" "${APP_SERVICE_NAME:-}" "${D04_SAVE_ID:-}" "${D04_SAVE_CODE:-}"
fi

SNIPPET="$BODY"
if [ ${#SNIPPET} -gt 400 ]; then
  SNIPPET="${SNIPPET:0:400}..."
fi

CURL_EXIT=0
[ "$HTTP_CODE" = "200" ] || CURL_EXIT=1

cat <<EOF
[yanxiaotong-demo upload]
- zip: $ZIP_PATH
- API: $(echo "$MODE" | tr '[:lower:]' '[:upper:]')
- environment: $ENVIRONMENT
- base_url: $BASE_URL
- curl_exit: $CURL_EXIT
- http_code: $HTTP_CODE
- response_snippet: $SNIPPET
- demoId: ${DEMO_ID_OUT:-}
- demoCode: ${DEMO_CODE:-}
- accessUrl: ${ACCESS_URL:-响应未返回}
- detailUrl: ${DETAIL_URL:-}
- 状态: $STATUS
EOF

if [ "$HTTP_CODE" != "200" ] || [ "$STATUS" != "成功" ]; then
  exit 1
fi
