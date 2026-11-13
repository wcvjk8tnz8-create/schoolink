// Schoolink · Cloudflare Workers
// Workers + Static Assets (前端) / D1 (账号+聊天) / KV (缓存+会话) / R2 (图片)
import {
  normalizeEmail, isEmailAllowed, signSession, verifySession,
  sessionCookie, clearCookie, issueOtp, consumeOtp, timingSafeEqual,
} from "./auth.js";
import {
  loadConfig, saveConfig, maskToken, sendMail, publicUser, getUserById,
  getUserByEmail, createUser, listUsers, isMember, listThreads, createThread,
  getRecentMessages, getMessagesAfter, insertMessage, markRead, setPresence, adminStats,
} from "./store.js";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
const fail = (error, status = 400) => json({ ok: false, error }, status);

const MIME_EXT = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "image/gif": "gif", "image/avif": "avif", "image/heic": "heic",
};
const MAX_IMAGE = 10 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // /admin 是独立后台页（不依赖校园邮箱登录），由 Worker 重写到静态 admin.html
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      const target = new URL("/admin.html", url);
      return env.ASSETS.fetch(new Request(target, request));
    }
    if (!url.pathname.startsWith("/api")) {
      // 静态资源 / SPA fallback 交还 Assets binding
      return env.ASSETS.fetch(request);
    }
    try {
      return await route(request, env, url);
    } catch (err) {
      console.error("[schoolink]", err);
      return fail(`伺服器錯誤 / Server error: ${err?.message || err}`, 500);
    }
  },
};

