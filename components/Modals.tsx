"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { Avatar, IconButton, Segmented, spring, softSpring } from "./ui";
import { Icon } from "./Icon";
import Customize, { ProfileCustomize, GroupCustomize } from "./Customize";
import { usePrefs } from "@/lib/prefs";
import { LANGS, LANG_LABEL } from "@/lib/i18n";
import { threadTitle, fmtTime, cx } from "@/lib/utils";
import type { Message, Theme } from "@/lib/types";

function Shell({ title, children, wide = false }: {
  title: string; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => useApp.getState().setModal(null)}>
      <motion.div className={cx("modal", wide && "wide")}
        initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2>
          <IconButton onClick={() => useApp.getState().setModal(null)}><Icon name="close" size={16} /></IconButton></div>
        <div className="modal-body">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function NewChat() {
  const t = useApp((s) => s.t);
  const me = useApp((s) => s.me);
  const users = useApp((s) => s.users);
  const mode = useApp((s) => s.newChatMode);
  const selected = useApp((s) => s.selectedUsers);
  const groupName = useApp((s) => s.groupName);
  const q = useApp((s) => s.userSearch);
  const [busy, setBusy] = useState(false);
  const list = users.filter((u) =>
    !q || u.display_name.toLowerCase().includes(q.toLowerCase()) ||
    u.student_id.toLowerCase().includes(q.toLowerCase()));

  const pick = (id: string) => {
    const s = useApp.getState();
    if (mode === "direct") {
      s.toggleSelected(id);
      s.createChat().catch((e) => s.toastMsg((e as Error).message, "err"));
    } else s.toggleSelected(id);
  };
  const create = async () => {
    setBusy(true);
    try { await useApp.getState().createChat(); }
    catch (e) { useApp.getState().toastMsg((e as Error).message, "err"); }
    finally { setBusy(false); }
  };

  return (
    <Shell title={t("newChatTitle")}>
      <Segmented value={mode} onChange={(v) => useApp.getState().setNewChatMode(v)}
        options={[{ key: "direct", label: t("tabDirect") }, { key: "group", label: t("tabGroup") }] as const} />
      {mode === "group" && <div className="field"><label>{t("groupName")}</label>
        <input value={groupName} onChange={(e) => useApp.getState().setGroupName(e.target.value)}
          placeholder={t("groupNamePh")} /></div>}
      <div className="side-search"><Icon name="search" size={15} />
        <input value={q} onChange={(e) => useApp.getState().setUserSearch(e.target.value)}
          placeholder={t("userSearch")} /></div>
      <div className="pick-list">
        <AnimatePresence initial={false}>
          {list.map((u, i) => (
            <motion.button key={u.id} className={cx("pick-row", selected.includes(u.id) && "on")}
              onClick={() => pick(u.id)} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.2) }} whileTap={{ scale: 0.98 }}>
              <Avatar user={u} size={38} />
              <div><strong>{u.display_name}</strong><small>{u.student_id} · {u.email}</small></div>
              <motion.span className="pick-check" animate={{ scale: selected.includes(u.id) ? 1 : 0 }}><Icon name="check" size={14} /></motion.span>
            </motion.button>
          ))}
        </AnimatePresence>
        {!list.length && <div className="muted-line">{t("noResults")}</div>}
      </div>
      {mode === "group" && (
        <div className="modal-foot">
          <span className="muted-line">{t("selected", { n: selected.length })}</span>
          <button className="btn primary" disabled={busy || !selected.length || !groupName.trim()}
            onClick={create}>{t("create")}</button>
        </div>
      )}
      {me && <span className="sr-only">{me.id}</span>}
    </Shell>
  );
}

function Profile() {
  const t = useApp((s) => s.t);
  return <Shell title={t("profileTitle")} wide><ProfileCustomize /></Shell>;
}

function Settings() {
  return <Customize />;
}

function GroupInfo() {
  const t = useApp((s) => s.t);
  const thread = useApp((s) => s.threads.find((x) => x.id === s.activeId));
  if (!thread) return null;
  return <Shell title={t("groupInfo")} wide><GroupCustomize thread={thread} /></Shell>;
}

function AddMembers() {
  const t = useApp((s) => s.t);
  const users = useApp((s) => s.users);
  const thread = useApp((s) => s.threads.find((x) => x.id === s.activeId));
  const [sel, setSel] = useState<string[]>([]);
  const inGroup = new Set(thread?.members.map((m) => m.id));
  const list = users.filter((u) => !inGroup.has(u.id));
  return (
    <Shell title={t("addMember")}>
      <div className="pick-list">
        {list.map((u) => (
          <motion.button key={u.id} className={cx("pick-row", sel.includes(u.id) && "on")}
            onClick={() => setSel((s) => s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id])}
            whileTap={{ scale: 0.98 }}>
            <Avatar user={u} size={36} /><div><strong>{u.display_name}</strong><small>{u.student_id}</small></div>
            <span className="pick-check" style={{ transform: `scale(${sel.includes(u.id) ? 1 : 0})` }}><Icon name="check" size={14} /></span>
          </motion.button>
        ))}
        {!list.length && <div className="muted-line">{t("noResults")}</div>}
      </div>
      <div className="modal-foot"><button className="btn primary" disabled={!sel.length}
        onClick={async () => { await useApp.getState().addMembers(sel); useApp.getState().setModal(null); }}>
        <Icon name="plus" size={14} /> {t("addMember")} ({sel.length})</button></div>
    </Shell>
  );
}

