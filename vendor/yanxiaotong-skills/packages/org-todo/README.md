# yanxiaotong-org-todo

> **AGENT：禁止读取本文件。** 请读 `PACK.md` → `reference/boot.md`。

研效通组织待办开放 API 技能子包（API-OT01～OT05）。

## 能力

- 查询：列表 / 详情
- 创建组织待办
- 修改（含改状态、描述、负责人、领域/项目）
- 追加进展

## 独立运行

复制 `packages/org-todo/` 至 `{Agent根}/skills/yanxiaotong-org-todo/` 即可单独使用（须自行配置 Token）。

## 入口

经父包 `@yanxiaotong-skills` 选 **7** 或自然语言「组织待办 / OT-」路由进入。
