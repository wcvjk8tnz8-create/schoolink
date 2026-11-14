"use client";

/**
 * AI 助手：像 WhatsApp 一样浮在右下角。
 * 用户静止 1 分钟 → 系统把指示式提示词发给 /api/ai → AI 回「聊天吗？」并弹出气泡。
 * 点气泡可展开聊天面板；设置里可关掉自动弹出，侧栏也能随时手动打开。
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { usePrefs } from "@/lib/prefs";
import { Clover } from "./Logo";
import { Icon } from "./Icon";
import { TypingDots } from "./ui";
import { askAI, loadAIChat, saveAIChat, localChatReply, IDLE_PROMPT, IDLE_MS, AI_COOLDOWN_MS,
  type AIChatMessage } from "@/lib/ai";
import type { Lang } from "@/lib/types";

function L(lang: Lang, cn: string, hk: string, en: string): string {
  return lang === "en" ? en : lang === "zh-HK" ? hk : cn;
}

/** 把 AI 的「聊天嗎」按当前语言摆正，并补回问号 */
function localizeIdle(reply: string, lang: Lang): string {
  if (/聊天/.test(reply)) {
    return lang === "en" ? "Fancy a chat?" : lang === "zh-CN" ? "聊天吗？" : "聊天嗎？";
  }
  return reply;
}

export default function AIAssistant() {
  const view = useApp((s) => s.view);
  const lang = useApp((s) => s.lang);
  const aiOpen = useApp((s) => s.aiOpen);
  const setAiOpen = useApp((s) => s.setAiOpen);
  const idleEnabled = usePrefs((s) => s.aiIdle);
  const [bubble, setBubble] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [idleText, setIdleText] = useState("");
  const [chat, setChat] = useState<AIChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const armRef = useRef<() => void>(() => {});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChat(loadAIChat());
  }, []);

  useEffect(() => {
    if (aiOpen) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [chat, aiOpen]);

  useEffect(() => {
    if (view !== "chat" || !idleEnabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let lastArm = 0;
    const arm = () => {
      if (timer && Date.now() - lastArm < 2500) return;
      lastArm = Date.now();
      clearTimeout(timer);
      timer = setTimeout(trigger, IDLE_MS);
    };
    const trigger = async () => {
      if (useApp.getState().aiOpen || document.hidden) { arm(); return; }
      const last = Number(localStorage.getItem("schoolink.ai.last") || 0);
      if (Date.now() - last < AI_COOLDOWN_MS) { arm(); return; }
      localStorage.setItem("schoolink.ai.last", String(Date.now()));
      setBubble(true); setThinking(true);
      const r = await askAI(IDLE_PROMPT, [], useApp.getState().lang);
      setIdleText(localizeIdle(r.reply, useApp.getState().lang));
      setThinking(false);
      arm();
    };
    armRef.current = arm;
    const onActivity = () => arm();
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onActivity);
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onActivity);
    };
  }, [view, idleEnabled, lang]);

  const dismiss = () => { setBubble(false); armRef.current(); };
  const openChat = () => { setBubble(false); setAiOpen(true); };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft(""); setSending(true);
    const next: AIChatMessage[] = [...chat, { role: "user", content: text }];
    setChat(next);
    let answer: AIChatMessage;
    try {
      const r = await askAI(text, next.filter((m) => m.role === "user" || m.role === "assistant"), lang);
      answer = { role: "assistant", content: r.reply };
    } catch {
      answer = { role: "assistant", content: localChatReply(text, lang) };
    }
    const final = [...next, answer];
    setChat(final); saveAIChat(final); setSending(false);
  };

  if (view !== "chat") return null;

  const shownChat = chat.length ? chat : [{ role: "assistant" as const, content: L(lang,
    "我在这儿呀～ 想聊点什么？", "我喺度呀～ 想傾啲咩？", "I'm right here. What shall we talk about?") }];

  return (
    <>
      <AnimatePresence>
        {!aiOpen && bubble && (
          <motion.div className="ai-bubble-wrap"
            initial={{ opacity: 0, y: 28, scale: 0.86 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}>
            <div className="ai-bubble-head">
              <span className="ai-av"><Clover size={30} animate={false} /><i className="ai-online" /></span>
              <div><strong>{L(lang, "AI 助手", "AI 助手", "AI assistant")}</strong>
                <small>{L(lang, "在线", "在線", "online")}</small></div>
              <button className="ai-x" onClick={dismiss} aria-label="close"><Icon name="close" size={14} /></button>
            </div>
            <div className="ai-bubble-msg">
              {thinking ? <TypingDots /> : idleText || L(lang, "聊天吗？", "聊天嗎？", "Fancy a chat?")}
            </div>
            <div className="ai-bubble-actions">
              <button className="primary" onClick={openChat}><Icon name="send" size={14} />
                {L(lang, "聊聊", "傾吓", "Chat")}</button>
              <button onClick={dismiss}>{L(lang, "稍后", "稍後", "Later")}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aiOpen && (
          <motion.div className="ai-panel"
            initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}>
            <header className="ai-panel-head">
              <span className="ai-av"><Clover size={30} animate={false} /><i className="ai-online" /></span>
              <div><strong>{L(lang, "AI 助手", "AI 助手", "AI assistant")}</strong>
                <small>{L(lang, "陪你聊两句", "陪你傾兩句", "Here for a quick chat")}</small></div>
              <span className="spacer" />
              <button className="ai-x" onClick={() => setAiOpen(false)} aria-label="close"><Icon name="close" size={15} /></button>
            </header>
            <div className="ai-msgs" ref={scrollRef}>
              {shownChat.map((m, i) => (
                <motion.div key={i} className={`ai-msg ${m.role}`}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  {m.content}
                </motion.div>
              ))}
              {sending && <div className="ai-msg assistant"><TypingDots /></div>}
            </div>
            <div className="ai-input">
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder={L(lang, "说点什么…", "講啲嘢…", "Say something…")} maxLength={500} />
              <button onClick={send} disabled={!draft.trim() || sending} aria-label="send"><Icon name="send" size={17} /></button>
            </div>
            <div className="ai-foot">{L(lang,
              "回答由 Schoolink AI 生成，重要事情请向老师确认",
              "回答由 Schoolink AI 生成，重要事情請向老師確認",
              "AI-generated replies — check important matters with a teacher")}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
