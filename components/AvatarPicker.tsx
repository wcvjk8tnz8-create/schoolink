"use client";

/**
 * 头像系统：同一个 avatar_key 字段支持三种来源，没开 R2 也能完整自定义。
 *   图片    "images/2026/11/xxx.png"        → R2 / 同源回源
 *   内置    "preset:clover"                → 渐变底 + 内联 SVG 图标（零上传）
 *   纯色    "tint:210"                     → 自定义色相渐变 + 姓名首字
 *   空      null                           → 按 id 生成的默认渐变 + 首字
 */
import { useState } from "react";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { avatarStyle, initials, mediaUrl, hue } from "@/lib/utils";
import { Icon } from "./Icon";

export const PRESETS: { key: string; icon: string; h: number }[] = [
  { key: "clover", icon: "clover", h: 258 },
  { key: "star", icon: "star", h: 42 },
  { key: "bolt", icon: "bolt", h: 198 },
  { key: "smile", icon: "smile", h: 152 },
  { key: "users", icon: "users", h: 220 },
  { key: "globe", icon: "globe", h: 176 },
  { key: "beaker", icon: "beaker", h: 286 },
  { key: "image", icon: "image", h: 330 },
  { key: "mic", icon: "mic", h: 12 },
  { key: "sun", icon: "sun", h: 36 },
  { key: "moon", icon: "moon", h: 246 },
  { key: "wave", icon: "wave", h: 168 },
];

const TINTS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export function isPreset(v: string | null): boolean { return !!v && v.startsWith("preset:"); }
export function isTint(v: string | null): boolean { return !!v && v.startsWith("tint:"); }

export function parseAvatar(v: string | null):
  | { kind: "preset"; icon: string; h: number }
  | { kind: "tint"; h: number }
  | { kind: "image"; key: string }
  | null {
  if (!v) return null;
  if (v.startsWith("preset:")) {
    const p = PRESETS.find((x) => x.key === v.slice(7)) || PRESETS[0];
    return { kind: "preset", icon: p.icon, h: p.h };
  }
  if (v.startsWith("tint:")) {
    const n = Number(v.slice(5));
    return { kind: "tint", h: Number.isFinite(n) ? ((n % 360) + 360) % 360 : hue(v) };
  }
  return { kind: "image", key: v };
}

function gradient(h: number, light = false): string {
  const a = `hsl(${h} 72% ${light ? 68 : 62}%)`;
  const b = `hsl(${(h + 38) % 360} 68% ${light ? 50 : 42}%)`;
  return `linear-gradient(140deg, ${a}, ${b})`;
}

/** 只渲染头像内容，供 Avatar / 预览 / 选择器共用 */
export function AvatarVisual({ value, label, size, base = "", seed = "" }: {
  value: string | null; label: string; size: number; base?: string; seed?: string;
}) {
  const p = parseAvatar(value);
  if (p?.kind === "preset") {
    return (
      <span className="av-visual av-preset" style={{ width: size, height: size, background: gradient(p.h) }}>
        <Icon name={p.icon} size={Math.round(size * 0.52)} strokeWidth={2} />
      </span>
    );
  }
  if (p?.kind === "tint") {
    return (
      <span className="av-visual av-tint" style={{ width: size, height: size, background: gradient(p.h) }}>
        {initials(label)}
      </span>
    );
  }
  if (p?.kind === "image") {
    return <img className="av-visual av-img" src={mediaUrl(p.key, base)} alt={label} />;
  }
  return (
    <span className="av-visual av-default" style={{ width: size, height: size, ...avatarStyle(seed || label) }}>
      {initials(label)}
    </span>
  );
}

/** 头像选择器：上传图片 / 12 枚内置 SVG 徽章 / 12 档渐变色 / 恢复默认 */
export function AvatarPicker({ value, label, onChange }: {
  value: string | null; label: string; onChange: (v: string | null) => void;
}) {
  const cfg = useApp((s) => s.config);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"preset" | "tint">("preset");

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const r = await useApp.getState().upload(file);
      onChange(r.key);
      useApp.getState().toastMsg("頭像已上載 / 头像已上传 / Avatar uploaded", "ok");
    } catch (e) {
      useApp.getState().toastMsg((e as Error).message, "err");
    } finally { setBusy(false); }
  };

  return (
    <div className="avatar-picker">
      <div className="ap-current">
        <AvatarVisual value={value} label={label} size={72} base={cfg.r2PublicBaseUrl} />
        <div className="ap-meta">
          <strong>{label}</strong>
          <small>{value ? (isPreset(value) ? "內置徽章 / 内置徽章 / Built-in badge"
            : isTint(value) ? "自訂配色 / 自定义配色 / Custom colour"
              : "已上載圖片 / 已上传图片 / Uploaded image") : "預設頭像 / 默认头像 / Default"}</small>
        </div>
        {value && <button className="mini" onClick={() => onChange(null)}>重置 / Reset</button>}
      </div>

      <div className="ap-actions">
        {cfg.r2Enabled ? (
          <label className="btn small ap-upload">
            {busy ? <Icon name="refresh" size={14} className="ap-spin" /> : <Icon name="image" size={15} />}
            上載圖片 / Upload
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden
              disabled={busy} onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }} />
          </label>
        ) : (
          <span className="ap-hint"><Icon name="info" size={14} /> 未啟用 R2，可改用內置徽章與配色 / R2 off — use built-in badges &amp; colours</span>
        )}
        <div className="ap-tabs">
          <button className={tab === "preset" ? "on" : ""} onClick={() => setTab("preset")}>徽章 / Badges</button>
          <button className={tab === "tint" ? "on" : ""} onClick={() => setTab("tint")}>配色 / Colours</button>
        </div>
      </div>

      {tab === "preset" ? (
        <div className="ap-grid">
          {PRESETS.map((p) => {
            const v = `preset:${p.key}`;
            return (
              <motion.button key={p.key} className={`ap-item ${value === v ? "on" : ""}`}
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                onClick={() => onChange(v)} title={p.key}>
                <AvatarVisual value={v} label={label} size={38} />
              </motion.button>
            );
          })}
        </div>
      ) : (
        <div className="ap-grid">
          {TINTS.map((h) => {
            const v = `tint:${h}`;
            return (
              <motion.button key={h} className={`ap-item ${value === v ? "on" : ""}`}
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                onClick={() => onChange(v)} title={`H${h}`}>
                <AvatarVisual value={v} label={label} size={38} />
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
