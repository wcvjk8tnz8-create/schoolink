"use client";

import { create } from "zustand";
import { api, post, patch, del, uploadFile, ApiError } from "./api";
import { translate, LANGS } from "./i18n";
import type {
  Lang, Theme, User, Thread, Message, Config, Stats, WsEvent, Modal, Toast, Filter,
} from "./types";
import { mediaUrl } from "./utils";
import { usePrefs } from "./prefs";

type View = "loading" | "login" | "chat" | "admin-login" | "admin";
type Conn = "connecting" | "online" | "offline" | "reconnecting";

interface PendingItem {
  tempId: string;
  threadId: string;
  payload: Record<string, unknown>;
  kind: "text" | "image" | "file" | "audio";
}

interface State {
  view: View;
  lang: Lang;
  theme: Theme;
  me: User | null;
  isAdmin: boolean;
  config: Config;
  stats: Stats;
  users: User[];
  adminUsers: User[];
  threads: Thread[];
  activeId: string | null;
  messages: Record<string, Message[]>;
  reads: Record<string, Record<string, number>>;
  typing: Record<string, Record<string, { name: string; until: number }>>;
  drafts: Record<string, string>;
  replyTo: Message | null;
  forwardMsg: Message | null;
  filter: Filter;
  searchQuery: string;
  searchResults: Message[];
  starredMsgs: Message[];
  conn: Conn;
  pending: PendingItem[];
  toast: Toast | null;
  modal: Modal;
  lightbox: { url: string; name: string } | null;
  selectedUsers: string[];
  groupName: string;
  newChatMode: "direct" | "group";
  userSearch: string;
  onlineIds: string[];
  installPrompt: { prompt: () => Promise<void> } | null;
  showInstall: boolean;
  adminForm: Record<string, string>;
  // actions
  t: (key: string, vars?: Record<string, string | number>) => string;
  init: () => Promise<void>;
  bootstrapChat: () => Promise<void>;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  toastMsg: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: () => void;
  setModal: (m: Modal) => void;
  setLightbox: (v: { url: string; name: string } | null) => void;
  setFilter: (f: Filter) => void;
  setSearch: (q: string) => void;
  setDraft: (v: string) => void;
  setReplyTo: (m: Message | null) => void;
  setForwardMsg: (m: Message | null) => void;
  setUserSearch: (v: string) => void;
  setGroupName: (v: string) => void;
  setNewChatMode: (m: "direct" | "group") => void;
  toggleSelected: (id: string) => void;
  setAdminForm: (k: string, v: string) => void;
  // auth
  requestCode: (email: string) => Promise<{ devCode?: string }>;
  verifyCode: (input: { email: string; code: string; student_id?: string; display_name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  adminLogin: (password: string) => Promise<void>;
  adminLogout: () => Promise<void>;
  adminLoad: () => Promise<void>;
  adminSave: () => Promise<void>;
  adminTestMail: (to: string) => Promise<void>;
  adminToggleBan: (userId: string, banned: boolean) => Promise<void>;
  // chat
  refreshThreads: () => Promise<void>;
  loadUsers: () => Promise<void>;
  openThread: (id: string) => Promise<void>;
  loadOlder: () => Promise<void>;
  send: (payload: Record<string, unknown>, kind?: "text" | "image" | "file" | "audio") => Promise<void>;
  flushQueue: () => Promise<void>;
  edit: (id: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  react: (id: string, emoji: string) => Promise<void>;
  star: (m: Message) => Promise<void>;
  notifyTyping: (on: boolean) => void;
  markRead: (id?: string) => Promise<void>;
  setFlags: (id: string, p: Partial<Record<"pinned" | "muted" | "archived" | "starred", boolean>>) => Promise<void>;
  createChat: () => Promise<string | null>;
  addMembers: (ids: string[]) => Promise<void>;
  leave: () => Promise<void>;
  updateGroup: (p: {
    name?: string; about?: string; avatar_key?: string | null; accent?: string | null;
    announcement_only?: boolean; members_can_invite?: boolean;
  }) => Promise<void>;
  runSearch: (q: string, thread?: string) => Promise<void>;
  loadStarred: () => Promise<void>;
  upload: (file: File) => Promise<{ key: string; url: string; name: string; size: number; mime: string }>;
  updateProfile: (p: {
    display_name?: string; about?: string; avatar_key?: string | null;
    show_online?: boolean; read_receipts?: boolean;
  }) => Promise<void>;
  doInstall: () => Promise<void>;
  dismissInstall: () => void;
  connect: () => void;
  disconnect: () => void;
}

const DEFAULT_CONFIG: Config = {
  domains: ["@plkshs.edu.hk"], r2PublicBaseUrl: "", schoolName: "Schoolink",
  mailConfigured: false, r2Enabled: true,
};

const QUEUE_KEY = "schoolink.queue";
const loadQueue = (): PendingItem[] => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
};
const saveQueue = (q: PendingItem[]) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* noop */ }
};
const DRAFTS_KEY = "schoolink.drafts";
const loadDrafts = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}"); } catch { return {}; }
};

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectCount = 0;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let presenceTimer: ReturnType<typeof setInterval> | null = null;
let typingSent = false;
let typingTimer: ReturnType<typeof setTimeout> | undefined = undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined = undefined;
let manuallyClosed = false;

