"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { Clover } from "./Logo";
import { Toast, InstallBanner, Spinner } from "./ui";
import Login from "./Login";
import Admin from "./Admin";
import Chat from "./Chat";

export default function App() {
  const view = useApp((s) => s.view);
  const lang = useApp((s) => s.lang);

  useEffect(() => {
    useApp.getState().init();
  }, []);

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
    <div className="app-root">
      <AnimatePresence mode="wait">
        {view === "loading" && (
          <motion.div key="loading" className="splash"
            initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.45 }}>
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
            transition={{ duration: 0.35 }}><Login /></motion.div>
        )}

        {(view === "admin" || view === "admin-login") && (
          <motion.div key="admin" className="view-fill"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}><Admin /></motion.div>
        )}

        {view === "chat" && (
          <motion.div key="chat" className="view-fill"
            initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }} transition={{ duration: 0.35 }}><Chat /></motion.div>
        )}
      </AnimatePresence>

      <Toast />
      <InstallBanner />
    </div>
  );
}
