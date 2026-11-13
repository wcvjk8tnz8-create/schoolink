import type { CSSProperties } from "react";
import type { Lang, Message, Thread, User } from "./types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** FNV-1a → 相近 id 也能拿到差异大的色相 */
export function hue(s: string): number {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 360;
}

export function initials(name: string): string {
  const n = String(name || "?").trim();
  if (!n) return "?";
  // 中文取最后一字，英文取首字母
  if (/[\u3400-\u9fff]/.test(n)) return n.slice(-1);
  return n.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
}

export function avatarStyle(seed: string) {
  const h = hue(seed);
  return {
    background: `linear-gradient(140deg, hsl(${h} 68% 62%), hsl(${(h + 42) % 360} 66% 46%))`,
  } as CSSProperties;
}

export function fmtTime(ts: number, lang: Lang): string {
  return new Date(ts).toLocaleTimeString(lang === "en" ? "en-GB" : "zh-HK", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function fmtDay(ts: number, lang: Lang, today: string, yesterday: string): string {
  const now = new Date();
  const k = dayKey(ts);
  if (k === dayKey(now.getTime())) return today;
  if (k === dayKey(now.getTime() - 86_400_000)) return yesterday;
  return new Date(ts).toLocaleDateString(lang === "en" ? "en-GB" : "zh-HK", {
    year: "numeric", month: "long", day: "numeric",
  });
}

export function dayKeyOf(ts: number) { return dayKey(ts); }

export function greeting(lang: Lang, morning: string, afternoon: string, evening: string, night: string): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return morning;
  if (h >= 12 && h < 18) return afternoon;
  if (h >= 18 && h < 23) return evening;
  return night;
}

export function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDuration(sec: number | null): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtLastSeen(ts: number, lang: Lang, label: string): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 90_000) return lang === "en" ? "online" : "在線";
  return label.replace("{time}", fmtTime(ts, lang));
}

export function threadTitle(t: Thread, meId: string): string {
  if (t.type === "group") return t.name || "群組";
  const other = t.members.find((m) => m.id !== meId);
  return other?.display_name || "私聊";
}

export function threadOther(t: Thread, meId: string): User | undefined {
  return t.members.find((m) => m.id !== meId);
}

export function preview(t: Thread, t_fn: (k: string) => string): string {
  if (!t.last_body) return "";
  const prefix = t.type === "group" && t.last_sender
    ? `${t.members.find((m) => m.id === t.last_sender)?.display_name || ""}: `
    : "";
  switch (t.last_kind) {
    case "image": return prefix + "📷 " + t_fn("image");
    case "audio": return prefix + "🎤 " + t_fn("audio");
    case "file": return prefix + "📎 " + t_fn("file");
    default: return prefix + t.last_body;
  }
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
export function linkify(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
    .replace(URL_RE, (u) => `<a href="${u.replace(/&amp;/g, "&")}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}

export function isMine(m: Message, meId: string) { return m.sender_id === meId; }

export function readableTime(ts: number, lang: Lang) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return lang === "en" ? "just now" : "剛剛";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  return fmtTime(ts, lang);
}

export function debounce<T extends (...a: never[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function mediaUrl(key: string | null, base: string): string {
  if (!key) return "";
  return base ? `${base.replace(/\/+$/, "")}/${key}` : `/api/file/${encodeURIComponent(key)}`;
}

export const EMOJIS = ["😀", "😂", "🥹", "😍", "🤔", "😭", "🥳", "😴",
  "👍", "👏", "🙏", "💪", "🎉", "🍀", "❤️", "🔥", "✨", "📚", "✅", "💡",
  "🐱", "🌈", "☀️", "🌙", "⚡", "🎈", "🍕", "☕"];

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "🍀"];
