/* Schoolink front-end · vanilla ES module, no build step */
const app = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
const toastEl = document.getElementById("toast");
const LANGS = ["zh-CN", "zh-HK", "en"];
const LOCALE = { "zh-CN": "zh-CN", "zh-HK": "zh-HK", en: "en-GB" };

/* ------------------------------------------------------------------ i18n */
const I18N = {
  "zh-CN": {
    brandTag: "CAMPUS", chats: "对话", newChatTitle: "发起对话", search: "搜索",
    fAll: "全部", fUnread: "未读", fFav: "收藏", fGroups: "群组",
    secPinned: "置顶", secDirect: "私聊", secGroup: "群组",
    settingsTitle: "设置", adminOnly: "仅管理员可修改校园配置", logout: "退出登录", language: "语言", account: "账号",
    loginSub: "使用校园邮箱，和同学安全地聊天。", email: "校园邮箱", emailPh: "you@plkshs.edu.hk",
    sendCode: "发送验证码", code: "验证码", codePh: "6 位数字", verify: "登录",
    name: "显示名称", namePh: "例如 陈小明", sid: "学号 / 班号", sidPh: "例如 201A6000",
    back: "返回", loginHint: "只允许 <b>{domains}</b> 校园邮箱。首次登录会自动创建账号。",
    codeSent: "验证码已发送，请查收邮箱", loginNeedEmail: "请输入校园邮箱",
    mailNotConfigured: "邮件服务尚未配置：注册验证码暂时无法发送。管理员请到 /admin 设置。", goAdmin: "管理后台",
    heroSub: "今天想聊点什么？", heroAsk: "输入消息，发送到校园广场…",
    composerPh: "输入消息…", chatOnline: "在线", chatOffline: "最近活跃",
    chatMembers: "{n} 位成员", noMessages: "还没有消息，打个招呼吧 👋",
    noThreads: "暂无对话，点右上角 + 开始", previewImage: "[图片]", you: "你", system: "系统",
    tabDirect: "私聊", tabGroup: "群组", userSearch: "搜索同学 / 学号", groupName: "群组名称",
    groupNamePh: "例如 201A6000 班群", selected: "已选 {n} 人", noUsers: "没有找到同学",
    create: "创建", cancel: "取消", close: "关闭",
    domains: "允许的邮箱后缀", domainsHint: "逗号分隔，例如 @plkshs.edu.hk, @student.plkshs.edu.hk。保存后立即生效，无需重新部署。",
    r2: "R2 自定义公网地址", r2Hint: "在 R2 控制台绑定自定义域后填入，例如 https://img.plkshs.edu.hk。留空则图片走 /api/file 同源回源。",
    school: "学校名称", save: "保存", saved: "已保存", stats: "数据概览",
    statUsers: "用户", statThreads: "会话", statMsgs: "消息",
    greetMorning: "早上好", greetAfternoon: "下午好", greetEvening: "晚上好", greetNight: "夜深了",
    today: "今天", yesterday: "昨天", uploading: "图片上传中…", uploadFail: "图片上传失败",
    needThread: "请先选择一个对话", groupCreated: "群组已创建", errPrefix: "出错了",
  },
  "zh-HK": {
    brandTag: "CAMPUS", chats: "對話", newChatTitle: "發起對話", search: "搜尋",
    fAll: "全部", fUnread: "未讀", fFav: "最愛", fGroups: "群組",
    secPinned: "釘選", secDirect: "私訊", secGroup: "群組",
    settingsTitle: "設定", adminOnly: "僅管理員可修改校園設定", logout: "登出", language: "語言", account: "帳號",
    loginSub: "使用校園電郵，和同學安全地聊天。", email: "校園電郵", emailPh: "you@plkshs.edu.hk",
    sendCode: "傳送驗證碼", code: "驗證碼", codePh: "6 位數字", verify: "登入",
    name: "顯示名稱", namePh: "例如 陳小明", sid: "學號 / 班號", sidPh: "例如 201A6000",
    back: "返回", loginHint: "只允許 <b>{domains}</b> 校園電郵。首次登入會自動建立帳號。",
    codeSent: "驗證碼已傳送，請查收電郵", loginNeedEmail: "請輸入校園電郵",
    mailNotConfigured: "電郵服務尚未設定：註冊驗證碼暫時無法傳送。管理員請到 /admin 設定。", goAdmin: "管理後台",
    heroSub: "今天想聊點什麼？", heroAsk: "輸入訊息，傳送到校園廣場…",
    composerPh: "輸入訊息…", chatOnline: "在線", chatOffline: "最近活躍",
    chatMembers: "{n} 位成員", noMessages: "還沒有訊息，打個招呼吧 👋",
    noThreads: "暫無對話，點右上角 + 開始", previewImage: "[圖片]", you: "你", system: "系統",
    tabDirect: "私訊", tabGroup: "群組", userSearch: "搜尋同學 / 學號", groupName: "群組名稱",
    groupNamePh: "例如 201A6000 班群", selected: "已選 {n} 人", noUsers: "找不到同學",
    create: "建立", cancel: "取消", close: "關閉",
    domains: "允許的電郵後綴", domainsHint: "逗號分隔，例如 @plkshs.edu.hk, @student.plkshs.edu.hk。儲存後即時生效，無須重新部署。",
    r2: "R2 自訂公開網址", r2Hint: "在 R2 控制台綁定自訂網域後填入，例如 https://img.plkshs.edu.hk。留空則圖片走 /api/file 同源回源。",
    school: "學校名稱", save: "儲存", saved: "已儲存", stats: "數據概覽",
    statUsers: "用戶", statThreads: "對話", statMsgs: "訊息",
    greetMorning: "早晨", greetAfternoon: "午安", greetEvening: "晚上好", greetNight: "夜深了",
    today: "今天", yesterday: "昨天", uploading: "圖片上載中…", uploadFail: "圖片上載失敗",
    needThread: "請先選擇一個對話", groupCreated: "群組已建立", errPrefix: "發生錯誤",
  },
  en: {
    brandTag: "CAMPUS", chats: "Chats", newChatTitle: "New chat", search: "Search",
    fAll: "All", fUnread: "Unread", fFav: "Favourites", fGroups: "Groups",
    secPinned: "Pinned", secDirect: "Direct", secGroup: "Groups",
    settingsTitle: "Settings", adminOnly: "Only admins can change campus settings", logout: "Sign out",
    language: "Language", account: "Account",
    loginSub: "Sign in with your campus email and chat safely with classmates.",
    email: "Campus email", emailPh: "you@plkshs.edu.hk", sendCode: "Send code",
    code: "Verification code", codePh: "6 digits", verify: "Sign in",
    name: "Display name", namePh: "e.g. Alex Chan", sid: "Student ID", sidPh: "e.g. 201A6000",
    back: "Back", loginHint: "Only <b>{domains}</b> campus emails are allowed. Your account is created on first sign-in.",
    codeSent: "Code sent — check your inbox", loginNeedEmail: "Enter your campus email",
    mailNotConfigured: "Mail service is not configured — sign-up codes cannot be sent yet. Admin: open /admin.",
    goAdmin: "Admin console",
    heroSub: "What would you like to talk about today?", heroAsk: "Write a message to the school plaza…",
    composerPh: "Write a message…", chatOnline: "online", chatOffline: "last seen recently",
    chatMembers: "{n} members", noMessages: "No messages yet — say hi 👋",
    noThreads: "No chats yet, tap + to start", previewImage: "[Image]", you: "You", system: "System",
    tabDirect: "Direct", tabGroup: "Group", userSearch: "Search name / student ID",
    groupName: "Group name", groupNamePh: "e.g. Class 201A6000", selected: "{n} selected",
    noUsers: "No classmates found", create: "Create", cancel: "Cancel", close: "Close",
    domains: "Allowed email suffixes",
    domainsHint: "Comma-separated, e.g. @plkshs.edu.hk, @student.plkshs.edu.hk. Takes effect instantly, no redeploy needed.",
    r2: "R2 custom public URL",
    r2Hint: "Bind a custom domain to the R2 bucket and paste it here, e.g. https://img.plkshs.edu.hk. Leave empty to serve images via /api/file.",
    school: "School name", save: "Save", saved: "Saved", stats: "Overview",
    statUsers: "Users", statThreads: "Chats", statMsgs: "Messages",
    greetMorning: "Good morning", greetAfternoon: "Good afternoon", greetEvening: "Good evening", greetNight: "Still up?",
    today: "Today", yesterday: "Yesterday", uploading: "Uploading image…", uploadFail: "Image upload failed",
    needThread: "Pick a chat first", groupCreated: "Group created", errPrefix: "Error",
  },
};
const langLabel = (l) => ({ "zh-CN": "简体", "zh-HK": "繁體", en: "EN" })[l];

