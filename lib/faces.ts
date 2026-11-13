/**
 * 表情贴纸：聊天里不用 emoji 字符，改用短代码 :smile: 存储，
 * 渲染时替换为内联 SVG。worker 的回应白名单也用同一套 key。
 */

interface Face {
  bg: string;
  face?: boolean;
  eyes?: "dot" | "happy" | "wide" | "sleep" | "love" | "think";
  mouth?: "smile" | "laugh" | "o" | "sad" | "flat" | "open";
  mark?: "tear" | "hat" | "zzz" | "spark" | "none";
  glyph?: "thumbs" | "heart" | "clover" | "fire" | "pray" | "muscle" | "clap" | "party" | "books";
}

const FACES: Record<string, Face> = {
  smile:  { bg: "#FFD35C", face: true, eyes: "dot",   mouth: "smile" },
  laugh:  { bg: "#FFD35C", face: true, eyes: "happy", mouth: "laugh" },
  wow:    { bg: "#FFD35C", face: true, eyes: "wide",  mouth: "o" },
  love:   { bg: "#FFC94D", face: true, eyes: "love",  mouth: "smile" },
  think:  { bg: "#FFD35C", face: true, eyes: "think", mouth: "flat" },
  cry:    { bg: "#FFD35C", face: true, eyes: "happy", mouth: "sad", mark: "tear" },
  party:  { bg: "#FFD35C", face: true, eyes: "happy", mouth: "laugh", mark: "hat" },
  sleep:  { bg: "#FFD35C", face: true, eyes: "sleep", mouth: "flat", mark: "zzz" },
  thumbs: { bg: "#6C8BFF", glyph: "thumbs" },
  heart:  { bg: "#FF6B8B", glyph: "heart" },
  clover: { bg: "#7A6BF5", glyph: "clover" },
  fire:   { bg: "#FF8A47", glyph: "fire" },
  pray:   { bg: "#8E86FF", glyph: "pray" },
  muscle: { bg: "#F5B856", glyph: "muscle" },
  clap:   { bg: "#F5B856", glyph: "clap" },
  books:  { bg: "#59B8A6", glyph: "books" },
  spark:  { bg: "#A78BFA", glyph: "clover", mark: "spark" },
};

const GLYPHS: Record<string, string> = {
  thumbs: '<path d="M10 14h6.5a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5h-3l1-4a2 2 0 0 0-3-1.6L9 8v6Z" fill="#fff"/><rect x="5" y="13" width="5" height="11" rx="1.4" fill="#fff"/>',
  heart: '<path d="M16 27S5 20.5 5 13.2A5.7 5.7 0 0 1 16 10a5.7 5.7 0 0 1 11 3.2C27 20.5 16 27 16 27Z" fill="#fff"/>',
  clover: '<g fill="#fff"><circle cx="16" cy="10" r="5"/><circle cx="10" cy="16" r="5"/><circle cx="22" cy="16" r="5"/><circle cx="16" cy="22" r="5"/></g><circle cx="16" cy="16" r="3.2" fill="#7A6BF5"/>',
  fire: '<path d="M17 4c2 6-3 7-1 11 3-1 4-3 4-5 4 4 5 8 3 12a8 8 0 0 1-15-4c0-5 4-8 6-12 1 3 2 4 3 5 1-3 0-5 0-7Z" fill="#fff"/>',
  pray: '<path d="M12 6l4 4-2 2 6 6a3 3 0 0 1 0 4l-1 1-9-9 2-4Z" fill="#fff"/><path d="M20 6l-4 4 2 2 2-2Z" fill="#fff" opacity=".7"/>',
  muscle: '<path d="M7 12a5 5 0 0 1 5-5h4a6 6 0 0 1 0 12H12a5 5 0 0 1-5-5v-2Z" fill="#fff"/><path d="M12 10v8" stroke="#F5B856" stroke-width="1.6"/>',
  clap: '<path d="M9 8l5 5-3 3-5-5a2.1 2.1 0 0 1 3-3ZM14 6l5 5-3 3-5-5a2.1 2.1 0 0 1 3-3ZM18 10l4 4a6 6 0 0 1-8 8l-4-4 8-8Z" fill="#fff"/>',
  party: '<path d="M5 27 20 8l5-5-4 15Z" fill="#fff"/><circle cx="7" cy="9" r="1.6" fill="#fff"/><circle cx="11" cy="5" r="1.4" fill="#fff"/><path d="M20 8l5-5" stroke="#fff" stroke-width="2"/>',
  books: '<rect x="6" y="8" width="8" height="16" rx="1.5" fill="#fff"/><rect x="16" y="8" width="8" height="16" rx="1.5" fill="#fff" opacity=".82"/><path d="M9 12h2M9 16h2M19 12h2M19 16h2" stroke="#59B8A6" stroke-width="1.5"/>',
};