function applyTheme(theme: Theme) {
  const dark = theme === "dark" ||
    (theme === "system" && typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111113" : "#f4f5f8");
}

function upsert(list: Message[], m: Message): Message[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = { ...next[i], ...m, pending: false, failed: false };
    return next;
  }
  return [...list, m].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
}

function badge(n: number) {
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (n > 0) nav.setAppBadge?.(n); else nav.clearAppBadge?.();
  } catch { /* noop */ }
}

export const useApp = create<State>((set, get) => ({
  view: "loading",
  lang: "zh-CN",
  theme: "dark",
  me: null,
  isAdmin: false,
  config: DEFAULT_CONFIG,
  stats: { users: 0, threads: 0, messages: 0 },
  users: [],
  adminUsers: [],
  threads: [],
  activeId: null,
  messages: {},
  reads: {},
  typing: {},
  drafts: {},
  replyTo: null,
  forwardMsg: null,
  filter: "all",
  searchQuery: "",
  searchResults: [],
  starredMsgs: [],
  conn: "connecting",
  pending: [],
  toast: null,
  modal: null,
  lightbox: null,
  selectedUsers: [],
  groupName: "",
  newChatMode: "direct",
  userSearch: "",
  onlineIds: [],
  installPrompt: null,
  showInstall: false,
  adminForm: {},

  t: (key, vars) => translate(get().lang, key, vars),

  /* ------------------------------ 初始化 ------------------------------ */

  init: async () => {
    const lang = (localStorage.getItem("schoolink.lang") as Lang) || "zh-CN";
    const theme = (localStorage.getItem("schoolink.theme") as Theme) || "dark";
    set({
      lang: LANGS.includes(lang) ? lang : "zh-CN",
      theme, drafts: loadDrafts(), pending: loadQueue(),
    });
    applyTheme(theme);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (get().theme === "system") applyTheme("system");
    });

    // PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* noop */ });
    }
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      if (!localStorage.getItem("schoolink.install-dismissed")) {
        set({ installPrompt: e as unknown as { prompt: () => Promise<void> }, showInstall: true });
      }
    });
    window.addEventListener("online", () => { get().flushQueue(); get().connect(); });
    window.addEventListener("offline", () => set({ conn: "offline" }));

    try {
      const c = await api<{ config: Config }>("/api/config");
      set({ config: { ...DEFAULT_CONFIG, ...c.config } });
    } catch { /* 离线也能打开 */ }

    const isAdminPath = location.pathname.replace(/\/$/, "") === "/admin";
    if (isAdminPath) {
      await get().adminLoad();
      return;
    }
    try {
      const r = await api<{ user: User; isAdmin: boolean; r2Enabled: boolean; config: Partial<Config> }>("/api/me");
      set({
        me: r.user, isAdmin: r.isAdmin, view: "chat",
        config: { ...get().config, ...r.config, r2Enabled: r.r2Enabled },
      });
      await get().bootstrapChat();
    } catch {
      set({ view: "login" });
    }
  },

  bootstrapChat: async () => {
    await Promise.all([get().refreshThreads(), get().loadUsers()]);
    get().connect();
    clearInterval(pingTimer!); clearInterval(heartbeatTimer!); clearInterval(presenceTimer!);
    presenceTimer = setInterval(() => { post("/api/presence").catch(() => {}); }, 30_000);
    post("/api/presence").catch(() => {});
    heartbeatTimer = setInterval(() => {
      // 兜底同步：WS 断线或 KV 最终一致时仍能补上消息
      if (get().conn !== "online") get().refreshThreads();
    }, 15_000);
  },

  /* ------------------------------ 偏好 ------------------------------ */

  setLang: (l) => { localStorage.setItem("schoolink.lang", l); set({ lang: l }); },
  setTheme: (th) => {
    localStorage.setItem("schoolink.theme", th);
    const run = () => applyTheme(th);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      doc.startViewTransition(run);
    } else run();
    set({ theme: th });
  },
  toastMsg: (text, kind = "info") => {
    clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
  dismissToast: () => set({ toast: null }),
  setModal: (m) => set({ modal: m, ...(m === "new-chat" ? { selectedUsers: [], groupName: "", userSearch: "" } : {}) }),
  setLightbox: (v) => set({ lightbox: v, modal: v ? "lightbox" : null }),
  setFilter: (f) => set({ filter: f }),
  setSearch: (q) => set({ searchQuery: q }),
  setDraft: (v) => {
    const id = get().activeId || "global";
    const drafts = { ...get().drafts, [id]: v };
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); } catch { /* noop */ }
    set({ drafts });
    if (v.trim()) {
      if (!typingSent) { get().notifyTyping(true); typingSent = true; }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        get().notifyTyping(false); typingSent = false;
        typingTimer = undefined;
      }, 2500);
    } else if (typingSent) {
      get().notifyTyping(false); typingSent = false; clearTimeout(typingTimer);
    }
  },
  setReplyTo: (m) => set({ replyTo: m }),
  setForwardMsg: (m) => set({ forwardMsg: m, modal: m ? "forward" : null }),
  setUserSearch: (v) => set({ userSearch: v }),
  setGroupName: (v) => set({ groupName: v }),
  setNewChatMode: (m) => set({ newChatMode: m, selectedUsers: [] }),
  toggleSelected: (id) => {
    const s = new Set(get().selectedUsers);
    if (s.has(id)) s.delete(id); else s.add(id);
    set({ selectedUsers: [...s] });
  },
  setAdminForm: (k, v) => set({ adminForm: { ...get().adminForm, [k]: v } }),

  /* ------------------------------ 登录 ------------------------------ */

  requestCode: async (email) => {
    const r = await post<{ delivery: string; code?: string }>("/api/auth/otp/request", { email });
    if (r.delivery === "dev" && r.code) {
      set({ adminForm: { ...get().adminForm } });
      return { devCode: r.code };
    }
    get().toastMsg(get().t("codeSent"), "ok");
    return {};
  },
  verifyCode: async (input) => {
    const r = await post<{ user: User }>("/api/auth/otp/verify", input);
    set({ me: r.user, view: "chat" });
    await get().bootstrapChat();
  },
  logout: async () => {
    try { await post("/api/logout"); } catch { /* noop */ }
    get().disconnect();
    set({ me: null, view: "login", activeId: null, threads: [], messages: {}, isAdmin: false });
  },

  adminLogin: async (password) => {
    const r = await post<{ config: Config; stats: Stats }>("/api/admin/panel/login", { password });
    set({
      view: "admin", config: { ...get().config, ...r.config }, stats: r.stats,
      adminForm: {
        domains: (r.config.domains || []).join(", "),
        adminEmails: (r.config.adminEmails || []).join(", "),
        schoolName: r.config.schoolName || "",
        r2PublicBaseUrl: r.config.r2PublicBaseUrl || "",
        mailFrom: r.config.mailFrom || "",
        mailApiBase: r.config.mailApiBase || "",
        mailApiToken: "", testTo: "",
      },
    });
    await get().adminLoad();
  },
  adminLogout: async () => {
    try { await post("/api/admin/panel/logout"); } catch { /* noop */ }
    set({ view: "admin-login" });
  },
  adminLoad: async () => {
    try {
      const r = await api<{ config: Config; stats: Stats }>("/api/admin/panel/state");
      const f = get().adminForm;
      set({
        view: "admin", config: { ...get().config, ...r.config }, stats: r.stats,
        adminForm: Object.keys(f).length ? f : {
          domains: (r.config.domains || []).join(", "),
          adminEmails: (r.config.adminEmails || []).join(", "),
          schoolName: r.config.schoolName || "",
          r2PublicBaseUrl: r.config.r2PublicBaseUrl || "",
          mailFrom: r.config.mailFrom || "",
          mailApiBase: r.config.mailApiBase || "",
          mailApiToken: "", testTo: "",
        },
      });
      try {
        const u = await api<{ users: User[] }>("/api/admin/panel/users");
        set({ adminUsers: u.users });
      } catch { /* noop */ }
    } catch {
      set({ view: "admin-login" });
    }
  },
  adminSave: async () => {
    const f = get().adminForm;
    const body: Record<string, unknown> = {
      domains: f.domains, adminEmails: f.adminEmails, schoolName: f.schoolName,
      r2PublicBaseUrl: f.r2PublicBaseUrl, mailFrom: f.mailFrom, mailApiBase: f.mailApiBase,
    };
    if (f.mailApiToken?.trim()) body.mailApiToken = f.mailApiToken.trim();
    const r = await post<{ config: Config }>("/api/admin/panel/config", body);
    set({ config: { ...get().config, ...r.config }, adminForm: { ...f, mailApiToken: "" } });
    get().toastMsg(get().t("saved"), "ok");
  },
  adminTestMail: async (to) => {
    await post("/api/admin/panel/test-mail", { to });
    get().toastMsg(get().t("testOk"), "ok");
  },
  adminToggleBan: async (userId, banned) => {
    await post("/api/admin/panel/users/ban", { userId, banned });
    set({ adminUsers: get().adminUsers.map((u) => u.id === userId ? { ...u, banned } : u) });
  },

  /* ------------------------------ 会话 ------------------------------ */

  refreshThreads: async () => {
    try {
      const r = await api<{ threads: Thread[] }>("/api/threads");
      set({ threads: r.threads });
      badge(r.threads.reduce((n, t) => n + (t.muted ? 0 : t.unread), 0));
    } catch { /* noop */ }
  },
  loadUsers: async () => {
    try {
      const r = await api<{ users: User[] }>("/api/users");
      set({ users: r.users });
    } catch { /* noop */ }
  },
  openThread: async (id) => {
    set({ activeId: id, replyTo: null, modal: null });
    if (!get().messages[id]) await get().loadOlder();
    await get().markRead(id);
  },
  loadOlder: async () => {
    const id = get().activeId;
    if (!id) return;
    const cur = get().messages[id] || [];
    const before = cur.length ? cur[0].created_at : 0;
    try {
      const r = await api<{ messages: Message[]; reads: { user_id: string; last_read_at: number }[] }>(
        `/api/threads/${id}/messages?limit=60&before=${before}`,
      );
      const reads: Record<string, number> = {};
      for (const x of r.reads) reads[x.user_id] = x.last_read_at;
      set({
        messages: { ...get().messages, [id]: [...r.messages, ...(before ? cur : [])]
          .filter((m, i, a) => a.findIndex((x) => x.id === m.id) === i)
          .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id)) },
        reads: { ...get().reads, [id]: reads },
      });
    } catch { /* noop */ }
  },

  /* ------------------------------ 实时 ------------------------------ */

  connect: () => {
    if (get().view !== "chat" || !get().me) return;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    manuallyClosed = false;
    set({ conn: get().conn === "offline" ? "reconnecting" : "connecting" });
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    try {
      ws = new WebSocket(`${proto}//${location.host}/api/ws`);
    } catch {
      set({ conn: "offline" });
      return;
    }
    ws.onopen = () => {
      reconnectCount = 0;
      set({ conn: "online" });
      clearInterval(pingTimer!);
      pingTimer = setInterval(() => {
        if (ws?.readyState === 1) ws.send("ping");
      }, 25_000);
      get().flushQueue();
      get().refreshThreads();
      if (get().activeId) get().markRead();
    };
    ws.onmessage = (e) => {
      let ev: WsEvent;
      try { ev = JSON.parse(e.data as string) as WsEvent; } catch { return; }
      handleEvent(ev, set, get);
    };
    ws.onclose = () => {
      ws = null;
      clearInterval(pingTimer!);
      if (manuallyClosed) return;
      set({ conn: navigator.onLine ? "reconnecting" : "offline" });
      reconnectCount = Math.min(reconnectCount + 1, 6);
      const delay = Math.min(1000 * 2 ** reconnectCount, 30_000);
      clearTimeout(reconnectTimer!);
      reconnectTimer = setTimeout(() => get().connect(), delay);
    };
    ws.onerror = () => { try { ws?.close(); } catch { /* noop */ } };
  },
  disconnect: () => {
    manuallyClosed = true;
    clearTimeout(reconnectTimer!); clearInterval(pingTimer!);
    clearInterval(heartbeatTimer!); clearInterval(presenceTimer!);
    try { ws?.close(); } catch { /* noop */ }
    ws = null;
  },

  /* ------------------------------ 消息 ------------------------------ */

  send: async (payload, kind = "text") => {
    const threadId = get().activeId;
    if (!threadId || !get().me) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: Message = {
      id: tempId, thread_id: threadId, sender_id: get().me!.id,
      kind: payload.kind as Message["kind"] || "text",
      body: String(payload.body || ""), media_key: (payload.media_key as string) || null,
      media_name: (payload.media_name as string) || null, media_size: (payload.media_size as number) || null,
      media_type: (payload.media_type as string) || null, duration: (payload.duration as number) || null,
      reply_to: (payload.reply_to as string) || null, forwarded_from: (payload.forwarded_from as string) || null,
      edited_at: null, deleted_at: null, created_at: Date.now(),
      reactions: [], starred: false, pending: true,
    };
    set({ messages: { ...get().messages, [threadId]: upsert(get().messages[threadId] || [], optimistic) } });

    const enqueue = () => {
      const q: PendingItem[] = [...get().pending, { tempId, threadId, payload, kind }];
      saveQueue(q); set({ pending: q });
      set({
        messages: { ...get().messages, [threadId]: (get().messages[threadId] || [])
          .map((m) => m.id === tempId ? { ...m, pending: false, failed: true } : m) },
      });
      get().toastMsg(get().t("sendFailed"), "err");
    };

    try {
      const r = await post<{ message: Message }>(`/api/threads/${threadId}/messages`, payload);
      set({
        messages: { ...get().messages, [threadId]: upsert(
          (get().messages[threadId] || []).filter((m) => m.id !== tempId), r.message) },
        replyTo: null,
      });
      get().refreshThreads();
      get().notifyTyping(false); typingSent = false; clearTimeout(typingTimer);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 500) enqueue();
      else {
        set({ messages: { ...get().messages, [threadId]: (get().messages[threadId] || [])
          .filter((m) => m.id !== tempId) } });
        get().toastMsg((e as Error).message, "err");
      }
    }
  },
  flushQueue: async () => {
    const q = get().pending;
    if (!q.length) return;
    get().toastMsg(get().t("retrying"), "info");
    const rest: PendingItem[] = [];
    for (const item of q) {
      try {
        const r = await post<{ message: Message }>(`/api/threads/${item.threadId}/messages`, item.payload);
        set({ messages: { ...get().messages, [item.threadId]: upsert(
          (get().messages[item.threadId] || []).filter((m) => m.id !== item.tempId), r.message) } });
      } catch { rest.push(item); }
    }
    saveQueue(rest); set({ pending: rest });
    get().refreshThreads();
  },
  edit: async (id, body) => {
    const r = await patch<{ message: Message }>(`/api/messages/${id}`, { body });
    replaceMessage(r.message, set, get);
  },
  remove: async (id) => {
    const r = await del<{ message: Message }>(`/api/messages/${id}`);
    replaceMessage(r.message, set, get);
  },
  react: async (id, emoji) => {
    const r = await post<{ message: Message }>(`/api/messages/${id}/reaction`, { emoji });
    replaceMessage(r.message, set, get);
  },
  star: async (m) => {
    const r = await post<{ starred: boolean }>(`/api/messages/${m.id}/star`);
    const list = (get().messages[m.thread_id] || []).map((x) => x.id === m.id ? { ...x, starred: r.starred } : x);
    set({ messages: { ...get().messages, [m.thread_id]: list } });
    get().toastMsg(r.starred ? get().t("star") : get().t("unstar"), "ok");
  },
  notifyTyping: (on) => {
    const id = get().activeId;
    if (!id) return;
    post(`/api/threads/${id}/typing`, { on }).catch(() => {});
  },
  markRead: async (id) => {
    const tid = id || get().activeId;
    if (!tid) return;
    try {
      await post(`/api/threads/${tid}/read`);
      set({ threads: get().threads.map((t) => t.id === tid ? { ...t, unread: 0 } : t) });
      badge(get().threads.reduce((n, t) =>
        n + ((t.muted || usePrefs.getState().isMuted(t.id)) ? 0 : t.unread), 0));
    } catch { /* noop */ }
  },
  setFlags: async (id, p) => {
    set({ threads: get().threads.map((t) => t.id === id ? { ...t, ...Object.fromEntries(
      Object.entries(p).map(([k, v]) => [k, v ? 1 : 0])) } as Thread : t) });
    try { await patch(`/api/threads/${id}`, p); } catch { get().refreshThreads(); }
  },
  createChat: async () => {
    const { newChatMode, selectedUsers, groupName } = get();
    const r = await post<{ id: string }>("/api/threads", {
      type: newChatMode, name: groupName, memberIds: selectedUsers,
    });
    await get().refreshThreads();
    set({ modal: null, selectedUsers: [], groupName: "" });
    await get().openThread(r.id);
    return r.id;
  },
  addMembers: async (ids) => {
    const id = get().activeId;
    if (!id) return;
    await post(`/api/threads/${id}/members`, { memberIds: ids });
    await get().refreshThreads();
  },
  leave: async () => {
    const id = get().activeId;
    if (!id) return;
    await post(`/api/threads/${id}/leave`);
    set({ activeId: null, modal: null });
    await get().refreshThreads();
  },
  updateGroup: async (p) => {
    const id = get().activeId;
    if (!id) return;
    await patch(`/api/threads/${id}`, p);
    await get().refreshThreads();
    get().toastMsg(get().t("saved"), "ok");
  },
  runSearch: async (q, thread) => {
    if (!q.trim()) { set({ searchResults: [] }); return; }
    const r = await api<{ messages: Message[] }>(`/api/search?q=${encodeURIComponent(q)}${thread ? `&thread=${thread}` : ""}`);
    set({ searchResults: r.messages });
  },
  loadStarred: async () => {
    const r = await api<{ messages: Message[] }>("/api/starred");
    set({ starredMsgs: r.messages });
  },
  upload: async (file) => {
    const r = await uploadFile(file);
    return { ...r, url: mediaUrl(r.key, get().config.r2PublicBaseUrl) || r.url };
  },
  updateProfile: async (p) => {
    const r = await patch<{ user: User }>("/api/profile", p);
    set({ me: r.user });
    get().toastMsg(get().t("saved"), "ok");
  },
  doInstall: async () => {
    try { await get().installPrompt?.prompt(); } catch { /* noop */ }
    set({ showInstall: false, installPrompt: null });
  },
  dismissInstall: () => {
    localStorage.setItem("schoolink.install-dismissed", "1");
    set({ showInstall: false });
  },
}));

