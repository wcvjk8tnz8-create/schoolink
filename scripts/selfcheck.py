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
    "lib/prefs.ts", "lib/m4a.ts", "lib/faces.ts",
    "components/AvatarPicker.tsx", "components/Customize.tsx", "scripts/gen-icons.mjs",
    "components/AIAssistant.tsx", "components/InstallGuide.tsx", "lib/ai.ts", "worker/password.ts",
    "lib/ai-models.ts", "worker/ai-models.ts", "lib/m3.ts",
    "worker/chat-room.ts", "worker/env.d.ts", "worker/util.ts", "worker/tsconfig.json",
    "public/manifest.webmanifest", "public/sw.js", "public/offline.html",
    "public/logo.svg", "public/favicon.svg",
    "public/icons/icon-192.png", "public/icons/icon-512.png",
    "public/icons/icon-maskable.png", "public/icons/apple-touch-icon.png",
    "docs/preview.png", "docs/preview-material3.png", "docs/preview-material3-light.png",
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
        broken.append(f"{p.relative_to(ROOT)} -> {spec}")
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

# ── 6. Wrangler 绑定 / 类型声明 / DO 类名 ─────────────────────────
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
ok("在线表结构迁移已接入 /api/*", "ensureSchema" in mig and "ensureSchema(env)" in worker_src
   and 'kvPut(env.CACHE, "SCHEMA:v4"' in mig)
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

# ── 12. 图标：全部 SVG，界面无 emoji ─────────────────────────────────
ui_rel = [p.relative_to(ROOT).as_posix() for p in source_files()]
ui_targets = [p for p in ui_rel if (
    p.startswith("components/") or p.startswith("app/")
    or p in ("lib/i18n.ts", "lib/utils.ts", "worker/index.ts", "worker/store.ts")
) and p.endswith((".ts", ".tsx", ".css"))]
emoji_re = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]")
emoji_hits = []
for rel in ui_targets:
    for i, line in enumerate((ROOT / rel).read_text(encoding="utf-8").splitlines(), 1):
        if emoji_re.search(line):
            emoji_hits.append(f"{rel}:{i}")
ok("界面源码无 emoji 字符", not emoji_hits, ", ".join(emoji_hits[:6]))

icon_src = text("components/Icon.tsx")
ok("统一 SVG 图标组件存在", "export function Icon" in icon_src and "PATHS" in icon_src)
defined = set(re.findall(r'^\s*"?([a-z][a-z-]*)"?\s*:', icon_src, re.M))
used = set()
for rel in ui_targets:
    if rel.startswith("components/") and rel.endswith(".tsx"):
        for m in re.findall(r'<Icon name="([a-z-]+)"', (ROOT / rel).read_text(encoding="utf-8")):
            used.add(m)
missing_icons = sorted(used - defined)
ok("组件引用的图标都已定义", not missing_icons, ", ".join(missing_icons))
ok("彩色表情贴纸组件存在", "export function FaceIcon" in icon_src and (ROOT / "lib/faces.ts").exists())

logo = text("public/logo.svg")
favicon = text("public/favicon.svg")
ok("已恢复原本的四叶草 logo",
   'viewBox="0 0 240 240"' in logo and "M84 100 L110 126 L84 152" in logo
   and "M136 140 Q152 155 168 140" in logo and "240 240" in favicon
   and 'viewBox="0 0 240 240"' in text("components/Logo.tsx"))

faces_src = text("lib/faces.ts")
worker_store = text("worker/store.ts")
reaction_keys = re.search(r"REACTION_KEYS = \[(.*?)\]", faces_src, re.S)
allowed = re.search(r"const allowed = \[(.*?)\]", worker_store, re.S)
norm = lambda x: re.findall(r'"([a-z]+)"', x) if x else []
ok("前后端表情回应白名单一致",
   bool(reaction_keys and allowed) and norm(reaction_keys.group(1)) == norm(allowed.group(1)),
   f"{norm(reaction_keys.group(1)) if reaction_keys else []} vs {norm(allowed.group(1)) if allowed else []}")
ok("CSS 已适配 SVG 图标", ".svg-icon" in text("app/globals.css") and ".inline-face" in text("app/globals.css"))
ok("邮件模板不含 emoji", not emoji_re.search(text("worker/index.ts")))

