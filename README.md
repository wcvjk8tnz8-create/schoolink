# Schoolink 🍀

![Schoolink 预览](docs/preview.png)

一个部署在 **Cloudflare Workers** 上的校园聊天工具。界面是 **Codex 深色工作台 × WhatsApp 对话** 的混合体：左边 Codex 风格的分组会话列表，右边 WhatsApp 风格的聊天气泡；空态正中间是一朵会微笑的四叶草，下面按时间问候（例如 `早上好, 201A6000`）。支持 **简体中文 / 繁體中文 / English** 即时切换。

仓库：<https://github.com/wcvjk8tnz8-create/schoolink>

```
Workers + Static Assets  →  前端单页 + 全部 API（同一个域名，无需 Pages）
D1                       →  账号数据 + 聊天数据（users / threads / thread_members / messages）
KV                       →  缓存层：会话白名单、验证码、最近消息缓存、在线状态、管理员热配置
R2 (Workers 绑定)         →  图片对象；可选，关闭后图片功能自动降级
```

---

## 一、部署：填环境变量 → 跑一次 Action

整套部署已经做进 `.github/workflows/deploy.yml`。**不用在本地装 wrangler、不用手敲 create 命令**，D1 / KV / R2 和建表全部由 `scripts/provision.mjs` 在 CI 里自动完成。

### 1. 在 GitHub 填变量

`Settings → Secrets and variables → Actions`：

**Secrets**（2 个必填，2 个可选）

| 名称 | 必填 | 说明 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | ✅ | Cloudflare API Token，权限见下方 |
| `SESSION_SECRET` | ✅ | 一长串随机字符串（如 `openssl rand -hex 32`）。**必须固定**，否则每次部署都会把所有人登出 |
| `RESEND_API_KEY` | ⬜ | 不填则生产环境拿不到验证码，只能本地开发模式登录 |
| `RESEND_FROM` | ⬜ | 例 `Schoolink <noreply@your-domain.com>` |

**Variables**（都有默认值，按需覆盖）

| 名称 | 默认 | 说明 |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | — | **建议填**，填了之后 `push` 到 main 也会自动部署；不填只能手动触发 |
| `ALLOWED_EMAIL_DOMAINS` | `@plkshs.edu.hk` | 允许的校园邮箱后缀，逗号分隔 |
| `ADMIN_EMAILS` | 自动推导 | 管理员邮箱，逗号分隔 |
| `SCHOOL_NAME` | `Schoolink 校園` | 显示名称 |
| `ENABLE_R2` | `true` | **设成 `false` 就完全跳过 R2** |
| `R2_BUCKET_NAME` | `schoolink-images` | R2 bucket 名 |
| `R2_PUBLIC_BASE_URL` | 空 | R2 自定义域，例 `https://img.plkshs.edu.hk`；留空走 `/api/file` 同源回源 |
| `WORKER_NAME` | `schoolink` | Worker 名 |
| `D1_DATABASE_NAME` | `schoolink-db` | D1 库名 |
| `KV_NAMESPACE_TITLE` | `schoolink-cache` | KV 命名空间标题 |
| `ALLOW_DEV_OTP` | `0` | 生产保持 `0` |
| `CUSTOM_DOMAIN` | 空 | 例 `chat.plkshs.edu.hk`，填了会自动加自定义域路由 |

> 凭据只放 Secrets / Variables，**绝不写进代码或提交记录**。

**API Token 权限**（Cloudflare → My Profile → API Tokens → Create Custom Token）：
`Account · Workers Scripts: Edit`、`Account · D1: Edit`、`Account · Workers KV Storage: Edit`、`Account · Account Settings: Read`；
`ENABLE_R2=true` 再加 `Account · R2: Edit`；用了 `CUSTOM_DOMAIN` 再加 `Zone · Workers Routes: Edit`。

### 2. 跑 Action

`Actions → Deploy Schoolink → Run workflow`。流程依次是：

