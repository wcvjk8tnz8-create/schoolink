import { normalizeDomains, normalizeEmail, normClass, normStudentNo, loginKeyOf, isPlaceholderEmail } from "./auth";
import { DEFAULT_AI_MODEL, normalizeAiModel } from "./ai-models";
import { kvPut } from "./kv";
import { uid } from "./util";

/* ============================== 类型 ============================== */

export interface AppConfig {
  domains: string[];
  adminEmails: string[];
  schoolName: string;
  r2PublicBaseUrl: string;
  mailApiToken: string;
  mailFrom: string;
  mailApiBase: string;
  mailSource: "panel" | "secret" | "none";
  mailConfigured: boolean;
  adminPasswordSet: boolean;
  devOtp: boolean;
  requireBoundEmail: boolean;
  /** 全局 AI 模型（管理员在 /admin 热配置） */
  aiModel: string;
  /** 是否允许学生在「设置 → AI 助手」里为这台设备覆盖模型 */
  aiAllowUserModel: boolean;
  updatedAt: number | null;
}

export interface UserRow {
  id: string; email: string; student_id: string; display_name: string;
  about: string; avatar_key: string | null; role: string; banned: number;
  created_at: number; last_seen: number;
  show_online: number; read_receipts: number;
  class_name: string; student_no: string; login_key: string;
  password_hash: string | null; email_bound: number;
}

export interface MessageRow {
  id: string; thread_id: string; sender_id: string;
  kind: "text" | "image" | "file" | "audio" | "system";
  body: string; media_key: string | null; media_name: string | null;
  media_size: number | null; media_type: string | null; duration: number | null;
  reply_to: string | null; forwarded_from: string | null;
  edited_at: number | null; deleted_at: number | null; created_at: number;
}

export interface ConfigPatch {
  domains?: string[] | string;
  adminEmails?: string[] | string;
  schoolName?: string;
  r2PublicBaseUrl?: string;
  mailApiToken?: string;
  mailFrom?: string;
  mailApiBase?: string;
  requireBoundEmail?: boolean | string;
  aiModel?: string;
  aiAllowUserModel?: boolean | string;
}

const THREAD_CACHE_TTL = 60;
const MSG_CACHE_TTL = 60;
const PRESENCE_TTL = 90;

/* ============================== 配置 ============================== */

export function maskToken(token: string): string {
  const s = String(token || "");
  return s ? `${s.slice(0, 3)}••••••••${s.slice(-4)}` : "";
}

