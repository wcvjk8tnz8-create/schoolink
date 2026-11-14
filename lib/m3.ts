"use client";

/**
 * Material 3 motion + interaction tokens.
 * - M3 标准/强调 easing 与时长，供 Motion 与 CSS 共用
 * - 全局涟漪（state layer 的按压反馈），用事件委托，不改动任何既有按钮组件
 */

export const M3_MOTION = {
  /** standard: 用于大多数进出场 */
  standard: [0.2, 0, 0, 1] as [number, number, number, number],
  /** emphasized decelerate: 元素进入 */
  decelerate: [0.05, 0.7, 0.1, 1] as [number, number, number, number],
  /** emphasized accelerate: 元素离开 */
  accelerate: [0.3, 0, 0.8, 0.15] as [number, number, number, number],
  short1: 0.1,
  short2: 0.2,
  medium1: 0.25,
  medium2: 0.4,
  long1: 0.5,
  long2: 0.7,
};

/** 页面切换：M3 emphasized 曲线 */
export const m3ViewTransition = {
  duration: M3_MOTION.medium2,
  ease: M3_MOTION.decelerate,
};

const RIPPLE_SELECTOR = [
  "button", ".btn", ".btn-primary", ".btn-ghost", ".mini", ".chip",
  ".thread-row", ".pref-row", ".icon-btn", ".send-btn", ".rec-btn",
  ".ap-item", ".accent-dot", ".pref-pills button", "[data-m3-ripple]",
].join(",");

/** 挂载全局涟漪；返回清理函数。SSR / 关闭动画时自动跳过。 */
export function installM3Ripple(): () => void {
  if (typeof document === "undefined") return () => {};

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (document.documentElement.classList.contains("no-motion")) return;
    const target = e.target as Element | null;
    const el = target?.closest?.(RIPPLE_SELECTOR) as HTMLElement | null;
    if (!el || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return;
    if (el.dataset.m3NoRipple !== undefined || el.closest("[data-m3-no-ripple]")) return;
    // static 元素补定位；已定位元素只补裁剪，绝不覆盖原有 position
    if (getComputedStyle(el).position === "static") el.classList.add("m3-ripple-host");
    else el.classList.add("m3-ripple-clip");
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const size = Math.max(rect.width, rect.height) * 2.1;
    const span = document.createElement("span");
    span.className = "m3-ripple";
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
    span.style.left = `${e.clientX - rect.left - size / 2}px`;
    span.style.top = `${e.clientY - rect.top - size / 2}px`;
    el.appendChild(span);
    const kill = () => span.remove();
    span.addEventListener("animationend", kill, { once: true });
    window.setTimeout(kill, 800);
  };

  document.addEventListener("pointerdown", onDown, true);
  return () => document.removeEventListener("pointerdown", onDown, true);
}
