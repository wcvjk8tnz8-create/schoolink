"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { Clover } from "./Logo";
import { IconButton, Spinner } from "./ui";
import { LANGS, LANG_LABEL } from "@/lib/i18n";
import { softSpring } from "./ui";

export default function Login() {
  const t = useApp((s) => s.t);
  const lang = useApp((s) => s.lang);
  const config = useApp((s) => s.config);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sid, setSid] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const field = (label: string, node: React.ReactNode, i: number) => (
    <motion.div className="field" key={label}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 + i * 0.06, ...softSpring }}>
      <label>{label}</label>{node}
    </motion.div>
  );

  const request = async () => {
    setError(""); setBusy(true);
    try {
      const r = await useApp.getState().requestCode(email);
      if (r.devCode) setCode(r.devCode);
      setStep("code");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    setError(""); setBusy(true);
    try {
      await useApp.getState().verifyCode({ email, code, student_id: sid, display_name: name });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-scene">
      <div className="login-orb a" /><div className="login-orb b" /><div className="login-orb c" />
      <motion.div className="login-card"
        initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 20 }}>
        <div className="login-head">
          <Clover size={72} />
          <h1>Schoolink</h1>
          <p className="sub">{t("loginSub")}</p>
        </div>

        {!config.mailConfigured && !config.devOtp && (
          <motion.div className="notice" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            ⚠ {t("mailNotConfigured")}
            <a href="/admin">→ {t("goAdmin")}</a>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {step === "email" ? (
            <motion.div key="email-step" className="login-fields"
              initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.24 }}>
              {field(t("email"),
                <input value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && request()}
                  placeholder={t("emailPh")} type="email" autoComplete="email" inputMode="email" />, 0)}
              <motion.button className="btn-primary" onClick={request} disabled={busy || !email.trim()}
                whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                {busy ? <Spinner /> : t("sendCode")}
              </motion.button>
            </motion.div>
          ) : (
            <motion.div key="code-step" className="login-fields"
              initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.24 }}>
              {field(t("code"),
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && verify()}
                  placeholder={t("codePh")} inputMode="numeric" maxLength={6}
                  autoComplete="one-time-code" className="code-input" />, 0)}
              {field(t("sid"), <input value={sid} onChange={(e) => setSid(e.target.value)} placeholder={t("sidPh")} />, 1)}
              {field(t("name"), <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePh")} />, 2)}
              <motion.button className="btn-primary" onClick={verify} disabled={busy || code.length !== 6}
                whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}>
                {busy ? <Spinner /> : t("verify")}
              </motion.button>
              <button className="btn-ghost" onClick={() => { setStep("email"); setError(""); }}>
                ← {t("back")}
              </button>
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
          title="Language">🌐</IconButton>
      </div>
    </div>
  );
}
