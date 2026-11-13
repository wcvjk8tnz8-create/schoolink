// 数据分工：
//   D1  = 账号数据(users) + 聊天数据(threads / thread_members / messages)，持久化
//   KV  = 会话、OTP、热配置、最近消息缓存、在线状态（缓存层）
//   R2  = 图片对象（由 index.js 处理）
import { normalizeDomains, normalizeEmail } from "./auth.js";

const THREAD_CACHE_TTL = 5;
const MSG_CACHE_TTL = 15;

/* ------------------------------ 配置 ------------------------------ */

export async function loadConfig(env) {
  const saved = await env.CACHE.get("CONFIG:app", "json");
  const domains = saved?.domains?.length
    ? normalizeDomains(saved.domains)
    : normalizeDomains(env.ALLOWED_EMAIL_DOMAINS || "@plkshs.edu.hk");
  return {
    domains,
    r2PublicBaseUrl: saved?.r2PublicBaseUrl || env.R2_PUBLIC_BASE_URL || "",
    schoolName: saved?.schoolName || env.SCHOOL_NAME || "Schoolink",
    adminEmails: String(env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => normalizeEmail(e))
      .filter(Boolean),
    devOtp: String(env.ALLOW_DEV_OTP || "0") === "1",
    mailConfigured: Boolean(env.RESEND_API_KEY),
    updatedAt: saved?.updatedAt || null,
  };
}

export async function saveConfig(env, patch) {
  const current = await loadConfig(env);
  const next = {
    domains: patch.domains !== undefined ? normalizeDomains(patch.domains) : current.domains,
    r2PublicBaseUrl: patch.r2PublicBaseUrl !== undefined
      ? String(patch.r2PublicBaseUrl).trim().replace(/\/+$/, "")
      : current.r2PublicBaseUrl,
    schoolName: patch.schoolName !== undefined
      ? String(patch.schoolName).trim().slice(0, 80) || "Schoolink"
      : current.schoolName,
    updatedAt: Date.now(),
  };
  if (!next.domains.length) throw new Error("至少需要保留一个邮箱后缀");
  await env.CACHE.put("CONFIG:app", JSON.stringify(next));
  return loadConfig(env);
}

/* ------------------------------ 用户 ------------------------------ */

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    student_id: row.student_id,
    display_name: row.display_name,
    avatar_key: row.avatar_key || null,
    role: row.role || "user",
    created_at: row.created_at,
  };
}

