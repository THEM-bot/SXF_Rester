# 需求上传预填（product-repos.yml · SC-260802-005）

> Agent / CLI SSOT。实现：`scripts/lib/parse-upload-defaults.cjs` · CLI：`requirement-api.mjs resolve-upload-defaults`

## 路径约定

- 文档仓根：`{doc}` = `efficiency-hub-doc`（与 `resolve-doc-path` / `findDocRepositoryRoot` 一致）
- 配置文件：`{doc}/product-repos.yml`

## 预填段（字段名冻结）

```yaml
requirement_upload_defaults:
  business_domain_name: ""   # → M01 businessDomainId
  feature_team_name: ""      # 双义：特性小组名（M06→teamId）或关联项目名（M02→projectId）
  app_service_name: ""       # → M03 appServiceId
```

- 三段均为**中文展示名**；至少一项非空才算「有效预填」
- 无该段 / 无法解析 / 三项皆空 → 进入下方「归属预填优先级」的会话/点选回退
- **禁止**把「特性小组 = 关联项目」；确认表须分开展示两行

### `feature_team_name` 双义解析（强制）

yml / 对话填入值 `X` 后，经既有元数据解析为 snowflake **字符串** ID：

| 序 | 匹配列表 | 写出 |
|----|----------|------|
| 1 | **M06** 特性小组 | 唯一命中 → `teamId` + `teamName`（`featureTeamResolvePath: team`） |
| 2 | 上序未命中 → 当前领域下 **M02** 关联项目 | 唯一命中 → `projectId` + `projectName`（`featureTeamResolvePath: project`） |

- 仅命中小组、未命中项目时：`projectId`（创建必填）按归属优先级回退 **会话** / **M02 手选**
- 仅命中项目时：写出 `projectId`；`teamId` 可选，未解析则确认表特性小组行写 `—` 或回退会话
- 多义 / 两边皆未命中 → **本字段** unresolved，禁止静默猜 ID

## 归属预填优先级（Agent 强制 · 按字段独立）

创建时对 **领域 / 特性小组 / 关联项目 / 应用服务**，**逐字段**按序取值，**禁止**「已有 yml 命中仍再问是否沿用会话」：

| 序 | 来源 | 条件 | Agent 行为 |
|----|------|------|------------|
| 1 | **yml** | `resolve-upload-defaults --match` 对该字段 **唯一命中** | **直接采用**，确认表来源 `yml`；**跳过**本字段的会话询问与 M 点选 |
| 2 | **会话** | 上序不可用（段空 / 未命中 / 多义）且 `last_create_defaults` 有该字段 id+名称 | **直接带入**，来源 `会话`；**禁止**再发 **T-SESSION-REUSE-ASK**（确认表可改：选「修改后再确认」） |
| 3 | **手选** | 上两序皆无 | 再走 M01 / M06 / M02 / M03 **T-META-PICK**，来源 `手选` |

**整组跳过会话询问**：只要本轮已对任一归属字段采用了 yml 唯一命中，或已按上表静默回退会话补齐缺失项，**均不得**再发「检测到上次创建…是否沿用」。  
**仅当**归属字段均无 yml 命中、且会话亦无可用默认时，才进入完整点选；此时也**不**发 T-SESSION-REUSE-ASK（无默认可沿用）。

用户口令 **`沿用`** / **`重新选择`**：仍可显式覆盖（见 `response-templates.md` 口令表）；未口令时严格按上表。

**禁止**：yml 多义/未命中仍写入错误 ID；把「读到预填名但未命中」当成已预填成功；yml 未命中时冗长复述三名字 + 再叠一层会话是否沿用。

## 名称→ID

1. 精确匹配（trim）唯一 → 采用  
2. 否则模糊（互相包含）唯一 → 采用  
3. 多义或未命中 → **本字段**回退会话或点选；**禁止**静默用错误 ID  

CLI：

```bash
node tools/requirement-api.mjs resolve-upload-defaults
node tools/requirement-api.mjs resolve-upload-defaults --match
node tools/requirement-api.mjs resolve-upload-defaults --yml /path/to/product-repos.yml --match
node tools/requirement-api.mjs m06 [--query current=1 size=50]
```

## 与故事点

- 故事点来自故事卡 parse-doc（`storyPoint` / 来源 `故事卡`），**不**写入 yml
- 口径：落库为**非负整数**；1 SP = 1 天；原文含小数则 **向上取整** 并预警 `story-point-ceiled`
- 确认表须同时展示归属预填来源与故事点来源：`yml` / `会话` / `手选` / `故事卡`
