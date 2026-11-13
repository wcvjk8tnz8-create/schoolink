"use client";

import { faceMarkup } from "@/lib/faces";

/**
 * Schoolink 图标系统：界面里所有图标都是内联 SVG，不使用 emoji / 字符符号。
 * Icon  = 线性图标（继承 currentColor，随主题自动变色）
 * FaceIcon = 表情/回应的彩色 SVG 贴纸（短代码 :smile: 存进消息文本，渲染时换成 SVG）
 */

const PATHS: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  star: '<path d="m12 3 2.75 5.6 6.15.9-4.45 4.35 1.05 6.1L12 17.05l-5.5 2.9 1.05-6.1L3.1 9.5l6.15-.9L12 3Z"/>',
  "star-filled": '<path fill="currentColor" stroke="none" d="m12 3 2.75 5.6 6.15.9-4.45 4.35 1.05 6.1L12 17.05l-5.5 2.9 1.05-6.1L3.1 9.5l6.15-.9L12 3Z"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z"/><path d="M12 14v7"/>',
  "bell-off": '<path d="M6 9a6 6 0 0 1 9.6-4.8M18 10v4l2 3H8"/><path d="M10 20h4M3 3l18 18"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  more: '<circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/>',
  "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
  "arrow-up": '<path d="M12 19V5M6 11l6-6 6 6"/>',
  "arrow-down": '<path d="M12 5v14M6 13l6 6 6-6"/>',
  send: '<path d="M4 12 20 4l-4 16-4-6-8-2Z"/><path d="m12 14 8-10"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4"/><circle cx="9" cy="9.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="1.1" fill="currentColor" stroke="none"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 18 5-5 3.5 3.5L16 13l4 4"/>',
  paperclip: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3l7.5-7.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  "check-double": '<path d="m2 13 4 4 8-9"/><path d="m9 13 4 4 9-10"/>',
  reply: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6v1"/>',
  forward: '<path d="m15 7 5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0-6 6v1"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13 7 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a6 6 0 0 1 12 0v1"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 4 5v1"/>',
  logout: '<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M14 8l4 4-4 4M8 12h10"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  system: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  key: '<circle cx="7.5" cy="15.5" r="3.5"/><path d="m10 13 9-9 2 2-2 2 1.5 1.5-2 2L17 10l-2 2"/>',
  warning: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  beaker: '<path d="M9 3h6M10 3v6L5 19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1l-5-10V3"/><path d="M7.5 15h9"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  play: '<path fill="currentColor" stroke="none" d="M8 5v14l11-7z"/>',
  pause: '<path fill="currentColor" stroke="none" d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 6M20 5v6h-6"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  clover: '<circle cx="12" cy="8" r="3.4"/><circle cx="8" cy="12" r="3.4"/><circle cx="16" cy="12" r="3.4"/><circle cx="12" cy="16" r="3.4"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  wave: '<path d="M3 12h2l2-5 3 10 3-8 2 5h6"/>',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "", strokeWidth = 1.8 }: {
  name: string; size?: number; className?: string; strokeWidth?: number;
}) {
  const body = PATHS[name] || PATHS.info;
  return (
    <svg className={`svg-icon ${className}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }} />
  );
}

/* 表情贴纸的图形定义放在 lib/faces.ts（纯数据，worker 也能共用同一套 key） */
export function FaceIcon({ name, size = 20, className = "" }: {
  name: string; size?: number; className?: string;
}) {
  return (
    <svg className={`face-icon ${className}`} width={size} height={size} viewBox="0 0 32 32"
      aria-hidden="true" dangerouslySetInnerHTML={{ __html: faceMarkup(name) }} />
  );
}