# ── 13. 语音统一 M4A ───────────────────────────────────────────────
m4a = text("lib/m4a.ts")
composer = text("components/Composer.tsx")
worker_upload = text("worker/index.ts")
bubble = text("components/MessageBubble.tsx")
ok("M4A 编码模块存在", "export async function toM4a" in m4a and "export function pickRecorderMime" in m4a)
ok("Composer 接入 M4A 转换", "toM4a(raw, elapsed)" in composer and "pickRecorderMime()" in composer)
aac_i = m4a.find('"audio/mp4;codecs=mp4a.40.2"')
mp4_i = m4a.find('  M4A_MIME,')
ok("优先申请显式 AAC 编码", aac_i >= 0 and mp4_i > aac_i >= 0, f"aac@{aac_i} mp4@{mp4_i}")
ok("录音不再硬编码 webm 优先", '"audio/webm") ? "audio/webm"' not in composer)
ok("Worker 归一化带 codecs 的 MIME", 'split(";")[0]' in worker_upload and "rawType" in worker_upload)
ok("R2 响应头保留完整 codecs", "contentType: rawType" in worker_upload)
ok("audio/mp4 映射为 .m4a", '"audio/mp4": "m4a"' in worker_upload)
ok("语音气泡标注 M4A", "M4A" in bubble and "\\.m4a$" in bubble)
lock_pkgs = parsed.get("package-lock.json", {}).get("packages", {})
ok("M4A 不引入新依赖（零 WASM）", "node_modules/mp4-muxer" not in lock_pkgs
   and not any("ffmpeg" in k for k in lock_pkgs))
ok("README 说明 M4A 平台差异", "語音：统一 M4A" in text("README.md")
   or "语音：统一 M4A" in text("README.md"))


# ── 14. 自定义功能：头像 / 群组 / 外观 / 效率 ───────────────────────
picker = text("components/AvatarPicker.tsx")
custom = text("components/Customize.tsx")
prefs_mod = text("lib/prefs.ts")
app_comp = text("components/App.tsx")
css_all = text("app/globals.css")
schema_d1 = text("schema.sql")
migrate_d1 = text("worker/migrate.ts")
worker_store_src = text("worker/store.ts")
front_store = text("lib/store.ts")

ok("头像支持三种来源", all(x in picker for x in ["preset:", "tint:", "isPreset", "parseAvatar"])
   and "AvatarVisual" in picker and "AvatarPicker" in picker)
ok("群组头像可修改（前端）", "AvatarPicker" in custom and "avatar_key: avatar" in custom
   and "avatarKey={thread.type === \"group\" ? thread.avatar_key : undefined}" in text("components/ChatPane.tsx"))
ok("群组头像写入 D1", "avatar_key=?" in worker_store_src
   and '"avatar_key"' in text("worker/index.ts"))
ok("个人头像写入 D1", "avatar_key=?" in worker_store_src)
ok("无 R2 也能自定义头像", "cfg.r2Enabled ?" in picker and "preset:" in picker)

new_cols = ["show_online", "read_receipts", "accent", "announcement_only", "members_can_invite"]
ok("新字段在新库 schema 中", all(c in schema_d1 for c in new_cols),
   str([c for c in new_cols if c not in schema_d1]))
ok("新字段在线上库自动补齐", all(c in migrate_d1 for c in new_cols),
   str([c for c in new_cols if c not in migrate_d1]))
ok("迁移标记升级到 v4", '"SCHEMA:v4"' in migrate_d1 and '"SCHEMA:v3"' not in migrate_d1
   and '"SCHEMA:v2"' not in migrate_d1)

wi = text("worker/index.ts")
ok("公告频道服务端拦截发言", "announcement_only === 1" in wi and "Only owner/admins can post" in wi)
ok("邀请权限服务端拦截", "members_can_invite === 0" in wi and "Only owner/admins can add members" in wi)
ok("已读回执服务端双向过滤", "COALESCE(u.read_receipts,1)=1" in wi
   and "me.read_receipts !== false" in wi)
ok("公告频道前端只读", "readOnly={!canPost}" in text("components/ChatPane.tsx")
   and "readOnly" in text("components/Composer.tsx"))
ok("群公告置顶条", "notice-bar" in text("components/ChatPane.tsx") and ".notice-bar" in css_all)

