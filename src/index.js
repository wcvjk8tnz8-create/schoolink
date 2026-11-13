// Schoolink · Cloudflare Workers
// Workers + Static Assets (前端) / D1 (账号+聊天) / KV (缓存+会话) / R2 (图片)
import {
  normalizeEmail, isEmailAllowed, signSession, verifySession,
  sessionCookie, clearCookie, issueOtp, consumeOtp,
} from "./auth.js";
import {
  loadConfig, saveConfig, publicUser, getUserById, getUserByEmail, createUser,
  listUsers, isMember, listThreads, createThread, getRecentMessages,
  getMessagesAfter, insertMessage, markRead, setPresence, adminStats,
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
    if (env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.RESEND_FROM || "Schoolink <onboarding@resend.dev>",
          to: [email],
          subject: "Schoolink 校園驗證碼 / Your code",
          html: `<div style="font-family:system-ui;padding:24px;background:#111;color:#eee;border-radius:16px">
            <h2>Schoolink</h2><p>你的登入驗證碼 / Your login code:</p>
            <div style="font-size:36px;letter-spacing:8px;font-weight:700;color:#9b8cff">${code}</div>
            <p style="opacity:.6">10 分鐘內有效 / Valid for 10 minutes.</p></div>`,
        }),
      });
      if (!res.ok) {
        await env.CACHE.delete(rateKey);
        return fail(`郵件發送失敗 / Mail error: ${res.status}`, 502);
      }
      return json({ ok: true, delivery: "email" });
    }
    if (cfg.devOtp) return json({ ok: true, delivery: "dev", code, hint: "本地開發模式：驗證碼已自動填入" });
    return fail("管理員尚未設定郵件服務（RESEND_API_KEY）/ Mail service not configured", 503);
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
    if (!isAdmin) return fail("需要管理員權限 / Admin only", 403);
    if (pathname === "/api/admin/config" && method === "GET") {
      return json({ ok: true, config: {
        domains: cfg.domains, r2PublicBaseUrl: cfg.r2PublicBaseUrl,
        schoolName: cfg.schoolName, updatedAt: cfg.updatedAt,
      }, stats: await adminStats(env) });
    }
    if (pathname === "/api/admin/config" && method === "POST") {
      const body = await readJson(request);
      const next = await saveConfig(env, body);
      return json({ ok: true, config: {
        domains: next.domains, r2PublicBaseUrl: next.r2PublicBaseUrl,
        schoolName: next.schoolName, updatedAt: next.updatedAt,
      } });
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
