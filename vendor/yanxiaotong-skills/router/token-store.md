# 开放 API 令牌 · 父包公共存储

> **SSOT 代码**：`yanxiaotong-skills/tools/token-store.mjs`（Q10/Q17）  
> **全子包共用**：demo 上传、requirement 操作均引用本工具；**不按子包分文件**。

## 磁盘路径

```text
~/.yanxiaotong/tokens/local
~/.yanxiaotong/tokens/uat
~/.yanxiaotong/tokens/prod
```

环境中文名：`本地` / `UAT` / `生产` → slug `local` / `uat` / `prod`。

## CLI（首选）

```bash
node "$SKILL_ROOT/tools/token-store.mjs" info [--environment 本地|UAT|生产]
node "$SKILL_ROOT/tools/token-store.mjs" resolve [--token <t>] [--environment ...]
node "$SKILL_ROOT/tools/token-store.mjs" write --token <t> --environment 本地|UAT|生产
node "$SKILL_ROOT/tools/token-store.mjs" delete [--environment ...]
node "$SKILL_ROOT/tools/token-store.mjs" mask --token <t>
```

`$SKILL_ROOT` = 含 `SKILL.md` 的 `yanxiaotong-skills/` 根目录。

## Agent 纪律

1. **禁止**在对话中回显完整 token；交付用 `mask`。
2. 父包门禁：`resolve --environment {selected_env.env_label}`（须先 §0a 确定 env）；无 token → **T-TOKEN-ASK**（含环境名），不得收业务参数。
3. write 成功后发 **T-TOKEN-SAVED**（见 `router/response-templates.md`）。
4. demo 子包 `packages/demo/tools/token-store.mjs` 为兼容包装，**新代码引用父包路径**。

## 遗留迁移

- 单文件 `~/.yanxiaotong/YXT_OPEN_API_TOKEN` 首次读取时按环境迁移后删除。
- 历史 demo 会话文件 `upload-session.local.md` 中 token 行不再写入（会话与令牌分离；**该文件已移除，勿引用**）。
