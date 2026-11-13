#!/usr/bin/env python3
"""
Schoolink 自检：纯 Python 标准库，不需要 npm install。

CI 在 `npm ci` 之前跑它，用来在部署前挡住最常见的结构性错误：
相对 import 断链、配置解析失败、三语字典缺键、前后端 API 不对齐、
Wrangler 绑定与类型声明不一致、KV TTL < 60、PWA 图标缺失、凭据误提交。

用法：python3 scripts/selfcheck.py
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"node_modules", ".next", "out", ".git", ".wrangler", "__pycache__"}
results: list[tuple[bool, str, str]] = []


def ok(name: str, cond: bool, detail: str = "") -> None:
    results.append((bool(cond), name, detail))


def text(rel: str) -> str:
    p = ROOT / rel
    return p.read_text(encoding="utf-8") if p.exists() else ""


def source_files() -> list[Path]:
    import os
    out = []
    for d, dirs, fs in os.walk(ROOT, topdown=True, onerror=lambda e: None):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in fs:
            p = Path(d) / f
            if p.suffix in {".png", ".jpg", ".jpeg", ".zip", ".ico"}:
                continue
            try:
                if p.is_file():
                    out.append(p)
            except OSError:
                pass
    return out


def jsonc(rel: str):
    """只处理整行 // 注释与尾逗号，足够覆盖 wrangler.jsonc / tsconfig.json。"""
    lines = []
    for line in text(rel).splitlines():
        s = line.lstrip()
        if s.startswith("//") or s.startswith("/*") or s.startswith("*"):
            continue
        lines.append(line)
    raw = re.sub(r",\s*([}\]])", r"\1", "\n".join(lines))
    return json.loads(raw)


# ── 1. 必需文件 ────────────────────────────────────────────────────
REQUIRED = [
    "package.json", "package-lock.json", "tsconfig.json", "next.config.ts",
    "wrangler.jsonc", "schema.sql", "README.md", ".gitignore",
    ".github/workflows/deploy.yml", "scripts/provision.mjs", "scripts/make-icons.py",
    "app/layout.tsx", "app/page.tsx", "app/globals.css",
    "lib/i18n.ts", "lib/store.ts", "lib/api.ts", "lib/types.ts", "lib/utils.ts",
    "worker/index.ts", "worker/store.ts", "worker/auth.ts", "worker/kv.ts", "worker/migrate.ts",
    "worker/chat-room.ts", "worker/env.d.ts", "worker/util.ts", "worker/tsconfig.json",
    "public/manifest.webmanifest", "public/sw.js", "public/offline.html",
    "public/logo.svg", "public/favicon.svg",
    "public/icons/icon-192.png", "public/icons/icon-512.png",
    "public/icons/icon-maskable.png", "public/icons/apple-touch-icon.png",
    "docs/preview.png",
]
missing = [f for f in REQUIRED if not (ROOT / f).exists()]
ok("必需文件齐全", not missing, ", ".join(missing))

# ── 2. 相对 import 全部能解析 ─────────────────────────────────────
EXTS = ["", ".ts", ".tsx", ".js", ".mjs", ".css", ".svg", ".json",
        ".webmanifest", "/index.ts", "/index.tsx"]
broken = []
pat = re.compile(r"""(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]|@import\s+['"](\.[^'"]+)['"]""")
for p in source_files():
    if p.suffix not in {".ts", ".tsx", ".js", ".mjs", ".css"}:
        continue
    try:
        src = p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    for m in pat.finditer(src):
        spec = m.group(1) or m.group(2)
        base = (p.parent / spec).resolve()
        if any((ROOT / str(Path(base).relative_to(ROOT))).with_name(
                base.name + e).exists() if not e.startswith("/") else False
               for e in EXTS if e and not e.startswith("/")):
            continue
        if base.exists() or any((p.parent / (spec + e)).exists() for e in EXTS):
            continue
        broken.append(f"{p.relative_to(ROOT)} → {spec}")
ok("相对 import 无断链", not broken, "; ".join(broken[:5]))

# ── 3. 配置可解析 ─────────────────────────────────────────────────
cfg_errors = []
parsed: dict[str, dict] = {}
for f in ["package.json", "package-lock.json", "tsconfig.json",
          "worker/tsconfig.json", "public/manifest.webmanifest", "wrangler.jsonc"]:
    try:
        parsed[f] = jsonc(f)
    except Exception as e:
        cfg_errors.append(f"{f}: {e}")
ok("JSON / JSONC 配置可解析", not cfg_errors, "; ".join(cfg_errors))

if "wrangler.jsonc" in parsed:
    w = parsed["wrangler.jsonc"]
    ok("静态资源目录指向 out/", w.get("assets", {}).get("directory") == "./out",
       str(w.get("assets", {}).get("directory")))
    ok("Worker 入口正确", w.get("main") in {"worker/index.ts", "./worker/index.ts"},
       str(w.get("main")))

