"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { IconButton, Spinner, spring, softSpring } from "./ui";
import { EMOJIS, cx } from "@/lib/utils";

export default function Composer({ threadId }: { threadId: string }) {
  const t = useApp((s) => s.t);
  const me = useApp((s) => s.me);
  const threads = useApp((s) => s.threads);
  const draft = useApp((s) => s.drafts[threadId] || "");
  const replyTo = useApp((s) => s.replyTo);
  const r2Enabled = useApp((s) => s.config.r2Enabled);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mention, setMention] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; start: number } | null>(null);
  const thread = threads.find((x) => x.id === threadId);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

  useEffect(() => {
    const m = /(?:^|\s)@([\p{L}\d]*)$/u.exec(draft);
    setMention(m ? m[1].toLowerCase() : null);
  }, [draft]);

  const send = () => {
    const body = draft.trim();
    if (!body || busy) return;
    useApp.getState().setDraft("");
    useApp.getState().send({
      kind: "text", body, reply_to: replyTo?.id || null,
    });
    setEmojiOpen(false); setAttachOpen(false);
    taRef.current?.focus();
  };

  const uploadAndSend = async (file: File, kind: "image" | "file" | "audio", duration?: number) => {
    setBusy(true);
    try {
      const r = await useApp.getState().upload(file);
      await useApp.getState().send({
        kind, body: r.url, media_key: r.key, media_name: r.name,
        media_size: r.size, media_type: r.mime, duration: duration ?? null,
        reply_to: replyTo?.id || null,
      });
    } catch (e) {
      useApp.getState().toastMsg((e as Error).message, "err");
    } finally { setBusy(false); }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "file") => {
    const f = e.target.files?.[0];
    if (f) uploadAndSend(f, kind);
    e.target.value = "";
    setAttachOpen(false);
  };

  const toggleRecord = async () => {
    if (recording) {
      const rec = recRef.current;
      if (rec) {
        rec.recorder.onstop = () => {
          const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || "audio/webm" });
          const duration = Math.max(1, Math.round((Date.now() - rec.start) / 1000));
          const ext = (rec.recorder.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: rec.recorder.mimeType || "audio/webm" });
          rec.stream.getTracks().forEach((tr) => tr.stop());
          uploadAndSend(file, "audio", duration);
        };
        rec.recorder.stop();
      }
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recRef.current = { recorder, stream, chunks, start: Date.now() };
      recorder.start();
      setRecording(true);
    } catch {
      useApp.getState().toastMsg("Microphone permission denied", "err");
    }
  };

  const insertMention = (name: string) => {
    const next = draft.replace(/(?:^|\s)@[\p{L}\d]*$/u, (m) => `${m.startsWith(" ") ? " " : ""}@${name} `);
    useApp.getState().setDraft(next);
    setMention(null);
    taRef.current?.focus();
  };

  const mentionCandidates = mention !== null && thread?.type === "group"
    ? thread.members.filter((m) => m.id !== me?.id &&
        m.display_name.toLowerCase().includes(mention)).slice(0, 6)
    : [];

  return (
    <div className="composer-area">
      <AnimatePresence>
        {replyTo && (
          <motion.div className="reply-bar" initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <span className="reply-accent" />
            <div><strong>↩ {replyTo.sender_id === me?.id ? t("you") :
              thread?.members.find((x) => x.id === replyTo.sender_id)?.display_name}</strong>
              <small>{replyTo.body || `[${replyTo.kind}]`}</small></div>
            <IconButton onClick={() => useApp.getState().setReplyTo(null)}>✕</IconButton>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mentionCandidates.length > 0 && (
          <motion.div className="mention-pop" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}>
            {mentionCandidates.map((m) => (
              <button key={m.id} onClick={() => insertMention(m.display_name)}>@{m.display_name}</button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {emojiOpen && (
          <motion.div className="emoji-picker" initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={softSpring}>
            <div className="emoji-head">{t("emoji")}<IconButton onClick={() => setEmojiOpen(false)}>✕</IconButton></div>
            <div className="emoji-grid">
              {EMOJIS.map((e) => (
                <motion.button key={e} whileHover={{ scale: 1.35 }} whileTap={{ scale: 0.9 }}
                  onClick={() => { useApp.getState().setDraft(draft + e); setEmojiOpen(false); taRef.current?.focus(); }}>
                  {e}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {attachOpen && (
          <motion.div className="attach-menu" initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.94 }}
            transition={softSpring}>
            <button onClick={() => imgRef.current?.click()}><span>🖼</span>{t("photo")}</button>
            <button onClick={() => fileRef.current?.click()}><span>📎</span>{t("fileAttach")}</button>
            <button onClick={() => { setAttachOpen(false); toggleRecord(); }}><span>🎤</span>{t("voice")}</button>
            <small>{t("uploadHint")}</small>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cx("composer", recording && "recording")}>
        {r2Enabled && (
          <IconButton title={t("attach")} onClick={() => { setAttachOpen((v) => !v); setEmojiOpen(false); }}>
            <motion.span animate={{ rotate: attachOpen ? 45 : 0 }} transition={spring}>＋</motion.span>
          </IconButton>
        )}
        <IconButton title={t("emoji")} onClick={() => { setEmojiOpen((v) => !v); setAttachOpen(false); }}>☺</IconButton>
        <textarea ref={taRef} value={draft} rows={1}
          onChange={(e) => useApp.getState().setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }}
          placeholder={recording ? t("recording") : t("composerPh")}
          disabled={recording} />
        {recording ? (
          <motion.button className="rec-btn" onClick={toggleRecord}
            animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.1, repeat: Infinity }}>⏹</motion.button>
        ) : (
          <motion.button className="send-btn" onClick={send} disabled={!draft.trim() || busy}
            whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.9 }} transition={spring}>
            {busy ? <Spinner size={16} /> : "➤"}
          </motion.button>
        )}
      </div>
      <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e, "image")} />
      <input ref={fileRef} type="file" hidden
        accept=".pdf,.txt,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.json"
        onChange={(e) => onFile(e, "file")} />
    </div>
  );
}