export async function loadConfig(env: Env): Promise<AppConfig> {
  const saved = await env.CACHE.get<Record<string, unknown>>("CONFIG:app", "json");
  const s = saved || {};
  const domains = Array.isArray(s.domains) && (s.domains as string[]).length
    ? normalizeDomains(s.domains)
    : normalizeDomains(env.ALLOWED_EMAIL_DOMAINS || "@plkshs.edu.hk");
  const panelToken = typeof s.mailApiToken === "string" ? s.mailApiToken : "";
  const mailApiToken = panelToken || env.RESEND_API_KEY || "";

  return {
    domains,
    adminEmails: (Array.isArray(s.adminEmails) && (s.adminEmails as string[]).length
      ? s.adminEmails as string[]
      : String(env.ADMIN_EMAILS || "").split(","))
      .map(normalizeEmail).filter(Boolean),
    schoolName: String(s.schoolName || env.SCHOOL_NAME || "保良局蕭漢森小學"),
    r2PublicBaseUrl: String(s.r2PublicBaseUrl || env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
    mailApiToken,
    mailFrom: String(s.mailFrom || env.RESEND_FROM || "Schoolink <onboarding@resend.dev>"),
    mailApiBase: String(s.mailApiBase || "https://api.resend.com").replace(/\/+$/, ""),
    mailSource: panelToken ? "panel" : env.RESEND_API_KEY ? "secret" : "none",
    mailConfigured: Boolean(mailApiToken),
    adminPasswordSet: Boolean(env.ADMIN_PASSWORD),
    devOtp: String(env.ALLOW_DEV_OTP || "0") === "1",
    requireBoundEmail: s.requireBoundEmail === true || s.requireBoundEmail === "1"
      || (s.requireBoundEmail === undefined && String(env.REQUIRE_BOUND_EMAIL || "0") === "1"),
    aiModel: normalizeAiModel(s.aiModel || env.AI_MODEL, DEFAULT_AI_MODEL),
    aiAllowUserModel: s.aiAllowUserModel === undefined
      ? !/^(0|false|no|off)$/i.test(String(env.AI_ALLOW_USER_MODEL ?? "1"))
      : (s.aiAllowUserModel === true || s.aiAllowUserModel === "1"),
    updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : null,
  };
}

export async function saveConfig(env: Env, patch: ConfigPatch): Promise<AppConfig> {
  const saved = (await env.CACHE.get<Record<string, unknown>>("CONFIG:app", "json")) || {};
  const cur = await loadConfig(env);
  const next: Record<string, unknown> = {
    domains: patch.domains !== undefined ? normalizeDomains(patch.domains) : cur.domains,
    adminEmails: patch.adminEmails !== undefined
      ? (Array.isArray(patch.adminEmails) ? patch.adminEmails : String(patch.adminEmails).split(","))
          .map(normalizeEmail).filter(Boolean)
      : cur.adminEmails,
    schoolName: patch.schoolName !== undefined
      ? String(patch.schoolName).trim().slice(0, 80) || "保良局蕭漢森小學" : cur.schoolName,
    r2PublicBaseUrl: patch.r2PublicBaseUrl !== undefined
      ? String(patch.r2PublicBaseUrl).trim().replace(/\/+$/, "") : cur.r2PublicBaseUrl,
    // 留空 = 不修改；"CLEAR" = 清除并回退到 Worker Secret
    mailApiToken: patch.mailApiToken === "CLEAR" ? ""
      : patch.mailApiToken ? String(patch.mailApiToken).trim()
      : (typeof saved.mailApiToken === "string" ? saved.mailApiToken : ""),
    mailFrom: patch.mailFrom !== undefined ? String(patch.mailFrom).trim().slice(0, 160)
      : (typeof saved.mailFrom === "string" ? saved.mailFrom : ""),
    mailApiBase: patch.mailApiBase !== undefined
      ? String(patch.mailApiBase).trim().replace(/\/+$/, "")
      : (typeof saved.mailApiBase === "string" ? saved.mailApiBase : ""),
    requireBoundEmail: patch.requireBoundEmail !== undefined
      ? (patch.requireBoundEmail === true || patch.requireBoundEmail === "1" || patch.requireBoundEmail === "on")
      : cur.requireBoundEmail,
    // "CLEAR" 回预设；留空不修改
    aiModel: patch.aiModel && patch.aiModel !== "CLEAR"
      ? normalizeAiModel(patch.aiModel, cur.aiModel)
      : patch.aiModel === "CLEAR" ? DEFAULT_AI_MODEL : cur.aiModel,
    aiAllowUserModel: patch.aiAllowUserModel !== undefined
      ? (patch.aiAllowUserModel === true || patch.aiAllowUserModel === "1" || patch.aiAllowUserModel === "on")
      : cur.aiAllowUserModel,
    updatedAt: Date.now(),
  };
  if (!(next.domains as string[]).length) throw new Error("至少需要保留一个邮箱后缀");
  await kvPut(env.CACHE, "CONFIG:app", JSON.stringify(next));
  return loadConfig(env);
}

export async function sendMail(
  cfg: AppConfig,
  input: { to: string; subject: string; html: string },
): Promise<{ ok: boolean; status: number; detail: string }> {
  if (!cfg.mailApiToken) return { ok: false, status: 0, detail: "Mail API token not configured" };
  const res = await fetch(`${cfg.mailApiBase}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.mailApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: cfg.mailFrom, to: [input.to], subject: input.subject, html: input.html }),
  });
  const detail = (await res.text().catch(() => "")).slice(0, 400);
  return { ok: res.ok, status: res.status, detail };
}

/* ============================== 用户 ============================== */

export const publicUser = (r: UserRow) => ({
  id: r.id,
  // 未绑定邮箱的账号用内部占位地址，不对前端暴露
  email: isPlaceholderEmail(r.email) ? "" : r.email,
  student_id: r.student_id, display_name: r.display_name,
  about: r.about || "", avatar_key: r.avatar_key || null, role: r.role || "user",
  banned: Boolean(r.banned), created_at: r.created_at, last_seen: r.last_seen || 0,
  show_online: r.show_online !== 0, read_receipts: r.read_receipts !== 0,
  class_name: r.class_name || "", student_no: r.student_no || "",
  email_bound: Boolean(r.email_bound) || (!isPlaceholderEmail(r.email) && r.email.includes("@")),
  has_password: Boolean(r.password_hash),
});

export const getUserById = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();

export const getUserByEmail = (env: Env, email: string) =>
  env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(normalizeEmail(email)).first<UserRow>();

export interface NewUserInput {
  email: string;
  student_id?: string;
  display_name?: string;
  class_name?: string;
  student_no?: string;
  password_hash?: string | null;
  email_bound?: number;
  role?: string;
}

/** 统一建号入口：注册 / 管理员新增都走这里，自动加入全校广场 */
export async function createUser(env: Env, input: NewUserInput, cfg: AppConfig): Promise<UserRow> {
  const now = Date.now();
  const email = normalizeEmail(input.email);
  const local = email.split("@")[0];
  const cls = normClass(input.class_name);
  const no = normStudentNo(input.student_no);
  const row: UserRow = {
    id: uid(),
    email,
    student_id: String(input.student_id || "").trim().slice(0, 40)
      || (cls && no ? `${cls} ${no}` : local.toUpperCase()),
    display_name: String(input.display_name || "").trim().slice(0, 40)
      || (cls && no ? `${cls} ${no}` : local),
    about: "", avatar_key: null,
    role: input.role === "admin" || cfg.adminEmails.includes(email) ? "admin" : "user",
    banned: 0, created_at: now, last_seen: now,
    show_online: 1, read_receipts: 1,
    class_name: cls, student_no: no, login_key: loginKeyOf(cls, no),
    password_hash: input.password_hash ?? null,
    email_bound: input.email_bound !== undefined ? input.email_bound
      : (isPlaceholderEmail(email) ? 0 : 1),
  };
  await env.DB.prepare(
    `INSERT INTO users (id,email,student_id,display_name,about,avatar_key,role,banned,created_at,last_seen,
      show_online,read_receipts,class_name,student_no,login_key,password_hash,email_bound)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(row.id, row.email, row.student_id, row.display_name, row.about, null, row.role, 0, now, now,
    1, 1, row.class_name, row.student_no, row.login_key, row.password_hash, row.email_bound).run();
  await ensureDefaultGroup(env, row.id);
  return row;
}

/** 6C + 04 查账号；旧账号没有 login_key 时回退按 student_id 精确匹配 */
export async function findUserByLogin(env: Env, cls: unknown, no: unknown): Promise<UserRow | null> {
  const c = normClass(cls), n = normStudentNo(no);
  if (!c || !n) return null;
  const key = loginKeyOf(c, n);
  const hit = await env.DB.prepare("SELECT * FROM users WHERE login_key=? LIMIT 1")
    .bind(key).first<UserRow>();
  if (hit) return hit;
  return env.DB.prepare("SELECT * FROM users WHERE UPPER(REPLACE(student_id,' ',''))=? LIMIT 1")
    .bind(key).first<UserRow>();
}

export async function setUserPassword(env: Env, userId: string, hash: string): Promise<void> {
  await env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(hash, userId).run();
}

export async function bindUserEmail(env: Env, userId: string, email: string): Promise<UserRow | null> {
  const clean = normalizeEmail(email);
  const taken = await env.DB.prepare("SELECT id FROM users WHERE email=? AND id!=?")
    .bind(clean, userId).first<{ id: string }>();
  if (taken) throw new Error("此校園郵箱已綁定其他帳號 / Email already bound to another account");
  await env.DB.prepare("UPDATE users SET email=?, email_bound=1 WHERE id=?")
    .bind(clean, userId).run();
  return getUserById(env, userId);
}

/** 是否已绑定/验证校园邮箱（旧 OTP 账号自动视为已绑定） */
export const isEmailBound = (r: UserRow): boolean =>
  Boolean(r.email_bound) || !isPlaceholderEmail(r.email);

export const placeholderEmail = (id: string): string => `noemail-${id}@schoolink.invalid`;

export async function listUsers(env: Env, exceptId: string): Promise<UserRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM users WHERE id != ? ORDER BY display_name COLLATE NOCASE LIMIT 300",
  ).bind(exceptId).all<UserRow>();
  return results;
}

