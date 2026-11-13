"use client";

import { motion } from "motion/react";

/**
 * 原本的 Schoolink 标志：紫蓝渐变四叶草 + 白色「>」眨眼 + 上弯微笑嘴。
 * 与 public/logo.svg、public/favicon.svg 完全同一套图形（240×240 viewBox）。
 */
const LEAVES = [
  { cx: 120, cy: 78, r: 48 },
  { cx: 74, cy: 118, r: 46 },
  { cx: 166, cy: 118, r: 46 },
  { cx: 88, cy: 158, r: 44 },
  { cx: 152, cy: 158, r: 44 },
  { cx: 120, cy: 120, r: 60 },
];

export function Clover({ size = 120, animate = true, className = "" }: {
  size?: number; animate?: boolean; className?: string;
}) {
  return (
    <motion.svg
      className={`clover ${className}`}
      width={size} height={size} viewBox="0 0 240 240" role="img"
      aria-label="Schoolink smiling four-leaf clover"
      initial={animate ? { scale: 0.6, opacity: 0, rotate: -24 } : false}
      animate={animate ? { scale: 1, opacity: 1, rotate: 0 } : undefined}
      transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.05 }}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="clover-leaf" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#C4A8FF" />
          <stop offset="38%" stopColor="#8E8BF7" />
          <stop offset="72%" stopColor="#4A63EE" />
          <stop offset="100%" stopColor="#2146DC" />
        </linearGradient>
        <filter id="clover-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#4b3fe0" floodOpacity="0.42" />
        </filter>
      </defs>

      <g filter="url(#clover-shadow)" className={animate ? "clover-float" : ""}>
        {LEAVES.map((l, i) => (
          <motion.circle
            key={i} cx={l.cx} cy={l.cy} r={l.r} fill="url(#clover-leaf)"
            initial={animate ? { scale: 0, opacity: 0 } : false}
            animate={animate ? { scale: 1, opacity: 1 } : undefined}
            transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.12 + i * 0.07 }}
            style={{ transformOrigin: "120px 120px" }}
          />
        ))}
        {/* 左眼：会眨的 > */}
        <path className={animate ? "clover-wink" : ""} d="M84 100 L110 126 L84 152"
          fill="none" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        {/* 微笑的嘴 */}
        <path d="M136 140 Q152 155 168 140"
          fill="none" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </motion.svg>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return <Clover size={size} animate={false} />;
}
