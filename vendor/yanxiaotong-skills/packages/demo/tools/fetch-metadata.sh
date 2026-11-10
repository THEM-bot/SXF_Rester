#!/usr/bin/env bash
# 研效通开放元数据查询（D03 · M01 业务领域 / M03 应用服务）。
# Windows 请用同目录 fetch-metadata.ps1。
#
# 用法:
#   bash tools/fetch-metadata.sh --kind domains --environment 本地 --token ehub_live_xxx
#   bash tools/fetch-metadata.sh --kind app-services --environment 本地 \
#     --business-domain-id 1899408351909954560 --token ehub_live_xxx
#   bash tools/fetch-metadata.sh --kind domains --environment 本地 --pick-index 1 --output json
set -euo pipefail

TOOLS_DIR=$(cd "$(dirname "$0")" && pwd)
PACK_ROOT=$(cd "$TOOLS_DIR/.." && pwd)
LEGACY_PACK_SESSION="$PACK_ROOT/reference/upload-session.local.md"
# shellcheck source=lib/token-path.sh
. "$TOOLS_DIR/lib/token-path.sh"

KIND=""
ENVIRONMENT=""
TOKEN=""
BUSINESS_DOMAIN_ID=""
KEYWORD=""
CURRENT=1
SIZE=50
FETCH_ALL=0
PICK_INDEX=0
OUTPUT_FORMAT="list"

usage() {
  echo "Usage: $0 --kind domains|app-services --environment 生产|UAT|本地 [options]" >&2
  echo "  --token --business-domain-id --keyword --current --size --fetch-all" >&2
  echo "  --pick-index N --output list|json" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --kind) KIND="${2:-}"; shift 2 ;;
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --business-domain-id) BUSINESS_DOMAIN_ID="${2:-}"; shift 2 ;;
    --keyword) KEYWORD="${2:-}"; shift 2 ;;
    --current) CURRENT="${2:-}"; shift 2 ;;
    --size) SIZE="${2:-}"; shift 2 ;;
    --fetch-all) FETCH_ALL=1; shift ;;
    --pick-index) PICK_INDEX="${2:-}"; shift 2 ;;
    --output) OUTPUT_FORMAT="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

[ -n "$KIND" ] && [ -n "$ENVIRONMENT" ] || usage
if [ "$KIND" = "app-services" ] && [ -z "$BUSINESS_DOMAIN_ID" ]; then
  echo "app-services requires --business-domain-id" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node is required for JSON parsing" >&2
  exit 1
fi

base_url_for_env() {
  yxt_env_lookup "$1" base_url
}

BASE_URL=$(base_url_for_env "$ENVIRONMENT") || { echo "Unknown environment: $ENVIRONMENT" >&2; exit 1; }

if [ -z "$TOKEN" ]; then
  TOKEN=$(resolve_yxt_token "" "$LEGACY_PACK_SESSION" "$ENVIRONMENT" || true)
fi
[ -n "$TOKEN" ] || {
  echo "Token required: --token, YXT_OPEN_API_TOKEN, or ~/.yanxiaotong/tokens/{local|uat|prod}" >&2
  exit 1
}

if [ "$KIND" = "domains" ]; then
  API_ID="M01"
  API_LABEL="business-domains"
  PATH_PART="/api/open/metadata/business-domains"
else
  API_ID="M03"
  API_LABEL="app-services"
  PATH_PART="/api/open/metadata/app-services"
fi

CURL_ARGS=(
  -sS -w $'\n%{http_code}' -G
  -H "X-Open-Api-Token: $TOKEN"
  --data-urlencode "current=$CURRENT"
  --data-urlencode "size=$SIZE"
)
[ -n "$KEYWORD" ] && CURL_ARGS+=(--data-urlencode "keyword=$KEYWORD")
[ "$FETCH_ALL" -eq 1 ] && CURL_ARGS+=(--data-urlencode "fetchAll=true")
[ -n "$BUSINESS_DOMAIN_ID" ] && CURL_ARGS+=(--data-urlencode "businessDomainId=$BUSINESS_DOMAIN_ID")