1. `scripts/provision.mjs` 调 Cloudflare API 幂等准备资源并**自动执行 `schema.sql` 建表**
2. 现场生成 `wrangler.jsonc`，回填真实的 D1 `database_id` / KV `id` 和所有 Variables
3. `wrangler deploy` 部署
4. 写入 Worker secrets（云端即时生效）

跑完在 job Summary 里能看到 Worker 名、D1 / KV / R2 状态和访问地址。

### 3. 关于 R2（重点）

`wrangler r2 bucket create` 遇到已存在的 bucket 会直接报错，让整个 Action 红灯。脚本这样处理：

- **先查再建**：D1 / KV / R2 一律先 list，存在就复用，**绝不重复 create**
- **竞态兜底**：万一 create 撞上 `already exists`，再 list 一次拿回资源继续，不算失败
- **`ENABLE_R2=false` 时完全不碰 R2 API**：不 list、不 create、不写 `r2_buckets` 绑定。这样没开通 R2、Token 没有 R2 权限、或单纯不想要图片功能，都不会失败
- R2 关闭后：前端自动隐藏上传按钮，上传 / 图片回源接口返回 503 友好提示，文字聊天、账号、群组、管理员配置一切正常

配了 R2 后想走自定义公网地址：Cloudflare Dashboard → R2 → bucket → Settings → Custom Domains 绑定域名，再把 `https://img.xxx` 填进 `R2_PUBLIC_BASE_URL` 重跑 Action（或者直接在网页 ⚙ 设置里改，即时生效）。

### 4. 部署完之后

- 首次登录用校园邮箱收验证码，自动建号并加入「校園廣場 / School Plaza」
- 管理员（在 `ADMIN_EMAILS` 里）进 ⚙ 设置改**邮箱后缀**、**R2 公网地址**、学校名 → 存进 KV，**不用重跑 Action、不用重新部署**
- 想换域名、换后缀默认值，改 Variables 再 Run workflow 一次即可

> `push` 到 main 也会自动部署，但没填 `CLOUDFLARE_ACCOUNT_ID` 时 job 会自动跳过，所以第一次推代码不会红灯；改 README 或 docs 不会触发部署。

---

## 二、本地开发（可选）

```bash
npm install
cp .dev.vars.example .dev.vars      # 把 ALLOW_DEV_OTP 设为 1
# 在 .dev.vars 里填 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
node scripts/provision.mjs          # 也可本地跑：自动建资源 + 生成配置 + 建表（作用于线上账号）
npm run dev                        # 或只跑本地模拟：npm run db:local && npm run dev
```

`wrangler.jsonc` 在仓库里只是模板（D1 / KV id 为占位符），CI 会覆写它但不会提交回去。

---

## 三、功能对照

| 需求 | 实现 |
|---|---|
| 管理员配置邮箱后缀 | ⚙ 设置里改 `允许的邮箱后缀`，写进 KV `CONFIG:app`，即时生效；Variables 只是初始兜底。注册/发码严格按 `@` 后缀匹配 |
| 图片走 R2 | `POST /api/upload` → `env.IMAGES.put()`，key 形如 `images/2026/11/<uuid>.png`，返回自定义域 URL；`GET /api/file/*` 兜底回源；R2 关闭则整体降级 |
| D1 + KV 分工 | 账号与聊天全部落 D1；KV 只做缓存 / 会话 / OTP / 在线心跳 / 热配置 |
| Codex × WhatsApp 界面 | 侧栏「置顶 / 私聊 / 群组」分组 + 筛选 chips + 底部状态条；右侧日期胶囊、气泡、双勾已读、壁纸水印、输入框 |
| 中间四叶草微笑 | `public/logo.svg`，紫→蓝渐变六圆叠成四叶草，白色 `>` 眨眼 + 上弯微笑嘴；带轻微浮动动画 |
| 按时间问候 | `早上好, 201A6000` / `早晨, 201A6000` / `Good morning, 201A6000`，学号取账号 `student_id` |
| 中英文切换 | 简 / 繁 / EN 三档，存 `localStorage`，全站文案即时重渲染 |

