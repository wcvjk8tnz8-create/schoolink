"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { post } from "@/lib/api";
import { Clover } from "./Logo";
import { Avatar, IconButton, Spinner, softSpring } from "./ui";
import { Icon } from "./Icon";
import { LANGS, LANG_LABEL } from "@/lib/i18n";

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
                    <div className="au-info"><strong>{u.display_name}</strong><small>{u.email}</small></div>
                    <span className={`au-badge ${u.banned ? "off" : "on"}`}>{u.banned ? t("disabled") : t("active")}</span>
                    <button className="mini" onClick={() => useApp.getState().adminToggleBan(u.id, !u.banned)}>
                      {u.banned ? t("unban") : t("ban")}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {!users.length && <div className="muted-line">{t("noResults")}</div>}
            </div>
          </Panel>
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
