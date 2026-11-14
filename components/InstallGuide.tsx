"use client";

/** PWA 安装指引：Chrome 直接安装，iPad/iPhone 走 Safari 分享菜单；按钮永远有反应。 */
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { Clover } from "./Logo";
import { Icon } from "./Icon";
import type { Lang } from "@/lib/types";

function L(lang: Lang, cn: string, hk: string, en: string): string {
  return lang === "en" ? en : lang === "zh-HK" ? hk : cn;
}

export default function InstallGuide() {
  const lang = useApp((s) => s.lang);
  const show = useApp((s) => s.installGuide);
  const setShow = useApp((s) => s.setInstallGuide);
  const installPrompt = useApp((s) => s.installPrompt);
  const nav = typeof navigator === "undefined" ? null : navigator as Navigator & { standalone?: boolean };
  const ios = Boolean(nav && (/iPad|iPhone|iPod/.test(nav.userAgent)
    || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)));
  const standalone = typeof window !== "undefined"
    && (window.matchMedia("(display-mode: standalone)").matches || nav?.standalone === true);

  if (!show) return null;

  const steps = ios ? [
    L(lang, "点 Safari 底部的「分享」按钮", "撳 Safari 底部嘅「分享」掣", "Tap the Share button at the bottom of Safari"),
    L(lang, "向下选「加入主屏幕」", "向下揀「加入主屏幕」", "Scroll and choose Add to Home Screen"),
    L(lang, "点「加入」，桌面就会出现 Schoolink", "撳「加入」，桌面就會出現 Schoolink", "Tap Add — Schoolink appears on your Home Screen"),
  ] : [
    L(lang, "点下方「安装」按钮（Chrome / Edge）", "撳下方「安裝」掣（Chrome / Edge）", "Tap Install below (Chrome / Edge)"),
    L(lang, "或点地址栏右侧的安装图标", "或撳地址列右邊嘅安裝圖示", "Or use the install icon in the address bar"),
    L(lang, "在弹窗里确认，之后可独立窗口打开", "喺彈窗確認，之後可獨立視窗開啟", "Confirm the prompt, then it opens in its own window"),
  ];

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => setShow(false)}>
      <motion.div className="modal install-guide"
        initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2><Icon name="install" size={17} /> {L(lang, "安装 Schoolink", "安裝 Schoolink", "Install Schoolink")}</h2>
          <button className="icon-btn ghost" onClick={() => setShow(false)} aria-label="close"><Icon name="close" size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="ig-hero"><Clover size={64} animate={false} />
            <div><strong>Schoolink</strong><small>{L(lang,
              "装到主屏，像 App 一样用", "裝到主屏，似 App 咁用",
              "Add to your home screen and use it like an app")}</small></div>
          </div>

          {standalone ? (
            <div className="ig-done"><Icon name="check" size={18} /> {L(lang,
              "已经安装好了，现在就是独立 App 模式", "已經裝好，而家就係獨立 App 模式",
              "Already installed — you're in standalone app mode")}</div>
          ) : (
            <>
              <div className="ig-steps">
                {steps.map((s, i) => (
                  <motion.div key={i} className="ig-step"
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                    <span className="ig-num">{i + 1}</span><span>{s}</span>
                  </motion.div>
                ))}
              </div>
              <p className="muted-line">{L(lang,
                "若浏览器没有弹出安装提示，按上面步骤手动加入即可；这个按钮不会再点了没反应。",
                "若瀏覽器冇彈出安裝提示，跟上面步驟手動加入就得；呢個掣唔會再撳咗冇反應。",
                "If no install prompt appears, follow the steps above — this button always responds.")}</p>
              <button className="btn primary big full" onClick={() => {
                if (installPrompt) useApp.getState().doInstall();
                else setShow(false);
              }}>
                <Icon name="install" size={16} /> {installPrompt
                  ? L(lang, "立即安装", "立即安裝", "Install now")
                  : L(lang, "我知道了", "我知啦", "Got it")}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