/* ------------------------------------------------------------------ state */
function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem("schoolink.favs") || "[]")); }
  catch { return new Set(); }
}
const state = {
  lang: localStorage.getItem("schoolink.lang") || "zh-CN",
  me: null, isAdmin: false, r2Enabled: true,
  config: {
    domains: ["@plkshs.edu.hk"], r2PublicBaseUrl: "", schoolName: "Schoolink",
    mailConfigured: false, devOtp: false, adminPasswordSet: false,
  },
  threads: [], messages: [], activeId: null, users: [],
  favs: loadFavs(),
  filter: "all", search: "", draft: "", forceBottom: false,
  modal: null, lightboxSrc: "", newChatMode: "direct", userSearch: "", groupName: "",
  selectedUsers: new Set(),
  adminCfg: { domains: [], r2PublicBaseUrl: "", schoolName: "" }, stats: { users: 0, threads: 0, messages: 0 },
  cfgDomains: "", cfgR2: "", cfgSchool: "",
  login: { step: "email", email: "", code: "", student_id: "", display_name: "", devCode: "", error: "" },
};
let timers = [];
let toastTimer;

/* ------------------------------------------------------------------ helpers */
function t(key, vars = {}) {
  let s = (I18N[state.lang] || I18N["zh-CN"])[key] ?? I18N["zh-CN"][key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (sel, root = document) => root.querySelector(sel);

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...opts });
  let data = {};
  try { data = await res.json(); } catch { /* noop */ }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
