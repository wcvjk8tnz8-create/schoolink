/**
 * 前端 AI 模型预设。与 worker/ai-models.ts 保持一致（selfcheck 会比对 ID 列表）。
 * 服务端 /api/config 会下发同一份列表；这里作为离线 / 首屏 fallback。
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

export const isCustomAiModel = (id: string, presets: AiModelPreset[] = AI_MODEL_PRESETS): boolean =>
  Boolean(id) && !presets.some((p) => p.id === id);
