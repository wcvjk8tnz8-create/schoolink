/**
 * v1 → v4 在线迁移（幂等，无需停机、无需换 D1 数据库）。
 *
 * 背景：v1 已经在线上跑过，D1 里的 users / threads / thread_members / messages
 * 是旧结构。`CREATE TABLE IF NOT EXISTS` 不会给已存在的表补列，
 * 所以这里在 Worker 首次处理 /api/* 时做一次自愈：
 *   1. 补齐 v2 新增列（ALTER TABLE ADD COLUMN，重复执行会被忽略）
 *   2. 建立 v2 新增的 reactions / starred 表
 *   3. 把 v1 的 image_key 回填成 v2 的 media_key，旧图片不会消失
 *
 * 用 KV 标记 + isolate 内存标记双保险：全局只跑一次完整检查，
 * 之后每个请求零额外开销。KV 最终一致导致并发重复执行也无害（try/catch）。
 */
import { kvPut } from "./kv";

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, student_id TEXT NOT NULL,
    display_name TEXT NOT NULL, about TEXT NOT NULL DEFAULT '', avatar_key TEXT,
    role TEXT NOT NULL DEFAULT 'user', banned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL DEFAULT 0,
    show_online INTEGER NOT NULL DEFAULT 1, read_receipts INTEGER NOT NULL DEFAULT 1,
    class_name TEXT NOT NULL DEFAULT '', student_no TEXT NOT NULL DEFAULT '',
    login_key TEXT NOT NULL DEFAULT '', password_hash TEXT,
    email_bound INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_login ON users(login_key)`,
  `CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT, about TEXT NOT NULL DEFAULT '',
    avatar_key TEXT, direct_key TEXT UNIQUE, is_default INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    last_message_at INTEGER NOT NULL DEFAULT 0, accent TEXT,
    announcement_only INTEGER NOT NULL DEFAULT 0,
    members_can_invite INTEGER NOT NULL DEFAULT 1)`,
  `CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS thread_members (
    thread_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
    last_read_at INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
    muted INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
    starred INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (thread_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS idx_tm_user ON thread_members(user_id)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'text', body TEXT NOT NULL DEFAULT '',
    media_key TEXT, media_name TEXT, media_size INTEGER, media_type TEXT,
    duration INTEGER, reply_to TEXT, forwarded_from TEXT, edited_at INTEGER,
    deleted_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_msg_thread_time ON messages(thread_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_msg_sender ON messages(sender_id)`,
  `CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL, PRIMARY KEY (message_id, user_id, emoji))`,
  `CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id)`,
  `CREATE TABLE IF NOT EXISTS starred (
    user_id TEXT NOT NULL, message_id TEXT NOT NULL, thread_id TEXT NOT NULL,
    created_at INTEGER NOT NULL, PRIMARY KEY (user_id, message_id))`,
  `CREATE INDEX IF NOT EXISTS idx_starred_user ON starred(user_id, created_at DESC)`,
];

/** v2 相对 v1 新增的列；全部带常量默认值，SQLite ADD COLUMN 允许。 */
const NEW_COLUMNS: Record<string, string[]> = {
  users: [
    "about TEXT NOT NULL DEFAULT ''",
    "banned INTEGER NOT NULL DEFAULT 0",
    "last_seen INTEGER NOT NULL DEFAULT 0",
    "show_online INTEGER NOT NULL DEFAULT 1",
    "read_receipts INTEGER NOT NULL DEFAULT 1",
    "class_name TEXT NOT NULL DEFAULT ''",
    "student_no TEXT NOT NULL DEFAULT ''",
    "login_key TEXT NOT NULL DEFAULT ''",
    "password_hash TEXT",
    "email_bound INTEGER NOT NULL DEFAULT 0",
  ],
  threads: [
    "about TEXT NOT NULL DEFAULT ''",
    "last_message_at INTEGER NOT NULL DEFAULT 0",
    "accent TEXT",
    "announcement_only INTEGER NOT NULL DEFAULT 0",
    "members_can_invite INTEGER NOT NULL DEFAULT 1",
  ],
  thread_members: [
    "pinned INTEGER NOT NULL DEFAULT 0",
    "muted INTEGER NOT NULL DEFAULT 0",
    "archived INTEGER NOT NULL DEFAULT 0",
    "starred INTEGER NOT NULL DEFAULT 0",
  ],
  messages: [
    "media_key TEXT", "media_name TEXT", "media_size INTEGER", "media_type TEXT",
    "duration INTEGER", "reply_to TEXT", "forwarded_from TEXT",
    "edited_at INTEGER", "deleted_at INTEGER",
  ],
};

let ready = false;

export async function ensureSchema(env: Env): Promise<void> {
  if (ready) return;
  try {
    const marker = await env.CACHE.get("SCHEMA:v4");
    if (marker) { ready = true; return; }
  } catch { /* KV 暂时不可用也继续，DDL 本身幂等 */ }

  for (const sql of DDL) {
    try { await env.DB.prepare(sql).run(); } catch { /* 已存在 / 并发 */ }
  }

  for (const [table, columns] of Object.entries(NEW_COLUMNS)) {
    let existing: string[] = [];
    try {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`)
        .all<{ name: string }>();
      existing = results.map((r) => String(r.name).toLowerCase());
    } catch { continue; }
    if (!existing.length) continue; // 表刚由 DDL 建好，列已齐
    for (const col of columns) {
      const name = col.split(/\s+/)[0].toLowerCase();
      if (existing.includes(name)) continue;
      try {
        await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col}`).run();
      } catch { /* duplicate column name / 并发，忽略 */ }
    }
  }

  // 旧 OTP 账号本来就用校园邮箱注册，自动视为已绑定，避免迁移后无法登录
  try {
    await env.DB.prepare(
      "UPDATE users SET email_bound=1 WHERE email_bound=0 AND email NOT LIKE 'noemail-%'",
    ).run();
  } catch { /* noop */ }

  // v1 图片 → v2 媒体字段（旧表有 image_key 时才执行）
  try {
    const { results } = await env.DB.prepare("PRAGMA table_info(messages)")
      .all<{ name: string }>();
    if (results.some((r) => String(r.name).toLowerCase() === "image_key")) {
      await env.DB.prepare(
        "UPDATE messages SET media_key = image_key, media_type = 'image' " +
        "WHERE image_key IS NOT NULL AND media_key IS NULL",
      ).run();
    }
  } catch { /* 无 image_key 列时跳过 */ }

  ready = true;
  try { await kvPut(env.CACHE, "SCHEMA:v4", String(Date.now())); } catch { /* noop */ }
}