function toast(msg, err = false) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className = err ? "show err" : "show";
  toastTimer = setTimeout(() => { toastEl.className = ""; }, 2800);
}
function setByPath(obj, path, val) {
  const parts = path.split(".");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = val;
}
function fmtTime(ts) {
  try { return new Intl.DateTimeFormat(LOCALE[state.lang], { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts)); }
  catch { return ""; }
}
function fmtDay(ts) {
  const d = new Date(ts), now = new Date(), y = new Date(Date.now() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, now)) return t("today");
  if (same(d, y)) return t("yesterday");
  return new Intl.DateTimeFormat(LOCALE[state.lang], { month: "long", day: "numeric" }).format(d);
}
const dayKey = (ts) => new Date(ts).toDateString();
function initials(name) {
  const s = String(name || "?").trim();
  if (/[\u3400-\u9fff]/.test(s)) return s.slice(-2);
  return s.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "?";
}
function hue(str) {
  // FNV-1a：相近的 id 也能拿到明显不同的色相
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 360;
}
function avatarHtml(name, id, online = false, small = false) {
  return `<div class="avatar ${small ? "sm" : ""}" style="--h:${hue(id || name)}">${esc(initials(name))}${online ? '<span class="dot"></span>' : ""}</div>`;
}
const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g,
  '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

function activeThread() { return state.threads.find((x) => x.id === state.activeId) || null; }
function peerOf(th) { return th?.members?.find((m) => m.id !== state.me.id) || null; }
function threadName(th) {
  if (!th) return "";
  if (th.type === "group") return th.name || t("fGroups");
  const p = peerOf(th);
  return p ? p.display_name : t("you");
}
function threadAvatar(th) {
  const p = peerOf(th);
  return th.type === "group"
    ? { name: th.name || "G", id: th.id, online: false }
    : { name: p?.display_name || "?", id: p?.id, online: Boolean(th.online) };
}
function greeting() {
  const h = new Date().getHours();
  const key = h < 5 ? "greetNight" : h < 12 ? "greetMorning" : h < 18 ? "greetAfternoon" : h < 23 ? "greetEvening" : "greetNight";
  return `${t(key)}, ${state.me?.student_id || ""}`;
}

/* ------------------------------------------------------------------ render */
function render() {
  document.documentElement.lang = state.lang;
  if (!state.me) { renderLogin(); return; }
  app.innerHTML = `<div class="shell ${state.activeId ? "has-active" : ""}">
    <aside class="sidebar" id="sidebar"></aside>
    <section class="main" id="main"></section>
  </div>`;
  renderSidebar();
  renderChat();
  renderModal();
}

function renderLogin() {
  const cfg = state.config || {};
  const domains = (cfg.domains || ["@plkshs.edu.hk"]).join(", ");
  const isEmail = state.login.step === "email";
  app.innerHTML = `<div class="login-screen"><div class="login-card">
    <img class="login-logo" src="/logo.svg" alt="Schoolink">
    <h1>Schoolink</h1>
    <p class="sub">${esc(t("loginSub"))}</p>
    ${!state.config.mailConfigured && !state.config.devOtp ? `
      <div class="login-hint" style="border-color:rgba(255,200,87,.28);background:rgba(255,200,87,.07);color:#f0d79a">
        ⚠ ${esc(t("mailNotConfigured"))}
        <a href="/admin" style="display:inline-block;margin-top:8px;color:#ffe6ab">→ ${esc(t("goAdmin"))}</a>
      </div>` : ""}
    ${isEmail ? `
      <div class="field"><label>${esc(t("email"))}</label>
        <input id="login-email" data-model="login.email" data-enter="request-code" value="${esc(state.login.email)}"
               placeholder="${esc(t("emailPh"))}" autocomplete="email" inputmode="email"></div>
      <button class="btn-primary" data-action="request-code">${esc(t("sendCode"))}</button>
    ` : `
      ${state.login.devCode ? `<div class="dev-code">${esc(state.login.devCode)}</div>` : ""}
      <div class="field"><label>${esc(t("code"))}</label>
        <input id="login-code" data-model="login.code" data-enter="verify" value="${esc(state.login.code)}"
               placeholder="${esc(t("codePh"))}" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
      <div class="field"><label>${esc(t("sid"))}</label>
        <input data-model="login.student_id" value="${esc(state.login.student_id)}" placeholder="${esc(t("sidPh"))}"></div>
      <div class="field"><label>${esc(t("name"))}</label>
        <input data-model="login.display_name" value="${esc(state.login.display_name)}" placeholder="${esc(t("namePh"))}"></div>
      <button class="btn-primary" data-action="verify-code">${esc(t("verify"))}</button>
      <button class="btn-ghost" data-action="login-back">${esc(t("back"))}</button>
    `}
    <p class="login-err">${esc(state.login.error || "")}</p>
    <div class="login-hint">${t("loginHint", { domains: esc(domains) })}</div>
    <div style="text-align:center;margin-top:16px">
      <button class="chip" data-action="cycle-lang">🌐 ${esc(t("language"))} · ${esc(langLabel(state.lang))}</button>
    </div>
  </div></div>`;
}