ok("自定义中心四大类", all(x in custom for x in ["ProfileCustomize", "GroupCustomize", "AppearancePrefs", "ToolsPrefs"]))
ok("外观自定义项齐全", all(x in prefs_mod for x in ["ACCENTS", "WALLPAPERS", "FONTS", "quickPhrases", "compact", "animations", "clock", "sendWithEnter", "notifications", "muteUntil"]))
ok("偏好即时应用到 DOM", "applyPrefs" in app_comp and "usePrefs.subscribe" in app_comp
   and "MotionConfig" in app_comp)
ok("强调色/壁纸/字号 CSS 已定义", all(x in css_all for x in
   ['[data-accent="rose"]', '[data-wallpaper="grid"]', '[data-font="large"]', ".no-motion"]))
ok("桌面通知闭环", "desktopNotify" in front_store and "data: { threadId }" in front_store
   and "notification.data" in text("public/sw.js") and 'get("thread")' in app_comp)
ok("快捷短语已接入输入框", "quickPhrases" in text("components/Composer.tsx")
   and "phrase-menu" in css_all)
ok("12/24 小时制生效", 'hour12: clock === "12h"' in text("lib/utils.ts")
   and "usePrefs((s) => s.clock)" in text("components/MessageBubble.tsx"))
ok("新增三语字典键", all(k in text("lib/i18n.ts") for k in ["quickPhrases", "readonly", "readonlyPh"]))
ok("自定义功能写进 README", "自定义中心" in text("README.md") or "Customize" in text("README.md"))


# ── 15. PWA 图标与网页 logo 一致 ─────────────────────────────────
import struct, zlib
def png_info(rel):
    raw = (ROOT / rel).read_bytes()
    assert raw[:8] == b"\x89PNG\r\n\x1a\n", "not png"
    w, h = struct.unpack(">II", raw[16:24])
    return w, h, raw

icon_sizes = {
    "public/icons/icon-192.png": (192, 192),
    "public/icons/icon-512.png": (512, 512),
    "public/icons/icon-maskable.png": (512, 512),
    "public/icons/apple-touch-icon.png": (180, 180),
    "public/icons/icon-badge.png": (96, 96),
}
ok("PWA 图标尺寸全部正确", all(png_info(k)[:2] == v for k, v in icon_sizes.items()),
   str({k: png_info(k)[:2] for k in icon_sizes}))
gen = text("scripts/gen-icons.mjs")
ok("图标由 logo.svg 渲染生成", 'readFileSync(path.join(root, "public", "logo.svg")' in gen
   and "icon-maskable.png" in gen and "icon-badge.png" in gen)
# 旧图标特征：粉色腮红。新图标绝不能出现
ok("maskable 保留安全区（四叶草 ≤ 66%）", "inner: 0.62" in gen and "0.82" in gen)
ok("badge 为白色镂空剪影", 'mask="url(#face)"' in gen and 'fill="#FFFFFF"' in gen)
man = text("public/manifest.webmanifest")
ok("manifest 引用全部图标", all(x in man for x in
   ["icon-192.png", "icon-512.png", "icon-maskable.png", "apple-touch-icon.png"])
   and '"purpose": "maskable"' in man)
lay = text("app/layout.tsx")
ok("HTML head 声明 PNG 图标", 'icons/icon-192.png' in lay and 'icons/icon-512.png' in lay
   and 'apple-touch-icon.png' in lay)
sw_src = text("public/sw.js")
ok("离线外壳预缓存全部图标", all(x in sw_src for x in
   ["icon-192.png", "icon-512.png", "icon-maskable.png", "apple-touch-icon.png", "icon-badge.png"])
   and 'schoolink-v4' in sw_src)
ok("通知 badge 指向剪影图标", 'badge: "/icons/icon-badge.png"' in text("lib/store.ts"))
ok("favicon 与 logo 同一套图形", "M84 100 L110 126 L84 152" in text("public/favicon.svg")
   and "M84 100 L110 126 L84 152" in text("public/logo.svg"))
ok("README 说明 PWA 图标", "PWA 图标" in text("README.md") and "npm run icons" in text("README.md"))


# ── 16. 班别学号登录 / 管理员加用户 / AI / PWA / 头像缩放 ────────────
wi2 = text("worker/index.ts")
ws2 = text("worker/store.ts")
pw2 = text("worker/password.ts")
login_ui = text("components/Login.tsx")
admin_ui = text("components/Admin.tsx")
ai_ui = text("components/AIAssistant.tsx")
ai_lib = text("lib/ai.ts")
guide = text("components/InstallGuide.tsx")
front_store2 = text("lib/store.ts")
picker2 = text("components/AvatarPicker.tsx")
css2 = text("app/globals.css")

