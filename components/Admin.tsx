"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { post } from "@/lib/api";
import { Clover } from "./Logo";
import { Avatar, IconButton, Spinner, softSpring } from "./ui";
import { Icon } from "./Icon";
import { LANGS, LANG_LABEL } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { AI_MODEL_PRESETS, DEFAULT_AI_MODEL } from "@/lib/ai-models";

function L(lang: Lang, cn: string, hk: string, en: string): string {
  return lang === "en" ? en : lang === "zh-HK" ? hk : cn;
}

export default function Admin() {
  const view = useApp((s) => s.view);
  return view === "admin-login" ? <AdminLogin /> : <AdminConsole />;
}

function AdminLogin() {
  const t = useApp((s) => s.t);
  const lang = useApp((s) => s.lang);
  const cfg = useApp((s) => s.config);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr("");
    try { await useApp.getState().adminLogin(pw); }
    catch (e) { setErr(`${t("wrong")} · ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-scene admin-scene">
      <div className="login-orb a" /><div className="login-orb b" />
      <motion.div className="login-card admin-login-card"
        initial={{ opacity: 0, y: 28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 20 }}>
        <div className="login-head"><Clover size={64} /><h1>Schoolink · {t("console")}</h1>
          <p className="sub">{t("adminLoginSub")}</p></div>
        <div className="pw-hint"><Icon name="key" size={14} /> {t("adminPwHint")}</div>
        {cfg.adminPasswordSet === false && <div className="notice"><Icon name="warning" size={14} /> {t("noPw")}</div>}
        <div className="field"><label>{t("password")}</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={t("passwordPh")}
            autoComplete="current-password" /></div>
        <motion.button className="btn-primary" onClick={submit} disabled={busy || !pw}
          whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}>
          {busy ? <Spinner /> : t("signIn")}
        </motion.button>
        <AnimatePresence>{err && <motion.p className="err-line" initial={{ opacity: 0 }}
          animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{err}</motion.p>}</AnimatePresence>
        <div className="pw-note">{t("pwNote")}</div>
        <div className="login-langs">
          {LANGS.map((l) => <button key={l} className={lang === l ? "on" : ""}
            onClick={() => useApp.getState().setLang(l)}>{LANG_LABEL[l]}</button>)}
        </div>
        <a className="back-link" href="/"><Icon name="arrow-left" size={13} /> {t("openChat")}</a>
      </motion.div>
    </div>
  );
}

function StatusCard({ label, ok, warn, value }: { label: string; ok: boolean; warn?: boolean; value: string }) {
  return (
    <motion.div className="status-card" whileHover={{ y: -3 }} transition={softSpring}>
      <div className="k">{label}</div>
      <div className="v"><span className={`led ${ok ? "ok" : warn ? "warn" : "off"}`} />{value}</div>
    </motion.div>
  );
}

function Panel({ title, desc, children, delay = 0, icon }: {
  title: string; desc: string; children: React.ReactNode; delay?: number; icon?: string;
}) {
  return (
    <motion.section className="panel"
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, ...softSpring }}>
      <h2>{icon && <Icon name={icon} size={17} />}{title}</h2><p className="desc">{desc}</p>{children}
    </motion.section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}{hint && <span className="hint">{hint}</span>}</label>{children}</div>;
}

function AdminConsole() {
  const t = useApp((s) => s.t);
  const lang = useApp((s) => s.lang);
  const cfg = useApp((s) => s.config);
  const stats = useApp((s) => s.stats);
  const f = useApp((s) => s.adminForm);
  const users = useApp((s) => s.adminUsers);
  const setF = useApp((s) => s.setAdminForm);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiError, setAiError] = useState("");
  const [nu, setNuState] = useState({ class_name: "", student_no: "", display_name: "", email: "", password: "", role: "user" });
  const setNu = (k: keyof typeof nu, v: string) => setNuState((x) => ({ ...x, [k]: v }));
  const openConsole = () => {
    setConsoleOpen(true);
    setTimeout(() => document.getElementById("user-console")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };
  const addUser = async () => {
    setAddBusy(true);
    try {
      await useApp.getState().adminCreateUser({
        class_name: nu.class_name, student_no: nu.student_no,
        display_name: nu.display_name, email: nu.email || undefined,
        password: nu.password || undefined, role: nu.role,
      });
      setNuState({ class_name: "", student_no: "", display_name: "", email: "", password: "", role: "user" });
    } catch (e) { useApp.getState().toastMsg((e as Error).message, "err"); }
    finally { setAddBusy(false); }
  };
  const aiModels = cfg.aiModels?.length ? cfg.aiModels : AI_MODEL_PRESETS;
  const aiIsCustom = Boolean(f.aiModel) && !aiModels.some((m) => m.id === f.aiModel);
  const testAI = async () => {
    setAiBusy(true); setAiError(""); setAiResult("");
    try {
      const r = await useApp.getState().adminTestAI(f.aiModel || DEFAULT_AI_MODEL);
      setAiResult(`${r.model} — ${r.reply}`);
    } catch (e) { setAiError((e as Error).message); }
    finally { setAiBusy(false); }
  };
  const resetPw = async (userId: string) => {
    const pw = window.prompt(L(lang, "输入新密码（至少 6 位）", "輸入新密碼（至少 6 位）", "New password (min. 6 chars)"));
    if (!pw) return;
    try { await useApp.getState().adminSetPassword(userId, pw); }
    catch (e) { useApp.getState().toastMsg((e as Error).message, "err"); }
  };

  const save = async () => {
    setBusy(true);
    try { await useApp.getState().adminSave(); }
    catch (e) { useApp.getState().toastMsg(`${t("saveFail")}: ${(e as Error).message}`, "err"); }
    finally { setBusy(false); }
  };
  const clearToken = async () => {
    try {
      const r = await post<{ config: typeof cfg }>("/api/admin/panel/config", { mailApiToken: "CLEAR" });
      useApp.setState({ config: { ...cfg, ...r.config } });
      useApp.getState().toastMsg(t("saved"), "ok");
    } catch (e) { useApp.getState().toastMsg((e as Error).message, "err"); }
  };
  const test = async () => {
    setTestBusy(true);
    try { await useApp.getState().adminTestMail(f.testTo || ""); }
    catch (e) { useApp.getState().toastMsg((e as Error).message, "err"); }
    finally { setTestBusy(false); }
  };

  return (
    <div className="admin-wrap">
      <motion.header className="admin-head" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}>
        <Clover size={38} animate={false} />
        <h1>Schoolink · {t("console")}</h1><span className="tag">{t("tag")}</span>
        <span className="spacer" />
        <div className="login-langs compact">
          {LANGS.map((l) => <button key={l} className={lang === l ? "on" : ""}
            onClick={() => useApp.getState().setLang(l)}>{LANG_LABEL[l]}</button>)}
        </div>
        <button className="btn primary small" onClick={openConsole}><Icon name="users" size={15} /> {L(lang, "控制台", "控制台", "Console")}</button>
        <a className="btn" href="/">{t("openChat")}</a>
        <button className="btn" onClick={() => useApp.getState().adminLogout()}>{t("signOut")}</button>
      </motion.header>

      {!cfg.mailConfigured && <motion.div className="notice" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Icon name="mail" size={14} /> {t("secMailDesc")}
      </motion.div>}

      <div className="status-grid">
        <StatusCard label={t("stMail")} ok={cfg.mailConfigured}
          value={cfg.mailConfigured ? (cfg.mailSource === "panel" ? t("fromPanel") : t("fromSecret")) : t("notSet")} />
        <StatusCard label={t("stOtp")} ok={cfg.mailConfigured} warn={Boolean(cfg.devOtp)}
          value={cfg.mailConfigured ? t("ready") : cfg.devOtp ? t("devOnly") : t("blocked")} />
        <StatusCard label={t("stR2")} ok={cfg.r2Enabled} value={cfg.r2Enabled ? t("enabled") : t("disabledR2")} />
        <StatusCard label={t("stPw")} ok={Boolean(cfg.adminPasswordSet)} value={cfg.adminPasswordSet ? t("set") : t("notSet")} />
      </div>

      <div className="admin-grid">
        <Panel title={t("secMail")} icon="mail" desc={t("secMailDesc")} delay={0.05}>
          <Field label={t("mailToken")} hint={t("leaveBlank")}>
            <input type="password" value={f.mailApiToken || ""} onChange={(e) => setF("mailApiToken", e.target.value)}
              placeholder="re_xxxxxxxx" autoComplete="new-password" /></Field>
          {cfg.mailApiTokenMasked && <motion.div className="mask-line" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {t("current")}: <b>{cfg.mailApiTokenMasked}</b>
            <button className="mini danger" onClick={clearToken}>{t("clear")}</button>
            <small>{t("clearHint")}</small>
          </motion.div>}
          <Field label={t("mailFrom")}>
            <input value={f.mailFrom || ""} onChange={(e) => setF("mailFrom", e.target.value)}
              placeholder="Schoolink <noreply@your-domain.com>" /></Field>
          <Field label={t("mailApiBase")} hint={t("baseHint")}>
            <input value={f.mailApiBase || ""} onChange={(e) => setF("mailApiBase", e.target.value)}
              placeholder="https://api.resend.com" /></Field>
          <div className="divider" />
          <h3><Icon name="beaker" size={15} /> {t("testTitle")}</h3><p className="desc">{t("testDesc")}</p>
          <div className="inline">
            <input value={f.testTo || ""} onChange={(e) => setF("testTo", e.target.value)}
              placeholder={t("testPh")} inputMode="email" />
            <button className="btn" onClick={test} disabled={testBusy || !f.testTo}>
              {testBusy ? <Spinner size={14} /> : t("sendTest")}</button>
          </div>
        </Panel>

        <Panel title={L(lang, "AI 助手 · 模型", "AI 助手 · 模型", "AI assistant · Model")} icon="smile"
          desc={L(lang,
            "选一个 Workers AI 文字模型，保存后即时生效，无需重新部署；也可在 Variables 用 AI_MODEL 预设。",
            "揀一個 Workers AI 文字模型，儲存後即時生效，唔使重新部署；亦可用 Variables 嘅 AI_MODEL 預設。",
            "Pick a Workers AI text model. Saved instantly, no redeploy; AI_MODEL variable sets the default.")} delay={0.12}>
          <div className="ai-cfg-current">
            <Icon name="bolt" size={14} />
            <span>{L(lang, "当前默认", "目前預設", "Current default")}</span>
            <code>{cfg.aiModel || DEFAULT_AI_MODEL}</code>
            <span className={`au-badge ${cfg.aiEnabled ? "on" : "warn"}`}>
              {cfg.aiEnabled ? L(lang, "Workers AI 已绑定", "Workers AI 已綁定", "Workers AI bound")
                : L(lang, "本地兜底", "本地兜底", "Local fallback")}</span>
          </div>
          <Field label={L(lang, "模型", "模型", "Model")} hint={L(lang, "选预设或自填 ID", "揀預設或自填 ID", "Preset or custom ID")}>
            <select className="ai-cfg-select" value={(aiIsCustom || customOpen) ? "__custom__" : (f.aiModel || DEFAULT_AI_MODEL)}
              onChange={(e) => {
                if (e.target.value === "__custom__") setCustomOpen(true);
                else { setCustomOpen(false); setF("aiModel", e.target.value); }
              }}>
              {aiModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label} · {m.hint}</option>
              ))}
              <option value="__custom__">{L(lang, "自定义模型 ID…", "自訂模型 ID…", "Custom model ID…")}</option>
            </select>
          </Field>
          {(aiIsCustom || customOpen) && (
            <Field label={L(lang, "自定义模型 ID", "自訂模型 ID", "Custom model ID")} hint="@vendor/model">
              <input value={f.aiCustom || (aiIsCustom ? f.aiModel : "") || ""}
                onChange={(e) => { setF("aiCustom", e.target.value); setF("aiModel", e.target.value); }}
                placeholder="@cf/meta/llama-3.1-8b-instruct" />
            </Field>
          )}
          <label className="admin-check"><input type="checkbox" checked={f.aiAllowUserModel !== "0"}
            onChange={(e) => setF("aiAllowUserModel", e.target.checked ? "1" : "0")} />
            <span><strong>{L(lang, "允许学生在「设置 → AI 助手」自选模型", "容許學生喺「設定 → AI 助手」自選模型",
              "Let students pick a model in Settings → AI assistant")}</strong>
            <small>{L(lang, "关闭后全校统一用上面这个模型；开启时学生只能从合法模型 ID 里选",
              "關閉後全校統一用上面呢個模型；開啟時學生只可揀合法模型 ID",
              "Off = school-wide model; on = students choose among valid model IDs")}</small></span></label>
          <div className="inline ai-cfg-test">
            <button className="btn" onClick={testAI} disabled={aiBusy || !f.aiModel}>
              {aiBusy ? <Spinner size={14} /> : <Icon name="beaker" size={14} />}
              {L(lang, "测试这个模型", "測試呢個模型", "Test this model")}
            </button>
            <button className="btn" onClick={() => { setCustomOpen(false); setF("aiModel", DEFAULT_AI_MODEL); }}>
              <Icon name="refresh" size={14} /> {L(lang, "回预设", "回預設", "Reset")}
            </button>
          </div>
          {aiResult && <motion.div className="ai-cfg-ok" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            <Icon name="check" size={15} /> {aiResult}</motion.div>}
          {aiError && <motion.div className="ai-cfg-err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Icon name="warning" size={15} /> {aiError}</motion.div>}
          <p className="muted-line">{L(lang,
            "若账户未开通 Workers AI，测试会提示 503，但模型设置照样保存，AI 助手自动用本地回复兜底，不会空白。",
            "若帳號未開通 Workers AI，測試會提示 503，但模型設定照樣儲存，AI 助手自動用本地回覆兜底，唔會空白。",
            "If Workers AI isn't enabled, testing returns 503 but settings still save and the assistant falls back locally.")}</p>
        </Panel>

        <div className="admin-col">
          <Panel title={t("secCampus")} icon="clover" desc={t("secCampusDesc")} delay={0.1}>
            <Field label={t("domains")}>
              <input value={f.domains || ""} onChange={(e) => setF("domains", e.target.value)} placeholder="@plkshs.edu.hk" /></Field>
            <Field label={t("adminEmails")}>
              <input value={f.adminEmails || ""} onChange={(e) => setF("adminEmails", e.target.value)} /></Field>
            <Field label={t("schoolName")}>
              <input value={f.schoolName || ""} onChange={(e) => setF("schoolName", e.target.value)} /></Field>
            <Field label={t("r2Url")}>
              <input value={f.r2PublicBaseUrl || ""} onChange={(e) => setF("r2PublicBaseUrl", e.target.value)}
                placeholder="https://img.plkshs.edu.hk" /></Field>
            <label className="admin-check"><input type="checkbox" checked={f.requireBoundEmail === "1"}
              onChange={(e) => setF("requireBoundEmail", e.target.checked ? "1" : "0")} />
              <span><strong>{L(lang, "只允许已绑定校园邮箱的账号登入", "只允許已綁定校園郵箱嘅帳號登入", "Only allow accounts with a bound campus email")}</strong>
              <small>{L(lang, "开启后可防止用别人的班别学号乱登入；旧 OTP 账号自动视为已绑定",
                "開啟後可防止用別人嘅班別學號亂登入；舊 OTP 帳號自動視為已綁定",
                "Prevents random sign-ins; legacy email accounts count as bound")}</small></span></label>
            <div className="stats">
              <div className="stat"><b>{stats.users}</b><small>{t("users")}</small></div>
              <div className="stat"><b>{stats.threads}</b><small>{t("threads")}</small></div>
              <div className="stat"><b>{stats.messages}</b><small>{t("msgs")}</small></div>
            </div>
          </Panel>

          <Panel title={t("secUsers")} icon="users" desc={t("secUsersDesc")} delay={0.16}>
            <div className="admin-users">
              <AnimatePresence initial={false}>
                {users.slice(0, 60).map((u) => (
                  <motion.div key={u.id} className="admin-user-row" layout
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                    <Avatar user={u} size={30} />
                    <div className="au-info"><strong>{u.display_name}</strong>
                      <small>{u.class_name && u.student_no ? `${u.class_name} ${u.student_no}` : (u.email || u.student_id)}</small></div>
                    <span className={`au-badge ${u.email_bound ? "on" : "warn"}`}>
                      {u.email_bound ? L(lang, "已绑定", "已綁定", "Bound") : L(lang, "未绑定", "未綁定", "Unbound")}</span>
                    <button className="mini" onClick={() => resetPw(u.id)} title={L(lang, "重设密码", "重設密碼", "Reset password")}>
                      <Icon name="key" size={13} /></button>
                    <button className="mini" onClick={() => useApp.getState().adminToggleBan(u.id, !u.banned)}>
                      {u.banned ? t("unban") : t("ban")}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {!users.length && <div className="muted-line">{t("noResults")}</div>}
            </div>
          </Panel>

          <motion.section id="user-console" className="panel"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, ...softSpring }}>
            <AnimatePresence initial={false}>
              {consoleOpen && (
                <motion.div key="console-body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}>
                  <h2><Icon name="plus" size={17} />{L(lang, "用户控制台 · 新增用户", "用戶控制台 · 新增用戶", "User console · Add user")}</h2>
                  <p className="desc">{L(lang,
                    "只需填班别与学号；再填邮箱或初始密码至少一项，学生就能登入。",
                    "只需填班別同學號；再填電郵或初始密碼至少一項，學生就登入到。",
                    "Only class + student number required; add an email or an initial password so they can sign in.")}</p>
                  <div className="admin-add-grid">
                    <div className="field"><label>{L(lang, "班别", "班別", "Class")}</label>
                      <input value={nu.class_name} onChange={(e) => setNu("class_name", e.target.value.toUpperCase())}
                        placeholder="6C" maxLength={8} /></div>
                    <div className="field"><label>{L(lang, "学号", "學號", "Student no.")}</label>
                      <input value={nu.student_no} onChange={(e) => setNu("student_no", e.target.value.toUpperCase())}
                        placeholder="04" maxLength={8} /></div>
                    <div className="field"><label>{L(lang, "显示名", "顯示名", "Display name")}</label>
                      <input value={nu.display_name} onChange={(e) => setNu("display_name", e.target.value)}
                        placeholder={L(lang, "例如：陈小明", "例如：陳小明", "e.g. Chan Siu Ming")} maxLength={40} /></div>
                    <div className="field"><label>{L(lang, "校园邮箱（选填）", "校園郵箱（選填）", "Campus email (optional)")}</label>
                      <input value={nu.email} onChange={(e) => setNu("email", e.target.value)}
                        placeholder={`201A0000${cfg.domains[0] || "@plkshs.edu.hk"}`} inputMode="email" /></div>
                    <div className="field"><label>{L(lang, "初始密码（选填）", "初始密碼（選填）", "Initial password (optional)")}</label>
                      <input type="password" value={nu.password} onChange={(e) => setNu("password", e.target.value)}
                        autoComplete="new-password" /></div>
                    <div className="field"><label>{L(lang, "身份", "身份", "Role")}</label>
                      <select value={nu.role} onChange={(e) => setNu("role", e.target.value)}>
                        <option value="user">{L(lang, "学生", "學生", "Student")}</option>
                        <option value="admin">{L(lang, "管理员", "管理員", "Admin")}</option>
                      </select></div>
                  </div>
                  <div className="admin-add-actions">
                    <button className="btn primary" onClick={addUser}
                      disabled={addBusy || !nu.class_name.trim() || !nu.student_no.trim() || (!nu.email.trim() && !nu.password)}>
                      {addBusy ? <Spinner size={14} /> : <Icon name="plus" size={15} />}
                      {L(lang, "新增用户", "新增用戶", "Add user")}
                    </button>
                    <button className="btn" onClick={() => setConsoleOpen(false)}>{t("close")}</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!consoleOpen && (
              <button className="btn primary big full" onClick={openConsole}>
                <Icon name="users" size={16} /> {L(lang, "打开控制台新增用户", "打開控制台新增用戶", "Open console to add users")}
              </button>
            )}
          </motion.section>
        </div>
      </div>

      <motion.div className="admin-foot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }}>
        <button className="btn primary big" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : t("save")}
        </button>
        <IconButton title="Settings" onClick={() => useApp.getState().setTheme(
          useApp.getState().theme === "dark" ? "light" : "dark")}><Icon name="moon" size={17} /></IconButton>
      </motion.div>
    </div>
  );
}
