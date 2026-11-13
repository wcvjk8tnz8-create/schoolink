/* Schoolink Admin Console · /admin · 独立于校园邮箱登录 */
const root = document.getElementById("admin-root");
const toastEl = document.getElementById("toast");
const LANGS = ["zh-CN", "zh-HK", "en"];
const LABEL = { "zh-CN": "简体", "zh-HK": "繁體", en: "EN" };

const I18N = {
  "zh-CN": {
    console: "管理后台", tag: "ADMIN CONSOLE", loginSub: "用 ADMIN_PASSWORD 进入，配置注册验证码邮件。",
    adminPwHint: "这里填的就是 GitHub Secret「ADMIN_PASSWORD」的值，不需要校园邮箱账号，也不用收验证码。",
    password: "管理员密码", passwordPh: "输入 ADMIN_PASSWORD", signIn: "进入后台", signOut: "退出",
    openChat: "返回聊天", wrong: "密码错误或未登录", noPw: "尚未设置 ADMIN_PASSWORD：请到 GitHub Secrets 新增后重跑 Action，本地则写进 .dev.vars。",
    pwNote: "密码只存在 Cloudflare Secret，不会写进仓库或返回给浏览器。",
    secMail: "邮件服务 · 注册验证码", secMailDesc: "填入邮件 API Token 与发件邮箱后，注册 / 登录就会真正发送 6 位验证码。配置即时生效，无需重新部署。",
    mailToken: "邮件 API Token", leaveBlank: "留空 = 不修改", tokenPh: "re_xxxxxxxx  （粘贴新 Token 以替换）",
    current: "当前", clear: "清除", clearHint: "清除后回退到 Worker Secret（若已设置）",
    mailFrom: "发件邮箱 / From", fromPh: "Schoolink <noreply@your-domain.com>",
    mailApiBase: "邮件 API 地址", baseHint: "高级 · 默认 Resend", basePh: "https://api.resend.com",
    testTitle: "发送测试邮件", testDesc: "用当前配置寄一封测试信，确认 Token 和发件域名可用。",
    testPh: "收件邮箱", sendTest: "发送测试", testOk: "测试邮件已寄出，请查收", testNeed: "请先填写收件邮箱",
    secCampus: "校园与存储", secCampusDesc: "邮箱后缀、管理员、显示名称与 R2 图片公网地址，全部即时生效。",
    domains: "允许的邮箱后缀", adminEmails: "管理员邮箱", schoolName: "学校名称", r2Url: "R2 自定义公网地址",
    save: "保存设置", saved: "已保存，立即生效", saveFail: "保存失败",
    note: "配置存放在 Cloudflare KV，管理员在网页修改后无需重跑 Action。邮件 Token 在 Cloudflare 账号内可见；若要最高保密，改用 GitHub Secret RESEND_API_KEY 并在这里清除。",
    stMail: "邮件服务", stOtp: "注册验证码", stR2: "R2 图片", stPw: "后台密码",
    fromPanel: "网页后台", fromSecret: "Worker Secret", notSet: "未配置", ready: "可发送", devOnly: "仅本地开发",
    blocked: "未开放", enabled: "已启用", disabled: "已停用", set: "已设置",
    users: "用户", threads: "会话", msgs: "消息", needToken: "请先填写邮件 API Token 或发件邮箱",
  },
  "zh-HK": {
    console: "管理後台", tag: "ADMIN CONSOLE", loginSub: "用 ADMIN_PASSWORD 進入，設定註冊驗證碼電郵。",
    adminPwHint: "這裏填的就是 GitHub Secret「ADMIN_PASSWORD」的值，不需要校園電郵帳號，也不用收驗證碼。",
    password: "管理員密碼", passwordPh: "輸入 ADMIN_PASSWORD", signIn: "進入後台", signOut: "登出",
    openChat: "返回聊天", wrong: "密碼錯誤或未登入", noPw: "尚未設定 ADMIN_PASSWORD：請到 GitHub Secrets 新增後重跑 Action，本地則寫進 .dev.vars。",
    pwNote: "密碼只存在 Cloudflare Secret，不會寫進倉庫或返回給瀏覽器。",
    secMail: "電郵服務 · 註冊驗證碼", secMailDesc: "填入電郵 API Token 與發件電郵後，註冊 / 登入就會真正傳送 6 位驗證碼。設定即時生效，無須重新部署。",
    mailToken: "電郵 API Token", leaveBlank: "留空 = 不修改", tokenPh: "re_xxxxxxxx  （貼上新 Token 以取代）",
    current: "目前", clear: "清除", clearHint: "清除後回退到 Worker Secret（如已設定）",
    mailFrom: "發件電郵 / From", fromPh: "Schoolink <noreply@your-domain.com>",
    mailApiBase: "電郵 API 地址", baseHint: "進階 · 預設 Resend", basePh: "https://api.resend.com",
    testTitle: "傳送測試電郵", testDesc: "用目前設定寄一封測試信，確認 Token 與發件網域可用。",
    testPh: "收件電郵", sendTest: "傳送測試", testOk: "測試電郵已寄出，請查收", testNeed: "請先填寫收件電郵",
    secCampus: "校園與儲存", secCampusDesc: "電郵後綴、管理員、顯示名稱與 R2 圖片公開網址，全部即時生效。",
    domains: "允許的電郵後綴", adminEmails: "管理員電郵", schoolName: "學校名稱", r2Url: "R2 自訂公開網址",
    save: "儲存設定", saved: "已儲存，即時生效", saveFail: "儲存失敗",
    note: "設定存放在 Cloudflare KV，管理員在網頁修改後無須重跑 Action。電郵 Token 在 Cloudflare 帳號內可見；若要最高保密，改用 GitHub Secret RESEND_API_KEY 並在這裏清除。",
    stMail: "電郵服務", stOtp: "註冊驗證碼", stR2: "R2 圖片", stPw: "後台密碼",
    fromPanel: "網頁後台", fromSecret: "Worker Secret", notSet: "未設定", ready: "可傳送", devOnly: "僅本地開發",
    blocked: "未開放", enabled: "已啟用", disabled: "已停用", set: "已設定",
    users: "用戶", threads: "對話", msgs: "訊息", needToken: "請先填寫電郵 API Token 或發件電郵",
  },
  en: {
    console: "Admin console", tag: "ADMIN CONSOLE", loginSub: "Sign in with ADMIN_PASSWORD to configure sign-up codes.",
    adminPwHint: "Enter the value of the GitHub Secret ADMIN_PASSWORD here — no campus email account or OTP needed.",
    password: "Admin password", passwordPh: "Enter ADMIN_PASSWORD", signIn: "Sign in", signOut: "Sign out",
    openChat: "Back to chat", wrong: "Wrong password or not signed in", noPw: "ADMIN_PASSWORD is not set: add it to GitHub Secrets and re-run the workflow (or .dev.vars locally).",
    pwNote: "The password lives only in a Cloudflare Secret — never in the repo, never returned to the browser.",
    secMail: "Mail · sign-up codes", secMailDesc: "Add a mail API token and a From address, then sign-up / sign-in sends a real 6-digit code. Takes effect instantly, no redeploy.",
    mailToken: "Mail API token", leaveBlank: "blank = keep current", tokenPh: "re_xxxxxxxx  (paste a new token to replace)",
    current: "Current", clear: "Clear", clearHint: "Falls back to the Worker Secret if one is set",
    mailFrom: "From address", fromPh: "Schoolink <noreply@your-domain.com>",
    mailApiBase: "Mail API base URL", baseHint: "Advanced · defaults to Resend", basePh: "https://api.resend.com",
    testTitle: "Send a test email", testDesc: "Send a test message to confirm the token and verified sender domain work.",
    testPh: "Recipient email", sendTest: "Send test", testOk: "Test email sent — check your inbox", testNeed: "Enter a recipient email first",
    secCampus: "Campus & storage", secCampusDesc: "Email suffixes, admins, display name and the R2 public URL — all applied instantly.",
    domains: "Allowed email suffixes", adminEmails: "Admin emails", schoolName: "School name", r2Url: "R2 custom public URL",
    save: "Save settings", saved: "Saved, live now", saveFail: "Save failed",
    note: "Config lives in Cloudflare KV — web changes need no re-run of the Action. The mail token is visible inside your Cloudflare account; for maximum secrecy use the GitHub Secret RESEND_API_KEY and clear it here.",
    stMail: "Mail service", stOtp: "Sign-up codes", stR2: "R2 images", stPw: "Admin password",
    fromPanel: "Admin panel", fromSecret: "Worker Secret", notSet: "Not configured", ready: "Sending", devOnly: "Dev only",
    blocked: "Blocked", enabled: "Enabled", disabled: "Disabled", set: "Set",
    users: "Users", threads: "Chats", msgs: "Messages", needToken: "Set a mail API token first",
  },
};