ok("注册必须设密码（服务端）", '"/api/auth/register"' in wi2
   and "isStrongPassword(b.password)" in wi2 and "hashPassword(b.password)" in wi2)
ok("班别学号密码登录", '"/api/auth/login"' in wi2 and "verifyPassword(b.password" in wi2)
ok("验证码登录不再自动建号", "Email not registered" in wi2
   and "createUser(env, { email, student_id: body.student_id" not in wi2)
ok("绑定校园邮箱用独立 OTP scope", '"bind"' in wi2 and "RATE:BIND" in wi2
   and 'issueOtp(env, email, "bind")' in wi2)
ok("管理员可新增用户", '"/api/admin/panel/users/create"' in wi2
   and "adminCreateUser" in front_store2 and "user-console" in admin_ui)
ok("管理员策略：仅已绑定邮箱可登入", "requireBoundEmail" in ws2 and "requireBoundEmail" in wi2
   and "requireBoundEmail" in admin_ui)
ok("密码 PBKDF2 且不明文存储", "pbkdf2$" in pw2 and "deriveBits" in pw2
   and "timingSafeEqual" in pw2)
ok("班别学号归一化 6C+04", "loginKeyOf" in text("worker/auth.ts") and "normClass" in text("worker/auth.ts"))
ok("登录页三种入口齐全", all(x in login_ui for x in
   ["loginWithPassword", "register", "requestCode", "bindRequest", "enterChat"]))
ok("迁移补齐 v4 身份列", all(c in text("worker/migrate.ts") for c in
   ["class_name", "student_no", "login_key", "password_hash", "email_bound"]))
ok("旧库初始化不会因新列索引报错",
   "CREATE INDEX IF NOT EXISTS idx_users_login" not in text("schema.sql")
   and 'ALTER TABLE' in text("worker/migrate.ts")
   and 'CREATE INDEX IF NOT EXISTS idx_users_login ON users(login_key)' in text("worker/migrate.ts"))

ok("AI 闲置 1 分钟触发", "IDLE_MS" in ai_lib and "60_000" in ai_lib
   and "schoolink.ai.last" in ai_ui and "aiIdle" in ai_ui)
ok("AI 提示词按用户原话发送", "IDLE_PROMPT" in ai_lib and "内容是：聊天吗？" in ai_lib
   and "askAI(IDLE_PROMPT" in ai_ui)
ok("AI 服务端优先 Workers AI 且有兜底", '"/api/ai"' in wi2 and "env.AI" in wi2
   and "aiFallback" in wi2 and "RATE:AI" in wi2)
ok("AI 绑定已声明", '"ai"' in text("wrangler.jsonc") and "AI?:" in text("worker/env.d.ts")
   and 'ai: { binding: "AI" }' in text("scripts/provision.mjs"))
ok("REQUIRE_BOUND_EMAIL 全链路透传", all("REQUIRE_BOUND_EMAIL" in text(f) for f in
   ["scripts/provision.mjs", ".github/workflows/deploy.yml", "wrangler.jsonc", "worker/env.d.ts", "worker/store.ts"]))
ok("AI 面板已挂载", "AIAssistant" in text("components/App.tsx")
   and "setAiOpen" in text("components/Sidebar.tsx"))

ok("PWA 安装按钮不会死", "appinstalled" in front_store2 and "installGuide" in front_store2
   and "How to install" in text("components/ui.tsx") and "setInstallGuide" in guide
   and ("Add to Home Screen" in guide or "加入主屏幕" in guide))
ok("iOS Safari 走分享菜单指引", "Add to Home Screen" in guide or "加入主屏幕" in guide)
ok("头像图片显式限尺寸", "style={{ width: size, height: size }}" in picker2
   and ".av-visual.av-img" in css2 and "max-width:100%" in css2)
ok("自定义中心有绑定/安装/AI 开关", all(x in text("components/Customize.tsx") for x in
   ["bindRequest", "setPassword", "doInstall", "setInstallGuide", "aiIdle"]))


# ── 17. AI 模型可在设置里配置 ─────────────────────────────────────
wm = text("worker/ai-models.ts")
fm = text("lib/ai-models.ts")
wi3 = text("worker/index.ts")
ws3 = text("worker/store.ts")
ai3 = text("lib/ai.ts")
pr3 = text("lib/prefs.ts")
st3 = text("lib/store.ts")
ad3 = text("components/Admin.tsx")
cu3 = text("components/Customize.tsx")
as3 = text("components/AIAssistant.tsx")
cfg3 = text("app/globals.css")

