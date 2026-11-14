# Schoolink · TypeScript + Next.js 16 · Cloudflare Workers

> 校园即时通讯工具。界面是 **Codex 的深色工作台 × WhatsApp 的气泡聊天**，中间有一只会眨眼、会微笑的四叶草，下面按时间显示 `早上好, 201A6000`。

v2 用 **TypeScript 全量重写**：前端 Next.js 16 静态导出 + React 19 + Motion，后端仍是单个 Cloudflare Worker，消息改成 **Durable Objects + WebSocket 真·即时推送**，可安装成 PWA。

---

## 一、架构

```
浏览器 (Next.js 16 / React 19 / TS / Motion / PWA)
   │  静态资源免费走 Workers Static Assets（边缘、零冷启动）
   │  /api/*  ──▶ Worker（TypeScript）
   │  /api/ws ──▶ Durable Object「RealtimeHub」WebSocket Hibernation
   ▼
┌──────────────────────────────────────────────────────┐
│ D1       账号、会话、消息、回应、星标（持久化）        │
│ KV       会话白名单、OTP、热配置、缓存、在线心跳       │
│ R2       图片 / 语音 / 文件（可选，不启用就整体降级）  │
│ DO       每个用户一个实时信箱，空闲可休眠，连接不断    │
└──────────────────────────────────────────────────────┘
```

**为什么 Next.js 用 `output: "export"`**：这是登录后的私有实时应用，所有数据都来自 API / WebSocket，SSR、ISR、Server Actions 没有意义，还会引入缓存一致性问题。静态导出后 `out/` 直接交给 Static Assets，只有 `/api/*` 和 `/admin` 进 Worker —— 边缘静态请求免费、无限量、无冷启动。`/admin` 由 Worker 重写到 `/index.html`（不重定向），彻底避开 trailing-slash 301 循环。

**为什么是「每用户一个 DO」而不是「每会话一个」**：后者在用户没打开某会话时收不到那个会话的新消息，还得再维护一条全局连接。单信箱模型客户端只保持 **1 条 WebSocket**，切会话不重连，Worker 把事件扇出到相关成员即可。客户端 WS 只能发 `ping`，所有内容变更都必须走 HTTP API 鉴权 + 写 D1 后才广播，伪造不了消息。

---

## 二、部署（填环境变量 → 点一下）

`Settings → Secrets and variables → Actions`

### Secrets（必填  / 可选）