function renderSidebar() {
  const unread = state.threads.reduce((n, x) => n + (x.unread || 0), 0);
  const chip = (key, label, count) =>
    `<button class="chip ${state.filter === key ? "on" : ""}" data-action="set-filter" data-filter="${key}">${esc(label)}${count ? `<span class="n">${count}</span>` : ""}</button>`;
  $("#sidebar").innerHTML = `
    <div class="side-top">
      <div class="brand"><img src="/logo.svg" alt=""><strong>Schoolink</strong><span>${esc(t("brandTag"))}</span></div>
      <div class="side-title"><h2>${esc(t("chats"))}</h2>
        <button class="icon-btn" data-action="open-settings" title="${esc(t("settingsTitle"))}">⚙</button>
        <button class="icon-btn green" data-action="new-chat" title="${esc(t("newChatTitle"))}">+</button>
      </div>
    </div>
    <div class="side-search">🔍<input data-model="search" value="${esc(state.search)}" placeholder="${esc(t("search"))}"></div>
    <div class="chips">
      ${chip("all", t("fAll"))}${chip("unread", t("fUnread"), unread || 0)}
      ${chip("favs", t("fFav"))}${chip("groups", t("fGroups"))}
    </div>
    <div class="thread-list" id="thread-list"></div>
    <div class="side-foot">
      <span>${esc((state.config.schoolName || "Schoolink"))}</span>
      <span class="me">${avatarHtml(state.me.display_name, state.me.id)}${esc(state.me.student_id)}</span>
    </div>`;
  renderThreadList();
}

function renderThreadList() {
  const el = $("#thread-list");
  if (!el) return;
  const q = state.search.trim().toLowerCase();
  const list = state.threads.filter((th) => {
    if (state.filter === "unread" && !(th.unread > 0)) return false;
    if (state.filter === "favs" && !state.favs.has(th.id)) return false;
    if (state.filter === "groups" && th.type !== "group") return false;
    if (q && !threadName(th).toLowerCase().includes(q) && !String(th.last_body || "").toLowerCase().includes(q)) return false;
    return true;
  });
  const item = (th) => {
    const av = threadAvatar(th);
    const last = th.last_kind === "image" ? t("previewImage") : (th.last_body || t("noMessages"));
    return `<div class="thread-item ${th.id === state.activeId ? "active" : ""}" data-action="open-thread" data-id="${esc(th.id)}">
      ${avatarHtml(av.name, av.id, av.online)}
      <div class="thread-meta">
        <div class="row"><span class="name">${esc(threadName(th))}</span><span class="time">${th.last_at ? esc(fmtTime(th.last_at)) : ""}</span></div>
        <div class="row"><span class="preview">${esc(last)}</span>${th.unread > 0 ? `<span class="badge">${th.unread}</span>` : ""}</div>
      </div>
      <span class="star ${state.favs.has(th.id) ? "on" : ""}" data-action="toggle-fav" data-id="${esc(th.id)}" title="★">★</span>
    </div>`;
  };
  let html = "";
  if (state.filter === "all" && !q) {
    const pinned = list.filter((x) => state.favs.has(x.id));
    const direct = list.filter((x) => !state.favs.has(x.id) && x.type !== "group");
    const groups = list.filter((x) => !state.favs.has(x.id) && x.type === "group");
    const section = (label, arr) => arr.length
      ? `<div class="group-label">▸ ${esc(label)}</div>` + arr.map(item).join("") : "";
    html = section(t("secPinned"), pinned) + section(t("secDirect"), direct) + section(t("secGroup"), groups);
  } else {
    html = list.map(item).join("");
  }
  el.innerHTML = html || `<div class="empty">${esc(t("noThreads"))}</div>`;
}

function heroHtml() {
  return `<div class="hero">
    <img class="hero-logo" src="/logo.svg" alt="">
    <h1>${esc(greeting())}</h1>
    <p class="sub">${esc(t("heroSub"))}</p>
    <div class="hero-box">
      <span class="plus">＋</span>
      <input data-model="draft" data-enter="hero-send" value="${esc(state.draft)}" placeholder="${esc(t("heroAsk"))}">
      <button class="round-send" data-action="hero-send">↑</button>
    </div>
    <div class="hero-foot">
      <div class="tabs">${LANGS.map((l) =>
        `<button class="tab ${state.lang === l ? "on" : ""}" data-action="set-lang" data-lang="${l}">${esc(langLabel(l))}</button>`).join("")}</div>
      <div class="hero-id">${esc(state.me.email)}</div>
    </div>
  </div>`;
}