export async function updateProfile(
  env: Env, userId: string, patch: {
    display_name?: string; about?: string; avatar_key?: string | null;
    show_online?: boolean; read_receipts?: boolean;
  },
): Promise<UserRow | null> {
  const cur = await getUserById(env, userId);
  if (!cur) return null;
  const name = patch.display_name !== undefined
    ? String(patch.display_name).trim().slice(0, 40) || cur.display_name : cur.display_name;
  const about = patch.about !== undefined ? String(patch.about).trim().slice(0, 140) : cur.about;
  const avatar = patch.avatar_key !== undefined ? patch.avatar_key : cur.avatar_key;
  const showOnline = patch.show_online !== undefined ? (patch.show_online ? 1 : 0) : (cur.show_online ?? 1);
  const readReceipts = patch.read_receipts !== undefined ? (patch.read_receipts ? 1 : 0) : (cur.read_receipts ?? 1);
  await env.DB.prepare(
    "UPDATE users SET display_name=?, about=?, avatar_key=?, show_online=?, read_receipts=? WHERE id=?",
  ).bind(name, about, avatar, showOnline, readReceipts, userId).run();
  return { ...cur, display_name: name, about, avatar_key: avatar,
    show_online: showOnline, read_receipts: readReceipts };
}

export async function setBanned(env: Env, userId: string, banned: boolean): Promise<void> {
  await env.DB.prepare("UPDATE users SET banned=? WHERE id=?").bind(banned ? 1 : 0, userId).run();
  if (banned) {
    // 强制下线：清掉该用户所有会话白名单（KV 无前缀列举，用索引键）
    const idx = await env.CACHE.get<string[]>(`SESSIONIDX:${userId}`, "json");
    if (idx?.length) {
      await Promise.all(idx.map((jti) => env.CACHE.delete(`SESSION:${jti}`)));
      await env.CACHE.delete(`SESSIONIDX:${userId}`);
    }
  }
}