export async function getUserById(env, id) {
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

export async function getUserByEmail(env, email) {
  return env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(normalizeEmail(email)).first();
}

export async function createUser(env, { email, student_id, display_name }, cfg) {
  const now = Date.now();
  const user = {
    id: crypto.randomUUID(),
    email: normalizeEmail(email),
    student_id: String(student_id || "").trim().slice(0, 40) || email.split("@")[0].toUpperCase(),
    display_name: String(display_name || "").trim().slice(0, 40) || email.split("@")[0],
    avatar_key: null,
    role: cfg.adminEmails.includes(normalizeEmail(email)) ? "admin" : "user",
    created_at: now,
  };
  await env.DB.prepare(
    "INSERT INTO users (id,email,student_id,display_name,avatar_key,role,created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(user.id, user.email, user.student_id, user.display_name, null, user.role, now).run();
  await ensureDefaultGroup(env, user);
  return user;
}

export async function listUsers(env, exceptId) {
  const { results } = await env.DB.prepare(
    "SELECT id,email,student_id,display_name,avatar_key FROM users WHERE id != ? ORDER BY display_name COLLATE NOCASE LIMIT 300"
  ).bind(exceptId).all();
  return results;
}

/* ------------------------------ 会话 ------------------------------ */

export async function ensureDefaultGroup(env, user) {
  let group = await env.DB.prepare("SELECT * FROM threads WHERE is_default = 1 LIMIT 1").first();
  const now = Date.now();
  if (!group) {
    // OR IGNORE + 重新查询：并发注册时也只会有一个全校广场
    await env.DB.prepare(
      "INSERT OR IGNORE INTO threads (id,type,name,avatar_key,direct_key,is_default,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
    ).bind(crypto.randomUUID(), "group", "校園廣場 / School Plaza", null, null, 1, "system", now, now).run();
    group = await env.DB.prepare("SELECT * FROM threads WHERE is_default = 1 LIMIT 1").first();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO messages (id,thread_id,sender_id,kind,body,image_key,created_at) VALUES (?,?,?,?,?,?,?)"
    ).bind(`welcome-${group.id}`, group.id, "system", "system",
      "歡迎加入 Schoolink 👋  /  Welcome to Schoolink 👋", null, now).run();
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO thread_members (thread_id,user_id,joined_at,last_read_at) VALUES (?,?,?,?)"
  ).bind(group.id, user.id, now, 0).run();
  return group.id;
}

async function invalidateThreadCaches(env, threadId, memberIds = []) {
  await env.CACHE.delete(`CACHE:MSG:${threadId}`);
  await Promise.all(
    [...new Set(memberIds)].map((uid) => env.CACHE.delete(`CACHE:THREADS:${uid}`))
  );
}

async function membersOfMyThreads(env, uid) {
  const { results } = await env.DB.prepare(
    `SELECT tm.thread_id, u.id, u.display_name, u.student_id, u.avatar_key, u.email
       FROM thread_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.thread_id IN (SELECT thread_id FROM thread_members WHERE user_id = ?)`
  ).bind(uid).all();
  const map = new Map();
  for (const m of results) {
    if (!map.has(m.thread_id)) map.set(m.thread_id, []);
    map.get(m.thread_id).push({
      id: m.id, display_name: m.display_name, student_id: m.student_id,
      avatar_key: m.avatar_key, email: m.email,
    });
  }
  return map;
}

export async function listThreads(env, uid) {
  const cacheKey = `CACHE:THREADS:${uid}`;
  const hit = await env.CACHE.get(cacheKey, "json");
  let rows;
  if (hit) {
    rows = hit;
  } else {
    const { results } = await env.DB.prepare(
      `SELECT t.*, tm.last_read_at,
              (SELECT COUNT(*) FROM messages m
                WHERE m.thread_id = t.id AND m.created_at > COALESCE(tm.last_read_at, 0)) AS unread,
              (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_body,
              (SELECT kind FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_kind,
              (SELECT sender_id FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_sender,
              (SELECT created_at FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at
         FROM thread_members tm JOIN threads t ON t.id = tm.thread_id
        WHERE tm.user_id = ?
        ORDER BY COALESCE(last_at, t.updated_at) DESC LIMIT 100`
    ).bind(uid).all();
    rows = results;
    await env.CACHE.put(cacheKey, JSON.stringify(rows), { expirationTtl: THREAD_CACHE_TTL });
  }

  const memberMap = await membersOfMyThreads(env, uid);
  const presenceIds = new Set();
  for (const t of rows) for (const m of memberMap.get(t.id) || []) presenceIds.add(m.id);
  const online = new Set();
  await Promise.all([...presenceIds].map(async (id) => {
    if (await env.CACHE.get(`PRESENCE:${id}`)) online.add(id);
  }));

  return rows.map((t) => {
    const members = memberMap.get(t.id) || [];
    return { ...t, members, online: members.some((m) => m.id !== uid && online.has(m.id)) };
  });
}

export async function isMember(env, threadId, uid) {
  return Boolean(await env.DB.prepare(
    "SELECT 1 FROM thread_members WHERE thread_id = ? AND user_id = ?"
  ).bind(threadId, uid).first());
}

export async function createThread(env, uid, { type, name, memberIds }) {
  const now = Date.now();
  const others = [...new Set((memberIds || []).filter((x) => x && x !== uid))];
  if (type === "direct") {
    if (others.length !== 1) throw new Error("私聊需要且只需要一位同学");
    const key = [uid, others[0]].sort().join("::");
    const existing = await env.DB.prepare("SELECT id FROM threads WHERE direct_key = ?").bind(key).first();
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO threads (id,type,name,avatar_key,direct_key,is_default,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
    ).bind(id, "direct", null, null, key, 0, uid, now, now).run();
    for (const m of [uid, others[0]]) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO thread_members (thread_id,user_id,joined_at,last_read_at) VALUES (?,?,?,?)"
      ).bind(id, m, now, m === uid ? now : 0).run();
    }
    await invalidateThreadCaches(env, id, [uid, others[0]]);
    return id;
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO threads (id,type,name,avatar_key,direct_key,is_default,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(id, "group", String(name || "").trim().slice(0, 60) || "新群組", null, null, 0, uid, now, now).run();
  const all = [uid, ...others];
  for (const m of all) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO thread_members (thread_id,user_id,joined_at,last_read_at) VALUES (?,?,?,?)"
    ).bind(id, m, now, m === uid ? now : 0).run();
  }
  await invalidateThreadCaches(env, id, all);
  return id;
}

/* ------------------------------ 消息 ------------------------------ */

export async function getRecentMessages(env, threadId) {
  const key = `CACHE:MSG:${threadId}`;
  const hit = await env.CACHE.get(key, "json");
  if (hit) return hit;
  const { results } = await env.DB.prepare(
    "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT 80"
  ).bind(threadId).all();
  const rows = results.reverse();
  await env.CACHE.put(key, JSON.stringify(rows), { expirationTtl: MSG_CACHE_TTL });
  return rows;
}

export async function getMessagesAfter(env, threadId, after) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM messages WHERE thread_id = ? AND created_at > ? ORDER BY created_at ASC, id ASC LIMIT 200"
  ).bind(threadId, Number(after) || 0).all();
  return results;
}

export async function insertMessage(env, uid, threadId, { kind, body, image_key }) {
  const now = Date.now();
  const msg = {
    id: crypto.randomUUID(), thread_id: threadId, sender_id: uid,
    kind: kind === "image" ? "image" : "text",
    body: String(body || "").slice(0, kind === "image" ? 1000 : 4000),
    image_key: image_key || null, created_at: now,
  };
  await env.DB.prepare(
    "INSERT INTO messages (id,thread_id,sender_id,kind,body,image_key,created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(msg.id, msg.thread_id, msg.sender_id, msg.kind, msg.body, msg.image_key, msg.created_at).run();
  await env.DB.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").bind(now, threadId).run();
  const { results } = await env.DB.prepare(
    "SELECT user_id FROM thread_members WHERE thread_id = ?"
  ).bind(threadId).all();
  await invalidateThreadCaches(env, threadId, results.map((r) => r.user_id));
  return msg;
}

export async function markRead(env, threadId, uid) {
  await env.DB.prepare(
    "UPDATE thread_members SET last_read_at = ? WHERE thread_id = ? AND user_id = ?"
  ).bind(Date.now(), threadId, uid).run();
  await env.CACHE.delete(`CACHE:THREADS:${uid}`);
}

/* ------------------------------ 杂项 ------------------------------ */

export async function setPresence(env, uid) {
  await env.CACHE.put(`PRESENCE:${uid}`, "1", { expirationTtl: 90 });
}

export async function adminStats(env) {
  const [u, t, m] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM threads").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM messages").first(),
  ]);
  return { users: u?.n || 0, threads: t?.n || 0, messages: m?.n || 0 };
}