async function route(request, env, url) {
  const { pathname } = url;
  const parts = pathname.split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  // 轻量 CSRF 防护：写请求必须同源
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const origin = request.headers.get("Origin");
    if (origin) {
      try {
        if (new URL(origin).host !== url.host) return fail("Cross-origin request blocked", 403);
      } catch {
        return fail("Invalid Origin", 403);
      }
    }
  }

  const cfg = await loadConfig(env);

  /* ---------- 公开接口 ---------- */

  if (pathname === "/api/health" && method === "GET") {
    return json({ ok: true, app: "schoolink", time: Date.now() });
  }

  if (pathname === "/api/config" && method === "GET") {
    return json({
      ok: true,
      config: {
        domains: cfg.domains,
        r2PublicBaseUrl: cfg.r2PublicBaseUrl,
        schoolName: cfg.schoolName,
        devOtp: cfg.devOtp,
        mailConfigured: cfg.mailConfigured,
        mailSource: cfg.mailSource,
        mailFrom: cfg.mailFrom,
        adminPasswordSet: cfg.adminPasswordSet,
        r2Enabled: Boolean(env.IMAGES),
      },
    });
  }

  if (pathname === "/api/auth/otp/request" && method === "POST") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (!isEmailAllowed(email, cfg.domains)) {
      return fail(`只允許校園郵箱 / Only campus emails allowed: ${cfg.domains.join(", ")}`, 403);
    }
    const rateKey = `RATE:OTP:${email}`;
    if (await env.CACHE.get(rateKey)) return fail("請稍後再試 / Please retry in a minute", 429);
    await env.CACHE.put(rateKey, "1", { expirationTtl: 55 });

    const code = await issueOtp(env, email);
    if (cfg.mailConfigured) {
      const sent = await sendMail(env, cfg, {
        to: email,
        subject: "Schoolink 校園驗證碼 / Your code",
        html: otpHtml(code, cfg.schoolName),
      });
      if (!sent.ok) {
        await env.CACHE.delete(rateKey);
        return fail(`郵件發送失敗 / Mail error ${sent.status}: ${sent.detail || "check /admin mail settings"}`, 502);
      }
      return json({ ok: true, delivery: "email", via: cfg.mailSource });
    }
    if (cfg.devOtp) return json({ ok: true, delivery: "dev", code, hint: "本地開發模式：驗證碼已自動填入" });
    return fail(
      "尚未設定郵件服務，管理員請到 /admin 填入郵件 API Token 與發件郵箱 / " +
      "Mail not configured — admin: open /admin and set the mail API token",
      503
    );
  }

  if (pathname === "/api/auth/otp/verify" && method === "POST") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (!isEmailAllowed(email, cfg.domains)) return fail("郵箱後綴不被允許 / Domain not allowed", 403);
    if (!(await consumeOtp(env, email, body.code))) return fail("驗證碼錯誤或已過期 / Invalid or expired code", 400);

    let user = await getUserByEmail(env, email);
    if (!user) {
      user = await createUser(env, {
        email, student_id: body.student_id, display_name: body.display_name,
      }, cfg);
    } else if (cfg.adminEmails.includes(email) && user.role !== "admin") {
      await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.id).run();
      user.role = "admin";
    }
    const { token } = await signSession(env, user.id);
    return json({ ok: true, user: publicUser(user) }, 200, { "Set-Cookie": sessionCookie(token) });
  }

  // 未配置 R2 自定义域时的同源图片回源（配了自定义域则浏览器直连 CDN）
  if (pathname.startsWith("/api/file/") && ["GET", "HEAD"].includes(method)) {
    if (!env.IMAGES) return fail("R2 未啟用，圖片功能已關閉 / R2 disabled on this deployment", 503);
    const key = decodeURIComponent(pathname.slice("/api/file/".length));
    if (!key.startsWith("images/") || key.includes("..")) return fail("Forbidden", 403);
    const obj = await env.IMAGES.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    const headers = {
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    if (obj.httpEtag) headers.ETag = obj.httpEtag;
    return new Response(method === "HEAD" ? null : obj.body, { status: 200, headers });
  }

  /* ---------- /admin 后台：独立于校园邮箱登录 ---------- */
  // 用 GitHub Secret ADMIN_PASSWORD 进入；邮件服务没配好时也能进来配置，不会形成死锁。

  if (pathname === "/api/admin/panel/login" && method === "POST") {
    if (!env.ADMIN_PASSWORD) {
      return fail(
        "尚未設定 ADMIN_PASSWORD：請在 GitHub Secrets 新增後重跑 Action / " +
        "ADMIN_PASSWORD secret is missing — add it and re-run the workflow",
        503
      );
    }
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    const rateKey = `RATE:ADMINLOGIN:${ip}`;
    const attempts = Number((await env.CACHE.get(rateKey)) || 0);
    if (attempts >= 5) return fail("嘗試太多次，請 10 分鐘後再試 / Too many attempts, retry in 10 min", 429);
    const body = await readJson(request);
    if (!timingSafeEqual(String(body.password || ""), env.ADMIN_PASSWORD)) {
      await env.CACHE.put(rateKey, String(attempts + 1), { expirationTtl: 600 });
      return fail("管理員密碼錯誤 / Wrong admin password", 401);
    }
    await env.CACHE.delete(rateKey);
    const { token } = await signSession(env, "admin-panel", "admin");
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, "admin") });
  }

  if (pathname.startsWith("/api/admin/panel/")) {
    const adminSession = await verifySession(request, env, "admin");
    if (pathname === "/api/admin/panel/logout" && method === "POST") {
      if (adminSession) await env.CACHE.delete(`ADMINSESSION:${adminSession.jti}`);
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie("admin") });
    }
    if (!adminSession && !(await hasPanelAccess(request, env, cfg))) {
      return fail("需要管理員權限 / Admin only", 401);
    }

    if (pathname === "/api/admin/panel/state" && method === "GET") {
      return json({ ok: true, config: adminConfigView(cfg, env), stats: await adminStats(env) });
    }
    if (pathname === "/api/admin/panel/config" && method === "POST") {
      const body = await readJson(request);
      const next = await saveConfig(env, body);
      return json({ ok: true, config: adminConfigView(next, env) });
    }
    if (pathname === "/api/admin/panel/test-mail" && method === "POST") {
      const body = await readJson(request);
      const to = normalizeEmail(body.to);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail("請輸入有效郵箱 / Invalid email", 400);
      const sent = await sendMail(env, cfg, {
        to,
        subject: "Schoolink · 郵件設定測試 / Mail config test",
        html: otpHtml("123456", cfg.schoolName, true),
      });
      return sent.ok
        ? json({ ok: true, status: sent.status, detail: "測試郵件已寄出 / Test mail sent" })
        : fail(`寄送失敗 ${sent.status}: ${sent.detail || "check the API token & from address"}`, 502);
    }
  }

  /* ---------- 以下需要登录 ---------- */

  const session = await verifySession(request, env);
  if (!session) return fail("未登入 / Not signed in", 401);
  const user = await getUserById(env, session.uid);
  if (!user) return fail("帳號不存在 / Account missing", 401);
  const me = publicUser(user);
  const isAdmin = me.role === "admin" || cfg.adminEmails.includes(me.email);

  if (pathname === "/api/me" && method === "GET") {
    return json({ ok: true, user: me, isAdmin, r2Enabled: Boolean(env.IMAGES), config: {
      domains: cfg.domains, r2PublicBaseUrl: cfg.r2PublicBaseUrl, schoolName: cfg.schoolName,
    }, serverTime: Date.now() });
  }

  if (pathname === "/api/logout" && method === "POST") {
    await env.CACHE.delete(`SESSION:${session.jti}`);
    await env.CACHE.delete(`PRESENCE:${me.id}`);
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
  }

  if (pathname === "/api/users" && method === "GET") {
    return json({ ok: true, users: await listUsers(env, me.id) });
  }

  if (pathname === "/api/presence" && method === "POST") {
    await setPresence(env, me.id);
    return json({ ok: true });
  }

  if (pathname === "/api/threads" && method === "GET") {
    return json({ ok: true, threads: await listThreads(env, me.id) });
  }

  if (pathname === "/api/threads" && method === "POST") {
    const body = await readJson(request);
    const id = await createThread(env, me.id, body);
    return json({ ok: true, id });
  }

  // /api/threads/:id/messages  |  /api/threads/:id/read
  if (parts[1] === "threads" && parts.length >= 4) {
    const threadId = parts[2];
    if (!(await isMember(env, threadId, me.id))) return fail("Not a member", 403);

    if (parts[3] === "messages" && method === "GET") {
      const after = Number(url.searchParams.get("after") || 0);
      const messages = after
        ? await getMessagesAfter(env, threadId, after)
        : await getRecentMessages(env, threadId);
      return json({ ok: true, messages });
    }
    if (parts[3] === "messages" && method === "POST") {
      const body = await readJson(request);
      if (body.kind === "image" && !body.body) return fail("Empty image", 400);
      if (body.kind !== "image" && !String(body.body || "").trim()) return fail("Empty message", 400);
      const message = await insertMessage(env, me.id, threadId, body);
      return json({ ok: true, message });
    }
    if (parts[3] === "read" && method === "POST") {
      await markRead(env, threadId, me.id);
      return json({ ok: true });
    }
  }

  if (pathname === "/api/upload" && method === "POST") {
    if (!env.IMAGES) return fail("管理員未啟用 R2，圖片功能已關閉 / R2 disabled by admin", 503);
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return fail("Missing file", 400);
    const ext = MIME_EXT[file.type];
    if (!ext) return fail("只支援圖片 / Images only (png/jpg/webp/gif/avif/heic)", 415);
    if (file.size > MAX_IMAGE) return fail("圖片超過 10MB / Image too large", 413);
    const stamp = new Date().toISOString().slice(0, 7).replace("-", "/");
    const key = `images/${stamp}/${crypto.randomUUID()}.${ext}`;
    await env.IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { uploader: me.id },
    });
    const base = cfg.r2PublicBaseUrl.replace(/\/+$/, "");
    const publicUrl = base ? `${base}/${key}` : `/api/file/${key}`;
    return json({ ok: true, key, url: publicUrl, viaCustomDomain: Boolean(base) });
  }

  /* ---------- 管理员 ---------- */

  if (pathname.startsWith("/api/admin/")) {
    if (!isAdmin && !(await hasPanelAccess(request, env, cfg))) {
      return fail("需要管理員權限 / Admin only", 403);
    }
    if (pathname === "/api/admin/config" && method === "GET") {
      return json({ ok: true, config: adminConfigView(cfg, env), stats: await adminStats(env) });
    }
    if (pathname === "/api/admin/config" && method === "POST") {
      const body = await readJson(request);
      const next = await saveConfig(env, body);
      return json({ ok: true, config: adminConfigView(next, env) });
    }
  }

  return fail("Not found", 404);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/** /admin 后台会话 或 已登录的 admin 账号，两者皆可管理配置 */