export async function touchPresence(env: Env, userId: string): Promise<void> {
  const now = Date.now();
  await kvPut(env.CACHE, `PRESENCE:${userId}`, String(now), { expirationTtl: PRESENCE_TTL });
  await env.DB.prepare("UPDATE users SET last_seen=? WHERE id=?").bind(now, userId).run();
}

/* ============================== 会话 ============================== */

export async function ensureDefaultGroup(env: Env, userId: string): Promise<string> {
  let group = await env.DB.prepare("SELECT * FROM threads WHERE is_default = 1 LIMIT 1").first<{ id: string }>();
  const now = Date.now();
  if (!group) {
    const id = uid();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO threads (id,type,name,about,avatar_key,direct_key,is_default,created_by,created_at,updated_at,last_message_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(id, "group", "校園廣場 / School Plaza", "全校公告與閒聊", null, null, 1, "system", now, now, now).run();
    group = await env.DB.prepare("SELECT id FROM threads WHERE is_default = 1 LIMIT 1").first<{ id: string }>();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO messages (id,thread_id,sender_id,kind,body,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(`welcome-${id}`, id, "system", "system", "歡迎加入 Schoolink / Welcome to Schoolink", now).run();
  }
  const gid = group!.id;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO thread_members (thread_id,user_id,joined_at,last_read_at) VALUES (?,?,?,0)",
  ).bind(gid, userId, now).run();
  return gid;
}

async function invalidateThreads(env: Env, memberIds: string[]): Promise<void> {
  await Promise.all([...new Set(memberIds)].map((id) => env.CACHE.delete(`CACHE:THREADS:${id}`)));
}

export async function membersOfThread(env: Env, threadId: string): Promise<UserRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT u.* FROM thread_members tm JOIN users u ON u.id=tm.user_id WHERE tm.thread_id=?",
  ).bind(threadId).all<UserRow>();
  return results;
}

export interface ThreadView {
  id: string; type: "direct" | "group"; name: string | null; about: string;
  avatar_key: string | null; is_default: number; created_by: string;
  created_at: number; updated_at: number; last_message_at: number;
  last_body: string | null; last_kind: string | null; last_sender: string | null; last_at: number | null;
  unread: number; pinned: number; muted: number; archived: number; starred: number;
  accent: string | null; announcement_only: number; members_can_invite: number;
  members: ReturnType<typeof publicUser>[];
  online: boolean; last_read_at: number;
}

