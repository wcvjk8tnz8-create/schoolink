/**
 * Schoolink AI 助手前端入口。
 * 「无聊侦测」每 60 秒静止后，把一条指示式提示词发给 /api/ai：
 *   AI助手，你現在要說一段話，內容是：聊天嗎？
 * 服务端优先走 Workers AI；未开通 / 离线时降级为本地回复，按钮永远不会点不动。
 */
import { post } from "./api";
import type { Lang } from "./types";
import { AI_MODEL_PRESETS } from "./ai-models";

export const IDLE_MINUTES = 1;
export const IDLE_MS = IDLE_MINUTES * 60_000;
export const AI_COOLDOWN_MS = 3 * 60_000;

export const IDLE_PROMPT = "AI助手，你现在要说一段话，内容是：聊天吗？";

export interface AIChatMessage { role: "user" | "assistant"; content: string }
export interface AIAnswer { reply: string; local: boolean; source?: string; model?: string }

const FALLBACK: Record<Lang, string> = {
  "zh-CN": "我在这儿呀～ 想聊点什么？",
  "zh-HK": "我喺度呀～ 想傾啲咩？",
  en: "I'm right here. What shall we talk about?",
};

export async function askAI(
  prompt: string, history: AIChatMessage[] = [], lang: Lang = "zh-HK", model = "",
): Promise<AIAnswer> {
  try {
    const r = await post<{ reply: string; local: boolean; source?: string; model?: string }>("/api/ai", {
      prompt, history, lang, ...(model ? { model } : {}),
    });
    if (r?.reply) return { reply: r.reply, local: Boolean(r.local), source: r.source, model: r.model };
  } catch { /* 离线 / 限流 → 本地兜底 */ }
  return { reply: FALLBACK[lang] || FALLBACK["zh-HK"], local: true, source: "offline" };
}

/** 闲聊兜底：离线也能接着聊，不会出现空白回复 */
export function localChatReply(prompt: string, lang: Lang): string {
  const q = prompt.toLowerCase();
  if (lang === "en") {
    if (/homework|report|project|study/.test(q)) return "Break it into small steps and start with the easiest one.";
    if (/hi|hello|hey|morning/.test(q)) return "Hello! Nice to see you. What are you up to?";
    if (/bored|lonely/.test(q)) return "Want to say hi to a classmate, or shall I tell you a tiny joke?";
    return "I'm here. Tell me a bit more and we can figure it out together.";
  }
  if (/功課|作業|專題|報告|溫習|考試/.test(q)) return "先拆成細步驟，由最容易嗰部分開始，慢慢嚟就得。";
  if (/你好|早晨|hi|hello|嗨/.test(q)) return "你好呀！今日想傾啲咩？";
  if (/無聊|悶|得自己/.test(q)) return "想搵同學傾兩句，定係聽我講個小笑話？";
  if (/多謝|thanks|thank/.test(q)) return "唔客氣～ 隨時搵我傾。";
  return "我喺度呀～ 講多啲俾我聽，我陪你慢慢傾。";
}

const KEY = "schoolink.ai.chat";
export { AI_MODEL_PRESETS };
export function loadAIChat(): AIChatMessage[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(a) ? a.slice(-40).filter((m) => m && ["user", "assistant"].includes(m.role)) : [];
  } catch { return []; }
}
export function saveAIChat(list: AIChatMessage[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-40))); } catch { /* noop */ }
}