wm_ids = re.findall(r'id:\s*"(@[^"]+)"', wm)
fm_ids = re.findall(r'id:\s*"(@[^"]+)"', fm)
ok("前后端 AI 模型预设 ID 完全一致", bool(wm_ids) and wm_ids == fm_ids,
   f"worker={wm_ids} front={fm_ids}")
ok("AI 模型 ID 有白名单校验", "export function isValidAiModel" in wm and "/^@[a-z0-9]" in wm
   and "import { AI_MODEL_PRESETS, DEFAULT_AI_MODEL, isValidAiModel }" in wi3
   and "isValidAiModel(requested)" in wi3 and "!isValidAiModel(patch.aiModel)" in wi3)
ok("全局 AI 模型进热配置", "aiModel" in ws3 and "aiAllowUserModel" in ws3
   and "aiModel: normalizeAiModel" in ws3 and "aiModel: patch.aiModel" in ws3)
ok("配置视图下发模型与预设", all(x in wi3 for x in
   ["aiModel: cfg.aiModel", "aiModels: AI_MODEL_PRESETS", "aiAllowUserModel: cfg.aiAllowUserModel"]))
ok("/api/ai 动态使用所选模型", "env.AI.run(model," in wi3 and "const model = cfg.aiAllowUserModel" in wi3
   and '@cf/meta/llama-3.1-8b-instruct", {' not in wi3)
ok("闲置问候响应带模型名", 'source: "direct", model' in wi3)
ok("管理员可测试模型", '"/api/admin/panel/test-ai"' in wi3 and "adminTestAI" in st3
   and "testAI" in ad3 and "ai-cfg-ok" in cfg3)
ok("非法模型 ID 在保存时被拒", wi3.count("Invalid model id") >= 2
   and "isValidAiModel(patch.aiModel)" in wi3)
ok("/admin 有模型下拉与自定义", "ai-cfg-select" in ad3 and "customOpen" in ad3
   and "AI_MODEL_PRESETS" in ad3 and "DEFAULT_AI_MODEL" in ad3)
ok("设置中心可为本机选模型", "p.patch(\"aiModel\"" in cu3 and "ai-model-box" in cu3
   and "aiModelLocked" in cu3 and "aiModel" in pr3)
ok("AI 助手真的把模型发给后端", "askAI(IDLE_PROMPT, [], useApp.getState().lang, model)" in as3
   and "lang, model)" in as3 and "ai-model-tag" in as3)
ok("AI 请求携带 model 字段", '...(model ? { model } : {})' in ai3
   and "model?: string" in ai3 and "model = """ in ai3)
ok("AI 模型部署变量全链路透传", all("AI_MODEL" in text(f) and "AI_ALLOW_USER_MODEL" in text(f)
   for f in ["scripts/provision.mjs", ".github/workflows/deploy.yml", "wrangler.jsonc", "worker/env.d.ts", "worker/store.ts"]))
ok("README 说明 AI 模型配置", "AI 模型" in text("README.md") and "AI_MODEL" in text("README.md"))


# ── 18. Material 3 design system ────────────────────────────────────
css3 = text("app/globals.css")
m3js = text("lib/m3.ts")
app3 = text("components/App.tsx")
ui3 = text("components/ui.tsx")
prefs3 = text("lib/prefs.ts")

roles = ["--md-primary", "--md-on-primary", "--md-primary-container", "--md-on-primary-container",
         "--md-secondary", "--md-on-secondary", "--md-secondary-container", "--md-on-secondary-container",
         "--md-tertiary", "--md-on-tertiary", "--md-tertiary-container", "--md-on-tertiary-container",
         "--md-surface", "--md-surface-container", "--md-surface-container-high",
         "--md-on-surface", "--md-on-surface-variant", "--md-outline", "--md-outline-variant",
         "--md-error", "--md-on-error", "--md-error-container", "--md-on-error-container",
         "--md-inverse-surface", "--md-inverse-on-surface", "--md-inverse-primary"]
ok("M3 色彩角色齐全", all(r + ":" in css3 for r in roles),
   str([r for r in roles if r + ":" not in css3]))
