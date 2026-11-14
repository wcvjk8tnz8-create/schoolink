"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { Clover } from "./Logo";
import { IconButton, Spinner, softSpring } from "./ui";
import { Icon } from "./Icon";
import { LANGS, LANG_LABEL } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

type Mode = "password" | "otp";
type Sub = "login" | "register" | "bind";

function L(lang: Lang, cn: string, hk: string, en: string): string {
  return lang === "en" ? en : lang === "zh-HK" ? hk : cn;
}

export default function Login() {
  const t = useApp((s) => s.t);
  const lang = useApp((s) => s.lang);
  const config = useApp((s) => s.config);
  const [mode, setMode] = useState<Mode>("password");
  const [sub, setSub] = useState<Sub>("login");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [bindEmail, setBindEmail] = useState("");
  const [bindCode, setBindCode] = useState("");
  const [className, setClassName] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const field = (label: string, node: React.ReactNode, i: number) => (
    <motion.div className="field" key={label}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + i * 0.05, ...softSpring }}>
      <label>{label}</label>{node}
    </motion.div>
  );

  const run = async (fn: () => Promise<void>) => {
    setError(""); setBusy(true);
    try { await fn(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const doLogin = () => run(async () => {
    await useApp.getState().loginWithPassword({ class_name: className, student_no: studentNo, password });
  });

  const doRegister = () => run(async () => {
    if (password !== confirm) throw new Error(L(lang, "两次密码不一致", "兩次密碼唔一致", "Passwords do not match"));
    await useApp.getState().register({
      class_name: className, student_no: studentNo,
      display_name: name.trim() || `${className.trim().toUpperCase()} ${studentNo.trim().toUpperCase()}`,
      password,
    });
    setBindEmail(""); setBindCode(""); setSent(false); setSub("bind");
  });

  const requestOtp = () => run(async () => {
    const r = await useApp.getState().requestCode(email);
    if (r.devCode) setCode(r.devCode);
    setSent(true);
  });

  const verifyOtp = () => run(async () => {
    await useApp.getState().verifyCode({ email, code });
  });

  const requestBind = () => run(async () => {
    const r = await useApp.getState().bindRequest(bindEmail);
    if (r.devCode) setBindCode(r.devCode);
    setSent(true);
  });

  const finishBind = () => run(async () => {
    await useApp.getState().bindVerify(bindEmail, bindCode);
    await useApp.getState().enterChat();
  });

  const skipBind = () => run(async () => { await useApp.getState().enterChat(); });

  const switchMode = (m: Mode) => {
    setMode(m); setSub("login"); setError(""); setSent(false);
  };

  const mailOff = !config.mailConfigured && !config.devOtp;

  return (
    <div className="login-scene">
      <div className="login-orb a" /><div className="login-orb b" /><div className="login-orb c" />
      <motion.div className="login-card login-card-wide"
        initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 20 }}>
        <div className="login-head">
          <Clover size={64} />
          <h1>Schoolink</h1>
          <p className="sub">{L(lang,
            "输入班别与学号即可登录；旧账号可继续用邮箱验证码",
            "輸入班別同學號即可登入；舊帳號可繼續用電郵驗證碼",
            "Sign in with class & student number; existing accounts can still use an email code")}</p>
        </div>

        {sub !== "bind" && (
          <div className="login-tabs">
            <button className={mode === "password" ? "on" : ""} onClick={() => switchMode("password")}>
              <Icon name="key" size={14} /> {L(lang, "班别学号", "班別學號", "Class & ID")}
            </button>
            <button className={mode === "otp" ? "on" : ""} onClick={() => switchMode("otp")}>
              <Icon name="mail" size={14} /> {L(lang, "验证码登录", "驗證碼登入", "Email code")}
            </button>
          </div>
        )}

        {mailOff && (mode === "otp" || sub === "bind") && (
          <motion.div className="notice" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <Icon name="warning" size={14} /> {t("mailNotConfigured")}
            <a href="/admin"><Icon name="arrow-right" size={13} /> {t("goAdmin")}</a>
          </motion.div>
        )}

        {config.requireBoundEmail && mode === "password" && sub === "login" && (
          <div className="notice soft"><Icon name="lock" size={14} /> {L(lang,
            "管理员已启用：需绑定校园邮箱后才能登入",
            "管理員已啟用：需綁定校園郵箱後先可登入",
            "Admin policy: bind your campus email before signing in")}</div>
        )}

        <AnimatePresence mode="wait">
          {/* ── 班别学号：登录 / 注册 / 绑定 ───────────────────────── */}
          {mode === "password" && sub === "login" && (
            <motion.div key="pw-login" className="login-fields"
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22 }}>
              {field(L(lang, "班别", "班別", "Class"),
                <input value={className} onChange={(e) => setClassName(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="6C" maxLength={8} />, 0)}
              {field(L(lang, "学号", "學號", "Student no."),
                <input value={studentNo} onChange={(e) => setStudentNo(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="04" maxLength={8} />, 1)}
              {field(L(lang, "密码", "密碼", "Password"),
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doLogin()} autoComplete="current-password" />, 2)}
              <motion.button className="btn-primary" onClick={doLogin}
                disabled={busy || !className.trim() || !studentNo.trim() || !password}
                whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}>
                {busy ? <Spinner /> : L(lang, "登入", "登入", "Sign in")}
              </motion.button>
              <button className="btn-ghost" onClick={() => { setSub("register"); setError(""); }}>
                <Icon name="plus" size={14} /> {L(lang, "首次使用？建立账号", "首次使用？建立帳號", "First time? Create account")}
              </button>
            </motion.div>
          )}

          {mode === "password" && sub === "register" && (
            <motion.div key="pw-register" className="login-fields"
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22 }}>
              <div className="field-pair">
                {field(L(lang, "班别", "班別", "Class"),
                  <input value={className} onChange={(e) => setClassName(e.target.value.toUpperCase())}
                    placeholder="6C" maxLength={8} />, 0)}
                {field(L(lang, "学号", "學號", "Student no."),
                  <input value={studentNo} onChange={(e) => setStudentNo(e.target.value.toUpperCase())}
                    placeholder="04" maxLength={8} />, 1)}
              </div>
              {field(L(lang, "显示名（选填）", "顯示名（選填）", "Display name (optional)"),
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />, 2)}
              {field(L(lang, "密码（至少 6 位）", "密碼（至少 6 位）", "Password (min. 6 chars)"),
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password" />, 3)}
              {field(L(lang, "确认密码", "確認密碼", "Confirm password"),
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doRegister()} autoComplete="new-password" />, 4)}
              <motion.button className="btn-primary" onClick={doRegister}
                disabled={busy || !className.trim() || !studentNo.trim() || password.length < 6}
                whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}>
                {busy ? <Spinner /> : L(lang, "注册", "註冊", "Create account")}
              </motion.button>
              <button className="btn-ghost" onClick={() => { setSub("login"); setError(""); }}>
                <Icon name="arrow-left" size={14} /> {t("back")}
              </button>
            </motion.div>
          )}

          {mode === "password" && sub === "bind" && (
            <motion.div key="pw-bind" className="login-fields"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}>
              <div className="bind-success">
                <span className="bind-check"><Icon name="check" size={20} /></span>
                <div><strong>{L(lang, "账号已建立", "帳號已建立", "Account created")}</strong>
                  <small>{L(lang,
                    "绑定校园邮箱可防止别人乱登你的班别学号（可稍后再绑）",
                    "綁定校園郵箱可防止別人亂登你嘅班別學號（可稍後再綁）",
                    "Bind your campus email to protect this account (you can do it later)")}</small></div>
              </div>
              {!sent ? (
                <>
                  {field(L(lang, "校园邮箱（选填）", "校園郵箱（選填）", "Campus email (optional)"),
                    <input type="email" value={bindEmail} onChange={(e) => setBindEmail(e.target.value)}
                      placeholder={`201A0000${config.domains[0] || "@plkshs.edu.hk"}`} inputMode="email" />, 0)}
                  <motion.button className="btn-primary" onClick={requestBind}
                    disabled={busy || !bindEmail.trim()} whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}>
                    {busy ? <Spinner /> : t("sendCode")}
                  </motion.button>
                </>
              ) : (
                <>
                  {field(t("code"),
                    <input value={bindCode} onChange={(e) => setBindCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && finishBind()}
                      placeholder={t("codePh")} inputMode="numeric" maxLength={6}
                      autoComplete="one-time-code" className="code-input" />, 0)}
                  <motion.button className="btn-primary" onClick={finishBind}
                    disabled={busy || bindCode.length !== 6} whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}>
                    {busy ? <Spinner /> : L(lang, "绑定并进入", "綁定並進入", "Bind & continue")}
                  </motion.button>
                </>
              )}
              <button className="btn-ghost" onClick={skipBind} disabled={busy}>
                {L(lang, "略过，进入 Schoolink", "略過，進入 Schoolink", "Skip for now")}
                <Icon name="arrow-right" size={14} />
              </button>
            </motion.div>
          )}

          {/* ── 旧账号：邮箱验证码 ───────────────────────────────── */}
          {mode === "otp" && (
            <motion.div key="otp" className="login-fields"
              initial={{ opacity: 0, x: mode === "otp" ? 16 : -16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
              <div className="otp-note"><Icon name="info" size={14} /> {L(lang,
                "仅供已注册 / 已绑定校园邮箱的现有账号",
                "只供已註冊 / 已綁定校園郵箱嘅現有帳號",
                "For existing accounts with a bound campus email only")}</div>
              {field(t("email"),
                <input value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !sent && requestOtp()}
                  placeholder={t("emailPh")} type="email" autoComplete="email" inputMode="email" disabled={sent} />, 0)}
              {sent && field(t("code"),
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                  placeholder={t("codePh")} inputMode="numeric" maxLength={6}
                  autoComplete="one-time-code" className="code-input" />, 1)}
              <motion.button className="btn-primary"
                onClick={sent ? verifyOtp : requestOtp}
                disabled={busy || (!sent ? !email.trim() : code.length !== 6)}
                whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}>
                {busy ? <Spinner /> : sent ? t("verify") : t("sendCode")}
              </motion.button>
              {sent && <button className="btn-ghost" onClick={() => { setSent(false); setError(""); }}>
                <Icon name="arrow-left" size={14} /> {t("back")}
              </button>}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>{error && (
          <motion.p className="err-line" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}>{error}</motion.p>
        )}</AnimatePresence>

        <div className="login-hint">{t("loginHint", { domains: config.domains.join(", ") })}</div>
        <div className="login-langs">
          {LANGS.map((l) => (
            <motion.button key={l} className={lang === l ? "on" : ""}
              onClick={() => useApp.getState().setLang(l)} whileTap={{ scale: 0.93 }}>
              {LANG_LABEL[l]}
            </motion.button>
          ))}
        </div>
      </motion.div>
      <div className="login-foot">
        <IconButton onClick={() => useApp.getState().setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length])}
          title="Language"><Icon name="globe" size={18} /></IconButton>
      </div>
    </div>
  );
}
