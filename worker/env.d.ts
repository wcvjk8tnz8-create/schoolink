/// <reference types="@cloudflare/workers-types" />

interface Env {
  /** Next.js 静态导出产物 */
  ASSETS: Fetcher;
  /** 账号 + 聊天数据（持久化） */
  DB: D1Database;
  /** 缓存 / 会话白名单 / OTP / 热配置 */
  CACHE: KVNamespace;
  /** 图片与语音对象（可选，未启用时整体降级） */
  IMAGES?: R2Bucket;
  /** 每个用户一个 Durable Object 信箱，负责 WebSocket 实时推送 */
  REALTIME: DurableObjectNamespace;
  /** Workers AI（可选；未开通时 AI 助手自动降级为本地回复） */
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };

  // Worker Secrets
  SESSION_SECRET?: string;
  ADMIN_PASSWORD?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;

  // Worker Vars（GitHub Action 生成，/admin 可热覆盖）
  ALLOWED_EMAIL_DOMAINS?: string;
  ADMIN_EMAILS?: string;
  SCHOOL_NAME?: string;
  ALLOW_DEV_OTP?: string;
  R2_PUBLIC_BASE_URL?: string;
  REQUIRE_BOUND_EMAIL?: string;
}
