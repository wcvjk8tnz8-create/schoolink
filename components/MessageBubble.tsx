"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { Avatar, spring, softSpring } from "./ui";
import { REACTION_KEYS, faceKeyOf } from "@/lib/faces";
import { FaceIcon, Icon } from "./Icon";
import {
  fmtTime, fmtSize, fmtDuration, linkify, mediaUrl, cx,
} from "@/lib/utils";
import type { Message, Thread } from "@/lib/types";

/** 回应贴纸：新数据存 key，旧数据里的 emoji 字符也能映射到 SVG */
function ReactionGlyph({ v }: { v: string }) {
  const k = faceKeyOf(v);
  return k ? <FaceIcon name={k} size={15} /> : <span>{v}</span>;
}

function AudioPlayer({ m, url }: { m: Message; url: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const t = useApp((s) => s.t);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  return (
    <div className="audio-player">
      <motion.button className="audio-btn" onClick={toggle} whileTap={{ scale: 0.88 }}>
        {playing ? <Icon name="pause" size={16} /> : <Icon name="play" size={16} />}
      </motion.button>
      <div className="audio-wave" onClick={toggle}>
        {Array.from({ length: 26 }).map((_, i) => (
          <motion.i key={i}
            animate={playing ? { scaleY: [0.35, 1, 0.5, 0.9, 0.35] } : { scaleY: 0.42 + (i % 5) * 0.12 }}
            transition={playing ? { duration: 0.9 + (i % 4) * 0.12, repeat: Infinity, delay: i * 0.03 } : {}}
            style={{ opacity: progress > i / 26 ? 1 : 0.55 }}
          />
        ))}
      </div>
      <span className="audio-time">{fmtDuration(m.duration)}</span>
      <audio ref={ref} src={url} preload="metadata"
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setProgress(a.duration ? a.currentTime / a.duration : 0);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); }} />
      <a className="audio-dl" href={url} download={m.media_name || "voice"} title={t("download")}><Icon name="download" size={16} /></a>
    </div>
  );
}

function Ticks({ m, thread }: { m: Message; thread: Thread }) {
  const me = useApp((s) => s.me);
  const readsForThread = useApp((s) => s.reads[m.thread_id]);
  const reads = readsForThread || {};
  if (m.sender_id !== me?.id || m.pending) return null;
  const others = thread.members.filter((x) => x.id !== me?.id);
  const readers = others.filter((x) => (reads[x.id] || 0) >= m.created_at).length;
  const allRead = others.length > 0 && readers >= others.length;
  const someRead = readers > 0;
  return (
    <motion.span className={cx("ticks", allRead && "read")}
      initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
      title={allRead ? "Read" : someRead ? "Delivered" : "Sent"}>
      {m.pending ? <Icon name="clock" size={13} /> :
        allRead || someRead ? <Icon name="check-double" size={14} /> : <Icon name="check" size={13} />}
    </motion.span>
  );
}

