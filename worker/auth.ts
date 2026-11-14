import { kvPut } from "./kv";

const enc = new TextEncoder();
const DAY = 86_400;

export type SessionKind = "user" | "admin";

const SESSION_META: Record<SessionKind, { cookie: string; prefix: string; ttl: number }> = {
  user: { cookie: "schoolink_session", prefix: "SESSION", ttl: 30 * DAY },
  admin: { cookie: "schoolink_admin", prefix: "ADMINSESSION", ttl: 2 * 3600 },
};

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64u(str: string): Uint8Array {
  const pad = str.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** 恒定时间比较 */
export function timingSafeEqual(a: unknown, b: unknown): boolean {
  const x = String(a ?? ""), y = String(b ?? "");
  const n = Math.max(x.length, y.length);
  let diff = x.length === y.length ? 0 : 1;
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

export function normalizeDomains(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : String(list ?? "").split(",");
  return arr
    .map((d) => String(d).trim().toLowerCase())
    .filter(Boolean)
    .map((d) => (d.startsWith("@") ? d : `@${d}`));
}

export function isEmailAllowed(email: string, domains: string[]): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const suffix = email.slice(email.lastIndexOf("@"));
  return domains.some((d) => suffix === d);
}

export interface SessionData { uid: string; jti: string }

export async function signSession(env: Env, uid: string, kind: SessionKind = "user") {
  const meta = SESSION_META[kind];
  const secret = env.SESSION_SECRET || "schoolink-local-dev-secret";
  const jti = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + meta.ttl;
  const payload = b64u(enc.encode(JSON.stringify({ uid, jti, exp, k: kind })));
  const sig = b64u(await hmac(secret, payload));
  await kvPut(env.CACHE, `${meta.prefix}:${jti}`, JSON.stringify({ uid, exp }), {
    expirationTtl: meta.ttl,
  });
  return { token: `${payload}.${sig}`, exp, jti };
}

export async function verifySession(
  request: Request,
  env: Env,
  kind: SessionKind = "user",
): Promise<SessionData | null> {
  const meta = SESSION_META[kind];
  const cookie = request.headers.get("Cookie") || "";
  const match = new RegExp(`(?:^|;\\s*)${meta.cookie}=([^;]+)`).exec(cookie);
  if (!match) return null;
  const [payload, sig] = decodeURIComponent(match[1]).split(".");
  if (!payload || !sig) return null;
  const secret = env.SESSION_SECRET || "schoolink-local-dev-secret";
  if (!timingSafeEqual(b64u(await hmac(secret, payload)), sig)) return null;
  let data: { uid?: string; jti?: string; exp?: number; k?: string };
  try {
    data = JSON.parse(new TextDecoder().decode(unb64u(payload)));
  } catch {
    return null;
  }
  if (data.k !== kind || !data.uid || !data.jti || !data.exp || data.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  const stored = await env.CACHE.get<{ uid: string; exp: number }>(
    `${meta.prefix}:${data.jti}`, "json",
  );
  if (!stored || stored.uid !== data.uid) return null;
  return { uid: data.uid, jti: data.jti };
}

export function sessionCookie(token: string, kind: SessionKind = "user", secure = true): string {
  const meta = SESSION_META[kind];
  return `${meta.cookie}=${encodeURIComponent(token)}; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=${meta.ttl}`;
}

export function clearCookie(kind: SessionKind = "user", secure = true): string {
  const meta = SESSION_META[kind];
  return `${meta.cookie}=; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=0`;
}

/** 验证码按用途隔离：登录 / 绑定邮箱互不串用 */
export type OtpScope = "login" | "bind";
const otpKey = (scope: OtpScope, email: string) => `OTP:${scope}:${email}`;

export async function issueOtp(env: Env, email: string, scope: OtpScope = "login"): Promise<string> {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const code = String(buf[0] % 1_000_000).padStart(6, "0");
  await kvPut(env.CACHE, otpKey(scope, email), JSON.stringify({ code, exp: Date.now() + 10 * 60_000 }), {
    expirationTtl: 600,
  });
  return code;
}

export async function consumeOtp(
  env: Env, email: string, code: unknown, scope: OtpScope = "login",
): Promise<boolean> {
  const key = otpKey(scope, email);
  const raw = await env.CACHE.get<{ code: string; exp: number }>(key, "json");
  if (!raw || raw.exp < Date.now() || !timingSafeEqual(raw.code, String(code ?? "").trim())) return false;
  await env.CACHE.delete(key);
  return true;
}

/* ── 班别 / 学号：6C + 04 → 6C04 ───────────────────────────────── */

export function normClass(v: unknown): string {
  return String(v ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function normStudentNo(v: unknown): string {
  return String(v ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function loginKeyOf(c: string, n: string): string {
  return c && n ? `${c}${n}` : "";
}

export function isPlaceholderEmail(email: string): boolean {
  return email.startsWith("noemail-") && email.endsWith("@schoolink.invalid");
}