if "package.json" in parsed and "package-lock.json" in parsed:
    pj, pl = parsed["package.json"], parsed["package-lock.json"]
    root_lock = pl.get("packages", {}).get("", {})
    ok("lock 与 package.json 依赖一致",
       pj.get("dependencies") == root_lock.get("dependencies")
       and pj.get("devDependencies") == root_lock.get("devDependencies"))

# ── 4. 三语字典键完全一致 ─────────────────────────────────────────
i18n = text("lib/i18n.ts")
blocks = re.split(r"const (zhCN|zhHK|en): Dict = \{", i18n)
dicts: dict[str, set[str]] = {}
for i in range(1, len(blocks), 2):
    name, body = blocks[i], blocks[i + 1]
    dicts[name] = set(re.findall(r'^\s*"?([A-Za-z0-9_]+)"?\s*:', body, re.M))
ok("三语字典各语言均非空", len(dicts) == 3 and all(len(v) >= 50 for v in dicts.values()),
   str({k: len(v) for k, v in dicts.items()}))
if len(dicts) == 3:
    base = dicts["zhCN"]
    diff = {k: sorted(base ^ v) for k, v in dicts.items()}
    ok("三语键完全一致", all(not d for d in diff.values()),
       "; ".join(f"{k}: {v[:4]}" for k, v in diff.items() if v))

# ── 5. 前后端 API 对齐 ─────────────────────────────────────────────
worker_src = "\n".join(text(f"worker/{f}") for f in
                       ["index.ts", "store.ts", "auth.ts", "kv.ts", "util.ts"])
front_apis: set[str] = set()
for p in source_files():
    if p.suffix in {".ts", ".tsx"} and p.parts[-2] in {"app", "components", "lib"}:
        for m in re.findall(r"/api/[A-Za-z0-9_./?=&-]+", p.read_text(encoding="utf-8")):
            seg = m.split("/")[2] if len(m.split("/")) > 2 else ""
            seg = seg.split("?")[0].split("=")[0].strip()
            if seg:
                front_apis.add(seg)
unmatched = [a for a in sorted(front_apis)
             if f'"/api/{a}' not in worker_src
             and f'parts[1] === "{a}"' not in worker_src
             and f'p.startsWith("/api/{a}' not in worker_src]
ok("前端 API 在 Worker 均有路由", not unmatched, ", ".join(unmatched))
ok("Worker 提供实时 WebSocket 入口", "/api/ws" in worker_src)

# ── 6. Wrangler 绑定 ↔ 类型声明 ↔ DO 类名 ─────────────────────────
if "wrangler.jsonc" in parsed:
    w = parsed["wrangler.jsonc"]
    names = []
    for key, field in [("d1_databases", "binding"), ("kv_namespaces", "binding"),
                       ("r2_buckets", "binding")]:
        names += [x.get(field) for x in w.get(key, []) if x.get(field)]
    for do in w.get("durable_objects", {}).get("bindings", []):
        if do.get("name"):
            names.append(do["name"])
    env_decl = text("worker/env.d.ts")
    absent = [n for n in names if not re.search(rf"\b{n}\b", env_decl)]
    ok("绑定名都在 env.d.ts 声明", not absent, ", ".join(absent))
    migrations = w.get("migrations", [])
    classes = [c for m in migrations for c in m.get("new_sqlite_classes", [])]
    ok("DO 使用 new_sqlite_classes（2026 新账号强制 SQLite 后端）", bool(classes), str(classes))
    room = text("worker/chat-room.ts")
    ok("DO 类名与代码导出一致且继承 DurableObject",
       all(f"export class {c}" in room for c in classes) and "extends DurableObject" in room,
       str(classes))

# ── 7. KV TTL 永远 ≥ 60（Cloudflare 硬限制） ─────────────────────
kv_files = ["index.ts", "store.ts", "auth.ts", "util.ts"]
all_worker = {f: text(f"worker/{f}") for f in kv_files}
leaks = [f for f, s in all_worker.items() if re.search(r"env\.CACHE\.put\(|CACHE\.put\(", s)]
bad_arg = [f"{f}:{s.count('kvPut(env,')}"
           for f, s in all_worker.items() if "kvPut(env," in s]
kv = text("worker/kv.ts")
nums = [int(n) for n in re.findall(r"expirationTtl\s*[:=]\s*(\d+)", kv)]
ok("KV 写入没有绕过封装的裸 .put()", not leaks, ", ".join(leaks))
ok("kvPut 第一参数均为 KV 绑定", not bad_arg, ", ".join(bad_arg))
ok("kvPut 强制 clamp 到 60 秒", "Math.max(KV_MIN_TTL" in kv and "KV_MIN_TTL = 60" in kv)
ok("kv.ts 内无 < 60 的 TTL 字面量", all(n >= 60 for n in nums), str(nums))