ok("深浅两套 tonal palette", ':root[data-theme="light"]' in css3
   and css3.count("--md-primary:") >= 2 and "color-scheme: dark" in css3 and "color-scheme: light" in css3)
ok("动态色由用户强调色派生", "--md-source: var(--user-accent" in css3
   and css3.count("color-mix(in srgb, var(--md-source)") >= 4
   and 'root.dataset.accent = p.accent' in prefs3)
ok("6 档 shape scale", all(f"--md-shape-{k}:" in css3 for k in ["xs", "s", "m", "l", "xl", "full"]))
ok("M3 state layer 四态", all(f"--md-state-{k}:" in css3 for k in ["hover", "focus", "pressed", "drag"])
   and "opacity:var(--md-state-hover)" in css3)
ok("M3 elevation 1–3", all(f"--md-elev-{k}:" in css3 for k in [1, 2, 3])
   and "box-shadow:var(--md-elev-1)" in css3)
ok("M3 motion easing + 时长", all(x in css3 for x in
   ["--md-ease-standard:", "--md-ease-emphasized:", "--md-ease-decelerate:", "--md-ease-accelerate:",
    "--md-dur-short1:", "--md-dur-medium2:", "--md-dur-long1:"])
   and "M3_MOTION" in m3js and "m3ViewTransition" in app3)
ok("M3 type scale", all(f"--md-type-{k}:" in css3 for k in
   ["display", "headline", "title", "title-sm", "body", "body-sm", "label", "label-sm"]))
ok("组件层映射关键 M3 组件", all(x in css3 for x in
   [".btn.primary {", ".m3-fab", ".m3-card-elevated", ".m3-card-outlined", ".m3-dialog",
    ".m3-snackbar", ".m3-nav-rail", ".m3-nav-item", ".m3-chip-selected", ".m3-linear-progress",
    ".m3-text-field", ".m3-btn-tonal", ".m3-btn-outlined", ".m3-btn-text"]))
ok("按钮/输入/开关/标签改 M3 形状", all(x in css3 for x in
   ["border-radius:var(--md-shape-full)", "border-radius:var(--md-shape-s)",
    "border-radius:var(--md-shape-xl)", "width:52px; height:32px"]))
ok("涟漪交互已挂载", "installM3Ripple()" in app3 and "m3-ripple-host" in m3js
   and ".m3-ripple {" in css3 and "@keyframes m3-ripple-in" in css3
   and "m3-ripple-clip" in css3)
ok("涟漪尊重关闭动画/减少动态效果", 'classList.contains("no-motion")' in m3js
   and "prefers-reduced-motion" in css3 and ".no-motion .m3-ripple" in css3)
ok("旧 token 别名保留（组件零改动）", all(x in css3 for x in
   ["--bg: var(--md-surface-dim)", "--surface: var(--md-surface-container-low)",
    "--accent: var(--md-primary)", "--text: var(--md-on-surface)", "--ease: var(--md-ease-emphasized)"]))
ok("M3 化不引入 emoji", not any(e in css3 + m3js + app3 + ui3 for e in ["🍀", "✅", "⚠️", "😀"]))
ok("原四叶草 logo 未改", 'xmlns="http://www.w3.org/2000/svg"' in text("public/logo.svg")
   and "clover" in text("public/logo.svg").lower() or "logo.svg" in text("public/manifest.webmanifest"))
ok("M3 深浅预览图齐全", (ROOT / "docs/preview-material3.png").stat().st_size > 40000
   and (ROOT / "docs/preview-material3-light.png").stat().st_size > 40000)
ok("PWA 主题色与 SW 随 M3 更新", '"theme_color": "#191823"' in text("public/manifest.webmanifest")
   and 'color: "#fdfbff"' in text("app/layout.tsx")
   and 'schoolink-v4' in text("public/sw.js")
   and "background:#191823" in text("public/offline.html"))
ok("README 说明 Material 3", "Material 3" in text("README.md") and "--md-primary" in text("README.md"))

# ── 汇总 ───────────────────────────────────────────────────────────
print(" Schoolink self-check\n")
for passed, name, detail in results:
    mark = "" if passed else ""
    print(f"  {mark} {name}" + (f"  — {detail}" if detail and not passed else ""))
failed = [r for r in results if not r[0]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
if failed:
    print("FAILED: " + ", ".join(r[1] for r in failed))
    sys.exit(1)
print("OK · 可以部署")
