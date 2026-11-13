#!/usr/bin/env node
/**
 * Schoolink · Cloudflare 资源幂等准备
 *
 * 由 GitHub Actions 调用，也可本地执行（需先导出 CLOUDFLARE_API_TOKEN、
 * CLOUDFLARE_ACCOUNT_ID 两个环境变量，凭据只放环境变量，不要写进文件）：
 *   node scripts/provision.mjs
 *
 * 规则：
 *  - D1 / KV / R2 先查再建；已存在直接复用，绝不重复 create（避免 Action 报 already exists 失败）
 *  - ENABLE_R2=false 时完全不碰 R2 API，也不写 r2_buckets 绑定（Worker 自动降级关闭图片功能）
 *  - 用「填的环境变量」现场生成 wrangler.jsonc，回填真实 database_id / kv id
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;

const TOKEN = env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID;
if (!TOKEN || !ACCOUNT) {
  console.error("✗ 缺少 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID");
  process.exit(1);
}

const WORKER_NAME = env.WORKER_NAME || "schoolink";
const D1_NAME = env.D1_DATABASE_NAME || "schoolink-db";
const KV_TITLE = env.KV_NAMESPACE_TITLE || `${WORKER_NAME}-cache`;
const R2_NAME = env.R2_BUCKET_NAME || `${WORKER_NAME}-images`;
const ENABLE_R2 = !/^(0|false|no|off)$/i.test(String(env.ENABLE_R2 ?? "true"));
const CUSTOM_DOMAIN = (env.CUSTOM_DOMAIN || "").trim();
const ALLOWED_EMAIL_DOMAINS = env.ALLOWED_EMAIL_DOMAINS || "@plkshs.edu.hk";
const ADMIN_EMAILS = env.ADMIN_EMAILS || `admin@${ALLOWED_EMAIL_DOMAINS.split(",")[0].trim().replace(/^@/, "")}`;
const SCHOOL_NAME = env.SCHOOL_NAME || "Schoolink 校園";
const ALLOW_DEV_OTP = /^(1|true|yes|on)$/i.test(String(env.ALLOW_DEV_OTP ?? "0")) ? "1" : "0";
const R2_PUBLIC_BASE_URL = ENABLE_R2 ? (env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "") : "";

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const log = (...a) => console.log("  ", ...a);

async function cf(pathname, { method = "GET", body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* noop */ }
  if (!data.success) {
    const e0 = (data.errors || [])[0] || {};
    const err = new Error(
      `Cloudflare API ${method} ${pathname} → HTTP ${res.status} [${e0.code ?? "-"}] ${e0.message || JSON.stringify(data.errors || data)}`
    );
    err.status = res.status;
    err.code = e0.code;
    err.messageText = e0.message || "";
    throw err;
  }
  return data.result;
}

const isExists = (e) =>
  e.status === 409 ||
  e.code === 10014 || e.code === 10048 ||
  /already exist|duplicate|already taken|name is not available/i.test(e.messageText || "");

/**
 * 先 list → 有就复用；没有才 create；create 撞上「已存在」再 list 一次兜底。
 * skip=true 时连 list 都不调用（避免无权限 / 未开通 R2 导致整个 Action 失败）。
 */
async function ensure({ label, list, find, create, skip = false }) {
  if (skip) { log(`SKIP   ${label}（已停用，不调用 API）`); return null; }
  let found = find(await list());
  if (found) { log(`REUSE  ${label}`); return found; }
  try {
    await create();
    log(`CREATE ${label} ✓`);
    found = find(await list());
  } catch (e) {
    if (!isExists(e)) throw e;
    log(`REUSE  ${label}（并发/已存在，跳过创建）`);
    found = find(await list());
  }
  if (!found) throw new Error(`✗ ${label} 建立後仍無法讀回，請檢查 API Token 權限`);
  return found;
}

function asArray(x) {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.buckets)) return x.buckets;
  if (Array.isArray(x?.result)) return x.result;
  return [];
}

console.log(`\n▶ Schoolink provision · account ${ACCOUNT.slice(0, 6)}…`);
console.log(`  D1=${D1_NAME}  KV=${KV_TITLE}  R2=${ENABLE_R2 ? R2_NAME : "DISABLED"}\n`);

