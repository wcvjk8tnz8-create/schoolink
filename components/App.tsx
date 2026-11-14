"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { usePrefs, applyPrefs } from "@/lib/prefs";
import { installM3Ripple, m3ViewTransition, M3_MOTION } from "@/lib/m3";
import { useApp } from "@/lib/store";
import { Clover } from "./Logo";
import { Toast, InstallBanner, Spinner } from "./ui";
import Login from "./Login";
import Admin from "./Admin";
import Chat from "./Chat";
import AIAssistant from "./AIAssistant";
import InstallGuide from "./InstallGuide";

export default function App() {
  const view = useApp((s) => s.view);
  const lang = useApp((s) => s.lang);
  const animations = usePrefs((s) => s.animations);

  useEffect(() => {
    useApp.getState().init();
    applyPrefs(usePrefs.getState());
    const detachRipple = installM3Ripple();
    const unsub = usePrefs.subscribe(applyPrefs);
    return () => { detachRipple(); unsub(); };
  }, []);

  // 点击桌面通知后打开对应会话
  useEffect(() => {
    if (view !== "chat") return;
    const q = new URLSearchParams(window.location.search).get("thread");
    if (q) {
      useApp.getState().openThread(q);
      window.history.replaceState({}, "", "/");
    }
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (s.view === "chat") { s.runSearch(""); s.setModal(s.modal === "search" ? null : "search"); }
      }
      if (e.key === "Escape") {
        if (s.lightbox) s.setLightbox(null);
        else if (s.modal) s.setModal(null);
        else if (s.replyTo) s.setReplyTo(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <MotionConfig reducedMotion={animations ? "user" : "always"}>
    <div className="app-root">
      <AnimatePresence mode="wait">
        {view === "loading" && (
          <motion.div key="loading" className="splash"
            initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: M3_MOTION.medium2, ease: M3_MOTION.standard }}>
            <Clover size={112} />
            <motion.div className="splash-name"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}>Schoolink</motion.div>
            <motion.div className="splash-bar" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
              transition={{ duration: 1.1, ease: "easeInOut" }} />
            <Spinner size={16} />
          </motion.div>
        )}

        {(view === "login") && (
          <motion.div key="login" className="view-fill"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={m3ViewTransition}><Login /></motion.div>
        )}

        {(view === "admin" || view === "admin-login") && (
          <motion.div key="admin" className="view-fill"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={m3ViewTransition}><Admin /></motion.div>
        )}

        {view === "chat" && (
          <motion.div key="chat" className="view-fill"
            initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }} transition={m3ViewTransition}><Chat /></motion.div>
        )}
      </AnimatePresence>

      <Toast />
      <InstallBanner />
      <AIAssistant />
      <InstallGuide />
    </div>
    </MotionConfig>
  );
}
