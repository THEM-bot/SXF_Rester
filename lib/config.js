/**
 * 插件配置（Host 半 + Client 半共用）。
 *
 * 有 @deepseek-ai/schemastery 就用在真实 schema（DSH 会据此渲染设置页），
 * 没有就退回普通 JSON Schema —— 两条路都只是给 Loader 描述「这个插件接受哪些配置项」。
 */
let z = null;
try {
  const mod = await import("@deepseek-ai/schemastery");
  z = mod.default ?? mod;
} catch {
  z = null;
}

const FALLBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  description: "pm-flow 插件配置",
  properties: {
    root: {
      type: "string",
      default: "",
      description: "装需求的父目录（每个子目录 = 一个需求工作区）。留空则用 cordis.patch.yml 里的值。",
    },
    enableSkill: { type: "boolean", default: true, description: "注册 pm-flow 与六个角色技能" },
    enableCommand: { type: "boolean", default: true, description: "注册 /pmw 命令" },
  },
};

export const Config =
  z === null
    ? FALLBACK_SCHEMA
    : z.object({
        root: z.string().default("").description("装需求的父目录；每个子目录 = 一个需求工作区"),
        enableSkill: z.boolean().default(true).description("注册 pm-flow 与六个角色技能"),
        enableCommand: z.boolean().default(true).description("注册 /pmw 命令"),
      });

export default Config;
