/**
 * Cloudflare Workers KV 的限制：expirationTtl 必须是整数秒，且 **最小 60 秒**。
 * 小于 60 会直接抛 `KV PUT failed: 400 Invalid expiration_ttl of N`。
 *
 * 所有带 TTL 的写入统一走这里，顺手 clamp + 取整，避免以后再踩同一个坑。
 * 不带 TTL 的写入（例如 CONFIG:app 永久热配置）也走这里，保持调用一致。
 */
export const KV_MIN_TTL = 60;

export async function kvPut(env, key, value, options = {}) {
  const opts = { ...options };
  if (opts.expirationTtl !== undefined && opts.expirationTtl !== null) {
    const n = Math.floor(Number(opts.expirationTtl));
    opts.expirationTtl = Number.isFinite(n) ? Math.max(KV_MIN_TTL, n) : KV_MIN_TTL;
  }
  return env.CACHE.put(key, value, opts);
}
