# Demo 上传 · 执行速查（P-363）

> **何时读**：用户确认上传、类型 D03/D04 已明确后。  
> **完整契约**：[`open-api-upload.md`](./open-api-upload.md)（字段/schema/错误码附录 · 按需读）

## 执行顺序

1. 继承 `selected_env`
2. **D03/D04 二选一**（选上传之后、收参之前）
3. **D03**：有底稿则 `preview-upload-params.mjs` 贴预览表 → 确认/修改；全空则逐项名称/M01/M03。**D04**：收标识（**跳过**预览）
4. 仅补仍缺项（已指定/已预览字段禁止再问）
5. **首选** `upload-demo.mjs`（禁止手写 curl 为主路径；禁止旧 zip）

## 首选命令

```bash
node "$PACK_ROOT/tools/upload-demo.mjs" --zip path/to.zip --type D03 --out resp.json
```

D04：`--demo-id {id}` · 仅 `file` part（无 metadata）。

## 铁律速查

| 项 | 要求 |
|----|------|
| 鉴权 | `X-Open-Api-Token`（非 Bearer） |
| D03 body | `multipart/form-data`：`metadata` JSON 字段 + `file` |
| M01/M03 | **仅 D03**：口语名后台匹配进预览表，或列表点选；禁止手填 FID；**D04 不收集** |
| 责任人 | 服务端按 Token 用户写入「姓名+工号」；metadata **不传** |
| 成功校验 | `verify-upload-response.cjs` |

## 失败时

读 `open-api-upload.md` §错误码 · 子包 `error-humanize.md` · `router/open-api-errors.md`。
