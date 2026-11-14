/**
 * Workers AI 文本模型白名单与校验。
 * 管理员在 /admin 选的模型存进 KV 热配置；学生若被允许覆盖，也只能从合法 ID 里选。
 */
export interface AiModelPreset { id: string; label: string; hint: string }

export const DEFAULT_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export const AI_MODEL_PRESETS: AiModelPreset[] = [
  { id: DEFAULT_AI_MODEL, label: "Llama 3.1 8B", hint: "轻量快速 · 预设" },
  { id: "@cf/meta/llama-3.1-70b-instruct", label: "Llama 3.1 70B", hint: "质量优先 · 较慢" },
  { id: "@cf/meta/llama-3-8b-instruct", label: "Llama 3 8B", hint: "稳定通用" },
  { id: "@cf/mistral/mistral-7b-instruct-v0.1", label: "Mistral 7B", hint: "简短利落" },
  { id: "@cf/qwen/qwen1.5-14b-chat-awq", label: "Qwen 1.5 14B", hint: "中文较好" },
  { id: "@cf/google/gemma-7b-it", label: "Gemma 7B", hint: "轻量备用" },
];

/** 只允许 Workers AI 的模型 ID（@vendor/model），不接受 URL / 任意字符串 */
export function isValidAiModel(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s.length > 3 && s.length <= 120 && /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._\/-]*$/i.test(s);
}

export function normalizeAiModel(v: unknown, fallback = DEFAULT_AI_MODEL): string {
  const s = String(v ?? "").trim();
  if (!s || s === "CLEAR") return fallback;
  return isValidAiModel(s) ? s : fallback;
}
