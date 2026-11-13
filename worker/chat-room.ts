/**
 * RealtimeHub：每个用户一个 Durable Object（房间名 `user:<uid>`）。
 *
 * 客户端只保持 1 条 WebSocket，切会话不用重连，也不会漏掉其它会话的新消息。
 * Worker 在任何变更后把事件扇出到相关成员的信箱，前端按 threadId 过滤。
 *
 * 用 WebSocket Hibernation：空闲时 DO 可被换出内存而连接不断，适合校园作息。
 * 继承 `DurableObject` 基类（SQLite-backed 命名空间的推荐写法）。
 *
 * 安全：客户端 WS 只能发 ping；消息、编辑、删除、typing、已读全部走 HTTP API，
 * 由 Worker 鉴权 + 写 D1 后才广播，客户端无法伪造内容。
 */
import { DurableObject } from "cloudflare:workers";

interface Attachment { userId: string; joinedAt: number }

export class RealtimeHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    try {
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    } catch { /* 旧 runtime 由 webSocketMessage 兜底 */ }
  }

  private sockets(): WebSocket[] {
    try { return this.ctx.getWebSockets(); } catch { return []; }
  }

  private broadcast(payload: unknown): number {
    const data = JSON.stringify(payload);
    let n = 0;
    for (const ws of this.sockets()) {
      try {
        if ((ws as unknown as { readyState: number }).readyState === 1) { ws.send(data); n++; }
      } catch { /* 已断开 */ }
    }
    return n;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const userId = url.searchParams.get("uid") || "anon";
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ userId, joinedAt: Date.now() } satisfies Attachment);
      try { client.send(JSON.stringify({ type: "hello", at: Date.now() })); } catch { /* noop */ }
      return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
    }

    // 仅 Worker 内部调用（Durable Object 不能被公网直接 fetch）
    if (url.pathname === "/broadcast" && request.method === "POST") {
      let payload: unknown;
      try { payload = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
      const n = this.broadcast(payload);
      return new Response(JSON.stringify({ ok: true, delivered: n }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/status") {
      return new Response(JSON.stringify({ ok: true, connections: this.sockets().length }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw !== "ping") return;
    try { ws.send(JSON.stringify({ type: "pong", at: Date.now() })); } catch { /* noop */ }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try { ws.close(code, reason); } catch { /* 新版 runtime 自动完成握手 */ }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(1011, "Internal error"); } catch { /* noop */ }
  }
}