时段规则（浏览器本地时间）：

| 时间 | 简体 | 繁體 | English |
|---|---|---|---|
| 05:00–11:59 | 早上好 | 早晨 | Good morning |
| 12:00–17:59 | 下午好 | 午安 | Good afternoon |
| 18:00–22:59 | 晚上好 | 晚上好 | Good evening |
| 23:00–04:59 | 夜深了 | 夜深了 | Still up? |

---

## 四、登录流程

1. 输入校园邮箱 → `POST /api/auth/otp/request`：先校验后缀，再限流（55 秒一次），生成 6 位验证码存 KV（10 分钟）。
2. 有 `RESEND_API_KEY` 就走 Resend 发信；本地 `ALLOW_DEV_OTP=1` 时验证码直接回填；生产两者都没配会明确报错，不会静默放行。
3. `POST /api/auth/otp/verify` → 首次登录自动建号（学号 + 显示名），并加入默认群组。
4. 签发 HMAC-SHA256 会话 token（`HttpOnly / Secure / SameSite=Lax` Cookie，30 天），同时在 KV 存白名单，登出即失效。
5. 所有写接口校验同源 Origin；会话列表、消息接口都校验 `thread_members` 成员身份。

---

## 五、API 一览

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/config` | 公开配置（后缀、R2 地址、是否启用 R2、学校名） |
| POST | `/api/auth/otp/request` / `verify` | 验证码登录 |
| GET | `/api/me` · POST `/api/logout` | 当前用户 / 登出 |
| GET | `/api/users` · POST `/api/presence` | 同学列表 / 在线心跳 |
| GET/POST | `/api/threads` | 会话列表 / 发起私聊或建群 |
| GET/POST | `/api/threads/:id/messages` | 最近 80 条（KV 缓存 15s）/ 发消息；`?after=` 走 D1 增量 |
| POST | `/api/threads/:id/read` | 清未读 |
| POST | `/api/upload` | 图片写 R2，≤10MB（R2 关闭时 503） |
| GET | `/api/file/*` | 未配自定义域时的图片回源 |
| GET/POST | `/api/admin/config` | 管理员读取 / 热更新配置 + 数据量统计 |

前端每 2.5 秒增量拉消息、9 秒刷会话列表、30 秒报在线，不依赖 WebSocket 或 Durable Objects。

---

## 六、上线前建议

- **实时性**：现在是轮询。要真·推送可把消息接口换成 Durable Objects + WebSocket，前端逻辑不用动。
- **KV 最终一致性**：会话白名单与热配置在边缘可能有秒级延迟；如需严格即时吊销，把 session 表挪到 D1。
- **邮件**：生产必须配 `RESEND_API_KEY`，否则用户拿不到验证码。
- **内容安全**：目前没有图片鉴黄、敏感词、举报与封禁；校园场景建议补审核和管理员删除接口。
- **图片**：限制 10MB、只允许 png/jpg/webp/gif/avif/heic；SVG 被拒（防 XSS）。R2 对象设 immutable 强缓存，key 带 UUID 不会冲突。

---

## 七、目录

```
schoolink/
├─ .github/workflows/deploy.yml   # 填环境变量 → 自动建 D1/KV/R2 → 部署
├─ scripts/provision.mjs          # 幂等资源准备 + 建表 + 生成 wrangler 配置
├─ wrangler.jsonc                 # 本地开发模板（CI 会覆写）
├─ schema.sql                     # D1 建表（全 IF NOT EXISTS）
├─ docs/preview*.png              # 界面预览图
├─ src/index.js                   # 路由、鉴权、上传、管理员 API
├─ src/auth.js                    # HMAC 会话、Cookie、OTP、后缀校验
├─ src/store.js                   # D1 / KV 数据访问层
├─ public/index.html · style.css · app.js · logo.svg · favicon.svg
└─ .dev.vars.example
```