export function faceMarkup(name: string): string {
  const f = FACES[name] || FACES.smile;
  let s = `<circle cx="16" cy="16" r="15" fill="${f.bg}"/>`;
  if (f.face) {
    s += '<circle cx="16" cy="16" r="11.5" fill="#FFDE7A"/>';
    const eyes: Record<string, string> = {
      dot: '<circle cx="12" cy="13.5" r="1.5" fill="#4A3A20"/><circle cx="20" cy="13.5" r="1.5" fill="#4A3A20"/>',
      happy: '<path d="M10 14q2-3 4 0M18 14q2-3 4 0" stroke="#4A3A20" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
      wide: '<circle cx="12" cy="13.5" r="2.2" fill="#4A3A20"/><circle cx="20" cy="13.5" r="2.2" fill="#4A3A20"/>',
      sleep: '<path d="M10 14h4M18 14h4" stroke="#4A3A20" stroke-width="1.7" stroke-linecap="round"/>',
      love: '<path d="M12 12.5a2 2 0 0 1 4 0 2 2 0 0 1 4 0c0 2-2 3.5-4 5-2-1.5-4-3-4-5Z" fill="#FF5B7F"/>',
      think: '<circle cx="12" cy="13.5" r="1.5" fill="#4A3A20"/><path d="M18 12.5h4" stroke="#4A3A20" stroke-width="1.7" stroke-linecap="round"/>',
    };
    s += eyes[f.eyes || "dot"];
    const mouths: Record<string, string> = {
      smile: '<path d="M11 20q5 4 10 0" stroke="#4A3A20" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
      laugh: '<path d="M10 19q6 7 12 0Z" fill="#7A3B32"/>',
      o: '<ellipse cx="16" cy="21" rx="2.4" ry="3" fill="#7A3B32"/>',
      sad: '<path d="M11 23q5-4 10 0" stroke="#4A3A20" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
      flat: '<path d="M12 21h8" stroke="#4A3A20" stroke-width="1.8" stroke-linecap="round"/>',
      open: '<ellipse cx="16" cy="21" rx="3" ry="3.5" fill="#7A3B32"/>',
    };
    s += mouths[f.mouth || "smile"];
    if (f.mark === "tear") s += '<path d="M22 16q2 4 0 5a1.6 1.6 0 0 1-3 0q-2-1 0-5Z" fill="#63B6FF"/>';
    if (f.mark === "hat") s += '<path d="M16 3l7 9H9Z" fill="#FF6B8B"/><circle cx="16" cy="3" r="1.8" fill="#FFD35C"/>';
    if (f.mark === "zzz") s += '<text x="22" y="10" font-size="7" fill="#4A3A20" font-family="sans-serif">z</text>';
  } else if (f.glyph) {
    s += GLYPHS[f.glyph] || "";
  }
  if (f.mark === "spark") s += '<circle cx="26" cy="6" r="2" fill="#fff" opacity=".9"/><circle cx="6" cy="26" r="1.6" fill="#fff" opacity=".8"/>';
  return s;
}

export const FACE_KEYS = Object.keys(FACES);
export const REACTION_KEYS = ["thumbs", "heart", "laugh", "wow", "cry", "pray", "party", "clover"];
export const FACE_LABEL: Record<string, string> = {
  smile: "smile", laugh: "laugh", wow: "wow", love: "love", think: "think", cry: "cry",
  party: "party", sleep: "sleep", thumbs: "like", heart: "heart", clover: "clover",
  fire: "fire", pray: "thanks", muscle: "strong", clap: "clap", books: "books", spark: "nice",
};

/** 消息文本里的 :smile: → 内联 SVG 字符串（linkify 之后插入） */
export function faceSvg(name: string): string {
  return `<svg class="inline-face" viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">${faceMarkup(name)}</svg>`;
}

/** 会话列表预览里把短代码显示成可读标签 */
export function shortLabel(body: string): string {
  return body.replace(/:([a-z]+):/g, (_m, k) => `[${FACE_LABEL[k] || k}]`);
}

/** 兼容旧数据：emoji 字符 → 贴纸名；已是 key 则原样返回 */
export function faceKeyOf(v: string): string {
  // 用码点书写，保持源码无 emoji 字面量；仅用于兼容旧消息
  const map: Record<string, string> = {
    "\u{1F44D}": "thumbs", "\u2764\uFE0F": "heart", "\u2764": "heart",
    "\u{1F602}": "laugh", "\u{1F62E}": "wow", "\u{1F622}": "cry",
    "\u{1F64F}": "pray", "\u{1F389}": "party", "\u{1F340}": "clover",
    "\u{1F600}": "smile", "\u{1F60D}": "love",
  };
  return map[v] || (FACES[v] ? v : "");
}
