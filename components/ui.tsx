"use client";

import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { avatarStyle, initials, cx, mediaUrl } from "@/lib/utils";
import { LogoMark } from "./Logo";
import { Icon } from "./Icon";
import type { User } from "@/lib/types";

export const spring = { type: "spring" as const, stiffness: 320, damping: 28 };
export const softSpring = { type: "spring" as const, stiffness: 180, damping: 22 };

export function Avatar({ user, name, id, size = 40, online = false, className = "" }: {
  user?: User | null; name?: string; id?: string; size?: number; online?: boolean; className?: string;
}) {
  const cfg = useApp((s) => s.config);
  const label = user?.display_name || name || "?";
  const seed = user?.id || id || label;
  const src = user?.avatar_key ? mediaUrl(user.avatar_key, cfg.r2PublicBaseUrl) : "";
  return (
    <motion.span
      className={cx("avatar", className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36), ...avatarStyle(seed) }}
      whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
      transition={spring}
      aria-label={label}
    >
      {src ? <img src={src} alt={label} /> : initials(label)}
      {online && <i className="avatar-online" />}
    </motion.span>
  );
}

export function IconButton({ children, onClick, title, className = "", disabled }: {
  children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; title?: string;
  className?: string; disabled?: boolean;
}) {
  return (
    <motion.button
      type="button" className={cx("icon-btn", className)} title={title}
      onClick={onClick} disabled={disabled}
      whileHover={{ scale: 1.09, y: -1 }} whileTap={{ scale: 0.9 }}
      transition={spring}
    >
      {children}
    </motion.button>
  );
}

export function Toast() {
  const toast = useApp((s) => s.toast);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          className={cx("toast", toast.kind)}
          initial={{ y: 28, opacity: 0, scale: 0.92 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 12, opacity: 0, scale: 0.95 }}
          transition={softSpring}
          onClick={() => useApp.getState().dismissToast()}
        >
          <span className="toast-dot" />
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function InstallBanner() {
  const show = useApp((s) => s.showInstall);
  const t = useApp((s) => s.t);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="install-banner"
          initial={{ y: -90, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          exit={{ y: -90, opacity: 0 }} transition={softSpring}>
          <LogoMark size={38} />
          <div>
            <strong>{t("installTitle")}</strong>
            <p>{t("installDesc")}</p>
          </div>
          <button className="btn primary small" onClick={() => useApp.getState().doInstall()}>{t("install")}</button>
          <button className="icon-btn ghost" onClick={() => useApp.getState().dismissInstall()}><Icon name="close" size={16} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TypingDots() {
  return (
    <span className="typing-dots" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.i key={i}
          animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

export function Skeleton({ w = "100%", h = 14, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r }} />;
}

export function ListSkeleton() {
  return (
    <div className="list-skeleton">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div key={i} className="sk-row"
          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}>
          <Skeleton w={40} h={40} r={20} />
          <div><Skeleton w={130} h={12} /><Skeleton w={190} h={10} /></div>
        </motion.div>
      ))}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <motion.span className="spinner" style={{ width: size, height: size }}
      animate={{ rotate: 360 }} transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }} />
  );
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <motion.div className="empty-state"
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={softSpring}>
      <div className="empty-icon"><Icon name={icon} size={32} /></div>
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
    </motion.div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: readonly { key: T; label: string; icon?: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.key} className={cx(value === o.key && "on")} onClick={() => onChange(o.key)}>
          {value === o.key && (
            <motion.span layoutId="seg-active" className="seg-active" transition={spring} />
          )}
          <span>{o.icon && <Icon name={o.icon} size={13} />}{o.label}</span>
        </button>
      ))}
    </div>
  );
}
