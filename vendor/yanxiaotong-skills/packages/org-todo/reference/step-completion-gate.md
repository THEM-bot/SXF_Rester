# Step Completion Gate（yanxiaotong-org-todo · local:ready）

## 通用

- [ ] 已读 `reference/boot.md`；继承父包 `selected_env`
- [ ] 父包 token 已通过；未回显 token
- [ ] 固定话术 + 序号选项；进度句含 **当前正在…**
- [ ] `operation` 与 phase 一致（§8 org-todo）

## API 执行

- [ ] 已执行 `org-todo-api.mjs` 并得到 JSON
- [ ] 已执行 `verify-org-todo-response.cjs` 或错误已人话化
- [ ] **未**在未调工具时声称成功
- [ ] Windows JSON：body/resp 落盘；禁止 BOM / `node -e` 内联中文

## 创建

- [ ] 待办描述已收齐（**无标题**）；进展说明已问（可跳过）；提出人/负责人已静默或用户指定；`plannedCloseAt` 已填（含默认今天+1月）
- [ ] **T-OT-CREATE-CONFIRM** 含状态只读「待处理」、待办描述、进展说明、**提出人**、负责人「姓名工号」（无括号）；**无**「待办标题」行
- [ ] 有可用领域/项目会话缓存 → 已发 **T-OT-SESSION-DOMAIN-REUSE-ASK**；无缓存 → **未**询问
- [ ] 创建 body **无** `status`；**无** `--title-file`；改参未走状态/标题项
- [ ] 有进展说明 → OT03 后已 OT04（或 `create --progress-file`）；OT04 失败已如实告知
- [ ] M01/M02 用户可见无 id
- [ ] **T-OT-CREATE-CONFIRM** 后 OT03；交付编号 + 详情链接

## 查询

- [ ] 仅「查询」无 OT- → **T-QUERY-TYPE-ASK**
- [ ] 列表 size=5；total=0 不编造

## 追加进展 / 修改

- [ ] 写操作经 CONFIRM；OT04/OT05 verify 通过
- [ ] 改状态走 `update-phase`（PATCH status）

## 维护

- [ ] 父包 `node scripts/check.js` 通过