function renderChat() {
  const th = activeThread();
  const main = $("#main");
  if (!th) {
    main.innerHTML = `
      <div class="chat-head"><div class="who"><b>${esc(t("newChatTitle"))}</b><small>${esc(state.config.schoolName || "Schoolink")}</small></div>
        <div class="head-actions">
          <button class="icon-btn" data-action="cycle-lang" title="${esc(t("language"))}">🌐</button>
          <button class="icon-btn" data-action="open-settings">⚙</button>
        </div></div>
      <div class="chat-body">${heroHtml()}</div>`;
    return;
  }
  const av = threadAvatar(th);
  const subtitle = th.type === "group" ? t("chatMembers", { n: th.members.length }) : (th.online ? t("chatOnline") : t("chatOffline"));
  main.innerHTML = `
    <div class="chat-head">
      <button class="icon-btn back-btn" data-action="back">←</button>
      ${avatarHtml(av.name, av.id, av.online)}
      <div class="who"><b>${esc(threadName(th))}</b><small>${esc(subtitle)}</small></div>
      <div class="head-actions">
        <button class="icon-btn" data-action="cycle-lang" title="${esc(t("language"))}">🌐</button>
        <button class="icon-btn" data-action="open-settings">⚙</button>
      </div>
    </div>
    <div class="chat-body"><div id="message-list"></div></div>
    <div class="composer">
      ${state.r2Enabled ? '<button class="icon-btn" data-action="attach" title="📎">＋</button><input type="file" id="file-input" accept="image/*" hidden>' : ""}
      <textarea id="composer-input" data-model="draft" data-enter="send" rows="1"
        placeholder="${esc(t("composerPh"))}">${esc(state.draft)}</textarea>
      ${state.r2Enabled ? '<button class="icon-btn" data-action="attach" title="📷">▣</button>' : ""}
      <button class="send-btn" data-action="send" title="➤">↑</button>
    </div>`;
  renderMessageList();
}

function messageHtml(m) {
  if (m.kind === "system") return `<div class="system-msg"><span>${esc(m.body)}</span></div>`;
  const th = activeThread() || { members: [] };
  const mine = m.sender_id === state.me.id;
  const sender = th.members.find((x) => x.id === m.sender_id)
    || state.users.find((x) => x.id === m.sender_id)
    || { display_name: t("you"), id: m.sender_id };
  const content = m.kind === "image"
    ? `<img class="msg-img" src="${esc(m.body)}" alt="image" data-action="open-image" data-src="${esc(m.body)}">`
    : `<div class="msg-text">${linkify(esc(m.body))}</div>`;
  return `<div class="msg-row ${mine ? "mine" : ""}">
    ${mine ? "" : avatarHtml(sender.display_name, sender.id, false, true)}
    <div class="bubble">
      ${!mine && th.type === "group" ? `<div class="sender">${esc(sender.display_name)}</div>` : ""}
      ${content}
      <div class="msg-foot"><span>${esc(fmtTime(m.created_at))}</span>${mine ? '<span class="ticks">✓✓</span>' : ""}</div>
    </div>
  </div>`;
}
function buildMessagesHtml(messages) {
  if (!messages.length) return `<div class="empty">${esc(t("noMessages"))}</div>`;
  let html = "", last = "";
  for (const m of messages) {
    const dk = dayKey(m.created_at);
    if (dk !== last) { html += `<div class="day-sep"><span>${esc(fmtDay(m.created_at))}</span></div>`; last = dk; }
    html += messageHtml(m);
  }
  return html;
}
function renderMessageList() {
  const el = $("#message-list");
  if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
  el.innerHTML = buildMessagesHtml(state.messages);
  if (nearBottom || state.forceBottom) {
    // 图片加载会撑高内容，所以补一帧 + 监听 img load 再贴底一次
    const toBottom = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 180) el.scrollTop = el.scrollHeight;
    };
    toBottom();
    requestAnimationFrame(toBottom);
    el.querySelectorAll(".msg-img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", toBottom, { once: true });
    });
    state.forceBottom = false;
  }
}