const state = {
  lang: localStorage.getItem("schoolink.lang") || "zh-CN",
  authed: false, config: {}, stats: { users: 0, threads: 0, messages: 0 },
  publicCfg: {}, error: "", busy: false,
  form: {
    password: "", mailApiToken: "", mailFrom: "", mailApiBase: "",
    domains: "", adminEmails: "", schoolName: "", r2PublicBaseUrl: "", testTo: "",
  },
};
let toastTimer;
const t = (k) => (I18N[state.lang] || I18N["zh-CN"])[k] || I18N["zh-CN"][k] || k;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

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
  toastTimer = setTimeout(() => { toastEl.className = ""; }, 3200);
}
const post = (path, body) => api(path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

function fillForm(c) {
  state.form.mailFrom = c.mailFrom || "";
  state.form.mailApiBase = c.mailApiBase || "";
  state.form.domains = (c.domains || []).join(", ");
  state.form.adminEmails = (c.adminEmails || []).join(", ");
  state.form.schoolName = c.schoolName || "";
  state.form.r2PublicBaseUrl = c.r2PublicBaseUrl || "";
  state.form.mailApiToken = "";
}

function render() {
  document.documentElement.lang = state.lang;
  if (!state.authed) return renderLogin();
  const c = state.config;
  const led = (ok, warn = false) => `<span class="led ${ok ? "ok" : warn ? "warn" : "off"}"></span>`;
  const mailOk = c.mailConfigured;
  const otpOk = c.mailConfigured;
  const cards = [
    { k: "stMail", ok: mailOk, v: mailOk ? (c.mailSource === "panel" ? t("fromPanel") : t("fromSecret")) : t("notSet") },
    { k: "stOtp", ok: otpOk, warn: c.devOtp, v: otpOk ? t("ready") : c.devOtp ? t("devOnly") : t("blocked") },
    { k: "stR2", ok: c.r2Enabled, v: c.r2Enabled ? t("enabled") : t("disabled") },
    { k: "stPw", ok: c.adminPasswordSet, v: c.adminPasswordSet ? t("set") : t("notSet") },
  ];
  root.innerHTML = `<div class="admin-wrap">
    <div class="admin-head">
      <img src="/logo.svg" alt=""><h1>Schoolink · ${esc(t("console"))}</h1><span class="tag">${esc(t("tag"))}</span>
      <span class="spacer"></span>
      <div class="tabs">${LANGS.map((l) =>
        `<button class="tab ${state.lang === l ? "on" : ""}" data-action="lang" data-lang="${l}">${esc(LABEL[l])}</button>`).join("")}</div>
      <a class="btn" href="/">${esc(t("openChat"))}</a>
      <button class="btn" data-action="logout">${esc(t("signOut"))}</button>
    </div>

    ${!c.adminPasswordSet ? `<div class="notice"><b>⚠ ADMIN_PASSWORD</b> · ${esc(t("noPw"))}</div>` : ""}
    ${!c.mailConfigured ? `<div class="notice">✉ ${esc(t("secMailDesc"))}</div>` : ""}

    <div class="status-grid">
      ${cards.map((x) => `<div class="status-card"><div class="k">${esc(t(x.k))}</div>
        <div class="v">${led(x.ok, x.warn)}${esc(x.v)}</div></div>`).join("")}
    </div>

    <div class="admin-grid">
      <section class="panel">
        <h2>✉ ${esc(t("secMail"))}</h2>
        <p class="desc">${esc(t("secMailDesc"))}</p>

        <div class="field"><label>${esc(t("mailToken"))}<span class="hint">${esc(t("leaveBlank"))}</span></label>
          <input type="password" data-model="mailApiToken" value="" placeholder="${esc(t("tokenPh"))}" autocomplete="new-password"></div>
        ${c.mailApiTokenMasked ? `<div class="mask-line">${esc(t("current"))}: <b>${esc(c.mailApiTokenMasked)}</b>
          <button class="mini danger" style="float:right;margin-top:-6px" data-action="clear-token">${esc(t("clear"))}</button>
          <div style="clear:both"></div><small style="color:var(--muted2)">${esc(t("clearHint"))}</small></div>` : ""}

        <div class="field"><label>${esc(t("mailFrom"))}</label>
          <input data-model="mailFrom" value="${esc(state.form.mailFrom)}" placeholder="${esc(t("fromPh"))}"></div>
        <div class="field"><label>${esc(t("mailApiBase"))}<span class="hint">${esc(t("baseHint"))}</span></label>
          <input data-model="mailApiBase" value="${esc(state.form.mailApiBase)}" placeholder="${esc(t("basePh"))}"></div>

        <div class="divider"></div>
        <h2>🧪 ${esc(t("testTitle"))}</h2>
        <p class="desc">${esc(t("testDesc"))}</p>
        <div class="test-row">
          <input data-model="testTo" value="${esc(state.form.testTo)}" placeholder="${esc(t("testPh"))}" inputmode="email">
          <button class="mini" data-action="test-mail">${esc(t("sendTest"))}</button>
        </div>
      </section>

      <section class="panel">
        <h2>🍀 ${esc(t("secCampus"))}</h2>
        <p class="desc">${esc(t("secCampusDesc"))}</p>
        <div class="field"><label>${esc(t("domains"))}</label>
          <input data-model="domains" value="${esc(state.form.domains)}" placeholder="@plkshs.edu.hk"></div>
        <div class="field"><label>${esc(t("adminEmails"))}</label>
          <input data-model="adminEmails" value="${esc(state.form.adminEmails)}" placeholder="admin@plkshs.edu.hk"></div>
        <div class="field"><label>${esc(t("schoolName"))}</label>
          <input data-model="schoolName" value="${esc(state.form.schoolName)}"></div>
        <div class="field"><label>${esc(t("r2Url"))}</label>
          <input data-model="r2PublicBaseUrl" value="${esc(state.form.r2PublicBaseUrl)}" placeholder="https://img.plkshs.edu.hk"></div>
        <div class="stats">
          <div class="stat"><b>${state.stats.users}</b><small>${esc(t("users"))}</small></div>
          <div class="stat"><b>${state.stats.threads}</b><small>${esc(t("threads"))}</small></div>
          <div class="stat"><b>${state.stats.messages}</b><small>${esc(t("msgs"))}</small></div>
        </div>
      </section>
    </div>

    <div class="admin-foot">
      <div class="note">${esc(t("note"))}</div>
      <button class="btn primary" data-action="save">${esc(t("save"))}</button>
    </div>
  </div>`;
}

function renderLogin() {
  root.innerHTML = `<div class="admin-login"><div class="login-card">
    <img class="login-logo" src="/logo.svg" alt="">
    <h1>Schoolink · ${esc(t("console"))}</h1>
    <p class="sub">${esc(t("loginSub"))}</p>
    <div class="admin-pw-hint">🔑 ${esc(t("adminPwHint"))}</div>
    ${state.publicCfg.adminPasswordSet === false ? `<div class="notice">⚠ ${esc(t("noPw"))}</div>` : ""}
    <div class="field"><label>${esc(t("password"))}</label>
      <input type="password" data-model="password" data-enter="login" value="${esc(state.form.password)}"
             placeholder="${esc(t("passwordPh"))}" autocomplete="current-password"></div>
    <button class="btn-primary" data-action="login">${esc(t("signIn"))}</button>
    <p class="login-err">${esc(state.error || "")}</p>
    <div class="foot-note">${esc(t("pwNote"))}</div>
    <div style="text-align:center;margin-top:16px">
      <button class="chip" data-action="cycle-lang">🌐 ${esc(LABEL[state.lang])}</button>
    </div>
  </div></div>`;
}

async function loadState(retry = 1) {
  try {
    const r = await api("/api/admin/panel/state");
    state.config = r.config; state.stats = r.stats;
    state.authed = true; state.error = "";
    fillForm(r.config);
  } catch (e) {
    // 刷新页面时 KV 白名单可能还没同步完，等一下重试一次
    if (retry > 0) {
      await new Promise((r) => setTimeout(r, 350));
      return loadState(retry - 1);
    }
    state.authed = false;
    state.error = "";
  }
  render();
}
async function login() {
  state.error = "";
  try {
    // 登录响应已带 config / stats，直接用它进场，不再二次验证 session
    const r = await post("/api/admin/panel/login", { password: state.form.password });
    state.form.password = "";
    state.config = r.config || {};
    state.stats = r.stats || state.stats;
    state.authed = true;
    state.error = "";
    fillForm(state.config);
    render();
  } catch (e) { state.error = `${t("wrong")} · ${e.message}`; render(); }
}
async function save() {
  if (state.busy) return;
  state.busy = true;
  const f = state.form;
  const payload = {
    domains: f.domains, adminEmails: f.adminEmails, schoolName: f.schoolName,
    r2PublicBaseUrl: f.r2PublicBaseUrl, mailFrom: f.mailFrom, mailApiBase: f.mailApiBase,
  };
  if (f.mailApiToken.trim()) payload.mailApiToken = f.mailApiToken.trim();
  try {
    const r = await post("/api/admin/panel/config", payload);
    state.config = r.config; fillForm(r.config);
    toast(t("saved")); render();
  } catch (e) { toast(`${t("saveFail")}: ${e.message}`, true); }
  finally { state.busy = false; }
}
async function clearToken() {
  try {
    const r = await post("/api/admin/panel/config", { mailApiToken: "CLEAR" });
    state.config = r.config; fillForm(r.config);
    toast(t("saved")); render();
  } catch (e) { toast(e.message, true); }
}
async function testMail() {
  const to = state.form.testTo.trim();
  if (!to) return toast(t("testNeed"), true);
  try {
    await post("/api/admin/panel/test-mail", { to });
    toast(t("testOk"));
  } catch (e) { toast(e.message, true); }
}
async function logout() {
  try { await post("/api/admin/panel/logout", {}); } catch { /* noop */ }
  state.authed = false; state.error = ""; render();
}
function setLang(l) {
  if (!LANGS.includes(l)) return;
  state.lang = l; localStorage.setItem("schoolink.lang", l); render();
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  if (a === "login") login();
  else if (a === "save") save();
  else if (a === "clear-token") clearToken();
  else if (a === "test-mail") testMail();
  else if (a === "logout") logout();
  else if (a === "lang") setLang(el.dataset.lang);
  else if (a === "cycle-lang") setLang(LANGS[(LANGS.indexOf(state.lang) + 1) % LANGS.length]);
});
document.addEventListener("input", (e) => {
  const k = e.target.dataset?.model;
  if (k) state.form[k] = e.target.value;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.dataset?.enter === "login") { e.preventDefault(); login(); }
});

(async function init() {
  try { state.publicCfg = (await api("/api/config")).config; } catch { /* noop */ }
  await loadState();
})();
