# skill-sync · Open API 契约 SSOT

> curl / CLI 执行前加载。鉴权：`X-Open-Api-Token`  
> **install** 与 **update** 均只消费本文件接口，**禁止** plaza 免登录路径。

## base_url

读父包 `selected_env.base_url`（无尾斜杠），与需求池/demo 一致。  
地址 SSOT：`tools/lib/env-registry.json`（`node tools/env-session.mjs list`）。**禁止**在本文件再写一套 host。

## API-OS01 sync-meta

`GET {base_url}/api/open/skills/imported/{skillId}/sync-meta`

响应 `data`：`skillId`、`packageMd5`、`currentVersion`、`updatedAt`、`status`（`published`/`draft`）

**update**：只比 `packageMd5`；`draft` / `published` 均可更新（不因 status 拒绝）。  
**install**：安装前拉 sync-meta 取 MD5/版本；`draft` / `published` 均可安装。

## API-OS02 skill-zip

`GET {base_url}/api/open/skills/imported/{skillId}/skill-zip`

Body：zip 二进制；内含 `skill-package.manifest.json`（与 `SKILL.md` 同目录）。

**update**：对已安装 `installDir` 原子替换；主包走 pending 后 **就地覆盖**（P-412/P-414），持锁进程不 rename 安装根。  
**install**：解压后优先粘滞已有纯名目录（同 skillId · P-413）；否则安装到 `{skillsRoot}/{name}-{skillId}/`。

## skill 引用解析（install · 非 HTTP）

Agent / CLI 从用户输入提取 `skillId`（**不发起网络请求**）：

| 形态 | 示例 | skillId |
|------|------|---------|
| 社区 plaza 页 | `https://yanxiaotong.atrust.sangfor.com/app/skills/plaza?skill=109` | `109` |
| 查询串 | `?skill=109` | `109` |
| 纯数字 | `109` | `109` |
| Open API zip 路径 | `…/api/open/skills/imported/109/skill-zip` | `109` |
| plaza zip 路径（仅解析） | `…/api/skills/plaza/imported/109/skill-zip` | `109` |

实现：`sync.mjs parse-skill-ref --text "…"` 或 `install --skill-ref "…"`。

## 动词与接口映射

| 子命令 | OS01 | OS02 | 写盘 |
|--------|------|------|------|
| `parse-skill-ref` | — | — | 否 |
| `check-all` | 逐项 | — | 否 |
| `update` | 是（已扫描项） | 是 | atomicReplace → installDir |
| `install` | 是（取 meta；不拦 draft） | 是 | atomicReplace → 新 installDir |

## 禁止

- 调用 plaza 免登录路径 `/api/skills/plaza/imported/...`（skill-sync 只走 Open API）
- install 未获用户确认即写盘（Agent）

## 网络异常（P-350）

OS01/OS02 经 `fetchWithRetry`（读操作有限重试 · 与 `router/open-api-errors.md` 一致）。

| 现象 | Agent 话术 |
|------|------------|
| 502/503/504 | 服务暂时不可用，请稍后重试同一 install/update |
| 超时 / 连接失败 | 检查网络与 `base_url`；可换 UAT/本地环境后重试 |
| 401/403 | 检查当前环境令牌是否有效 |

**禁止**未重试即声称下载成功。

## curl 示例

```bash
curl -sS "$BASE/api/open/skills/imported/107/sync-meta" -H "X-Open-Api-Token: $TOKEN"
curl -sS -o skill.zip "$BASE/api/open/skills/imported/107/skill-zip" -H "X-Open-Api-Token: $TOKEN"
```