RESP=$(curl "${CURL_ARGS[@]}" "${BASE_URL}${PATH_PART}")

HTTP_CODE=$(printf '%s' "$RESP" | tail -n1)
BODY=$(printf '%s' "$RESP" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "[yanxiaotong-demo metadata]"
  echo "- api: $API_ID $API_LABEL"
  echo "- environment: $ENVIRONMENT"
  echo "- http_code: $HTTP_CODE"
  echo "- 状态: 失败（HTTP $HTTP_CODE）"
  exit 1
fi

PARSED=$(printf '%s' "$BODY" | node -e "
const fs=require('fs');
let j;
try { j=JSON.parse(fs.readFileSync(0,'utf8')); }
catch(e){ process.stderr.write('invalid json'); process.exit(2); }
if(j.success!==true){process.stderr.write(j.message||'success=false');process.exit(2);}
const rec=(j.data&&j.data.records)||[];
const total=(j.data&&j.data.total)||0;
process.stdout.write(JSON.stringify({total,records:rec}));
") || {
  echo "[yanxiaotong-demo metadata]"
  echo "- 状态: 失败（$PARSED）"
  exit 1
}

TOTAL=$(printf '%s' "$PARSED" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(0,'utf8')).total))")
COUNT=$(printf '%s' "$PARSED" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(0,'utf8')).records.length))")

if [ "$COUNT" = "0" ]; then
  echo "[yanxiaotong-demo metadata]"
  echo "- api: $API_ID $API_LABEL"
  echo "- environment: $ENVIRONMENT"
  echo "- total: 0"
  echo "- 状态: 无可用记录（禁止手填领域/服务，请换 keyword 或环境）"
  exit 1
fi

if [ "$PICK_INDEX" -gt 0 ]; then
  PICK_INDEX="$PICK_INDEX" OUTPUT_FORMAT="$OUTPUT_FORMAT" API_ID="$API_ID" API_LABEL="$API_LABEL" \
    printf '%s' "$PARSED" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
const idx=Number(process.env.PICK_INDEX);
const fmt=process.env.OUTPUT_FORMAT;
if(idx<1||idx>j.records.length){process.stderr.write('PickIndex out of range');process.exit(1);}
const r=j.records[idx-1];
if(fmt==='json'){process.stdout.write(JSON.stringify(r));}
else{
  console.log('[yanxiaotong-demo metadata · picked]');
  console.log('- api: '+process.env.API_ID+' '+process.env.API_LABEL);
  console.log('- index: '+idx);
  console.log('- id: '+r.id);
  console.log('- name: '+r.name);
}
"
  exit 0
fi

if [ "$OUTPUT_FORMAT" = "json" ]; then
  API_ID="$API_ID" KIND="$KIND" ENVIRONMENT="$ENVIRONMENT" printf '%s' "$PARSED" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify({
  api: process.env.API_ID,
  kind: process.env.KIND,
  environment: process.env.ENVIRONMENT,
  total: j.total,
  records: j.records
}));
"
  exit 0
fi

echo "[yanxiaotong-demo metadata]"
echo "- api: $API_ID $API_LABEL"
echo "- environment: $ENVIRONMENT"
echo "- http_code: $HTTP_CODE"
echo "- total: $TOTAL"
[ -n "$KEYWORD" ] && echo "- keyword: $KEYWORD"
[ -n "$BUSINESS_DOMAIN_ID" ] && echo "- businessDomainId: $BUSINESS_DOMAIN_ID"
echo ""
echo "请选择（回复序号）："
printf '%s' "$PARSED" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
j.records.forEach((r,i)=>console.log((i+1)+'. '+r.name+' (id: '+r.id+')'));
"

exit 0
