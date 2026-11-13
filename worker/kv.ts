/**
 * Cloudflare KV 的 expirationTtl 必须是整数秒且 >= 60。
 * 所有带 TTL 的写入统一走这里，自动 clamp + 取整。
 */
export const KV_MIN_TTL = 60;

export async function kvPut(
  cache: KVNamespace,
  key: string,
  value: string,
  options: KVNamespacePutOptions = {},
): Promise<void> {
  const opts = { ...options };
  if (opts.expirationTtl !== undefined && opts.expirationTtl !== null) {
    const n = Math.floor(Number(opts.expirationTtl));
    opts.expirationTtl = Number.isFinite(n) ? Math.max(KV_MIN_TTL, n) : KV_MIN_TTL;
  }
  await cache.put(key, value, opts);
}