export async function listThreads(env: Env, userId: string): Promise<ThreadView[]> {
  const key = `CACHE:THREADS:${userId}`;
  const hit = await env.CACHE.get<ThreadView[]>(key, "json");
  let rows: ThreadView[];
  if (hit) {
    rows = hit;
  } else {
    const { results } = await env.DB.prepare(
      `SELECT t.*, tm.last_read_at, tm.pinned, tm.muted, tm.archived, tm.starred,
              (SELECT COUNT(*) FROM messages m WHERE m.thread_id=t.id AND m.created_at > COALESCE(tm.last_read_at,0) AND m.sender_id != ? AND m.deleted_at IS NULL) AS unread,
              (SELECT body FROM messages m WHERE m.thread_id=t.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_body,
              (SELECT kind FROM messages m WHERE m.thread_id=t.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_kind,
              (SELECT sender_id FROM messages m WHERE m.thread_id=t.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_sender,
              (SELECT created_at FROM messages m WHERE m.thread_id=t.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at
         FROM thread_members tm JOIN threads t ON t.id=tm.thread_id
        WHERE tm.user_id=?
        ORDER BY tm.pinned DESC, COALESCE((SELECT MAX(created_at) FROM messages WHERE thread_id=t.id), t.updated_at) DESC LIMIT 200`,
    ).bind(userId, userId).all<ThreadView>();

    const ids = results.map((r) => r.id);
    const memberMap = new Map<string, ReturnType<typeof publicUser>[]>();
    if (ids.length) {
      const q = ids.map(() => "?").join(",");
      const { results: mems } = await env.DB.prepare(
        `SELECT tm.thread_id, u.* FROM thread_members tm JOIN users u ON u.id=tm.user_id WHERE tm.thread_id IN (${q})`,
      ).bind(...ids).all<UserRow & { thread_id: string }>();
      for (const m of mems) {
        if (!memberMap.has(m.thread_id)) memberMap.set(m.thread_id, []);
        memberMap.get(m.thread_id)!.push(publicUser(m));
      }
    }
    rows = results.map((r) => ({ ...r, members: memberMap.get(r.id) || [] }));
    await kvPut(env.CACHE, key, JSON.stringify(rows), { expirationTtl: THREAD_CACHE_TTL });
  }

  const presenceIds = new Set<string>();
  for (const t of rows) for (const m of t.members) presenceIds.add(m.id);
  const online = new Set<string>();
  const now = Date.now();
  await Promise.all([...presenceIds].map(async (id) => {
    const s = await env.CACHE.get(`PRESENCE:${id}`);
    if (s && now - Number(s) < 100_000) online.add(id);
  }));
  return rows.map((t) => ({
    ...t,
    online: t.members.some((m) => m.id !== userId && online.has(m.id)),
  }));
}

export const isMember = async (env: Env, threadId: string, userId: string): Promise<boolean> =>
  Boolean(await env.DB.prepare("SELECT 1 FROM thread_members WHERE thread_id=? AND user_id=?")
    .bind(threadId, userId).first());

export async function setThreadFlags(
  env: Env, userId: string, threadId: string,
  patch: { pinned?: boolean; muted?: boolean; archived?: boolean; starred?: boolean },
): Promise<void> {
  const cols: string[] = [], vals: (number | string)[] = [];
  for (const k of ["pinned", "muted", "archived", "starred"] as const) {
    if (patch[k] !== undefined) { cols.push(`${k}=?`); vals.push(patch[k] ? 1 : 0); }
  }
  if (!cols.length) return;
  vals.push(threadId, userId);
  await env.DB.prepare(`UPDATE thread_members SET ${cols.join(",")} WHERE thread_id=? AND user_id=?`)
    .bind(...vals).run();
  await env.CACHE.delete(`CACHE:THREADS:${userId}`);
}

export async function createThread(
  env: Env, userId: string,
  input: { type?: string; name?: string; memberIds?: string[] },
): Promise<string> {
  const now = Date.now();
  const others = [...new Set((input.memberIds || []).filter((x) => x && x !== userId))];
  if (input.type !== "group") {
    if (others.length !== 1) throw new Error("私聊需要且只需要一位同学");
    const key = [userId, others[0]].sort().join("::");
    const existing = await env.DB.prepare("SELECT id FROM threads WHERE direct_key=?").bind(key).first<{ id: string }>();
    if (existing) return existing.id;
    const id = uid();
    await env.DB.prepare(
      "INSERT INTO threads (id,type,name,about,avatar_key,direct_key,is_default,created_by,created_at,updated_at,last_message_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(id, "direct", null, "", null, key, 0, userId, now, now, now).run();
    for (const m of [userId, others[0]]) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO thread_members (thread_id,user_id,joined_at,last_read_at) VALUES (?,?,?,?)",
      ).bind(id, m, now, m === userId ? now : 0).run();
    }
    await invalidateThreads(env, [userId, others[0]]);
    return id;
  }
  const id = uid();
  await env.DB.prepare(
    "INSERT INTO threads (id,type,name,about,avatar_key,direct_key,is_default,created_by,created_at,updated_at,last_message_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(id, "group", String(input.name || "").trim().slice(0, 60) || "新群組", "", null, null, 0, userId, now, now, now).run();
  const all = [userId, ...others];
  for (const m of all) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO thread_members (thread_id,user_id,joined_at,last_read_at) VALUES (?,?,?,?)",
    ).bind(id, m, now, m === userId ? now : 0).run();
  }
  await invalidateThreads(env, all);
  return id;
}

