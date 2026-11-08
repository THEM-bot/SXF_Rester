/**
 * 极简 CDP 客户端（Chrome DevTools Protocol）。
 *
 * 只用 Node 自带的 WebSocket（Node 22+ 内置），不依赖 ws / puppeteer / playwright。
 * 一个 CDP 连接 = 一条 WebSocket，命令按 id 递增，响应按 id 回来；事件按 method 回。
 */
import { EventEmitter } from "node:events";

let WebSocketImpl = globalThis.WebSocket;
if (!WebSocketImpl) {
  const mod = await import("ws");
  WebSocketImpl = mod.default ?? mod.WebSocket ?? mod;
}

/** 连一个 CDP websocket 地址，返回可用的连接对象 */
export async function connect(wsUrl, { timeoutMs = 15000 } = {}) {
  const conn = new CdpConnection(wsUrl);
  await conn.open(timeoutMs);
  return conn;
}

export class CdpConnection extends EventEmitter {
  constructor(wsUrl) {
    super();
    this.wsUrl = wsUrl;
    this._nextId = 1;
    this._pending = new Map();
    this._sessions = new Map(); // sessionId -> { onEvent }
    this._closed = false;
    this.ws = null;
  }

  open(timeoutMs) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocketImpl(this.wsUrl, { maxPayload: 256 * 1024 * 1024 });
      this.ws = ws;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`连接 CDP 超时：${this.wsUrl}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        ws.removeEventListener?.("open", onOpen);
        ws.removeEventListener?.("error", onError);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (ev) => {
        cleanup();
        reject(new Error(`连接 CDP 失败：${ev?.message ?? ev?.error?.message ?? "unknown"}`));
      };
      if (typeof ws.on === "function") {
        ws.on("open", onOpen);
        ws.on("error", onError);
      } else {
        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onError);
      }

      const onMessage = (raw) => {
        let msg;
        try {
          msg = JSON.parse(typeof raw === "string" ? raw : raw?.data ?? String(raw));
        } catch {
          return;
        }
        if (msg.id !== undefined) {
          const p = this._pending.get(msg.id);
          if (!p) return;
          this._pending.delete(msg.id);
          if (msg.error) p.reject(new Error(`${msg.error.message}${msg.error.data ? `（${msg.error.data}）` : ""}`));
          else p.resolve(msg.result);
          return;
        }
        // 事件
        const key = msg.sessionId ?? "";
        const handler = this._sessions.get(key);
        if (handler) handler(msg);
        this.emit("event", msg);
      };
      if (typeof ws.on === "function") ws.on("message", onMessage);
      else ws.addEventListener("message", (ev) => onMessage(ev.data));

      const onClose = () => {
        this._closed = true;
        for (const [, p] of this._pending) p.reject(new Error("CDP 连接已断开"));
        this._pending.clear();
        this.emit("close");
      };
      if (typeof ws.on === "function") ws.on("close", onClose);
      else ws.addEventListener("close", onClose);
    });
  }

  /** 发一条 CDP 命令；sessionId 有值就发到那个页面会话 */
  send(method, params = {}, sessionId) {
    if (this._closed) return Promise.reject(new Error("CDP 连接已关闭"));
    const id = this._nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        this._pending.delete(id);
        reject(err);
      }
    });
  }

  /** 给某个 sessionId 注册事件回调 */
  bindSession(sessionId, onEvent) {
    this._sessions.set(sessionId ?? "", onEvent);
  }

  unbindSession(sessionId) {
    this._sessions.delete(sessionId ?? "");
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* 已经关了 */
    }
  }
}

/** 便捷 HTTP：CDP 的 /json 系列端点 */
export async function httpJson(url, { timeoutMs = 8000 } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

export async function httpOk(url, { timeoutMs = 8000 } = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}
