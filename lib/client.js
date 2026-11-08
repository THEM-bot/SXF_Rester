window.__ModuleLoader__.load({
	id: "dsh-pm-flow",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		/**
		 * dsh-pm-flow —— Client 半（Web UI）
		 *
		 * 本文件是壳子的模块加载器包格式（window.__ModuleLoader__.load），不是 ES 模块：
		 *   · react 由壳子通过工厂的 require 注入，不打进产物
		 *   · 不 import 任何 @deepseek-ai/* 包（profile 里解析不到）
		 *
		 * 只做两件事，都是「追加」，绝不替换壳子已有控件：
		 *   ① 左侧活动栏一个图标 → 点开是看板：在跟的需求 / 阶段进度 / 任务链
		 *   ② 对话框模型名左边一个不可点的 Rester 标记（表示插件在跑）
		 */

		const PANEL_ID = "pm-flow";
		const AGENT_NAME = "Rester";
		const STATE_URL = "/pm-flow/state";
		const GRAPH_URL = "/pm-flow/graph";
		const ACT_URL = "/pm-flow/act";

		/* ===================== 小工具 ===================== */

		function hMake(type, props, ...children) {
			const flat = [];
			for (const c of children) {
				if (Array.isArray(c)) flat.push(...c);
				else if (c !== null && c !== undefined && c !== false) flat.push(c);
			}
			return react.createElement(type, props ?? null, ...flat);
		}

		function cls() {
			return Array.prototype.slice.call(arguments).filter(Boolean).join(" ");
		}

		function shortTime(iso) {
			const d = new Date(iso);
			if (Number.isNaN(d.getTime())) return "";
			const p = (n) => String(n).padStart(2, "0");
			return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
		}

		/** 去掉 mermaid 标签里的引号与 <br/>，变成一个可读的单行字符串 */
		function cleanLabel(s) {
			return String(s ?? "")
				.replace(/^["']|["']$/g, "")
				.replace(/<br\s*\/?>/gi, " · ")
				.replace(/\\n/g, " · ")
				.trim();
		}

		/**
		 * 极简 mermaid 解析：只认 pmw 自己生成的那两种图
		 *   N1["标签"] / N1["标签 ✓"] / N1(标签) / N1{标签}
		 *   A --> B
		 *   class A done
		 */
		function parseFlow(src) {
			const nodes = new Map();
			const order = [];
			const edges = [];
			const classes = new Map();

			for (const raw of String(src ?? "").split("\n")) {
				const line = raw.trim();
				if (!line) continue;
				if (/^(flowchart|graph|classDef|%%|style)\b/.test(line)) continue;

				let m = /^([A-Za-z_][\w]*)\s*[\[\(\{](.*?)[\]\)\}]\s*$/.exec(line);
				if (m) {
					if (!nodes.has(m[1])) order.push(m[1]);
					nodes.set(m[1], { id: m[1], label: cleanLabel(m[2]) });
					continue;
				}
				m = /^class\s+([A-Za-z_][\w]*)\s+([\w-]+)\s*$/.exec(line);
				if (m) {
					classes.set(m[1], m[2]);
					continue;
				}
				m = /^([A-Za-z_][\w]*)\s*-->\s*([A-Za-z_][\w]*)\s*$/.exec(line);
				if (m) {
					edges.push([m[1], m[2]]);
					continue;
				}
			}
			return { nodes, order, edges, classes };
		}

		/** 从标签里的符号推断状态（pmw 会打 ✓ / ○ / ◀ 当前） */
		function stateOf(id, label, classes) {
			const c = classes.get(id);
			if (c) return c;
			if (label.includes("✓")) return "done";
			if (label.includes("◀")) return "current";
			if (/阻塞|卡点/.test(label)) return "blocked";
			return "pending";
		}

		/* ---------- pmw status 返回的字段有的地方是「数组」、有的是「计数」，这里统一 ---------- */

		/** 3 或者 [...] 都当成数量 */
		function asCount(v) {
			if (Array.isArray(v)) return v.length;
			return Number.isFinite(v) ? v : 0;
		}

		/** 数组原样、对象取 .current（tasks 是 {current:[...]}） */
		function asList(v, key) {
			if (Array.isArray(v)) return v;
			if (v && typeof v === "object") {
				if (key && Array.isArray(v[key])) return v[key];
				for (const k of Object.keys(v)) if (Array.isArray(v[k])) return v[k];
			}
			return [];
		}

		/**
		 * 把任意一项变成能渲染的字符串。
		 * gateFailures 的元素是 {type,hint,actual}，openReviews 是 {id,text,owner,status}，
		 * 直接把对象塞给 React 当子节点会抛「Objects are not valid as a React child」，整块面板就白了。
		 */
		function asText(v) {
			if (v === null || v === undefined) return "";
			if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
			if (typeof v === "object") {
				if (typeof v.text === "string") return v.text;
				if (typeof v.hint === "string") return v.actual ? `${v.hint}（${v.actual}）` : v.hint;
				if (typeof v.title === "string") return v.title;
				if (typeof v.message === "string") return v.message;
				if (typeof v.msg === "string") return v.msg;
				try {
					return JSON.stringify(v);
				} catch {
					return String(v);
				}
			}
			return String(v);
		}

		const TASK_MARK = { done: "✓ ", doing: "▶ ", blocked: "✗ ", todo: "○ " };

		/** 一条任务显示成「○ 标题 @谁」 */
		function taskLine(t) {
			if (!t || typeof t !== "object") return asText(t);
			const mark = TASK_MARK[t.status] ?? "○ ";
			const who = t.who && t.who !== "我" ? ` @${t.who}` : "";
			return `${mark}${asText(t.title ?? t.text ?? t.id)}${who}`;
		}

		/* ===================== 样式 ===================== */

		const CSS = `
.pmf-wrap{display:flex;height:100%;min-height:0;overflow:hidden;font-size:13px;color:var(--dsw-alias-text-primary,inherit)}
.pmf-side{width:250px;flex:0 0 250px;border-right:1px solid var(--dsw-alias-border,rgba(128,128,128,.22));display:flex;flex-direction:column;min-height:0}
.pmf-side-head{padding:10px 12px 6px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.pmf-side-title{font-weight:600;font-size:12px;letter-spacing:.02em;opacity:.75}
.pmf-refresh{border:none;background:transparent;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:6px;color:inherit;opacity:.6}
.pmf-refresh:hover{opacity:1;background:var(--dsw-alias-surface-muted,rgba(128,128,128,.12))}
.pmf-list{flex:1;min-height:0;overflow:auto;padding:0 6px 10px}
.pmf-item{width:100%;text-align:left;border:1px solid transparent;background:transparent;cursor:pointer;border-radius:8px;padding:8px 9px;display:block;color:inherit;font:inherit;margin-bottom:2px}
.pmf-item:hover{background:var(--dsw-alias-surface-muted,rgba(128,128,128,.1))}
.pmf-item.on{background:var(--dsw-alias-surface-muted,rgba(128,128,128,.16));border-color:var(--dsw-alias-border,rgba(128,128,128,.3))}
.pmf-item-t{font-weight:600;line-height:1.35;word-break:break-all}
.pmf-item-s{margin-top:3px;font-size:12px;opacity:.72;line-height:1.4}
.pmf-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;opacity:.6;margin-right:5px}
.pmf-main{flex:1;min-width:0;overflow:auto;padding:14px 18px 28px}
.pmf-h1{font-size:15px;font-weight:650;margin:0 0 2px;line-height:1.4}
.pmf-sub{font-size:12px;opacity:.68;margin-bottom:14px}
.pmf-card{border:1px solid var(--dsw-alias-border,rgba(128,128,128,.22));border-radius:10px;padding:11px 13px;margin-bottom:12px;background:var(--dsw-alias-surface,rgba(128,128,128,.04))}
.pmf-card-h{font-size:11px;font-weight:650;letter-spacing:.04em;opacity:.55;margin-bottom:9px;text-transform:uppercase}
.pmf-kv{display:flex;gap:8px;margin-bottom:5px;line-height:1.5}
.pmf-kv-k{flex:0 0 66px;opacity:.6}
.pmf-kv-v{flex:1;min-width:0;word-break:break-word}
.pmf-flow{display:flex;flex-direction:column;gap:0}
.pmf-node{border-radius:8px;padding:6px 10px;line-height:1.4;border:1px solid transparent;display:flex;gap:7px;align-items:flex-start}
.pmf-node.done{background:rgba(47,158,68,.13);border-color:rgba(47,158,68,.35)}
.pmf-node.current{background:rgba(240,140,0,.15);border-color:rgba(240,140,0,.45);font-weight:600}
.pmf-node.blocked{background:rgba(224,49,49,.13);border-color:rgba(224,49,49,.4)}
.pmf-node.pending{background:rgba(128,128,128,.08);border-color:rgba(128,128,128,.2);opacity:.85}
.pmf-dot{flex:0 0 6px;width:6px;height:6px;border-radius:50%;margin-top:6px;background:currentColor;opacity:.55}
.pmf-node.done .pmf-dot{background:#2f9e44;opacity:1}
.pmf-node.current .pmf-dot{background:#f08c00;opacity:1}
.pmf-node.blocked .pmf-dot{background:#e03131;opacity:1}
.pmf-arrow{margin-left:13px;padding:1px 0;font-size:11px;opacity:.35;line-height:1.2}
.pmf-chiprow{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.pmf-chip{border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.4;border:1px solid transparent;max-width:100%}
.pmf-empty{padding:26px 14px;text-align:center;opacity:.6;font-size:12px;line-height:1.7}
.pmf-err{padding:12px;border-radius:8px;background:rgba(224,49,49,.1);border:1px solid rgba(224,49,49,.3);font-size:12px;line-height:1.6;word-break:break-all}
.pmf-ul{margin:0;padding-left:16px;line-height:1.65}
.pmf-ul li{margin-bottom:2px}
.pmf-tag{display:inline-block;font-size:11px;padding:0 6px;border-radius:99px;line-height:17px;border:1px solid currentColor;opacity:.75;margin-left:6px}
.pmf-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 2px}
.pmf-btn{font:inherit;font-size:12px;line-height:20px;padding:2px 10px;border-radius:6px;cursor:pointer;border:1px solid var(--dsw-alias-border,rgba(128,128,128,.35));background:transparent;color:inherit;opacity:.9}
.pmf-btn:hover:not(:disabled){opacity:1;background:var(--dsw-alias-surface-muted,rgba(128,128,128,.12))}
.pmf-btn:disabled{opacity:.4;cursor:default}
.pmf-notice{font-size:12px;opacity:.75;margin-left:4px}
.pmf-card-warn{border-left:3px solid #f59e0b;padding-left:10px}
.pmf-taskdone{font:inherit;font-size:11px;line-height:16px;padding:0 5px;margin-left:6px;border-radius:4px;cursor:pointer;border:1px solid var(--dsw-alias-border,rgba(128,128,128,.35));background:transparent;color:inherit;opacity:.55}
.pmf-taskdone:hover{opacity:1;color:#0a7d32;border-color:#0a7d32}
.pmf-badge{display:inline-flex;align-items:center;gap:5px;margin-right:6px;padding:1px 7px 1px 6px;border-radius:99px;border:1px solid var(--dsw-alias-border,rgba(128,128,128,.3));background:var(--dsw-alias-surface-muted,rgba(128,128,128,.1));color:var(--dsw-alias-text-secondary,inherit);font-size:11px;line-height:16px;font-weight:500;white-space:nowrap;user-select:none;pointer-events:none}
.pmf-badge-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-accent,#3b82f6);box-shadow:0 0 0 2px var(--dsw-alias-accent-alpha,rgba(59,130,246,.18))}
/* ---- 阶段带：横排主路径，已走过的着色，当前放大 ---- */
.pmf-rail{position:relative;padding:2px 0 0}
.pmf-railbar{height:3px;border-radius:99px;background:rgba(128,128,128,.22);overflow:hidden;margin:0 6px 12px}
.pmf-railfill{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#34d399,#22d3ee);transition:width .25s ease}
.pmf-railrow{display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding-bottom:2px}
.pmf-stop{position:relative;flex:1 1 0;min-width:58px;text-align:center;padding:0 2px}
.pmf-stop:not(:last-child)::after{content:"";position:absolute;top:9px;left:calc(50% + 11px);right:calc(-50% + 11px);height:1.5px;background:rgba(128,128,128,.3)}
.pmf-stop.done:not(:last-child)::after{background:#34d399}
.pmf-stopdot{width:20px;height:20px;line-height:19px;border-radius:50%;margin:0 auto 5px;font-size:11px;font-weight:600;border:1.5px solid rgba(128,128,128,.45);color:inherit;opacity:.8;background:transparent}
.pmf-stop.done .pmf-stopdot{border-color:#34d399;background:rgba(52,211,153,.18);color:#2f9e44;opacity:1}
.pmf-stop.current .pmf-stopdot{border-color:#22d3ee;background:rgba(34,211,238,.2);color:#0891b2;opacity:1;box-shadow:0 0 0 3px rgba(34,211,238,.16);transform:scale(1.12)}
.pmf-stop.blocked .pmf-stopdot{border-color:#fb7185;background:rgba(251,113,133,.18);color:#e11d48;opacity:1}
.pmf-stopname{font-size:11px;line-height:1.35;opacity:.62;word-break:break-all}
.pmf-stop.done .pmf-stopname{opacity:.82}
.pmf-stop.current .pmf-stopname{opacity:1;font-weight:650}
.pmf-stop.blocked .pmf-stopname{opacity:1;color:#e11d48}
/* ---- 泳道：按负责人分道，每条任务一张卡 ---- */
.pmf-lanes{display:flex;flex-direction:column;gap:7px}
.pmf-lane{display:flex;gap:9px;align-items:stretch}
.pmf-lanelabel{flex:0 0 62px;display:flex;flex-direction:column;justify-content:center;padding:5px 7px;border-radius:7px;background:rgba(128,128,128,.1);border:1px solid rgba(128,128,128,.22)}
.pmf-lanelabel-t{font-size:11px;font-weight:600;line-height:1.3;word-break:break-all}
.pmf-lanelabel-n{font-size:10px;opacity:.55;margin-top:1px}
.pmf-laneitems{flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pmf-task{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:5px 8px;border-radius:7px;font-size:12px;line-height:1.4;border:1px solid rgba(128,128,128,.26);background:rgba(128,128,128,.06)}
.pmf-task.done{border-color:rgba(52,211,153,.5);background:rgba(52,211,153,.12)}
.pmf-task.current{border-color:rgba(34,211,238,.55);background:rgba(34,211,238,.13);font-weight:600}
.pmf-task.blocked{border-color:rgba(251,113,133,.5);background:rgba(251,113,133,.12)}
.pmf-taskmark{flex:0 0 auto;font-size:11px;opacity:.85}
.pmf-task.done .pmf-taskmark{color:#2f9e44;opacity:1}
.pmf-task.current .pmf-taskmark{color:#0891b2;opacity:1}
.pmf-task.blocked .pmf-taskmark{color:#e11d48;opacity:1}
.pmf-tasktext{min-width:0;word-break:break-word}
.pmf-taskid{flex:0 0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;opacity:.5}
.pmf-open{display:inline-block;margin-top:9px;font-size:11px;color:var(--dsw-alias-accent,#3b82f6);text-decoration:none;opacity:.85}
.pmf-open:hover{opacity:1;text-decoration:underline}
`;

		function Style() {
			return hMake("style", { "data-dsh-part": "pm-flow-style" }, CSS);
		}

		/* ===================== 流程图（swimlane 风格，参照 archify 的设计语言） =====================
		 *
		 * archify 的画法是：泳道（lane）+ 阶段带（phase）+ 主路径（mainPath）高亮，
		 * 节点是一张卡：类型图标 / 标题 / 副标题 / 标签；当前节点加重，已走在主路径上的连线着色。
		 * 它是 787KB 的独立 HTML 应用，搬不进一个 React 面板，所以这里只照它的语言重画：
		 *   · StageRail  = 阶段带：横向主路径，已走过的着色、当前放大、未到的灰掉
		 *   · TaskLanes  = 泳道：按「找谁确认」分道，每条任务一个节点卡
		 * 全部是普通 DOM + CSS，没有构建产物，也没有外部依赖。
		 */

		/** 把 mermaid 里的阶段节点按「① 收料 ✓」拆成 {no, name, state} */
		function parseStages(src) {
			const flow = parseFlow(src);
			const out = [];
			for (const id of flow.order) {
				const n = flow.nodes.get(id);
				if (!n) continue;
				const st = stateOf(id, n.label, flow.classes);
				const raw = n.label.replace(/[✓◀○✗△▶]/g, "").trim();
				const m = /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫])\s*(.*)$/.exec(raw);
				out.push({
					id,
					no: m ? m[1] : "",
					name: m ? m[2] : raw,
					state: st,
				});
			}
			return out;
		}

		const TASK_STATE = { done: "done", doing: "current", blocked: "blocked", todo: "pending" };

		/**
		 * 「在 archify 里看」的入口。
		 * 面板里画的是精简版（DOM + CSS，秒开），archify 那套是 847KB 的独立页面
		 * （泳道网格 / 阶段带 / 主路径高亮 / 可缩放导出），所以做成一个新窗口打开，
		 * 由 Host 端 route /pm-flow/graph 现场渲染，不塞进面板 DOM。
		 */
		function archifyLink(d, kind, text) {
			const h = hMake;
			if (!d || !d.dir) return null;
			const url = `${GRAPH_URL}?panel=${encodeURIComponent(d.dir)}&kind=${kind}`;
			return h(
				"a",
				{ className: "pmf-open", href: url, target: "_blank", rel: "noopener", title: "用 archify 渲染的完整版（可缩放、可导出 PNG）" },
				text ?? "在 archify 里看",
			);
		}

		/** 横排阶段带：主路径上的节点，已走过的连线着色，当前那节放大 */
		function StageRail(props) {
			const h = hMake;
			const stages = props.stages ?? [];
			if (!stages.length) return h("div", { className: "pmf-item-s" }, "还没有阶段信息。");

			const doneCount = stages.filter((s) => s.state === "done").length;
			const pct = Math.round((doneCount / stages.length) * 100);

			return h(
				"div",
				{ className: "pmf-rail", "data-dsh-part": "pm-flow-rail" },
				h(
					"div",
					{ className: "pmf-railbar" },
					h("span", { className: "pmf-railfill", style: { width: pct + "%" } }),
				),
				h(
					"div",
					{ className: "pmf-railrow" },
					stages.map((s, i) =>
						h(
							"div",
							{ key: s.id, className: "pmf-stop " + s.state, "data-state": s.state, title: s.name },
							h("div", { className: "pmf-stopdot" }, s.state === "done" ? "✓" : s.no || String(i + 1)),
							h("div", { className: "pmf-stopname" }, s.name),
						),
					),
				),
			);
		}

		/** 泳道：按「谁」分道，每条任务一张小卡 */
		function TaskLanes(props) {
			const h = hMake;
			const tasks = props.tasks ?? [];
			if (!tasks.length) return h("div", { className: "pmf-item-s" }, "这个阶段还没有任务。");

			const lanes = [];
			const index = new Map();
			for (const t of tasks) {
				const who = t.who && t.who !== "我" ? t.who : "我";
				if (!index.has(who)) {
					index.set(who, lanes.length);
					lanes.push({ who, items: [] });
				}
				lanes[lanes.indexOf(lanes[index.get(who)])];
				lanes[index.get(who)].items.push(t);
			}
			// 「我」排最前，其余按任务数倒序
			lanes.sort((a, b) => (a.who === "我" ? -1 : b.who === "我" ? 1 : b.items.length - a.items.length));

			return h(
				"div",
				{ className: "pmf-lanes", "data-dsh-part": "pm-flow-lanes" },
				lanes.map((lane) =>
					h(
						"div",
						{ key: lane.who, className: "pmf-lane" },
						h(
							"div",
							{ className: "pmf-lanelabel" },
							h("span", { className: "pmf-lanelabel-t" }, lane.who),
							h("span", { className: "pmf-lanelabel-n" }, String(lane.items.length)),
						),
						h(
							"div",
							{ className: "pmf-laneitems" },
							lane.items.map((t) =>
								h(
									"div",
									{ key: t.id, className: "pmf-task " + (TASK_STATE[t.status] ?? "pending"), "data-state": TASK_STATE[t.status] ?? "pending" },
									h("span", { className: "pmf-taskmark" }, t.status === "done" ? "✓" : t.status === "doing" ? "▶" : t.status === "blocked" ? "✗" : "○"),
									h("span", { className: "pmf-tasktext" }, asText(t.title ?? t.text ?? t.id)),
									t.id ? h("span", { className: "pmf-taskid" }, asText(t.id)) : null,
									props.onDone && t.status !== "done"
										? h(
												"button",
												{
													type: "button",
													className: "pmf-taskdone",
													title: "标记这个任务已完成",
													onClick: (e) => {
														e.stopPropagation();
														props.onDone(t.id);
													},
												},
												"✓",
											)
										: null,
								),
							),
						),
					),
				),
			);
		}

		/* ===================== 面板 ===================== */
		function useData() {
			const [board, setBoard] = react.useState(null);
			const [sel, setSel] = react.useState("");
			const [detail, setDetail] = react.useState(null);
			const [err, setErr] = react.useState("");
			const [busy, setBusy] = react.useState(false);
			const [nonce, setNonce] = react.useState(0);
			const [notice, setNotice] = react.useState("");

			/**
			 * 面板上的写操作。所有请求都带 dir，宿主那边会补 --by user，
			 * 所以模型下次读状态时能看出「这是用户自己点的」。
			 */
			const act = react.useCallback(
				(op, payload) => {
					if (!sel) return Promise.resolve();
					setBusy(true);
					setNotice("");
					return fetch(ACT_URL, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ op, dir: sel, ...(payload || {}) }),
					})
						.then((r) => r.json())
						.then((d) => {
							if (!d?.ok) {
								setNotice(d?.error || "没成功");
								return;
							}
							setNotice(d?.acted?.result?.message || d?.acted?.stdout || "已更新");
							if (d.state) setDetail({ ...d.state, ok: true });
							setNonce((n) => n + 1);
						})
						.catch((e) => setNotice(String(e?.message ?? e)))
						.finally(() => setBusy(false));
				},
				[sel],
			);

			const loadBoard = react.useCallback(() => {
				setBusy(true);
				fetch(STATE_URL, { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => {
						if (!d?.ok) throw new Error(d?.error || "看板读取失败");
						setErr("");
						setBoard(d);
					})
					.catch((e) => setErr(String(e?.message ?? e)))
					.finally(() => setBusy(false));
			}, []);

			react.useEffect(loadBoard, [nonce]);

			const loadDetail = react.useCallback((dir) => {
				if (!dir) return;
				setSel(dir);
				setDetail(null);
				fetch(STATE_URL + "?panel=" + encodeURIComponent(dir), { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => {
						if (!d?.ok) throw new Error(d?.error || "读取失败");
						// 路由把 status 的 json 原样透出来：{ok, result, mermaid, taskMermaid}
						setDetail({ ...d, ...(d.result || {}) });
					})
					.catch((e) => setDetail({ ok: false, error: String(e?.message ?? e), dir }));
			}, []);

			// 第一次拿到看板，自动选第一个
			react.useEffect(() => {
				if (sel || !board) return;
				const list = board.projects ?? [];
				if (list.length === 1) loadDetail(list[0].dir);
			}, [board, sel, loadDetail]);

			return { board, sel, detail, err, busy, notice, act, reload: () => setNonce((n) => n + 1), loadDetail };
		}

		function BoardRow(props) {
			const h = hMake;
			const p = props.row;
			const wait = asList(p.waiting)
				.map((w) => `${asText(w.who)}×${asCount(w.count)}`)
				.join("、");
			return h(
				"button",
				{
					type: "button",
					className: "pmf-item" + (props.on ? " on" : ""),
					onClick: props.onClick,
					title: p.dir,
				},
				h("div", { className: "pmf-item-t" }, asText(p.title) || asText(p.id)),
				h("div", { className: "pmf-item-s" }, h("span", { className: "pmf-mono" }, asText(p.id)), `${asText(p.stageName) || "未开始"} · ${asText(p.progress) || "-"}`),
				h(
					"div",
					{ className: "pmf-item-s" },
					`任务 ${asCount(p.tasksDone)}/${asCount(p.tasksTotal)}`,
					wait ? ` · 等 ${wait}` : "",
					asCount(p.openReviews) ? ` · 问题 ${asCount(p.openReviews)}` : "",
					asCount(p.blockers) ? ` · 卡点 ${asCount(p.blockers)}` : "",
				),
			);
		}

		function Detail(props) {
			const h = hMake;
			const d = props.data;
			const act = props.act || (() => {});

			if (!d) return h("div", { className: "pmf-empty" }, "正在读取…");
			if (d.ok === false) return h("div", { className: "pmf-err" }, "读不到这个工作区：", h("br"), d.error);

			const head = h(
				"div",
				null,
				h("div", { className: "pmf-h1" }, d.title || d.id),
				h(
					"div",
					{ className: "pmf-sub" },
					h("span", { className: "pmf-mono" }, d.id),
					`${d.stageName || "未开始"} · ${d.progress || "-"}`,
					d.initialized === false ? h("span", { className: "pmf-tag" }, "还没开始") : null,
				),
			);

			const gates = asList(d.gateFailures);
			const nowCard = h(
				"div",
				{ className: "pmf-card" },
				h("div", { className: "pmf-card-h" }, "现在该做的"),
				h("div", { className: "pmf-kv" }, h("div", { className: "pmf-kv-v" }, asText(d.next) || asText(d.notice) || "—")),
				d.canAdvance ? h("div", { className: "pmf-kv" }, h("div", { className: "pmf-kv-k" }, "门禁"), h("div", { className: "pmf-kv-v" }, "已满足，可以推进")) : null,
				gates.length
					? h(
							"div",
							{ className: "pmf-kv" },
							h("div", { className: "pmf-kv-k" }, "还差"),
							h(
								"div",
								{ className: "pmf-kv-v" },
								h("ul", { className: "pmf-ul" }, gates.map((g, i) => h("li", { key: i }, asText(g)))),
							),
						)
					: null,
			);

			// 阶段带：从 mermaid 解析出 9/11 个阶段，横排成一条带（已走过的着色、当前放大、未到的灰）
			const stages = d.mermaid ? parseStages(d.mermaid) : [];
			const stageCard = stages.length
				? h(
						"div",
						{ className: "pmf-card" },
						h("div", { className: "pmf-card-h" }, "流程进度"),
						h(StageRail, { stages }),
						archifyLink(d, "flow", "在 archify 里看这张图"),
					)
				: null;

			const taskList = asList(d.tasks, "current");
			const taskCard = h(
				"div",
				{ className: "pmf-card" },
				h("div", { className: "pmf-card-h" }, "任务链 · 本阶段"),
				taskList.length ? h(TaskLanes, { tasks: taskList, onDone: (id) => act("task-done", { id }) }) : h("div", { className: "pmf-item-s" }, "这个阶段还没有任务。"),
				taskList.length ? archifyLink(d, "tasks", "在 archify 里看泳道图") : null,
			);

			const reviews = asList(d.openReviews);
			const blockers = asList(d.blockers);
			const misc = [];
			if (reviews.length) misc.push(`评审待闭环 ${reviews.length} 条`);
			if (blockers.length) misc.push(`卡点 ${blockers.length} 个`);
			if (asList(d.subs).length) misc.push(`子需求 ${asList(d.subs).length} 个`);
			const miscCard = misc.length
				? h(
						"div",
						{ className: "pmf-card" },
						h("div", { className: "pmf-card-h" }, "其它"),
						h("div", null, misc.join(" · ")),
						reviews.length
							? h(
									"ul",
									{ className: "pmf-ul", style: { marginTop: "8px" } },
									reviews.map((r, i) =>
										h(
											"li",
											{ key: r.id ?? i },
											`#${r.id ?? "?"} ${asText(r.text ?? r.title)}`,
											r.owner ? ` — ${asText(r.owner)}` : "",
											r.status === "deferred" ? "（已转业务确认）" : "",
										),
									),
								)
							: null,
					)
				: null;

			/* ---- 操作条：面板不再只是看的 ---- */
			const btn = (label, op, payload, title) =>
				h(
					"button",
					{
						type: "button",
						className: "pmf-btn",
						onClick: () => act(op, payload),
						disabled: props.busy,
						title: title || label,
					},
					label,
				);

			const actionBar = h(
				"div",
				{ className: "pmf-actions" },
				d.canAdvance && d.initialized !== false ? btn("推进到下一阶段", "advance", null, "走一遍门禁，过了就进下一阶段") : null,
				btn("同步知识库", "sync", null, "把这个工作区的材料与状态镜像进 Obsidian"),
				btn("体检", "check", null, "查缺文件、依赖成环、字段叫法、demo 覆盖"),
				props.notice ? h("span", { className: "pmf-notice" }, props.notice) : null,
			);

			/* ---- 我不在的时候，谁改过什么 ---- */
			const ch = d.changes || {};
			const chItems = asList(ch, "items");
			const changesCard =
				ch.total > 0
					? h(
							"div",
							{ className: "pmf-card pmf-card-warn" },
							h("div", { className: "pmf-card-h" }, `⚠ 你上次查看之后有 ${ch.total} 条改动${ch.byUser ? `（其中 ${ch.byUser} 条是用户手动改的）` : ""}`),
							h(
								"ul",
								{ className: "pmf-ul" },
								chItems.slice(-6).map((x, i) =>
									h("li", { key: i }, h("span", { className: "pmf-mono" }, x.by === "user" ? "用户 " : "AI "), `${shortTime(x.at)} ${asText(x.action)} ${asText(x.note)}`),
								),
							),
							h(
								"div",
								{ className: "pmf-actions" },
								btn("我已知晓", "ack", null, "记下这个水位，之后的改动才会再提醒"),
							),
						)
					: null;

			/* ---- 反思 ---- */
			const rf = d.reflect;
			const reflectCard = rf
				? h(
						"div",
						{ className: "pmf-card" + (rf.open ? " pmf-card-warn" : "") },
						h("div", { className: "pmf-card-h" }, `反思 · 第 ${rf.round} 轮${rf.closed ? "（已收尾）" : rf.open ? `（${rf.open} 条待处理）` : "（进行中）"}`),
						h("div", { className: "pmf-item-s" }, `阶段 ${rf.stage || "-"} · 发起 ${rf.by === "human" ? "用户" : "AI"}${rf.focus ? ` · 聚焦 ${rf.focus}` : ""}`),
						h(
							"div",
							{ className: "pmf-actions" },
							!rf.closed ? btn("收尾本轮", "reflect-close", null, "还有没处理的会拦一下") : null,
							btn("再开一轮", "reflect-start", null, "按当前阶段重新给一组自我拷问"),
						),
					)
				: h(
						"div",
						{ className: "pmf-card" },
						h("div", { className: "pmf-card-h" }, "反思"),
						h("div", { className: "pmf-item-s" }, "还没做过反思。推进前先自问几句，比评审时被问穿划算。"),
						h("div", { className: "pmf-actions" }, btn("开一轮反思", "reflect-start", null, "按当前阶段给一组自我拷问")),
					);

			/* ---- 改路线 ---- */
			const rr = d.reroute;
			const props2 = asList(rr, "proposals");
			const rerouteCard = props2.length
				? h(
						"div",
						{ className: "pmf-card pmf-card-warn" },
						h("div", { className: "pmf-card-h" }, `路线建议 · ${props2.length} 条`),
						h(
							"ul",
							{ className: "pmf-ul" },
							props2.map((p) =>
								h(
									"li",
									{ key: p.id },
									h("b", null, asText(p.title)),
									h("div", { className: "pmf-item-s" }, asText(p.why)),
									h(
										"div",
										{ className: "pmf-actions" },
										btn("按这条改", "reroute-apply", { id: p.id }),
										btn("忽略", "reroute-dismiss", { id: p.id, reason: "面板上忽略" }),
									),
								),
							),
						),
					)
				: h(
						"div",
						{ className: "pmf-card" },
						h("div", { className: "pmf-card-h" }, "路线"),
						h("div", { className: "pmf-item-s" }, "没发现需要改路线的信号。"),
						h("div", { className: "pmf-actions" }, btn("重新体检路线", "reroute")),
					);

			return h("div", null, head, actionBar, changesCard, nowCard, reflectCard, rerouteCard, stageCard, taskCard, miscCard);
		}
		function Panel() {
			const h = hMake;
			const s = useData();
			const list = s.board?.projects ?? [];

			const side = h(
				"div",
				{ className: "pmf-side" },
				h(
					"div",
					{ className: "pmf-side-head" },
					h("div", { className: "pmf-side-title" }, `在跟的需求${list.length ? ` · ${list.length}` : ""}`),
					h("button", { type: "button", className: "pmf-refresh", onClick: s.reload, disabled: s.busy, title: "重新读取" }, s.busy ? "…" : "刷新"),
				),
				h(
					"div",
					{ className: "pmf-list" },
					list.length
						? list.map((p) =>
								h(BoardRow, {
									key: p.dir,
									row: p,
									on: p.dir === s.sel,
									onClick: () => s.loadDetail(p.dir),
								}),
							)
						: h(
								"div",
								{ className: "pmf-empty" },
								s.err ? s.err : h("span", null, "还没有在跟的需求。", h("br"), "在桌面\\文档 下新建一个目录，把材料放进去，然后说「这个需求开始走流程」。"),
							),
				),
			);

			return h(
				"div",
				{ className: "pmf-wrap", "data-dsh-plugin": "dsh-pm-flow", "data-dsh-part": "pm-flow-panel" },
				h(Style),
				side,
				h("div", { className: "pmf-main" }, s.sel ? h(Detail, { data: s.detail, act: s.act, busy: s.busy, notice: s.notice }) : h("div", { className: "pmf-empty" }, list.length ? "左边选一个需求看进度。" : "")),
			);
		}

		/* ===================== 左侧栏图标 ===================== */

		function SidebarIcon() {
			const h = hMake;
			return h(
				"span",
				{ "data-dsh-plugin": "dsh-pm-flow", "data-dsh-part": "pm-flow-icon", style: { display: "flex", alignItems: "center", justifyContent: "center" }, title: "需求进度看板" },
				h(
					"svg",
					{ width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
					h("rect", { x: 1.5, y: 1.5, width: 5.5, height: 5.5, rx: 1.4, stroke: "currentColor", strokeWidth: 1.3 }),
					h("rect", { x: 9, y: 1.5, width: 5.5, height: 5.5, rx: 1.4, stroke: "currentColor", strokeWidth: 1.3, opacity: 0.55 }),
					h("rect", { x: 1.5, y: 9, width: 5.5, height: 5.5, rx: 1.4, stroke: "currentColor", strokeWidth: 1.3, opacity: 0.55 }),
					h("rect", { x: 9, y: 9, width: 5.5, height: 5.5, rx: 1.4, stroke: "currentColor", strokeWidth: 1.3 }),
				),
			);
		}

		/* ===================== 模型名旁的 Rester 标记 ===================== */

		function AgentBadge() {
			const h = hMake;
			return h(
				"span",
				{
					className: "pmf-badge",
					"data-dsh-plugin": "dsh-pm-flow",
					"data-dsh-part": "agent-badge",
					title: "pm-flow 已加载 · Rester 调度中",
					"aria-label": "pm-flow 已加载，Rester 调度中",
				},
				h("span", { className: "pmf-badge-dot" }),
				AGENT_NAME,
			);
		}

		/* ===================== 注册 ===================== */

		const name = "pm-flow-client";
		const inject = ["slots"];

		/**
		 * Rester 标记为什么挂在 conversation.input.right 而不是 conversation.input.model.label：
		 *
		 *   label 是 single 槽位，壳子的调用是
		 *     renderSlot("conversation.input.model.label", {provider, model, placement, selected},
		 *                { fallback: model.name })
		 *   第三参 fallback 的语义是「没人注册才渲染模型名」——注册进去就把模型名顶掉了，
		 *   而且这个函数在下拉菜单每一项里也会被调用，等于连菜单里的模型名一起盖。
		 *
		 *   right 是 list 槽位（只追加、不替换），渲染位置在
		 *     standardControls.children = [ renderSlot("conversation.input.right"), renderSlot("conversation.input.model") ]
		 *   正好在模型选择器左边。模型选择器本身一个字都不碰。
		 */
		function apply(ctx) {
			const slots = ctx.slots;

			const stopBadge = slots.inject("conversation.input.right", () =>
				slots.register({ name: "conversation.input.right", id: "pm-flow-agent", order: 90, label: () => AGENT_NAME }, AgentBadge),
			);

			// 左侧活动栏：图标 + 主区面板（面板用同一个 id 作为 main 槽的 key）
			const stopIcon = slots.inject("sidebar.panellist", () =>
				slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 40, label: () => "需求进度看板" }, SidebarIcon),
			);

			const stopPanel = slots.inject("main", () => slots.register({ name: "main", key: PANEL_ID }, Panel));

			ctx.effect?.(() => () => {
				stopBadge?.();
				stopIcon?.();
				stopPanel?.();
			}, "pm-flow: agent badge + board panel");
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