export default function MessageBubble({ m, thread, index }: {
  m: Message; thread: Thread; index: number;
}) {
  const me = useApp((s) => s.me);
  const lang = useApp((s) => s.lang);
  const t = useApp((s) => s.t);
  const cfg = useApp((s) => s.config);
  const [menu, setMenu] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const mine = m.sender_id === me?.id;
  const sender = thread.members.find((x) => x.id === m.sender_id);
  const mediaSrc = m.kind === "image" || m.kind === "audio" || m.kind === "file"
    ? (m.body?.startsWith("/api/") || m.body?.startsWith("http") ? m.body : mediaUrl(m.media_key, cfg.r2PublicBaseUrl))
    : "";

  if (m.kind === "system") {
    return (
      <motion.div className="system-msg" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <span>{m.body}</span>
      </motion.div>
    );
  }

  const doAction = async (a: string) => {
    const s = useApp.getState();
    setMenu(false);
    switch (a) {
      case "reply": s.setReplyTo(m); break;
      case "copy":
        try { await navigator.clipboard.writeText(m.body); s.toastMsg(s.t("copyOk"), "ok"); } catch { /* noop */ }
        break;
      case "forward": s.setForwardMsg(m); break;
      case "star": await s.star(m); break;
      case "edit": {
        const next = window.prompt(s.t("editHint"), m.body);
        if (next && next !== m.body) await s.edit(m.id, next);
        break;
      }
      case "delete":
        if (window.confirm(s.t("confirmDelete"))) await s.remove(m.id);
        break;
    }
  };

  return (
    <motion.div
      className={cx("msg-row", mine && "mine")}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: Math.min(index * 0.018, 0.2), ...softSpring }}
      layout
    >
      {!mine && <Avatar user={sender} name={sender?.display_name} size={30} className="msg-avatar" />}
      <div className="bubble-wrap">
        <motion.div className={cx("bubble", Boolean(m.deleted_at) && "deleted", Boolean(m.failed) && "failed")}
          whileHover={{ y: -1 }} transition={spring}>
          {!mine && thread.type === "group" && (
            <div className="sender" style={{ color: `hsl(${(m.sender_id.charCodeAt(0) * 37) % 360} 70% 68%)` }}>
              {sender?.display_name || "?"}
            </div>
          )}

          {m.forwarded_from && <div className="fwd-label"><Icon name="forward" size={13} /> {t("forwarded")}</div>}

          {m.reply && (
            <div className="reply-quote" onClick={() => {
              const el = document.getElementById(`msg-${m.reply?.id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}>
              <strong>{m.reply.display_name}</strong>
              <span>{m.reply.body || `[${m.reply.kind}]`}</span>
            </div>
          )}

          {m.deleted_at ? (
            <div className="deleted-text"><Icon name="ban" size={15} /> {t("deleted")}</div>
          ) : m.kind === "image" ? (
            <motion.img className="msg-img" src={mediaSrc} alt={m.media_name || "image"}
              loading="lazy" onClick={() => useApp.getState().setLightbox({ url: mediaSrc, name: m.media_name || t("image") })}
              whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }} />
          ) : m.kind === "audio" ? (
            <AudioPlayer m={m} url={mediaSrc} />
          ) : m.kind === "file" ? (
            <a className="file-card" href={mediaSrc} download={m.media_name || "file"} target="_blank" rel="noreferrer">
              <span className="file-icon"><Icon name="paperclip" size={22} /></span>
              <span className="file-meta"><strong>{m.media_name || t("file")}</strong>
                <small>{fmtSize(m.media_size)} · {t("download")}</small></span>
              <span className="file-dl"><Icon name="download" size={16} /></span>
            </a>
          ) : (
            <div className="msg-text" dangerouslySetInnerHTML={{ __html: linkify(m.body) }} />
          )}

          <div className="msg-foot">
            {m.edited_at && <span className="edited">{t("edited")}</span>}
            <span>{fmtTime(m.created_at, lang)}</span>
            <Ticks m={m} thread={thread} />
            {m.starred && <span className="star-mark"><Icon name="star-filled" size={12} /></span>}
            {m.failed && <span className="failed-mark">!</span>}
          </div>

          {!m.deleted_at && (
            <button className="bubble-menu-btn" onClick={() => setMenu((v) => !v)} aria-label="more"><Icon name="more" size={16} /></button>
          )}

          <AnimatePresence>
            {m.reactions.length > 0 && (
              <motion.div className="reactions" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                {Object.entries(m.reactions.reduce<Record<string, { n: number; mine: boolean }>>((acc, r) => {
                  if (!acc[r.emoji]) acc[r.emoji] = { n: 0, mine: false };
                  acc[r.emoji].n++;
                  if (r.user_id === me?.id) acc[r.emoji].mine = true;
                  return acc;
                }, {})).map(([emoji, v]) => (
                  <motion.button key={emoji} className={cx("reaction", v.mine && "mine")}
                    onClick={() => useApp.getState().react(m.id, emoji)}
                    initial={{ scale: 0.4 }} animate={{ scale: 1 }} whileTap={{ scale: 0.86 }}
                    transition={spring}>
                    <ReactionGlyph v={emoji} /> <span>{v.n}</span>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {menu && !m.deleted_at && (
              <motion.div className="msg-menu" initial={{ opacity: 0, scale: 0.88, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}>
                <button onClick={() => { setEmojiOpen((v) => !v); }}><Icon name="smile" size={15} /> {t("emoji")}</button>
                <button onClick={() => doAction("reply")}><Icon name="reply" size={15} /> {t("reply")}</button>
                <button onClick={() => doAction("forward")}><Icon name="forward" size={15} /> {t("forward")}</button>
                <button onClick={() => doAction("star")}><Icon name={m.starred ? "star-filled" : "star"} size={15} /> {m.starred ? t("unstar") : t("star")}</button>
                <button onClick={() => doAction("copy")}><Icon name="copy" size={15} /> {t("copy")}</button>
                {mine && m.kind === "text" && <button onClick={() => doAction("edit")}><Icon name="edit" size={15} /> {t("edit")}</button>}
                {mine && <button className="danger" onClick={() => doAction("delete")}><Icon name="trash" size={15} /> {t("del")}</button>}
                <AnimatePresence>
                  {emojiOpen && (
                    <motion.div className="emoji-pop" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      {REACTION_KEYS.map((k) => (
                        <motion.button key={k} whileHover={{ scale: 1.3 }} whileTap={{ scale: 0.9 }}
                          onClick={async () => { await useApp.getState().react(m.id, k); setEmojiOpen(false); setMenu(false); }}>
                          <FaceIcon name={k} size={20} />
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
}