function replaceMessage(
  m: Message,
  set: (p: Partial<State>) => void,
  get: () => State,
) {
  set({ messages: { ...get().messages, [m.thread_id]: upsert(get().messages[m.thread_id] || [], m) } });
  if (get().modal === "starred") get().loadStarred();
}

function handleEvent(
  ev: WsEvent,
  set: (p: Partial<State>) => void,
  get: () => State,
) {
  switch (ev.type) {
    case "hello":
    case "pong":
      set({ conn: "online" });
      break;
    case "message": {
      const { message: m, threadId } = ev;
      const isActive = get().activeId === threadId;
      const mine = m.sender_id === get().me?.id;
      set({ messages: { ...get().messages, [threadId]: upsert(get().messages[threadId] || [], m) } });
      set({ threads: get().threads.map((t) => t.id === threadId ? {
        ...t, last_body: m.body || `[${m.kind}]`, last_kind: m.kind, last_sender: m.sender_id,
        last_at: m.created_at, unread: isActive || mine ? 0 : (t.unread || 0) + 1,
      } : t) });
      if (isActive && !mine) post(`/api/threads/${threadId}/read`).catch(() => {});
      badge(get().threads.reduce((n, t) =>
        n + ((t.muted || usePrefs.getState().isMuted(t.id)) ? 0 : t.unread), 0));
      if (!mine) desktopNotify(m, threadId, get());
      break;
    }
    case "message-updated": {
      const { message: m, threadId } = ev;
      set({ messages: { ...get().messages, [threadId]: upsert(get().messages[threadId] || [], m) } });
      break;
    }
    case "read": {
      const reads = { ...(get().reads[ev.threadId] || {}), [ev.userId]: ev.at };
      set({ reads: { ...get().reads, [ev.threadId]: reads } });
      break;
    }
    case "typing": {
      const map = { ...(get().typing[ev.threadId] || {}) };
      if (ev.on) map[ev.userId] = { name: ev.displayName, until: Date.now() + 4000 };
      else delete map[ev.userId];
      set({ typing: { ...get().typing, [ev.threadId]: map } });
      break;
    }
    case "thread-new":
    case "thread-updated":
      get().refreshThreads();
      break;
  }
}

/** 页面在后台时，用 Service Worker 发一条系统通知；静音会话与关闭通知时不发 */
function desktopNotify(m: Message, threadId: string, state: State): void {
  const p = usePrefs.getState();
  if (!p.notifications || p.isMuted(threadId)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (typeof document === "undefined" || !document.hidden) return;
  const thread = state.threads.find((x) => x.id === threadId);
  const sender = thread?.members.find((x) => x.id === m.sender_id);
  const title = thread?.type === "group"
    ? (thread.name || "Schoolink") : (sender?.display_name || "Schoolink");
  const body = (m.kind === "text" ? m.body : `[${m.kind}]`).slice(0, 160);
  const opts = { body, icon: "/icons/icon-192.png", badge: "/icons/icon-badge.png",
    tag: `schoolink-${threadId}`, data: { threadId } };
  try {
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (sw) {
      sw.getRegistration().then((reg) => {
        if (reg) reg.showNotification(title, opts as unknown as NotificationOptions);
        else new Notification(title, opts as NotificationOptions);
      }).catch(() => { /* noop */ });
    } else {
      new Notification(title, opts as NotificationOptions);
    }
  } catch { /* 权限被撤销等情况直接忽略，不影响收消息 */ }
}
