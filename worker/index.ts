/**
 * Schoolink · Cloudflare Workers (TypeScript)
 *
 *   Next.js 16 静态导出 -> Workers Static Assets（免费、边缘、零冷启动）
 *   本 Worker 只处理 /api/* 与 /admin
 *   D1 = 账号 + 聊天 · KV = 缓存/会话/OTP/热配置 · R2 = 图片语音文件
 *   Durable Objects = 每用户一个实时信箱，WebSocket 即时推送
 */
import {
  normalizeEmail, isEmailAllowed, signSession, verifySession,
  sessionCookie, clearCookie, issueOtp, consumeOtp, timingSafeEqual,
} from "./auth";
import {
  loadConfig, saveConfig, maskToken, sendMail, adminStats,
  publicUser, getUserById, getUserByEmail, createUser, listUsers, updateProfile,
  setBanned, touchPresence, isMember, listThreads, setThreadFlags, createThread,
  updateThread, addGroupMembers, leaveGroup, membersOfThread, getMessages,
  getMessagesAfter, insertMessage, editMessage, deleteMessage, toggleReaction,
  toggleStar, getStarred, searchMessages, markRead, mediaUrl,
  type AppConfig, type ConfigPatch, type UserRow,
} from "./store";
import { kvPut, KV_MIN_TTL } from "./kv";
import { ensureSchema } from "./migrate";
import { json, fail, readJson, escapeHtml, uid, isSecure, sameOrigin } from "./util";

export { RealtimeHub } from "./chat-room";

const MIME_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "image/gif": "gif", "image/avif": "avif", "image/heic": "heic",
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/m4a": "m4a",
  "audio/aac": "m4a", "audio/x-m4a": "m4a", "audio/mpeg": "mp3",
  "audio/ogg": "ogg", "audio/wav": "wav",
  "application/pdf": "pdf", "text/plain": "txt",
  "application/zip": "zip", "application/json": "json",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
const MAX_UPLOAD = 20 * 1024 * 1024;

/** 把事件扇出到若干用户的实时信箱 DO（fire-and-forget，不阻塞响应） */
async function notify(env: Env, userIds: string[], payload: unknown): Promise<void> {
  const body = JSON.stringify(payload);
  await Promise.all([...new Set(userIds)].filter(Boolean).map(async (id) => {
    try {
      const stub = env.REALTIME.get(env.REALTIME.idFromName(`user:${id}`));
      await stub.fetch(new Request("https://hub.internal/broadcast", {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      }));
    } catch (e) {
      console.error("[schoolink] notify failed", id, e);
    }
  }));
}

const memberIds = async (env: Env, threadId: string) =>
  (await membersOfThread(env, threadId)).map((m) => m.id);

/** 对外配置视图：永不回传 Token 明文 / 管理员密码 */
function configView(cfg: AppConfig, env: Env, full = false) {
  const base = {
    domains: cfg.domains,
    r2PublicBaseUrl: cfg.r2PublicBaseUrl,
    schoolName: cfg.schoolName,
    adminEmails: cfg.adminEmails,
    mailFrom: cfg.mailFrom,
    mailApiBase: cfg.mailApiBase,
    mailApiTokenMasked: maskToken(cfg.mailApiToken),
    mailSource: cfg.mailSource,
    mailConfigured: cfg.mailConfigured,
    adminPasswordSet: cfg.adminPasswordSet,
    devOtp: cfg.devOtp,
    r2Enabled: Boolean(env.IMAGES),
  };
  return full ? { ...base, updatedAt: cfg.updatedAt } : base;
}