# ── 8. schema.sql 幂等且表名被 Worker 使用 ────────────────────────
sql = text("schema.sql")
creates = re.findall(r"CREATE\s+(TABLE|INDEX)\s+(?!IF\s+NOT\s+EXISTS)", sql, re.I)
ok("所有 CREATE 均带 IF NOT EXISTS", not creates, str(len(creates)))
mig = text("worker/migrate.ts")
ok("v1→v2 在线迁移已接入 /api/*", "ensureSchema" in mig and "ensureSchema(env)" in worker_src
   and 'kvPut(env.CACHE, "SCHEMA:v2"' in mig)
v2_extra = ["about", "banned", "last_seen", "last_message_at", "pinned", "muted",
            "archived", "starred", "media_key", "media_size", "reply_to",
            "forwarded_from", "edited_at", "deleted_at"]
ok("迁移覆盖 v2 新增列", all(f'"{c} ' in mig or f"{c} " in mig for c in v2_extra),
   str([c for c in v2_extra if f"{c} " not in mig]))
ok("迁移回填 v1 旧图片", "image_key" in mig and "media_key = image_key" in mig)
tables = set(re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)", sql, re.I))
need_tables = {"users", "threads", "thread_members", "messages", "reactions", "starred"}
ok("D1 必需表齐全", need_tables <= {t.lower() for t in tables},
   str(sorted(need_tables - {t.lower() for t in tables})))
store = text("worker/store.ts")
used = set(re.findall(r"\b(?:FROM|INTO|UPDATE)\s+(users|threads|messages|thread_members|reactions|stars|attachments|otp_codes)\b", store, re.I))
ok("Worker 引用的表都在 schema 中", used <= {t.lower() for t in tables},
   str(sorted(used - {t.lower() for t in tables})))

# ── 9. PWA / 动画降级 ──────────────────────────────────────────────
if "public/manifest.webmanifest" in parsed:
    mf = parsed["public/manifest.webmanifest"]
    icons = [i.get("src", "") for i in mf.get("icons", [])]
    missing_icons = [s for s in icons if not (ROOT / "public" / s.lstrip("/")).exists()]
    ok("manifest 图标文件存在", not missing_icons, ", ".join(missing_icons))
    ok("PWA 可独立安装", mf.get("display") == "standalone" and bool(mf.get("start_url")))
css = text("app/globals.css")
ok("尊重 prefers-reduced-motion", "prefers-reduced-motion" in css)
kf = len(re.findall(r"@keyframes", css))
ok("CSS 关键帧动画已定义", kf >= 5, f"{kf} 组")
ui_motion = sum(open(str(p), encoding="utf8", errors="ignore").read().count("motion.")
                for p in source_files() if p.suffix == ".tsx")
ok("Motion 动画覆盖各组件", ui_motion >= 25, f"{ui_motion} 处 motion 元素")
ok("四叶草样式存在", ".clover" in css and "logo.svg" in text("components/Logo.tsx") + css)
ok("Service Worker 引用离线页", "offline.html" in text("public/sw.js"))

# ── 10. CI 工作流 ──────────────────────────────────────────────────
yml = text(".github/workflows/deploy.yml")
checks = {
    "Node 22（wrangler 4.161 要求 ≥22.12）": "node-version: '22'" in yml,
    "npm ci": "npm ci" in yml,
    "ADMIN_PASSWORD 缺失即失败": "ADMIN_PASSWORD" in yml and "exit 1" in yml,
    "自动 provision D1/KV/R2": "scripts/provision.mjs" in yml,
    "build + deploy": "npm run build" in yml and "wrangler deploy" in yml,
    "写入 Worker secrets": "wrangler secret put" in yml,
    "部署前跑自检": "selfcheck.py" in yml,
}
for k, v in checks.items():
    ok(f"CI：{k}", v)

# ── 11. 凭据不进仓库 ───────────────────────────────────────────────
secrets = []
for p in source_files():
    if p.name in {".dev.vars.example"} or p.suffix in {".png"}:
        continue
    try:
        s = p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    for label, rx in [("GitHub token", r"ghp_[A-Za-z0-9]{20,}"),
                      ("Resend key", r"re_[A-Za-z0-9]{24,}")]:
        if re.search(rx, s):
            secrets.append(f"{p.relative_to(ROOT)}: {label}")
ok("源码内无真实凭据", not secrets, "; ".join(secrets[:4]))

# ── 汇总 ───────────────────────────────────────────────────────────
print("🍀 Schoolink self-check\n")
for passed, name, detail in results:
    mark = "✓" if passed else "✗"
    print(f"  {mark} {name}" + (f"  — {detail}" if detail and not passed else ""))
failed = [r for r in results if not r[0]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
if failed:
    print("FAILED: " + ", ".join(r[1] for r in failed))
    sys.exit(1)
print("OK · 可以部署")