function MessageCard({ m, onClick }: { m: Message; onClick?: () => void }) {
  const lang = useApp((s) => s.lang);
  const clock = usePrefs((s) => s.clock);
  const t = useApp((s) => s.t);
  const thread = useApp((s) => s.threads.find((x) => x.id === m.thread_id));
  const sender = thread?.members.find((x) => x.id === m.sender_id);
  return (
    <motion.button className="msg-card" onClick={onClick} whileHover={{ x: 3 }} initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }} transition={softSpring}>
      <Avatar user={sender} name={sender?.display_name} size={34} />
      <div><div className="mc-top"><strong>{thread ? threadTitle(thread, useApp.getState().me?.id || "") : m.thread_id}</strong>
        <small>{fmtTime(m.created_at, lang, clock)}</small></div>
        <span>{m.deleted_at ? t("deleted") : m.kind === "text" ? m.body : `[${m.kind}]`}</span></div>
    </motion.button>
  );
}

function Starred() {
  const t = useApp((s) => s.t);
  const list = useApp((s) => s.starredMsgs);
  return (
    <Shell title={t("starredTitle")} wide>
      <div className="card-list">
        {list.map((m) => <MessageCard key={m.id} m={m} onClick={() => {
          useApp.getState().setModal(null);
          useApp.getState().openThread(m.thread_id);
        }} />)}
        {!list.length && <div className="muted-line">{t("noResults")}</div>}
      </div>
    </Shell>
  );
}

function Search() {
  const t = useApp((s) => s.t);
  const q = useApp((s) => s.searchQuery);
  const results = useApp((s) => s.searchResults);
  const activeId = useApp((s) => s.activeId);
  const [scope, setScope] = useState<"all" | "thread">("all");
  const run = (v: string) => {
    useApp.getState().setSearch(v);
    useApp.getState().runSearch(v, scope === "thread" ? activeId || undefined : undefined);
  };
  return (
    <Shell title={t("searchTitle")} wide>
      <div className="side-search big"><Icon name="search" size={15} />
        <input autoFocus value={q} onChange={(e) => run(e.target.value)} placeholder={t("searchMsgPh")} /></div>
      <Segmented value={scope} onChange={(v) => { setScope(v); run(q); }}
        options={[{ key: "all", label: t("all") }, { key: "thread", label: t("chats") }] as const} />
      <div className="card-list">
        {results.map((m) => <MessageCard key={m.id} m={m} onClick={() => {
          useApp.getState().setModal(null);
          useApp.getState().openThread(m.thread_id);
        }} />)}
        {q && !results.length && <div className="muted-line">{t("noResults")}</div>}
      </div>
    </Shell>
  );
}

function Forward() {
  const t = useApp((s) => s.t);
  const msg = useApp((s) => s.forwardMsg);
  const threads = useApp((s) => s.threads);
  if (!msg) return null;
  return (
    <Shell title={t("forward")}>
      <div className="fwd-preview">{msg.body || `[${msg.kind}]`}</div>
      <div className="pick-list">
        {threads.map((th) => (
          <motion.button key={th.id} className="pick-row" whileTap={{ scale: 0.98 }}
            onClick={async () => {
              const s = useApp.getState();
              s.setModal(null);
              await s.openThread(th.id);
              await s.send({
                kind: msg.kind, body: msg.body, media_key: msg.media_key,
                media_name: msg.media_name, media_size: msg.media_size,
                media_type: msg.media_type, duration: msg.duration,
                forwarded_from: msg.sender_id,
              });
            }}>
            <Avatar name={threadTitle(th, useApp.getState().me?.id || "")} id={th.id} size={36} />
            <div><strong>{threadTitle(th, useApp.getState().me?.id || "")}</strong>
              <small>{th.type === "group" ? t("groups") : t("tabDirect")}</small></div>
          </motion.button>
        ))}
      </div>
    </Shell>
  );
}

function Lightbox() {
  const t = useApp((s) => s.t);
  const lb = useApp((s) => s.lightbox);
  if (!lb) return null;
  return (
    <motion.div className="overlay lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => useApp.getState().setLightbox(null)}>
      <motion.img src={lb.url} alt={lb.name} initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        onClick={(e) => e.stopPropagation()} />
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span>{lb.name}</span>
        <a className="btn" href={lb.url} download={lb.name} target="_blank" rel="noreferrer"><Icon name="download" size={14} /> {t("download")}</a>
        <IconButton onClick={() => useApp.getState().setLightbox(null)}><Icon name="close" size={16} /></IconButton>
      </div>
    </motion.div>
  );
}

export default function Modals() {
  const modal = useApp((s) => s.modal);
  return (
    <AnimatePresence mode="wait">
      {modal === "new-chat" && <NewChat key="nc" />}
      {modal === "profile" && <Profile key="pf" />}
      {modal === "settings" && <Settings key="st" />}
      {modal === "group-info" && <GroupInfo key="gi" />}
      {modal === "members" && <AddMembers key="mb" />}
      {modal === "starred" && <Starred key="sr" />}
      {modal === "search" && <Search key="se" />}
      {modal === "forward" && <Forward key="fw" />}
      {modal === "lightbox" && <Lightbox key="lb" />}
    </AnimatePresence>
  );
}
