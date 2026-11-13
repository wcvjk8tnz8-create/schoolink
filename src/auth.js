// 会话签名、Cookie、邮箱后缀校验、OTP。无第三方依赖，全部基于 Web Crypto。
const enc = new TextEncoder();
const DAY = 86400;
const SESSION_TTL = 30 * DAY;

function b64u(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64u(str) {
  const pad = str.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeDomains(list) {
  return (Array.isArray(list) ? list : String(list || "").split(","))
    .map((d) => String(d).trim().toLowerCase())
    .filter(Boolean)
    .map((d) => (d.startsWith("@") ? d : "@" + d));
}

export function isEmailAllowed(email, domains) {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const suffix = e.slice(e.lastIndexOf("@"));
  return domains.some((d) => suffix === d);
}

export async function signSession(env, uid) {
  const secret = env.SESSION_SECRET || "schoolink-local-dev-secret";
  const jti = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = b64u(enc.encode(JSON.stringify({ uid, jti, exp })));
  const sig = b64u(await hmac(secret, payload));
  await env.CACHE.put(
    `SESSION:${jti}`,
    JSON.stringify({ uid, exp }),
    { expirationTtl: SESSION_TTL }
  );
  return { token: `${payload}.${sig}`, exp };
}

export async function verifySession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = /(?:^|;\s*)schoolink_session=([^;]+)/.exec(cookie);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const secret = env.SESSION_SECRET || "schoolink-local-dev-secret";
  const expected = b64u(await hmac(secret, payload));
  if (expected !== sig) return null;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(unb64u(payload)));
  } catch {
    return null;
  }
  if (!data.uid || !data.jti || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  const stored = await env.CACHE.get(`SESSION:${data.jti}`, "json");
  if (!stored || stored.uid !== data.uid) return null;
  return { uid: data.uid, jti: data.jti };
}

export function sessionCookie(token) {
  return `schoolink_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`;
}

export function clearCookie() {
  return "schoolink_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

export async function issueOtp(env, email) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const code = String(buf[0] % 1000000).padStart(6, "0");
  await env.CACHE.put(
    `OTP:${email}`,
    JSON.stringify({ code, exp: Date.now() + 10 * 60 * 1000 }),
    { expirationTtl: 600 }
  );
  return code;
}

export async function consumeOtp(env, email, code) {
  const raw = await env.CACHE.get(`OTP:${email}`, "json");
  if (!raw || raw.exp < Date.now() || String(raw.code) !== String(code || "").trim()) return false;
  await env.CACHE.delete(`OTP:${email}`);
  return true;
}
