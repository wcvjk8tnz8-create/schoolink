"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { Avatar, IconButton, TypingDots, spring, softSpring } from "./ui";
import MessageBubble from "./MessageBubble";
import { Icon } from "./Icon";
import { usePrefs, THREAD_ACCENTS, MUTE_FOREVER } from "@/lib/prefs";
import Composer from "./Composer";
import {
  threadTitle, threadOther, fmtDay, fmtLastSeen, dayKeyOf, cx,
} from "@/lib/utils";

export default function ChatPane() {
  const t = useApp((s) => s.t);
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me);
  const isAdmin = useApp((s) => s.isAdmin);
  const clock = usePrefs((s) => s.clock);
  const threads = useApp((s) => s.threads);
  const activeId = useApp((s) => s.activeId);
  const messages = useApp((s) => s.messages);
  const typingMap = useApp((s) => s.typing);
  const listRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [tick, setTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(true);

  const thread = threads.find((x) => x.id === activeId);
  const list = activeId ? (messages[activeId] || []) : [];
  const typers = activeId
    ? Object.entries(typingMap[activeId] || {}).filter(([, v]) => v.until > Date.now())
    : [];

  useEffect(() => {
    if (!typers.length) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [typers.length]);
  void tick;

  // 新消息贴底（只在用户本来就在底部时自动滚）
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    if (near) {
      requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
    }
  }, [list.length, activeId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
      if (el.scrollTop < 60 && list.length) useApp.getState().loadOlder();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [list.length, activeId]);

  const grouped = useMemo(() => {
    const out: { key: string; label: string; items: typeof list }[] = [];
    for (const m of list) {
      const key = dayKeyOf(m.created_at);
      const last = out[out.length - 1];
      if (!last || last.key !== key) {
        out.push({ key, label: fmtDay(m.created_at, lang, t("today"), t("yesterday")), items: [m] });
      } else last.items.push(m);
    }
    return out;
  }, [list, lang, t]);

  if (!thread || !activeId) return null;

  const other = threadOther(thread, me?.id || "");
  const isOnline = thread.type === "direct" && other && other.show_online !== false
    && Date.now() - (other.last_seen || 0) < 90_000;
  const canPost = !thread.announcement_only || thread.created_by === me?.id || isAdmin;
  const accentStyle = {
    "--thread-accent": THREAD_ACCENTS[thread.accent || ""] || "transparent",
  } as React.CSSProperties;
  const subtitle = typers.length
    ? `${typers[0][1].name} ${t("typing").replace("{name}", "").trim()}`
    : thread.type === "group" ? t("members", { n: thread.members.length })
    : isOnline ? t("online")
    : fmtLastSeen(other?.last_seen || 0, lang, t("lastSeen"), clock);

  const flag = async (key: "pinned" | "muted" | "archived" | "starred") => {
    const patch = { [key]: !thread[key] } as Partial<
      Record<"pinned" | "muted" | "archived" | "starred", boolean>
    >;
    await useApp.getState().setFlags(thread.id, patch);
    setMenuOpen(false);
  };

  const toggleMute = () => {
    const p = usePrefs.getState();
    const on = !(thread.muted || p.isMuted(thread.id));
    p.setMute(thread.id, on ? MUTE_FOREVER : 0);
    useApp.getState().setFlags(thread.id, { muted: on });
    setMenuOpen(false);
  };

  return (
    <>
      <header className="chat-head" style={accentStyle}>
        <IconButton className="mobile-back" onClick={() => useApp.setState({ activeId: null })}><Icon name="arrow-left" size={18} /></IconButton>
        <motion.div className="ch-avatar" whileHover={{ scale: 1.05 }}>
          <Avatar user={thread.type === "direct" ? other : undefined}
            name={threadTitle(thread, me?.id || "")} id={thread.id} size={40}
            online={Boolean(isOnline)} avatarKey={thread.type === "group" ? thread.avatar_key : undefined} />
        </motion.div>
        <button className="ch-title" onClick={() => useApp.getState().setModal(
          thread.type === "group" ? "group-info" : "profile")}>
          <strong>{threadTitle(thread, me?.id || "")}</strong>
          <AnimatePresence mode="wait">
            <motion.small key={subtitle} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}
              className={cx(typers.length > 0 && "typing-sub")}>
              {typers.length > 0 && <TypingDots />}{subtitle}
            </motion.small>
          </AnimatePresence>
        </button>
        <span className="spacer" />
        <IconButton title={t("searchTitle")} onClick={() => {
          useApp.getState().runSearch("", thread.id); useApp.getState().setModal("search");
        }}><Icon name="search" size={18} /></IconButton>
        <IconButton title={t("starredTitle")} onClick={() => {
          useApp.getState().loadStarred(); useApp.getState().setModal("starred");
        }}><Icon name="star" size={18} /></IconButton>
        <IconButton title="More" onClick={() => setMenuOpen((v) => !v)}><Icon name="more" size={18} /></IconButton>

        <AnimatePresence>
          {menuOpen && (
            <motion.div className="head-menu" initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}>
              <button onClick={() => flag("pinned")}><Icon name="pin" size={15} /> {thread.pinned ? t("unpin") : t("pin")}</button>
              <button onClick={toggleMute}><Icon name="bell-off" size={15} /> {(thread.muted || usePrefs.getState().isMuted(thread.id)) ? t("unmute") : t("mute")}</button>
              <button onClick={() => flag("archived")}><Icon name="archive" size={15} /> {thread.archived ? t("unarchive") : t("archive")}</button>
              {thread.type === "group" && <button onClick={() => { setMenuOpen(false); useApp.getState().setModal("group-info"); }}><Icon name="info" size={15} /> {t("groupInfo")}</button>}
              {thread.type === "group" && !thread.is_default &&
                <button className="danger" onClick={() => { setMenuOpen(false); useApp.getState().leave(); }}><Icon name="logout" size={15} /> {t("leave")}</button>}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {thread.about && (
        <motion.div className="notice-bar" style={accentStyle}
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Icon name="mail" size={15} />
          <button className="nb-text" onClick={() => setNoticeOpen((v) => !v)}>
            <strong>{lang === "en" ? "Group notice" : "群公告"}</strong>
            {noticeOpen && <span>{thread.about}</span>}
          </button>
          <span className="spacer" />
          <IconButton onClick={() => setNoticeOpen((v) => !v)}>
            <Icon name={noticeOpen ? "arrow-up" : "arrow-down"} size={14} />
          </IconButton>
        </motion.div>
      )}

      {!canPost && (
        <div className="readonly-bar"><Icon name="lock" size={14} />
          此群組僅限群主/管理員發言 / Only owner/admins can post</div>
      )}

      <div className="wallpaper" aria-hidden="true" />

      <div className="msg-scroll" ref={listRef}>
        <div className="msg-inner">
          <motion.button className="load-older" onClick={() => useApp.getState().loadOlder()}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Icon name="arrow-up" size={13} /> {t("loadOlder")}
          </motion.button>
          {grouped.map((g) => (
            <div key={g.key} className="day-group">
              <motion.div className="day-sep" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <span>{g.label}</span>
              </motion.div>
              <AnimatePresence initial={false}>
                {g.items.map((m, i) => (
                  <div id={`msg-${m.id}`} key={m.id}>
                    <MessageBubble m={m} thread={thread} index={i} />
                  </div>
                ))}
              </AnimatePresence>
            </div>
          ))}
          {!list.length && (
            <motion.div className="no-msg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Icon name="clover" size={22} /> {t("noMessages")}
            </motion.div>
          )}
          <div className="scroll-anchor" />
        </div>
      </div>

      <AnimatePresence>
        {showJump && (
          <motion.button className="jump-btn" initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
            whileHover={{ scale: 1.1 }} onClick={() => listRef.current?.scrollTo({
              top: listRef.current.scrollHeight, behavior: "smooth",
            })}><Icon name="arrow-down" size={18} /></motion.button>
        )}
      </AnimatePresence>

      <Composer threadId={thread.id} readOnly={!canPost} />
    </>
  );
}