/* ------------------------------------------------------------------ modals */
function renderModal() {
  if (!state.modal) { modalRoot.innerHTML = ""; return; }
  if (state.modal === "lightbox") {
    modalRoot.innerHTML = `<div class="lightbox"><img src="${esc(state.lightboxSrc)}" alt="" data-action="close-modal"></div>`;
    return;
  }
  if (state.modal === "new-chat") {
    const group = state.newChatMode === "group";
    modalRoot.innerHTML = `<div class="overlay"><div class="modal">
      <div class="modal-head"><h3>${esc(t("newChatTitle"))}</h3><button class="icon-btn" data-action="close-modal">✕</button></div>
      <div class="modal-body">
        <div class="modal-tabs">
          <button class="chip ${!group ? "on" : ""}" data-action="nc-mode" data-mode="direct">${esc(t("tabDirect"))}</button>
          <button class="chip ${group ? "on" : ""}" data-action="nc-mode" data-mode="group">${esc(t("tabGroup"))}</button>
        </div>
        ${group ? `<div class="field"><label>${esc(t("groupName"))}</label>
          <input data-model="groupName" value="${esc(state.groupName)}" placeholder="${esc(t("groupNamePh"))}"></div>` : ""}
        <div class="side-search" style="margin:0 0 12px">🔍<input data-model="userSearch" value="${esc(state.userSearch)}" placeholder="${esc(t("userSearch"))}"></div>
        <div class="user-list" id="user-list"></div>
        ${group ? `<p id="nc-count" style="font-size:12px;color:var(--muted);margin:10px 0 0">${esc(t("selected", { n: state.selectedUsers.size }))}</p>` : ""}
      </div>
      <div class="modal-foot">
        <button class="btn" data-action="close-modal">${esc(t("cancel"))}</button>
        ${group ? `<button class="btn primary" data-action="nc-create">${esc(t("create"))}</button>` : ""}
      </div>
    </div></div>`;
    renderUserList();
    return;
  }
  if (state.modal === "settings") {
    const a = state.isAdmin;
    modalRoot.innerHTML = `<div class="overlay"><div class="modal">
      <div class="modal-head"><h3>${esc(t("settingsTitle"))}</h3><button class="icon-btn" data-action="close-modal">✕</button></div>
      <div class="modal-body">
        ${a ? `
          <div class="field"><label>${esc(t("domains"))}</label>
            <input data-model="cfgDomains" value="${esc(state.cfgDomains)}" placeholder="@plkshs.edu.hk"></div>
          <p class="login-hint" style="margin:-4px 0 16px">${esc(t("domainsHint"))}</p>
          <div class="field"><label>${esc(t("r2"))}</label>
            <input data-model="cfgR2" value="${esc(state.cfgR2)}" placeholder="https://img.plkshs.edu.hk"></div>
          <p class="login-hint" style="margin:-4px 0 16px">${esc(t("r2Hint"))}</p>
          <div class="field"><label>${esc(t("school"))}</label>
            <input data-model="cfgSchool" value="${esc(state.cfgSchool)}"></div>
        ` : `<p class="login-hint" style="margin:0 0 16px">${esc(t("adminOnly"))}</p>`}
        <div class="field" style="margin-top:18px"><label>${esc(t("language"))}</label>
          <div class="tabs" style="width:max-content">${LANGS.map((l) =>
            `<button class="tab ${state.lang === l ? "on" : ""}" data-action="set-lang" data-lang="${l}">${esc(langLabel(l))}</button>`).join("")}</div>
        </div>
        <div class="field"><label>${esc(t("account"))}</label>
          <div style="font-size:13px;color:var(--muted);line-height:1.7">
            ${esc(state.me.display_name)} · ${esc(state.me.student_id)}<br>${esc(state.me.email)} · ${esc(state.me.role)}
          </div></div>
        ${a ? `<div class="stats">
          <div class="stat"><b>${state.stats.users}</b><small>${esc(t("statUsers"))}</small></div>
          <div class="stat"><b>${state.stats.threads}</b><small>${esc(t("statThreads"))}</small></div>
          <div class="stat"><b>${state.stats.messages}</b><small>${esc(t("statMsgs"))}</small></div>
        </div>` : ""}
      </div>
      <div class="modal-foot">
        <button class="btn" data-action="logout">${esc(t("logout"))}</button>
        ${a ? `<button class="btn primary" data-action="save-settings">${esc(t("save"))}</button>` : ""}
      </div>
    </div></div>`;
  }
}
function renderUserList() {
  const el = $("#user-list");
  if (!el) return;
  const q = state.userSearch.trim().toLowerCase();
  const list = state.users.filter((u) => !q
    || u.display_name.toLowerCase().includes(q)
    || String(u.student_id).toLowerCase().includes(q)
    || u.email.toLowerCase().includes(q));
  el.innerHTML = list.length ? list.map((u) => {
    const sel = state.selectedUsers.has(u.id);
    return `<div class="user-row" data-action="nc-pick" data-id="${esc(u.id)}">
      ${avatarHtml(u.display_name, u.id, false, true)}
      <div class="u"><b>${esc(u.display_name)}</b><small>${esc(u.student_id)} · ${esc(u.email)}</small></div>
      ${state.newChatMode === "group"
        ? `<span class="check ${sel ? "on" : ""}">${sel ? "✓" : ""}</span>`
        : '<span style="color:var(--muted)">›</span>'}
    </div>`;
  }).join("") : `<div class="empty">${esc(t("noUsers"))}</div>`;
}
function closeModal() { state.modal = null; renderModal(); }

