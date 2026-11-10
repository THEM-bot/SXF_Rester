# list-phase · 列表（R03）

> 契约：`open-api-contract.md` §R03 · 后端：`OpenRequirementController#findPage` · 列表项：`OpenRequirementListItemVo`

## 进入条件

- `operation: list`；或用户经 **T-QUERY-TYPE-ASK** 选 **2**（列表）
- 用户仅说「查询」且**无** `REQ-` → 先发 **T-QUERY-TYPE-ASK**

## 步骤

1. 收筛选：**未**给条件且**未**说「查全部」→ **T-LIST-FILTER-ASK**（须序号 1/2/3）；选 1 → **T-LIST-FILTER-KEYWORD-ASK**；选 2 → **T-LIST-FILTER-NO-ASK**；选 3 / 「查全部」→ 无筛选直接 R03
2. 组装 `{ "current": 1, "size": 5 }`（Q9，**禁止**默认 `size` > 5）
3. **当前正在**查询列表 → `requirement-api.mjs list --json query.json`（verify 后交付用 **`--human`** 或 **T-LIST-DONE** / **T-LIST-EMPTY-DONE**）
4. 响应写临时文件 → **必做** `verify-requirement-response.cjs`
5. 交付：
   - `total > 0` 且有条目 → **T-LIST-DONE**
   - `total === 0` 或 `records` 为空 → **T-LIST-EMPTY-DONE** → **T-LIST-EMPTY-RETRY-ASK**（**禁止**编造）

## 每条展示字段

用户可见：**需求编号**、**需求标题**、**状态**、**优先级**、**需求层级**、**需求分类**（若有）、**业务领域**、**关联项目**、**创建时间**（按 `ui/field-labels.md`；禁止 `requirementNo:` 等英文字段名）

## 后续改/废

若多条命中 → **T-LIST-PICK-ONE** 选唯一 `idOrNo` 再进 update/cancel phase。

## 技术约束

数组筛选字段须 JSON 数组，禁止 `"[1,2]"` 字符串形式。

## 失败

| 场景 | 处理 |
|------|------|
| 400 / token | `error-humanize.md` |

**禁止**：未调 CLI 报成功；空列表用 T-LIST-DONE 非空格式。
