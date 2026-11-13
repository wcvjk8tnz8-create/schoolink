"use client";

import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { greeting } from "@/lib/utils";
import { Clover } from "./Logo";
import { TypingDots } from "./ui";
import Sidebar from "./Sidebar";
import ChatPane from "./ChatPane";
import Modals from "./Modals";

export default function Chat() {
  const activeId = useApp((s) => s.activeId);
  const conn = useApp((s) => s.conn);
  const me = useApp((s) => s.me);
  const t = useApp((s) => s.t);

  const hello = greeting("zh-CN", t("morning"), t("afternoon"), t("evening"), t("night"));

  return (
    <div className={`app-shell ${activeId ? "chat-open" : ""}`}>
      <AnimatePresence>
        {conn !== "online" && (
          <motion.div className={`conn-bar ${conn}`}
            initial={{ y: -34, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -34, opacity: 0 }}>
            {conn === "connecting" && <TypingDots />}
            {conn === "connecting" && t("connecting")}
            {conn === "reconnecting" && <>↻ {t("reconnecting")}</>}
            {conn === "offline" && <>⚠ {t("offlineMode")}</>}
          </motion.div>
        )}
      </AnimatePresence>

      <Sidebar />

      <main className="main-pane">
        <AnimatePresence mode="wait">
          {activeId ? (
            <motion.div key={activeId} className="chat-pane"
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.28 }}>
              <ChatPane />
            </motion.div>
          ) : (
            <motion.div key="hero" className="hero"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.35 }}>
              <Clover size={148} />
              <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                {hello}, {me?.student_id || me?.display_name}
              </motion.h1>
              <motion.p className="hero-sub" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}>{t("heroSub")}</motion.p>
              <motion.div className="hero-chips" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.36 }}>
                <span>⚡ {t("connected")}</span>
                <span>🔒 {t("brandTag")}</span>
                <span>🍀 PWA</span>
              </motion.div>
              <motion.p className="hero-ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}>{t("heroAsk")}</motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Modals />
    </div>
  );
}
