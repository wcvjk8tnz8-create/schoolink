/**
 * 密码哈希：Web Crypto PBKDF2-SHA256，零依赖，Workers / 浏览器同源算法。
 * 只存 `pbkdf2$iterations$salt$hash`，绝不存明文；验证走恒定时间比较。
 */
import { timingSafeEqual } from "./auth";

const enc = new TextEncoder();
const ITER = 100_000;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function derive(pw: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256,
  );
  return new Uint8Array(bits);
}

export function isStrongPassword(pw: unknown): boolean {
  const s = String(pw ?? "");
  return s.length >= 6 && s.length <= 128 && /\S/.test(s);
}

export async function hashPassword(pw: unknown): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(String(pw ?? ""), salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(pw: unknown, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 500_000) return false;
  try {
    const hash = await derive(String(pw ?? ""), unb64(parts[2]), iterations);
    return timingSafeEqual(b64(hash), parts[3]);
  } catch { return false; }
}
