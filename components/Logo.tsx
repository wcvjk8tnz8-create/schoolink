"use client";

import { motion } from "motion/react";

export function Clover({ size = 120, animate = true, className = "" }: {
  size?: number; animate?: boolean; className?: string;
}) {
  return (
    <motion.svg
      className={`clover ${className}`}
      width={size} height={size} viewBox="0 0 100 100" role="img"
      aria-label="Schoolink smiling four-leaf clover"
      initial={animate ? { scale: 0.6, opacity: 0, rotate: -24 } : false}
      animate={animate ? { scale: 1, opacity: 1, rotate: 0 } : undefined}
      transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.05 }}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="clover-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b7bff" />
          <stop offset="55%" stopColor="#5b5cf0" />
          <stop offset="100%" stopColor="#36a8ff" />
        </linearGradient>
        <linearGradient id="clover-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a2f9e" />
          <stop offset="100%" stopColor="#2a2476" />
        </linearGradient>
        <filter id="clover-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#4b3fe0" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter="url(#clover-shadow)" className={animate ? "clover-float" : ""}>
        {[0, 90, 180, 270].map((deg, i) => (
          <motion.ellipse
            key={deg} cx="50" cy="30" rx="15.5" ry="20"
            fill="url(#clover-leaf)"
            transform={`rotate(${deg} 50 50)`}
            initial={animate ? { scale: 0, opacity: 0 } : false}
            animate={animate ? { scale: 1, opacity: 1 } : undefined}
            transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.12 + i * 0.07 }}
            style={{ transformOrigin: "50px 50px" }}
          />
        ))}
        <circle cx="50" cy="50" r="19" fill="url(#clover-face)" />
        {/* 左眼：眨眼 → 用 › 形状 */}
        <path className={animate ? "clover-wink" : ""} d="M40 45 L46 49 L40 53"
          fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="59" cy="48" r="2.7" fill="#fff" />
        {/* 微笑 */}
        <path d="M41 57 Q50 66 59 57" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="35.5" cy="55" r="2.4" fill="#ff9dbb" opacity=".75" />
        <circle cx="64.5" cy="55" r="2.4" fill="#ff9dbb" opacity=".75" />
      </g>
    </motion.svg>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return <Clover size={size} animate={false} />;
}
