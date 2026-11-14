"use client";

/**
 * 设备级自定义偏好（localStorage，不上传服务器）。
 * 外观、输入习惯、通知、快捷短语都属于「这台设备怎么用」，
 * 放本地才能即时生效、离线可用，也不给 D1 添无谓的写入。
 */

import { create } from "zustand";

export type AccentKey = "violet" | "blue" | "teal" | "green" | "amber" | "rose";
export type WallpaperKey = "dots" | "grid" | "waves" | "plain";
export type FontKey = "small" | "normal" | "large";
export type ClockKey = "24h" | "12h";

export const ACCENTS: { key: AccentKey; label: string; hex: string }[] = [
  { key: "violet", label: "紫", hex: "#8b7bff" },
  { key: "blue", label: "蓝", hex: "#4d94ff" },
  { key: "teal", label: "青", hex: "#2fb8b0" },
  { key: "green", label: "绿", hex: "#3fbf72" },
  { key: "amber", label: "橙", hex: "#f0a13c" },
  { key: "rose", label: "粉", hex: "#f06f96" },
];

export const WALLPAPERS: { key: WallpaperKey; label: string }[] = [
  { key: "dots", label: "点阵" },
  { key: "grid", label: "格纹" },
  { key: "waves", label: "波纹" },
  { key: "plain", label: "纯色" },
];

export const FONTS: { key: FontKey; label: string }[] = [
  { key: "small", label: "小" },
  { key: "normal", label: "中" },
  { key: "large", label: "大" },
];

export const THREAD_ACCENTS: Record<string, string> = {
  violet: "#8b7bff", blue: "#4d94ff", teal: "#2fb8b0",
  green: "#3fbf72", amber: "#f0a13c", rose: "#f06f96",
};

export const DEFAULT_PHRASES = [
  "收到，謝謝！ / 收到，谢谢！ / Got it, thanks!",
  "明天小息交 / 明天小息交 / Hand it in tomorrow",
  "我遲少少到 / 我迟一点到 / I'll be a bit late",
  "可以幫我睇睇嗎？ / 可以帮我看看吗？ / Could you check this?",
];

export interface Prefs {
  accent: AccentKey;
  wallpaper: WallpaperKey;
  font: FontKey;
  compact: boolean;
  animations: boolean;
  clock: ClockKey;
  sendWithEnter: boolean;
  notifications: boolean;
  quickPhrases: string[];
  /** 会话静音到期时间戳；0 = 未静音，Infinity 存成 4102444800000（2100 年） */
  muteUntil: Record<string, number>;
  patch: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  addPhrase: (text: string) => void;
  removePhrase: (index: number) => void;
  setMute: (threadId: string, until: number) => void;
  isMuted: (threadId: string) => boolean;
}

const KEY = "schoolink.prefs.v1";

const DEFAULTS = {
  accent: "violet" as AccentKey,
  wallpaper: "dots" as WallpaperKey,
  font: "normal" as FontKey,
  compact: false,
  animations: true,
  clock: "24h" as ClockKey,
  sendWithEnter: true,
  notifications: true,
  quickPhrases: [...DEFAULT_PHRASES],
  muteUntil: {} as Record<string, number>,
};

function load(): typeof DEFAULTS {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<typeof DEFAULTS>;
    return {
      ...DEFAULTS, ...raw,
      quickPhrases: Array.isArray(raw.quickPhrases) ? raw.quickPhrases.slice(0, 24) : [...DEFAULT_PHRASES],
      muteUntil: raw.muteUntil && typeof raw.muteUntil === "object" ? raw.muteUntil : {},
    };
  } catch { return { ...DEFAULTS, quickPhrases: [...DEFAULT_PHRASES], muteUntil: {} }; }
}

function persist(state: Prefs) {
  const { accent, wallpaper, font, compact, animations, clock, sendWithEnter,
    notifications, quickPhrases, muteUntil } = state;
  try {
    localStorage.setItem(KEY, JSON.stringify({ accent, wallpaper, font, compact, animations,
      clock, sendWithEnter, notifications, quickPhrases, muteUntil }));
  } catch { /* 隐私模式下不持久化，内存里仍生效 */ }
}

export const usePrefs = create<Prefs>((set, get) => ({
  ...(typeof window !== "undefined" ? load() : {
    ...DEFAULTS, quickPhrases: [...DEFAULT_PHRASES], muteUntil: {},
  }),
  patch: (key, value) => {
    set({ [key]: value } as Partial<Prefs>);
    persist(get());
  },
  addPhrase: (text) => {
    const clean = text.trim().slice(0, 120);
    if (!clean || get().quickPhrases.length >= 24) return;
    set({ quickPhrases: [...get().quickPhrases, clean] });
    persist(get());
  },
  removePhrase: (index) => {
    set({ quickPhrases: get().quickPhrases.filter((_, i) => i !== index) });
    persist(get());
  },
  setMute: (threadId, until) => {
    const next = { ...get().muteUntil };
    if (until > 0) next[threadId] = until; else delete next[threadId];
    set({ muteUntil: next });
    persist(get());
  },
  isMuted: (threadId) => (get().muteUntil[threadId] || 0) > Date.now(),
}));

export const MUTE_FOREVER = 4102444800000;

export function muteOptions(): { label: string; until: number }[] {
  const now = Date.now();
  return [
    { label: "1 小時 / 1 小时 / 1 hour", until: now + 3600_000 },
    { label: "8 小時 / 8 小时 / 8 hours", until: now + 8 * 3600_000 },
    { label: "1 天 / 1 day", until: now + 86400_000 },
    { label: "永久 / Always", until: MUTE_FOREVER },
  ];
}

/** 把偏好写到 <html>，CSS 与 Motion 都从这里读 */
export function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.accent = p.accent;
  root.dataset.wallpaper = p.wallpaper;
  root.dataset.font = p.font;
  root.classList.toggle("compact", p.compact);
  root.classList.toggle("no-motion", !p.animations);
  root.dataset.clock = p.clock;
}