function otpHtml(code: string, schoolName: string, isTest = false): string {
  const title = isTest ? "郵件設定測試 / Mail config test" : "你的登入驗證碼 / Your login code";
  return `<div style="font-family:system-ui,-apple-system,sans-serif;padding:28px;background:#141416;color:#f2f2f0;border-radius:18px;max-width:440px">
    <div style="font-size:20px;font-weight:700"><svg width="22" height="22" viewBox="0 0 32 32" style="vertical-align:-5px;margin-right:8px"><g fill="#8E8BF7"><circle cx="16" cy="10" r="6"/><circle cx="10" cy="16" r="6"/><circle cx="22" cy="16" r="6"/><circle cx="16" cy="22" r="6"/></g><circle cx="16" cy="16" r="4" fill="#4A63EE"/></svg>Schoolink</div>
    <div style="opacity:.55;font-size:12px;margin-top:4px">${escapeHtml(schoolName)}</div>
    <p style="margin:26px 0 10px;font-size:14px">${title}</p>
    <div style="font-size:38px;letter-spacing:10px;font-weight:750;color:#a999ff;background:#202028;padding:16px;border-radius:12px;text-align:center">${code}</div>
    <p style="opacity:.55;font-size:12px;margin:18px 0 0">${isTest
      ? "這是一封設定測試郵件，收到即代表設定正確。"
      : "10 分鐘內有效 / Valid for 10 minutes. 如果不是你本人操作，請忽略此郵件。"}</p></div>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /admin 直接复用 Next.js 的 index.html（前端按 pathname 渲染后台），
    // 不做任何重定向，避免 Assets 的 trailing-slash 301 循环。
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    try {
      return await route(request, env, url);
    } catch (err) {
      console.error("[schoolink]", err);
      return fail(`伺服器錯誤 / Server error: ${(err as Error)?.message || err}`, 500);
    }
  },
};

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  // v1 线上库自愈：首次请求补齐新列 / 新表 / 旧图片字段，之后零开销
  if (url.pathname !== "/api/health") await ensureSchema(env);
  const p = url.pathname;
  const parts = p.split("/").filter(Boolean);
  const method = request.method.toUpperCase();
  const secure = isSecure(url);

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !sameOrigin(request, url)) {
    return fail("Cross-origin request blocked", 403);
  }
  const cfg = await loadConfig(env);

  /* ---------------------------- 公开 ---------------------------- */

  if (p === "/api/health") return json({ ok: true, app: "schoolink", version: 2, time: Date.now() });

  if (p === "/api/config") {
    return json({ ok: true, config: {
      domains: cfg.domains, r2PublicBaseUrl: cfg.r2PublicBaseUrl, schoolName: cfg.schoolName,
      devOtp: cfg.devOtp, mailConfigured: cfg.mailConfigured, mailSource: cfg.mailSource,
      mailFrom: cfg.mailFrom, adminPasswordSet: cfg.adminPasswordSet, r2Enabled: Boolean(env.IMAGES),
    } });
  }

  if (p === "/api/auth/otp/request" && method === "POST") {
    const body = await readJson<{ email?: string }>(request);
    const email = normalizeEmail(body.email);
    if (!isEmailAllowed(email, cfg.domains)) {
      return fail(`只允許校園郵箱 / Only campus emails allowed: ${cfg.domains.join(", ")}`, 403);
    }
    const rateKey = `RATE:OTP:${email}`;
    if (await env.CACHE.get(rateKey)) return fail("請稍後再試 / Please retry in a minute", 429);
    await kvPut(env.CACHE, rateKey, "1", { expirationTtl: KV_MIN_TTL });

    const code = await issueOtp(env, email);
    if (cfg.mailConfigured) {
      const sent = await sendMail(cfg, {
        to: email, subject: "Schoolink 校園驗證碼 / Your code", html: otpHtml(code, cfg.schoolName),
      });
      if (!sent.ok) {
        await env.CACHE.delete(rateKey);
        return fail(`郵件發送失敗 / Mail error ${sent.status}: ${sent.detail || "check /admin"}`, 502);
      }
      return json({ ok: true, delivery: "email", via: cfg.mailSource });
    }
    if (cfg.devOtp) return json({ ok: true, delivery: "dev", code, hint: "本地開發模式" });
    return fail("尚未設定郵件服務，管理員請到 /admin 填入郵件 API Token 與發件郵箱 / Mail not configured — open /admin", 503);
  }

  if (p === "/api/auth/otp/verify" && method === "POST") {
    const body = await readJson<{ email?: string; code?: string; student_id?: string; display_name?: string }>(request);
    const email = normalizeEmail(body.email);
    if (!isEmailAllowed(email, cfg.domains)) return fail("郵箱後綴不被允許 / Domain not allowed", 403);
    if (!(await consumeOtp(env, email, body.code))) return fail("驗證碼錯誤或已過期 / Invalid or expired code", 400);
    let user = await getUserByEmail(env, email);
    if (!user) {
      user = await createUser(env, { email, student_id: body.student_id, display_name: body.display_name }, cfg);
    } else if (user.banned) {
      return fail("此帳號已被停用 / Account disabled", 403);
    } else if (cfg.adminEmails.includes(email) && user.role !== "admin") {
      await env.DB.prepare("UPDATE users SET role='admin' WHERE id=?").bind(user.id).run();
      user = { ...user, role: "admin" };
    }
    const { token, jti } = await signSession(env, user.id);
    const idx = await env.CACHE.get<string[]>(`SESSIONIDX:${user.id}`, "json") || [];
    await kvPut(env.CACHE, `SESSIONIDX:${user.id}`, JSON.stringify([...idx, jti].slice(-40)), {
      expirationTtl: 30 * 86_400,
    });
    return json({ ok: true, user: publicUser(user) }, 200, {
      "Set-Cookie": sessionCookie(token, "user", secure),
    });
  }

  /* -------------------------- /admin 后台 -------------------------- */

  if (p === "/api/admin/panel/login" && method === "POST") {
    if (!env.ADMIN_PASSWORD) {
      return fail("尚未設定 ADMIN_PASSWORD：請在 GitHub Secrets 新增後重跑 Action / ADMIN_PASSWORD secret is missing", 503);
    }
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    const rateKey = `RATE:ADMINLOGIN:${ip}`;
    const attempts = Number((await env.CACHE.get(rateKey)) || 0);
    if (attempts >= 5) return fail("嘗試太多次，請 10 分鐘後再試 / Too many attempts", 429);
    const body = await readJson<{ password?: string }>(request);
    if (!timingSafeEqual(body.password, env.ADMIN_PASSWORD)) {
      await kvPut(env.CACHE, rateKey, String(attempts + 1), { expirationTtl: 600 });
      return fail("管理員密碼錯誤 / Wrong admin password", 401);
    }
    await env.CACHE.delete(rateKey);
    const { token } = await signSession(env, "admin-panel", "admin");
    // 登录响应直接带 state，避免 KV 最终一致导致「刚登录就显示未登入」
    return json({ ok: true, config: configView(cfg, env, true), stats: await adminStats(env) }, 200, {
      "Set-Cookie": sessionCookie(token, "admin", secure),
    });
  }

  if (p.startsWith("/api/admin/panel/")) {
    const adminSession = await verifySession(request, env, "admin");
    if (p === "/api/admin/panel/logout" && method === "POST") {
      if (adminSession) await env.CACHE.delete(`ADMINSESSION:${adminSession.jti}`);
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie("admin", secure) });
    }
    if (!adminSession && !(await hasPanelAccess(request, env, cfg))) {
      return fail("需要管理員權限 / Admin only", 401);
    }
    if (p === "/api/admin/panel/state") {
      return json({ ok: true, config: configView(cfg, env, true), stats: await adminStats(env) });
    }
    if (p === "/api/admin/panel/config" && method === "POST") {
      const next = await saveConfig(env, await readJson<ConfigPatch>(request));
      return json({ ok: true, config: configView(next, env, true) });
    }
    if (p === "/api/admin/panel/test-mail" && method === "POST") {
      const body = await readJson<{ to?: string }>(request);
      const to = normalizeEmail(body.to);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail("請輸入有效郵箱 / Invalid email", 400);
      const sent = await sendMail(cfg, {
        to, subject: "Schoolink · 郵件設定測試 / Mail config test", html: otpHtml("123456", cfg.schoolName, true),
      });
      return sent.ok ? json({ ok: true, status: sent.status, detail: "測試郵件已寄出 / Test mail sent" })
        : fail(`寄送失敗 ${sent.status}: ${sent.detail || "check token & from"}`, 502);
    }
    if (p === "/api/admin/panel/users") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM users ORDER BY created_at DESC LIMIT 300",
      ).all<UserRow>();
      return json({ ok: true, users: results.map(publicUser) });
    }
    if (p === "/api/admin/panel/users/ban" && method === "POST") {
      const body = await readJson<{ userId?: string; banned?: boolean }>(request);
      if (!body.userId) return fail("Missing userId", 400);
      await setBanned(env, body.userId, Boolean(body.banned));
      return json({ ok: true });
    }
  }

  /* --------------------- R2 文件回源（需登录） --------------------- */

  if (p.startsWith("/api/file/") && ["GET", "HEAD"].includes(method)) {
    const session = await verifySession(request, env);
    if (!session) return fail("未登入 / Not signed in", 401);
    if (!env.IMAGES) return fail("R2 未啟用 / R2 disabled", 503);
    const key = decodeURIComponent(p.slice("/api/file/".length));
    if (!/^(images|audio|files)\//.test(key) || key.includes("..")) return fail("Forbidden", 403);
    const obj = await env.IMAGES.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    const headers: Record<string, string> = {
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
    };
    if (obj.httpEtag) headers.ETag = obj.httpEtag;
    return new Response(method === "HEAD" ? null : obj.body, { status: 200, headers });
  }

  /* --------------------- WebSocket 实时信箱 --------------------- */

  if (p === "/api/ws") {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }
    const session = await verifySession(request, env);
    if (!session) return new Response("Unauthorized", { status: 401 });
    const user = await getUserById(env, session.uid);
    if (!user || user.banned) return new Response("Forbidden", { status: 403 });
    const target = new URL(request.url);
    target.pathname = "/ws";
    target.searchParams.set("uid", user.id);
    const stub = env.REALTIME.get(env.REALTIME.idFromName(`user:${user.id}`));
    return stub.fetch(new Request(target.toString(), request));
  }

  /* ------------------------- 以下需要登录 ------------------------- */

  const session = await verifySession(request, env);
  if (!session) return fail("未登入 / Not signed in", 401);
  const user = await getUserById(env, session.uid);
  if (!user) return fail("帳號不存在 / Account missing", 401);
  if (user.banned) return fail("此帳號已被停用 / Account disabled", 403);
  const me = publicUser(user);
  const isAdmin = me.role === "admin" || cfg.adminEmails.includes(me.email);

  if (p === "/api/me") {
    return json({ ok: true, user: me, isAdmin, r2Enabled: Boolean(env.IMAGES),
      config: { domains: cfg.domains, r2PublicBaseUrl: cfg.r2PublicBaseUrl, schoolName: cfg.schoolName },
      serverTime: Date.now() });
  }
  if (p === "/api/logout" && method === "POST") {
    await env.CACHE.delete(`SESSION:${session.jti}`);
    await env.CACHE.delete(`PRESENCE:${me.id}`);
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie("user", secure) });
  }
  if (p === "/api/users") {
    return json({ ok: true, users: (await listUsers(env, me.id)).map(publicUser) });
  }
  if (p === "/api/presence" && method === "POST") {
    await touchPresence(env, me.id);
    return json({ ok: true, at: Date.now() });
  }
  if (p === "/api/profile" && method === "PATCH") {
    const next = await updateProfile(env, me.id, await readJson(request));
    if (!next) return fail("Not found", 404);
    return json({ ok: true, user: publicUser(next) });
  }

  /* ------------------------------ 会话 ------------------------------ */

  if (p === "/api/threads" && method === "GET") {
    return json({ ok: true, threads: await listThreads(env, me.id) });
  }
  if (p === "/api/threads" && method === "POST") {
    const body = await readJson<{ type?: string; name?: string; memberIds?: string[] }>(request);
    try {
      const id = await createThread(env, me.id, body);
      const ids = await memberIds(env, id);
      await notify(env, ids, { type: "thread-new", threadId: id });
      return json({ ok: true, id });
    } catch (e) { return fail((e as Error).message, 400); }
  }

  if (parts[1] === "threads" && parts.length >= 3) {
    const threadId = parts[2];
    if (!(await isMember(env, threadId, me.id))) return fail("Not a member", 403);
    const ids = await memberIds(env, threadId);

    if (parts.length === 3 && method === "PATCH") {
      const body = await readJson<Record<string, unknown>>(request);
      const flags = { pinned: body.pinned as boolean | undefined, muted: body.muted as boolean | undefined,
        archived: body.archived as boolean | undefined, starred: body.starred as boolean | undefined };
      if (Object.values(flags).some((v) => v !== undefined)) await setThreadFlags(env, me.id, threadId, flags);
      if (["name", "about", "avatar_key"].some((k) => body[k] !== undefined)) {
        const t = await env.DB.prepare("SELECT created_by, is_default FROM threads WHERE id=?")
          .bind(threadId).first<{ created_by: string; is_default: number }>();
        if (t?.created_by !== me.id && !isAdmin && !t?.is_default) return fail("Only group owner can edit", 403);
        await updateThread(env, threadId, body as never);
        await notify(env, ids, { type: "thread-updated", threadId });
      }
      return json({ ok: true });
    }

    if (parts[3] === "members" && method === "POST") {
      const body = await readJson<{ memberIds?: string[] }>(request);
      await addGroupMembers(env, threadId, body.memberIds || []);
      const all = await memberIds(env, threadId);
      await notify(env, all, { type: "thread-updated", threadId });
      return json({ ok: true });
    }
    if (parts[3] === "leave" && method === "POST") {
      try { await leaveGroup(env, threadId, me.id); } catch (e) { return fail((e as Error).message, 400); }
      return json({ ok: true });
    }
    if (parts[3] === "read" && method === "POST") {
      const at = await markRead(env, threadId, me.id);
      await notify(env, ids, { type: "read", threadId, userId: me.id, at });
      return json({ ok: true, at });
    }
    if (parts[3] === "typing" && method === "POST") {
      const body = await readJson<{ on?: boolean }>(request);
      await notify(env, ids.filter((id) => id !== me.id), {
        type: "typing", threadId, userId: me.id, displayName: me.display_name, on: Boolean(body.on),
      });
      return json({ ok: true });
    }

    if (parts[3] === "messages") {
      if (method === "GET") {
        const after = Number(url.searchParams.get("after") || 0);
        const before = Number(url.searchParams.get("before") || 0);
        const limit = Number(url.searchParams.get("limit") || 60);
        const messages = after
          ? await getMessagesAfter(env, threadId, after, me.id)
          : await getMessages(env, threadId, me.id, before, limit);
        const reads = await env.DB.prepare("SELECT user_id, last_read_at FROM thread_members WHERE thread_id=?")
          .bind(threadId).all<{ user_id: string; last_read_at: number }>();
        return json({ ok: true, messages, reads: reads.results });
      }
      if (method === "POST") {
        const body = await readJson<Record<string, unknown>>(request);
        let msg;
        try {
          msg = await insertMessage(env, me.id, threadId, body as never);
        } catch (e) { return fail((e as Error).message, 400); }
        await notify(env, ids, { type: "message", threadId, message: msg });
        return json({ ok: true, message: msg });
      }
    }
  }

  /* ------------------------------ 消息 ------------------------------ */

  if (parts[1] === "messages" && parts.length === 3) {
    const messageId = parts[2];
    const row = await env.DB.prepare("SELECT thread_id FROM messages WHERE id=?")
      .bind(messageId).first<{ thread_id: string }>();
    if (!row) return fail("Not found", 404);
    if (!(await isMember(env, row.thread_id, me.id))) return fail("Not a member", 403);
    const ids = await memberIds(env, row.thread_id);

    if (method === "PATCH") {
      const body = await readJson<{ body?: string }>(request);
      const msg = await editMessage(env, me.id, messageId, body.body || "");
      if (!msg) return fail("無法編輯（非本人、超過 15 分鐘或不是文字訊息）/ Cannot edit", 400);
      await notify(env, ids, { type: "message-updated", threadId: row.thread_id, message: msg });
      return json({ ok: true, message: msg });
    }
    if (method === "DELETE") {
      const msg = await deleteMessage(env, me.id, messageId);
      if (!msg) return fail("無法刪除 / Cannot delete", 400);
      await notify(env, ids, { type: "message-updated", threadId: row.thread_id, message: msg });
      return json({ ok: true, message: msg });
    }
  }
  if (parts[1] === "messages" && parts.length === 4 && parts[3] === "reaction" && method === "POST") {
    const messageId = parts[2];
    const body = await readJson<{ emoji?: string }>(request);
    const row = await env.DB.prepare("SELECT thread_id FROM messages WHERE id=?")
      .bind(messageId).first<{ thread_id: string }>();
    if (!row) return fail("Not found", 404);
    if (!(await isMember(env, row.thread_id, me.id))) return fail("Not a member", 403);
    const msg = await toggleReaction(env, me.id, messageId, body.emoji || "");
    if (!msg) return fail("Invalid emoji", 400);
    await notify(env, await memberIds(env, row.thread_id),
      { type: "message-updated", threadId: row.thread_id, message: msg });
    return json({ ok: true, message: msg });
  }
  if (parts[1] === "messages" && parts.length === 4 && parts[3] === "star" && method === "POST") {
    const starred = await toggleStar(env, me.id, parts[2]);
    return json({ ok: true, starred });
  }

  if (p === "/api/search") {
    const q = url.searchParams.get("q") || "";
    const thread = url.searchParams.get("thread") || undefined;
    if (thread && !(await isMember(env, thread, me.id))) return fail("Not a member", 403);
    return json({ ok: true, messages: await searchMessages(env, me.id, q, thread) });
  }
  if (p === "/api/starred") {
    return json({ ok: true, messages: await getStarred(env, me.id) });
  }

  /* ------------------------------ 上传 ------------------------------ */

  if (p === "/api/upload" && method === "POST") {
    if (!env.IMAGES) return fail("管理員未啟用 R2，附件功能已關閉 / R2 disabled", 503);
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return fail("Missing file", 400);
    // 浏览器可能给 audio/mp4;codecs=mp4a.40.2，去掉参数再查白名单；
    // 但 R2 响应头保留完整 codecs，播放器才不会把 Opus-in-MP4 当成 AAC
    const rawType = (file.type || "application/octet-stream").trim();
    const mime = rawType.split(";")[0].trim().toLowerCase();
    const ext = MIME_EXT[mime];
    if (!ext) return fail("不支援的檔案類型 / Unsupported file type", 415);
    if (file.size > MAX_UPLOAD) return fail("檔案超過 20MB / File too large", 413);
    const category = mime.startsWith("image/") ? "images" : mime.startsWith("audio/") ? "audio" : "files";
    const stamp = new Date().toISOString().slice(0, 7).replace("-", "/");
    const key = `${category}/${stamp}/${uid()}.${ext}`;
    await env.IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: rawType, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { uploader: me.id, name: String(file.name || "file").slice(0, 120) },
    });
    return json({ ok: true, key, url: mediaUrl(key, cfg), name: file.name, size: file.size, mime });
  }

  /* ---------------------------- 管理员兼容 ---------------------------- */

  if (p.startsWith("/api/admin/")) {
    if (!isAdmin && !(await hasPanelAccess(request, env, cfg))) return fail("需要管理員權限 / Admin only", 403);
    if (p === "/api/admin/config" && method === "GET") {
      return json({ ok: true, config: configView(cfg, env, true), stats: await adminStats(env) });
    }
    if (p === "/api/admin/config" && method === "POST") {
      const next = await saveConfig(env, await readJson<ConfigPatch>(request));
      return json({ ok: true, config: configView(next, env, true) });
    }
  }

  return fail("Not found", 404);
}

async function hasPanelAccess(request: Request, env: Env, cfg: AppConfig): Promise<boolean> {
  if (await verifySession(request, env, "admin")) return true;
  const s = await verifySession(request, env, "user");
  if (!s) return false;
  const u = await getUserById(env, s.uid);
  return Boolean(u && (u.role === "admin" || cfg.adminEmails.includes(u.email)));
}