async function hasPanelAccess(request, env, cfg) {
  if (await verifySession(request, env, "admin")) return true;
  const s = await verifySession(request, env, "user");
  if (!s) return false;
  const u = await getUserById(env, s.uid);
  return Boolean(u && (u.role === "admin" || cfg.adminEmails.includes(u.email)));
}

/** 对外配置视图：只给掩码，绝不回传 mailApiToken 或 ADMIN_PASSWORD */
function adminConfigView(cfg, env) {
  return {
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
    updatedAt: cfg.updatedAt,
  };
}

function otpHtml(code, schoolName, isTest = false) {
  const title = isTest ? "郵件設定測試 / Mail config test" : "你的登入驗證碼 / Your login code";
  return `<div style="font-family:system-ui,-apple-system,sans-serif;padding:28px;background:#141416;color:#f2f2f0;border-radius:18px;max-width:440px">
    <div style="font-size:20px;font-weight:700;letter-spacing:.5px">🍀 Schoolink</div>
    <div style="opacity:.55;font-size:12px;margin-top:4px">${escapeHtml(schoolName || "Schoolink")}</div>
    <p style="margin:26px 0 10px;font-size:14px">${title}</p>
    <div style="font-size:38px;letter-spacing:10px;font-weight:750;color:#a999ff;background:#202028;padding:16px;border-radius:12px;text-align:center">${code}</div>
    <p style="opacity:.55;font-size:12px;margin:18px 0 0">${
      isTest ? "這是一封設定測試郵件，收到即代表設定正確。" : "10 分鐘內有效 / Valid for 10 minutes. 如果不是你本人操作，請忽略此郵件。"
    }</p>
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
