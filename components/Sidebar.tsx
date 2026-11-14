"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { Clover } from "./Logo";
import { Avatar, IconButton, ListSkeleton, spring, softSpring } from "./ui";
import { Icon } from "./Icon";
import { usePrefs } from "@/lib/prefs";
import { threadTitle, threadOther, preview, fmtTime, cx, dayKeyOf } from "@/lib/utils";
import type { Thread, Filter } from "@/lib/types";

function rowTime(ts: number | null, lang: string, today: string, yesterday: string, clock: "24h" | "12h"): string {
  if (!ts) return "";
  const k = dayKeyOf(ts);
  if (k === dayKeyOf(Date.now())) return fmtTime(ts, lang as "en", clock);
  if (k === dayKeyOf(Date.now() - 86_400_000)) return yesterday;
  return new Date(ts).toLocaleDateString(lang === "en" ? "en-GB" : "zh-HK", { month: "numeric", day: "numeric" });
}

function ThreadRow({ t, index }: { t: Thread; index: number }) {
  const me = useApp((s) => s.me);
  const lang = useApp((s) => s.lang);
  const activeId = useApp((s) => s.activeId);
  const tFn = useApp((s) => s.t);
  const clock = usePrefs((s) => s.clock);
  const localMute = usePrefs((s) => (s.muteUntil[t.id] || 0) > Date.now());
  const other = threadOther(t, me?.id || "");
  const name = threadTitle(t, me?.id || "");
  const isOnline = t.type === "direct" && Boolean(other && Date.now() - (other.last_seen || 0) < 90_000);

  return (
    <motion.button
      layout
      className={cx("thread-row", activeId === t.id && "on")}
      onClick={() => useApp.getState().openThread(t.id)}
      initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }} transition={{ delay: Math.min(index * 0.035, 0.3), ...softSpring }}
      whileHover={{ x: 3 }} whileTap={{ scale: 0.985 }}
    >
      <Avatar user={t.type === "direct" ? other : undefined} name={name} id={t.id}
        size={46} online={isOnline} avatarKey={t.type === "group" ? t.avatar_key : undefined} />
      <div className="tr-main">
        <div className="tr-top">
          <strong>{name}</strong>
          <span className="tr-time">{rowTime(t.last_at, lang, tFn("today"), tFn("yesterday"), clock)}</span>
        </div>
        <div className="tr-bottom">
          <span className="tr-preview">{preview(t, tFn) || tFn("noMessages")}</span>
          {t.pinned ? <Icon name="pin" size={12} className="tr-flag" /> : null}
          {(t.muted || localMute) ? <Icon name="bell-off" size={12} className="tr-flag" /> : null}
          {t.unread > 0 && (
            <motion.span key={t.unread} className="tr-unread"
              initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={spring}>
              {t.unread > 99 ? "99+" : t.unread}
            </motion.span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export default function Sidebar() {
  const t = useApp((s) => s.t);
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me);
  const threads = useApp((s) => s.threads);
  const filter = useApp((s) => s.filter);
  const [q, setQ] = useState("");
  const [loading] = useState(false);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return threads.filter((x) => {
      if (filter === "archived" ? !x.archived : x.archived) return false;
      if (filter === "unread" && !x.unread) return false;
      if (filter === "groups" && x.type !== "group") return false;
      if (filter === "starred" && !x.starred && !x.pinned) return false;
      if (kw) {
        const name = threadTitle(x, me?.id || "").toLowerCase();
        const last = (x.last_body || "").toLowerCase();
        const members = x.members.map((m) => m.display_name.toLowerCase()).join(" ");
        if (!name.includes(kw) && !last.includes(kw) && !members.includes(kw)) return false;
      }
      return true;
    });
  }, [threads, filter, q, me?.id]);

  const pinned = filtered.filter((x) => x.pinned && filter !== "archived");
  const rest = filtered.filter((x) => !x.pinned || filter === "archived");

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("all") }, { key: "unread", label: t("unread") },
    { key: "groups", label: t("groups") }, { key: "starred", label: t("starredFilter") },
    { key: "archived", label: t("archived") },
  ];

  return (
    <aside className="sidebar">
      <div className="side-top">
        <div className="brand">
          <Clover size={34} animate={false} />
          <div><strong>Schoolink</strong><span>{t("brandTag")}</span></div>
          <span className="spacer" />
          <IconButton className="green" title={t("newChat")} onClick={() => useApp.getState().setModal("new-chat")}><Icon name="plus" size={18} /></IconButton>
        </div>
        <div className="side-search">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} />
          <IconButton title={t("searchTitle")} onClick={() => {
            useApp.getState().runSearch(""); useApp.getState().setModal("search");
          }}><Icon name="search" size={16} /></IconButton>
        </div>
        <div className="filter-row">
          {filters.map((f) => (
            <motion.button key={f.key} className={cx("chip", filter === f.key && "on")}
              onClick={() => useApp.getState().setFilter(f.key)} whileTap={{ scale: 0.94 }}>
              {filter === f.key && <motion.i layoutId="filter-active" className="chip-bg" transition={spring} />}
              <span>{f.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="thread-scroll">
        {loading ? <ListSkeleton /> : (
          <AnimatePresence initial={false}>
            {pinned.length > 0 && (
              <div className="thread-group" key="pinned">
                <div className="group-label"><Icon name="pin" size={12} /> {t("pinned")}</div>
                {pinned.map((x, i) => <ThreadRow t={x} index={i} key={x.id} />)}
              </div>
            )}
            {rest.length > 0 && (
              <div className="thread-group" key="rest">
                {pinned.length > 0 && <div className="group-label">{t("all")}</div>}
                {rest.map((x, i) => <ThreadRow t={x} index={i + pinned.length} key={x.id} />)}
              </div>
            )}
            {!filtered.length && (
              <motion.div key="empty" className="side-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Clover size={44} animate={false} /><strong>{t("noThreads")}</strong><p>{t("noThreadsHint")}</p>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <div className="side-bottom">
        <motion.button className="me-row" onClick={() => useApp.getState().setModal("profile")}
          whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
          <Avatar user={me} size={36} online />
          <div><strong>{me?.display_name}</strong><small>{me?.student_id}</small></div>
        </motion.button>
        <IconButton title={t("starredTitle")} onClick={() => {
          useApp.getState().loadStarred(); useApp.getState().setModal("starred");
        }}><Icon name="star" size={17} /></IconButton>
        <IconButton title={t("settingsTitle")} onClick={() => useApp.getState().setModal("settings")}><Icon name="settings" size={17} /></IconButton>
        <IconButton title={t("logout")} onClick={() => useApp.getState().logout()}><Icon name="logout" size={17} /></IconButton>
      </div>
      <div className="side-status">
        <span className="pulse-dot" />
        {t("connected")} · {lang === "en" ? "EN" : lang === "zh-HK" ? "繁體" : "简体"}
      </div>
    </aside>
  );
}
