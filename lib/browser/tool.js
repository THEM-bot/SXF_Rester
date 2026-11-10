/**
 * browser 工具的模型侧描述：名字、参数、用法说明。
 * 设计原则（对齐 agent-experience）：
 *   - 一个工具带 action 参数，模型少学几个工具；
 *   - description 里写清「什么时候用 / 怎么定位元素 / 危险动作要问」；
 *   - 参数描述写清默认值与取值。
 */

export const BROWSER_TOOL_NAME = "browser";

export const BROWSER_DESCRIPTION = `操控本机 Chrome 浏览器（接管你已登录的那个窗口）。做 Demo 自测、看研效通/企微页面、抓需求池列表、传 PRD 附件时用。

先看再动手：任何点击/填表之前先 action=snapshot，它会给页面上每个可操作元素编号（@e1、@e2…），之后用 ref="@e2" 直接点。SPA 页面点完常常整块重渲染，编号会全部换掉——这时重新 snapshot。

常用顺序：goto → snapshot → fill/click → snapshot 确认结果。

危险动作（提交、保存、删除、审批通过、发送）不要自己直接点：先把「要点哪个元素、它的文字是什么」告诉用户，等用户说可以再点。读页面、翻页、展开、填搜索框这类安全动作随意做。

文件：action=upload 把本地文件塞进 <input type=file> 或拖拽区；action=download 点一个下载链接并等文件落盘。

截图：action=screenshot 会把当前页面存成 PNG 文件并返回路径，用 read_image 打开那个路径就能看到页面长什么样（确认排版、图标位置、Demo 是否还原设计稿）。`;

export const BROWSER_ACTIONS = [
  "snapshot",
  "goto",
  "back",
  "click",
  "clickText",
  "fill",
  "select",
  "pressKey",
  "hover",
  "scroll",
  "waitFor",
  "screenshot",
  "extract",
  "extractMarkdown",
  "upload",
  "download",
  "listPages",
  "usePage",
  "newPage",
  "closePage",
  "evaluate",
  "launch",
];

export const BROWSER_PARAMETERS = {
  action: {
    type: "string",
    enum: BROWSER_ACTIONS,
    description: "要做的动作。snapshot 看页面（必先做）、goto 打开网址、click/fill/select 操作元素、screenshot 截图、extract 抓表格。",
  },
  url: { type: "string", description: "action=goto 时必填。可以不带协议，会自动补 https://；本地文件用 file:///D:/path/x.html。" },
  ref: {
    type: "string",
    description: "元素编号，形如 @e3（从 snapshot 的输出里抄）。click / fill / select / hover / screenshot / upload / download 用它定位元素。",
  },
  text: { type: "string", description: "action=fill 要填的内容；action=clickText 要匹配的文字；action=waitFor 要等的文字。" },
  value: { type: "string", description: "action=select 要选中的选项文字或 value。" },
  key: { type: "string", description: "action=pressKey 的按键名：Enter / Tab / Escape / Backspace / ArrowDown / ArrowUp。" },
  direction: { type: "string", enum: ["down", "up", "top"], description: "action=scroll 的方向，默认 down。" },
  amount: { type: "number", description: "action=scroll 的滚动距离（像素），默认 600。" },
  selector: { type: "string", description: "action=extract / extractMarkdown 限定范围的 CSS 选择器，不填就是整页。" },
  tableIndex: { type: "number", description: "action=extractMarkdown 取第几个表格（0 开始），默认 0。" },
  filePath: {
    type: "string",
    description:
      "落盘位置。action=upload：要上传的本地文件绝对路径；action=download：落盘目录（可选）；action=screenshot：图片保存路径或目录（可选，不填存临时目录）。截图用于文档时可放在需求工作区的 shots/ 目录。",
  },
  fullPage: { type: "boolean", description: "action=screenshot 是否整页截图，默认 false（只截当前视口）。" },
  page: { type: "string", description: "action=usePage / closePage 指定页面：id、URL 片段、或序号（1 开始）。" },
  expression: { type: "string", description: "action=evaluate 要执行的 JS 表达式，按值返回。只在没有更好办法时用。" },
  headless: { type: "boolean", description: "action=launch 是否无头启动，默认 false（有界面，方便你看）。" },
  maxChars: { type: "number", description: "action=snapshot 文字上限，默认 14000。" },
  timeoutMs: { type: "number", description: "action=waitFor 的超时毫秒数，默认 15000。" },
  confirmed: { type: "boolean", description: "只有一种情况填 true：工具回来说「要点的元素看起来是不可逆操作」，而你已经问过用户、用户同意了。" },
  clear: { type: "boolean", description: "action=fill 是否先清空原内容，默认 true。" },
  submit: { type: "boolean", description: "action=fill 填完是否按回车提交，默认 false。" },
};

/** 危险动作关键词：命中就把「要点什么」报给用户等确认 */
const DANGEROUS = [
  "提交", "保存", "删除", "移除", "确定", "确认", "通过", "审批", "发送", "发布",
  "submit", "save", "delete", "remove", "confirm", "approve", "send", "publish",
];

export function looksDangerous(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  return DANGEROUS.some((k) => t.includes(k.toLowerCase()));
}