let d1Id, kvId, r2Name = null;
try {
  const d1 = await ensure({
    label: `D1 ${D1_NAME}`,
    list: () => cf("/d1/database?per_page=100"),
    find: (rows) => asArray(rows).find((x) => x.name === D1_NAME),
    create: () => cf("/d1/database", { method: "POST", body: { name: D1_NAME } }),
  });
  d1Id = d1.uuid || d1.id;

  const kv = await ensure({
    label: `KV ${KV_TITLE}`,
    list: () => cf("/storage/kv/namespaces?per_page=100&page=1"),
    find: (rows) => asArray(rows).find((x) => x.title === KV_TITLE),
    create: () => cf("/storage/kv/namespaces", { method: "POST", body: { title: KV_TITLE } }),
  });
  kvId = kv.id;

  if (ENABLE_R2) {
    try {
      const bucket = await ensure({
        label: `R2 ${R2_NAME}`,
        list: () => cf("/r2/buckets"),
        find: (rows) => asArray(rows).find((x) => x.name === R2_NAME),
        create: () => cf("/r2/buckets", { method: "POST", body: { name: R2_NAME } }),
      });
      r2Name = bucket.name || R2_NAME;
    } catch (e) {
      throw new Error(
        `R2 處理失敗：${e.message}\n` +
        `→ 若不需要圖片功能，把 GitHub Variable ENABLE_R2 設為 false 即可跳過；` +
        `若已開通 R2，請確認 API Token 具備「Account: R2:Edit」權限。`
      );
    }
  } else {
    log("SKIP   R2 bucket（ENABLE_R2=false，Worker 圖片功能自動降級）");
  }
} catch (e) {
  console.error("\n✗ Provision 失敗：", e.message, "\n");
  process.exit(1);
}

// 建表也一并自动完成（schema.sql 全部是 IF NOT EXISTS，重跑不會失敗）
try {
  const schema = await readFile(path.join(ROOT, "schema.sql"), "utf8");
  const statements = schema
    .split(";")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s && !/^PRAGMA\b/i.test(s));
  for (const sql of statements) {
    await cf(`/d1/database/${d1Id}/query`, { method: "POST", body: { sql } });
  }
  log(`INIT   D1 schema ✓ (${statements.length} statements)`);
} catch (e) {
  console.error("\n✗ D1 建表失敗：", e.message, "\n");
  process.exit(1);
}

const config = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: WORKER_NAME,
  main: "src/index.js",
  compatibility_date: "2026-11-13",
  compatibility_flags: ["nodejs_compat"],
  observability: { enabled: true },
  assets: {
    directory: "./public",
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: ["/api/*", "/api", "/admin", "/admin/"],
  },
  d1_databases: [{ binding: "DB", database_name: D1_NAME, database_id: d1Id }],
  kv_namespaces: [{ binding: "CACHE", id: kvId }],
  ...(r2Name ? { r2_buckets: [{ binding: "IMAGES", bucket_name: r2Name }] } : {}),
  vars: {
    ALLOWED_EMAIL_DOMAINS,
    ADMIN_EMAILS,
    SCHOOL_NAME,
    ALLOW_DEV_OTP,
    R2_PUBLIC_BASE_URL,
  },
  ...(CUSTOM_DOMAIN ? {
    routes: [{ pattern: CUSTOM_DOMAIN, custom_domain: true }],
    workers_dev: false,
  } : {}),
};

const header = `// ⚠️ 由 GitHub Actions 的 scripts/provision.mjs 依「環境變數」自動生成，請勿手動改這個檔案。
// 要改設定：GitHub → Settings → Secrets and variables → Actions → Variables / Secrets，再重跑 workflow。
// 倉庫內的 wrangler.jsonc 只是本地開發範本；CI 會覆寫它，不會提交回去。
`;
await writeFile(path.join(ROOT, "wrangler.jsonc"), header + JSON.stringify(config, null, 2) + "\n", "utf8");

console.log("\n✓ wrangler.jsonc 已生成");
console.log(`  D1 id : ${d1Id}`);
console.log(`  KV id : ${kvId}`);
console.log(`  R2    : ${r2Name || "disabled"}`);
if (CUSTOM_DOMAIN) console.log(`  Domain: ${CUSTOM_DOMAIN}`);
console.log("");
