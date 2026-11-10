# 缺陷操作 · 字段中文标签

| 字段 | 中文 |
|------|------|
| defectNo | 缺陷编号 |
| title | 缺陷标题 |
| status | 状态 |
| severity | 严重性 |
| discoveryPhase | 发现阶段（**只读** · 创建时自动取需求状态） |
| defectType | 缺陷类型 |
| defectTypeLabel | 缺陷类型 |
| requirementNo | 所属需求编号 |
| requirementTitle | 所属需求标题 |
| assigneeName | 修复人 |
| assigneeId | 修复人 |
| regressionTesterName | 回归人 |
| regressionTesterId | 回归人 |
| creatorName | 创建人 |
| creatorNumber | 创建人工号 |
| closeType | 关闭类型 |
| clearRegressionTester | 清空回归人 |
| clearDefectType | 清空缺陷类型 |

用户可见交付 **禁止**英文字段名；优先 `defect-api.mjs --human`。