| 名称 | 必填 | 说明 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` |  | 见下方一键创建链接 |
| `CLOUDFLARE_ACCOUNT_ID` |  | 建议放 **Variables**（`if` 判断需要它） |
| `SESSION_SECRET` |  | `openssl rand -hex 32`。**固定住**，改了会把所有人登出 |
| `ADMIN_PASSWORD` |  | `/admin` 登录密码。没填 workflow 会直接 fail |
| `RESEND_API_KEY` | 可选 | 邮件兜底；也可以部署后到 `/admin` 填 |
| `RESEND_FROM` | 可选 | 例如 `Schoolink <noreply@plkshs.edu.hk>` |

### Variables（都有默认值）

| 名称 | 默认 | 说明 |
|---|---|---|
| `ALLOWED_EMAIL_DOMAINS` | `@plkshs.edu.hk` | 逗号分隔可填多个 |
| `ADMIN_EMAILS` | 自动推导 | 逗号分隔 |
| `SCHOOL_NAME` | `保良局蕭漢森小學` | 验证码邮件里显示，可在 `/admin` 改 |
| `AI_MODEL` | `@cf/meta/llama-3.1-8b-instruct` | Workers AI 默认模型 ID；/admin 可热改 |
| `AI_ALLOW_USER_MODEL` | `1` | `0` = 全校统一模型，学生设置里不可自选 |
| `REQUIRE_BOUND_EMAIL` | `0` | 设为 `1` 强制绑定校园邮箱才能登入（也可在 /admin 勾） |
| `ENABLE_R2` | `true` | **`false` = 完全不调用 R2 API**，附件功能自动隐藏 |
| `R2_BUCKET_NAME` | `schoolink-images` | |
| `R2_PUBLIC_BASE_URL` | 空 | 自定义公网地址；留空走同源 `/api/file/*` 回源 |
| `CUSTOM_DOMAIN` | 空 | 例如 `chat.plkshs.edu.hk`（需该域名在 CF 上） |
| `ALLOW_DEV_OTP` | `0` | 仅本地开发用，生产保持 `0` |
| `WORKER_NAME` / `D1_DATABASE_NAME` / `KV_NAMESPACE_TITLE` | `schoolink*` | 资源命名 |

然后 **`Actions → Deploy Schoolink → Run workflow`**（或 push 到 main）。CI 会：

1. `npm ci`（Node 22 —— wrangler 4.161 要求 ≥22.12）
2. `scripts/provision.mjs`：**先 list 再 create**，已存在的 D1 / KV / R2 直接复用；`ENABLE_R2=false` 时完全不碰 R2；撞上 `already exists` 再 list 兜底，不算失败
3. 执行 `schema.sql` 建表（全部 `IF NOT EXISTS`，重跑安全）
4. `npm run build` → `out/`
5. `wrangler deploy` —— **Durable Object 由 migrations 自动建立，不需要 API 预建**
6. 写入 Worker Secrets

### Cloudflare API Token 一键创建链接

**完整版（含 R2）**
```
https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_r2%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=%2A&zoneId=all&name=Schoolink+Deploy+Token
```
不需要 R2 就从权限里去掉 `workers_r2`。创建时在 summary 页核对 6 项权限；有多个账号的话把 `accountId=*` 收窄到目标账号。

### 部署后第一件事

打开 **`/admin`** → 输入 `ADMIN_PASSWORD` → 填 **邮件 API Token** + **发件邮箱 From** → 点「发送测试」→ 保存。

这里填的是 **Resend 的 `re_...` Token**，和 GitHub 里那个 `CLOUDFLARE_API_TOKEN` 完全是两回事。配置写进 KV，即时生效、不用重新部署；Token 只回传掩码 `re_••••••••3f9a`。发件域名要先在 Resend 验证通过。

> `/admin` **不需要校园邮箱账号**，否则会死锁：没配邮件 → 收不到验证码 → 进不去后台 → 配不了邮件。

---

## 三、功能清单

### 登录：班别 + 学号（6C 04），旧账号照用验证码

**新用户**：`班别 6C` + `学号 04` + **必须设密码（≥6 位）** 即可注册，注册后跳到「绑定校园邮箱」步骤，可填 `201A0000@plkshs.edu.hk` 收 6 位验证码绑定 —— 绑定后别人就不能拿你的班别学号乱登，也能改用邮箱验证码登入。想晚点再绑，点「略过」即可，设置中心随时可补绑。

**现有用户**：什么都不用改，点「验证码登录」输校园邮箱 → 收码 → 直接进。旧 OTP 账号在 v4 迁移里自动视为「已绑定」。

**管理员**：`/admin` → 顶部「控制台」→ 填班别、学号，再填 *校园邮箱* 或 *初始密码*（至少一项）→ 新增用户；用户行可一键重设密码、停用/启用。还能勾「**只允许已绑定校园邮箱的账号登入**」（也可设 Variable `REQUIRE_BOUND_EMAIL=1`），开启后未绑定账号会被挡在门外，直到完成绑定。

密码用 **PBKDF2-SHA256 / 10 万次迭代 + 随机盐** 存 D1，绝不存明文，验证走恒定时间比较。班别学号会归一化成 `6C04` 作为唯一登录键（`6C` + `04`、`6c04` 都能登）。

### AI 助手：闲置 1 分钟自动弹出

静止满 60 秒（鼠标/键盘/触摸都算活动，切到后台不触发）→ 前端把原话发给 `/api/ai`：

```
AI助手，你现在要说一段话，内容是：聊天吗？
```

服务端优先跑 **Workers AI**（`AI` 绑定由 provision 自动写入，账户没开通会自动降级），指示式提示词直接回「聊天吗？」；普通聊天走 `@cf/meta/llama-3.1-8b-instruct`，再不行用本地兜底 —— **离线也不会点出空白**。气泡是 WhatsApp 风格，点「聊聊」展开对话面板，侧栏笑脸按钮可随时手动叫出来，设置中心可关掉自动弹出（3 分钟冷却防刷屏）。

### AI 模型：在设置里配置

**管理员（全局）**：`/admin` → 「AI 助手 · 模型」→ 从 6 个 Workers AI 文字模型里选（Llama 3.1 8B / 70B、Llama 3 8B、Mistral 7B、Qwen 14B、Gemma 7B），或自填 `@厂商/模型` ID → **测试这个模型**（直接调一次 `AI.run` 看回覆）→ 底部「储存设定」。存进 KV 热配置，**即时生效、不用重新部署**，也可用 Variables `AI_MODEL` 预设默认值。

**学生（本机）**：设置中心 → 「AI 助手」→ 模型下拉，可选「跟随学校默认」或任一预设，也能自填 ID；偏好存本机 localStorage，换设备不跟随。管理员可勾掉「允许学生自选模型」，关掉后全校统一用后台设的那个，设置里显示只读说明。

服务端只接受合法 Workers AI 模型 ID（`/^@[a-z0-9...]/.../`），非法 ID 保存时直接 400；学生自选也走同一白名单，不能塞 URL 或乱填。模型响应会回传 `model` 字段，AI 面板底部显示当前生效模型。账户没开通 Workers AI 时测试会回 503，但**设定照样保存**，助手自动用本地回覆兜底，不会空白。

> 闲置 1 分钟那句「聊天吗？」属于指示式提示词，为保证准时出现会直接回显；模型配置作用于展开后的对话面板。

### PWA 安装按钮：不再点了没反应

- Chrome / Edge：`beforeinstallprompt` 正常弹，`appinstalled` 自动收起横幅
- **iPad / iPhone Safari 不派发该事件**：横幅按钮改成「如何安装」，点开三步图文指引（分享 → 加入主屏幕 → 加入）
- 设置中心常驻「安装 / 查看步骤」与「手动安装说明」，按钮永远有反馈
- 已安装时显示「已经安装好了」，不会反复弹

### 头像自动缩小

上传的原图再大也不会撑爆弹窗：`AvatarVisual` 显式给 `width/height = size`，CSS 再兜底 `max-width/height:100% + object-fit:cover`，群组资料、自定义中心、侧栏、消息气泡统一生效。

### WhatsApp 该有的（都做了）

| | |
|---|---|
| 私聊 / 群组 / 全校广场（注册自动加入） | 文字、图片、语音、文件（≤20MB） |
| **即时送达**：DO + WebSocket，非轮询 | 断线指数退避重连（1s→30s） |
| 已读回执（蓝色 = 全部人已读） |  在线 / 最后上线 |
| ⌨ 正在输入指示 | ↩ 回复引用（点击跳到原消息） |
| ↪ 转发（带「已转发」标记） |  编辑（15 分钟内）/  删除 |
| SVG 贴纸表情回应（8 种，去重计数） |  星标消息 + 星标列表 |
| 置顶 /  静音 /  归档 |  未读数 + PWA 桌面角标 |
| 搜索消息（全局 / 当前会话，`⌘K`） |  图片灯箱、懒加载、下载 |
| 语音录制统一输出 **M4A**（波形动画 + 时长） |  文件卡片、群公告、群名/头像 |
| **可修改群组头像**（上传 / 内置徽章 / 自定义配色） | 群公告置顶条、群主题色、公告频道、邀请权限 |
| **自定义中心**：外观 / 输入 / 通知 / 快捷短语 |  个人头像、在线状态、已读回执 |
| 加成员 / 退群 |  日期分隔、会话预览、草稿 |

### 加分的

- **离线队列**：发送失败的消息存 localStorage，恢复网络自动重发；乐观 UI 先上屏
- **@提及**：群里打 `@` 自动联想成员
- **三语**：简体 / 繁體 / EN 全量切换，问候语跟着变（`早晨` / `Good morning`）
- **主题**：深 / 浅 / 跟随系统，用 View Transition 做平滑换肤
- **问候语**：`早上好, 201A6000`，按时段变化
- ** 四叶草**：原本的紫蓝渐变四叶草 + 白色 `>` 眨眼 + 微笑嘴，弹簧入场、浮动、定时眨眼
- **PWA**：可安装到桌面 / 主屏，独立窗口、离线外壳、桌面角标、快捷方式（新聊天 / 后台）、maskable 图标
- **管理员**：热改邮箱后缀 / 管理员 / 校名 / R2 地址、测试发信、查看统计、**停用账号并强制下线**、Token 掩码、密码限流（5 次锁 10 分钟）
- **安全**：HMAC 签名会话（HttpOnly + Secure + SameSite）、KV 白名单即时吊销、同源 Origin 校验、所有会话/消息接口校验 `thread_members`、R2 回源需登录、上传白名单 MIME、SVG 拒绝

###  动画（每一处都做了）

Motion 14 驱动：splash 进度条、四叶草弹簧入场/浮动/眨眼、视图切换淡入缩放、会话列表 stagger、筛选 chip 的 `layoutId` 滑动、气泡入场 + hover 抬升、未读徽章弹跳、消息菜单/表情面板 spring、弹窗 spring、回复条高度展开、波形录音、typing 三点、Toast、按钮 hover/tap、图片灯箱缩放、已读双勾渐显。

**尊重系统设置**：`prefers-reduced-motion: reduce` 时全部降级为瞬时。

### 图标系统：全站 SVG，不用 emoji

- 所有按钮、菜单、状态、文件类型、已读双勾、在线状态都是 `components/Icon.tsx` 里的内联 SVG（44 个图标，`currentColor` 跟随主题）。
- 表情 / 回应是 `lib/faces.ts` 里的彩色 SVG 贴纸：消息文本存 `:smile:` 这类短代码，渲染时替换为 SVG；旧数据里的 emoji 字符会自动映射，不会显示成空白。
- 验证码邮件标题也用内联 SVG 四叶草 + 文字，不含 emoji。
- `scripts/selfcheck.py` 会在部署前扫描界面源码，出现任何 emoji 字符直接 fail。

### PWA 图标：和网页同一颗四叶草

`public/icons/*` 全部由 **`public/logo.svg` 渲染**，不是另画一套：紫蓝渐变四叶草 + 白色 `>` 眨眼 + 上弯微笑嘴，深蓝紫品牌底，跟网页左上角、欢迎页、favicon 完全一致。

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `icon-192.png` / `icon-512.png` | 192 / 512 | manifest `any`，安装到主屏、桌面快捷方式 |
| `icon-maskable.png` | 512 | `maskable`：四叶草缩到 62%，完整落在 80% 安全圆内，背景满 bleed 不留透明边 |
| `apple-touch-icon.png` | 180 | iOS 主屏（不透明底，圆角交给系统） |
| `icon-badge.png` | 96 | 桌面通知角标：白色剪影 + 笑脸镂空、透明底 |

重新生成（改了 logo.svg 之后）：

```bash
npm run icons      # 需要本机 Chromium / Playwright，产物已提交，CI 不用跑
```

SW 缓存版本同步升到 `schoolink-v3`，安装过旧版的用户会拿到新外壳与新图标；离线外壳也会预缓存全部图标，断网打开仍是这颗四叶草。

### 自定义中心（点侧栏齿轮进入，四大类）

**群组（存 D1，全群同步，只有群主/管理员可改）**
- **群组头像**：上传图片（启用 R2 时）／12 枚内置 SVG 徽章／12 档渐变配色 + 群名首字；三种都能即时预览、一键重置。没开 R2 也完整可用。
- 群名称、群公告（会置顶在聊天上方，可折叠）、群主题色（6 色，影响头像光圈与公告条）
- **公告频道模式**：开启后只有群主/管理员能发言，其他成员输入框只读
- **成员邀请权限**：关闭后只有群主/管理员能加人（服务端同样校验，绕过前端也无效）
- 加成员 / 退群 / 成员列表

**个人资料（存 D1）**
- 个人头像（同三种来源）、显示名、关于
- 在线状态可见性（关闭后别人只看到「最后上线」）
- 已读回执开关（关闭后**双方**都看不到蓝色双勾；服务端在广播与读取时都过滤）

**外观（本机 localStorage，即时生效）**
- 主题深/浅/跟随系统、**6 套强调色**（按钮、气泡、选中态整套换色，浅色主题会自动加深保证对比度）
- **4 套聊天壁纸**（点阵 / 格纹 / 波纹 / 纯色）、**3 档字号**、紧凑模式
- 动画总开关（关闭后连 Motion 都走 `reducedMotion="always"`，系统「减少动态」也会自动降级）
- 12/24 小时制、语言（简 / 繁 / EN）

**效率与通知**
- **快捷短语**：自定义常用句（最多 24 条，支持「简 / 繁 / EN」三段写法，按当前语言只插入对应那段），输入框闪电按钮一键插入
- Enter 发送 / Ctrl(⌘)+Enter 发送切换
- 桌面通知（页面在后台且收到新消息时，经 Service Worker 弹出；点击直达该会话）
- 会话静音：1 小时 / 8 小时 / 1 天 / 永久，角标与通知同步
- 导出本机偏好 JSON

> 分界很清楚：**「我是谁、群是什么样」存服务器**（换设备仍在），**「我这部机怎么用」存本机**（离线可用、不占 D1 写入）。上述所有开关都有服务端或前端兜底，不会出现「界面显示关了但后端照发」的假开关。

### 语音：统一 M4A

`lib/m4a.ts` 用浏览器原生能力，**零第三方依赖、零 WASM、离线可用**：

1. 录音时优先申请 `audio/mp4;codecs=mp4a.40.2`（Safari / iOS 直接出 AAC），其次 `audio/mp4`（Chrome / Edge / Android 出 MP4 容器），webm 只作最后兜底。直出 M4A 时**不做二次编码**，没有音质损失、不需要等待。
2. 万一录到的是 webm/ogg，录完后会「解码成 PCM → 重新以 `audio/mp4` 编码」，仍然落盘为 `.m4a`；超过 30 秒的长语音跳过实时重录并明确提示。
3. 文件名一律 `voice-<时间戳>.m4a`，R2 里放在 `audio/年/月/`；Worker 会把 `audio/mp4;codecs=...` 归一化后查 MIME 白名单，但**响应头保留完整 codecs**，避免播放器把 Opus-in-MP4 误判成 AAC。
4. 气泡上直接标 `· M4A`，下载下来的也是 `.m4a`。

> 平台差异说明：Safari / iOS 拿到的是标准 AAC-LC；Chrome 由于不开放 AAC 编码器，MP4 容器里装的是 Opus（Chrome / Edge / Android 原生可播）。要做到全平台 AAC 只能引入 ~64 MB 的 ffmpeg.wasm，对校园 PWA 不合理，故未采用。不支持 MP4 录制的浏览器会保留原格式并在界面上明确提示，不会假装是 m4a。

### 没加的，以及为什么

- **端到端加密**：与服务端全文搜索、转发、管理员审计直接冲突；校园场景也需要可追溯。真要做应另起一套客户端密钥架构，不是「顺手加」。
- **语音/视频通话**：需要 WebRTC 信令 + TURN 中继，在 Workers 上成本与复杂度都不合理。
- **Stories / 24h 动态**：不是聊天核心，还要额外的存储与定时清理。
- **位置共享、支付、频道、AI 机器人**：校园工具用不上，徒增攻击面。
- **Web Push 离线推送**：目前是「在线即时 + 打开 App 后角标」，没做 VAPID 订阅；如果你们需要锁屏推送，这是一个独立的小迭代。

---

## 四、本地开发

需要 **Node ≥ 22.12**。

```bash
npm install
cp .dev.vars.example .dev.vars      # 填 SESSION_SECRET / ADMIN_PASSWORD
wrangler d1 create schoolink-db
wrangler kv namespace create schoolink-cache
# 把 ID 填进 wrangler.jsonc
wrangler d1 execute schoolink-db --local --file=schema.sql
npm run build          # 产出 out/
wrangler dev           # 会同时跑 Worker + 静态资源 + DO
```

`npm run typecheck` 分别检查前端（`tsconfig.json`）和 Worker（`worker/tsconfig.json`，用 `@cloudflare/workers-types`）。

---

## 五、排错

| 现象 | 原因 / 处理 |
|---|---|
| `KV PUT failed: 400 Invalid expiration_ttl of 55` | KV 的 `expirationTtl` 必须是整数秒且 **≥ 60**。所有带 TTL 的写入统一走 `worker/kv.ts` 的 `kvPut()` 自动 clamp；缓存设 60s，但写入时主动 `delete` 缓存，不会看到旧数据。见到这个错说明有旧版 Worker 在跑，重跑 Action。 |
| `/admin` 提示「太多重新導向」 | 旧版本把 `/admin` 重写到 `/admin.html` 又被 Assets 301 回来。v2 由 Worker 回传 `/index.html`，**不做重定向**，不会再出现。 |
| 后台登录后显示「未登入」 | KV 最终一致：登录响应已直接带上 config/stats，不需立刻二次验证；前端另有 401 延迟重试。 |
| `npm ci` 报 engine 警告 | 本地 Node 要 ≥22.12；CI 已固定 `node-version: 22`。 |
| R2 报 `already exists` 或权限错 | 先确认 Token 有 `Workers R2:Edit`；不需要附件就把 Variable `ENABLE_R2=false`，脚本会完全跳过 R2 API。 |
| 注册收不到验证码 | `/admin` 没配邮件服务；或发件域名未在 Resend 验证。先在后台点「发送测试」。 |
| 消息不即时 | 看顶部连接条：`connecting / reconnecting / offline`。WS 断线时前端有 15s 兜底同步，不会丢消息。 |

---

### 新账号收不到验证码？
绑定邮箱和登录验证码用的是 **不同 scope 的 OTP key**（`OTP:login:` / `OTP:bind:`），互不覆盖。请先确认 `/admin` 邮件 API Token 有效、发件域名已在 Resend 验证；未配置邮件时绑定步骤会直接给出 `/admin` 链接，点「略过」可先进聊天。

### 头像还是撑爆弹窗？
清一次浏览器缓存即可（SW 缓存已升到 `schoolink-v3`）；新版本对任何 `<img>` 头像都强制限尺寸。

### AI 测试回 503 / 模型没有回传内容？
503 表示这个 Cloudflare 账号没绑定或未开通 Workers AI —— 设定仍会保存，助手自动本地兜底。502 通常是模型 ID 在该账号不可用（例如 70B 需要付费额度），换回 `@cf/meta/llama-3.1-8b-instruct` 或到 Cloudflare AI → Models 确认可用名称。模型 ID 格式必须是 `@厂商/模型`，不接受 URL。

## 六、目录

```
app/                     Next.js App Router（layout / page / globals.css）
components/              App, Login, Admin, Chat, Sidebar, ChatPane,
                         MessageBubble, Composer, Modals, Logo, ui
lib/                     types.ts / i18n.ts / api.ts / utils.ts / store.ts (zustand)
worker/                  index.ts（路由）· store.ts（D1/KV）· auth.ts
                         chat-room.ts（DO）· kv.ts · util.ts · env.d.ts · tsconfig.json
public/                  manifest.webmanifest · sw.js · offline.html
                         logo.svg · favicon.svg · icons/*.png
schema.sql               D1 建表（幂等）
scripts/                 provision.mjs（CF 资源）· make-icons.py（PWA 图标）
.github/workflows/       deploy.yml
```

---

## 七、上线前建议

- **实时性**已解决（WebSocket + Hibernation）；若要锁屏推送补 Web Push（VAPID + D1 订阅表）。
- **KV 最终一致**：会话白名单/热配置在边缘可能有秒级延迟；需要严格即时吊销可把 session 表挪到 D1。
- **内容安全**：目前没有图片鉴黄、敏感词、举报与封禁消息接口（账号停用已有）；校园场景建议补审核。
- **备份**：D1 建议开 Time Travel / 定期 `wrangler d1 export`。
- 那个曾在对话里明文出现过的 GitHub Token **请立即撤销重建**，之后只放 GitHub Secrets。
