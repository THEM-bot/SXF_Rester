# 用户可见字段标签（Q23）

> 机检真源：`scripts/lib/display-humanize.cjs` · `FIELD_LABELS`

| API 字段 | 用户可见 |
|----------|----------|
| taskNo | 任务编号 |
| taskId | 任务 ID |
| title | 任务标题 |
| status | 状态 |
| taskPhase | 任务阶段 |
| taskCategory | 任务类别 |
| requirementNo | 所属需求编号 |
| requirementTitle | 所属需求标题 |
| iterationName | 开发迭代 |
| teamName | 特性小组 |
| assigneeName | 负责人 |
| estimatedHours | 预估工时（**人天**，默认 1） |

**禁止**向用户展示 `taskNo:`、`requirementId:` 等英文字段名。