export async function updateThread(
  env: Env, threadId: string, patch: {
    name?: string; about?: string; avatar_key?: string | null;
    accent?: string | null; announcement_only?: boolean; members_can_invite?: boolean;
  },
): Promise<void> {
  const cur = await env.DB.prepare("SELECT * FROM threads WHERE id=?").bind(threadId)
    .first<{ name: string | null; about: string; avatar_key: string | null;
      accent: string | null; announcement_only: number; members_can_invite: number }>();
  if (!cur) return;
  const accent = patch.accent !== undefined
    ? (["violet", "blue", "teal", "green", "amber", "rose"].includes(String(patch.accent))
      ? String(patch.accent) : null) : (cur.accent ?? null);
  const announcementOnly = patch.announcement_only !== undefined
    ? (patch.announcement_only ? 1 : 0) : (cur.announcement_only ?? 0);
  const membersCanInvite = patch.members_can_invite !== undefined
    ? (patch.members_can_invite ? 1 : 0) : (cur.members_can_invite ?? 1);
  await env.DB.prepare(
    "UPDATE threads SET name=?, about=?, avatar_key=?, accent=?, announcement_only=?, members_can_invite=? WHERE id=?",
  ).bind(
    patch.name !== undefined ? String(patch.name).trim().slice(0, 60) : cur.name,
    patch.about !== undefined ? String(patch.about).trim().slice(0, 300) : cur.about,
    patch.avatar_key !== undefined ? patch.avatar_key : cur.avatar_key,
    accent, announcementOnly, membersCanInvite, threadId,
  ).run();
  const mems = await membersOfThread(env, threadId);
  await invalidateThreads(env, mems.map((m) => m.id));
}

export async function addGroupMembers(env: Env, threadId: string, ids: string[]): Promise<void> {
  const now = Date.now();
  const unique = [...new Set(ids)].slice(0, 100);
  for (const m of unique) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO thread_members (thread_id,user_id,joined_at,last_read_at) VALUES (?,?,?,0)",
    ).bind(threadId, m, now).run();
  }
  const mems = await membersOfThread(env, threadId);
  await invalidateThreads(env, mems.map((m) => m.id));
}

export async function leaveGroup(env: Env, threadId: string, userId: string): Promise<void> {
  const t = await env.DB.prepare("SELECT is_default FROM threads WHERE id=?").bind(threadId)
    .first<{ is_default: number }>();
  if (t?.is_default) throw new Error("不能退出全校广场");
  await env.DB.prepare("DELETE FROM thread_members WHERE thread_id=? AND user_id=?").bind(threadId, userId).run();
  await env.CACHE.delete(`CACHE:THREADS:${userId}`);
}

/* ============================== 消息 ============================== */

export interface MessageView extends MessageRow {
  reactions: { emoji: string; user_id: string; display_name: string }[];
  starred: boolean;
  reply?: { id: string; sender_id: string; body: string; kind: string; display_name: string } | null;
}