/* ------------------------------------------------------------------ actions */
async function refreshThreads() {
  try { state.threads = (await api("/api/threads")).threads; renderThreadList(); } catch { /* noop */ }
}
async function loadUsers() {
  try { state.users = (await api("/api/users")).users; } catch { /* noop */ }
}
async function selectThread(id) {
  state.activeId = id; state.messages = []; state.draft = ""; state.forceBottom = true;
  render();
  try {
    const res = await api(`/api/threads/${id}/messages`);
    if (state.activeId !== id) return;
    state.messages = res.messages;
    state.forceBottom = true; // 消息到位后再滚一次，确保停在最新一条
    renderMessageList();
    api(`/api/threads/${id}/read`, { method: "POST" }).catch(() => {});
    refreshThreads();
  } catch (e) { toast(e.message, true); }
}
async function postMessage(body) {
  const id = state.activeId;
  if (!id) return;
  try {
    const res = await api(`/api/threads/${id}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (state.activeId !== id) return;
    if (!state.messages.some((m) => m.id === res.message.id)) state.messages.push(res.message);
    state.forceBottom = true;
    renderChat();
    refreshThreads();
  } catch (e) { toast(e.message, true); }
}
async function sendDraft() {
  const text = state.draft.trim();
  if (!text || !state.activeId) return;
  state.draft = "";
  await postMessage({ kind: "text", body: text });
}
async function heroSend() {
  const text = state.draft.trim();
  if (!text) return;
  let th = state.threads.find((x) => Number(x.is_default) === 1);
  if (!th) { await refreshThreads(); th = state.threads.find((x) => Number(x.is_default) === 1); }
  if (!th) { toast(t("needThread"), true); return; }
  await selectThread(th.id);
  state.draft = text;
  await sendDraft();
}
async function uploadFile(file) {
  if (!file) return;
  if (!state.activeId) { toast(t("needThread"), true); return; }
  toast(t("uploading"));
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api("/api/upload", { method: "POST", body: fd });
    await postMessage({ kind: "image", body: res.url, image_key: res.key });
  } catch (e) { toast(e.message, true); }
  const fi = $("#file-input");
  if (fi) fi.value = "";
}
async function openNewChat() {
  state.modal = "new-chat"; state.newChatMode = "direct"; state.userSearch = "";
  state.groupName = ""; state.selectedUsers = new Set();
  await loadUsers();
  renderModal();
}
async function openSettings() {
  state.modal = "settings";
  if (state.isAdmin) {
    try {
      const r = await api("/api/admin/config");
      state.adminCfg = r.config; state.stats = r.stats;
      state.cfgDomains = r.config.domains.join(", ");
      state.cfgR2 = r.config.r2PublicBaseUrl || "";
      state.cfgSchool = r.config.schoolName || "";
    } catch (e) { toast(e.message, true); }
  }
  renderModal();
}
async function saveSettings() {
  const domains = state.cfgDomains.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  try {
    const r = await api("/api/admin/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domains, r2PublicBaseUrl: state.cfgR2, schoolName: state.cfgSchool }),
    });
    state.adminCfg = r.config;
    state.config = { ...state.config, ...r.config };
    closeModal(); toast(t("saved"));
  } catch (e) { toast(e.message, true); }
}
async function createDirect(id) {
  try {
    const r = await api("/api/threads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "direct", memberIds: [id] }),
    });
    closeModal(); await refreshThreads(); await selectThread(r.id);
  } catch (e) { toast(e.message, true); }
}
async function createGroup() {
  try {
    const r = await api("/api/threads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "group", name: state.groupName, memberIds: [...state.selectedUsers] }),
    });
    closeModal(); await refreshThreads(); await selectThread(r.id); toast(t("groupCreated"));
  } catch (e) { toast(e.message, true); }
}
function pickUser(id) {
  if (state.newChatMode === "group") {
    state.selectedUsers.has(id) ? state.selectedUsers.delete(id) : state.selectedUsers.add(id);
    renderUserList();
    const c = $("#nc-count");
    if (c) c.textContent = t("selected", { n: state.selectedUsers.size });
  } else createDirect(id);
}
function setLang(l) {
  if (!LANGS.includes(l)) return;
  state.lang = l;
  localStorage.setItem("schoolink.lang", l);
  render();
}
function cycleLang() { setLang(LANGS[(LANGS.indexOf(state.lang) + 1) % LANGS.length]); }
function toggleFav(id) {
  state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
  localStorage.setItem("schoolink.favs", JSON.stringify([...state.favs]));
  renderThreadList();
}
async function requestCode() {
  state.login.error = "";
  const email = state.login.email.trim();
  if (!email) { state.login.error = t("loginNeedEmail"); render(); return; }
  try {
    const r = await api("/api/auth/otp/request", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    });
    state.login.step = "code";
    state.login.email = email.toLowerCase();
    state.login.devCode = r.code || "";
    if (r.code) state.login.code = r.code;
    state.login.error = r.delivery === "email" ? t("codeSent") : "";
    render();
  } catch (e) { state.login.error = e.message; render(); }
}
async function verifyCode() {
  state.login.error = "";
  try {
    const r = await api("/api/auth/otp/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: state.login.email, code: state.login.code,
        student_id: state.login.student_id, display_name: state.login.display_name,
      }),
    });
    state.me = r.user;
    state.login = { step: "email", email: "", code: "", student_id: "", display_name: "", devCode: "", error: "" };
    await afterLogin();
  } catch (e) { state.login.error = e.message; render(); }
}
async function logout() {
  try { await api("/api/logout", { method: "POST" }); } catch { /* noop */ }
  clearTimers(); state.me = null; state.activeId = null; state.modal = null;
  render();
}
async function pollMessages() {
  const id = state.activeId;
  if (!id) return;
  try {
    const after = state.messages.length ? Math.max(...state.messages.map((m) => m.created_at)) - 1 : 0;
    const r = await api(`/api/threads/${id}/messages?after=${after}`);
    if (state.activeId !== id) return;
    const seen = new Set(state.messages.map((m) => m.id));
    const fresh = r.messages.filter((m) => !seen.has(m.id));
    if (fresh.length) {
      state.messages.push(...fresh);
      renderMessageList();
      api(`/api/threads/${id}/read`, { method: "POST" }).catch(() => {});
    }
  } catch { /* noop */ }
}
function clearTimers() { timers.forEach(clearInterval); timers = []; }
function startTimers() {
  clearTimers();
  timers = [
    setInterval(pollMessages, 2500),
    setInterval(refreshThreads, 9000),
    setInterval(() => api("/api/presence", { method: "POST" }).catch(() => {}), 30000),
  ];
}
async function afterLogin() {
  try {
    const r = await api("/api/me");
    state.isAdmin = r.isAdmin;
    if (typeof r.r2Enabled === "boolean") state.r2Enabled = r.r2Enabled;
    state.config = { ...state.config, ...r.config };
  } catch { /* noop */ }
  await Promise.all([refreshThreads(), loadUsers()]);
  api("/api/presence", { method: "POST" }).catch(() => {});
  startTimers();
  render();
}
async function init() {
  try {
    const c = (await api("/api/config")).config;
    state.config = { ...state.config, ...c };
    if (typeof c.r2Enabled === "boolean") state.r2Enabled = c.r2Enabled;
  } catch { /* noop */ }
  try {
    const r = await api("/api/me");
    state.me = r.user;
    state.isAdmin = r.isAdmin;
    if (typeof r.r2Enabled === "boolean") state.r2Enabled = r.r2Enabled;
    state.config = { ...state.config, ...r.config };
    await afterLogin();
  } catch { render(); }
}

/* ------------------------------------------------------------------ events */
document.addEventListener("click", (e) => {
  if (e.target.classList?.contains("overlay") || e.target.classList?.contains("lightbox")) { closeModal(); return; }
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  switch (a) {
    case "cycle-lang": cycleLang(); break;
    case "set-lang": setLang(el.dataset.lang); break;
    case "request-code": requestCode(); break;
    case "verify-code": verifyCode(); break;
    case "login-back": state.login.step = "email"; state.login.error = ""; render(); break;
    case "new-chat": openNewChat(); break;
    case "open-settings": openSettings(); break;
    case "logout": logout(); break;
    case "set-filter": state.filter = el.dataset.filter; render(); break;
    case "toggle-fav": toggleFav(el.dataset.id); break;
    case "open-thread": selectThread(el.dataset.id); break;
    case "back": state.activeId = null; state.draft = ""; render(); break;
    case "send": sendDraft(); break;
    case "hero-send": heroSend(); break;
    case "attach": $("#file-input")?.click(); break;
    case "open-image": state.lightboxSrc = el.dataset.src; state.modal = "lightbox"; renderModal(); break;
    case "close-modal": closeModal(); break;
    case "nc-mode": state.newChatMode = el.dataset.mode; state.selectedUsers = new Set(); renderModal(); break;
    case "nc-pick": pickUser(el.dataset.id); break;
    case "nc-create": createGroup(); break;
    case "save-settings": saveSettings(); break;
    default: break;
  }
});
document.addEventListener("input", (e) => {
  const el = e.target;
  const model = el.dataset?.model;
  if (!model) return;
  setByPath(state, model, el.value);
  if (model === "search") renderThreadList();
  if (model === "userSearch") renderUserList();
  if (el.tagName === "TEXTAREA") {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeModal(); return; }
  if (e.key === "Enter" && !e.shiftKey && e.target.dataset?.enter) {
    e.preventDefault();
    const a = e.target.dataset.enter;
    if (a === "send") sendDraft();
    else if (a === "hero-send") heroSend();
    else if (a === "verify") verifyCode();
    else if (a === "request-code") requestCode();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "file-input") uploadFile(e.target.files?.[0]);
});

init();
