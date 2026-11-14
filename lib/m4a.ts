/**
 * 语音统一成 M4A（AAC / MP4）。
 *
 * 零第三方依赖，全部用浏览器原生能力：
 *  1. 录制时优先申请 audio/mp4 —— Safari、iOS、Chrome、Edge、Android 都能直接
 *     吐出 AAC/M4A，一步到位，没有二次转码、没有音质损失、不用等待。
 *  2. 万一拿到的是 webm/ogg（Firefox 等），录完后再转：Web Audio 解码成 PCM，
 *     经 MediaStreamAudioDestinationNode 重新以 audio/mp4 录一遍 → 仍是 M4A。
 *  3. 连 audio/mp4 录制都不支持的浏览器，才保留原格式，并由 UI 明确提示，
 *     不让用户以为发出去的是 m4a。
 */

export const M4A_MIME = "audio/mp4";
export const M4A_EXT = "m4a";

/** 录音优先格式：M4A 在前，webm 只作兜底 */
const PREFERRED = [
  // Safari / iOS 支持显式 AAC，优先拿真·AAC M4A
  "audio/mp4;codecs=mp4a.40.2",
  M4A_MIME,
  "audio/x-m4a",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

export function isM4a(mime: string): boolean {
  return /\b(mp4|x-m4a)\b/i.test(mime || "");
}

/** 选出这个浏览器能用的最佳录音格式（优先 M4A） */
export function pickRecorderMime(): string {
  for (const m of PREFERRED) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ }
  }
  return ""; // 交给浏览器默认
}

/** 浏览器是否具备「把任意录音转成 M4A」的能力 */
export function canTranscodeToM4a(): boolean {
  try { return MediaRecorder.isTypeSupported(M4A_MIME); } catch { return false; }
}

export interface VoiceFile {
  blob: Blob;
  mime: string;
  ext: string;
  duration: number;
  /** 是否经过二次编码；false = 直接录成 M4A */
  converted: boolean;
  /** 无法产出 M4A 时给用户的说明 */
  notice?: string;
}

function audioContextCtor(): typeof AudioContext {
  const g = window as unknown as { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || g.webkitAudioContext!;
}

function roundDuration(sec: number, fallback: number): number {
  return sec > 0 && Number.isFinite(sec) ? Math.round(sec) : Math.max(1, Math.round(fallback));
}

/**
 * 把录音 blob 规范化成 M4A。永远不会抛错导致语音发不出去。
 */
export async function toM4a(raw: Blob, fallbackDuration: number): Promise<VoiceFile> {
  const rawMime = (raw.type || "").split(";")[0].trim() || "audio/webm";

  // 1. 已经是 M4A（绝大多数情况）：只统一 mime，不动数据
  if (isM4a(rawMime)) {
    // 保留 ;codecs=mp4a.40.2 / ;codecs=opus，播放器据此选解码器
    const mime = raw.type || M4A_MIME;
    return {
      blob: new Blob([raw], { type: mime }),
      mime, ext: M4A_EXT,
      duration: roundDuration(0, fallbackDuration),
      converted: false,
    };
  }

  // 2. 不能录 MP4：保留原格式，明确告知
  if (!canTranscodeToM4a()) {
    return {
      blob: raw, mime: rawMime,
      ext: /ogg/i.test(rawMime) ? "ogg" : "webm",
      duration: roundDuration(0, fallbackDuration),
      converted: false,
      notice: "此瀏覽器不支援 M4A 編碼，語音以原格式傳送 / This browser cannot encode M4A; voice sent as recorded",
    };
  }

  // 3. 解码 → 重新编码成 M4A
  let ctx: AudioContext | null = null;
  try {
    const Ctor = audioContextCtor();
    if (!Ctor) throw new Error("Web Audio unavailable");
    ctx = new Ctor();
    const decoded = await ctx.decodeAudioData(await raw.arrayBuffer());
    const duration = roundDuration(decoded.duration, fallbackDuration);

    // 太长的录音不做实时重录（避免用户干等），保留原格式
    if (decoded.duration > 30) {
      await ctx.close().catch(() => {});
      return {
        blob: raw, mime: rawMime, ext: "webm", duration, converted: false,
        notice: "語音較長，已保留原格式 / Long voice clip kept in original format",
      };
    }
    await ctx.resume().catch(() => {});

    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(dest);

    const rec = new MediaRecorder(dest.stream, { mimeType: M4A_MIME });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const done = new Promise<Blob>((resolve, reject) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: M4A_MIME }));
      rec.onerror = () => reject(new Error("M4A re-encode failed"));
    });
    rec.start();
    src.start();
    src.onended = () => { setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, 120); };

    const guard = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("M4A re-encode timeout")), (duration + 6) * 1000));
    const out = await Promise.race([done, guard]);

    src.disconnect();
    await ctx.close().catch(() => {});
    if (out.size < 256) throw new Error("M4A output too small");

    return { blob: out, mime: M4A_MIME, ext: M4A_EXT, duration, converted: true };
  } catch {
    if (ctx) await ctx.close().catch(() => {});
    return {
      blob: raw, mime: rawMime,
      ext: /ogg/i.test(rawMime) ? "ogg" : "webm",
      duration: roundDuration(0, fallbackDuration),
      converted: false,
      notice: "轉碼失敗，語音以原格式傳送 / Conversion failed; voice sent as recorded",
    };
  }
}
