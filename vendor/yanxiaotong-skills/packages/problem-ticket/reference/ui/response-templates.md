# 问题单 · 话术模板

## T-PT-OP-TYPE-ASK

```text
请说明要做哪一种：
1. 创建问题单
2. 获取问题单元数据

请回复序号（如 `1`）。
```

## T-PT-CREATE-CONFIRM

> **描述**：对用户问题的业务概况（做什么/约束/价值），禁止原文与「全文约 N 行」伪概况。  
> **人员**：提单人/二线/处理人未指定时均为令牌用户；确认表**禁止**手填环境默认二线（如杨红卫）。  
> **一致**：draft 写好概况 → `prepare --human` **原样贴** → `create` 同一 prepared。禁止手搓确认表。

```text
（此处粘贴 prepare --human 的完整输出）
```

## T-PT-CREATE-DONE

```text
问题单已创建。

| 项目 | 内容 |
|------|------|
| 问题单号 | {problemNo} |
| 工单号 | {woNo} |
| 详情链接 | {shareUrl} |
```

## T-PT-METADATA-DONE

```text
已拉取问题单元数据（version：{version}）。

默认问题类型：{defaultProblemType}
默认特性组：{defaultFeatureTeam}
默认应用服务：{defaultAppService}
```