async function decorate(env: Env, rows: MessageRow[], userId: string): Promise<MessageView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const q = ids.map(() => "?").join(",");
  const [reactions, stars] = await Promise.all([
    env.DB.prepare(
      `SELECT r.message_id, r.emoji, r.user_id, u.display_name FROM reactions r JOIN users u ON u.id=r.user_id WHERE r.message_id IN (${q})`,
    ).bind(...ids).all<{ message_id: string; emoji: string; user_id: string; display_name: string }>(),
    env.DB.prepare(`SELECT message_id FROM starred WHERE user_id=? AND message_id IN (${q})`)
      .bind(userId, ...ids).all<{ message_id: string }>(),
  ]);
  const rMap = new Map<string, MessageView["reactions"]>();
  for (const r of reactions.results) {
    if (!rMap.has(r.message_id)) rMap.set(r.message_id, []);
    rMap.get(r.message_id)!.push({ emoji: r.emoji, user_id: r.user_id, display_name: r.display_name });
  }
  const starSet = new Set(stars.results.map((s) => s.message_id));

  const replyIds = [...new Set(rows.map((r) => r.reply_to).filter(Boolean) as string[])];
  let replyMap = new Map<string, MessageView["reply"]>();
  if (replyIds.length) {
    const rq = replyIds.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.sender_id, m.body, m.kind, u.display_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id IN (${rq})`,
    ).bind(...replyIds).all<NonNullable<MessageView["reply"]>>();
    replyMap = new Map(results.map((r) => [r.id, r]));
  }
  return rows.map((r) => ({
    ...r,
    reactions: rMap.get(r.id) || [],
    starred: starSet.has(r.id),
    reply: r.reply_to ? replyMap.get(r.reply_to) || null : null,
  }));
}

export async function getMessages(
  env: Env, threadId: string, userId: string, before = 0, limit = 60,
): Promise<MessageView[]> {
  const useCache = !before && limit === 60;
  const key = `CACHE:MSG:${threadId}`;
  if (useCache) {
    const hit = await env.CACHE.get<MessageRow[]>(key, "json");
    if (hit) return decorate(env, hit, userId);
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM messages WHERE thread_id=? AND (? = 0 OR created_at < ?) ORDER BY created_at DESC, id DESC LIMIT ?",
  ).bind(threadId, before, before, Math.min(limit, 100)).all<MessageRow>();
  const rows = results.reverse();
  if (useCache) await kvPut(env.CACHE, key, JSON.stringify(rows), { expirationTtl: MSG_CACHE_TTL });
  return decorate(env, rows, userId);
}

export async function getMessagesAfter(env: Env, threadId: string, after: number, userId: string) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM messages WHERE thread_id=? AND created_at>? ORDER BY created_at ASC, id ASC LIMIT 200",
  ).bind(threadId, Number(after) || 0).all<MessageRow>();
  return decorate(env, results, userId);
}

export async function insertMessage(
  env: Env, userId: string, threadId: string,
  input: Partial<MessageRow>,
): Promise<MessageView> {
  const now = Date.now();
  const kind = (["image", "file", "audio"] as const).includes(input.kind as "image") ? input.kind! : "text";
  if (kind === "text" && !String(input.body || "").trim()) throw new Error("Empty message");
  if (kind !== "text" && !input.body) throw new Error("Empty media");
  const msg: MessageRow = {
    id: uid(), thread_id: threadId, sender_id: userId, kind,
    body: String(input.body || "").slice(0, kind === "text" ? 4000 : 1000),
    media_key: input.media_key || null, media_name: input.media_name || null,
    media_size: input.media_size || null, media_type: input.media_type || null,
    duration: input.duration || null, reply_to: input.reply_to || null,
    forwarded_from: input.forwarded_from || null,
    edited_at: null, deleted_at: null, created_at: now,
  };
  await env.DB.prepare(
    `INSERT INTO messages (id,thread_id,sender_id,kind,body,media_key,media_name,media_size,media_type,duration,reply_to,forwarded_from,edited_at,deleted_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(msg.id, msg.thread_id, msg.sender_id, msg.kind, msg.body, msg.media_key, msg.media_name,
    msg.media_size, msg.media_type, msg.duration, msg.reply_to, msg.forwarded_from, null, null, now).run();
  await env.DB.prepare("UPDATE threads SET updated_at=?, last_message_at=? WHERE id=?")
    .bind(now, now, threadId).run();
  const mems = await membersOfThread(env, threadId);
  await invalidateThreads(env, mems.map((m) => m.id));
  await env.CACHE.delete(`CACHE:MSG:${threadId}`);
  return (await decorate(env, [msg], userId))[0];
}

export async function editMessage(
  env: Env, userId: string, messageId: string, body: string,
): Promise<MessageView | null> {
  const m = await env.DB.prepare("SELECT * FROM messages WHERE id=?").bind(messageId).first<MessageRow>();
  if (!m || m.sender_id !== userId || m.deleted_at || m.kind !== "text") return null;
  if (Date.now() - m.created_at > 15 * 60_000) return null;
  const next = String(body || "").trim().slice(0, 4000);
  if (!next) return null;
  await env.DB.prepare("UPDATE messages SET body=?, edited_at=? WHERE id=?")
    .bind(next, Date.now(), messageId).run();
  await env.CACHE.delete(`CACHE:MSG:${m.thread_id}`);
  const updated = { ...m, body: next, edited_at: Date.now() };
  return (await decorate(env, [updated], userId))[0];
}

export async function deleteMessage(env: Env, userId: string, messageId: string): Promise<MessageView | null> {
  const m = await env.DB.prepare("SELECT * FROM messages WHERE id=?").bind(messageId).first<MessageRow>();
  if (!m || m.sender_id !== userId) return null;
  await env.DB.prepare("UPDATE messages SET deleted_at=?, body='', media_key=NULL WHERE id=?")
    .bind(Date.now(), messageId).run();
  await env.CACHE.delete(`CACHE:MSG:${m.thread_id}`);
  const updated = { ...m, deleted_at: Date.now(), body: "", media_key: null };
  return (await decorate(env, [updated], userId))[0];
}

export async function toggleReaction(
  env: Env, userId: string, messageId: string, emoji: string,
): Promise<MessageView | null> {
  const allowed = ["thumbs", "heart", "laugh", "wow", "cry", "pray", "party", "clover"];
  if (!allowed.includes(emoji)) return null;
  const m = await env.DB.prepare("SELECT * FROM messages WHERE id=?").bind(messageId).first<MessageRow>();
  if (!m) return null;
  const exist = await env.DB.prepare("SELECT 1 FROM reactions WHERE message_id=? AND user_id=? AND emoji=?")
    .bind(messageId, userId, emoji).first();
  if (exist) {
    await env.DB.prepare("DELETE FROM reactions WHERE message_id=? AND user_id=? AND emoji=?")
      .bind(messageId, userId, emoji).run();
  } else {
    await env.DB.prepare("INSERT OR IGNORE INTO reactions (message_id,user_id,emoji,created_at) VALUES (?,?,?,?)")
      .bind(messageId, userId, emoji, Date.now()).run();
  }
  await env.CACHE.delete(`CACHE:MSG:${m.thread_id}`);
  return (await decorate(env, [m], userId))[0];
}

export async function toggleStar(env: Env, userId: string, messageId: string): Promise<boolean> {
  const m = await env.DB.prepare("SELECT thread_id FROM messages WHERE id=?").bind(messageId)
    .first<{ thread_id: string }>();
  if (!m) return false;
  const exist = await env.DB.prepare("SELECT 1 FROM starred WHERE user_id=? AND message_id=?")
    .bind(userId, messageId).first();
  if (exist) {
    await env.DB.prepare("DELETE FROM starred WHERE user_id=? AND message_id=?").bind(userId, messageId).run();
    return false;
  }
  await env.DB.prepare("INSERT OR IGNORE INTO starred (user_id,message_id,thread_id,created_at) VALUES (?,?,?,?)")
    .bind(userId, messageId, m.thread_id, Date.now()).run();
  return true;
}

export async function getStarred(env: Env, userId: string): Promise<MessageView[]> {
  const { results } = await env.DB.prepare(
    `SELECT m.* FROM starred s JOIN messages m ON m.id=s.message_id
      JOIN thread_members tm ON tm.thread_id=m.thread_id AND tm.user_id=s.user_id
      WHERE s.user_id=? ORDER BY m.created_at DESC LIMIT 200`,
  ).bind(userId).all<MessageRow>();
  return decorate(env, results, userId);
}

export async function searchMessages(env: Env, userId: string, query: string, threadId?: string) {
  const like = `%${String(query || "").trim().slice(0, 80)}%`;
  if (!like.replace(/%/g, "")) return [];
  const sql = threadId
    ? `SELECT m.* FROM messages m JOIN thread_members tm ON tm.thread_id=m.thread_id AND tm.user_id=?
        WHERE m.thread_id=? AND m.body LIKE ? AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 100`
    : `SELECT m.* FROM messages m JOIN thread_members tm ON tm.thread_id=m.thread_id AND tm.user_id=?
        WHERE m.body LIKE ? AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 100`;
  const stmt = threadId
    ? env.DB.prepare(sql).bind(userId, threadId, like)
    : env.DB.prepare(sql).bind(userId, like);
  const { results } = await stmt.all<MessageRow>();
  return decorate(env, results, userId);
}

export async function markRead(env: Env, threadId: string, userId: string): Promise<number> {
  const at = Date.now();
  await env.DB.prepare("UPDATE thread_members SET last_read_at=? WHERE thread_id=? AND user_id=?")
    .bind(at, threadId, userId).run();
  await env.CACHE.delete(`CACHE:THREADS:${userId}`);
  return at;
}

/* ============================== 杂项 ============================== */

export function mediaUrl(key: string | null, cfg: AppConfig): string {
  if (!key) return "";
  const base = cfg.r2PublicBaseUrl.replace(/\/+$/, "");
  return base ? `${base}/${key}` : `/api/file/${encodeURIComponent(key)}`;
}

export async function adminStats(env: Env) {
  const [u, t, m] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM threads").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM messages").first<{ n: number }>(),
  ]);
  return { users: u?.n || 0, threads: t?.n || 0, messages: m?.n || 0 };
}
