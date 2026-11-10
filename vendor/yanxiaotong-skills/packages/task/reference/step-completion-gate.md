# Step Completion Gate（task）



## 出包前



N/A（非 demo）



## 创建 T01 · 进入（P-408 · P-410）



- [ ] handoff / OP 纯序号 `1`～`4` **未**传入 `prepare-create --text`

- [ ] MODE 纯序号 `1`/`2` **未**传入 `prepare-create --text`

- [ ] 无需求引用时已发 **T-CREATE-INPUT-ASK**（未先报「未解析到所属需求」）

- [ ] 仅需求引用时已 `--resolve-only` + **T-CREATE-MODE-ASK**（未直接 `req_analyze`）



## 创建 T01 · 用户输入轨



- [ ] 已读 `create-defaults.md` §4.1

- [ ] `track: user_input`；描述为用户原文

- [ ] `create_count` 默认 1（或用户显式指定）

- [ ] `requirementId` 经 R02 校验

- [ ] 已发 **T-CREATE-CONFIRM** 且用户选 1

- [ ] CLI + verify 通过



## 创建 T01 · 需求分析轨



- [ ] 经 MODE 选 2 或自动创建口令进入（`--force-track req_analyze` 若需）

- [ ] `track: req_analyze`；`task_items[]` 已生成

- [ ] T03 已拉已有任务；Agent 已完成 AI 去重

- [ ] `apply-dedup` 已执行（若有跳过项）

- [ ] 去重后 0 条已发 **T-CREATE-DEDUP-EMPTY-DONE**（未发空确认单）

- [ ] 有可建项时已发 **T-CREATE-CONFIRM**（含跳过列表）且用户选 1

- [ ] CLI + verify 通过



## 创建 T01 · 完整轨



- [ ] 五必填齐备

- [ ] M10/R03 均为点选

- [ ] CLI + verify 通过

- [ ] **T-CREATE-DONE**（须含可点击 **详情链接**）



## 查询 T02/T03



- [ ] verify 通过

- [ ] 中文交付



## 更新 T04



- [ ] 白名单字段 only

- [ ] verify 通过



## 取消 T06



- [ ] **T-CANCEL-CONFIRM** 已选 1

- [ ] verify 通过



## 全局



- [ ] 未向用户展示路由 JSON

- [ ] 未回显 token

